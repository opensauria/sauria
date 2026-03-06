use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use rand::rngs::OsRng;
use rand::RngCore;
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::sync::LazyLock;
use tauri::{Emitter, Manager};
use tokio::sync::Mutex;

pub fn oauth_log(msg: &str) {
    let log_path = dirs::home_dir()
        .unwrap_or_default()
        .join(".sauria")
        .join("oauth-debug.log");
    let timestamp = chrono::Local::now().format("%H:%M:%S%.3f");
    // Redact sensitive values from log output
    let redacted = redact_sensitive(msg);
    let line = format!("[{timestamp}] {redacted}\n");
    let _ = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_path)
        .and_then(|mut f| std::io::Write::write_all(&mut f, line.as_bytes()));
}

fn redact_sensitive(msg: &str) -> String {
    let mut result = msg.to_string();
    for key in &["access_token=", "code=", "refresh_token="] {
        if let Some(start) = result.find(key) {
            let value_start = start + key.len();
            let value_end = result[value_start..]
                .find('&')
                .map(|i| value_start + i)
                .unwrap_or(result.len());
            let value = &result[value_start..value_end];
            if value.len() > 8 {
                let redacted_value = format!("{}...redacted", &value[..8]);
                result = format!("{}{}{}", &result[..value_start], redacted_value, &result[value_end..]);
            }
        }
    }
    result
}

const DEFAULT_CLIENT_ID: &str = "sauria-desktop";
const CLIENT_NAME: &str = "Sauria Desktop";
const REDIRECT_URI: &str = "sauria://oauth/callback";
const VAULT_ACCOUNTS_KEY: &str = "integration_accounts";

// ── Pending state ──────────────────────────────────────────────────────

#[derive(Clone)]
enum PendingOAuthKind {
    /// Direct MCP OAuth — Rust exchanges the code via PKCE
    Mcp {
        verifier: String,
        token_url: Option<String>,
        client_id: String,
    },
    /// Proxy OAuth — worker exchanges the code, we receive access_token directly
    Proxy,
}

#[derive(Clone)]
struct PendingOAuth {
    provider: String,
    provider_name: String,
    mcp_url: String,
    kind: PendingOAuthKind,
    created_at: std::time::Instant,
}

const PENDING_STATE_TTL: std::time::Duration = std::time::Duration::from_secs(600);

static PENDING: LazyLock<Mutex<HashMap<String, PendingOAuth>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

#[derive(Serialize)]
pub struct OAuthStartResult {
    started: bool,
    state: String,
}

// ── Start: MCP OAuth (direct) ──────────────────────────────────────────

/// Start OAuth flow for a remote MCP server.
/// 1. Discover OAuth metadata via .well-known/oauth-authorization-server
/// 2. Try dynamic client registration (RFC 7591) if supported
/// 3. Generate PKCE verifier + challenge
/// 4. Open browser to authorization URL
#[tauri::command]
pub async fn start_integration_oauth(
    integration_id: String,
    provider_name: String,
    mcp_url: String,
    auth_url: Option<String>,
    token_url: Option<String>,
    scopes: Option<String>,
) -> Result<OAuthStartResult, String> {
    let metadata = fetch_oauth_metadata(&mcp_url).await?;

    let authorize_url = match &auth_url {
        Some(url) => url.clone(),
        None => metadata["authorization_endpoint"]
            .as_str()
            .map(String::from)
            .ok_or("No authorization_endpoint in metadata")?,
    };

    let resolved_token_url = match &token_url {
        Some(url) => Some(url.clone()),
        None => metadata["token_endpoint"].as_str().map(String::from),
    };

    let client_id = if let Some(reg_endpoint) = metadata["registration_endpoint"].as_str() {
        try_dynamic_registration(reg_endpoint)
            .await
            .unwrap_or_else(|_| DEFAULT_CLIENT_ID.to_string())
    } else {
        DEFAULT_CLIENT_ID.to_string()
    };

    let (verifier, challenge) = generate_pkce();
    let state = generate_state();

    PENDING.lock().await.insert(
        state.clone(),
        PendingOAuth {
            provider: integration_id,
            provider_name,
            mcp_url,
            created_at: std::time::Instant::now(),
            kind: PendingOAuthKind::Mcp {
                verifier,
                token_url: resolved_token_url,
                client_id: client_id.clone(),
            },
        },
    );

    let url = format!(
        "{}?response_type=code&client_id={}&redirect_uri={}&state={}&code_challenge={}&code_challenge_method=S256{}",
        authorize_url,
        urlencoding::encode(&client_id),
        urlencoding::encode(REDIRECT_URI),
        state,
        challenge,
        scopes
            .map(|s| format!("&scope={}", urlencoding::encode(&s)))
            .unwrap_or_default(),
    );

    open::that(&url).map_err(|e| e.to_string())?;

    Ok(OAuthStartResult {
        started: true,
        state,
    })
}

// ── Start: Proxy OAuth ─────────────────────────────────────────────────

/// Start OAuth flow via the auth proxy worker.
/// The worker holds client secrets, exchanges the code, and redirects back
/// with access_token directly — Rust only needs to track state.
#[tauri::command]
pub async fn start_proxy_oauth(
    integration_id: String,
    provider_name: String,
    proxy_url: String,
    provider_key: String,
) -> Result<OAuthStartResult, String> {
    let state = generate_state();

    PENDING.lock().await.insert(
        state.clone(),
        PendingOAuth {
            provider: integration_id,
            provider_name,
            mcp_url: proxy_url.clone(),
            created_at: std::time::Instant::now(),
            kind: PendingOAuthKind::Proxy,
        },
    );

    let url = format!(
        "{}/connect/{}?state={}",
        proxy_url, provider_key, state,
    );

    open::that(&url).map_err(|e| e.to_string())?;

    Ok(OAuthStartResult {
        started: true,
        state,
    })
}

// ── Complete: manual code exchange (called from frontend) ──────────────

#[tauri::command]
pub async fn complete_integration_oauth(
    code: String,
    state: String,
    paths: tauri::State<'_, crate::paths::Paths>,
    client: tauri::State<'_, std::sync::Arc<crate::daemon_client::DaemonClient>>,
) -> Result<serde_json::Value, String> {
    let pending = pop_pending(&state).await?;
    let (verifier, token_url, client_id) = match &pending.kind {
        PendingOAuthKind::Mcp { verifier, token_url, client_id } => {
            (verifier.clone(), token_url.clone(), client_id.clone())
        }
        PendingOAuthKind::Proxy => {
            return Err("complete_integration_oauth called for proxy flow".into());
        }
    };
    let resolved_token_url = resolve_token_url(&token_url, &pending.mcp_url).await?;
    let tokens = exchange_code(&code, &verifier, &resolved_token_url, &client_id).await?;
    let account_label = fetch_account_label(&tokens.access_token, &pending.mcp_url).await;
    save_account_label(
        &paths,
        &pending.provider,
        &account_label.clone().unwrap_or_else(|| pending.provider_name.clone()),
    );
    store_and_connect(&pending.provider, &tokens, &account_label, &paths, &client).await
}

// ── Deep link callback handler ─────────────────────────────────────────

pub async fn handle_deep_link_callback(
    handle: &tauri::AppHandle,
    url_str: &str,
) -> Result<(), String> {
    oauth_log(&format!("Callback URL: {}", url_str));
    let parsed = url::Url::parse(url_str).map_err(|e| e.to_string())?;
    let params: HashMap<String, String> = parsed.query_pairs().into_owned().collect();
    oauth_log(&format!("Params: {:?}", params.keys().collect::<Vec<_>>()));

    let mut state = params.get("state").cloned().unwrap_or_default();

    if state.is_empty() {
        let pending_count = PENDING.lock().await.len();
        oauth_log(&format!("Empty state. Pending: {}", pending_count));
        if pending_count == 1 {
            state = PENDING.lock().await.keys().next().unwrap().clone();
        } else {
            return Err("No OAuth state in callback".into());
        }
    }

    oauth_log(&format!("State: {}..., pending keys: {:?}",
        &state[..8.min(state.len())],
        PENDING.lock().await.keys().collect::<Vec<_>>()));

    let pending = pop_pending(&state).await?;
    oauth_log(&format!("Provider: {}, kind: {}", pending.provider,
        match &pending.kind { PendingOAuthKind::Mcp { .. } => "mcp", PendingOAuthKind::Proxy => "proxy" }));

    let paths = handle.state::<crate::paths::Paths>();
    let client = handle.state::<std::sync::Arc<crate::daemon_client::DaemonClient>>();

    let result = match &pending.kind {
        PendingOAuthKind::Proxy => {
            let access_token = params.get("access_token").cloned().unwrap_or_default();
            if access_token.is_empty() {
                oauth_log("ERROR: Missing access_token in proxy callback");
                return Err("Missing access_token in proxy callback".into());
            }
            let tokens = TokenSet {
                access_token: access_token.clone(),
                refresh_token: params.get("refresh_token").cloned().unwrap_or_default(),
                expires_in: params
                    .get("expires_in")
                    .and_then(|v| v.parse().ok())
                    .unwrap_or(3600),
            };
            let account_label = fetch_account_label(&access_token, &pending.mcp_url).await;
            save_account_label(
                &paths,
                &pending.provider,
                &account_label.clone().unwrap_or_else(|| pending.provider_name.clone()),
            );
            store_and_connect(&pending.provider, &tokens, &account_label, &paths, &client).await?
        }
        PendingOAuthKind::Mcp { verifier, token_url, client_id } => {
            let code = params.get("code").cloned().unwrap_or_default();
            if code.is_empty() {
                oauth_log("ERROR: Missing code in MCP callback");
                return Err("Missing code in MCP OAuth callback".into());
            }
            oauth_log(&format!("MCP code exchange: token_url={:?}, client_id={}", token_url, client_id));
            let resolved_token_url = match resolve_token_url(token_url, &pending.mcp_url).await {
                Ok(url) => { oauth_log(&format!("Resolved token URL: {}", url)); url }
                Err(e) => { oauth_log(&format!("ERROR resolving token URL: {}", e)); return Err(e); }
            };
            let tokens = match exchange_code(&code, verifier, &resolved_token_url, client_id).await {
                Ok(t) => { oauth_log("Token exchange OK"); t }
                Err(e) => { oauth_log(&format!("ERROR token exchange: {}", e)); return Err(e); }
            };
            let account_label = fetch_account_label(&tokens.access_token, &pending.mcp_url).await;
            save_account_label(
                &paths,
                &pending.provider,
                &account_label.clone().unwrap_or_else(|| pending.provider_name.clone()),
            );
            store_and_connect(&pending.provider, &tokens, &account_label, &paths, &client).await?
        }
    };

    let _ = handle.emit("integration-oauth-complete", result);
    Ok(())
}

// ── Shared helpers ─────────────────────────────────────────────────────

struct TokenSet {
    access_token: String,
    refresh_token: String,
    expires_in: u64,
}

fn generate_pkce() -> (String, String) {
    let mut verifier_bytes = [0u8; 48];
    OsRng.fill_bytes(&mut verifier_bytes);
    let verifier = URL_SAFE_NO_PAD.encode(verifier_bytes);

    let mut hasher = Sha256::new();
    hasher.update(verifier.as_bytes());
    let challenge = URL_SAFE_NO_PAD.encode(hasher.finalize());

    (verifier, challenge)
}

fn generate_state() -> String {
    let mut state_bytes = [0u8; 16];
    OsRng.fill_bytes(&mut state_bytes);
    hex::encode(state_bytes)
}

async fn pop_pending(state: &str) -> Result<PendingOAuth, String> {
    let mut map = PENDING.lock().await;
    // Purge expired entries
    map.retain(|_, v| v.created_at.elapsed() < PENDING_STATE_TTL);
    let entry = map.remove(state).ok_or("No pending OAuth for this state")?;
    if entry.created_at.elapsed() >= PENDING_STATE_TTL {
        return Err("OAuth state expired".into());
    }
    Ok(entry)
}

async fn resolve_token_url(token_url: &Option<String>, mcp_url: &str) -> Result<String, String> {
    match token_url {
        Some(url) => Ok(url.clone()),
        None => {
            let metadata = fetch_oauth_metadata(mcp_url).await?;
            metadata["token_endpoint"]
                .as_str()
                .map(String::from)
                .ok_or_else(|| "No token_endpoint in metadata".into())
        }
    }
}

async fn exchange_code(
    code: &str,
    verifier: &str,
    token_url: &str,
    client_id: &str,
) -> Result<TokenSet, String> {
    let http = reqwest::Client::new();
    let resp = http
        .post(token_url)
        .form(&[
            ("grant_type", "authorization_code"),
            ("code", code),
            ("redirect_uri", REDIRECT_URI),
            ("client_id", client_id),
            ("code_verifier", verifier),
        ])
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("Token exchange failed ({}): {}", status, body));
    }

    let body: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;

    Ok(TokenSet {
        access_token: body["access_token"]
            .as_str()
            .ok_or("No access_token in response")?
            .to_string(),
        refresh_token: body
            .get("refresh_token")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string(),
        expires_in: body
            .get("expires_in")
            .and_then(|v| v.as_u64())
            .unwrap_or(3600),
    })
}

async fn store_and_connect(
    provider: &str,
    tokens: &TokenSet,
    account_label: &Option<String>,
    paths: &crate::paths::Paths,
    client: &std::sync::Arc<crate::daemon_client::DaemonClient>,
) -> Result<serde_json::Value, String> {
    let expires_at =
        chrono::Utc::now().timestamp_millis() + (tokens.expires_in as i64 * 1000);

    let credential = serde_json::json!({
        "kind": "oauth",
        "accessToken": tokens.access_token,
        "refreshToken": tokens.refresh_token,
        "expiresAt": expires_at,
    });

    let vault_key = format!("integration_oauth_{}", provider);
    crate::vault::vault_store(paths, &vault_key, &credential.to_string())?;

    let mut result = client
        .request(
            "integrations:connect-instance",
            serde_json::json!({
                "instanceId": format!("{}:default", provider),
                "integrationId": provider,
                "label": "default",
                "credentials": { "accessToken": tokens.access_token },
            }),
        )
        .await
        .map_err(|e| e.to_string())?;

    if let Some(label) = account_label {
        if let Some(obj) = result.as_object_mut() {
            obj.insert(
                "accountLabel".to_string(),
                serde_json::Value::String(label.clone()),
            );
        }
    }

    Ok(result)
}

// ── OAuth metadata discovery & dynamic registration ────────────────────

async fn fetch_oauth_metadata(mcp_url: &str) -> Result<serde_json::Value, String> {
    let base = mcp_url
        .trim_end_matches("/mcp")
        .trim_end_matches("/sse")
        .trim_end_matches('/');
    let metadata_url = format!("{}/.well-known/oauth-authorization-server", base);

    let http = reqwest::Client::new();
    let resp = http
        .get(&metadata_url)
        .send()
        .await
        .map_err(|e: reqwest::Error| e.to_string())?;

    if !resp.status().is_success() {
        return Err(format!(
            "OAuth metadata fetch failed ({}): {}",
            resp.status(),
            metadata_url
        ));
    }

    resp.json::<serde_json::Value>()
        .await
        .map_err(|e: reqwest::Error| e.to_string())
}

async fn try_dynamic_registration(registration_endpoint: &str) -> Result<String, String> {
    let http = reqwest::Client::new();
    let resp = http
        .post(registration_endpoint)
        .json(&serde_json::json!({
            "client_name": CLIENT_NAME,
            "redirect_uris": [REDIRECT_URI],
            "grant_types": ["authorization_code", "refresh_token"],
            "response_types": ["code"],
            "token_endpoint_auth_method": "none",
        }))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !resp.status().is_success() {
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("Dynamic registration failed: {}", body));
    }

    let body: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    body["client_id"]
        .as_str()
        .map(String::from)
        .ok_or_else(|| "No client_id in registration response".into())
}

// ── Account labels (encrypted in vault) ────────────────────────────────

#[tauri::command]
pub async fn get_integration_accounts(
    paths: tauri::State<'_, crate::paths::Paths>,
) -> Result<serde_json::Value, String> {
    Ok(load_account_labels(&paths))
}

async fn fetch_account_label(access_token: &str, mcp_url: &str) -> Option<String> {
    let http = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .build()
        .ok()?;

    let metadata = fetch_oauth_metadata(mcp_url).await.ok();
    let userinfo_url = metadata
        .as_ref()
        .and_then(|m| m["userinfo_endpoint"].as_str().map(String::from));

    let url = userinfo_url.unwrap_or_else(|| {
        let base = mcp_url
            .trim_end_matches("/mcp")
            .trim_end_matches("/sse")
            .trim_end_matches('/');
        format!("{}/userinfo", base)
    });

    let resp = http.get(&url).bearer_auth(access_token).send().await.ok()?;

    if !resp.status().is_success() {
        return None;
    }

    let body: serde_json::Value = resp.json().await.ok()?;

    body["email"]
        .as_str()
        .or_else(|| body["preferred_username"].as_str())
        .or_else(|| body["name"].as_str())
        .or_else(|| body["login"].as_str())
        .or_else(|| body["username"].as_str())
        .map(String::from)
}

fn load_account_labels(paths: &crate::paths::Paths) -> serde_json::Value {
    crate::vault::vault_read(paths, VAULT_ACCOUNTS_KEY)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_else(|| serde_json::json!({}))
}

fn save_account_label(paths: &crate::paths::Paths, provider: &str, label: &str) {
    let mut labels = load_account_labels(paths);
    if let Some(obj) = labels.as_object_mut() {
        obj.insert(
            provider.to_string(),
            serde_json::Value::String(label.to_string()),
        );
    }
    let _ = crate::vault::vault_store(
        paths,
        VAULT_ACCOUNTS_KEY,
        &serde_json::to_string(&labels).unwrap_or_default(),
    );
}

pub fn remove_account_label_public(paths: &crate::paths::Paths, provider: &str) {
    let mut labels = load_account_labels(paths);
    if let Some(obj) = labels.as_object_mut() {
        obj.remove(provider);
    }
    let _ = crate::vault::vault_store(
        paths,
        VAULT_ACCOUNTS_KEY,
        &serde_json::to_string(&labels).unwrap_or_default(),
    );
}

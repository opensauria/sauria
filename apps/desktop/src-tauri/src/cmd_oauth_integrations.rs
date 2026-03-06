use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use rand::rngs::OsRng;
use rand::RngCore;
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::sync::LazyLock;
use tauri::{Emitter, Manager};
use tokio::sync::Mutex;

const DEFAULT_CLIENT_ID: &str = "sauria-desktop";
const CLIENT_NAME: &str = "Sauria Desktop";
const REDIRECT_URI: &str = "sauria://oauth/callback";

#[derive(Clone)]
struct PendingOAuth {
    provider: String,
    verifier: String,
    mcp_url: String,
    token_url: Option<String>,
    client_id: String,
}

static PENDING: LazyLock<Mutex<HashMap<String, PendingOAuth>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

#[derive(Serialize)]
pub struct OAuthStartResult {
    started: bool,
    state: String,
}

/// Start OAuth flow for an integration.
/// 1. Discover OAuth metadata from remote MCP server
/// 2. Try dynamic client registration (RFC 7591) if supported
/// 3. Generate PKCE verifier + challenge
/// 4. Open browser to authorization URL
#[tauri::command]
pub async fn start_integration_oauth(
    integration_id: String,
    mcp_url: String,
    auth_url: Option<String>,
    token_url: Option<String>,
    scopes: Option<String>,
) -> Result<OAuthStartResult, String> {
    // Discover OAuth metadata (needed for auth_url, token_url, and registration)
    let metadata = if auth_url.is_none() || token_url.is_none() {
        Some(fetch_oauth_metadata(&mcp_url).await?)
    } else {
        None
    };

    let authorize_url = match &auth_url {
        Some(url) => url.clone(),
        None => metadata.as_ref().unwrap()["authorization_endpoint"]
            .as_str()
            .map(String::from)
            .ok_or("No authorization_endpoint in metadata")?,
    };

    let resolved_token_url = match &token_url {
        Some(url) => Some(url.clone()),
        None => metadata.as_ref().and_then(|m| m["token_endpoint"].as_str().map(String::from)),
    };

    // Dynamic client registration (RFC 7591) if server advertises it
    let client_id = if let Some(reg_endpoint) = metadata.as_ref().and_then(|m| m["registration_endpoint"].as_str()) {
        try_dynamic_registration(reg_endpoint).await.unwrap_or_else(|_| DEFAULT_CLIENT_ID.to_string())
    } else {
        DEFAULT_CLIENT_ID.to_string()
    };

    // PKCE
    let mut verifier_bytes = [0u8; 48];
    OsRng.fill_bytes(&mut verifier_bytes);
    let verifier = URL_SAFE_NO_PAD.encode(verifier_bytes);

    let mut hasher = Sha256::new();
    hasher.update(verifier.as_bytes());
    let challenge = URL_SAFE_NO_PAD.encode(hasher.finalize());

    let mut state_bytes = [0u8; 16];
    OsRng.fill_bytes(&mut state_bytes);
    let state = hex::encode(state_bytes);

    PENDING.lock().await.insert(
        state.clone(),
        PendingOAuth {
            provider: integration_id,
            verifier: verifier.clone(),
            mcp_url: mcp_url.clone(),
            token_url: resolved_token_url,
            client_id: client_id.clone(),
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

/// Complete OAuth flow — exchange code for tokens.
#[tauri::command]
pub async fn complete_integration_oauth(
    code: String,
    state: String,
    paths: tauri::State<'_, crate::paths::Paths>,
    client: tauri::State<'_, std::sync::Arc<crate::daemon_client::DaemonClient>>,
) -> Result<serde_json::Value, String> {
    let pending = pop_pending(&state).await?;
    let token_url = resolve_token_url(&pending).await?;
    let tokens = exchange_code(&code, &pending.verifier, &token_url, &pending.client_id).await?;
    store_and_connect(&pending.provider, &tokens, &paths, &client).await
}

/// Handle deep link callback from browser.
pub async fn handle_deep_link_callback(
    handle: &tauri::AppHandle,
    url_str: &str,
) -> Result<(), String> {
    let parsed = url::Url::parse(url_str).map_err(|e| e.to_string())?;
    let params: HashMap<String, String> = parsed.query_pairs().into_owned().collect();

    let code = params.get("code").cloned().unwrap_or_default();
    let state = params.get("state").cloned().unwrap_or_default();

    let result = if code.is_empty() {
        // Worker proxy callback — tokens already exchanged
        let access_token = params.get("access_token").cloned().unwrap_or_default();
        if access_token.is_empty() {
            return Err("Missing code or access_token in callback".into());
        }
        let pending = pop_pending(&state).await?;
        let tokens = TokenSet {
            access_token,
            refresh_token: params.get("refresh_token").cloned().unwrap_or_default(),
            expires_in: params
                .get("expires_in")
                .and_then(|v| v.parse().ok())
                .unwrap_or(3600),
        };
        let paths = handle.state::<crate::paths::Paths>();
        let client = handle.state::<std::sync::Arc<crate::daemon_client::DaemonClient>>();
        store_and_connect(&pending.provider, &tokens, &paths, &client).await?
    } else {
        // Standard OAuth code exchange
        let pending = pop_pending(&state).await?;
        let token_url = resolve_token_url(&pending).await?;
        let tokens = exchange_code(&code, &pending.verifier, &token_url, &pending.client_id).await?;
        let paths = handle.state::<crate::paths::Paths>();
        let client = handle.state::<std::sync::Arc<crate::daemon_client::DaemonClient>>();
        store_and_connect(&pending.provider, &tokens, &paths, &client).await?
    };

    let _ = handle.emit("integration-oauth-complete", result);
    Ok(())
}

// ── Shared helpers ──────────────────────────────────────────────────────

struct TokenSet {
    access_token: String,
    refresh_token: String,
    expires_in: u64,
}

async fn pop_pending(state: &str) -> Result<PendingOAuth, String> {
    PENDING
        .lock()
        .await
        .remove(state)
        .ok_or_else(|| "No pending OAuth for this state".into())
}

async fn resolve_token_url(pending: &PendingOAuth) -> Result<String, String> {
    match &pending.token_url {
        Some(url) => Ok(url.clone()),
        None => {
            let metadata = fetch_oauth_metadata(&pending.mcp_url).await?;
            metadata["token_endpoint"]
                .as_str()
                .map(String::from)
                .ok_or_else(|| "No token_endpoint in metadata".into())
        }
    }
}

async fn exchange_code(code: &str, verifier: &str, token_url: &str, client_id: &str) -> Result<TokenSet, String> {
    let http = reqwest::Client::new();
    let resp = http
        .post(token_url)
        .json(&serde_json::json!({
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": REDIRECT_URI,
            "client_id": client_id,
            "code_verifier": verifier,
        }))
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

    client
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
        .map_err(|e| e.to_string())
}

// ── OAuth metadata discovery & dynamic registration ─────────────────────

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

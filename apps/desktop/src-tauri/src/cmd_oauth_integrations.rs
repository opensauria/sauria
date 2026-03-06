use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use rand::rngs::OsRng;
use rand::RngCore;
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::sync::LazyLock;
use tauri::{Emitter, Manager};
use tokio::sync::Mutex;

#[derive(Clone)]
struct PendingOAuth {
    provider: String,
    verifier: String,
    mcp_url: String,
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
/// 2. Generate PKCE verifier + challenge
/// 3. Open browser to authorization URL
#[tauri::command]
pub async fn start_integration_oauth(
    integration_id: String,
    mcp_url: String,
    auth_url: Option<String>,
    token_url: Option<String>,
    scopes: Option<String>,
) -> Result<OAuthStartResult, String> {
    // Generate PKCE verifier
    let mut verifier_bytes = [0u8; 48];
    OsRng.fill_bytes(&mut verifier_bytes);
    let verifier = URL_SAFE_NO_PAD.encode(verifier_bytes);

    // Generate challenge
    let mut hasher = Sha256::new();
    hasher.update(verifier.as_bytes());
    let challenge = URL_SAFE_NO_PAD.encode(hasher.finalize());

    // Generate state
    let mut state_bytes = [0u8; 16];
    OsRng.fill_bytes(&mut state_bytes);
    let state = hex::encode(state_bytes);

    // Store pending
    PENDING.lock().await.insert(
        state.clone(),
        PendingOAuth {
            provider: integration_id,
            verifier: verifier.clone(),
            mcp_url: mcp_url.clone(),
        },
    );

    // Resolve authorization URL
    let authorize_url = if let Some(url) = auth_url {
        url
    } else {
        discover_auth_url(&mcp_url).await?
    };

    // Store token_url override in pending if provided
    if let Some(tu) = &token_url {
        let mut map = PENDING.lock().await;
        if let Some(pending) = map.get_mut(&state) {
            // Re-insert with token URL encoded in mcp_url field as fallback
            let mut updated = pending.clone();
            updated.mcp_url = format!("{}|token_url={}", pending.mcp_url, tu);
            map.insert(state.clone(), updated);
        }
    }

    // Build authorization URL
    let redirect_uri = "sauria://oauth/callback";
    let url = format!(
        "{}?response_type=code&client_id={}&redirect_uri={}&state={}&code_challenge={}&code_challenge_method=S256{}",
        authorize_url,
        "sauria-desktop",
        urlencoding::encode(redirect_uri),
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
    exchange_and_connect(code, state, &paths, &client).await
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

    if code.is_empty() || state.is_empty() {
        // May be a Worker proxy callback with tokens directly
        let access_token = params.get("access_token").cloned().unwrap_or_default();
        if !access_token.is_empty() {
            return handle_worker_callback(handle, &state, &access_token, &params).await;
        }
        return Err("Missing code or state in callback".into());
    }

    let paths = handle.state::<crate::paths::Paths>();
    let client = handle.state::<std::sync::Arc<crate::daemon_client::DaemonClient>>();

    let result = exchange_and_connect(code, state, &paths, &client).await?;

    // Emit event to frontend
    let _ = handle.emit("integration-oauth-complete", result);

    Ok(())
}

/// Handle Worker proxy callback (tokens already exchanged by Worker).
async fn handle_worker_callback(
    handle: &tauri::AppHandle,
    state: &str,
    access_token: &str,
    params: &HashMap<String, String>,
) -> Result<(), String> {
    let pending = {
        let mut map = PENDING.lock().await;
        map.remove(state).ok_or("No pending OAuth for this state")?
    };

    let refresh_token = params.get("refresh_token").cloned().unwrap_or_default();
    let expires_in: u64 = params
        .get("expires_in")
        .and_then(|v| v.parse().ok())
        .unwrap_or(3600);

    let paths = handle.state::<crate::paths::Paths>();
    let client = handle.state::<std::sync::Arc<crate::daemon_client::DaemonClient>>();

    // Store in vault
    let expires_at = chrono::Utc::now().timestamp_millis() + (expires_in as i64 * 1000);
    let credential = serde_json::json!({
        "kind": "oauth",
        "accessToken": access_token,
        "refreshToken": refresh_token,
        "expiresAt": expires_at,
    });
    let vault_key = format!("integration_oauth_{}", pending.provider);
    crate::vault::vault_store(&paths, &vault_key, &credential.to_string())?;

    // Tell daemon to connect
    let connect_result = client
        .request(
            "integrations:connect-instance",
            serde_json::json!({
                "instanceId": format!("{}:default", pending.provider),
                "integrationId": pending.provider,
                "label": "default",
                "credentials": { "accessToken": access_token },
            }),
        )
        .await?;

    let _ = handle.emit("integration-oauth-complete", &connect_result);

    Ok(())
}

/// Exchange authorization code for tokens and connect integration.
async fn exchange_and_connect(
    code: String,
    state: String,
    paths: &crate::paths::Paths,
    client: &std::sync::Arc<crate::daemon_client::DaemonClient>,
) -> Result<serde_json::Value, String> {
    let pending = {
        let mut map = PENDING.lock().await;
        map.remove(&state).ok_or("No pending OAuth for this state")?
    };

    // Extract base mcp_url and optional token_url override
    let (base_mcp_url, token_url_override) = if pending.mcp_url.contains("|token_url=") {
        let parts: Vec<&str> = pending.mcp_url.splitn(2, "|token_url=").collect();
        (parts[0].to_string(), Some(parts[1].to_string()))
    } else {
        (pending.mcp_url.clone(), None)
    };

    // Discover token endpoint
    let token_url = if let Some(url) = token_url_override {
        url
    } else {
        discover_token_url(&base_mcp_url).await?
    };

    // Exchange code for tokens
    let http = reqwest::Client::new();
    let resp = http
        .post(&token_url)
        .json(&serde_json::json!({
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": "sauria://oauth/callback",
            "client_id": "sauria-desktop",
            "code_verifier": pending.verifier,
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

    let access_token = body["access_token"]
        .as_str()
        .ok_or("No access_token in response")?;
    let refresh_token = body
        .get("refresh_token")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let expires_in = body
        .get("expires_in")
        .and_then(|v| v.as_u64())
        .unwrap_or(3600);

    // Store in vault
    let expires_at = chrono::Utc::now().timestamp_millis() + (expires_in as i64 * 1000);
    let credential = serde_json::json!({
        "kind": "oauth",
        "accessToken": access_token,
        "refreshToken": refresh_token,
        "expiresAt": expires_at,
    });
    let vault_key = format!("integration_oauth_{}", pending.provider);
    crate::vault::vault_store(paths, &vault_key, &credential.to_string())?;

    // Tell daemon to connect the integration with the token
    let connect_result = client
        .request(
            "integrations:connect-instance",
            serde_json::json!({
                "instanceId": format!("{}:default", pending.provider),
                "integrationId": pending.provider,
                "label": "default",
                "credentials": { "accessToken": access_token },
            }),
        )
        .await
        .map_err(|e| e.to_string())?;

    Ok(connect_result)
}

/// Discover OAuth authorization URL from MCP server metadata.
async fn discover_auth_url(mcp_url: &str) -> Result<String, String> {
    let metadata = fetch_oauth_metadata(mcp_url).await?;
    metadata["authorization_endpoint"]
        .as_str()
        .map(String::from)
        .ok_or_else(|| "No authorization_endpoint in metadata".into())
}

/// Discover OAuth token URL from MCP server metadata.
async fn discover_token_url(mcp_url: &str) -> Result<String, String> {
    let metadata = fetch_oauth_metadata(mcp_url).await?;
    metadata["token_endpoint"]
        .as_str()
        .map(String::from)
        .ok_or_else(|| "No token_endpoint in metadata".into())
}

/// Fetch OAuth metadata from .well-known endpoint.
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

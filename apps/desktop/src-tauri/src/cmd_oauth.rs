use rand::RngCore;
use serde::Serialize;
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::fs;
use std::sync::Arc;
use tokio::sync::Mutex as TokioMutex;

use crate::daemon_manager::{self, DaemonState};
use crate::paths::Paths;
use crate::vault;

const AUTHORIZE_URL: &str = "https://claude.ai/oauth/authorize";
const TOKEN_URL: &str = "https://platform.claude.com/v1/oauth/token";
const CLIENT_ID: &str = "9d1c250a-e61b-44d9-88ed-5944d1962f5e";
const SCOPES: &str = "user:inference user:profile";
const REDIRECT_URI: &str = "https://platform.claude.com/oauth/code/callback";

struct OAuthPending {
    verifier: Option<String>,
    state: Option<String>,
}

static PENDING: std::sync::OnceLock<TokioMutex<OAuthPending>> = std::sync::OnceLock::new();

fn get_pending() -> &'static TokioMutex<OAuthPending> {
    PENDING.get_or_init(|| {
        TokioMutex::new(OAuthPending {
            verifier: None,
            state: None,
        })
    })
}

#[derive(Serialize)]
pub struct OAuthStartResult {
    started: bool,
}

#[tauri::command]
pub async fn start_oauth() -> Result<OAuthStartResult, String> {
    let mut verifier_bytes = [0u8; 48];
    rand::rngs::OsRng.fill_bytes(&mut verifier_bytes);
    let verifier = base64_url_encode(&verifier_bytes);

    let challenge = {
        let hash = Sha256::digest(verifier.as_bytes());
        base64_url_encode(&hash)
    };

    let mut state_bytes = [0u8; 16];
    rand::rngs::OsRng.fill_bytes(&mut state_bytes);
    let state = hex::encode(state_bytes);

    {
        let mut pending = get_pending().lock().await;
        pending.verifier = Some(verifier);
        pending.state = Some(state.clone());
    }

    let params = [
        ("response_type", "code"),
        ("client_id", CLIENT_ID),
        ("redirect_uri", REDIRECT_URI),
        ("scope", SCOPES),
        ("code_challenge", &challenge),
        ("code_challenge_method", "S256"),
        ("state", &state),
    ];

    let query = params
        .iter()
        .map(|(k, v)| format!("{k}={}", urlencoding::encode(v)))
        .collect::<Vec<_>>()
        .join("&");

    let url = format!("{AUTHORIZE_URL}?{query}");
    open::that(&url).map_err(|e| e.to_string())?;

    Ok(OAuthStartResult { started: true })
}

#[derive(Serialize)]
pub struct OAuthCompleteResult {
    success: bool,
    error: Option<String>,
}

#[tauri::command]
pub async fn complete_oauth(
    code: String,
    paths: tauri::State<'_, Paths>,
    daemon_state: tauri::State<'_, Arc<tokio::sync::Mutex<DaemonState>>>,
) -> Result<OAuthCompleteResult, String> {
    let (verifier, pending_state) = {
        let mut pending = get_pending().lock().await;
        let v = pending.verifier.take();
        let s = pending.state.take();
        (v, s)
    };

    let verifier = match verifier {
        Some(v) => v,
        None => {
            return Ok(OAuthCompleteResult {
                success: false,
                error: Some("No pending OAuth flow. Click \"Sign in\" first.".to_string()),
            });
        }
    };

    // Code from Anthropic is "code#state" — split on #
    let parts: Vec<&str> = code.split('#').collect();
    let actual_code = parts.first().unwrap_or(&"");
    let code_state = parts.get(1).map(|s| s.to_string()).or(pending_state);

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| e.to_string())?;

    let body = serde_json::json!({
        "grant_type": "authorization_code",
        "client_id": CLIENT_ID,
        "code": actual_code,
        "state": code_state,
        "redirect_uri": REDIRECT_URI,
        "code_verifier": verifier,
    });

    let res = client
        .post(TOKEN_URL)
        .header("content-type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        let status = res.status().as_u16();
        let text = res.text().await.unwrap_or_default();
        return Ok(OAuthCompleteResult {
            success: false,
            error: Some(format!("Token exchange failed ({status}): {}", &text[..text.len().min(200)])),
        });
    }

    let tokens: Value = res.json().await.map_err(|e| e.to_string())?;

    let credential = serde_json::json!({
        "kind": "oauth",
        "accessToken": tokens.get("access_token").and_then(|v| v.as_str()).unwrap_or(""),
        "refreshToken": tokens.get("refresh_token").and_then(|v| v.as_str()).unwrap_or(""),
        "expiresAt": chrono_now_ms() + tokens.get("expires_in").and_then(|v| v.as_u64()).unwrap_or(3600) * 1000,
    });

    vault::vault_store(&paths, "anthropic-oauth", &credential.to_string())?;

    // Update config
    let mut config: Value = if paths.config.exists() {
        fs::read_to_string(&paths.config)
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or(Value::Object(Default::default()))
    } else {
        Value::Object(Default::default())
    };

    if let Some(obj) = config.as_object_mut() {
        obj.insert(
            "auth".to_string(),
            serde_json::json!({"anthropic": {"method": "oauth"}}),
        );
    }
    let _ = fs::write(
        &paths.config,
        serde_json::to_string_pretty(&config).unwrap_or_default(),
    );

    daemon_manager::restart_daemon(&daemon_state, &paths).await;

    Ok(OAuthCompleteResult {
        success: true,
        error: None,
    })
}

fn base64_url_encode(data: &[u8]) -> String {
    use base64::Engine;
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(data)
}

fn chrono_now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

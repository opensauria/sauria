use serde_json::Value;
use std::sync::Arc;
use tokio::sync::Mutex;

use crate::cmd_channels::{
    build_http_client, build_success_response, extract_required_creds, finalize_connection,
    ConnectionResult, ValidateFn,
};
use crate::daemon_manager::DaemonState;
use crate::paths::Paths;

pub(crate) use crate::cmd_channels_validators::{validate_google_chat, validate_matrix, validate_twilio};

pub(crate) async fn connect_generic_api(
    creds: &Value,
    paths: &Paths,
    daemon_state: &Arc<Mutex<DaemonState>>,
    validate: ValidateFn,
) -> Result<Value, String> {
    let client = build_http_client()?;

    match validate(creds, &client).await {
        Ok(result) => {
            finalize_connection(&result, creds, paths, daemon_state).await?;
            Ok(build_success_response(&result))
        }
        Err(error_response) => Ok(error_response),
    }
}

// ─── Teams ───────────────────────────────────────────────────────────

pub(crate) fn validate_teams<'a>(
    creds: &'a Value,
    client: &'a reqwest::Client,
) -> std::pin::Pin<Box<dyn std::future::Future<Output = Result<ConnectionResult, Value>> + Send + 'a>>
{
    Box::pin(async move {
        let vals = extract_required_creds(creds, &["appId", "appSecret"], "App ID and App Secret required")?;
        let (app_id, app_secret) = (vals[0].as_str(), vals[1].as_str());
        let tenant_id = creds.get("tenantId").and_then(|v| v.as_str()).unwrap_or("common");

        let token_url = format!("https://login.microsoftonline.com/{tenant_id}/oauth2/v2.0/token");
        let body: Value = client
            .post(&token_url)
            .form(&[
                ("grant_type", "client_credentials"),
                ("client_id", app_id),
                ("client_secret", app_secret),
                ("scope", "https://api.botframework.com/.default"),
            ])
            .send()
            .await
            .map_err(|e| serde_json::json!({"success": false, "error": e.to_string()}))?
            .json()
            .await
            .map_err(|e| serde_json::json!({"success": false, "error": e.to_string()}))?;

        if body.get("error").is_some() {
            let desc = body.get("error_description").and_then(|v| v.as_str()).unwrap_or("Invalid credentials");
            return Err(serde_json::json!({"success": false, "error": desc}));
        }

        let node_id = format!("teams_{app_id}");
        Ok(ConnectionResult {
            node_id: node_id.clone(),
            display_name: "Teams Bot".to_string(),
            extra: Value::Object(Default::default()),
            vault_entries: vec![
                (format!("channel_token_{node_id}"), app_secret.to_string()),
                (format!("channel_app_id_{node_id}"), app_id.to_string()),
            ],
            config_patch: None,
            profile: None,
        })
    })
}

// ─── Messenger ───────────────────────────────────────────────────────

pub(crate) fn validate_messenger<'a>(
    creds: &'a Value,
    client: &'a reqwest::Client,
) -> std::pin::Pin<Box<dyn std::future::Future<Output = Result<ConnectionResult, Value>> + Send + 'a>>
{
    Box::pin(async move {
        let vals = extract_required_creds(creds, &["pageAccessToken", "pageId"], "Page Access Token and Page ID required")?;
        let (page_token, page_id) = (vals[0].as_str(), vals[1].as_str());

        let body: Value = client
            .get(format!("https://graph.facebook.com/v18.0/{page_id}"))
            .query(&[("fields", "name"), ("access_token", page_token)])
            .send()
            .await
            .map_err(|e| serde_json::json!({"success": false, "error": e.to_string()}))?
            .json()
            .await
            .map_err(|e| serde_json::json!({"success": false, "error": e.to_string()}))?;

        if let Some(err) = body.get("error") {
            let msg = err.get("message").and_then(|v| v.as_str()).unwrap_or("Invalid token");
            return Err(serde_json::json!({"success": false, "error": msg}));
        }

        let page_name = body.get("name").and_then(|v| v.as_str()).unwrap_or("Messenger");
        let node_id = format!("messenger_{page_id}");

        Ok(ConnectionResult {
            node_id: node_id.clone(),
            display_name: page_name.to_string(),
            extra: Value::Object(Default::default()),
            vault_entries: vec![(format!("channel_token_{node_id}"), page_token.to_string())],
            config_patch: None,
            profile: None,
        })
    })
}

// ─── LINE ────────────────────────────────────────────────────────────

pub(crate) fn validate_line<'a>(
    creds: &'a Value,
    client: &'a reqwest::Client,
) -> std::pin::Pin<Box<dyn std::future::Future<Output = Result<ConnectionResult, Value>> + Send + 'a>>
{
    Box::pin(async move {
        let vals = extract_required_creds(creds, &["channelAccessToken", "channelSecret"], "Channel Access Token and Channel Secret required")?;
        let (channel_token, channel_secret) = (vals[0].as_str(), vals[1].as_str());

        let res = client
            .get("https://api.line.me/v2/bot/info")
            .bearer_auth(channel_token)
            .send()
            .await
            .map_err(|e| serde_json::json!({"success": false, "error": e.to_string()}))?;

        if !res.status().is_success() {
            return Err(serde_json::json!({"success": false, "error": "Invalid LINE credentials"}));
        }

        let body: Value = res.json().await
            .map_err(|e| serde_json::json!({"success": false, "error": e.to_string()}))?;
        let bot_id = body.get("userId").and_then(|v| v.as_str()).unwrap_or("");
        let display_name = body.get("displayName").and_then(|v| v.as_str()).unwrap_or("LINE Bot");
        let node_id = format!("line_{bot_id}");

        Ok(ConnectionResult {
            node_id: node_id.clone(),
            display_name: display_name.to_string(),
            extra: Value::Object(Default::default()),
            vault_entries: vec![
                (format!("channel_token_{node_id}"), channel_token.to_string()),
                (format!("channel_secret_{node_id}"), channel_secret.to_string()),
            ],
            config_patch: None,
            profile: None,
        })
    })
}

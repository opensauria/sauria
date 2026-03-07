use serde_json::Value;
use std::sync::Arc;
use tokio::sync::Mutex;

use crate::cmd_channels::{build_http_client, build_success_response, finalize_connection, ConnectionResult};
use crate::daemon_manager::DaemonState;
use crate::paths::Paths;
use crate::vault;

// ─── Slack ───────────────────────────────────────────────────────────

pub(crate) async fn connect_slack(
    creds: &Value,
    paths: &Paths,
    daemon_state: &Arc<Mutex<DaemonState>>,
) -> Result<Value, String> {
    let token = creds.get("token").and_then(|v| v.as_str()).unwrap_or("");
    let signing_secret = creds.get("signingSecret").and_then(|v| v.as_str()).unwrap_or("");
    if token.is_empty() || signing_secret.is_empty() {
        return Ok(serde_json::json!({"success": false, "error": "Bot token and signing secret required"}));
    }

    let client = build_http_client()?;
    let body: Value = client
        .post("https://slack.com/api/auth.test")
        .bearer_auth(token)
        .header("Content-Type", "application/x-www-form-urlencoded")
        .send()
        .await
        .map_err(|e| e.to_string())?
        .json()
        .await
        .map_err(|e| e.to_string())?;

    if !body.get("ok").and_then(|v| v.as_bool()).unwrap_or(false) {
        let error = body.get("error").and_then(|v| v.as_str()).unwrap_or("Invalid Slack credentials");
        return Ok(serde_json::json!({"success": false, "error": error}));
    }

    let user_id = body.get("user_id").and_then(|v| v.as_str()).unwrap_or("");
    let node_id = format!("slack_{user_id}");

    let result = ConnectionResult {
        node_id: node_id.clone(),
        display_name: body.get("team").and_then(|v| v.as_str()).unwrap_or("Slack").to_string(),
        extra: serde_json::json!({
            "teamName": body.get("team").and_then(|v| v.as_str()).unwrap_or("Slack"),
            "teamId": body.get("team_id").and_then(|v| v.as_str()).unwrap_or(""),
            "botUserId": user_id,
        }),
        vault_entries: vec![
            ("slack_bot_token".to_string(), token.to_string()),
            ("slack_signing_secret".to_string(), signing_secret.to_string()),
            (format!("channel_token_{node_id}"), token.to_string()),
            (format!("channel_signing_{node_id}"), signing_secret.to_string()),
        ],
        config_patch: Some((
            "slack".to_string(),
            serde_json::json!({
                "enabled": true,
                "workspaceId": body.get("team_id").and_then(|v| v.as_str()).unwrap_or(""),
                "botUserId": user_id,
            }),
        )),
        profile: None,
    };

    let old_node_id = creds.get("nodeId").and_then(|v| v.as_str()).unwrap_or("");
    if !old_node_id.is_empty() && old_node_id != node_id {
        let _ = vault::vault_delete(paths, &format!("channel_signing_{old_node_id}"));
    }

    finalize_connection(&result, creds, paths, daemon_state).await?;
    Ok(build_success_response(&result))
}

// ─── WhatsApp ────────────────────────────────────────────────────────

pub(crate) async fn connect_whatsapp(
    creds: &Value,
    paths: &Paths,
    daemon_state: &Arc<Mutex<DaemonState>>,
) -> Result<Value, String> {
    let phone_id = creds.get("phoneNumberId").and_then(|v| v.as_str()).unwrap_or("");
    let access_token = creds.get("accessToken").and_then(|v| v.as_str()).unwrap_or("");
    if phone_id.is_empty() || access_token.is_empty() {
        return Ok(serde_json::json!({"success": false, "error": "Phone number ID and access token required"}));
    }

    let client = build_http_client()?;
    let body: Value = client
        .get(format!("https://graph.facebook.com/v18.0/{phone_id}"))
        .bearer_auth(access_token)
        .send()
        .await
        .map_err(|e| e.to_string())?
        .json()
        .await
        .map_err(|e| e.to_string())?;

    if let Some(err) = body.get("error") {
        let msg = err.get("message").and_then(|v| v.as_str()).unwrap_or("API error");
        return Ok(serde_json::json!({"success": false, "error": msg}));
    }

    let node_id = format!("whatsapp_{phone_id}");

    let mut verify_bytes = [0u8; 16];
    rand::RngCore::fill_bytes(&mut rand::rngs::OsRng, &mut verify_bytes);
    let verify_token = hex::encode(verify_bytes);
    vault::vault_store(paths, "whatsapp_verify_token", &verify_token)?;

    let webhook_port = creds.get("webhookPort").and_then(|v| v.as_u64()).unwrap_or(9090);

    let result = ConnectionResult {
        node_id: node_id.clone(),
        display_name: body
            .get("verified_name")
            .or(body.get("display_phone_number"))
            .and_then(|v| v.as_str())
            .unwrap_or("WhatsApp")
            .to_string(),
        extra: Value::Object(Default::default()),
        vault_entries: vec![
            ("whatsapp_access_token".to_string(), access_token.to_string()),
            (format!("channel_token_{node_id}"), access_token.to_string()),
        ],
        config_patch: Some((
            "whatsapp".to_string(),
            serde_json::json!({
                "enabled": true,
                "phoneNumberId": phone_id,
                "webhookPort": webhook_port,
            }),
        )),
        profile: None,
    };

    finalize_connection(&result, creds, paths, daemon_state).await?;
    Ok(build_success_response(&result))
}

// ─── Discord ─────────────────────────────────────────────────────────

pub(crate) async fn connect_discord(
    creds: &Value,
    paths: &Paths,
    daemon_state: &Arc<Mutex<DaemonState>>,
) -> Result<Value, String> {
    let token = creds.get("token").and_then(|v| v.as_str()).unwrap_or("");
    if token.is_empty() {
        return Ok(serde_json::json!({"success": false, "error": "Bot token required"}));
    }

    let client = build_http_client()?;
    let res = client
        .get("https://discord.com/api/v10/users/@me")
        .header("Authorization", format!("Bot {token}"))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        return Ok(serde_json::json!({"success": false, "error": "Invalid Discord bot token"}));
    }

    let body: Value = res.json().await.map_err(|e| e.to_string())?;
    let bot_id = body.get("id").and_then(|v| v.as_str()).unwrap_or("");
    let node_id = format!("discord_{bot_id}");

    let result = ConnectionResult {
        node_id: node_id.clone(),
        display_name: body.get("username").and_then(|v| v.as_str()).unwrap_or("Discord Bot").to_string(),
        extra: serde_json::json!({
            "botUsername": body.get("username").and_then(|v| v.as_str()).unwrap_or("Discord Bot"),
            "botId": bot_id,
        }),
        vault_entries: vec![
            ("discord_bot_token".to_string(), token.to_string()),
            (format!("channel_token_{node_id}"), token.to_string()),
        ],
        config_patch: Some((
            "discord".to_string(),
            serde_json::json!({"enabled": true, "botUserId": bot_id}),
        )),
        profile: None,
    };

    finalize_connection(&result, creds, paths, daemon_state).await?;
    Ok(build_success_response(&result))
}


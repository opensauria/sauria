use serde_json::Value;
use std::sync::Arc;
use tokio::sync::Mutex;

use crate::cmd_channels::{build_http_client, build_success_response, finalize_connection, ConnectionResult};
use crate::daemon_manager::DaemonState;
use crate::paths::Paths;
use crate::vault;

// ─── Error Formatting ───────────────────────────────────────────────

fn format_slack_error(code: &str) -> String {
    match code {
        "invalid_auth" => "Invalid bot token. Check OAuth & Permissions in your Slack app.".to_string(),
        "not_authed" => "Bot token is missing or empty.".to_string(),
        "account_inactive" => "This Slack workspace has been deactivated.".to_string(),
        "token_revoked" | "token_expired" => "Bot token has been revoked or expired. Regenerate it in your Slack app.".to_string(),
        "missing_scope" => "Bot token is missing required scopes. Add channels:history and chat:write in OAuth & Permissions.".to_string(),
        "org_login_required" => "Your Slack org requires SSO login. Re-authenticate in your Slack app.".to_string(),
        "ekm_access_denied" => "Enterprise Key Management denied access.".to_string(),
        "fatal_error" => "Slack API returned a fatal error. Try again later.".to_string(),
        _ => format!("Slack API error: {code}"),
    }
}

fn format_whatsapp_error(msg: &str) -> String {
    if msg.contains("Invalid OAuth") || msg.contains("access token") {
        return "Invalid access token. Generate a new one in Meta Business Suite.".to_string();
    }
    if msg.contains("does not exist") {
        return "Phone number ID not found. Check your WhatsApp API Setup.".to_string();
    }
    format!("WhatsApp API error: {msg}")
}

// ─── Slack ───────────────────────────────────────────────────────────

pub(crate) async fn connect_slack(
    creds: &Value,
    paths: &Paths,
    daemon_state: &Arc<Mutex<DaemonState>>,
) -> Result<Value, String> {
    let token = creds.get("token").and_then(|v| v.as_str()).unwrap_or("");
    let signing_secret = creds.get("signingSecret").and_then(|v| v.as_str()).unwrap_or("");
    let owner_id = creds.get("ownerId").and_then(|v| v.as_str()).unwrap_or("");
    if token.is_empty() || signing_secret.is_empty() {
        return Ok(serde_json::json!({"success": false, "error": "Bot token and signing secret are required."}));
    }

    let client = build_http_client()?;
    let body: Value = client
        .post("https://slack.com/api/auth.test")
        .bearer_auth(token)
        .header("Content-Type", "application/x-www-form-urlencoded")
        .send()
        .await
        .map_err(|e| format!("Could not reach Slack API: {e}"))?
        .json()
        .await
        .map_err(|e| format!("Invalid response from Slack: {e}"))?;

    if !body.get("ok").and_then(|v| v.as_bool()).unwrap_or(false) {
        let code = body.get("error").and_then(|v| v.as_str()).unwrap_or("unknown");
        return Ok(serde_json::json!({"success": false, "error": format_slack_error(code)}));
    }

    let user_id = body.get("user_id").and_then(|v| v.as_str()).unwrap_or("");
    let node_id = format!("slack_{user_id}");

    let bot_name = body.get("user").and_then(|v| v.as_str()).unwrap_or("");
    let team_name = body.get("team").and_then(|v| v.as_str()).unwrap_or("Slack");
    let display = if bot_name.is_empty() { team_name } else { bot_name };

    let result = ConnectionResult {
        node_id: node_id.clone(),
        display_name: display.to_string(),
        extra: serde_json::json!({
            "teamName": team_name,
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

    // Write owner identity so the daemon can identify owner messages
    if !owner_id.is_empty() {
        let mut config = crate::cmd_channels::read_config(paths);
        if let Some(obj) = config.as_object_mut() {
            let owner = obj.entry("owner").or_insert(Value::Object(Default::default()));
            if let Some(owner_obj) = owner.as_object_mut() {
                owner_obj.insert("slack".to_string(), serde_json::json!({"userId": owner_id}));
            }
        }
        crate::cmd_channels::write_config(paths, &config);
    }

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
        return Ok(serde_json::json!({"success": false, "error": "Phone number ID and access token are required."}));
    }

    let client = build_http_client()?;
    let body: Value = client
        .get(format!("https://graph.facebook.com/v18.0/{phone_id}"))
        .bearer_auth(access_token)
        .send()
        .await
        .map_err(|e| format!("Could not reach WhatsApp API: {e}"))?
        .json()
        .await
        .map_err(|e| format!("Invalid response from WhatsApp: {e}"))?;

    if let Some(err) = body.get("error") {
        let msg = err.get("message").and_then(|v| v.as_str()).unwrap_or("Unknown error");
        return Ok(serde_json::json!({"success": false, "error": format_whatsapp_error(msg)}));
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
        return Ok(serde_json::json!({"success": false, "error": "Bot token is required."}));
    }

    let client = build_http_client()?;
    let res = client
        .get("https://discord.com/api/v10/users/@me")
        .header("Authorization", format!("Bot {token}"))
        .send()
        .await
        .map_err(|e| format!("Could not reach Discord API: {e}"))?;

    if !res.status().is_success() {
        return Ok(serde_json::json!({"success": false, "error": "Invalid bot token. Check the token in your Discord Developer Portal."}));
    }

    let body: Value = res.json().await.map_err(|e| format!("Invalid response from Discord: {e}"))?;
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


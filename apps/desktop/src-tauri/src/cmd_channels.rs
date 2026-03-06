use serde_json::Value;
use std::fs;
use std::sync::Arc;
use tokio::sync::Mutex;

use crate::daemon_manager::{self, DaemonState};
use crate::paths::Paths;
use crate::vault;

fn read_config(paths: &Paths) -> Value {
    if !paths.config.exists() {
        return Value::Object(Default::default());
    }
    fs::read_to_string(&paths.config)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or(Value::Object(Default::default()))
}

fn write_config(paths: &Paths, config: &Value) {
    let _ = fs::write(
        &paths.config,
        serde_json::to_string_pretty(config).unwrap_or_default(),
    );
}

pub fn read_profiles_pub(paths: &Paths) -> Value {
    read_profiles(paths)
}

pub fn write_profiles_pub(paths: &Paths, profiles: &Value) {
    write_profiles(paths, profiles)
}

fn read_profiles(paths: &Paths) -> Value {
    if !paths.bot_profiles.exists() {
        return Value::Object(Default::default());
    }
    fs::read_to_string(&paths.bot_profiles)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or(Value::Object(Default::default()))
}

fn write_profiles(paths: &Paths, profiles: &Value) {
    let _ = fs::write(
        &paths.bot_profiles,
        serde_json::to_string_pretty(profiles).unwrap_or_default(),
    );
}

#[tauri::command]
pub async fn connect_channel(
    platform: String,
    credentials: Value,
    paths: tauri::State<'_, Paths>,
    daemon_state: tauri::State<'_, Arc<Mutex<DaemonState>>>,
) -> Result<Value, String> {
    match platform.as_str() {
        "telegram" => connect_telegram(&credentials, &paths, &daemon_state).await,
        "slack" => connect_slack(&credentials, &paths, &daemon_state).await,
        "whatsapp" => connect_whatsapp(&credentials, &paths, &daemon_state).await,
        "discord" => connect_discord(&credentials, &paths, &daemon_state).await,
        "teams" => connect_teams(&credentials, &paths, &daemon_state).await,
        "messenger" => connect_messenger(&credentials, &paths, &daemon_state).await,
        "line" => connect_line(&credentials, &paths, &daemon_state).await,
        "google-chat" => connect_google_chat(&credentials, &paths, &daemon_state).await,
        "twilio" => connect_twilio(&credentials, &paths, &daemon_state).await,
        "matrix" => connect_matrix(&credentials, &paths, &daemon_state).await,
        "email" => connect_email(&credentials, &paths, &daemon_state).await,
        "gmail" => Ok(serde_json::json!({
            "success": false,
            "error": "Gmail OAuth coming soon. Use Email (IMAP) with a Google App Password instead."
        })),
        _ => Ok(serde_json::json!({
            "success": false,
            "error": format!("Unknown platform: {platform}")
        })),
    }
}

async fn connect_telegram(
    creds: &Value,
    paths: &Paths,
    daemon_state: &Arc<Mutex<DaemonState>>,
) -> Result<Value, String> {
    let token = creds.get("token").and_then(|v| v.as_str()).unwrap_or("");
    let user_id = creds.get("userId").and_then(|v| v.as_u64()).unwrap_or(0);
    if token.is_empty() || user_id == 0 {
        return Ok(serde_json::json!({"success": false, "error": "Invalid credentials"}));
    }

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| e.to_string())?;

    let tg_api = format!("https://api.telegram.org/bot{token}");
    let res: Value = client
        .get(format!("{tg_api}/getMe"))
        .send()
        .await
        .map_err(|e| e.to_string())?
        .json()
        .await
        .map_err(|e| e.to_string())?;

    if !res.get("ok").and_then(|v| v.as_bool()).unwrap_or(false) {
        return Ok(serde_json::json!({"success": false, "error": "Invalid bot token"}));
    }

    let result = res.get("result").cloned().unwrap_or(Value::Null);
    let bot_id = result.get("id").and_then(|v| v.as_u64()).unwrap_or(0);
    let username = result.get("username").and_then(|v| v.as_str()).unwrap_or("");
    let first_name = result.get("first_name").and_then(|v| v.as_str()).unwrap_or("");
    let bot_username = if username.is_empty() { first_name } else { username };

    // Best-effort: fetch bot profile photo as base64 data URI
    let photo_url: Option<String> = async {
        let photos_res: Value = client
            .get(format!("{tg_api}/getUserProfilePhotos"))
            .query(&[("user_id", bot_id.to_string()), ("limit", "1".to_string())])
            .send().await.ok()?
            .json().await.ok()?;

        let file_id = photos_res.get("result")?
            .get("photos")?.as_array()?.first()?
            .as_array()?.last()?
            .get("file_id")?.as_str()?;

        let file_res: Value = client
            .get(format!("{tg_api}/getFile"))
            .query(&[("file_id", file_id)])
            .send().await.ok()?
            .json().await.ok()?;

        let file_path = file_res.get("result")?.get("file_path")?.as_str()?;
        let download_url = format!("https://api.telegram.org/file/bot{token}/{file_path}");

        // Download actual image bytes and encode as data URI
        let img_bytes = client.get(&download_url).send().await.ok()?.bytes().await.ok()?;
        if img_bytes.is_empty() {
            return None;
        }
        let b64 = base64::Engine::encode(&base64::engine::general_purpose::STANDARD, &img_bytes);
        let mime = if file_path.ends_with(".png") { "image/png" } else { "image/jpeg" };
        Some(format!("data:{mime};base64,{b64}"))
    }.await;

    // Deterministic nodeId from bot identity
    let node_id = format!("telegram_{bot_id}");
    let old_node_id = creds.get("nodeId").and_then(|v| v.as_str()).unwrap_or("");

    vault::vault_store(paths, &format!("channel_token_{node_id}"), token)?;

    // Clean up temp vault key if ID changed
    if !old_node_id.is_empty() && old_node_id != node_id {
        let _ = vault::vault_delete(paths, &format!("channel_token_{old_node_id}"));
    }

    // Update profiles
    let mut profiles = read_profiles(paths);
    if let Some(obj) = profiles.as_object_mut() {
        obj.insert(
            node_id.clone(),
            serde_json::json!({
                "platform": "telegram",
                "botId": bot_id,
                "username": bot_username,
                "firstName": first_name,
                "userId": user_id,
                "photo": photo_url,
                "connectedAt": chrono_now_iso(),
            }),
        );
    }
    write_profiles(paths, &profiles);

    // Update config
    let mut config = read_config(paths);
    if let Some(obj) = config.as_object_mut() {
        let channels = obj
            .entry("channels")
            .or_insert(Value::Object(Default::default()));
        if let Some(ch) = channels.as_object_mut() {
            ch.insert(
                "telegram".to_string(),
                serde_json::json!({"enabled": true, "allowedUserIds": [user_id]}),
            );
        }
    }
    write_config(paths, &config);

    daemon_manager::restart_daemon(daemon_state, paths).await;

    Ok(serde_json::json!({
        "success": true,
        "botUsername": bot_username,
        "firstName": first_name,
        "botId": bot_id,
        "nodeId": node_id,
        "photo": photo_url,
    }))
}

async fn connect_slack(
    creds: &Value,
    paths: &Paths,
    daemon_state: &Arc<Mutex<DaemonState>>,
) -> Result<Value, String> {
    let token = creds.get("token").and_then(|v| v.as_str()).unwrap_or("");
    let signing_secret = creds.get("signingSecret").and_then(|v| v.as_str()).unwrap_or("");
    if token.is_empty() || signing_secret.is_empty() {
        return Ok(serde_json::json!({"success": false, "error": "Bot token and signing secret required"}));
    }

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| e.to_string())?;

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
    let old_node_id = creds.get("nodeId").and_then(|v| v.as_str()).unwrap_or("");

    vault::vault_store(paths, "slack_bot_token", token)?;
    vault::vault_store(paths, "slack_signing_secret", signing_secret)?;
    vault::vault_store(paths, &format!("channel_token_{node_id}"), token)?;
    vault::vault_store(paths, &format!("channel_signing_{node_id}"), signing_secret)?;

    // Clean up temp vault keys if ID changed
    if !old_node_id.is_empty() && old_node_id != node_id {
        let _ = vault::vault_delete(paths, &format!("channel_token_{old_node_id}"));
        let _ = vault::vault_delete(paths, &format!("channel_signing_{old_node_id}"));
    }

    let mut config = read_config(paths);
    if let Some(obj) = config.as_object_mut() {
        let channels = obj.entry("channels").or_insert(Value::Object(Default::default()));
        if let Some(ch) = channels.as_object_mut() {
            ch.insert("slack".to_string(), serde_json::json!({
                "enabled": true,
                "workspaceId": body.get("team_id").and_then(|v| v.as_str()).unwrap_or(""),
                "botUserId": user_id,
            }));
        }
    }
    write_config(paths, &config);

    daemon_manager::restart_daemon(daemon_state, paths).await;

    Ok(serde_json::json!({
        "success": true,
        "nodeId": node_id,
        "teamName": body.get("team").and_then(|v| v.as_str()).unwrap_or("Slack"),
        "teamId": body.get("team_id").and_then(|v| v.as_str()).unwrap_or(""),
        "botUserId": user_id,
    }))
}

async fn connect_whatsapp(
    creds: &Value,
    paths: &Paths,
    daemon_state: &Arc<Mutex<DaemonState>>,
) -> Result<Value, String> {
    let phone_id = creds.get("phoneNumberId").and_then(|v| v.as_str()).unwrap_or("");
    let access_token = creds.get("accessToken").and_then(|v| v.as_str()).unwrap_or("");
    if phone_id.is_empty() || access_token.is_empty() {
        return Ok(serde_json::json!({"success": false, "error": "Phone number ID and access token required"}));
    }

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| e.to_string())?;

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
    let old_node_id = creds.get("nodeId").and_then(|v| v.as_str()).unwrap_or("");

    vault::vault_store(paths, "whatsapp_access_token", access_token)?;
    vault::vault_store(paths, &format!("channel_token_{node_id}"), access_token)?;

    // Clean up temp vault key if ID changed
    if !old_node_id.is_empty() && old_node_id != node_id {
        let _ = vault::vault_delete(paths, &format!("channel_token_{old_node_id}"));
    }

    // Generate verify token
    let mut verify_bytes = [0u8; 16];
    rand::RngCore::fill_bytes(&mut rand::rngs::OsRng, &mut verify_bytes);
    let verify_token = hex::encode(verify_bytes);
    vault::vault_store(paths, "whatsapp_verify_token", &verify_token)?;

    let webhook_port = creds.get("webhookPort").and_then(|v| v.as_u64()).unwrap_or(9090);
    let mut config = read_config(paths);
    if let Some(obj) = config.as_object_mut() {
        let channels = obj.entry("channels").or_insert(Value::Object(Default::default()));
        if let Some(ch) = channels.as_object_mut() {
            ch.insert("whatsapp".to_string(), serde_json::json!({
                "enabled": true,
                "phoneNumberId": phone_id,
                "webhookPort": webhook_port,
            }));
        }
    }
    write_config(paths, &config);

    daemon_manager::restart_daemon(daemon_state, paths).await;

    Ok(serde_json::json!({
        "success": true,
        "nodeId": node_id,
        "displayName": body.get("verified_name").or(body.get("display_phone_number"))
            .and_then(|v| v.as_str()).unwrap_or("WhatsApp"),
    }))
}

async fn connect_discord(
    creds: &Value,
    paths: &Paths,
    daemon_state: &Arc<Mutex<DaemonState>>,
) -> Result<Value, String> {
    let token = creds.get("token").and_then(|v| v.as_str()).unwrap_or("");
    if token.is_empty() {
        return Ok(serde_json::json!({"success": false, "error": "Bot token required"}));
    }

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| e.to_string())?;

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
    let old_node_id = creds.get("nodeId").and_then(|v| v.as_str()).unwrap_or("");

    vault::vault_store(paths, "discord_bot_token", token)?;
    vault::vault_store(paths, &format!("channel_token_{node_id}"), token)?;

    // Clean up temp vault key if ID changed
    if !old_node_id.is_empty() && old_node_id != node_id {
        let _ = vault::vault_delete(paths, &format!("channel_token_{old_node_id}"));
    }

    let mut config = read_config(paths);
    if let Some(obj) = config.as_object_mut() {
        let channels = obj.entry("channels").or_insert(Value::Object(Default::default()));
        if let Some(ch) = channels.as_object_mut() {
            ch.insert("discord".to_string(), serde_json::json!({
                "enabled": true,
                "botUserId": bot_id,
            }));
        }
    }
    write_config(paths, &config);

    daemon_manager::restart_daemon(daemon_state, paths).await;

    Ok(serde_json::json!({
        "success": true,
        "nodeId": node_id,
        "botUsername": body.get("username").and_then(|v| v.as_str()).unwrap_or("Discord Bot"),
        "botId": bot_id,
    }))
}

async fn connect_teams(
    creds: &Value,
    paths: &Paths,
    daemon_state: &Arc<Mutex<DaemonState>>,
) -> Result<Value, String> {
    let app_id = creds.get("appId").and_then(|v| v.as_str()).unwrap_or("");
    let app_secret = creds.get("appSecret").and_then(|v| v.as_str()).unwrap_or("");
    let tenant_id = creds.get("tenantId").and_then(|v| v.as_str()).unwrap_or("common");
    if app_id.is_empty() || app_secret.is_empty() {
        return Ok(serde_json::json!({"success": false, "error": "App ID and App Secret required"}));
    }

    // Validate credentials by fetching an OAuth token from Azure AD
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| e.to_string())?;

    let token_url = format!(
        "https://login.microsoftonline.com/{tenant_id}/oauth2/v2.0/token"
    );
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
        .map_err(|e| e.to_string())?
        .json()
        .await
        .map_err(|e| e.to_string())?;

    if body.get("error").is_some() {
        let desc = body.get("error_description").and_then(|v| v.as_str()).unwrap_or("Invalid credentials");
        return Ok(serde_json::json!({"success": false, "error": desc}));
    }

    let node_id = format!("teams_{app_id}");
    let old_node_id = creds.get("nodeId").and_then(|v| v.as_str()).unwrap_or("");

    vault::vault_store(paths, &format!("channel_token_{node_id}"), app_secret)?;
    vault::vault_store(paths, &format!("channel_app_id_{node_id}"), app_id)?;

    if !old_node_id.is_empty() && old_node_id != node_id {
        let _ = vault::vault_delete(paths, &format!("channel_token_{old_node_id}"));
    }

    daemon_manager::restart_daemon(daemon_state, paths).await;

    Ok(serde_json::json!({
        "success": true,
        "nodeId": node_id,
        "displayName": "Teams Bot",
    }))
}

async fn connect_messenger(
    creds: &Value,
    paths: &Paths,
    daemon_state: &Arc<Mutex<DaemonState>>,
) -> Result<Value, String> {
    let page_token = creds.get("pageAccessToken").and_then(|v| v.as_str()).unwrap_or("");
    let page_id = creds.get("pageId").and_then(|v| v.as_str()).unwrap_or("");
    if page_token.is_empty() || page_id.is_empty() {
        return Ok(serde_json::json!({"success": false, "error": "Page Access Token and Page ID required"}));
    }

    // Validate token by calling the Graph API
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| e.to_string())?;

    let body: Value = client
        .get(format!("https://graph.facebook.com/v18.0/{page_id}"))
        .query(&[("fields", "name"), ("access_token", page_token)])
        .send()
        .await
        .map_err(|e| e.to_string())?
        .json()
        .await
        .map_err(|e| e.to_string())?;

    if let Some(err) = body.get("error") {
        let msg = err.get("message").and_then(|v| v.as_str()).unwrap_or("Invalid token");
        return Ok(serde_json::json!({"success": false, "error": msg}));
    }

    let page_name = body.get("name").and_then(|v| v.as_str()).unwrap_or("Messenger");
    let node_id = format!("messenger_{page_id}");
    let old_node_id = creds.get("nodeId").and_then(|v| v.as_str()).unwrap_or("");

    vault::vault_store(paths, &format!("channel_token_{node_id}"), page_token)?;

    if !old_node_id.is_empty() && old_node_id != node_id {
        let _ = vault::vault_delete(paths, &format!("channel_token_{old_node_id}"));
    }

    daemon_manager::restart_daemon(daemon_state, paths).await;

    Ok(serde_json::json!({
        "success": true,
        "nodeId": node_id,
        "displayName": page_name,
    }))
}

async fn connect_line(
    creds: &Value,
    paths: &Paths,
    daemon_state: &Arc<Mutex<DaemonState>>,
) -> Result<Value, String> {
    let channel_token = creds.get("channelAccessToken").and_then(|v| v.as_str()).unwrap_or("");
    let channel_secret = creds.get("channelSecret").and_then(|v| v.as_str()).unwrap_or("");
    if channel_token.is_empty() || channel_secret.is_empty() {
        return Ok(serde_json::json!({"success": false, "error": "Channel Access Token and Channel Secret required"}));
    }

    // Validate by calling LINE Bot API
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| e.to_string())?;

    let res = client
        .get("https://api.line.me/v2/bot/info")
        .bearer_auth(channel_token)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        return Ok(serde_json::json!({"success": false, "error": "Invalid LINE credentials"}));
    }

    let body: Value = res.json().await.map_err(|e| e.to_string())?;
    let bot_id = body.get("userId").and_then(|v| v.as_str()).unwrap_or("");
    let display_name = body.get("displayName").and_then(|v| v.as_str()).unwrap_or("LINE Bot");

    let node_id = format!("line_{bot_id}");
    let old_node_id = creds.get("nodeId").and_then(|v| v.as_str()).unwrap_or("");

    vault::vault_store(paths, &format!("channel_token_{node_id}"), channel_token)?;
    vault::vault_store(paths, &format!("channel_secret_{node_id}"), channel_secret)?;

    if !old_node_id.is_empty() && old_node_id != node_id {
        let _ = vault::vault_delete(paths, &format!("channel_token_{old_node_id}"));
    }

    daemon_manager::restart_daemon(daemon_state, paths).await;

    Ok(serde_json::json!({
        "success": true,
        "nodeId": node_id,
        "displayName": display_name,
    }))
}

async fn connect_google_chat(
    creds: &Value,
    paths: &Paths,
    daemon_state: &Arc<Mutex<DaemonState>>,
) -> Result<Value, String> {
    let sa_key = creds.get("serviceAccountKey").and_then(|v| v.as_str()).unwrap_or("");
    let space_id = creds.get("spaceId").and_then(|v| v.as_str()).unwrap_or("");
    if sa_key.is_empty() {
        return Ok(serde_json::json!({"success": false, "error": "Service Account Key (JSON) required"}));
    }

    // Validate JSON structure
    let key_json: Value = serde_json::from_str(sa_key)
        .map_err(|_| "Invalid JSON in service account key".to_string())?;

    let client_email = key_json.get("client_email").and_then(|v| v.as_str()).unwrap_or("");
    if client_email.is_empty() {
        return Ok(serde_json::json!({"success": false, "error": "Service account key must contain client_email"}));
    }

    let sa_id = client_email.split('@').next().unwrap_or("gchat");
    let node_id = format!("gchat_{sa_id}");
    let old_node_id = creds.get("nodeId").and_then(|v| v.as_str()).unwrap_or("");

    vault::vault_store(paths, &format!("channel_token_{node_id}"), sa_key)?;
    if !space_id.is_empty() {
        vault::vault_store(paths, &format!("channel_space_{node_id}"), space_id)?;
    }

    if !old_node_id.is_empty() && old_node_id != node_id {
        let _ = vault::vault_delete(paths, &format!("channel_token_{old_node_id}"));
    }

    daemon_manager::restart_daemon(daemon_state, paths).await;

    Ok(serde_json::json!({
        "success": true,
        "nodeId": node_id,
        "displayName": "Google Chat",
    }))
}

async fn connect_twilio(
    creds: &Value,
    paths: &Paths,
    daemon_state: &Arc<Mutex<DaemonState>>,
) -> Result<Value, String> {
    let account_sid = creds.get("accountSid").and_then(|v| v.as_str()).unwrap_or("");
    let auth_token = creds.get("authToken").and_then(|v| v.as_str()).unwrap_or("");
    let phone_number = creds.get("phoneNumber").and_then(|v| v.as_str()).unwrap_or("");
    if account_sid.is_empty() || auth_token.is_empty() || phone_number.is_empty() {
        return Ok(serde_json::json!({"success": false, "error": "Account SID, Auth Token, and Phone Number required"}));
    }

    // Validate by calling Twilio API
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| e.to_string())?;

    let res = client
        .get(format!("https://api.twilio.com/2010-04-01/Accounts/{account_sid}.json"))
        .basic_auth(account_sid, Some(auth_token))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        return Ok(serde_json::json!({"success": false, "error": "Invalid Twilio credentials"}));
    }

    let body: Value = res.json().await.map_err(|e| e.to_string())?;
    let friendly_name = body.get("friendly_name").and_then(|v| v.as_str()).unwrap_or(phone_number);

    // Sanitize phone number for node ID
    let phone_clean = phone_number.replace('+', "").replace('-', "").replace(' ', "");
    let node_id = format!("twilio_{phone_clean}");
    let old_node_id = creds.get("nodeId").and_then(|v| v.as_str()).unwrap_or("");

    vault::vault_store(paths, &format!("channel_token_{node_id}"), auth_token)?;
    vault::vault_store(paths, &format!("channel_sid_{node_id}"), account_sid)?;

    if !old_node_id.is_empty() && old_node_id != node_id {
        let _ = vault::vault_delete(paths, &format!("channel_token_{old_node_id}"));
    }

    daemon_manager::restart_daemon(daemon_state, paths).await;

    Ok(serde_json::json!({
        "success": true,
        "nodeId": node_id,
        "displayName": friendly_name,
    }))
}

async fn connect_matrix(
    creds: &Value,
    paths: &Paths,
    daemon_state: &Arc<Mutex<DaemonState>>,
) -> Result<Value, String> {
    let homeserver = creds.get("homeserverUrl").and_then(|v| v.as_str()).unwrap_or("");
    let access_token = creds.get("accessToken").and_then(|v| v.as_str()).unwrap_or("");
    if homeserver.is_empty() || access_token.is_empty() {
        return Ok(serde_json::json!({"success": false, "error": "Homeserver URL and Access Token required"}));
    }

    // Validate by calling Matrix whoami
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| e.to_string())?;

    let hs = homeserver.trim_end_matches('/');
    let res = client
        .get(format!("{hs}/_matrix/client/v3/account/whoami"))
        .bearer_auth(access_token)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        return Ok(serde_json::json!({"success": false, "error": "Invalid Matrix credentials"}));
    }

    let body: Value = res.json().await.map_err(|e| e.to_string())?;
    let user_id = body.get("user_id").and_then(|v| v.as_str()).unwrap_or("");

    // Use user_id for deterministic node ID (e.g. @bot:matrix.org -> matrix_bot_matrix.org)
    let clean_id = user_id.trim_start_matches('@').replace(':', "_");
    let node_id = format!("matrix_{clean_id}");
    let old_node_id = creds.get("nodeId").and_then(|v| v.as_str()).unwrap_or("");

    vault::vault_store(paths, &format!("channel_token_{node_id}"), access_token)?;
    vault::vault_store(paths, &format!("channel_homeserver_{node_id}"), hs)?;

    if !old_node_id.is_empty() && old_node_id != node_id {
        let _ = vault::vault_delete(paths, &format!("channel_token_{old_node_id}"));
    }

    daemon_manager::restart_daemon(daemon_state, paths).await;

    Ok(serde_json::json!({
        "success": true,
        "nodeId": node_id,
        "displayName": user_id,
    }))
}

async fn connect_email(
    creds: &Value,
    paths: &Paths,
    daemon_state: &Arc<Mutex<DaemonState>>,
) -> Result<Value, String> {
    let imap_host = creds.get("imapHost").and_then(|v| v.as_str()).unwrap_or("");
    let username = creds.get("username").and_then(|v| v.as_str()).unwrap_or("");
    let password = creds.get("password").and_then(|v| v.as_str()).unwrap_or("");
    if imap_host.is_empty() || username.is_empty() || password.is_empty() {
        return Ok(serde_json::json!({"success": false, "error": "IMAP host, username, and password required"}));
    }

    let node_id = format!("email_{username}@{imap_host}");
    let old_node_id = creds.get("nodeId").and_then(|v| v.as_str()).unwrap_or("");

    vault::vault_store(paths, "email_password", password)?;
    vault::vault_store(paths, &format!("channel_token_{node_id}"), password)?;

    // Clean up temp vault key if ID changed
    if !old_node_id.is_empty() && old_node_id != node_id {
        let _ = vault::vault_delete(paths, &format!("channel_token_{old_node_id}"));
    }

    let smtp_host = creds.get("smtpHost").and_then(|v| v.as_str()).unwrap_or(imap_host);
    let imap_port = creds.get("imapPort").and_then(|v| v.as_u64()).unwrap_or(993);
    let smtp_port = creds.get("smtpPort").and_then(|v| v.as_u64()).unwrap_or(587);

    let mut config = read_config(paths);
    if let Some(obj) = config.as_object_mut() {
        let channels = obj.entry("channels").or_insert(Value::Object(Default::default()));
        if let Some(ch) = channels.as_object_mut() {
            ch.insert("email".to_string(), serde_json::json!({
                "enabled": true,
                "imapHost": imap_host,
                "imapPort": imap_port,
                "smtpHost": smtp_host,
                "smtpPort": smtp_port,
                "username": username,
                "tls": true,
            }));
        }
    }
    write_config(paths, &config);

    daemon_manager::restart_daemon(daemon_state, paths).await;

    Ok(serde_json::json!({"success": true, "nodeId": node_id, "displayName": username}))
}

#[tauri::command]
pub async fn disconnect_channel(
    platform: String,
    node_id: String,
    paths: tauri::State<'_, Paths>,
    daemon_state: tauri::State<'_, Arc<Mutex<DaemonState>>>,
) -> Result<Value, String> {
    daemon_manager::stop_daemon(&daemon_state, &paths).await;

    // Delete vault secrets
    let mut vault_names = vec![format!("channel_token_{node_id}")];
    if platform == "slack" {
        vault_names.push(format!("channel_signing_{node_id}"));
    }
    for name in &vault_names {
        let _ = vault::vault_delete(&paths, name);
    }

    // Update profiles
    let mut profiles = read_profiles(&paths);
    if let Some(obj) = profiles.as_object_mut() {
        obj.remove(&node_id);
    }
    write_profiles(&paths, &profiles);

    // Update canvas node
    if paths.canvas.exists() {
        if let Ok(content) = fs::read_to_string(&paths.canvas) {
            if let Ok(mut canvas) = serde_json::from_str::<Value>(&content) {
                if let Some(nodes) = canvas.get_mut("nodes").and_then(|n| n.as_array_mut()) {
                    for node in nodes.iter_mut() {
                        if node.get("id").and_then(|v| v.as_str()) == Some(&node_id) {
                            node["status"] = Value::String("setup".to_string());
                            node["photo"] = Value::Null;
                            node["label"] = Value::String(
                                format!("{}{}", &platform[..1].to_uppercase(), &platform[1..]),
                            );
                            node["credentials"] = Value::String(String::new());
                            node["meta"] = Value::Object(Default::default());
                        }
                    }
                }
                let _ = fs::write(
                    &paths.canvas,
                    serde_json::to_string_pretty(&canvas).unwrap_or_default(),
                );
            }
        }
    }

    // Update config
    let mut config = read_config(&paths);
    if let Some(obj) = config.as_object_mut() {
        if let Some(channels) = obj.get_mut("channels").and_then(|c| c.as_object_mut()) {
            match platform.as_str() {
                "telegram" => {
                    channels.insert("telegram".to_string(), serde_json::json!({"enabled": false, "allowedUserIds": []}));
                }
                other => {
                    channels.insert(other.to_string(), serde_json::json!({"enabled": false}));
                }
            }
        }
    }
    write_config(&paths, &config);

    let _ = daemon_manager::start_daemon(&daemon_state, &paths).await;

    Ok(serde_json::json!({"success": true}))
}

fn chrono_now_iso() -> String {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default();
    format!("{}Z", now.as_secs())
}

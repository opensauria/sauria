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

    // Generate nodeId
    let node_id = creds
        .get("nodeId")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .unwrap_or_else(|| {
            format!(
                "{}{}",
                format!("{:x}", std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_millis()),
                &uuid_fragment()
            )
        });

    vault::vault_store(paths, &format!("channel_token_{node_id}"), token)?;

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

    vault::vault_store(paths, "slack_bot_token", token)?;
    vault::vault_store(paths, "slack_signing_secret", signing_secret)?;

    let node_id = creds.get("nodeId").and_then(|v| v.as_str());
    if let Some(nid) = node_id {
        vault::vault_store(paths, &format!("channel_token_{nid}"), token)?;
        vault::vault_store(paths, &format!("channel_signing_{nid}"), signing_secret)?;
    }

    let mut config = read_config(paths);
    if let Some(obj) = config.as_object_mut() {
        let channels = obj.entry("channels").or_insert(Value::Object(Default::default()));
        if let Some(ch) = channels.as_object_mut() {
            ch.insert("slack".to_string(), serde_json::json!({
                "enabled": true,
                "workspaceId": body.get("team_id").and_then(|v| v.as_str()).unwrap_or(""),
                "botUserId": body.get("user_id").and_then(|v| v.as_str()).unwrap_or(""),
            }));
        }
    }
    write_config(paths, &config);

    daemon_manager::restart_daemon(daemon_state, paths).await;

    Ok(serde_json::json!({
        "success": true,
        "teamName": body.get("team").and_then(|v| v.as_str()).unwrap_or("Slack"),
        "teamId": body.get("team_id").and_then(|v| v.as_str()).unwrap_or(""),
        "botUserId": body.get("user_id").and_then(|v| v.as_str()).unwrap_or(""),
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

    vault::vault_store(paths, "whatsapp_access_token", access_token)?;

    let node_id = creds.get("nodeId").and_then(|v| v.as_str());
    if let Some(nid) = node_id {
        vault::vault_store(paths, &format!("channel_token_{nid}"), access_token)?;
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

    vault::vault_store(paths, "discord_bot_token", token)?;

    let node_id = creds.get("nodeId").and_then(|v| v.as_str());
    if let Some(nid) = node_id {
        vault::vault_store(paths, &format!("channel_token_{nid}"), token)?;
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
        "botUsername": body.get("username").and_then(|v| v.as_str()).unwrap_or("Discord Bot"),
        "botId": bot_id,
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

    vault::vault_store(paths, "email_password", password)?;

    let node_id = creds.get("nodeId").and_then(|v| v.as_str());
    if let Some(nid) = node_id {
        vault::vault_store(paths, &format!("channel_token_{nid}"), password)?;
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

    Ok(serde_json::json!({"success": true, "displayName": username}))
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

fn uuid_fragment() -> String {
    let mut bytes = [0u8; 4];
    rand::RngCore::fill_bytes(&mut rand::rngs::OsRng, &mut bytes);
    hex::encode(bytes)
}

fn chrono_now_iso() -> String {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default();
    format!("{}Z", now.as_secs())
}

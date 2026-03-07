use serde_json::Value;
use std::sync::Arc;
use tokio::sync::Mutex;

use crate::cmd_channels::{build_http_client, build_success_response, finalize_connection, ConnectionResult};
use crate::daemon_manager::DaemonState;
use crate::paths::Paths;

pub(crate) async fn connect_telegram(
    creds: &Value,
    paths: &Paths,
    daemon_state: &Arc<Mutex<DaemonState>>,
) -> Result<Value, String> {
    let token = creds.get("token").and_then(|v| v.as_str()).unwrap_or("");
    let user_id = creds.get("userId").and_then(|v| v.as_u64()).unwrap_or(0);
    if token.is_empty() || user_id == 0 {
        return Ok(serde_json::json!({"success": false, "error": "Invalid credentials"}));
    }

    let client = build_http_client()?;
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

    let bot_result = res.get("result").cloned().unwrap_or(Value::Null);
    let bot_id = bot_result.get("id").and_then(|v| v.as_u64()).unwrap_or(0);
    let username = bot_result.get("username").and_then(|v| v.as_str()).unwrap_or("");
    let first_name = bot_result.get("first_name").and_then(|v| v.as_str()).unwrap_or("");
    let bot_username = if username.is_empty() { first_name } else { username };

    let photo_url = fetch_photo(&client, &tg_api, token, bot_id).await;
    let node_id = format!("telegram_{bot_id}");

    let result = ConnectionResult {
        node_id: node_id.clone(),
        display_name: bot_username.to_string(),
        extra: serde_json::json!({
            "botUsername": bot_username,
            "firstName": first_name,
            "botId": bot_id,
            "photo": photo_url,
        }),
        vault_entries: vec![(format!("channel_token_{node_id}"), token.to_string())],
        config_patch: Some((
            "telegram".to_string(),
            serde_json::json!({"enabled": true, "allowedUserIds": [user_id]}),
        )),
        profile: Some(serde_json::json!({
            "platform": "telegram",
            "botId": bot_id,
            "username": bot_username,
            "firstName": first_name,
            "userId": user_id,
            "photo": photo_url,
            "connectedAt": format!("{}Z", std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs()),
        })),
    };

    finalize_connection(&result, creds, paths, daemon_state).await?;
    Ok(build_success_response(&result))
}

async fn fetch_photo(
    client: &reqwest::Client,
    tg_api: &str,
    token: &str,
    bot_id: u64,
) -> Option<String> {
    let photos_res: Value = client
        .get(format!("{tg_api}/getUserProfilePhotos"))
        .query(&[("user_id", bot_id.to_string()), ("limit", "1".to_string())])
        .send()
        .await
        .ok()?
        .json()
        .await
        .ok()?;

    let file_id = photos_res
        .get("result")?
        .get("photos")?
        .as_array()?
        .first()?
        .as_array()?
        .last()?
        .get("file_id")?
        .as_str()?;

    let file_res: Value = client
        .get(format!("{tg_api}/getFile"))
        .query(&[("file_id", file_id)])
        .send()
        .await
        .ok()?
        .json()
        .await
        .ok()?;

    let file_path = file_res.get("result")?.get("file_path")?.as_str()?;
    let download_url = format!("https://api.telegram.org/file/bot{token}/{file_path}");

    let img_bytes = client.get(&download_url).send().await.ok()?.bytes().await.ok()?;
    if img_bytes.is_empty() {
        return None;
    }
    let b64 = base64::Engine::encode(&base64::engine::general_purpose::STANDARD, &img_bytes);
    let mime = if file_path.ends_with(".png") { "image/png" } else { "image/jpeg" };
    Some(format!("data:{mime};base64,{b64}"))
}

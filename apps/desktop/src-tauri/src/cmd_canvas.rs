use serde::Serialize;
use serde_json::Value;
use std::fs;
use std::io::Write;

use crate::cmd_canvas_helpers;
use crate::cmd_channels;
use crate::cmd_channels_telegram;
use crate::daemon_manager;
use crate::paths::Paths;
use crate::vault;

#[tauri::command]
pub fn get_canvas_graph(paths: tauri::State<'_, Paths>) -> Value {
    if !paths.canvas.exists() {
        return cmd_canvas_helpers::empty_graph();
    }
    let mut canvas = fs::read_to_string(&paths.canvas)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_else(cmd_canvas_helpers::empty_graph);

    if cmd_canvas_helpers::migrate_node_ids(&mut canvas, &paths) {
        let _ = fs::write(
            &paths.canvas,
            serde_json::to_string_pretty(&canvas).unwrap_or_default(),
        );
    }

    canvas
}

#[tauri::command]
pub fn save_canvas_graph(graph: Value, paths: tauri::State<'_, Paths>) -> Result<(), String> {
    let content = serde_json::to_string_pretty(&graph).map_err(|e| e.to_string())?;
    fs::write(&paths.canvas, content).map_err(|e| e.to_string())
}

#[derive(Serialize)]
pub struct ParseResult {
    pub(crate) parsed: bool,
    #[serde(rename = "type")]
    pub(crate) cmd_type: String,
    pub(crate) target: Option<String>,
    pub(crate) message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) owner_command: Option<Value>,
}

#[tauri::command]
pub fn execute_owner_command(command: String, paths: tauri::State<'_, Paths>) -> ParseResult {
    let trimmed = command.trim();
    if trimmed.is_empty() {
        return ParseResult {
            parsed: true,
            cmd_type: "unknown".to_string(),
            target: None,
            message: trimmed.to_string(),
            owner_command: None,
        };
    }

    if daemon_manager::is_daemon_running_by_pid(&paths) {
        if let Ok(mut file) = fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&paths.owner_commands)
        {
            let cmd_json = serde_json::json!({"raw": trimmed});
            let _ = writeln!(file, "{}", cmd_json);
        }
    }

    if let Some(captures) = cmd_canvas_helpers::parse_simple_command(trimmed) {
        return captures;
    }

    ParseResult {
        parsed: true,
        cmd_type: "unknown".to_string(),
        target: None,
        message: trimmed.to_string(),
        owner_command: None,
    }
}

#[derive(Serialize)]
pub struct TelegramStatus {
    connected: bool,
    bots: Vec<Value>,
}

#[tauri::command]
pub fn get_telegram_status(paths: tauri::State<'_, Paths>) -> TelegramStatus {
    let profiles: Value = if paths.bot_profiles.exists() {
        fs::read_to_string(&paths.bot_profiles)
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or(Value::Object(Default::default()))
    } else {
        Value::Object(Default::default())
    };

    let canvas_nodes: Vec<Value> = if paths.canvas.exists() {
        fs::read_to_string(&paths.canvas)
            .ok()
            .and_then(|s| serde_json::from_str::<Value>(&s).ok())
            .and_then(|c| c.get("nodes").cloned())
            .and_then(|n| serde_json::from_value::<Vec<Value>>(n).ok())
            .unwrap_or_default()
            .into_iter()
            .filter(|n| n.get("platform").and_then(|p| p.as_str()) == Some("telegram"))
            .collect()
    } else {
        vec![]
    };

    let mut bots = Vec::new();
    for node in &canvas_nodes {
        let nid = node.get("id").and_then(|v| v.as_str()).unwrap_or("");
        let status = node.get("status").and_then(|v| v.as_str()).unwrap_or("setup");
        let has_token = crate::vault::vault_exists(&paths, &format!("channel_token_{nid}"));
        let profile = profiles.get(nid);

        bots.push(serde_json::json!({
            "nodeId": nid,
            "connected": status == "connected" && has_token,
            "label": node.get("label").and_then(|v| v.as_str()).unwrap_or("Telegram Bot"),
            "photo": node.get("photo").or(profile.and_then(|p| p.get("photo"))),
            "profile": profile,
        }));
    }

    let connected = bots.iter().any(|b| b.get("connected").and_then(|v| v.as_bool()).unwrap_or(false));

    TelegramStatus { connected, bots }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChannelStatus {
    connected: bool,
    bots: Vec<Value>,
}

#[tauri::command]
pub fn get_slack_status(paths: tauri::State<'_, Paths>) -> ChannelStatus {
    let canvas_nodes: Vec<Value> = if paths.canvas.exists() {
        fs::read_to_string(&paths.canvas)
            .ok()
            .and_then(|s| serde_json::from_str::<Value>(&s).ok())
            .and_then(|c| c.get("nodes").cloned())
            .and_then(|n| serde_json::from_value::<Vec<Value>>(n).ok())
            .unwrap_or_default()
            .into_iter()
            .filter(|n| n.get("platform").and_then(|p| p.as_str()) == Some("slack"))
            .collect()
    } else {
        vec![]
    };

    let mut bots = Vec::new();
    for node in &canvas_nodes {
        let nid = node.get("id").and_then(|v| v.as_str()).unwrap_or("");
        let status = node.get("status").and_then(|v| v.as_str()).unwrap_or("setup");
        let has_token = crate::vault::vault_exists(&paths, &format!("channel_token_{nid}"));

        let team_name = node.get("meta")
            .and_then(|m| m.get("teamName"))
            .and_then(|v| v.as_str())
            .unwrap_or("");

        bots.push(serde_json::json!({
            "nodeId": nid,
            "connected": status == "connected" && has_token,
            "label": node.get("label").and_then(|v| v.as_str()).unwrap_or("Slack Bot"),
            "teamName": team_name,
        }));
    }

    let connected = bots.iter().any(|b| b.get("connected").and_then(|v| v.as_bool()).unwrap_or(false));

    ChannelStatus { connected, bots }
}

fn channel_status(paths: &Paths, platform: &str, default_label: &str) -> ChannelStatus {
    let canvas_nodes: Vec<Value> = if paths.canvas.exists() {
        fs::read_to_string(&paths.canvas)
            .ok()
            .and_then(|s| serde_json::from_str::<Value>(&s).ok())
            .and_then(|c| c.get("nodes").cloned())
            .and_then(|n| serde_json::from_value::<Vec<Value>>(n).ok())
            .unwrap_or_default()
            .into_iter()
            .filter(|n| n.get("platform").and_then(|p| p.as_str()) == Some(platform))
            .collect()
    } else {
        vec![]
    };

    let mut bots = Vec::new();
    for node in &canvas_nodes {
        let nid = node.get("id").and_then(|v| v.as_str()).unwrap_or("");
        let status = node.get("status").and_then(|v| v.as_str()).unwrap_or("setup");
        let has_token = crate::vault::vault_exists(paths, &format!("channel_token_{nid}"));

        bots.push(serde_json::json!({
            "nodeId": nid,
            "connected": status == "connected" && has_token,
            "label": node.get("label").and_then(|v| v.as_str()).unwrap_or(default_label),
        }));
    }

    let connected = bots.iter().any(|b| b.get("connected").and_then(|v| v.as_bool()).unwrap_or(false));

    ChannelStatus { connected, bots }
}

#[tauri::command]
pub fn get_discord_status(paths: tauri::State<'_, Paths>) -> ChannelStatus {
    channel_status(&paths, "discord", "Discord Bot")
}

#[tauri::command]
pub fn get_whatsapp_status(paths: tauri::State<'_, Paths>) -> ChannelStatus {
    channel_status(&paths, "whatsapp", "WhatsApp Bot")
}

#[tauri::command]
pub fn get_email_status(paths: tauri::State<'_, Paths>) -> ChannelStatus {
    channel_status(&paths, "email", "Email")
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OwnerProfile {
    full_name: String,
    photo: Option<String>,
    custom_instructions: String,
}

#[tauri::command]
pub fn get_owner_profile() -> OwnerProfile {
    let full_name = cmd_canvas_helpers::resolve_owner_name();
    let photo = cmd_canvas_helpers::resolve_owner_photo();

    let custom_instructions = dirs::home_dir()
        .map(|h| h.join(".claude/CLAUDE.md"))
        .filter(|p| p.exists())
        .and_then(|p| fs::read_to_string(p).ok())
        .unwrap_or_default();

    OwnerProfile {
        full_name,
        photo,
        custom_instructions,
    }
}

async fn fetch_bot_description(client: &reqwest::Client, tg_api: &str) -> Option<String> {
    let res: Value = client
        .get(format!("{tg_api}/getMyDescription"))
        .send()
        .await
        .ok()?
        .json()
        .await
        .ok()?;
    res.get("result")?
        .get("description")?
        .as_str()
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string())
}

#[tauri::command]
pub async fn refresh_bot_profiles(paths: tauri::State<'_, Paths>) -> Result<Value, String> {
    let client = cmd_channels::build_http_client()?;

    let canvas_nodes: Vec<Value> = if paths.canvas.exists() {
        fs::read_to_string(&paths.canvas)
            .ok()
            .and_then(|s| serde_json::from_str::<Value>(&s).ok())
            .and_then(|c| c.get("nodes").cloned())
            .and_then(|n| serde_json::from_value::<Vec<Value>>(n).ok())
            .unwrap_or_default()
            .into_iter()
            .filter(|n| {
                n.get("platform").and_then(|p| p.as_str()) == Some("telegram")
                    && n.get("status").and_then(|s| s.as_str()) == Some("connected")
            })
            .collect()
    } else {
        return Ok(serde_json::json!({}));
    };

    let mut updated: serde_json::Map<String, Value> = serde_json::Map::new();
    let mut profiles = cmd_channels::read_profiles(&paths);

    for node in &canvas_nodes {
        let nid = match node.get("id").and_then(|v| v.as_str()) {
            Some(id) => id,
            None => continue,
        };
        let token = match vault::vault_read(&paths, &format!("channel_token_{nid}")) {
            Ok(t) => t,
            Err(_) => continue,
        };
        let bot_id = nid.strip_prefix("telegram_").and_then(|s| s.parse::<u64>().ok()).unwrap_or(0);
        if bot_id == 0 { continue; }

        let tg_api = format!("https://api.telegram.org/bot{token}");
        let mut node_patch = serde_json::Map::new();

        if let Some(photo) = cmd_channels_telegram::fetch_photo(&client, &tg_api, &token, bot_id).await {
            node_patch.insert("photo".to_string(), Value::String(photo.clone()));
            if let Some(obj) = profiles.as_object_mut() {
                if let Some(profile) = obj.get_mut(nid) {
                    profile["photo"] = Value::String(photo);
                }
            }
        }

        let desc = fetch_bot_description(&client, &tg_api).await;
        if let Some(ref d) = desc {
            node_patch.insert("description".to_string(), Value::String(d.clone()));
        }

        eprintln!("[refresh] {nid}: photo={}, desc={:?}", node_patch.contains_key("photo"), desc);

        if !node_patch.is_empty() {
            updated.insert(nid.to_string(), Value::Object(node_patch));
        }
    }

    // Update canvas nodes with refreshed data
    if !updated.is_empty() {
        if let Ok(content) = fs::read_to_string(&paths.canvas) {
            if let Ok(mut graph) = serde_json::from_str::<Value>(&content) {
                if let Some(nodes) = graph.get_mut("nodes").and_then(|n| n.as_array_mut()) {
                    for node in nodes.iter_mut() {
                        let nid = node.get("id").and_then(|v| v.as_str()).unwrap_or("");
                        if let Some(Value::Object(patch)) = updated.get(nid) {
                            for (key, value) in patch {
                                node[key] = value.clone();
                            }
                        }
                    }
                    let _ = fs::write(&paths.canvas, serde_json::to_string_pretty(&graph).unwrap_or_default());
                }
            }
        }
        cmd_channels::write_profiles(&paths, &profiles);
    }

    Ok(Value::Object(updated))
}

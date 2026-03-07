use serde::Serialize;
use serde_json::Value;
use std::fs;
use std::io::Write;

use crate::cmd_canvas_helpers;
use crate::daemon_manager;
use crate::paths::Paths;

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

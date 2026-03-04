use serde::Serialize;
use serde_json::Value;
use std::fs;
use std::io::Write;

use crate::daemon_manager;
use crate::paths::Paths;

#[tauri::command]
pub fn get_canvas_graph(paths: tauri::State<'_, Paths>) -> Value {
    if !paths.canvas.exists() {
        return empty_graph();
    }
    fs::read_to_string(&paths.canvas)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_else(empty_graph)
}

#[tauri::command]
pub fn save_canvas_graph(graph: Value, paths: tauri::State<'_, Paths>) -> Result<(), String> {
    let content = serde_json::to_string_pretty(&graph).map_err(|e| e.to_string())?;
    fs::write(&paths.canvas, content).map_err(|e| e.to_string())
}

#[derive(Serialize)]
pub struct ParseResult {
    parsed: bool,
    #[serde(rename = "type")]
    cmd_type: String,
    target: Option<String>,
    message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    owner_command: Option<Value>,
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

    // Append raw command to owner-commands.jsonl and let daemon parse it
    if daemon_manager::is_daemon_running_by_pid(&paths) {
        if let Ok(mut file) = fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&paths.owner_commands)
        {
            // Write raw command as JSON line for daemon to parse
            let cmd_json = serde_json::json!({"raw": trimmed});
            let _ = writeln!(file, "{}", cmd_json);
        }
    }

    // Simple parsing for UI feedback (the daemon does full Zod parsing)
    if let Some(captures) = parse_simple_command(trimmed) {
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

fn parse_simple_command(input: &str) -> Option<ParseResult> {
    // @agent instruction
    if input.starts_with('@') {
        let rest = &input[1..];
        let (agent, msg) = rest.split_once(char::is_whitespace).unwrap_or((rest, ""));
        return Some(ParseResult {
            parsed: true,
            cmd_type: "instruct".to_string(),
            target: Some(agent.to_string()),
            message: msg.to_string(),
            owner_command: Some(serde_json::json!({
                "type": "instruct",
                "agentId": agent,
                "instruction": msg,
            })),
        });
    }

    // #workspace message -> broadcast
    if input.starts_with('#') {
        let rest = &input[1..];
        let (ws, msg) = rest.split_once(char::is_whitespace).unwrap_or((rest, ""));
        return Some(ParseResult {
            parsed: true,
            cmd_type: "broadcast".to_string(),
            target: Some(ws.to_string()),
            message: msg.to_string(),
            owner_command: Some(serde_json::json!({
                "type": "broadcast",
                "message": msg,
            })),
        });
    }

    None
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
    let full_name = resolve_owner_name();
    let photo = resolve_owner_photo();

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

fn resolve_owner_name() -> String {
    whoami::realname()
}

fn resolve_owner_photo() -> Option<String> {
    #[cfg(target_os = "macos")]
    {
        let username = whoami::username();
        if let Ok(output) = std::process::Command::new("/usr/bin/dscl")
            .args([".", "-read", &format!("/Users/{username}"), "JPEGPhoto"])
            .output()
        {
            let raw = String::from_utf8_lossy(&output.stdout);
            let hex: String = raw
                .lines()
                .skip(1)
                .collect::<Vec<_>>()
                .join("")
                .chars()
                .filter(|c| !c.is_whitespace())
                .collect();
            if !hex.is_empty() {
                if let Ok(bytes) = hex::decode(&hex) {
                    return Some(format!(
                        "data:image/jpeg;base64,{}",
                        base64::Engine::encode(&base64::engine::general_purpose::STANDARD, &bytes)
                    ));
                }
            }
        }
    }

    #[cfg(target_os = "linux")]
    {
        let face_path = dirs::home_dir().map(|h| h.join(".face"));
        if let Some(path) = face_path.filter(|p| p.exists()) {
            if let Ok(bytes) = fs::read(&path) {
                if !bytes.is_empty() {
                    let mime = if bytes.starts_with(&[0x89, 0x50]) {
                        "image/png"
                    } else {
                        "image/jpeg"
                    };
                    return Some(format!(
                        "data:{mime};base64,{}",
                        base64::Engine::encode(&base64::engine::general_purpose::STANDARD, &bytes)
                    ));
                }
            }
        }
    }

    None
}

fn empty_graph() -> Value {
    serde_json::json!({
        "version": 2,
        "globalInstructions": "",
        "workspaces": [],
        "nodes": [],
        "edges": [],
        "viewport": {"x": 0, "y": 0, "zoom": 1}
    })
}

use serde_json::Value;

use crate::cmd_canvas_migrate;
use crate::paths::Paths;

pub(crate) fn empty_graph() -> Value {
    serde_json::json!({
        "version": 2,
        "globalInstructions": "",
        "workspaces": [],
        "nodes": [],
        "edges": [],
        "viewport": {"x": 0, "y": 0, "zoom": 1}
    })
}

pub(crate) fn compute_deterministic_id(node: &Value) -> Option<String> {
    let platform = node.get("platform")?.as_str()?;
    let meta = node.get("meta")?;

    match platform {
        "owner" => Some("owner".to_string()),
        "telegram" => {
            let bot_id = meta.get("botId").and_then(|v| v.as_str()).filter(|s| !s.is_empty())?;
            Some(format!("telegram_{bot_id}"))
        }
        "slack" => {
            let user_id = meta.get("botUserId").and_then(|v| v.as_str()).filter(|s| !s.is_empty())?;
            Some(format!("slack_{user_id}"))
        }
        "whatsapp" => {
            let phone_id = meta.get("phoneNumberId").and_then(|v| v.as_str()).filter(|s| !s.is_empty())?;
            Some(format!("whatsapp_{phone_id}"))
        }
        "discord" => {
            let bot_id = meta.get("botId").and_then(|v| v.as_str()).filter(|s| !s.is_empty())?;
            Some(format!("discord_{bot_id}"))
        }
        "email" => {
            let username = meta.get("username").and_then(|v| v.as_str()).filter(|s| !s.is_empty())?;
            let imap_host = meta.get("imapHost").and_then(|v| v.as_str()).filter(|s| !s.is_empty())?;
            Some(format!("email_{username}@{imap_host}"))
        }
        _ => None,
    }
}

pub(crate) fn migrate_node_ids(canvas: &mut Value, paths: &Paths) -> bool {
    cmd_canvas_migrate::migrate_node_ids(canvas, paths)
}

pub(crate) fn parse_simple_command(input: &str) -> Option<super::cmd_canvas::ParseResult> {
    if input.starts_with('@') {
        let rest = &input[1..];
        let (agent, msg) = rest.split_once(char::is_whitespace).unwrap_or((rest, ""));
        return Some(super::cmd_canvas::ParseResult {
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

    if input.starts_with('#') {
        let rest = &input[1..];
        let (ws, msg) = rest.split_once(char::is_whitespace).unwrap_or((rest, ""));
        return Some(super::cmd_canvas::ParseResult {
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

pub(crate) fn resolve_owner_name() -> String {
    whoami::realname()
}

pub(crate) fn resolve_owner_photo() -> Option<String> {
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
            if let Ok(bytes) = std::fs::read(&path) {
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

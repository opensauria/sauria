use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::fs;

use crate::paths::Paths;

/// Flat struct with optional fields — serializes to the discriminated union
/// expected by the TypeScript side. Entries without a `transport` field
/// (written by older versions) default to `"remote"` on read.
#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PersonalMcpEntry {
    id: String,
    name: String,
    transport: String,
    connected_at: String,
    // stdio fields
    #[serde(skip_serializing_if = "Option::is_none")]
    command: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    args: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    env: Option<HashMap<String, String>>,
    // remote fields
    #[serde(skip_serializing_if = "Option::is_none")]
    url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    access_token: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tool_count: Option<u32>,
}

/// IntegrationInstance entry stored in graph.instances[]
#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct IntegrationInstance {
    id: String,
    integration_id: String,
    label: String,
    connected_at: String,
}

/// Payload sent by the renderer for `personal_mcp_connect`.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PersonalMcpConnectPayload {
    name: String,
    transport: String,
    command: Option<String>,
    args: Option<Vec<String>>,
    env: Option<HashMap<String, String>>,
    url: Option<String>,
    access_token: Option<String>,
}

fn read_personal_mcp(paths: &Paths) -> Vec<PersonalMcpEntry> {
    if !paths.canvas.exists() {
        return vec![];
    }
    fs::read_to_string(&paths.canvas)
        .ok()
        .and_then(|s| serde_json::from_str::<Value>(&s).ok())
        .and_then(|c| c.get("personalMcp").cloned())
        .and_then(|arr| {
            // Parse as array of Value first for backward compat
            let items = serde_json::from_value::<Vec<Value>>(arr).ok()?;
            let entries: Vec<PersonalMcpEntry> = items
                .into_iter()
                .filter_map(|mut v| {
                    // Backward compat: entries without transport default to remote
                    if v.get("transport").is_none() {
                        v.as_object_mut()?.insert(
                            "transport".to_string(),
                            Value::String("remote".to_string()),
                        );
                    }
                    serde_json::from_value(v).ok()
                })
                .collect();
            Some(entries)
        })
        .unwrap_or_default()
}

fn write_canvas(paths: &Paths, graph: &Value) {
    let _ = fs::write(
        &paths.canvas,
        serde_json::to_string_pretty(graph).unwrap_or_default(),
    );
}

fn read_canvas(paths: &Paths) -> Value {
    if paths.canvas.exists() {
        fs::read_to_string(&paths.canvas)
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or(Value::Object(Default::default()))
    } else {
        Value::Object(Default::default())
    }
}

#[tauri::command]
pub fn personal_mcp_list(paths: tauri::State<'_, Paths>) -> Vec<PersonalMcpEntry> {
    read_personal_mcp(&paths)
}

#[tauri::command]
pub fn personal_mcp_connect(
    payload: PersonalMcpConnectPayload,
    paths: tauri::State<'_, Paths>,
) -> Result<PersonalMcpEntry, String> {
    let name = payload.name.trim().to_string();
    if name.is_empty() {
        return Err("Name is required.".to_string());
    }

    // Validate transport-specific fields
    match payload.transport.as_str() {
        "stdio" => {
            let cmd = payload.command.as_deref().unwrap_or("").trim();
            if cmd.is_empty() {
                return Err("Command is required for stdio transport.".to_string());
            }
        }
        "remote" => {
            let url = payload.url.as_deref().unwrap_or("").trim();
            if url.is_empty() {
                return Err("URL is required for remote transport.".to_string());
            }
        }
        other => {
            return Err(format!("Unknown transport: {other}"));
        }
    }

    let id = name
        .to_lowercase()
        .replace(|c: char| !c.is_alphanumeric(), "-")
        .trim_matches('-')
        .to_string();

    if id.is_empty() {
        return Err("Invalid name.".to_string());
    }

    let mut entries = read_personal_mcp(&paths);

    if entries.iter().any(|e| e.id == id) {
        return Err(format!("An MCP server named '{name}' already exists."));
    }

    let connected_at = chrono::Utc::now().to_rfc3339();

    let entry = PersonalMcpEntry {
        id: id.clone(),
        name: name.clone(),
        transport: payload.transport,
        connected_at: connected_at.clone(),
        command: payload.command.map(|s| s.trim().to_string()),
        args: payload.args,
        env: payload.env,
        url: payload.url.map(|s| s.trim().to_string()),
        access_token: payload.access_token,
        tool_count: None,
    };

    entries.push(entry.clone());

    // Single atomic write: personalMcp + instance in one canvas.json update
    let instance = IntegrationInstance {
        id: format!("personal:{id}"),
        integration_id: "personal-mcp".to_string(),
        label: name,
        connected_at,
    };
    let mut graph = read_canvas(&paths);
    graph["personalMcp"] = serde_json::to_value(&entries).unwrap_or(Value::Array(vec![]));
    // Add instance
    let instances = graph.get_mut("instances").and_then(|v| v.as_array_mut());
    match instances {
        Some(arr) => {
            arr.retain(|v| v.get("id").and_then(|i| i.as_str()) != Some(&instance.id));
            arr.push(serde_json::to_value(&instance).unwrap());
        }
        None => {
            graph["instances"] = serde_json::to_value(vec![&instance]).unwrap();
        }
    }
    write_canvas(&paths, &graph);

    Ok(entry)
}

/// Payload for updating an existing personal MCP server.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PersonalMcpUpdatePayload {
    id: String,
    name: Option<String>,
    command: Option<String>,
    args: Option<Vec<String>>,
    env: Option<HashMap<String, String>>,
    url: Option<String>,
    access_token: Option<String>,
}

#[tauri::command]
pub fn personal_mcp_update(
    payload: PersonalMcpUpdatePayload,
    paths: tauri::State<'_, Paths>,
) -> Result<PersonalMcpEntry, String> {
    let mut entries = read_personal_mcp(&paths);
    let entry = entries
        .iter_mut()
        .find(|e| e.id == payload.id)
        .ok_or_else(|| format!("No personal MCP server with id '{}' found.", payload.id))?;

    if let Some(name) = &payload.name {
        let trimmed = name.trim().to_string();
        if trimmed.is_empty() {
            return Err("Name cannot be empty.".to_string());
        }
        entry.name = trimmed;
    }
    if let Some(command) = &payload.command {
        entry.command = Some(command.trim().to_string());
    }
    if let Some(args) = &payload.args {
        entry.args = Some(args.clone());
    }
    if payload.env.is_some() {
        entry.env = payload.env.clone();
    }
    if let Some(url) = &payload.url {
        entry.url = Some(url.trim().to_string());
    }
    if payload.access_token.is_some() {
        entry.access_token = payload.access_token.clone();
    }

    let updated = entry.clone();

    // Update instance label if name changed
    let instance_id = format!("personal:{}", payload.id);
    let mut graph = read_canvas(&paths);
    graph["personalMcp"] = serde_json::to_value(&entries).unwrap_or(Value::Array(vec![]));
    if let Some(arr) = graph.get_mut("instances").and_then(|v| v.as_array_mut()) {
        for v in arr.iter_mut() {
            if v.get("id").and_then(|i| i.as_str()) == Some(instance_id.as_str()) {
                if let Some(obj) = v.as_object_mut() {
                    obj.insert("label".to_string(), Value::String(updated.name.clone()));
                }
            }
        }
    }
    write_canvas(&paths, &graph);

    Ok(updated)
}

#[tauri::command]
pub fn personal_mcp_disconnect(
    id: String,
    paths: tauri::State<'_, Paths>,
) -> Result<(), String> {
    let mut entries = read_personal_mcp(&paths);
    let before = entries.len();
    entries.retain(|e| e.id != id);
    if entries.len() == before {
        return Err(format!("No personal MCP server with id '{id}' found."));
    }

    // Single atomic write: remove personalMcp entry + instance together
    let instance_id = format!("personal:{id}");
    let mut graph = read_canvas(&paths);
    graph["personalMcp"] = serde_json::to_value(&entries).unwrap_or(Value::Array(vec![]));
    if let Some(arr) = graph.get_mut("instances").and_then(|v| v.as_array_mut()) {
        arr.retain(|v| v.get("id").and_then(|i| i.as_str()) != Some(instance_id.as_str()));
    }
    write_canvas(&paths, &graph);

    Ok(())
}

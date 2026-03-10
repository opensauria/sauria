use serde_json::Value;
use std::fs;
use std::sync::Arc;
use tokio::sync::Mutex;

use crate::cmd_channels_connect;
use crate::cmd_channels_disconnect;
use crate::cmd_channels_email;
use crate::cmd_channels_generic;
use crate::cmd_channels_telegram;
use crate::daemon_manager::{self, DaemonState};
use crate::paths::Paths;
use crate::vault;

// ─── Shared Types ────────────────────────────────────────────────────

pub(crate) struct ConnectionResult {
    pub(crate) node_id: String,
    pub(crate) display_name: String,
    pub(crate) extra: Value,
    pub(crate) vault_entries: Vec<(String, String)>,
    pub(crate) config_patch: Option<(String, Value)>,
    pub(crate) profile: Option<Value>,
}

pub(crate) type ValidateFn = for<'a> fn(
    &'a Value,
    &'a reqwest::Client,
) -> std::pin::Pin<
    Box<dyn std::future::Future<Output = Result<ConnectionResult, Value>> + Send + 'a>,
>;

// ─── JSON File Helpers ───────────────────────────────────────────────

pub(crate) fn read_config(paths: &Paths) -> Value {
    if !paths.config.exists() {
        return Value::Object(Default::default());
    }
    fs::read_to_string(&paths.config)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or(Value::Object(Default::default()))
}

pub(crate) fn write_config(paths: &Paths, config: &Value) {
    let _ = fs::write(
        &paths.config,
        serde_json::to_string_pretty(config).unwrap_or_default(),
    );
}

pub fn read_profiles(paths: &Paths) -> Value {
    if !paths.bot_profiles.exists() {
        return Value::Object(Default::default());
    }
    fs::read_to_string(&paths.bot_profiles)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or(Value::Object(Default::default()))
}

pub fn write_profiles(paths: &Paths, profiles: &Value) {
    let _ = fs::write(
        &paths.bot_profiles,
        serde_json::to_string_pretty(profiles).unwrap_or_default(),
    );
}

// ─── Shared Helpers ──────────────────────────────────────────────────

pub(crate) fn build_http_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| e.to_string())
}

pub(crate) fn extract_required_creds(creds: &Value, keys: &[&str], error_msg: &str) -> Result<Vec<String>, Value> {
    let values: Vec<String> = keys
        .iter()
        .map(|k| creds.get(*k).and_then(|v| v.as_str()).unwrap_or("").to_string())
        .collect();

    if values.iter().any(|v| v.is_empty()) {
        return Err(serde_json::json!({"success": false, "error": error_msg}));
    }

    Ok(values)
}

pub(crate) async fn finalize_connection(
    result: &ConnectionResult,
    creds: &Value,
    paths: &Paths,
    daemon_state: &Arc<Mutex<DaemonState>>,
) -> Result<(), String> {
    let old_node_id = creds.get("nodeId").and_then(|v| v.as_str()).unwrap_or("");

    for (key, value) in &result.vault_entries {
        vault::vault_store(paths, key, value)?;
    }

    if !old_node_id.is_empty() && old_node_id != result.node_id {
        let _ = vault::vault_delete(paths, &format!("channel_token_{old_node_id}"));
    }

    if let Some(profile) = &result.profile {
        let mut profiles = read_profiles(paths);
        if let Some(obj) = profiles.as_object_mut() {
            obj.insert(result.node_id.clone(), profile.clone());
        }
        write_profiles(paths, &profiles);
    }

    if let Some((platform, patch)) = &result.config_patch {
        let mut config = read_config(paths);
        if let Some(obj) = config.as_object_mut() {
            let channels = obj.entry("channels").or_insert(Value::Object(Default::default()));
            if let Some(ch) = channels.as_object_mut() {
                ch.insert(platform.clone(), patch.clone());
            }
        }
        write_config(paths, &config);
    }

    // Update canvas node status so get_*_status commands return fresh data
    update_canvas_node(paths, result);

    daemon_manager::restart_daemon(daemon_state, paths).await;
    Ok(())
}

fn update_canvas_node(paths: &Paths, result: &ConnectionResult) {
    if !paths.canvas.exists() {
        return;
    }
    let Ok(content) = fs::read_to_string(&paths.canvas) else {
        return;
    };
    let Ok(mut graph) = serde_json::from_str::<Value>(&content) else {
        return;
    };
    let Some(nodes) = graph.get_mut("nodes").and_then(|n| n.as_array_mut()) else {
        return;
    };

    // Find by deterministic node_id OR by old temp nodeId from credentials
    let node = nodes.iter_mut().find(|n| {
        n.get("id").and_then(|v| v.as_str()) == Some(&result.node_id)
    });

    if let Some(node) = node {
        node["status"] = Value::String("connected".to_string());
        node["label"] = Value::String(result.display_name.clone());
        if let Some(extra) = result.extra.as_object() {
            let meta = node.get("meta").cloned().unwrap_or(Value::Object(Default::default()));
            let mut meta_obj = meta.as_object().cloned().unwrap_or_default();
            for (k, v) in extra {
                meta_obj.insert(k.clone(), v.clone());
            }
            node["meta"] = Value::Object(meta_obj);
        }
        let _ = fs::write(
            &paths.canvas,
            serde_json::to_string_pretty(&graph).unwrap_or_default(),
        );
    }
}

pub(crate) fn build_success_response(result: &ConnectionResult) -> Value {
    let mut response = serde_json::json!({
        "success": true,
        "nodeId": result.node_id,
        "displayName": result.display_name,
    });
    if let Some(obj) = result.extra.as_object() {
        for (k, v) in obj {
            response[k] = v.clone();
        }
    }
    response
}

// ─── Tauri Commands ──────────────────────────────────────────────────

#[tauri::command]
pub async fn connect_channel(
    platform: String,
    credentials: Value,
    paths: tauri::State<'_, Paths>,
    daemon_state: tauri::State<'_, Arc<Mutex<DaemonState>>>,
) -> Result<Value, String> {
    match platform.as_str() {
        "telegram" => cmd_channels_telegram::connect_telegram(&credentials, &paths, &daemon_state).await,
        "slack" => cmd_channels_connect::connect_slack(&credentials, &paths, &daemon_state).await,
        "whatsapp" => cmd_channels_connect::connect_whatsapp(&credentials, &paths, &daemon_state).await,
        "discord" => cmd_channels_connect::connect_discord(&credentials, &paths, &daemon_state).await,
        "email" => cmd_channels_email::connect_email(&credentials, &paths, &daemon_state).await,
        "teams" => cmd_channels_generic::connect_generic_api(&credentials, &paths, &daemon_state, cmd_channels_generic::validate_teams).await,
        "messenger" => cmd_channels_generic::connect_generic_api(&credentials, &paths, &daemon_state, cmd_channels_generic::validate_messenger).await,
        "line" => cmd_channels_generic::connect_generic_api(&credentials, &paths, &daemon_state, cmd_channels_generic::validate_line).await,
        "google-chat" => cmd_channels_generic::connect_generic_api(&credentials, &paths, &daemon_state, cmd_channels_generic::validate_google_chat).await,
        "twilio" => cmd_channels_generic::connect_generic_api(&credentials, &paths, &daemon_state, cmd_channels_generic::validate_twilio).await,
        "matrix" => cmd_channels_generic::connect_generic_api(&credentials, &paths, &daemon_state, cmd_channels_generic::validate_matrix).await,
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

#[tauri::command]
pub async fn disconnect_channel(
    platform: String,
    node_id: String,
    paths: tauri::State<'_, Paths>,
    daemon_state: tauri::State<'_, Arc<Mutex<DaemonState>>>,
) -> Result<Value, String> {
    cmd_channels_disconnect::disconnect(&platform, &node_id, &paths, &daemon_state).await
}

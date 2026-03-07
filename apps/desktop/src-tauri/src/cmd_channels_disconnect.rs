use serde_json::Value;
use std::fs;
use std::sync::Arc;
use tokio::sync::Mutex;

use crate::cmd_channels::{read_config, read_profiles, write_config, write_profiles};
use crate::daemon_manager::{self, DaemonState};
use crate::paths::Paths;
use crate::vault;

pub(crate) async fn disconnect(
    platform: &str,
    node_id: &str,
    paths: &Paths,
    daemon_state: &Arc<Mutex<DaemonState>>,
) -> Result<Value, String> {
    daemon_manager::stop_daemon(daemon_state, paths).await;

    let mut vault_names = vec![format!("channel_token_{node_id}")];
    if platform == "slack" {
        vault_names.push(format!("channel_signing_{node_id}"));
    }
    for name in &vault_names {
        let _ = vault::vault_delete(paths, name);
    }

    let mut profiles = read_profiles(paths);
    if let Some(obj) = profiles.as_object_mut() {
        obj.remove(node_id);
    }
    write_profiles(paths, &profiles);

    reset_canvas_node(paths, platform, node_id);

    let mut config = read_config(paths);
    if let Some(obj) = config.as_object_mut() {
        if let Some(channels) = obj.get_mut("channels").and_then(|c| c.as_object_mut()) {
            match platform {
                "telegram" => {
                    channels.insert(
                        "telegram".to_string(),
                        serde_json::json!({"enabled": false, "allowedUserIds": []}),
                    );
                }
                other => {
                    channels.insert(other.to_string(), serde_json::json!({"enabled": false}));
                }
            }
        }
    }
    write_config(paths, &config);

    let _ = daemon_manager::start_daemon(daemon_state, paths).await;

    Ok(serde_json::json!({"success": true}))
}

fn reset_canvas_node(paths: &Paths, platform: &str, node_id: &str) {
    if !paths.canvas.exists() {
        return;
    }

    let content = match fs::read_to_string(&paths.canvas) {
        Ok(c) => c,
        Err(_) => return,
    };

    let mut canvas: Value = match serde_json::from_str(&content) {
        Ok(c) => c,
        Err(_) => return,
    };

    if let Some(nodes) = canvas.get_mut("nodes").and_then(|n| n.as_array_mut()) {
        for node in nodes.iter_mut() {
            if node.get("id").and_then(|v| v.as_str()) == Some(node_id) {
                node["status"] = Value::String("setup".to_string());
                node["photo"] = Value::Null;
                node["label"] = Value::String(format!(
                    "{}{}",
                    &platform[..1].to_uppercase(),
                    &platform[1..]
                ));
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

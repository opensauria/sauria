use serde_json::Value;
use std::collections::{HashMap, HashSet};
use std::fs;

use crate::cmd_channels;
use crate::paths::Paths;
use crate::vault;

pub(crate) fn migrate_node_ids(canvas: &mut Value, paths: &Paths) -> bool {
    let mut mappings: HashMap<String, String> = HashMap::new();

    let nodes = match canvas.get("nodes").and_then(|n| n.as_array()) {
        Some(nodes) => nodes.clone(),
        None => return false,
    };

    let mut used_ids: HashSet<String> = HashSet::new();
    for node in &nodes {
        if let Some(id) = node.get("id").and_then(|v| v.as_str()) {
            used_ids.insert(id.to_string());
        }
    }

    for node in &nodes {
        let old_id = match node.get("id").and_then(|v| v.as_str()) {
            Some(id) => id.to_string(),
            None => continue,
        };

        let status = node.get("status").and_then(|v| v.as_str()).unwrap_or("");
        let platform = node.get("platform").and_then(|v| v.as_str()).unwrap_or("");

        if platform == "owner" {
            if old_id != "owner" {
                mappings.insert(old_id, "owner".to_string());
            }
            continue;
        }

        if status != "connected" {
            continue;
        }

        let new_id = match super::cmd_canvas_helpers::compute_deterministic_id(node) {
            Some(id) => id,
            None => continue,
        };

        if old_id == new_id {
            continue;
        }

        if used_ids.contains(&new_id) && !mappings.values().any(|v| v == &new_id) {
            continue;
        }

        mappings.insert(old_id, new_id);
    }

    if mappings.is_empty() {
        return false;
    }

    apply_node_mappings(canvas, &mappings);
    apply_edge_mappings(canvas, &mappings);
    migrate_vault_and_profiles(&mappings, paths);

    let sidecar_path = paths.home.join("node-id-migrations.json");
    let _ = fs::write(
        &sidecar_path,
        serde_json::to_string_pretty(&mappings).unwrap_or_default(),
    );

    true
}

fn apply_node_mappings(canvas: &mut Value, mappings: &HashMap<String, String>) {
    if let Some(nodes) = canvas.get_mut("nodes").and_then(|n| n.as_array_mut()) {
        for node in nodes.iter_mut() {
            let old_id = match node.get("id").and_then(|v| v.as_str()) {
                Some(id) => id.to_string(),
                None => continue,
            };
            if let Some(new_id) = mappings.get(&old_id) {
                node["id"] = Value::String(new_id.clone());
                if let Some(creds) = node.get("credentials").and_then(|v| v.as_str()) {
                    let updated = creds.replace(&old_id, new_id);
                    node["credentials"] = Value::String(updated);
                }
            }
        }
    }
}

pub(crate) fn apply_edge_mappings(canvas: &mut Value, mappings: &HashMap<String, String>) {
    if let Some(edges) = canvas.get_mut("edges").and_then(|n| n.as_array_mut()) {
        for edge in edges.iter_mut() {
            if let Some(from) = edge.get("from").and_then(|v| v.as_str()) {
                if let Some(new_id) = mappings.get(from) {
                    edge["from"] = Value::String(new_id.clone());
                }
            }
            if let Some(to) = edge.get("to").and_then(|v| v.as_str()) {
                if let Some(new_id) = mappings.get(to) {
                    edge["to"] = Value::String(new_id.clone());
                }
            }
        }
    }
}

fn migrate_vault_and_profiles(mappings: &HashMap<String, String>, paths: &Paths) {
    let mut profiles = cmd_channels::read_profiles(paths);
    let mut profiles_changed = false;

    for (old_id, new_id) in mappings {
        if vault::vault_exists(paths, &format!("channel_token_{old_id}")) {
            let _ = vault::vault_rename(
                paths,
                &format!("channel_token_{old_id}"),
                &format!("channel_token_{new_id}"),
            );
        }
        if vault::vault_exists(paths, &format!("channel_signing_{old_id}")) {
            let _ = vault::vault_rename(
                paths,
                &format!("channel_signing_{old_id}"),
                &format!("channel_signing_{new_id}"),
            );
        }

        if let Some(obj) = profiles.as_object_mut() {
            if let Some(profile) = obj.remove(old_id) {
                obj.insert(new_id.clone(), profile);
                profiles_changed = true;
            }
        }
    }

    if profiles_changed {
        cmd_channels::write_profiles(paths, &profiles);
    }
}

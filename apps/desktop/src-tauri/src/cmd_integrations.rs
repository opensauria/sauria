use serde_json::Value;
use std::sync::Arc;

use crate::daemon_client::DaemonClient;

#[tauri::command]
pub async fn integrations_list_catalog(
    client: tauri::State<'_, Arc<DaemonClient>>,
) -> Result<Value, String> {
    client
        .request("integrations:list-catalog", Value::Object(Default::default()))
        .await
}

#[tauri::command]
pub async fn integrations_connect(
    id: String,
    credentials: Value,
    client: tauri::State<'_, Arc<DaemonClient>>,
) -> Result<Value, String> {
    client
        .request(
            "integrations:connect",
            serde_json::json!({ "id": id, "credentials": credentials }),
        )
        .await
}

#[tauri::command]
pub async fn integrations_disconnect(
    id: String,
    client: tauri::State<'_, Arc<DaemonClient>>,
) -> Result<Value, String> {
    client
        .request("integrations:disconnect", serde_json::json!({ "id": id }))
        .await
}

#[tauri::command]
pub async fn integrations_list_tools(
    integration_id: Option<String>,
    client: tauri::State<'_, Arc<DaemonClient>>,
) -> Result<Value, String> {
    let params = match integration_id {
        Some(id) => serde_json::json!({ "integrationId": id }),
        None => Value::Object(Default::default()),
    };
    client.request("integrations:list-tools", params).await
}

#[tauri::command]
pub async fn integrations_connect_instance(
    instance_id: String,
    integration_id: String,
    label: String,
    credentials: Value,
    client: tauri::State<'_, Arc<DaemonClient>>,
) -> Result<Value, String> {
    client
        .request(
            "integrations:connect-instance",
            serde_json::json!({
                "instanceId": instance_id,
                "integrationId": integration_id,
                "label": label,
                "credentials": credentials
            }),
        )
        .await
}

#[tauri::command]
pub async fn integrations_disconnect_instance(
    instance_id: String,
    client: tauri::State<'_, Arc<DaemonClient>>,
) -> Result<Value, String> {
    client
        .request(
            "integrations:disconnect-instance",
            serde_json::json!({ "instanceId": instance_id }),
        )
        .await
}

#[tauri::command]
pub async fn integrations_assign_instance(
    node_id: String,
    instance_id: String,
    client: tauri::State<'_, Arc<DaemonClient>>,
) -> Result<Value, String> {
    client
        .request(
            "integrations:assign-instance",
            serde_json::json!({ "nodeId": node_id, "instanceId": instance_id }),
        )
        .await
}

#[tauri::command]
pub async fn integrations_unassign_instance(
    node_id: String,
    instance_id: String,
    client: tauri::State<'_, Arc<DaemonClient>>,
) -> Result<Value, String> {
    client
        .request(
            "integrations:unassign-instance",
            serde_json::json!({ "nodeId": node_id, "instanceId": instance_id }),
        )
        .await
}

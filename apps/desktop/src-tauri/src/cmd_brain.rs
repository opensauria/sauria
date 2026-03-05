use serde::Deserialize;
use serde_json::Value;
use std::sync::Arc;

use crate::daemon_client::DaemonClient;

#[derive(Deserialize)]
pub struct ListEntitiesOpts {
    #[serde(rename = "type")]
    entity_type: Option<String>,
    search: Option<String>,
    offset: Option<u64>,
    limit: Option<u64>,
}

#[tauri::command]
pub async fn brain_list_entities(
    opts: ListEntitiesOpts,
    client: tauri::State<'_, Arc<DaemonClient>>,
) -> Result<Value, String> {
    let params = serde_json::json!({
        "type": opts.entity_type,
        "search": opts.search,
        "offset": opts.offset,
        "limit": opts.limit,
    });
    client.request("brain:list-entities", params).await
}

#[tauri::command]
pub async fn brain_get_entity(
    id: String,
    client: tauri::State<'_, Arc<DaemonClient>>,
) -> Result<Value, String> {
    client.request("brain:get-entity", serde_json::json!({"id": id})).await
}

#[derive(Deserialize)]
pub struct ListRelationsOpts {
    #[serde(rename = "type")]
    rel_type: Option<String>,
    offset: Option<u64>,
    limit: Option<u64>,
}

#[tauri::command]
pub async fn brain_list_relations(
    opts: ListRelationsOpts,
    client: tauri::State<'_, Arc<DaemonClient>>,
) -> Result<Value, String> {
    let params = serde_json::json!({
        "type": opts.rel_type,
        "offset": opts.offset,
        "limit": opts.limit,
    });
    client.request("brain:list-relations", params).await
}

#[derive(Deserialize)]
pub struct ListObservationsOpts {
    #[serde(rename = "type")]
    obs_type: Option<String>,
    search: Option<String>,
    offset: Option<u64>,
    limit: Option<u64>,
}

#[tauri::command]
pub async fn brain_list_observations(
    opts: ListObservationsOpts,
    client: tauri::State<'_, Arc<DaemonClient>>,
) -> Result<Value, String> {
    let params = serde_json::json!({
        "type": opts.obs_type,
        "search": opts.search,
        "offset": opts.offset,
        "limit": opts.limit,
    });
    client.request("brain:list-observations", params).await
}

#[derive(Deserialize)]
pub struct ListEventsOpts {
    source: Option<String>,
    offset: Option<u64>,
    limit: Option<u64>,
}

#[tauri::command]
pub async fn brain_list_events(
    opts: ListEventsOpts,
    client: tauri::State<'_, Arc<DaemonClient>>,
) -> Result<Value, String> {
    let params = serde_json::json!({
        "source": opts.source,
        "offset": opts.offset,
        "limit": opts.limit,
    });
    client.request("brain:list-events", params).await
}

#[derive(Deserialize)]
pub struct ListConversationsOpts {
    platform: Option<String>,
    offset: Option<u64>,
    limit: Option<u64>,
}

#[tauri::command]
pub async fn brain_list_conversations(
    opts: ListConversationsOpts,
    client: tauri::State<'_, Arc<DaemonClient>>,
) -> Result<Value, String> {
    let params = serde_json::json!({
        "platform": opts.platform,
        "offset": opts.offset,
        "limit": opts.limit,
    });
    client.request("brain:list-conversations", params).await
}

#[derive(Deserialize)]
pub struct GetConversationOpts {
    offset: Option<u64>,
    limit: Option<u64>,
}

#[tauri::command]
pub async fn brain_get_conversation(
    id: String,
    opts: GetConversationOpts,
    client: tauri::State<'_, Arc<DaemonClient>>,
) -> Result<Value, String> {
    let params = serde_json::json!({
        "id": id,
        "offset": opts.offset,
        "limit": opts.limit,
    });
    client.request("brain:get-conversation", params).await
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListFactsOpts {
    node_id: Option<String>,
    workspace_id: Option<String>,
    offset: Option<u64>,
    limit: Option<u64>,
}

#[tauri::command]
pub async fn brain_list_facts(
    opts: ListFactsOpts,
    client: tauri::State<'_, Arc<DaemonClient>>,
) -> Result<Value, String> {
    let params = serde_json::json!({
        "nodeId": opts.node_id,
        "workspaceId": opts.workspace_id,
        "offset": opts.offset,
        "limit": opts.limit,
    });
    client.request("brain:list-facts", params).await
}

#[tauri::command]
pub async fn brain_get_stats(
    client: tauri::State<'_, Arc<DaemonClient>>,
) -> Result<Value, String> {
    client.request("brain:get-stats", Value::Object(Default::default())).await
}

#[tauri::command]
pub async fn brain_delete(
    table: String,
    id: String,
    client: tauri::State<'_, Arc<DaemonClient>>,
) -> Result<Value, String> {
    client.request("brain:delete", serde_json::json!({"table": table, "id": id})).await
}

#[derive(Deserialize)]
pub struct UpdateEntityFields {
    name: Option<String>,
    summary: Option<String>,
    #[serde(rename = "type")]
    entity_type: Option<String>,
}

#[tauri::command]
pub async fn brain_update_entity(
    id: String,
    fields: UpdateEntityFields,
    client: tauri::State<'_, Arc<DaemonClient>>,
) -> Result<Value, String> {
    let mut field_map = serde_json::Map::new();
    if let Some(name) = fields.name {
        field_map.insert("name".to_string(), Value::String(name));
    }
    if let Some(summary) = fields.summary {
        field_map.insert("summary".to_string(), Value::String(summary));
    }
    if let Some(t) = fields.entity_type {
        field_map.insert("type".to_string(), Value::String(t));
    }

    client
        .request(
            "brain:update-entity",
            serde_json::json!({"id": id, "fields": field_map}),
        )
        .await
}

#[tauri::command]
pub async fn get_agent_kpis(
    node_id: String,
    client: tauri::State<'_, Arc<DaemonClient>>,
) -> Result<Value, String> {
    client
        .request("kpi:get", serde_json::json!({"nodeId": node_id}))
        .await
}

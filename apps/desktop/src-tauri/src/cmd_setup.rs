use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fs;
use std::sync::Arc;
use tokio::sync::Mutex;

use crate::cmd_setup_helpers;
use crate::daemon_manager::{self, DaemonState};
use crate::paths::Paths;
use crate::vault;
use crate::windows;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StatusResult {
    configured: bool,
    config_path: String,
    home: String,
    provider: Option<String>,
    auth_method: Option<String>,
    connected: bool,
}

#[tauri::command]
pub fn get_status(paths: tauri::State<'_, Paths>) -> StatusResult {
    let (provider, auth_method) = cmd_setup_helpers::detect_provider(&paths);
    let has_oauth_token = vault::vault_exists(&paths, "anthropic-oauth");
    let configured = daemon_manager::is_configured(&paths);

    StatusResult {
        configured,
        config_path: paths.config.to_string_lossy().to_string(),
        home: paths.home.to_string_lossy().to_string(),
        provider,
        auth_method,
        connected: has_oauth_token || configured,
    }
}

const DEFAULT_AUTH_PROXY_URL: &str = "https://auth.sauria.dev";

#[tauri::command]
pub fn get_auth_proxy_url(paths: tauri::State<'_, Paths>) -> String {
    if let Ok(content) = fs::read_to_string(&paths.config) {
        if let Ok(config) = serde_json::from_str::<Value>(&content) {
            if let Some(url) = config.get("authProxyUrl").and_then(|v| v.as_str()) {
                return url.to_string();
            }
        }
    }
    DEFAULT_AUTH_PROXY_URL.to_string()
}

#[tauri::command]
pub fn detect_clients() -> Vec<cmd_setup_helpers::McpClientInfo> {
    cmd_setup_helpers::detect_mcp_clients()
}

#[tauri::command]
pub async fn detect_local_providers() -> Vec<cmd_setup_helpers::LocalProviderInfo> {
    cmd_setup_helpers::probe_local_providers().await
}

#[tauri::command]
pub async fn validate_key(provider: String, api_key: String) -> cmd_setup_helpers::ValidateResult {
    cmd_setup_helpers::validate_api_key(&provider, &api_key).await
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfigureOpts {
    pub(crate) mode: String,
    pub(crate) provider: String,
    pub(crate) api_key: String,
    pub(crate) local_base_url: String,
}

#[tauri::command]
pub async fn configure(opts: ConfigureOpts, paths: tauri::State<'_, Paths>) -> Result<cmd_setup_helpers::ConfigureResult, String> {
    cmd_setup_helpers::run_configure(&opts, &paths)
}

#[tauri::command]
pub fn open_external(url: String) -> Result<(), String> {
    if !url.starts_with("https://") {
        return Err("Only HTTPS URLs allowed".to_string());
    }
    open::that(&url).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn hide_palette(app: tauri::AppHandle) -> Result<(), String> {
    windows::hide_palette(&app)
}

#[tauri::command]
pub fn navigate_back(app: tauri::AppHandle) -> Result<(), String> {
    windows::navigate_palette_back(&app)
}

#[tauri::command]
pub fn get_daemon_status(
    _daemon_state: tauri::State<'_, Arc<Mutex<DaemonState>>>,
    paths: tauri::State<'_, Paths>,
) -> Value {
    let running = daemon_manager::is_daemon_running_by_pid(&paths);
    serde_json::json!({ "running": running })
}

#[tauri::command]
pub async fn start_daemon_cmd(
    daemon_state: tauri::State<'_, Arc<Mutex<DaemonState>>>,
    paths: tauri::State<'_, Paths>,
) -> Result<Value, String> {
    daemon_manager::start_daemon(&daemon_state, &paths).await?;
    Ok(serde_json::json!({ "running": true }))
}

#[tauri::command]
pub async fn stop_daemon_cmd(
    daemon_state: tauri::State<'_, Arc<Mutex<DaemonState>>>,
    paths: tauri::State<'_, Paths>,
) -> Result<Value, String> {
    daemon_manager::stop_daemon(&daemon_state, &paths).await;
    Ok(serde_json::json!({ "running": false }))
}

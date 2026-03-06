use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fs;
use std::process::Command;
use std::sync::Arc;
use tokio::sync::Mutex;

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
    let mut provider: Option<String> = None;
    let mut auth_method: Option<String> = None;

    if paths.config.exists() {
        if let Ok(content) = fs::read_to_string(&paths.config) {
            if let Ok(config) = serde_json::from_str::<Value>(&content) {
                let auth = config.get("auth").and_then(|a| a.as_object());
                let anthropic_auth = auth.and_then(|a| a.get("anthropic")).and_then(|a| a.as_object());

                if anthropic_auth.and_then(|a| a.get("method")).and_then(|m| m.as_str()) == Some("oauth") {
                    provider = Some("Anthropic".to_string());
                    auth_method = Some("oauth".to_string());
                } else if let Some(p) = config
                    .get("models")
                    .and_then(|m| m.get("reasoning"))
                    .and_then(|r| r.get("provider"))
                    .and_then(|p| p.as_str())
                {
                    let mut name = p.to_string();
                    if let Some(first) = name.get_mut(..1) {
                        first.make_ascii_uppercase();
                    }
                    provider = Some(name);
                    auth_method = Some("api_key".to_string());
                }
            }
        }
    }

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

const DEFAULT_AUTH_PROXY_URL: &str = "https://auth.sauria.app";

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

#[derive(Serialize)]
pub struct McpClientInfo {
    name: String,
    detected: bool,
}

#[tauri::command]
pub fn detect_clients() -> Vec<McpClientInfo> {
    let home = dirs::home_dir().unwrap_or_default();

    let mut clients = Vec::new();

    #[cfg(target_os = "macos")]
    {
        let claude_path = home
            .join("Library/Application Support/Claude/claude_desktop_config.json");
        clients.push(("Claude Desktop", claude_path));
    }

    #[cfg(target_os = "linux")]
    {
        let claude_path = home.join(".config/Claude/claude_desktop_config.json");
        clients.push(("Claude Desktop", claude_path));
    }

    #[cfg(target_os = "windows")]
    {
        let claude_path = home.join("AppData/Roaming/Claude/claude_desktop_config.json");
        clients.push(("Claude Desktop", claude_path));
    }

    let cursor_path = home.join(".cursor/mcp.json");
    clients.push(("Cursor", cursor_path));

    #[cfg(target_os = "macos")]
    let windsurf_path = home.join(".codeium/windsurf/mcp_config.json");
    #[cfg(not(target_os = "macos"))]
    let windsurf_path = home.join(".codeium/windsurf/mcp_config.json");

    clients.push(("Windsurf", windsurf_path));

    clients
        .into_iter()
        .map(|(name, path)| {
            let detected = path.exists()
                || path.parent().map(|p| p.exists()).unwrap_or(false);
            McpClientInfo {
                name: name.to_string(),
                detected,
            }
        })
        .collect()
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalProviderInfo {
    name: String,
    base_url: String,
    running: bool,
}

#[tauri::command]
pub async fn detect_local_providers() -> Vec<LocalProviderInfo> {
    let endpoints = [
        ("Ollama", "http://localhost:11434"),
        ("LM Studio", "http://localhost:1234"),
        ("Open WebUI", "http://localhost:3000"),
    ];

    let mut results = Vec::new();
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(2))
        .build()
        .unwrap_or_default();

    for (name, url) in endpoints {
        let running = client.get(url).send().await.map(|r| r.status().as_u16() < 500).unwrap_or(false);
        results.push(LocalProviderInfo {
            name: name.to_string(),
            base_url: url.to_string(),
            running,
        });
    }

    results
}

#[derive(Serialize)]
pub struct ValidateResult {
    valid: bool,
    error: Option<String>,
}

#[tauri::command]
pub async fn validate_key(provider: String, api_key: String) -> ValidateResult {
    let valid_providers = ["anthropic", "openai", "google", "ollama"];
    if !valid_providers.contains(&provider.as_str()) {
        return ValidateResult { valid: false, error: Some("Unknown provider".to_string()) };
    }

    let key_pattern = regex::Regex::new(r"^[A-Za-z0-9_\-.]+$").unwrap();
    if api_key.is_empty() || api_key.len() > 256 || !key_pattern.is_match(&api_key) {
        return ValidateResult { valid: false, error: Some("Invalid API key format".to_string()) };
    }

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .unwrap_or_default();

    match provider.as_str() {
        "anthropic" => {
            let body = serde_json::json!({
                "model": "claude-sonnet-4-5-20250929",
                "max_tokens": 1,
                "messages": [{"role": "user", "content": "hi"}]
            });
            match client
                .post("https://api.anthropic.com/v1/messages")
                .header("x-api-key", &api_key)
                .header("anthropic-version", "2023-06-01")
                .json(&body)
                .send()
                .await
            {
                Ok(res) => {
                    let status = res.status();
                    ValidateResult {
                        valid: status.is_success() || status.as_u16() == 400,
                        error: if status.is_success() { None } else { res.text().await.ok() },
                    }
                }
                Err(e) => ValidateResult { valid: false, error: Some(e.to_string()) },
            }
        }
        "openai" => match client
            .get("https://api.openai.com/v1/models")
            .bearer_auth(&api_key)
            .send()
            .await
        {
            Ok(res) => ValidateResult {
                valid: res.status().is_success(),
                error: if res.status().is_success() { None } else { res.text().await.ok() },
            },
            Err(e) => ValidateResult { valid: false, error: Some(e.to_string()) },
        },
        "google" => {
            let url = format!(
                "https://generativelanguage.googleapis.com/v1beta/models?key={api_key}"
            );
            match client.get(&url).send().await {
                Ok(res) => ValidateResult {
                    valid: res.status().is_success(),
                    error: if res.status().is_success() { None } else { res.text().await.ok() },
                },
                Err(e) => ValidateResult { valid: false, error: Some(e.to_string()) },
            }
        }
        _ => ValidateResult { valid: true, error: None },
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfigureOpts {
    mode: String,
    provider: String,
    api_key: String,
    local_base_url: String,
}

#[derive(Serialize)]
pub struct ConfigureStep {
    label: String,
    status: String,
}

#[derive(Serialize)]
pub struct ConfigureResult {
    steps: Vec<ConfigureStep>,
    registered: Vec<String>,
}

#[tauri::command]
pub async fn configure(opts: ConfigureOpts, paths: tauri::State<'_, Paths>) -> Result<ConfigureResult, String> {
    let mut steps = Vec::new();

    // Create directories
    for sub in ["logs", "tmp", "exports", "vault"] {
        let dir = paths.home.join(sub);
        match fs::create_dir_all(&dir) {
            Ok(_) => {}
            Err(e) => {
                steps.push(ConfigureStep {
                    label: "Directory structure".to_string(),
                    status: format!("error: {e}"),
                });
                return Ok(ConfigureResult { steps, registered: vec![] });
            }
        }
    }
    steps.push(ConfigureStep {
        label: "Directory structure".to_string(),
        status: "done".to_string(),
    });

    // Check CLI
    match Command::new("sauria").args(["doctor"]).output() {
        Ok(output) if output.status.success() => {
            steps.push(ConfigureStep {
                label: "CLI available".to_string(),
                status: "done".to_string(),
            });
        }
        _ => {
            steps.push(ConfigureStep {
                label: "CLI available".to_string(),
                status: "warning: sauria CLI not in PATH".to_string(),
            });
        }
    }

    // Write config
    let is_local = opts.mode == "local";
    let is_local_engine = ["ollama", "lm-studio", "open-webui"].contains(&opts.provider.as_str());

    let models = if is_local_engine {
        build_local_models(&opts.provider, &opts.local_base_url)
    } else {
        build_cloud_models(&opts.provider)
    };

    let has_oauth = vault::vault_exists(&paths, "anthropic-oauth");
    let auth_method = if is_local {
        "none"
    } else if opts.mode == "claude_desktop" {
        if has_oauth { "oauth" } else { "none" }
    } else {
        "encrypted_file"
    };

    let existing: Value = if paths.config.exists() {
        fs::read_to_string(&paths.config)
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or(Value::Object(Default::default()))
    } else {
        Value::Object(Default::default())
    };

    let config = serde_json::json!({
        "models": models,
        "auth": { opts.provider.clone(): { "method": auth_method } },
        "budget": { "dailyLimitUsd": 5, "warnAtUsd": 3, "preferCheap": true },
        "mcp": existing.get("mcp").cloned().unwrap_or(serde_json::json!({"servers": {}})),
        "channels": existing.get("channels").cloned().unwrap_or(serde_json::json!({"telegram": {"enabled": false, "allowedUserIds": []}})),
    });

    match fs::write(&paths.config, serde_json::to_string_pretty(&config).unwrap_or_default()) {
        Ok(_) => steps.push(ConfigureStep {
            label: "Configuration".to_string(),
            status: "done".to_string(),
        }),
        Err(e) => steps.push(ConfigureStep {
            label: "Configuration".to_string(),
            status: format!("error: {e}"),
        }),
    }

    if !opts.api_key.is_empty() && !is_local {
        steps.push(ConfigureStep {
            label: "Credentials stored".to_string(),
            status: "done".to_string(),
        });
    }

    Ok(ConfigureResult { steps, registered: vec![] })
}

fn build_cloud_models(provider: &str) -> Value {
    match provider {
        "anthropic" => serde_json::json!({
            "extraction": {"provider": "google", "model": "gemini-2.5-flash"},
            "reasoning": {"provider": "anthropic", "model": "claude-sonnet-4-5"},
            "deep": {"provider": "anthropic", "model": "claude-opus-4-6"},
            "embeddings": {"provider": "local", "model": "all-MiniLM-L6-v2"}
        }),
        "openai" => serde_json::json!({
            "extraction": {"provider": "openai", "model": "gpt-4o-mini"},
            "reasoning": {"provider": "openai", "model": "gpt-4o"},
            "deep": {"provider": "openai", "model": "gpt-4o"},
            "embeddings": {"provider": "local", "model": "all-MiniLM-L6-v2"}
        }),
        "google" => serde_json::json!({
            "extraction": {"provider": "google", "model": "gemini-2.5-flash"},
            "reasoning": {"provider": "google", "model": "gemini-2.5-pro"},
            "deep": {"provider": "google", "model": "gemini-2.5-pro"},
            "embeddings": {"provider": "local", "model": "all-MiniLM-L6-v2"}
        }),
        _ => build_cloud_models("anthropic"),
    }
}

fn build_local_models(engine: &str, base_url: &str) -> Value {
    if engine == "ollama" {
        serde_json::json!({
            "extraction": {"provider": "ollama", "model": "llama3.2", "baseUrl": base_url},
            "reasoning": {"provider": "ollama", "model": "llama3.2", "baseUrl": base_url},
            "deep": {"provider": "ollama", "model": "llama3.2", "baseUrl": base_url},
            "embeddings": {"provider": "local", "model": "all-MiniLM-L6-v2"}
        })
    } else {
        let model = if engine == "lm-studio" { "lm-studio" } else { "default" };
        serde_json::json!({
            "extraction": {"provider": "openai", "model": model, "baseUrl": base_url},
            "reasoning": {"provider": "openai", "model": model, "baseUrl": base_url},
            "deep": {"provider": "openai", "model": model, "baseUrl": base_url},
            "embeddings": {"provider": "local", "model": "all-MiniLM-L6-v2"}
        })
    }
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

use serde::Serialize;
use serde_json::Value;
use std::fs;
use std::process::Command;

use crate::cmd_setup::ConfigureOpts;
use crate::cmd_setup_models;
use crate::paths::Paths;
use crate::vault;

pub(crate) use crate::cmd_setup_validate::ValidateResult;

#[derive(Serialize)]
pub(crate) struct McpClientInfo {
    pub(crate) name: String,
    pub(crate) detected: bool,
}

pub(crate) fn detect_mcp_clients() -> Vec<McpClientInfo> {
    let home = dirs::home_dir().unwrap_or_default();
    let mut clients = Vec::new();

    #[cfg(target_os = "macos")]
    clients.push(("Claude Desktop", home.join("Library/Application Support/Claude/claude_desktop_config.json")));
    #[cfg(target_os = "linux")]
    clients.push(("Claude Desktop", home.join(".config/Claude/claude_desktop_config.json")));
    #[cfg(target_os = "windows")]
    clients.push(("Claude Desktop", home.join("AppData/Roaming/Claude/claude_desktop_config.json")));

    clients.push(("Cursor", home.join(".cursor/mcp.json")));
    clients.push(("Windsurf", home.join(".codeium/windsurf/mcp_config.json")));

    clients
        .into_iter()
        .map(|(name, path)| McpClientInfo {
            name: name.to_string(),
            detected: path.exists() || path.parent().map(|p| p.exists()).unwrap_or(false),
        })
        .collect()
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct LocalProviderInfo {
    pub(crate) name: String,
    pub(crate) base_url: String,
    pub(crate) running: bool,
}

pub(crate) async fn probe_local_providers() -> Vec<LocalProviderInfo> {
    let endpoints = [
        ("Ollama", "http://localhost:11434"),
        ("LM Studio", "http://localhost:1234"),
        ("Open WebUI", "http://localhost:3000"),
    ];

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(2))
        .build()
        .unwrap_or_default();

    let mut results = Vec::new();
    for (name, url) in endpoints {
        let running = client.get(url).send().await.map(|r| r.status().as_u16() < 500).unwrap_or(false);
        results.push(LocalProviderInfo { name: name.to_string(), base_url: url.to_string(), running });
    }
    results
}

pub(crate) async fn validate_api_key(provider: &str, api_key: &str) -> ValidateResult {
    crate::cmd_setup_validate::validate_api_key(provider, api_key).await
}

pub(crate) fn detect_provider(paths: &Paths) -> (Option<String>, Option<String>) {
    if !paths.config.exists() {
        return (None, None);
    }
    let content = match fs::read_to_string(&paths.config) {
        Ok(c) => c,
        Err(_) => return (None, None),
    };
    let config: Value = match serde_json::from_str(&content) {
        Ok(c) => c,
        Err(_) => return (None, None),
    };

    let auth = config.get("auth").and_then(|a| a.as_object());
    let anthropic_auth = auth.and_then(|a| a.get("anthropic")).and_then(|a| a.as_object());

    if anthropic_auth.and_then(|a| a.get("method")).and_then(|m| m.as_str()) == Some("oauth") {
        return (Some("Anthropic".to_string()), Some("oauth".to_string()));
    }

    if let Some(p) = config.get("models").and_then(|m| m.get("reasoning")).and_then(|r| r.get("provider")).and_then(|p| p.as_str()) {
        let mut name = p.to_string();
        if let Some(first) = name.get_mut(..1) {
            first.make_ascii_uppercase();
        }
        return (Some(name), Some("api_key".to_string()));
    }

    (None, None)
}

// ─── Configure ───────────────────────────────────────────────────────

#[derive(Serialize)]
pub(crate) struct ConfigureStep {
    label: String,
    status: String,
}

#[derive(Serialize)]
pub(crate) struct ConfigureResult {
    pub(crate) steps: Vec<ConfigureStep>,
    pub(crate) registered: Vec<String>,
}

pub(crate) fn run_configure(opts: &ConfigureOpts, paths: &Paths) -> Result<ConfigureResult, String> {
    let mut steps = Vec::new();

    for sub in ["logs", "tmp", "exports", "vault"] {
        if let Err(e) = fs::create_dir_all(paths.home.join(sub)) {
            steps.push(ConfigureStep { label: "Directory structure".to_string(), status: format!("error: {e}") });
            return Ok(ConfigureResult { steps, registered: vec![] });
        }
    }
    steps.push(ConfigureStep { label: "Directory structure".to_string(), status: "done".to_string() });

    match Command::new("sauria").args(["doctor"]).output() {
        Ok(output) if output.status.success() => steps.push(ConfigureStep { label: "CLI available".to_string(), status: "done".to_string() }),
        _ => steps.push(ConfigureStep { label: "CLI available".to_string(), status: "warning: sauria CLI not in PATH".to_string() }),
    }

    let is_local_engine = ["ollama", "lm-studio", "open-webui"].contains(&opts.provider.as_str());
    let models = if is_local_engine { cmd_setup_models::build_local_models(&opts.provider, &opts.local_base_url) } else { cmd_setup_models::build_cloud_models(&opts.provider) };
    let auth_method = resolve_auth_method(&opts.mode, &opts.provider, paths);

    let existing: Value = if paths.config.exists() {
        fs::read_to_string(&paths.config).ok().and_then(|s| serde_json::from_str(&s).ok()).unwrap_or(Value::Object(Default::default()))
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
        Ok(_) => steps.push(ConfigureStep { label: "Configuration".to_string(), status: "done".to_string() }),
        Err(e) => steps.push(ConfigureStep { label: "Configuration".to_string(), status: format!("error: {e}") }),
    }

    if !opts.api_key.is_empty() && opts.mode != "local" {
        steps.push(ConfigureStep { label: "Credentials stored".to_string(), status: "done".to_string() });
    }

    Ok(ConfigureResult { steps, registered: vec![] })
}

fn resolve_auth_method(mode: &str, provider: &str, paths: &Paths) -> &'static str {
    let is_local_engine = ["ollama", "lm-studio", "open-webui"].contains(&provider);
    if mode == "local" || is_local_engine {
        return "none";
    }
    if mode == "claude_desktop" {
        if vault::vault_exists(paths, "anthropic-oauth") { "oauth" } else { "none" }
    } else {
        "encrypted_file"
    }
}

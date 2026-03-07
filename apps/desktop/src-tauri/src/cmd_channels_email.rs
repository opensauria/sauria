use serde_json::Value;
use std::sync::Arc;
use tokio::sync::Mutex;

use crate::cmd_channels::{build_success_response, finalize_connection, ConnectionResult};
use crate::daemon_manager::DaemonState;
use crate::paths::Paths;

pub(crate) async fn connect_email(
    creds: &Value,
    paths: &Paths,
    daemon_state: &Arc<Mutex<DaemonState>>,
) -> Result<Value, String> {
    let imap_host = creds.get("imapHost").and_then(|v| v.as_str()).unwrap_or("");
    let username = creds.get("username").and_then(|v| v.as_str()).unwrap_or("");
    let password = creds.get("password").and_then(|v| v.as_str()).unwrap_or("");
    if imap_host.is_empty() || username.is_empty() || password.is_empty() {
        return Ok(serde_json::json!({"success": false, "error": "IMAP host, username, and password required"}));
    }

    let node_id = format!("email_{username}@{imap_host}");
    let smtp_host = creds.get("smtpHost").and_then(|v| v.as_str()).unwrap_or(imap_host);
    let imap_port = creds.get("imapPort").and_then(|v| v.as_u64()).unwrap_or(993);
    let smtp_port = creds.get("smtpPort").and_then(|v| v.as_u64()).unwrap_or(587);

    let result = ConnectionResult {
        node_id: node_id.clone(),
        display_name: username.to_string(),
        extra: Value::Object(Default::default()),
        vault_entries: vec![
            ("email_password".to_string(), password.to_string()),
            (format!("channel_token_{node_id}"), password.to_string()),
        ],
        config_patch: Some((
            "email".to_string(),
            serde_json::json!({
                "enabled": true,
                "imapHost": imap_host,
                "imapPort": imap_port,
                "smtpHost": smtp_host,
                "smtpPort": smtp_port,
                "username": username,
                "tls": true,
            }),
        )),
        profile: None,
    };

    finalize_connection(&result, creds, paths, daemon_state).await?;
    Ok(build_success_response(&result))
}

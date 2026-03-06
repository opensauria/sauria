use std::process::Command;
use std::sync::Arc;
use tokio::sync::Mutex;


use crate::daemon_manager::{self, DaemonState};
use crate::paths::Paths;
use crate::windows;

const ALLOWED_COMMANDS: &[&str] = &[
    "status", "telegram", "settings", "setup", "audit", "doctor", "docs", "quit", "canvas", "brain", "integrations",
];

#[tauri::command]
pub async fn execute_command(
    id: String,
    app: tauri::AppHandle,
    paths: tauri::State<'_, Paths>,
    _daemon_state: tauri::State<'_, Arc<Mutex<DaemonState>>>,
) -> Result<(), String> {
    if !ALLOWED_COMMANDS.contains(&id.as_str()) {
        return Ok(());
    }

    match id.as_str() {
        "status" => {
            let running = daemon_manager::is_daemon_running_by_pid(&paths);
            let status_label = if running { "Running" } else { "Stopped" };
            windows::send_command_result(&app, &format!("Daemon: {status_label}\n\nLoading details..."));

            match run_cli(&["status"]) {
                Ok(stdout) => {
                    windows::send_command_result(&app, &format!("Daemon: {status_label}\n\n{stdout}"));
                }
                Err(_) => {
                    windows::send_command_result(&app, &format!("Daemon: {status_label}\n\nCLI details unavailable."));
                }
            }
        }
        "audit" => {
            windows::send_command_result(&app, "Loading audit log...");
            match run_cli(&["audit", "10"]) {
                Ok(stdout) => windows::send_command_result(&app, &stdout),
                Err(_) => windows::send_command_result(&app, "CLI not available. Is sauria installed?"),
            }
        }
        "doctor" => {
            windows::send_command_result(&app, "Running health check...");
            match run_cli(&["doctor"]) {
                Ok(stdout) => windows::send_command_result(&app, &stdout),
                Err(_) => windows::send_command_result(&app, "CLI not available. Is sauria installed?"),
            }
        }
        "telegram" => {
            windows::navigate_palette_to(&app, "integrations")?;
        }
        "settings" | "canvas" => {
            windows::navigate_palette_to(&app, "canvas")?;
        }
        "setup" => {
            windows::navigate_palette_to(&app, "setup")?;
        }
        "brain" => {
            windows::navigate_palette_to(&app, "brain")?;
        }
        "integrations" => {
            windows::navigate_palette_to(&app, "integrations")?;
        }
        "docs" => {
            windows::hide_palette(&app)?;
            let _ = open::that("https://sauria.ai/docs");
        }
        "quit" => {
            app.exit(0);
        }
        _ => {}
    }

    Ok(())
}

fn run_cli(args: &[&str]) -> Result<String, String> {
    let output = Command::new("sauria")
        .args(args)
        .output()
        .map_err(|e| e.to_string())?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).trim().to_string())
    }
}

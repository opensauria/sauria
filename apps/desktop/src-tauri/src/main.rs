// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod cmd_brain;
mod cmd_canvas;
mod cmd_channels;
mod cmd_commands;
mod cmd_integrations;
mod cmd_oauth;
mod cmd_oauth_integrations;
mod cmd_setup;
mod daemon_client;
mod daemon_manager;
mod paths;
mod vault;
mod windows;

use daemon_client::DaemonClient;
use daemon_manager::DaemonState;
use paths::Paths;
use std::sync::Arc;
use tauri::Manager;
use tauri::path::BaseDirectory;
use tauri_plugin_deep_link::DeepLinkExt;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

fn main() {
    let paths = Paths::resolve();
    let daemon_state = Arc::new(tokio::sync::Mutex::new(DaemonState::new()));
    let daemon_client = Arc::new(DaemonClient::new(&paths));

    // Clone for health check
    let health_state = daemon_state.clone();
    let health_paths = Paths::resolve();

    tauri::Builder::default()
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_deep_link::init())
        .manage(paths)
        .manage(daemon_state.clone())
        .manage(daemon_client)
        .invoke_handler(tauri::generate_handler![
            // Setup
            cmd_setup::get_status,
            cmd_setup::detect_clients,
            cmd_setup::detect_local_providers,
            cmd_setup::validate_key,
            cmd_setup::configure,
            cmd_setup::open_external,
            cmd_setup::hide_palette,
            cmd_setup::navigate_back,
            cmd_setup::get_daemon_status,
            cmd_setup::start_daemon_cmd,
            cmd_setup::stop_daemon_cmd,
            // OAuth
            cmd_oauth::start_oauth,
            cmd_oauth::complete_oauth,
            // Canvas
            cmd_canvas::get_canvas_graph,
            cmd_canvas::save_canvas_graph,
            cmd_canvas::execute_owner_command,
            cmd_canvas::get_telegram_status,
            cmd_canvas::get_owner_profile,
            // Channels
            cmd_channels::connect_channel,
            cmd_channels::disconnect_channel,
            // Commands
            cmd_commands::execute_command,
            // Brain
            cmd_brain::brain_list_entities,
            cmd_brain::brain_get_entity,
            cmd_brain::brain_list_relations,
            cmd_brain::brain_list_observations,
            cmd_brain::brain_list_events,
            cmd_brain::brain_list_conversations,
            cmd_brain::brain_get_conversation,
            cmd_brain::brain_list_facts,
            cmd_brain::brain_get_stats,
            cmd_brain::brain_delete,
            cmd_brain::brain_update_entity,
            cmd_brain::get_agent_kpis,
            // Integrations
            cmd_integrations::integrations_list_catalog,
            cmd_integrations::integrations_connect,
            cmd_integrations::integrations_disconnect,
            cmd_integrations::integrations_list_tools,
            cmd_integrations::integrations_connect_instance,
            cmd_integrations::integrations_disconnect_instance,
            cmd_integrations::integrations_assign_instance,
            cmd_integrations::integrations_unassign_instance,
            // OAuth Integrations
            cmd_oauth_integrations::start_integration_oauth,
            cmd_oauth_integrations::complete_integration_oauth,
        ])
        .setup(move |app| {
            // Hide dock icon on macOS
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            // Create palette window
            windows::create_palette_window(app.handle())
                .expect("Failed to create palette window");

            // Set app handle on daemon client for push event forwarding
            let client = app.state::<Arc<DaemonClient>>();
            client.set_app_handle(app.handle().clone());

            // Register global shortcut
            let app_handle = app.handle().clone();
            let shortcut = if cfg!(target_os = "macos") {
                "Command+Shift+J"
            } else {
                "Ctrl+Shift+J"
            };

            app.global_shortcut().on_shortcut(
                shortcut,
                move |_app, _shortcut, event| {
                    if event.state == ShortcutState::Pressed {
                        let _ = windows::show_palette(&app_handle);
                    }
                },
            )?;

            // Handle deep link OAuth callbacks (sauria://oauth/callback?code=xxx&state=yyy)
            let deep_link_handle = app.handle().clone();
            app.deep_link().on_open_url(move |event| {
                let urls = event.urls();
                for url_str in urls {
                    let url_string = url_str.to_string();
                    if url_string.starts_with("sauria://oauth/callback") {
                        let handle = deep_link_handle.clone();
                        tauri::async_runtime::spawn(async move {
                            let _ = cmd_oauth_integrations::handle_deep_link_callback(&handle, &url_string).await;
                        });
                    }
                }
            });

            // Resolve daemon CLI path and node_modules from Tauri bundled resources
            if let Ok(resource_path) = app.path().resolve("daemon/index.mjs", BaseDirectory::Resource) {
                if resource_path.exists() {
                    let mut s = daemon_state.blocking_lock();
                    s.set_daemon_cli_path(resource_path.to_string_lossy().to_string());
                    // Set NODE_PATH so daemon can find bundled native modules (better-sqlite3)
                    if let Ok(nm_path) = app.path().resolve("node_modules", BaseDirectory::Resource) {
                        s.set_node_path(nm_path.to_string_lossy().to_string());
                    }
                }
            }

            // Start daemon
            let ds = daemon_state.clone();
            let p = Paths::resolve();
            tauri::async_runtime::spawn(async move {
                let _ = daemon_manager::start_daemon(&ds, &p).await;
            });

            // Eager IPC connect: open socket to daemon so activity broadcasts reach us
            let eager_client = app.state::<Arc<DaemonClient>>().inner().clone();
            tauri::async_runtime::spawn(async move {
                tokio::time::sleep(tokio::time::Duration::from_secs(3)).await;
                for _ in 0..10 {
                    if eager_client.connect().await.is_ok() {
                        break;
                    }
                    tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;
                }
            });

            // Start health check (must run inside async runtime)
            tauri::async_runtime::spawn(async move {
                daemon_manager::start_health_check(health_state, health_paths);
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Sauria");
}

use std::sync::Arc;
use tauri::State;
use tokio::sync::Mutex;

use crate::paths::Paths;
use crate::voice_sidecar::{self, VoiceSidecarState};

#[derive(serde::Serialize)]
pub struct VoiceConfig {
    port: u16,
    token: String,
    running: bool,
}

#[tauri::command]
pub async fn voice_get_config(
    voice_state: State<'_, Arc<Mutex<VoiceSidecarState>>>,
) -> Result<VoiceConfig, String> {
    let mut s = voice_state.lock().await;
    Ok(VoiceConfig {
        port: s.port(),
        token: s.token().to_string(),
        running: s.is_running(),
    })
}

#[tauri::command]
pub async fn voice_start(
    voice_state: State<'_, Arc<Mutex<VoiceSidecarState>>>,
    paths: State<'_, Paths>,
) -> Result<(), String> {
    voice_sidecar::start_voice_sidecar(&voice_state, &paths.logs).await
}

#[tauri::command]
pub async fn voice_stop(
    voice_state: State<'_, Arc<Mutex<VoiceSidecarState>>>,
) -> Result<(), String> {
    voice_sidecar::stop_voice_sidecar(&voice_state).await
}

#[tauri::command]
pub async fn voice_restart(
    voice_state: State<'_, Arc<Mutex<VoiceSidecarState>>>,
    paths: State<'_, Paths>,
) -> Result<(), String> {
    voice_sidecar::restart_voice_sidecar(&voice_state, &paths.logs).await
}

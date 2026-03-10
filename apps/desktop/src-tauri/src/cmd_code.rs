use portable_pty::{native_pty_system, CommandBuilder, PtySize, MasterPty, Child};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tokio::sync::Mutex;
use tokio::task::JoinHandle;

use crate::daemon_process;

/// Max buffered output while detached (512 KB).
const BUFFER_CAP: usize = 512 * 1024;

pub struct CodeTerminalState {
    sessions: HashMap<String, PtySession>,
}

struct PtySession {
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    child: Box<dyn Child + Send + Sync>,
    reader_handle: JoinHandle<()>,
    attached: Arc<AtomicBool>,
    buffer: Arc<std::sync::Mutex<Vec<u8>>>,
}

impl CodeTerminalState {
    pub fn new() -> Self {
        Self {
            sessions: HashMap::new(),
        }
    }
}

#[tauri::command]
pub async fn open_code_terminal(
    node_id: String,
    project_path: String,
    permission_mode: String,
    session_id: Option<String>,
    state: tauri::State<'_, Arc<Mutex<CodeTerminalState>>>,
    app: AppHandle,
) -> Result<(), String> {
    let claude_path = daemon_process::shell_which("claude")
        .ok_or_else(|| "Claude CLI not found. Install with: npm install -g @anthropic-ai/claude-code".to_string())?;

    let pty_system = native_pty_system();

    let pair = pty_system
        .openpty(PtySize {
            rows: 24,
            cols: 80,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| format!("Failed to open PTY: {e}"))?;

    let mut cmd = CommandBuilder::new(&claude_path);
    cmd.arg("--permission-mode");
    cmd.arg(&permission_mode);
    if let Some(ref sid) = session_id {
        cmd.arg("--resume");
        cmd.arg(sid);
    }
    cmd.cwd(&project_path);

    for key in &["PATH", "HOME", "USER", "SHELL", "TERM", "LANG"] {
        if let Ok(val) = std::env::var(key) {
            cmd.env(key, val);
        }
    }
    // Prevent "nested session" detection when Sauria runs inside Claude Code
    cmd.env_remove("CLAUDECODE");

    let child = pair
        .slave
        .spawn_command(cmd)
        .map_err(|e| format!("Failed to spawn Claude CLI: {e}"))?;

    drop(pair.slave);

    let mut reader = pair
        .master
        .try_clone_reader()
        .map_err(|e| format!("Failed to clone PTY reader: {e}"))?;

    let writer = pair
        .master
        .take_writer()
        .map_err(|e| format!("Failed to take PTY writer: {e}"))?;

    let attached = Arc::new(AtomicBool::new(true));
    let buffer: Arc<std::sync::Mutex<Vec<u8>>> = Arc::new(std::sync::Mutex::new(Vec::new()));

    let emit_node_id = node_id.clone();
    let reader_attached = Arc::clone(&attached);
    let reader_buffer = Arc::clone(&buffer);
    let reader_handle = tokio::task::spawn_blocking(move || {
        let mut buf = [0u8; 4096];
        loop {
            match reader.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    if reader_attached.load(Ordering::Relaxed) {
                        let data = buf[..n].to_vec();
                        let _ = app.emit_to(
                            "palette",
                            "code-terminal-data",
                            serde_json::json!({
                                "nodeId": emit_node_id,
                                "data": data,
                            }),
                        );
                    } else {
                        let mut ring = reader_buffer.lock().unwrap();
                        ring.extend_from_slice(&buf[..n]);
                        if ring.len() > BUFFER_CAP {
                            let excess = ring.len() - BUFFER_CAP;
                            ring.drain(..excess);
                        }
                    }
                }
                Err(_) => break,
            }
        }
    });

    let mut guard = state.lock().await;

    if let Some(mut old) = guard.sessions.remove(&node_id) {
        let _ = old.child.kill();
        old.reader_handle.abort();
    }

    guard.sessions.insert(
        node_id,
        PtySession {
            master: pair.master,
            writer,
            child,
            reader_handle,
            attached,
            buffer,
        },
    );

    Ok(())
}

#[tauri::command]
pub async fn write_code_terminal(
    node_id: String,
    data: Vec<u8>,
    state: tauri::State<'_, Arc<Mutex<CodeTerminalState>>>,
) -> Result<(), String> {
    let mut guard = state.lock().await;
    let session = guard
        .sessions
        .get_mut(&node_id)
        .ok_or_else(|| format!("No terminal session for node {node_id}"))?;

    session
        .writer
        .write_all(&data)
        .map_err(|e| format!("Failed to write to PTY: {e}"))?;

    Ok(())
}

#[tauri::command]
pub async fn resize_code_terminal(
    node_id: String,
    cols: u16,
    rows: u16,
    state: tauri::State<'_, Arc<Mutex<CodeTerminalState>>>,
) -> Result<(), String> {
    let guard = state.lock().await;
    let session = guard
        .sessions
        .get(&node_id)
        .ok_or_else(|| format!("No terminal session for node {node_id}"))?;

    session
        .master
        .resize(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| format!("Failed to resize PTY: {e}"))?;

    Ok(())
}

#[tauri::command]
pub async fn close_code_terminal(
    node_id: String,
    state: tauri::State<'_, Arc<Mutex<CodeTerminalState>>>,
) -> Result<(), String> {
    let mut guard = state.lock().await;
    if let Some(mut session) = guard.sessions.remove(&node_id) {
        let _ = session.child.kill();
        session.reader_handle.abort();
    }
    Ok(())
}

#[tauri::command]
pub async fn has_code_terminal(
    node_id: String,
    state: tauri::State<'_, Arc<Mutex<CodeTerminalState>>>,
) -> Result<bool, String> {
    let guard = state.lock().await;
    Ok(guard.sessions.contains_key(&node_id))
}

#[tauri::command]
pub async fn detach_code_terminal(
    node_id: String,
    state: tauri::State<'_, Arc<Mutex<CodeTerminalState>>>,
) -> Result<(), String> {
    let guard = state.lock().await;
    let session = guard
        .sessions
        .get(&node_id)
        .ok_or_else(|| format!("No terminal session for node {node_id}"))?;

    session.attached.store(false, Ordering::Relaxed);
    Ok(())
}

#[tauri::command]
pub async fn attach_code_terminal(
    node_id: String,
    state: tauri::State<'_, Arc<Mutex<CodeTerminalState>>>,
) -> Result<Vec<u8>, String> {
    let guard = state.lock().await;
    let session = guard
        .sessions
        .get(&node_id)
        .ok_or_else(|| format!("No terminal session for node {node_id}"))?;

    let buffered = {
        let mut ring = session.buffer.lock().unwrap();
        std::mem::take(&mut *ring)
    };

    session.attached.store(true, Ordering::Relaxed);
    Ok(buffered)
}

/// Encode a path the same way Claude Code does: every non-alphanumeric char becomes `-`.
fn encode_project_path(path: &str) -> String {
    path.chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '-' })
        .collect()
}

#[tauri::command]
pub async fn discover_code_session_id(project_path: String) -> Result<Option<String>, String> {
    let home = std::env::var("HOME").map_err(|_| "HOME not set".to_string())?;
    let encoded = encode_project_path(&project_path);
    let dir = std::path::PathBuf::from(&home)
        .join(".claude")
        .join("projects")
        .join(&encoded);

    if !dir.exists() {
        return Ok(None);
    }

    let mut entries: Vec<(String, std::time::SystemTime)> = Vec::new();
    let read_dir = std::fs::read_dir(&dir).map_err(|e| format!("Failed to read dir: {e}"))?;

    for entry in read_dir.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) == Some("jsonl") {
            if let Ok(meta) = entry.metadata() {
                if let Ok(mtime) = meta.modified() {
                    if let Some(stem) = path.file_stem().and_then(|s| s.to_str()) {
                        entries.push((stem.to_string(), mtime));
                    }
                }
            }
        }
    }

    entries.sort_by(|a, b| b.1.cmp(&a.1));
    Ok(entries.first().map(|(name, _)| name.clone()))
}

use serde_json::Value;
use std::sync::atomic::{AtomicU64, Ordering};
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::sync::{mpsc, oneshot, Mutex};
use tokio::time::{timeout, Duration};

use crate::daemon_ipc;
use crate::paths::Paths;

const REQUEST_TIMEOUT: Duration = Duration::from_secs(10);
const CONNECT_RETRIES: usize = 3;
const CONNECT_RETRY_DELAY: Duration = Duration::from_secs(1);

static NEXT_ID: AtomicU64 = AtomicU64::new(1);

type PendingMap = std::collections::HashMap<u64, oneshot::Sender<Result<Value, String>>>;
type TxHandle = std::sync::Arc<Mutex<Option<mpsc::Sender<(u64, String)>>>>;

pub struct DaemonClient {
    tx: TxHandle,
    pending: std::sync::Arc<Mutex<PendingMap>>,
    event_handle: Mutex<Option<AppHandle>>,
    #[cfg(unix)]
    socket_path: String,
    #[cfg(windows)]
    ipc_port_path: String,
}

impl DaemonClient {
    pub fn new(paths: &Paths) -> Self {
        Self {
            tx: std::sync::Arc::new(Mutex::new(None)),
            pending: std::sync::Arc::new(Mutex::new(std::collections::HashMap::new())),
            event_handle: Mutex::new(None),
            #[cfg(unix)]
            socket_path: paths.socket.to_string_lossy().to_string(),
            #[cfg(windows)]
            ipc_port_path: paths.ipc_port.to_string_lossy().to_string(),
        }
    }

    #[cfg(unix)]
    pub(crate) fn socket_path(&self) -> &str {
        &self.socket_path
    }

    #[cfg(windows)]
    pub(crate) fn ipc_port_path(&self) -> &str {
        &self.ipc_port_path
    }

    pub fn set_app_handle(&self, handle: AppHandle) {
        *self.event_handle.blocking_lock() = Some(handle);
    }

    async fn ensure_connected(&self) -> Result<(), String> {
        {
            let tx_guard = self.tx.lock().await;
            if tx_guard.is_some() {
                return Ok(());
            }
        }

        let mut last_err = String::new();
        for attempt in 0..CONNECT_RETRIES {
            match self.try_connect().await {
                Ok(()) => return Ok(()),
                Err(e) => {
                    last_err = e;
                    if attempt + 1 < CONNECT_RETRIES {
                        tokio::time::sleep(CONNECT_RETRY_DELAY).await;
                    }
                }
            }
        }
        Err(last_err)
    }

    async fn try_connect(&self) -> Result<(), String> {
        let mut tx_guard = self.tx.lock().await;
        if tx_guard.is_some() {
            return Ok(());
        }

        let (reader, writer) = daemon_ipc::connect(self).await?;
        let (send_tx, mut send_rx) = mpsc::channel::<(u64, String)>(64);
        let pending_for_reader = self.pending.clone();
        let tx_for_reader = self.tx.clone();
        let event_handle = self.event_handle.lock().await.clone();

        // Writer task
        tokio::spawn(async move {
            let mut writer = writer;
            while let Some((_id, payload)) = send_rx.recv().await {
                if writer.write_all(payload.as_bytes()).await.is_err() {
                    break;
                }
            }
        });

        // Reader task
        tokio::spawn(async move {
            let mut lines = BufReader::new(reader).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                let line = line.trim().to_string();
                if line.is_empty() {
                    continue;
                }
                if let Ok(msg) = serde_json::from_str::<Value>(&line) {
                    if let Some(event_name) = msg.get("event").and_then(|v| v.as_str()) {
                        if let Some(ref handle) = event_handle {
                            let data = msg.get("data").cloned().unwrap_or(Value::Null);
                            let _ = handle.emit(event_name, data);
                        }
                        continue;
                    }
                    if let Some(id) = msg.get("id").and_then(|v| v.as_u64()) {
                        let mut pending = pending_for_reader.lock().await;
                        if let Some(sender) = pending.remove(&id) {
                            if let Some(err) = msg.get("error") {
                                let code = err.get("code").and_then(|v| v.as_str()).unwrap_or("UNKNOWN");
                                let message = err.get("message").and_then(|v| v.as_str()).unwrap_or("Unknown error");
                                let _ = sender.send(Err(format!("{code}: {message}")));
                            } else {
                                let result = msg.get("result").cloned().unwrap_or(Value::Null);
                                let _ = sender.send(Ok(result));
                            }
                        }
                    }
                }
            }
            *tx_for_reader.lock().await = None;
            let mut pending = pending_for_reader.lock().await;
            for (_, sender) in pending.drain() {
                let _ = sender.send(Err("Daemon connection closed".to_string()));
            }
        });

        *tx_guard = Some(send_tx);
        Ok(())
    }

    pub async fn connect(&self) -> Result<(), String> {
        self.ensure_connected().await
    }

    pub async fn request(&self, method: &str, params: Value) -> Result<Value, String> {
        self.ensure_connected().await?;

        let id = NEXT_ID.fetch_add(1, Ordering::Relaxed);
        let payload = serde_json::json!({ "id": id, "method": method, "params": params });
        let line = format!("{}\n", serde_json::to_string(&payload).map_err(|e| e.to_string())?);

        let (resp_tx, resp_rx) = oneshot::channel();

        {
            let mut pending = self.pending.lock().await;
            pending.insert(id, resp_tx);
        }

        {
            let mut tx_guard = self.tx.lock().await;
            if let Some(tx) = tx_guard.as_ref() {
                if tx.send((id, line)).await.is_err() {
                    *tx_guard = None;
                    let mut pending = self.pending.lock().await;
                    pending.remove(&id);
                    return Err("Failed to send to daemon".to_string());
                }
            } else {
                let mut pending = self.pending.lock().await;
                pending.remove(&id);
                return Err("Not connected to daemon".to_string());
            }
        }

        match timeout(REQUEST_TIMEOUT, resp_rx).await {
            Ok(Ok(result)) => result,
            Ok(Err(_)) => Err("Response channel closed".to_string()),
            Err(_) => {
                let mut pending = self.pending.lock().await;
                pending.remove(&id);
                Err(format!("Request timeout: {method}"))
            }
        }
    }
}

use serde_json::Value;
use std::sync::atomic::{AtomicU64, Ordering};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::net::UnixStream;
use tokio::sync::{mpsc, oneshot, Mutex};
use tokio::time::{timeout, Duration};

use crate::paths::Paths;

const CONNECT_TIMEOUT: Duration = Duration::from_secs(2);
const REQUEST_TIMEOUT: Duration = Duration::from_secs(5);

static NEXT_ID: AtomicU64 = AtomicU64::new(1);

type PendingMap = std::collections::HashMap<u64, oneshot::Sender<Result<Value, String>>>;

pub struct DaemonClient {
    tx: Mutex<Option<mpsc::Sender<(u64, String)>>>,
    pending: std::sync::Arc<Mutex<PendingMap>>,
    socket_path: String,
}

impl DaemonClient {
    pub fn new(paths: &Paths) -> Self {
        Self {
            tx: Mutex::new(None),
            pending: std::sync::Arc::new(Mutex::new(std::collections::HashMap::new())),
            socket_path: paths.socket.to_string_lossy().to_string(),
        }
    }

    async fn ensure_connected(&self) -> Result<(), String> {
        let mut tx_guard = self.tx.lock().await;
        if tx_guard.is_some() {
            return Ok(());
        }

        let stream = timeout(CONNECT_TIMEOUT, UnixStream::connect(&self.socket_path))
            .await
            .map_err(|_| "Daemon connect timeout".to_string())?
            .map_err(|e| format!("Daemon connection failed: {e}"))?;

        let (reader, writer) = stream.into_split();
        let (send_tx, mut send_rx) = mpsc::channel::<(u64, String)>(64);
        let pending_for_reader = self.pending.clone();

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
                    if let Some(id) = msg.get("id").and_then(|v| v.as_u64()) {
                        let mut pending = pending_for_reader.lock().await;
                        if let Some(sender) = pending.remove(&id) {
                            if let Some(err) = msg.get("error") {
                                let code = err
                                    .get("code")
                                    .and_then(|v| v.as_str())
                                    .unwrap_or("UNKNOWN");
                                let message = err
                                    .get("message")
                                    .and_then(|v| v.as_str())
                                    .unwrap_or("Unknown error");
                                let _ = sender.send(Err(format!("{code}: {message}")));
                            } else {
                                let result = msg.get("result").cloned().unwrap_or(Value::Null);
                                let _ = sender.send(Ok(result));
                            }
                        }
                    }
                }
            }
            // Connection closed — reject all pending
            let mut pending = pending_for_reader.lock().await;
            for (_, sender) in pending.drain() {
                let _ = sender.send(Err("Daemon connection closed".to_string()));
            }
        });

        *tx_guard = Some(send_tx);
        Ok(())
    }

    pub async fn request(&self, method: &str, params: Value) -> Result<Value, String> {
        for _attempt in 0..2u8 {
            self.ensure_connected().await?;

            let id = NEXT_ID.fetch_add(1, Ordering::Relaxed);
            let payload = serde_json::json!({ "id": id, "method": method, "params": params });
            let line = match serde_json::to_string(&payload) {
                Ok(s) => format!("{s}\n"),
                Err(e) => return Err(e.to_string()),
            };

            let (resp_tx, resp_rx) = oneshot::channel();

            {
                let mut pending = self.pending.lock().await;
                pending.insert(id, resp_tx);
            }

            // Send the request — if the channel is dead, reset and retry
            {
                let mut tx_guard = self.tx.lock().await;
                let sent = match tx_guard.as_ref() {
                    Some(tx) => tx.send((id, line)).await.is_ok(),
                    None => false,
                };
                if !sent {
                    self.pending.lock().await.remove(&id);
                    *tx_guard = None;
                    continue;
                }
            }

            // Wait for response — timeout is a hard error, channel close triggers retry
            match timeout(REQUEST_TIMEOUT, resp_rx).await {
                Ok(Ok(result)) => return result,
                Ok(Err(_)) => {
                    // Reader died (connection closed) — reset and retry
                    let mut tx_guard = self.tx.lock().await;
                    *tx_guard = None;
                    continue;
                }
                Err(_) => {
                    let mut pending = self.pending.lock().await;
                    pending.remove(&id);
                    return Err(format!("Request timeout: {method}"));
                }
            }
        }

        Err("Daemon not reachable".to_string())
    }

}

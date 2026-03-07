use tokio::time::{timeout, Duration};

use crate::daemon_client::DaemonClient;

const CONNECT_TIMEOUT: Duration = Duration::from_secs(2);

#[cfg(unix)]
pub(crate) async fn connect(
    client: &DaemonClient,
) -> Result<
    (
        tokio::io::ReadHalf<tokio::net::UnixStream>,
        tokio::io::WriteHalf<tokio::net::UnixStream>,
    ),
    String,
> {
    use tokio::io::split;
    use tokio::net::UnixStream;

    let stream = timeout(CONNECT_TIMEOUT, UnixStream::connect(client.socket_path()))
        .await
        .map_err(|_| "Daemon connect timeout".to_string())?
        .map_err(|e| format!("Daemon connection failed: {e}"))?;

    Ok(split(stream))
}

#[cfg(windows)]
pub(crate) async fn connect(
    client: &DaemonClient,
) -> Result<
    (
        tokio::io::ReadHalf<tokio::net::TcpStream>,
        tokio::io::WriteHalf<tokio::net::TcpStream>,
    ),
    String,
> {
    use tokio::io::split;
    use tokio::net::TcpStream;

    let port_str = std::fs::read_to_string(client.ipc_port_path())
        .map_err(|e| format!("Failed to read daemon port file: {e}"))?;
    let port: u16 = port_str
        .trim()
        .parse()
        .map_err(|e| format!("Invalid daemon port: {e}"))?;

    let stream = timeout(
        CONNECT_TIMEOUT,
        TcpStream::connect(("127.0.0.1", port)),
    )
    .await
    .map_err(|_| "Daemon connect timeout".to_string())?
    .map_err(|e| format!("Daemon connection failed: {e}"))?;

    Ok(split(stream))
}

use aes_gcm::aead::{Aead, KeyInit, OsRng};
use aes_gcm::{Aes256Gcm, Nonce};
use pbkdf2::pbkdf2_hmac;
use rand::RngCore;
use sha2::{Digest, Sha256, Sha512};
use std::fs;
use std::process::Command;

use crate::paths::Paths;

const PBKDF2_ITERATIONS: u32 = 256_000;
const KEY_LENGTH: usize = 32;
const SALT_LENGTH: usize = 32;
const IV_LENGTH: usize = 12;
const AUTH_TAG_LENGTH: usize = 16;

fn machine_id(paths: &Paths) -> String {
    let cache_path = paths.vault.join(".machine-id");

    if let Ok(cached) = fs::read_to_string(&cache_path) {
        let trimmed = cached.trim().to_string();
        if !trimmed.is_empty() {
            return trimmed;
        }
    }

    let id = resolve_platform_id();

    if let Some(parent) = cache_path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    let _ = fs::write(&cache_path, &id);

    id
}

fn resolve_platform_id() -> String {
    let fallback = whoami::username();

    #[cfg(target_os = "macos")]
    {
        if let Ok(output) = Command::new("ioreg")
            .args(["-rd1", "-c", "IOPlatformExpertDevice"])
            .output()
        {
            let stdout = String::from_utf8_lossy(&output.stdout);
            for line in stdout.lines() {
                if line.contains("IOPlatformUUID") {
                    // Line format: "IOPlatformUUID" = "XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX"
                    // Skip past the key name and '=' to find the value quote
                    if let Some(eq_pos) = line.find(" = \"") {
                        let rest = &line[eq_pos + 4..];
                        if let Some(end) = rest.find('"') {
                            let uuid = &rest[..end];
                            if uuid.len() == 36 {
                                return uuid.to_string();
                            }
                        }
                    }
                }
            }
        }
        fallback
    }

    #[cfg(target_os = "linux")]
    {
        fs::read_to_string("/etc/machine-id")
            .map(|s| s.trim().to_string())
            .unwrap_or(fallback)
    }

    #[cfg(target_os = "windows")]
    {
        if let Ok(output) = Command::new("powershell")
            .args([
                "-NoProfile",
                "-Command",
                "(Get-CimInstance Win32_ComputerSystemProduct).UUID",
            ])
            .output()
        {
            let uuid = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !uuid.is_empty() {
                return uuid;
            }
        }
        fallback
    }
}

fn derive_vault_password(paths: &Paths) -> String {
    let mid = machine_id(paths);
    let username = whoami::username();
    let input = format!("{mid}:{username}:sauria-vault");
    let hash = Sha256::digest(input.as_bytes());
    hex::encode(hash)
}

fn derive_wrapping_key(password: &str, salt: &[u8]) -> [u8; KEY_LENGTH] {
    let mut key = [0u8; KEY_LENGTH];
    pbkdf2_hmac::<Sha512>(password.as_bytes(), salt, PBKDF2_ITERATIONS, &mut key);
    key
}

fn encrypt_data(data: &[u8], key: &[u8; KEY_LENGTH]) -> Result<(Vec<u8>, [u8; IV_LENGTH]), String> {
    let cipher = Aes256Gcm::new_from_slice(key).map_err(|e| e.to_string())?;
    let mut iv = [0u8; IV_LENGTH];
    OsRng.fill_bytes(&mut iv);
    let nonce = Nonce::from_slice(&iv);
    let ciphertext = cipher.encrypt(nonce, data).map_err(|e| e.to_string())?;
    Ok((ciphertext, iv))
}

fn secret_file_path(paths: &Paths, name: &str) -> std::path::PathBuf {
    paths.vault.join(format!("{name}.enc"))
}

pub fn vault_store(paths: &Paths, name: &str, value: &str) -> Result<(), String> {
    let password = derive_vault_password(paths);
    let mut salt = [0u8; SALT_LENGTH];
    OsRng.fill_bytes(&mut salt);
    let key = derive_wrapping_key(&password, &salt);
    let (ciphertext, iv) = encrypt_data(value.as_bytes(), &key)?;

    // File format: salt(32) | iv(12) | authTag(16) | encrypted
    // aes-gcm appends the auth tag to the ciphertext, so we need to split it
    if ciphertext.len() < AUTH_TAG_LENGTH {
        return Err("Encrypted data too short".to_string());
    }
    let encrypted_len = ciphertext.len() - AUTH_TAG_LENGTH;
    let encrypted = &ciphertext[..encrypted_len];
    let auth_tag = &ciphertext[encrypted_len..];

    let mut file_data = Vec::with_capacity(SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH + encrypted_len);
    file_data.extend_from_slice(&salt);
    file_data.extend_from_slice(&iv);
    file_data.extend_from_slice(auth_tag);
    file_data.extend_from_slice(encrypted);

    let file_path = secret_file_path(paths, name);
    if let Some(parent) = file_path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(&file_path, &file_data).map_err(|e| e.to_string())?;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = fs::set_permissions(&file_path, fs::Permissions::from_mode(0o600));
    }

    Ok(())
}

pub fn vault_delete(paths: &Paths, name: &str) -> Result<(), String> {
    let file_path = secret_file_path(paths, name);
    if !file_path.exists() {
        return Ok(());
    }

    // Overwrite with random bytes before deleting
    if let Ok(metadata) = fs::metadata(&file_path) {
        let len = metadata.len() as usize;
        let mut overwrite = vec![0u8; len];
        OsRng.fill_bytes(&mut overwrite);
        let _ = fs::write(&file_path, &overwrite);
    }

    fs::remove_file(&file_path).map_err(|e| e.to_string())
}

pub fn vault_exists(paths: &Paths, name: &str) -> bool {
    secret_file_path(paths, name).exists()
}

pub fn vault_rename(paths: &Paths, old_name: &str, new_name: &str) -> Result<(), String> {
    let old_path = secret_file_path(paths, old_name);
    let new_path = secret_file_path(paths, new_name);
    if !old_path.exists() {
        return Err(format!("Vault key not found: {old_name}"));
    }
    fs::rename(&old_path, &new_path).map_err(|e| e.to_string())
}

use aes_gcm::aead::{Aead, KeyInit, OsRng};
use aes_gcm::{Aes256Gcm, Nonce};
use pbkdf2::pbkdf2_hmac;
use rand::RngCore;
use sha2::{Digest, Sha256, Sha512};
use std::fs;
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
        use std::process::Command;
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
        use std::process::Command;
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

const VAULT_SALT_SUFFIX: &str = "sauria-vault";
const LEGACY_SALT_SUFFIX: &str = "opensauria-vault";

fn derive_password_with_suffix(paths: &Paths, suffix: &str) -> String {
    let mid = machine_id(paths);
    let username = whoami::username();
    let input = format!("{mid}:{username}:{suffix}");
    let hash = Sha256::digest(input.as_bytes());
    hex::encode(hash)
}

fn derive_vault_password(paths: &Paths) -> String {
    derive_password_with_suffix(paths, VAULT_SALT_SUFFIX)
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

pub fn vault_read(paths: &Paths, name: &str) -> Result<String, String> {
    let file_path = secret_file_path(paths, name);
    if !file_path.exists() {
        return Err(format!("Vault key not found: {name}"));
    }

    let file_data = fs::read(&file_path).map_err(|e| e.to_string())?;
    if file_data.len() < SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH {
        return Err("Vault file too short".to_string());
    }

    let salt = &file_data[..SALT_LENGTH];
    let iv = &file_data[SALT_LENGTH..SALT_LENGTH + IV_LENGTH];
    let auth_tag = &file_data[SALT_LENGTH + IV_LENGTH..SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH];
    let encrypted = &file_data[SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH..];

    let password = derive_vault_password(paths);
    let key = derive_wrapping_key(&password, salt);

    let cipher = Aes256Gcm::new_from_slice(&key).map_err(|e| e.to_string())?;
    let nonce = Nonce::from_slice(iv);

    // Reassemble ciphertext + auth tag (aes-gcm expects them concatenated)
    let mut ciphertext = Vec::with_capacity(encrypted.len() + AUTH_TAG_LENGTH);
    ciphertext.extend_from_slice(encrypted);
    ciphertext.extend_from_slice(auth_tag);

    let plaintext = cipher
        .decrypt(nonce, ciphertext.as_slice())
        .map_err(|_| "Vault decryption failed".to_string())?;

    String::from_utf8(plaintext).map_err(|e| e.to_string())
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

// ── Legacy migration ────────────────────────────────────────────────

fn decrypt_with_password(file_data: &[u8], password: &str) -> Result<Vec<u8>, String> {
    if file_data.len() < SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH {
        return Err("File too short".to_string());
    }

    let salt = &file_data[..SALT_LENGTH];
    let iv = &file_data[SALT_LENGTH..SALT_LENGTH + IV_LENGTH];
    let auth_tag = &file_data[SALT_LENGTH + IV_LENGTH..SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH];
    let encrypted = &file_data[SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH..];

    let key = derive_wrapping_key(password, salt);
    let cipher = Aes256Gcm::new_from_slice(&key).map_err(|e| e.to_string())?;
    let nonce = Nonce::from_slice(iv);

    let mut ciphertext = Vec::with_capacity(encrypted.len() + AUTH_TAG_LENGTH);
    ciphertext.extend_from_slice(encrypted);
    ciphertext.extend_from_slice(auth_tag);

    cipher
        .decrypt(nonce, ciphertext.as_slice())
        .map_err(|_| "Decryption failed".to_string())
}

/// Migrate all `.enc` files from the legacy `opensauria-vault` password to `sauria-vault`.
/// Returns the number of files migrated. Idempotent — skips files that already use the current password.
pub fn migrate_legacy_vault(paths: &Paths) -> Result<usize, String> {
    let vault_dir = &paths.vault;
    if !vault_dir.exists() {
        return Ok(0);
    }

    let current_password = derive_password_with_suffix(paths, VAULT_SALT_SUFFIX);
    let legacy_password = derive_password_with_suffix(paths, LEGACY_SALT_SUFFIX);

    if current_password == legacy_password {
        return Ok(0);
    }

    let entries = fs::read_dir(vault_dir).map_err(|e| e.to_string())?;
    let mut migrated = 0;

    for entry in entries {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();

        if path.extension().and_then(|e| e.to_str()) != Some("enc") {
            continue;
        }

        let file_data = fs::read(&path).map_err(|e| e.to_string())?;

        // Skip if already decryptable with current password
        if decrypt_with_password(&file_data, &current_password).is_ok() {
            continue;
        }

        // Try legacy password
        let plaintext = match decrypt_with_password(&file_data, &legacy_password) {
            Ok(pt) => pt,
            Err(_) => continue, // Neither password works — skip
        };

        // Re-encrypt with current password
        let name = path
            .file_stem()
            .and_then(|s| s.to_str())
            .ok_or("Invalid file name")?;

        vault_store(paths, name, &String::from_utf8(plaintext).map_err(|e| e.to_string())?)?;
        migrated += 1;
    }

    Ok(migrated)
}

// ── Tests ───────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn test_paths(dir: &TempDir) -> Paths {
        let home = dir.path().to_path_buf();
        let vault_dir = home.join("vault");
        fs::create_dir_all(&vault_dir).unwrap();
        // Write a fake machine-id so tests are deterministic
        fs::write(vault_dir.join(".machine-id"), "TEST-UUID-1234").unwrap();
        Paths {
            config: home.join("config.json5"),
            vault: vault_dir,
            canvas: home.join("canvas.json"),
            socket: home.join("daemon.sock"),
            ipc_port: home.join("daemon.port"),
            pid_file: home.join("daemon.pid"),
            logs: home.join("logs"),
            bot_profiles: home.join("bot-profiles.json"),
            owner_commands: home.join("owner-commands.jsonl"),
            home,
        }
    }

    #[test]
    fn vault_salt_suffix_matches_node() {
        // Node vault uses "sauria-vault" in derive-password.ts:
        //   `${machineId()}:${userInfo().username}:sauria-vault`
        assert_eq!(VAULT_SALT_SUFFIX, "sauria-vault");
    }

    #[test]
    fn pbkdf2_params_match_node() {
        // Node vault: PBKDF2_ITERATIONS = 256_000, PBKDF2_DIGEST = 'sha512', KEY_LENGTH = 32
        assert_eq!(PBKDF2_ITERATIONS, 256_000);
        assert_eq!(KEY_LENGTH, 32);
        // SHA512 is enforced by the type parameter in derive_wrapping_key
    }

    #[test]
    fn file_layout_matches_node() {
        // Node vault: salt(32) | iv(12) | authTag(16) | encrypted
        assert_eq!(SALT_LENGTH, 32);
        assert_eq!(IV_LENGTH, 12);
        assert_eq!(AUTH_TAG_LENGTH, 16);
    }

    #[test]
    fn store_and_read_roundtrip() {
        let dir = TempDir::new().unwrap();
        let paths = test_paths(&dir);

        vault_store(&paths, "test_key", "hello world").unwrap();
        let value = vault_read(&paths, "test_key").unwrap();
        assert_eq!(value, "hello world");
    }

    #[test]
    fn store_and_read_unicode() {
        let dir = TempDir::new().unwrap();
        let paths = test_paths(&dir);

        vault_store(&paths, "unicode", "cafe\u{0301} \u{1F512}").unwrap();
        let value = vault_read(&paths, "unicode").unwrap();
        assert_eq!(value, "cafe\u{0301} \u{1F512}");
    }

    #[test]
    fn read_nonexistent_returns_error() {
        let dir = TempDir::new().unwrap();
        let paths = test_paths(&dir);

        assert!(vault_read(&paths, "missing").is_err());
    }

    #[test]
    fn delete_removes_file() {
        let dir = TempDir::new().unwrap();
        let paths = test_paths(&dir);

        vault_store(&paths, "to_delete", "bye").unwrap();
        assert!(vault_exists(&paths, "to_delete"));
        vault_delete(&paths, "to_delete").unwrap();
        assert!(!vault_exists(&paths, "to_delete"));
    }

    #[test]
    fn rename_moves_secret() {
        let dir = TempDir::new().unwrap();
        let paths = test_paths(&dir);

        vault_store(&paths, "old_name", "secret").unwrap();
        vault_rename(&paths, "old_name", "new_name").unwrap();
        assert!(!vault_exists(&paths, "old_name"));
        assert_eq!(vault_read(&paths, "new_name").unwrap(), "secret");
    }

    #[test]
    fn migrate_legacy_tokens() {
        let dir = TempDir::new().unwrap();
        let paths = test_paths(&dir);

        // Manually encrypt with legacy password
        let legacy_pw = derive_password_with_suffix(&paths, LEGACY_SALT_SUFFIX);
        let mut salt = [0u8; SALT_LENGTH];
        OsRng.fill_bytes(&mut salt);
        let key = derive_wrapping_key(&legacy_pw, &salt);
        let (ciphertext, iv) = encrypt_data(b"my-telegram-token", &key).unwrap();

        let encrypted_len = ciphertext.len() - AUTH_TAG_LENGTH;
        let encrypted = &ciphertext[..encrypted_len];
        let auth_tag = &ciphertext[encrypted_len..];

        let mut file_data = Vec::new();
        file_data.extend_from_slice(&salt);
        file_data.extend_from_slice(&iv);
        file_data.extend_from_slice(auth_tag);
        file_data.extend_from_slice(encrypted);

        let file_path = paths.vault.join("channel_token_telegram_123.enc");
        fs::write(&file_path, &file_data).unwrap();

        // Should fail to read with current password
        assert!(vault_read(&paths, "channel_token_telegram_123").is_err());

        // Migrate
        let count = migrate_legacy_vault(&paths).unwrap();
        assert_eq!(count, 1);

        // Should now read with current password
        let value = vault_read(&paths, "channel_token_telegram_123").unwrap();
        assert_eq!(value, "my-telegram-token");
    }

    #[test]
    fn migrate_skips_current_tokens() {
        let dir = TempDir::new().unwrap();
        let paths = test_paths(&dir);

        // Store with current password
        vault_store(&paths, "already_good", "value").unwrap();

        let count = migrate_legacy_vault(&paths).unwrap();
        assert_eq!(count, 0);

        // Value unchanged
        assert_eq!(vault_read(&paths, "already_good").unwrap(), "value");
    }

    #[test]
    fn migrate_is_idempotent() {
        let dir = TempDir::new().unwrap();
        let paths = test_paths(&dir);

        // Create legacy token
        let legacy_pw = derive_password_with_suffix(&paths, LEGACY_SALT_SUFFIX);
        let mut salt = [0u8; SALT_LENGTH];
        OsRng.fill_bytes(&mut salt);
        let key = derive_wrapping_key(&legacy_pw, &salt);
        let (ciphertext, iv) = encrypt_data(b"token-value", &key).unwrap();

        let encrypted_len = ciphertext.len() - AUTH_TAG_LENGTH;
        let mut file_data = Vec::new();
        file_data.extend_from_slice(&salt);
        file_data.extend_from_slice(&iv);
        file_data.extend_from_slice(&ciphertext[encrypted_len..]);
        file_data.extend_from_slice(&ciphertext[..encrypted_len]);

        fs::write(paths.vault.join("legacy.enc"), &file_data).unwrap();

        let count1 = migrate_legacy_vault(&paths).unwrap();
        assert_eq!(count1, 1);

        let count2 = migrate_legacy_vault(&paths).unwrap();
        assert_eq!(count2, 0);

        assert_eq!(vault_read(&paths, "legacy").unwrap(), "token-value");
    }

    #[test]
    fn password_derivation_is_deterministic() {
        let dir = TempDir::new().unwrap();
        let paths = test_paths(&dir);

        let pw1 = derive_vault_password(&paths);
        let pw2 = derive_vault_password(&paths);
        assert_eq!(pw1, pw2);
        assert_eq!(pw1.len(), 64); // SHA256 hex = 64 chars
    }
}

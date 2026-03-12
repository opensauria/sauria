fn main() {
    // Embed git commit hash at compile time for version-change detection on reopen.
    // When macOS reactivates the running process instead of launching the new binary,
    // we compare the compiled-in hash with the marker file on disk.
    let hash = std::process::Command::new("git")
        .args(["rev-parse", "--short=12", "HEAD"])
        .output()
        .ok()
        .filter(|o| o.status.success())
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
        .unwrap_or_else(|| "unknown".to_string());
    println!("cargo:rustc-env=SAURIA_BUILD_HASH={hash}");

    // Write marker file next to Cargo.toml — bundled as a Tauri resource
    // so the running process can read the NEW version's hash from disk.
    let manifest_dir = std::env::var("CARGO_MANIFEST_DIR").unwrap();
    let marker = std::path::Path::new(&manifest_dir).join("build-hash.txt");
    std::fs::write(&marker, &hash).expect("Failed to write build-hash.txt");

    tauri_build::build();
}

use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};

use crate::windows_nav;

pub(crate) const PALETTE_WIDTH: f64 = 680.0;
pub(crate) const PALETTE_HEIGHT: f64 = 400.0;
pub(crate) const TOP_OFFSET: f64 = 200.0;

pub(crate) struct PageSize {
    pub(crate) width: f64,
    pub(crate) height: f64,
}

pub(crate) fn page_size(page: &str) -> PageSize {
    match page {
        "brain" | "integrations" => PageSize { width: 1000.0, height: 700.0 },
        "canvas" => PageSize { width: 1200.0, height: 800.0 },
        "setup" => PageSize { width: 520.0, height: 680.0 },
        "language" => PageSize { width: 480.0, height: 560.0 },
        _ => PageSize { width: PALETTE_WIDTH, height: PALETTE_HEIGHT },
    }
}

pub(crate) fn is_fixed_page(page: &str) -> bool {
    page == "setup" || page == "language"
}

pub fn create_palette_window(app: &AppHandle) -> Result<(), String> {
    if app.get_webview_window("palette").is_some() {
        return Ok(());
    }

    let url = WebviewUrl::App("src/renderer/index.html".into());
    let builder = WebviewWindowBuilder::new(app, "palette", url)
        .title("Sauria")
        .inner_size(PALETTE_WIDTH, PALETTE_HEIGHT)
        .resizable(false)
        .decorations(false)
        .transparent(true)
        .always_on_top(true)
        .skip_taskbar(true)
        .visible(false);

    let win = builder.build().map_err(|e| e.to_string())?;

    // Debug: open devtools to inspect webview state
    #[cfg(debug_assertions)]
    win.open_devtools();

    #[cfg(not(debug_assertions))]
    let _ = win;

    Ok(())
}

pub fn show_palette(app: &AppHandle) -> Result<(), String> {
    windows_nav::show(app)
}

pub fn hide_palette(app: &AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("palette") {
        if win.is_visible().unwrap_or(false) {
            win.hide().map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

pub fn navigate_palette_to(app: &AppHandle, page: &str) -> Result<(), String> {
    windows_nav::navigate_to(app, page)
}

pub fn navigate_palette_back(app: &AppHandle) -> Result<(), String> {
    windows_nav::navigate_back(app)
}

pub(crate) fn center_palette(app: &AppHandle) -> Result<(), String> {
    let win = app.get_webview_window("palette").ok_or("Palette not found")?;
    win.set_size(tauri::LogicalSize::new(PALETTE_WIDTH, PALETTE_HEIGHT))
        .map_err(|e| e.to_string())?;

    if let Ok(Some(monitor)) = win.current_monitor() {
        let screen_size = monitor.size();
        let scale = monitor.scale_factor();
        let screen_w = screen_size.width as f64 / scale;
        let pos_x = (screen_w - PALETTE_WIDTH) / 2.0;
        let _ = win.set_position(tauri::LogicalPosition::new(pos_x, TOP_OFFSET));
    }

    Ok(())
}

pub fn send_command_result(app: &AppHandle, text: &str) {
    if let Some(win) = app.get_webview_window("palette") {
        let _ = win.emit("command-result", text);
    }
}

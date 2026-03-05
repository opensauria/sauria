use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};

const PALETTE_WIDTH: f64 = 680.0;
const PALETTE_HEIGHT: f64 = 360.0;
const TOP_OFFSET: f64 = 200.0;
const ANIMATION_STEPS: u32 = 15;
const STEP_MS: u64 = 13;

struct PageSize {
    width: f64,
    height: f64,
}

fn page_size(page: &str) -> PageSize {
    match page {
        "brain" | "integrations" => PageSize { width: 1000.0, height: 700.0 },
        "canvas" => PageSize { width: 1200.0, height: 800.0 },
        "setup" => PageSize { width: 520.0, height: 680.0 },
        _ => PageSize { width: PALETTE_WIDTH, height: PALETTE_HEIGHT },
    }
}

fn is_fixed_page(page: &str) -> bool {
    page == "setup"
}

pub fn create_palette_window(app: &AppHandle) -> Result<(), String> {
    if app.get_webview_window("palette").is_some() {
        return Ok(());
    }

    let url = WebviewUrl::App("src/renderer/palette/index.html".into());
    let builder = WebviewWindowBuilder::new(app, "palette", url)
        .title("OpenSauria")
        .inner_size(PALETTE_WIDTH, PALETTE_HEIGHT)
        .resizable(false)
        .decorations(false)
        .transparent(true)
        .always_on_top(true)
        .skip_taskbar(true)
        .visible(false);

    builder.build().map_err(|e| e.to_string())?;

    Ok(())
}

pub fn show_palette(app: &AppHandle) -> Result<(), String> {
    if app.get_webview_window("palette").is_none() {
        create_palette_window(app)?;
    }

    let win = app.get_webview_window("palette").ok_or("Palette not found")?;

    if win.is_visible().unwrap_or(false) {
        hide_palette(app)?;
        return Ok(());
    }

    // Always reset to palette page when re-showing
    let nav_url = resolve_page_url(&win, "palette", "")?;
    let _ = win.navigate(nav_url);
    let _ = win.set_decorations(false);
    let _ = win.set_resizable(false);
    let _ = win.set_always_on_top(true);

    center_palette(app)?;
    win.show().map_err(|e| e.to_string())?;
    win.set_focus().map_err(|e| e.to_string())?;
    let _ = win.emit("palette-show", ());

    Ok(())
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
    let size = page_size(page);
    let is_fixed = is_fixed_page(page);

    let win = app.get_webview_window("palette").ok_or("Palette not found")?;

    // Clear constraints so animation can interpolate freely
    let _ = win.set_min_size(None::<tauri::LogicalSize<f64>>);
    win.set_resizable(true).map_err(|e| e.to_string())?;
    win.set_always_on_top(false).map_err(|e| e.to_string())?;

    // Native decorations only for canvas and brain
    let wants_decorations = page == "canvas" || page == "brain" || page == "integrations";
    win.set_decorations(wants_decorations).map_err(|e| e.to_string())?;

    // Navigate to new page
    let query = if page != "palette" { "?inPalette=1" } else { "" };
    let nav_url = resolve_page_url(&win, page, query)?;
    win.navigate(nav_url).map_err(|e| format!("navigate failed: {e}"))?;

    // Animate resize, then apply final constraints
    let win_clone = win.clone();
    let target_w = size.width;
    let target_h = size.height;
    tauri::async_runtime::spawn(async move {
        animate_to_center(&win_clone, target_w, target_h).await;
        let _ = win_clone.set_resizable(!is_fixed);
        if !is_fixed {
            let _ = win_clone.set_min_size(Some(tauri::LogicalSize::new(720.0, 480.0)));
        } else {
            let _ = win_clone.set_min_size(Some(tauri::LogicalSize::new(target_w, target_h)));
        }
    });

    Ok(())
}

pub fn navigate_palette_back(app: &AppHandle) -> Result<(), String> {
    let win = app.get_webview_window("palette").ok_or("Palette not found")?;

    // Clear constraints so animation can shrink below previous min
    let _ = win.set_min_size(None::<tauri::LogicalSize<f64>>);

    // Restore frameless palette
    let _ = win.set_decorations(false);

    // Navigate back to palette
    let nav_url = resolve_page_url(&win, "palette", "")?;
    win.navigate(nav_url).map_err(|e| format!("navigate_back failed: {e}"))?;

    // Animate shrink, then apply palette constraints
    let win_clone = win.clone();
    tauri::async_runtime::spawn(async move {
        animate_to_palette(&win_clone).await;
        let _ = win_clone.set_always_on_top(true);
        let _ = win_clone.set_resizable(false);
    });

    Ok(())
}

/* ── Animation ─────────────────────────────────── */

async fn animate_to_center(win: &tauri::WebviewWindow, target_w: f64, target_h: f64) {
    let scale = win.scale_factor().unwrap_or(1.0);

    let cur_size = match win.inner_size() {
        Ok(s) => s,
        Err(_) => return,
    };
    let cur_pos = match win.outer_position() {
        Ok(p) => p,
        Err(_) => return,
    };

    let start_w = cur_size.width as f64 / scale;
    let start_h = cur_size.height as f64 / scale;
    let start_x = cur_pos.x as f64 / scale;
    let start_y = cur_pos.y as f64 / scale;

    // Target: centered on screen
    let (sw, sh) = screen_logical_size(win);
    let target_x = (sw - target_w) / 2.0;
    let target_y = (sh - target_h) / 2.0;

    run_animation(
        win, start_x, start_y, start_w, start_h, target_x, target_y, target_w, target_h,
    )
    .await;
}

async fn animate_to_palette(win: &tauri::WebviewWindow) {
    let scale = win.scale_factor().unwrap_or(1.0);

    let cur_size = match win.inner_size() {
        Ok(s) => s,
        Err(_) => return,
    };
    let cur_pos = match win.outer_position() {
        Ok(p) => p,
        Err(_) => return,
    };

    let start_w = cur_size.width as f64 / scale;
    let start_h = cur_size.height as f64 / scale;
    let start_x = cur_pos.x as f64 / scale;
    let start_y = cur_pos.y as f64 / scale;

    // Target: palette position (centered horizontally, TOP_OFFSET from top)
    let (sw, _) = screen_logical_size(win);
    let target_x = (sw - PALETTE_WIDTH) / 2.0;
    let target_y = TOP_OFFSET;

    run_animation(
        win,
        start_x,
        start_y,
        start_w,
        start_h,
        target_x,
        target_y,
        PALETTE_WIDTH,
        PALETTE_HEIGHT,
    )
    .await;
}

async fn run_animation(
    win: &tauri::WebviewWindow,
    sx: f64,
    sy: f64,
    sw: f64,
    sh: f64,
    tx: f64,
    ty: f64,
    tw: f64,
    th: f64,
) {
    let step_dur = tokio::time::Duration::from_millis(STEP_MS);

    for i in 1..=ANIMATION_STEPS {
        let t = i as f64 / ANIMATION_STEPS as f64;
        let e = 1.0 - (1.0 - t).powi(3); // ease-out cubic

        let _ = win.set_position(tauri::LogicalPosition::new(
            sx + (tx - sx) * e,
            sy + (ty - sy) * e,
        ));
        let _ = win.set_size(tauri::LogicalSize::new(
            sw + (tw - sw) * e,
            sh + (th - sh) * e,
        ));
        tokio::time::sleep(step_dur).await;
    }

    // Ensure exact final values
    let _ = win.set_size(tauri::LogicalSize::new(tw, th));
    let _ = win.set_position(tauri::LogicalPosition::new(tx, ty));
}

fn screen_logical_size(win: &tauri::WebviewWindow) -> (f64, f64) {
    if let Ok(Some(monitor)) = win.current_monitor() {
        let s = monitor.size();
        let scale = monitor.scale_factor();
        (s.width as f64 / scale, s.height as f64 / scale)
    } else {
        (1920.0, 1080.0)
    }
}

/* ── Helpers ───────────────────────────────────── */

fn resolve_page_url(
    win: &tauri::WebviewWindow,
    page: &str,
    query: &str,
) -> Result<url::Url, String> {
    let current = win.url().map_err(|e| e.to_string())?;
    let path = format!("/src/renderer/{page}/index.html{query}");
    current.join(&path).map_err(|e| e.to_string())
}

fn center_palette(app: &AppHandle) -> Result<(), String> {
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


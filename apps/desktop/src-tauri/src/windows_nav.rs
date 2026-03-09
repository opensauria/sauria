use tauri::{AppHandle, Emitter, Manager};

use crate::windows::{
    center_palette, is_fixed_page, page_size, PALETTE_HEIGHT, PALETTE_WIDTH, TOP_OFFSET,
};

const ANIMATION_STEPS: u32 = 15;
const STEP_MS: u64 = 13;

pub(crate) fn navigate_to(app: &AppHandle, page: &str) -> Result<(), String> {
    let size = page_size(page);
    let is_fixed = is_fixed_page(page);

    let win = app
        .get_webview_window("palette")
        .ok_or("Palette not found")?;

    let _ = win.set_min_size(None::<tauri::LogicalSize<f64>>);
    win.set_resizable(true).map_err(|e| e.to_string())?;
    win.set_always_on_top(false).map_err(|e| e.to_string())?;

    let wants_decorations = page != "palette";
    win.set_decorations(wants_decorations)
        .map_err(|e| e.to_string())?;

    /* SPA: emit route event instead of full-page navigate */
    win.emit("navigate", page)
        .map_err(|e| format!("emit navigate failed: {e}"))?;

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

pub(crate) fn navigate_back(app: &AppHandle) -> Result<(), String> {
    let win = app
        .get_webview_window("palette")
        .ok_or("Palette not found")?;

    let _ = win.set_min_size(None::<tauri::LogicalSize<f64>>);
    let _ = win.set_decorations(false);

    /* SPA: emit route event instead of full-page navigate */
    win.emit("navigate", "palette")
        .map_err(|e| format!("emit navigate failed: {e}"))?;

    let win_clone = win.clone();
    tauri::async_runtime::spawn(async move {
        animate_to_palette(&win_clone).await;
        let _ = win_clone.set_always_on_top(true);
        let _ = win_clone.set_resizable(false);
    });

    Ok(())
}

pub(crate) fn show(app: &AppHandle) -> Result<(), String> {
    if app.get_webview_window("palette").is_none() {
        crate::windows::create_palette_window(app)?;
    }

    let win = app
        .get_webview_window("palette")
        .ok_or("Palette not found")?;

    if win.is_visible().unwrap_or(false) {
        crate::windows::hide_palette(app)?;
        return Ok(());
    }

    /* SPA: emit route to palette view */
    let _ = win.emit("navigate", "palette");
    let _ = win.set_decorations(false);
    let _ = win.set_resizable(false);
    let _ = win.set_always_on_top(true);

    center_palette(app)?;
    win.show().map_err(|e| e.to_string())?;
    win.set_focus().map_err(|e| e.to_string())?;
    let _ = win.emit("palette-show", ());

    Ok(())
}

// ─── Animation ───────────────────────────────────────────────────────

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

    let (sw, _) = screen_logical_size(win);
    let target_x = (sw - PALETTE_WIDTH) / 2.0;
    let target_y = TOP_OFFSET;

    run_animation(
        win, start_x, start_y, start_w, start_h, target_x, target_y, PALETTE_WIDTH, PALETTE_HEIGHT,
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

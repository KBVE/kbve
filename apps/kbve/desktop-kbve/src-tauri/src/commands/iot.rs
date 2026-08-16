//! Tauri commands backing the IoT view.

use crate::iot::{BleSession, BoardSnapshot, DeviceSummary};
use tauri::{AppHandle, State};

const DEFAULT_SCAN_MS: u64 = 4000;
const MAX_SCAN_MS: u64 = 15000;

#[tauri::command]
#[specta::specta]
pub async fn iot_scan(
    session: State<'_, BleSession>,
    millis: Option<u32>,
) -> Result<Vec<DeviceSummary>, String> {
    let millis = millis
        .map(u64::from)
        .unwrap_or(DEFAULT_SCAN_MS)
        .min(MAX_SCAN_MS);
    session.scan(millis).await
}

#[tauri::command]
#[specta::specta]
pub async fn iot_connect(
    app: AppHandle,
    session: State<'_, BleSession>,
    device_id: String,
) -> Result<BoardSnapshot, String> {
    session.connect(app, device_id).await
}

#[tauri::command]
#[specta::specta]
pub async fn iot_disconnect(session: State<'_, BleSession>) -> Result<(), String> {
    session.disconnect().await
}

#[tauri::command]
#[specta::specta]
pub async fn iot_snapshot(session: State<'_, BleSession>) -> Result<BoardSnapshot, String> {
    Ok(session.snapshot().await)
}

#[tauri::command]
#[specta::specta]
pub async fn iot_set_backlight(session: State<'_, BleSession>, pct: u8) -> Result<(), String> {
    session.set_backlight(pct).await
}

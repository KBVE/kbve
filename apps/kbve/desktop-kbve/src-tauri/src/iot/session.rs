//! Owns the adapter and the one connected board.
//!
//! btleplug peripherals are not `Send`-friendly to hold across arbitrary await
//! points on every backend, so the session keeps the handle behind a mutex and
//! hands out only decoded snapshots.

use std::sync::Arc;
use std::time::Duration;

use btleplug::api::{Central, CharPropFlags, Manager as _, Peripheral as _, ScanFilter, WriteType};
use btleplug::platform::{Adapter, Manager, Peripheral};
use futures::StreamExt;
use tauri::{AppHandle, Emitter};
use tokio::sync::Mutex;

use super::profile::{
    self, BACKLIGHT, BoardSnapshot, DIE_DECICELSIUS, DeviceSummary, NAME_PREFIX, PRESSES, SERVICE,
    UPTIME,
};

pub const SNAPSHOT_EVENT: &str = "iot://snapshot";

#[derive(Default)]
struct Connected {
    peripheral: Option<Peripheral>,
    snapshot: BoardSnapshot,
}

#[derive(Clone)]
pub struct BleSession {
    adapter: Arc<Mutex<Option<Adapter>>>,
    connected: Arc<Mutex<Connected>>,
}

impl Default for BleSession {
    fn default() -> Self {
        Self::new()
    }
}

impl BleSession {
    pub fn new() -> Self {
        Self {
            adapter: Arc::new(Mutex::new(None)),
            connected: Arc::new(Mutex::new(Connected::default())),
        }
    }

    /// Resolve an adapter once and keep it. On macOS this is the first call
    /// that touches CoreBluetooth, so it is also where a missing
    /// `NSBluetoothAlwaysUsageDescription` would terminate the process.
    async fn adapter(&self) -> Result<Adapter, String> {
        let mut slot = self.adapter.lock().await;
        if let Some(adapter) = slot.as_ref() {
            return Ok(adapter.clone());
        }

        let manager = Manager::new()
            .await
            .map_err(|e| format!("bluetooth unavailable: {e}"))?;
        let adapters = manager
            .adapters()
            .await
            .map_err(|e| format!("no bluetooth adapters: {e}"))?;
        let adapter = adapters
            .into_iter()
            .next()
            .ok_or_else(|| "no bluetooth adapter found".to_string())?;

        *slot = Some(adapter.clone());
        Ok(adapter)
    }

    pub async fn scan(&self, millis: u64) -> Result<Vec<DeviceSummary>, String> {
        let adapter = self.adapter().await?;
        adapter
            .start_scan(ScanFilter::default())
            .await
            .map_err(|e| format!("scan failed to start: {e}"))?;
        tokio::time::sleep(Duration::from_millis(millis)).await;
        let peripherals = adapter
            .peripherals()
            .await
            .map_err(|e| format!("scan failed: {e}"))?;
        let _ = adapter.stop_scan().await;

        let mut found = Vec::new();
        for peripheral in peripherals {
            let Ok(Some(props)) = peripheral.properties().await else {
                continue;
            };
            let name = props.local_name.unwrap_or_default();
            if !name.starts_with(NAME_PREFIX) {
                continue;
            }
            found.push(DeviceSummary {
                id: peripheral.id().to_string(),
                name,
                rssi: props.rssi,
                connectable: true,
            });
        }
        found.sort_by_key(|d| -d.rssi.unwrap_or(i16::MIN));
        Ok(found)
    }

    pub async fn connect(
        &self,
        app: AppHandle,
        device_id: String,
    ) -> Result<BoardSnapshot, String> {
        let adapter = self.adapter().await?;
        let peripherals = adapter
            .peripherals()
            .await
            .map_err(|e| format!("cannot list devices: {e}"))?;
        let peripheral = peripherals
            .into_iter()
            .find(|p| p.id().to_string() == device_id)
            .ok_or_else(|| "device is no longer in range".to_string())?;

        peripheral
            .connect()
            .await
            .map_err(|e| format!("connect failed: {e}"))?;
        peripheral
            .discover_services()
            .await
            .map_err(|e| format!("service discovery failed: {e}"))?;

        if !peripheral
            .characteristics()
            .iter()
            .any(|c| c.service_uuid == SERVICE)
        {
            let _ = peripheral.disconnect().await;
            return Err("device does not publish the KBVE board service".into());
        }

        let name = peripheral
            .properties()
            .await
            .ok()
            .flatten()
            .and_then(|p| p.local_name);

        let mut snapshot = BoardSnapshot {
            device_id: Some(device_id),
            name,
            connected: true,
            ..Default::default()
        };
        read_into(&peripheral, &mut snapshot).await;

        {
            let mut guard = self.connected.lock().await;
            guard.peripheral = Some(peripheral.clone());
            guard.snapshot = snapshot.clone();
        }

        self.spawn_notifications(app, peripheral).await;
        Ok(snapshot)
    }

    /// Subscribe to every notifying characteristic and push decoded snapshots
    /// to the UI. The task ends when the link drops, which is also how a
    /// disconnect reaches the frontend.
    async fn spawn_notifications(&self, app: AppHandle, peripheral: Peripheral) {
        let connected = self.connected.clone();

        tokio::spawn(async move {
            let chars = peripheral.characteristics();
            for ch in chars.iter() {
                if ch.properties.contains(CharPropFlags::NOTIFY) {
                    let _ = peripheral.subscribe(ch).await;
                }
            }

            let Ok(mut stream) = peripheral.notifications().await else {
                return;
            };

            while let Some(data) = stream.next().await {
                let mut guard = connected.lock().await;
                apply(&mut guard.snapshot, data.uuid, &data.value);
                let snapshot = guard.snapshot.clone();
                drop(guard);
                let _ = app.emit(SNAPSHOT_EVENT, snapshot);
            }

            let mut guard = connected.lock().await;
            guard.peripheral = None;
            guard.snapshot.connected = false;
            let snapshot = guard.snapshot.clone();
            drop(guard);
            let _ = app.emit(SNAPSHOT_EVENT, snapshot);
        });
    }

    pub async fn disconnect(&self) -> Result<(), String> {
        let mut guard = self.connected.lock().await;
        if let Some(peripheral) = guard.peripheral.take() {
            let _ = peripheral.disconnect().await;
        }
        guard.snapshot = BoardSnapshot::default();
        Ok(())
    }

    pub async fn snapshot(&self) -> BoardSnapshot {
        self.connected.lock().await.snapshot.clone()
    }

    pub async fn set_backlight(&self, pct: u8) -> Result<(), String> {
        let peripheral = {
            let guard = self.connected.lock().await;
            guard
                .peripheral
                .clone()
                .ok_or_else(|| "not connected".to_string())?
        };

        let characteristic = peripheral
            .characteristics()
            .into_iter()
            .find(|c| c.uuid == BACKLIGHT)
            .ok_or_else(|| "board has no backlight characteristic".to_string())?;

        peripheral
            .write(&characteristic, &[pct.min(100)], WriteType::WithResponse)
            .await
            .map_err(|e| format!("write failed: {e}"))?;

        let mut guard = self.connected.lock().await;
        guard.snapshot.backlight_pct = Some(pct.min(100));
        Ok(())
    }
}

async fn read_into(peripheral: &Peripheral, snapshot: &mut BoardSnapshot) {
    for ch in peripheral.characteristics() {
        if !ch.properties.contains(CharPropFlags::READ) {
            continue;
        }
        if let Ok(value) = peripheral.read(&ch).await {
            apply(snapshot, ch.uuid, &value);
        }
    }
}

fn apply(snapshot: &mut BoardSnapshot, uuid: uuid::Uuid, value: &[u8]) {
    match uuid {
        DIE_DECICELSIUS => {
            snapshot.die_celsius = profile::decode_i16(value).map(|v| v as f32 / 10.0)
        }
        UPTIME => snapshot.uptime_seconds = profile::decode_u32(value),
        PRESSES => snapshot.presses = profile::decode_u32(value),
        BACKLIGHT => snapshot.backlight_pct = profile::decode_u8(value),
        _ => {}
    }
}

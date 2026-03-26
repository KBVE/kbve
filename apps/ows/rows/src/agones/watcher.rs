//! GameServer watcher — monitors Agones GameServer state changes.
//!
//! Watches for Shutdown/Delete events and auto-cleans stale DB entries
//! (worldservers + mapinstances) so clients never connect to dead ports.

use crate::db::DbPool;
use crate::repo::InstanceRepo;
use crate::state::AppState;
use dashmap::DashMap;
use futures_lite::StreamExt;
use kube::{
    Api, Client,
    api::{ApiResource, DynamicObject, ListParams},
    runtime::watcher::{self, Event},
};
use serde_json::Value;
use std::sync::Arc;
use std::time::Instant;
use tracing::{error, info, warn};
use uuid::Uuid;

/// Spawn a background watcher that monitors GameServer state transitions.
/// When a GameServer enters Shutdown or is deleted, it cleans up DB entries.
pub async fn spawn_gameserver_watcher(state: Arc<AppState>) {
    let client = match Client::try_default().await {
        Ok(c) => c,
        Err(e) => {
            warn!(error = %e, "GameServer watcher unavailable (not in cluster)");
            return;
        }
    };

    let namespace = &state.config.agones_namespace;

    let api: Api<DynamicObject> = Api::namespaced_with(
        client,
        namespace,
        &ApiResource {
            group: "agones.dev".into(),
            version: "v1".into(),
            api_version: "agones.dev/v1".into(),
            kind: "GameServer".into(),
            plural: "gameservers".into(),
        },
    );

    info!(namespace, "GameServer watcher started");

    let stream = watcher::watcher(api, watcher::Config::default());
    tokio::pin!(stream);

    while let Some(event) = stream.next().await {
        match event {
            Ok(Event::Apply(gs)) | Ok(Event::InitApply(gs)) => {
                let name = gs.metadata.name.as_deref().unwrap_or("");
                let gs_state = gs
                    .data
                    .get("status")
                    .and_then(|s| s.get("state"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("");

                if gs_state == "Shutdown" {
                    info!(gs = name, "GameServer shutdown detected — cleaning up");
                    cleanup_shutdown_server(name, &state).await;
                }
            }
            Ok(Event::Delete(gs)) => {
                let name = gs.metadata.name.as_deref().unwrap_or("");
                info!(gs = name, "GameServer deleted — cleaning up");
                cleanup_shutdown_server(name, &state).await;
            }
            Ok(Event::Init) | Ok(Event::InitDone) => {}
            Err(e) => {
                warn!(error = %e, "GameServer watcher error (will retry)");
            }
        }
    }

    warn!("GameServer watcher stream ended unexpectedly");
}

/// Clean up DB entries for a shutdown/deleted GameServer.
async fn cleanup_shutdown_server(gs_name: &str, state: &AppState) {
    // Find instance ID by GameServer name in tracking map
    let instance_id = state
        .zone_servers
        .iter()
        .find(|entry| entry.value() == gs_name)
        .map(|entry| *entry.key());

    let Some(instance_id) = instance_id else {
        // Not tracked — might be an old pod or one we didn't allocate
        return;
    };

    let customer_guid = state.config.customer_guid;
    let repo = InstanceRepo(&state.db);

    // Deactivate worldserver BEFORE deleting mapinstance (FK dependency)
    if let Err(e) = repo
        .deactivate_world_server_by_instance(customer_guid, instance_id)
        .await
    {
        error!(error = %e, instance_id, gs = gs_name, "Failed to deactivate worldserver");
    }

    // Delete mapinstance
    if let Err(e) = repo.delete_map_instance(customer_guid, instance_id).await {
        error!(error = %e, instance_id, gs = gs_name, "Failed to delete mapinstance");
    } else {
        info!(instance_id, gs = gs_name, "Deleted mapinstance");
    }

    // Remove from tracking
    state.zone_servers.remove(&instance_id);

    // Release any spinup locks for this customer
    let guid_prefix = customer_guid.to_string();
    state
        .zone_spinup_locks
        .retain(|key, _| !key.starts_with(&guid_prefix));

    // Log the event
    state.instance_log.push(crate::rest::system::InstanceEvent {
        timestamp: chrono::Utc::now(),
        event: "shutdown_cleanup".into(),
        zone_instance_id: instance_id,
        map_name: String::new(),
        game_server: gs_name.to_string(),
        trigger: "watcher".into(),
    });

    info!(instance_id, gs = gs_name, "Shutdown cleanup complete");
}

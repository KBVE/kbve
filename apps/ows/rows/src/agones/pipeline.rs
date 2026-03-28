//! Chainable allocation pipeline — async/await chaining with ? propagation.
//!
//! Each step borrows refs (&str, &Uuid) to avoid allocations.
//! The ? operator short-circuits on any error with full tracing context.
//!
//! Usage:
//! ```ignore
//! let result = AllocationPipeline::new(customer_guid, &zone, &db)
//!     .find_existing()
//!     .await?
//!     .or_allocate(&agones)
//!     .await?
//!     .register(&repo)
//!     .await?
//!     .create_instance(&repo)
//!     .await?
//!     .track(&zone_servers)
//!     .poll_until_ready(char_name)
//!     .await?;
//! ```

use crate::agones::{AgonesClient, AllocationResult};
use crate::db::DbPool;
use crate::error::RowsError;
use crate::models::JoinMapResult;
use crate::mq::{MqProducer, SpinUpMessage};
use crate::repo::InstanceRepo;
use dashmap::DashMap;
use std::time::{Duration, Instant};
use uuid::Uuid;

/// Max time to wait for a server to become ready after allocation.
/// Override: ROWS_spinup_timeout_secs() env var.
fn spinup_timeout_secs() -> u64 {
    std::env::var("ROWS_spinup_timeout_secs()")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(60)
}

/// How often to poll the DB for instance status during spinup.
/// Override: ROWS_spinup_poll_interval_ms() env var.
fn spinup_poll_interval_ms() -> u64 {
    std::env::var("ROWS_spinup_poll_interval_ms()")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(2000)
}

/// Initial poll delay — give the server a moment to register.
/// Override: ROWS_spinup_initial_delay_ms() env var.
fn spinup_initial_delay_ms() -> u64 {
    std::env::var("ROWS_spinup_initial_delay_ms()")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(3000)
}

/// Allocation pipeline state machine.
/// Progresses through: Init → Found | Allocated → Registered → Tracked → Ready
///
/// Pipeline borrows `&'a str` and `&'a DbPool` to avoid allocations.
/// Each step consumes `self` and returns `Result<Self, RowsError>` for ? chaining.
pub struct AllocationPipeline<'a> {
    customer_guid: Uuid,
    zone: &'a str,
    db: &'a DbPool,
    // Populated during pipeline
    allocation: Option<AllocationResult>,
    world_server_id: i32,
    instance_id: i32,
    existing: Option<JoinMapResult>,
    lock_key: String,
}

/// Pipeline accessor methods — read-only access to pipeline state.
impl<'a> AllocationPipeline<'a> {
    /// Get the allocated GameServer name (if allocation succeeded).
    pub fn game_server_name(&self) -> Option<&str> {
        self.allocation
            .as_ref()
            .map(|a| a.game_server_name.as_str())
    }

    /// Get the allocated address (if allocation succeeded).
    pub fn address(&self) -> Option<&str> {
        self.allocation.as_ref().map(|a| a.address.as_str())
    }

    /// Get the allocated port (if allocation succeeded).
    pub fn port(&self) -> Option<i32> {
        self.allocation.as_ref().map(|a| a.port)
    }

    /// Get the world server ID (after registration).
    pub fn world_server_id(&self) -> i32 {
        self.world_server_id
    }

    /// Get the map instance ID (after instance creation).
    pub fn instance_id(&self) -> i32 {
        self.instance_id
    }

    /// Get the lock key for this pipeline.
    pub fn lock_key(&self) -> &str {
        &self.lock_key
    }
}

impl<'a> AllocationPipeline<'a> {
    /// Start a new allocation pipeline for a zone.
    pub fn new(customer_guid: Uuid, zone: &'a str, db: &'a DbPool) -> Self {
        let lock_key = format!("{customer_guid}:{zone}");
        Self {
            customer_guid,
            zone,
            db,
            allocation: None,
            world_server_id: 0,
            instance_id: 0,
            existing: None,
            lock_key,
        }
    }

    /// Step 1: Check if a ready instance already exists for this zone.
    /// If found, short-circuits the pipeline — no allocation needed.
    #[tracing::instrument(skip(self), fields(zone = %self.zone))]
    pub async fn find_existing(mut self, char_name: &str) -> Result<Self, FindResult> {
        let repo = InstanceRepo(self.db);
        let result = repo
            .join_map_by_char_name(self.customer_guid, char_name, self.zone)
            .await
            .map_err(FindResult::Error)?;

        if !result.need_to_startup_map
            && result.map_instance_id > 0
            && result.map_instance_status == 2
        {
            tracing::info!(
                ip = %result.server_ip,
                port = result.port,
                instance_id = result.map_instance_id,
                "Found existing ready instance"
            );
            return Err(FindResult::Found(result));
        }

        self.existing = Some(result);
        Ok(self)
    }

    /// Step 2: Acquire a spin-up lock to prevent duplicate allocations.
    /// Returns Err if another allocation is already in progress for this zone.
    pub fn acquire_lock(self, locks: &DashMap<String, Instant>) -> Result<Self, RowsError> {
        if let Some(entry) = locks.get(&self.lock_key) {
            let age = entry.value().elapsed();
            if age < Duration::from_secs(spinup_timeout_secs() + 10) {
                tracing::info!(zone = %self.zone, age_secs = age.as_secs(), "Spin-up already in progress, skipping");
                return Err(RowsError::Conflict("Allocation already in progress".into()));
            }
            // Stale lock — expired, allow new allocation
            tracing::warn!(zone = %self.zone, age_secs = age.as_secs(), "Expired stale spin-up lock");
        }
        locks.insert(self.lock_key.clone(), Instant::now());
        Ok(self)
    }

    /// Step 3a: Allocate a GameServer via Agones (primary path).
    #[tracing::instrument(skip(self, agones), fields(zone = %self.zone))]
    pub async fn allocate_via_agones(mut self, agones: &AgonesClient) -> Result<Self, RowsError> {
        let alloc = agones
            .allocate(self.zone, 0)
            .await
            .map_err(|e| RowsError::Internal(format!("Agones allocation failed: {e}")))?;

        tracing::info!(
            gs = %alloc.game_server_name,
            addr = %alloc.address,
            port = alloc.port,
            "GameServer allocated"
        );

        self.allocation = Some(alloc);
        Ok(self)
    }

    /// Step 3b: Fallback — publish spin-up request via RabbitMQ.
    #[tracing::instrument(skip(self, mq), fields(zone = %self.zone))]
    pub async fn publish_via_mq(self, mq: &MqProducer) -> Result<Self, RowsError> {
        let existing = self.existing.as_ref().ok_or_else(|| {
            RowsError::Internal("No existing result to build MQ message from".into())
        })?;

        let msg = SpinUpMessage {
            customer_guid: self.customer_guid.to_string(),
            world_server_id: existing.world_server_id,
            zone_instance_id: existing.map_instance_id,
            map_name: existing.map_name_to_start.clone(),
            port: existing.port,
            seed: 0,     // TODO(fastnoise): look up seed from maps table
            biome: None, // TODO(fastnoise): look up biome from maps table
        };

        mq.publish_spin_up(existing.world_server_id, &msg)
            .await
            .map_err(|e| RowsError::Internal(format!("MQ publish failed: {e}")))?;

        tracing::info!("Spin-up published via MQ");
        Ok(self)
    }

    /// Step 4: Register the allocated server as a world server in the DB.
    /// Uses UUID v4 for zoneserverguid (Postgres UUID column).
    #[tracing::instrument(skip(self), fields(zone = %self.zone))]
    pub async fn register_world_server(mut self) -> Result<Self, RowsError> {
        let alloc = self.allocation.as_ref().ok_or_else(|| {
            RowsError::Internal("No allocation result — call allocate first".into())
        })?;

        let repo = InstanceRepo(self.db);
        let launcher_uuid = Uuid::new_v4();

        self.world_server_id = repo
            .register_launcher(
                self.customer_guid,
                &launcher_uuid.to_string(),
                &alloc.address,
                10,
                &alloc.address,
                alloc.port,
            )
            .await?;

        if self.world_server_id <= 0 {
            return Err(RowsError::Internal(
                "register_launcher returned invalid ID".into(),
            ));
        }

        tracing::info!(
            world_server_id = self.world_server_id,
            gs = %alloc.game_server_name,
            "World server registered"
        );

        Ok(self)
    }

    /// Step 5: Create a map instance with status=2 (ready).
    /// Agones-allocated servers are already running — no spin-up wait.
    #[tracing::instrument(skip(self), fields(zone = %self.zone, world_server_id = self.world_server_id))]
    pub async fn create_instance(mut self) -> Result<Self, RowsError> {
        let alloc = self
            .allocation
            .as_ref()
            .ok_or_else(|| RowsError::Internal("No allocation result".into()))?;

        let repo = InstanceRepo(self.db);
        self.instance_id = repo
            .spin_up_server_instance_ready(
                self.customer_guid,
                self.world_server_id,
                self.zone,
                alloc.port,
            )
            .await?;

        if self.instance_id <= 0 {
            return Err(RowsError::Internal(
                "spin_up_server_instance_ready returned invalid ID".into(),
            ));
        }

        tracing::info!(
            instance_id = self.instance_id,
            port = alloc.port,
            gs = %alloc.game_server_name,
            "Map instance created (status=2 ready)"
        );

        Ok(self)
    }

    /// Step 5c: Tag the GameServer with allocation metadata via K8s API.
    /// Sets labels (zone, map, instance ID) and annotations (timestamp, customer).
    /// Belt-and-suspenders: makes allocation visible in `kubectl get gs --show-labels`.
    #[tracing::instrument(skip(self, agones), fields(zone = %self.zone))]
    pub async fn tag_gameserver(self, agones: &AgonesClient) -> Result<Self, RowsError> {
        let alloc = self
            .allocation
            .as_ref()
            .ok_or_else(|| RowsError::Internal("No allocation to tag".into()))?;

        // Non-fatal: tagging failure shouldn't block the pipeline
        if let Err(e) = agones
            .tag_allocated(
                &alloc.game_server_name,
                self.zone,
                self.zone, // map_name matches zone for now
                self.instance_id,
                self.world_server_id,
                &self.customer_guid.to_string(),
            )
            .await
        {
            tracing::warn!(
                error = %e,
                gs = %alloc.game_server_name,
                "Failed to tag GameServer (non-fatal)"
            );
        }

        Ok(self)
    }

    /// Step 5d: Verify the allocated server is reachable (health probe).
    /// Checks that the Agones GameServer is still in Allocated state.
    /// Call after create_instance() to catch servers that died during boot.
    #[tracing::instrument(skip(self, agones), fields(zone = %self.zone))]
    pub async fn verify_health(self, agones: &AgonesClient) -> Result<Self, RowsError> {
        let alloc = self
            .allocation
            .as_ref()
            .ok_or_else(|| RowsError::Internal("No allocation to verify".into()))?;

        // Query the GameServer status via K8s API
        let url = format!(
            "/apis/agones.dev/v1/namespaces/{}/gameservers/{}",
            agones.namespace(),
            alloc.game_server_name
        );

        let req = http::Request::get(&url)
            .body(Vec::new())
            .map_err(|e| RowsError::Internal(format!("Failed to build health request: {e}")))?;

        let resp: serde_json::Value = agones
            .client
            .request(req)
            .await
            .map_err(|e| RowsError::Internal(format!("Health probe failed: {e}")))?;

        let state = resp
            .pointer("/status/state")
            .and_then(|v| v.as_str())
            .unwrap_or("Unknown");

        if state != "Allocated" && state != "Ready" {
            tracing::error!(
                gs = %alloc.game_server_name,
                state,
                "GameServer is not healthy"
            );
            return Err(RowsError::Internal(format!(
                "GameServer {} is in state {state}, expected Allocated/Ready",
                alloc.game_server_name
            )));
        }

        tracing::info!(
            gs = %alloc.game_server_name,
            state,
            "GameServer health verified"
        );
        Ok(self)
    }

    /// Cleanup: deallocate the GameServer if a pipeline step fails.
    /// Call this in error paths to prevent orphaned GameServers.
    #[tracing::instrument(skip(self, agones), fields(zone = %self.zone))]
    pub async fn deallocate_on_failure(self, agones: &AgonesClient) -> Self {
        if let Some(ref alloc) = self.allocation {
            tracing::warn!(
                gs = %alloc.game_server_name,
                "Pipeline failed — deallocating orphaned GameServer"
            );
            if let Err(e) = agones.deallocate(&alloc.game_server_name).await {
                tracing::error!(
                    error = %e,
                    gs = %alloc.game_server_name,
                    "Failed to deallocate orphaned GameServer"
                );
            }
        }
        self
    }

    /// Step 6: Track the allocation for cleanup/deallocation.
    pub fn track(self, zone_servers: &DashMap<i32, String>) -> Self {
        if let Some(ref alloc) = self.allocation {
            if self.instance_id > 0 {
                zone_servers.insert(self.instance_id, alloc.game_server_name.clone());
                tracing::debug!(
                    instance_id = self.instance_id,
                    gs = %alloc.game_server_name,
                    "Tracked for cleanup"
                );
            }
        }
        self
    }

    /// Step 7: Release the spin-up lock.
    pub fn release_lock(self, locks: &DashMap<String, Instant>) -> Self {
        locks.remove(&self.lock_key);
        self
    }

    /// Step 8: Poll DB until the instance is ready, or return on timeout.
    /// Initial delay gives the server time to register before first poll.
    #[tracing::instrument(skip(self), fields(zone = %self.zone, instance_id = self.instance_id))]
    pub async fn poll_until_ready(self, char_name: &str) -> Result<JoinMapResult, RowsError> {
        let repo = InstanceRepo(self.db);
        let start = Instant::now();
        let timeout = Duration::from_secs(spinup_timeout_secs());

        // Initial delay — give server time to boot + register
        tokio::time::sleep(Duration::from_millis(spinup_initial_delay_ms())).await;

        while start.elapsed() < timeout {
            let poll = repo
                .join_map_by_char_name(self.customer_guid, char_name, self.zone)
                .await?;

            if poll.map_instance_id > 0 && !poll.server_ip.is_empty() {
                tracing::info!(
                    ip = %poll.server_ip,
                    port = poll.port,
                    elapsed_ms = start.elapsed().as_millis() as u64,
                    "Server ready"
                );
                return Ok(poll);
            }
        }

        // Timeout — return best effort
        tracing::warn!(
            elapsed_ms = start.elapsed().as_millis() as u64,
            "Polling timed out"
        );
        repo.join_map_by_char_name(self.customer_guid, char_name, self.zone)
            .await
    }
}

/// Result of the find_existing step — either found an existing instance or need to allocate.
pub enum FindResult {
    /// Existing ready instance found — short-circuit the pipeline.
    Found(JoinMapResult),
    /// Error during lookup.
    Error(RowsError),
}

impl From<FindResult> for Result<JoinMapResult, RowsError> {
    fn from(val: FindResult) -> Self {
        match val {
            FindResult::Found(r) => Ok(r),
            FindResult::Error(e) => Err(e),
        }
    }
}

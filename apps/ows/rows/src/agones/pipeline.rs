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
const SPINUP_TIMEOUT_SECS: u64 = 30;
/// How often to poll the DB for instance status during spinup.
const SPINUP_POLL_INTERVAL_MS: u64 = 2000;

/// Allocation pipeline state machine.
/// Progresses through: Init → Found | Allocated → Registered → Tracked → Ready
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
    pub fn acquire_lock(self, locks: &DashMap<String, bool>) -> Result<Self, RowsError> {
        if locks.contains_key(&self.lock_key) {
            tracing::info!(zone = %self.zone, "Spin-up already in progress, skipping");
            return Err(RowsError::Conflict("Allocation already in progress".into()));
        }
        locks.insert(self.lock_key.clone(), true);
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
    pub fn release_lock(self, locks: &DashMap<String, bool>) -> Self {
        locks.remove(&self.lock_key);
        self
    }

    /// Step 8: Poll DB until the instance is ready, or return on timeout.
    #[tracing::instrument(skip(self), fields(zone = %self.zone, instance_id = self.instance_id))]
    pub async fn poll_until_ready(self, char_name: &str) -> Result<JoinMapResult, RowsError> {
        let repo = InstanceRepo(self.db);
        let start = Instant::now();
        let timeout = Duration::from_secs(SPINUP_TIMEOUT_SECS);

        while start.elapsed() < timeout {
            tokio::time::sleep(Duration::from_millis(SPINUP_POLL_INTERVAL_MS)).await;

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

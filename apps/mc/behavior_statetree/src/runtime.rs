//! Tokio runtime lifecycle — one runtime for all NPC planning.
//!
//! The runtime owns bounded channels for job submission and intent collection.
//! The JVM side submits observations via `submit_job()` and drains completed
//! intents via `poll_intents()` on each server tick.

use std::sync::Arc;

use crossbeam_channel::{Receiver, Sender, bounded};
use tokio::runtime::Runtime;

use crate::planner::plan_npc;
use crate::types::{NpcIntent, NpcThinkJob};

/// Channel capacity — bounds memory usage and back-pressure.
const JOB_CHANNEL_SIZE: usize = 256;
const INTENT_CHANNEL_SIZE: usize = 256;

/// Owns the Tokio runtime and channels for NPC AI planning.
pub struct AiRuntime {
    _runtime: Arc<Runtime>,
    job_tx: Sender<NpcThinkJob>,
    intent_rx: Receiver<NpcIntent>,
}

impl AiRuntime {
    /// Start the Tokio runtime and spawn the job consumer loop.
    pub fn start() -> Self {
        let runtime = Arc::new(
            tokio::runtime::Builder::new_multi_thread()
                .worker_threads(2)
                .thread_name("npc-planner")
                .enable_all()
                .build()
                .expect("failed to create Tokio runtime for NPC planner"),
        );

        let (job_tx, job_rx) = bounded::<NpcThinkJob>(JOB_CHANNEL_SIZE);
        let (intent_tx, intent_rx) = bounded::<NpcIntent>(INTENT_CHANNEL_SIZE);

        // Spawn the consumer loop inside the Tokio runtime
        let rt = Arc::clone(&runtime);
        rt.spawn(async move {
            consumer_loop(job_rx, intent_tx).await;
        });

        Self {
            _runtime: runtime,
            job_tx,
            intent_rx,
        }
    }

    /// Submit an NPC observation for async planning. Non-blocking.
    /// Returns false if the channel is full (back-pressure).
    pub fn submit_job(&self, job: NpcThinkJob) -> bool {
        self.job_tx.try_send(job).is_ok()
    }

    /// Drain all completed intents. Called on each server tick.
    pub fn poll_intents(&self) -> Vec<NpcIntent> {
        let mut intents = Vec::new();
        while let Ok(intent) = self.intent_rx.try_recv() {
            intents.push(intent);
        }
        intents
    }
}

/// Consumer loop — receives jobs from the server tick thread,
/// spawns a Tokio task per job, and sends completed intents back.
async fn consumer_loop(job_rx: Receiver<NpcThinkJob>, intent_tx: Sender<NpcIntent>) {
    loop {
        let job = match job_rx.recv() {
            Ok(job) => job,
            Err(_) => break, // channel closed, runtime shutting down
        };

        let tx = intent_tx.clone();
        tokio::spawn(async move {
            let intent = plan_npc(job.observation).await;
            let _ = tx.try_send(intent);
        });
    }
}

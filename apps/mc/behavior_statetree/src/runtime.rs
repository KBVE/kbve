//! Runtime hosting a headless Bevy ECS App on a dedicated thread.
//!
//! Bevy's App is not Send, so it runs on its own OS thread (not Tokio).
//! Crossbeam channels bridge the JNI thread and the ECS thread.

use std::time::Duration;

use bevy::MinimalPlugins;
use bevy::app::App;
use crossbeam_channel::{Receiver, Sender, bounded};
use tracing::{debug, warn};

use crate::ecs::AiBehaviorPlugin;
use crate::ecs::events::{
    IntentBuffer, ObservationBuffer, PlayerObservationBuffer, WorldIntentBuffer,
};
use crate::types::{NpcIntent, NpcThinkJob, PlayerSnapshot};

const JOB_CHANNEL_SIZE: usize = 256;
const PLAYER_SNAPSHOT_CHANNEL_SIZE: usize = 64;
const INTENT_CHANNEL_SIZE: usize = 256;
const ECS_TICK_INTERVAL: Duration = Duration::from_millis(100);

/// Owns the ECS thread and JNI channels.
pub struct AiRuntime {
    job_tx: Sender<NpcThinkJob>,
    player_tx: Sender<PlayerSnapshot>,
    intent_rx: Receiver<NpcIntent>,
}

impl AiRuntime {
    pub fn start() -> Self {
        let (job_tx, job_rx) = bounded::<NpcThinkJob>(JOB_CHANNEL_SIZE);
        let (player_tx, player_rx) = bounded::<PlayerSnapshot>(PLAYER_SNAPSHOT_CHANNEL_SIZE);
        let (intent_tx, intent_rx) = bounded::<NpcIntent>(INTENT_CHANNEL_SIZE);

        // Dedicated OS thread for the Bevy App (not Send, can't use Tokio)
        std::thread::Builder::new()
            .name("npc-ecs".into())
            .spawn(move || {
                ecs_tick_loop(job_rx, player_rx, intent_tx);
            })
            .expect("failed to spawn NPC ECS thread");

        Self {
            job_tx,
            player_tx,
            intent_rx,
        }
    }

    pub fn submit_job(&self, job: NpcThinkJob) -> bool {
        self.job_tx.try_send(job).is_ok()
    }

    pub fn submit_player_snapshot(&self, snapshot: PlayerSnapshot) -> bool {
        self.player_tx.try_send(snapshot).is_ok()
    }

    pub fn poll_intents(&self) -> Vec<NpcIntent> {
        let mut intents = Vec::new();
        while let Ok(intent) = self.intent_rx.try_recv() {
            intents.push(intent);
        }
        intents
    }
}

fn ecs_tick_loop(
    job_rx: Receiver<NpcThinkJob>,
    player_rx: Receiver<PlayerSnapshot>,
    intent_tx: Sender<NpcIntent>,
) {
    let mut app = App::new();
    app.add_plugins(MinimalPlugins);
    app.add_plugins(AiBehaviorPlugin);

    debug!("Bevy ECS App initialized (headless, MinimalPlugins) on dedicated thread");

    loop {
        // Drain per-NPC observations into the ECS buffer
        {
            let mut obs_buffer = app.world_mut().resource_mut::<ObservationBuffer>();
            while let Ok(job) = job_rx.try_recv() {
                obs_buffer.pending.push(job.observation);
            }
        }

        // Drain world player snapshots into the ECS buffer
        {
            let mut player_buffer = app.world_mut().resource_mut::<PlayerObservationBuffer>();
            while let Ok(snapshot) = player_rx.try_recv() {
                player_buffer.pending.push(snapshot);
            }
        }

        // Tick the Bevy App — runs ingest, plan, and population systems
        app.update();

        // Drain per-NPC intent buffer
        {
            let mut intent_buffer = app.world_mut().resource_mut::<IntentBuffer>();
            for intent in intent_buffer.ready.drain(..) {
                let npc_intent = NpcIntent {
                    entity_id: intent.entity_id,
                    epoch: intent.epoch,
                    commands: intent.commands,
                };
                if intent_tx.try_send(npc_intent).is_err() {
                    warn!(
                        "Intent channel full — dropping intent for entity {}",
                        intent.entity_id
                    );
                }
            }
        }

        // Drain world-level intent buffer (spawn / despawn) — same channel
        // back to Java; entity_id=0 distinguishes them from per-NPC intents.
        {
            let mut world_buffer = app.world_mut().resource_mut::<WorldIntentBuffer>();
            for intent in world_buffer.ready.drain(..) {
                let npc_intent = NpcIntent {
                    entity_id: intent.entity_id,
                    epoch: intent.epoch,
                    commands: intent.commands,
                };
                if intent_tx.try_send(npc_intent).is_err() {
                    warn!("Intent channel full — dropping world intent");
                }
            }
        }

        std::thread::sleep(ECS_TICK_INTERVAL);
    }
}

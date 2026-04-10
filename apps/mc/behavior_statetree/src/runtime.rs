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
use crate::ecs::events::{IntentBuffer, ObservationBuffer};
use crate::types::{NpcIntent, NpcThinkJob};

const JOB_CHANNEL_SIZE: usize = 256;
const INTENT_CHANNEL_SIZE: usize = 256;
const ECS_TICK_INTERVAL: Duration = Duration::from_millis(100);

/// Owns the ECS thread and JNI channels.
pub struct AiRuntime {
    job_tx: Sender<NpcThinkJob>,
    intent_rx: Receiver<NpcIntent>,
}

impl AiRuntime {
    pub fn start() -> Self {
        let (job_tx, job_rx) = bounded::<NpcThinkJob>(JOB_CHANNEL_SIZE);
        let (intent_tx, intent_rx) = bounded::<NpcIntent>(INTENT_CHANNEL_SIZE);

        // Dedicated OS thread for the Bevy App (not Send, can't use Tokio)
        std::thread::Builder::new()
            .name("npc-ecs".into())
            .spawn(move || {
                ecs_tick_loop(job_rx, intent_tx);
            })
            .expect("failed to spawn NPC ECS thread");

        Self { job_tx, intent_rx }
    }

    pub fn submit_job(&self, job: NpcThinkJob) -> bool {
        self.job_tx.try_send(job).is_ok()
    }

    pub fn poll_intents(&self) -> Vec<NpcIntent> {
        let mut intents = Vec::new();
        while let Ok(intent) = self.intent_rx.try_recv() {
            intents.push(intent);
        }
        intents
    }
}

fn ecs_tick_loop(job_rx: Receiver<NpcThinkJob>, intent_tx: Sender<NpcIntent>) {
    let mut app = App::new();
    app.add_plugins(MinimalPlugins);
    app.add_plugins(AiBehaviorPlugin);

    debug!("Bevy ECS App initialized (headless, MinimalPlugins) on dedicated thread");

    loop {
        // Drain observations into ECS resource buffer
        {
            let mut obs_buffer = app.world_mut().resource_mut::<ObservationBuffer>();
            while let Ok(job) = job_rx.try_recv() {
                obs_buffer.pending.push(job.observation);
            }
        }

        // Tick the Bevy App
        app.update();

        // Drain intent buffer and send through channel
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

        std::thread::sleep(ECS_TICK_INTERVAL);
    }
}

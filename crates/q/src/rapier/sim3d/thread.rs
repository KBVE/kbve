//! The physics pillar's thread: a fixed-tick loop that never blocks on the app.

use std::sync::Arc;
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};

use tokio::sync::mpsc::{self, UnboundedReceiver, UnboundedSender, error::TryRecvError};
use tokio::sync::watch;

use super::types::{SimCommand, SimConfig, SimSnapshot};
use super::world::SimWorld;

/// App-side handle to a running sim.
pub struct PhysicsHandle {
    /// Kept private and never cloned out: closing this channel is what tells the loop
    /// to exit, so a stray clone elsewhere would leak the thread.
    cmd_tx: Option<UnboundedSender<SimCommand>>,
    snap_rx: watch::Receiver<Arc<SimSnapshot>>,
    join: Option<JoinHandle<()>>,
}

impl PhysicsHandle {
    pub fn spawn(config: SimConfig) -> Self {
        let (cmd_tx, cmd_rx) = mpsc::unbounded_channel();
        let (snap_tx, snap_rx) = watch::channel(Arc::new(SimSnapshot::default()));

        let join = thread::Builder::new()
            .name("q-physics3d".into())
            .spawn(move || run(config, cmd_rx, snap_tx))
            .expect("q: failed to spawn physics thread");

        Self {
            cmd_tx: Some(cmd_tx),
            snap_rx,
            join: Some(join),
        }
    }

    /// Queues a command for the next tick.
    pub fn send(&self, cmd: SimCommand) -> bool {
        self.cmd_tx
            .as_ref()
            .map(|tx| tx.send(cmd).is_ok())
            .unwrap_or(false)
    }

    /// The most recent published state.
    pub fn latest(&self) -> Arc<SimSnapshot> {
        self.snap_rx.borrow().clone()
    }

    /// True when a new snapshot has landed since the last `latest()` — lets the app
    /// skip re-applying transforms on frames that outran the sim.
    pub fn has_update(&mut self) -> bool {
        self.snap_rx.has_changed().unwrap_or(false)
    }

    pub fn latest_if_changed(&mut self) -> Option<Arc<SimSnapshot>> {
        match self.snap_rx.has_changed() {
            Ok(true) => Some(self.snap_rx.borrow_and_update().clone()),
            _ => None,
        }
    }
}

impl Drop for PhysicsHandle {
    fn drop(&mut self) {
        self.cmd_tx.take();
        if let Some(join) = self.join.take() {
            let _ = join.join();
        }
    }
}

fn run(
    config: SimConfig,
    mut cmd_rx: UnboundedReceiver<SimCommand>,
    snap_tx: watch::Sender<Arc<SimSnapshot>>,
) {
    let mut world = SimWorld::new(&config);
    let dt = Duration::from_secs_f64(config.timestep());
    let mut next_tick = Instant::now() + dt;

    loop {
        loop {
            match cmd_rx.try_recv() {
                Ok(cmd) => world.apply(cmd),
                Err(TryRecvError::Empty) => break,
                Err(TryRecvError::Disconnected) => return,
            }
        }

        let mut stepped = 0;
        while Instant::now() >= next_tick && stepped < config.max_steps_per_pass {
            world.step();
            next_tick += dt;
            stepped += 1;
        }

        if stepped == config.max_steps_per_pass && Instant::now() >= next_tick {
            next_tick = Instant::now() + dt;
        }

        if stepped > 0 {
            let mut snapshot = SimSnapshot::default();
            world.snapshot_into(&mut snapshot);
            let _ = snap_tx.send(Arc::new(snapshot));
        }

        if let Some(idle) = next_tick.checked_duration_since(Instant::now()) {
            thread::sleep(idle);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::rapier::sim3d::types::{BodyDesc, BodyId, Iso};

    fn wait_for<T>(mut f: impl FnMut() -> Option<T>, timeout: Duration) -> Option<T> {
        let deadline = Instant::now() + timeout;
        while Instant::now() < deadline {
            if let Some(v) = f() {
                return Some(v);
            }
            thread::sleep(Duration::from_millis(5));
        }
        None
    }

    #[test]
    fn thread_steps_and_publishes_snapshots() {
        let sim = PhysicsHandle::spawn(SimConfig::default());
        sim.send(SimCommand::Spawn {
            id: BodyId(1),
            desc: BodyDesc {
                iso: Iso::at(0.0, 20.0, 0.0),
                ..Default::default()
            },
        });

        let fell = wait_for(
            || {
                let snap = sim.latest();
                snap.body(BodyId(1))
                    .filter(|b| b.iso.pos[1] < 19.5)
                    .map(|_| snap.tick)
            },
            Duration::from_secs(5),
        );
        assert!(fell.is_some(), "expected the body to fall within 5s");
    }

    #[test]
    fn commands_sent_before_first_step_are_not_lost() {
        let sim = PhysicsHandle::spawn(SimConfig::default());
        for id in 0..8u32 {
            assert!(sim.send(SimCommand::Spawn {
                id: BodyId(id),
                desc: BodyDesc::default(),
            }));
        }

        let count = wait_for(
            || {
                let snap = sim.latest();
                (snap.bodies.len() == 8).then_some(8)
            },
            Duration::from_secs(5),
        );
        assert_eq!(count, Some(8), "all pre-start commands should apply");
    }

    #[test]
    fn dropping_the_handle_stops_the_thread() {
        let sim = PhysicsHandle::spawn(SimConfig::default());
        sim.send(SimCommand::Spawn {
            id: BodyId(1),
            desc: BodyDesc::default(),
        });
        wait_for(
            || (sim.latest().tick > 0).then_some(()),
            Duration::from_secs(5),
        );
        drop(sim);
    }

    #[test]
    fn latest_if_changed_reports_once_per_publish() {
        let mut sim = PhysicsHandle::spawn(SimConfig::default());
        sim.send(SimCommand::Spawn {
            id: BodyId(1),
            desc: BodyDesc::default(),
        });

        assert!(
            wait_for(
                || sim.latest_if_changed().map(|_| ()),
                Duration::from_secs(5)
            )
            .is_some(),
            "expected at least one published snapshot"
        );
        assert!(
            sim.latest_if_changed().is_none(),
            "a second read with no intervening tick should report no change"
        );
    }
}

//! Every character's condition, stepped at a fixed rate away from whatever is drawing
//! them.
//!
//! Two pieces, deliberately separate:
//!
//! * [`World`] is the simulation — a map of characters and a `step`. It owns no threads
//!   and does no waiting, so the dedicated server can drive it inside its own tick loop
//!   and a test can drive it a thousand ticks in a millisecond.
//! * [`Sim`] runs a [`World`] on a thread of its own, taking commands down one channel and
//!   posting snapshots up another.
//!
//! What this buys is not frames. Regenerating three numbers for a few dozen characters is
//! microseconds, and moving it off the main thread costs a synchronisation that is the
//! same order as the work. What it buys is that the rule lives in one place: the same
//! `step` runs on the server that decides and the client that draws, at a rate that does
//! not change when the frame rate does.

use std::collections::BTreeMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{Receiver, Sender, SyncSender, TryRecvError, sync_channel};
use std::sync::{Arc, mpsc};
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};

use super::{Attribute, Attributes, PoolKind, VitalEvent, Vitals};

pub type CharacterId = u64;

/// The rate the world is stepped at, chosen to match the dedicated server's snapshot rate
/// so that a number is not computed at two different cadences on the two machines.
pub const TICK_HZ: u32 = 20;

/// Something done to a character. Every write goes through one of these, so the only thing
/// that ever touches a [`Vitals`] is the step that owns it.
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Command {
    Spawn {
        id: CharacterId,
        attributes: Attributes,
    },
    Despawn {
        id: CharacterId,
    },
    Damage {
        id: CharacterId,
        amount: f32,
    },
    Heal {
        id: CharacterId,
        amount: f32,
    },
    Revive {
        id: CharacterId,
        fraction: f32,
    },
    /// All of it or none of it.
    Spend {
        id: CharacterId,
        pool: PoolKind,
        amount: f32,
    },
    /// As much of it as there is.
    Drain {
        id: CharacterId,
        pool: PoolKind,
        amount: f32,
    },
    Award {
        id: CharacterId,
        experience: u32,
    },
    Invest {
        id: CharacterId,
        attribute: Attribute,
    },
}

/// One character as of one tick, flattened into what a reader actually wants.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Row {
    pub id: CharacterId,
    pub health: f32,
    pub health_max: f32,
    pub mana: f32,
    pub mana_max: f32,
    pub energy: f32,
    pub energy_max: f32,
    pub experience: u32,
    pub down: bool,
    pub strength: u16,
    pub skill: u16,
    pub will: u16,
}

/// The world as of one tick. Whole rather than delta: a few dozen characters is a few
/// kilobytes, and a reader that misses one is corrected by the next rather than left
/// holding a half-applied change.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct Snapshot {
    pub tick: u64,
    pub rows: Vec<Row>,
    pub events: Vec<(CharacterId, VitalEvent)>,
}

impl Snapshot {
    pub fn row(&self, id: CharacterId) -> Option<&Row> {
        self.rows.iter().find(|row| row.id == id)
    }
}

/// The simulation. Ordered by id so a snapshot is the same list in the same order every
/// tick, which is what makes two runs comparable at all.
#[derive(Debug, Default)]
pub struct World {
    characters: BTreeMap<CharacterId, Vitals>,
    tick: u64,
    events: Vec<(CharacterId, VitalEvent)>,
}

impl World {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn len(&self) -> usize {
        self.characters.len()
    }

    pub fn is_empty(&self) -> bool {
        self.characters.is_empty()
    }

    pub fn get(&self, id: CharacterId) -> Option<&Vitals> {
        self.characters.get(&id)
    }

    /// Applies one command. Commands naming a character who is not here are dropped rather
    /// than resurrecting them: a despawn racing an attack is a normal thing to happen, not
    /// an error worth the noise.
    pub fn apply(&mut self, command: Command) {
        match command {
            Command::Spawn { id, attributes } => {
                self.characters
                    .entry(id)
                    .or_insert_with(|| Vitals::new(attributes));
            }
            Command::Despawn { id } => {
                self.characters.remove(&id);
            }
            Command::Damage { id, amount } => self.mutate(id, |v| v.damage(amount)),
            Command::Heal { id, amount } => self.mutate(id, |v| v.heal(amount)),
            Command::Revive { id, fraction } => self.mutate(id, |v| v.revive(fraction)),
            Command::Spend { id, pool, amount } => self.mutate(id, |v| {
                v.spend(pool, amount);
                None
            }),
            Command::Drain { id, pool, amount } => self.mutate(id, |v| {
                v.drain(pool, amount);
                None
            }),
            Command::Award { id, experience } => self.mutate(id, |v| {
                v.award(experience);
                None
            }),
            Command::Invest { id, attribute } => self.mutate(id, |v| v.invest(attribute)),
        }
    }

    fn mutate(&mut self, id: CharacterId, change: impl FnOnce(&mut Vitals) -> Option<VitalEvent>) {
        let Some(vitals) = self.characters.get_mut(&id) else {
            return;
        };
        if let Some(event) = change(vitals) {
            self.events.push((id, event));
        }
    }

    /// One tick of time passing.
    pub fn step(&mut self, dt: f32) {
        for (id, vitals) in self.characters.iter_mut() {
            if let Some(event) = vitals.tick(dt) {
                self.events.push((*id, event));
            }
        }
        self.tick += 1;
    }

    /// The world as it stands, taking the events with it — they are news exactly once.
    pub fn snapshot(&mut self) -> Snapshot {
        let rows = self
            .characters
            .iter()
            .map(|(id, vitals)| Row {
                id: *id,
                health: vitals.pool(PoolKind::Health).current(),
                health_max: vitals.pool(PoolKind::Health).max(),
                mana: vitals.pool(PoolKind::Mana).current(),
                mana_max: vitals.pool(PoolKind::Mana).max(),
                energy: vitals.pool(PoolKind::Energy).current(),
                energy_max: vitals.pool(PoolKind::Energy).max(),
                experience: vitals.experience(),
                down: vitals.is_down(),
                strength: vitals.attributes.strength,
                skill: vitals.attributes.skill,
                will: vitals.attributes.will,
            })
            .collect();
        Snapshot {
            tick: self.tick,
            rows,
            events: std::mem::take(&mut self.events),
        }
    }
}

/// A [`World`] running on its own thread.
///
/// Commands are queued and applied at the top of a tick rather than the instant they are
/// sent. Order is kept, but two commands sent together are not atomic: the tick that picks
/// up the first need not be the one that picks up the second, so a reader can see the
/// world between them.
pub struct Sim {
    commands: Sender<Command>,
    snapshots: Receiver<Snapshot>,
    stop: Arc<AtomicBool>,
    handle: Option<JoinHandle<()>>,
}

/// Two deep. One being read while one is being written is the whole requirement; a longer
/// queue only means a reader falling behind is handed staler news.
const SNAPSHOT_DEPTH: usize = 2;

impl Sim {
    pub fn spawn(tick_hz: u32) -> Self {
        let hz = tick_hz.max(1);
        let dt = 1.0 / hz as f32;
        let period = Duration::from_secs_f64(1.0 / f64::from(hz));
        let (commands, command_rx) = mpsc::channel::<Command>();
        let (snapshot_tx, snapshots) = sync_channel::<Snapshot>(SNAPSHOT_DEPTH);
        let stop = Arc::new(AtomicBool::new(false));
        let stop_flag = Arc::clone(&stop);

        let handle = thread::Builder::new()
            .name("q-vitals".to_string())
            .spawn(move || run(command_rx, snapshot_tx, stop_flag, dt, period))
            .expect("q: failed to spawn the vitals thread");

        Self {
            commands,
            snapshots,
            stop,
            handle: Some(handle),
        }
    }

    /// Queues a command. A dead sim swallows it rather than panicking: the thread going
    /// away during shutdown is ordinary, and there is nothing useful to do about it from
    /// the caller's side.
    pub fn send(&self, command: Command) {
        let _ = self.commands.send(command);
    }

    /// The newest snapshot waiting, or `None` if none has arrived since the last call.
    /// Older ones are discarded rather than queued through — a reader that stalled for
    /// three frames wants the world as it is, not three frames of catching up.
    pub fn latest(&self) -> Option<Snapshot> {
        let mut newest = None;
        while let Ok(snapshot) = self.snapshots.try_recv() {
            newest = Some(snapshot);
        }
        newest
    }
}

impl Drop for Sim {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::Release);
        if let Some(handle) = self.handle.take() {
            let _ = handle.join();
        }
    }
}

/// Events are carried forward when a snapshot cannot be posted, so a downed character is
/// still news once the reader catches up rather than lost to a full queue.
fn run(
    commands: Receiver<Command>,
    snapshots: SyncSender<Snapshot>,
    stop: Arc<AtomicBool>,
    dt: f32,
    period: Duration,
) {
    let mut world = World::new();
    let mut carried: Vec<(CharacterId, VitalEvent)> = Vec::new();
    let mut next = Instant::now() + period;

    while !stop.load(Ordering::Acquire) {
        loop {
            match commands.try_recv() {
                Ok(command) => world.apply(command),
                Err(TryRecvError::Empty) => break,
                Err(TryRecvError::Disconnected) => return,
            }
        }

        world.step(dt);
        let mut snapshot = world.snapshot();
        if !carried.is_empty() {
            carried.append(&mut snapshot.events);
            snapshot.events = std::mem::take(&mut carried);
        }
        if let Err(mpsc::TrySendError::Full(unsent)) = snapshots.try_send(snapshot) {
            carried = unsent.events;
        }

        let now = Instant::now();
        if next > now {
            thread::sleep(next - now);
        } else {
            // Behind: give up the lost time rather than sprinting to catch it, or a
            // machine that stalled for a second runs twenty ticks with no sleep between.
            next = now;
        }
        next += period;
    }
}

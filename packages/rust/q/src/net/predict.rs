//! Client-side prediction for the local player.
//!
//! The host is authoritative and its state arrives late by a round trip, so a client that
//! only draws what it is told answers input a round trip after it was given. Prediction
//! closes that by keeping a private sim, dropping the local body onto the newest
//! authoritative state, and replaying the inputs the host has not confirmed yet.
//!
//! The reason this can be correct rather than approximate is that it does not
//! reimplement anything: the vertical step is [`super::session::step_motion`], the same
//! function the host calls, and the horizontal resolution is a [`SimWorld`] stepped the
//! same way. Give it the same world and the same inputs and it produces the same answer,
//! which the tests assert directly against a real [`super::session::HostSession`] rather
//! than against a transcription of what it does.
//!
//! What it cannot do is predict anyone else. Other players' inputs are not knowable here,
//! and guessing at them produces motion that is wrong in a way interpolation already
//! handles better.

use crate::rapier::sim3d::{BodyId, CharacterDesc, Iso, SimCommand, SimConfig, SimSnapshot};
use crate::rapier::sim3d::{SimWorld, TerrainDesc};

use super::session::{Motion, MovementConfig, PlayerInput, step_motion};

/// A private sim carrying only the local player, used to answer "where would the host
/// have put me by now".
pub struct Predictor {
    world: SimWorld,
    body: BodyId,
    motion: Motion,
    movement: MovementConfig,
    /// Set once the body exists in the private world. Until an authoritative state has
    /// arrived there is nothing meaningful to predict from.
    seeded: bool,
    /// Tick of the snapshot the current prediction was built on, so the same one is not
    /// replayed twice.
    from_tick: Option<u64>,
}

impl Predictor {
    pub fn new(sim: &SimConfig, body: BodyId, movement: MovementConfig) -> Self {
        Self {
            world: SimWorld::new(sim),
            body,
            motion: Motion::default(),
            movement,
            seeded: false,
            from_tick: None,
        }
    }

    /// Hands the private world the same ground the host is standing everyone on.
    ///
    /// Without this the predicted body falls through the floor while the confirmed one
    /// walks on it, which is the loudest possible version of the two disagreeing.
    pub fn set_terrain(&mut self, desc: TerrainDesc) {
        self.world.apply(SimCommand::SetTerrain(desc));
    }

    pub fn add_terrain_region(&mut self, origin: [f32; 2], desc: TerrainDesc) {
        self.world
            .apply(SimCommand::AddTerrainRegion { origin, desc });
    }

    pub fn drop_terrain_region(&mut self, origin: [f32; 2]) {
        self.world.apply(SimCommand::DropTerrainRegion { origin });
    }

    /// Anything else solid the host holds — trees, stones, the bridge. The client places
    /// these deterministically from the seed, so they can be published here from the same
    /// loop that draws them.
    pub fn world_mut(&mut self) -> &mut SimWorld {
        &mut self.world
    }

    pub fn set_movement(&mut self, movement: MovementConfig) {
        self.movement = movement;
    }

    /// Where the local body is predicted to be, or `None` before the first snapshot.
    pub fn position(&self) -> Option<[f32; 3]> {
        self.seeded
            .then(|| self.world.snapshot().body(self.body).map(|b| b.iso.pos))
            .flatten()
    }

    pub fn grounded(&self) -> bool {
        self.world
            .snapshot()
            .body(self.body)
            .is_some_and(|b| b.grounded)
    }

    /// Rebuilds the prediction: snap to the authoritative state, then replay everything
    /// the host has not confirmed.
    ///
    /// Called with the newest snapshot and the client's pending inputs. Replaying from
    /// the authority every time rather than accumulating is what stops predicted error
    /// from compounding — each answer is at most `pending` ticks away from something the
    /// host actually said.
    pub fn reconcile(&mut self, snapshot: &SimSnapshot, pending: &[PlayerInput], water_y: f32) {
        let Some(confirmed) = snapshot.body(self.body) else {
            return;
        };
        // Nothing new to build on. Replaying the same snapshot again would apply the
        // pending inputs a second time and walk the body forward on its own.
        if self.from_tick == Some(snapshot.tick) {
            return;
        }
        self.from_tick = Some(snapshot.tick);

        if !self.seeded {
            self.world.apply(SimCommand::SpawnCharacter {
                id: self.body,
                desc: CharacterDesc {
                    iso: confirmed.iso,
                    ..Default::default()
                },
            });
            self.seeded = true;
        }

        self.world.apply(SimCommand::SetKinematicTarget {
            id: self.body,
            iso: confirmed.iso,
        });
        // The host does not send its integrated vel_y, but rapier derives a linear
        // velocity for kinematic characters, so the confirmed body carries the same
        // number in all but name. Seeding from it keeps a replayed jump on the arc the
        // host is already flying rather than restarting it from rest.
        self.motion.vel_y = confirmed.linvel[1];
        self.world.step();

        for input in pending {
            let state = self.world.snapshot();
            let Some(body) = state.body(self.body) else {
                return;
            };
            let grounded = body.grounded;
            let submerged = body.iso.pos[1] < water_y;
            let translation = step_motion(
                &mut self.motion,
                input,
                grounded,
                submerged,
                &self.movement,
                self.movement.timestep as f32,
            );
            self.world.apply(SimCommand::MoveCharacter {
                id: self.body,
                translation,
            });
            self.world.step();
        }
    }

    /// Distance between the prediction and what the host confirmed, for whoever is
    /// deciding whether to blend the correction or take it whole.
    pub fn error_against(&self, snapshot: &SimSnapshot) -> Option<f32> {
        let predicted = self.position()?;
        let confirmed = snapshot.body(self.body)?.iso.pos;
        let (dx, dy, dz) = (
            predicted[0] - confirmed[0],
            predicted[1] - confirmed[1],
            predicted[2] - confirmed[2],
        );
        Some((dx * dx + dy * dy + dz * dz).sqrt())
    }
}

/// Convenience for the common shape: an `Iso` at a position, no rotation.
pub fn iso_at(pos: [f32; 3]) -> Iso {
    Iso {
        pos,
        ..Default::default()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::net::session::{ClientSession, HostSession, SessionConfig, player_body};
    use crate::net::transport::Loopback;
    use std::sync::Arc;

    fn flat_terrain() -> TerrainDesc {
        TerrainDesc {
            heights: Arc::new(vec![0.0; 33 * 33]),
            resolution: 33,
            extent: 64.0,
        }
    }

    fn host_and_client() -> (HostSession<Loopback>, ClientSession<Loopback>) {
        let mesh = Loopback::mesh(2);
        let mut host = HostSession::new(
            mesh[0].clone(),
            SessionConfig::default(),
            SimConfig::default(),
            42,
        );
        host.set_terrain(flat_terrain());
        let client = ClientSession::connect(mesh[1].clone());
        (host, client)
    }

    /// The whole claim of this module. If the predictor and the host can disagree while
    /// holding the same world and the same inputs, prediction is guesswork and the
    /// corrections will show.
    #[test]
    fn a_prediction_lands_where_the_host_puts_the_body() {
        let (mut host, mut client) = host_and_client();
        for _ in 0..4 {
            host.tick();
            client.tick();
        }
        let me = client.peer().expect("welcomed");
        let movement = client.movement().expect("welcomed");
        let body = player_body(me);

        let mut predictor = Predictor::new(&SimConfig::default(), body, movement);
        predictor.set_terrain(flat_terrain());

        // Walk for a while, reconciling from every snapshot exactly as the game would.
        for _ in 0..90 {
            client.set_input([1.0, 0.0], false, 0.0);
            host.tick();
            client.tick();
            if let Some(snapshot) = client.latest_snapshot() {
                predictor.reconcile(snapshot, client.pending_inputs(), -1000.0);
            }
        }

        let confirmed = host
            .world_mut()
            .snapshot()
            .body(body)
            .expect("host has a body for us")
            .iso
            .pos;
        let predicted = predictor.position().expect("seeded by now");

        let (dx, dz) = (predicted[0] - confirmed[0], predicted[2] - confirmed[2]);
        let drift = (dx * dx + dz * dz).sqrt();
        assert!(
            drift < 0.35,
            "predicted {predicted:?} against confirmed {confirmed:?}, drift {drift}"
        );
        assert!(
            predicted[0] > 1.0,
            "the body should have travelled at all, got {predicted:?}"
        );
    }

    /// Replay is what buys the latency back: the prediction has to be ahead of the state
    /// it was built from, by roughly the inputs still in flight.
    #[test]
    fn the_prediction_leads_the_confirmed_state() {
        let (mut host, mut client) = host_and_client();
        for _ in 0..4 {
            host.tick();
            client.tick();
        }
        let movement = client.movement().expect("welcomed");
        let body = client.local_body().expect("welcomed");

        let mut predictor = Predictor::new(&SimConfig::default(), body, movement);
        predictor.set_terrain(flat_terrain());

        // Inputs accrue without the host being ticked, so none of them are confirmed.
        for _ in 0..40 {
            client.set_input([1.0, 0.0], false, 0.0);
        }
        let snapshot = client
            .latest_snapshot()
            .cloned()
            .expect("a snapshot landed");
        let pending = client.pending_inputs().to_vec();
        assert!(!pending.is_empty(), "nothing to replay");

        predictor.reconcile(&snapshot, &pending, -1000.0);
        let led = predictor
            .error_against(&snapshot)
            .expect("prediction exists");
        assert!(
            led > 0.1,
            "replaying {} inputs moved the body {led}",
            pending.len()
        );
    }

    /// Snapshots repeat on the wire — `NetClientHandle` republishes its state every
    /// client tick whether or not a new one arrived. Replaying the same one twice would
    /// apply the pending inputs again and walk the body off on its own.
    #[test]
    fn the_same_snapshot_twice_does_not_advance_the_prediction() {
        let (mut host, mut client) = host_and_client();
        for _ in 0..4 {
            host.tick();
            client.tick();
        }
        let movement = client.movement().expect("welcomed");
        let body = client.local_body().expect("welcomed");

        let mut predictor = Predictor::new(&SimConfig::default(), body, movement);
        predictor.set_terrain(flat_terrain());

        for _ in 0..20 {
            client.set_input([1.0, 0.0], false, 0.0);
        }
        let snapshot = client
            .latest_snapshot()
            .cloned()
            .expect("a snapshot landed");
        let pending = client.pending_inputs().to_vec();

        predictor.reconcile(&snapshot, &pending, -1000.0);
        let once = predictor.position().expect("seeded");
        predictor.reconcile(&snapshot, &pending, -1000.0);
        let twice = predictor.position().expect("seeded");

        assert_eq!(
            once, twice,
            "the same snapshot moved the prediction a second time"
        );
    }
}

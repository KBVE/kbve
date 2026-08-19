//! Godot adapter for a networked session.

use std::collections::{HashMap, HashSet};

use godot::classes::{Engine, INode3D, Node3D};
use godot::prelude::*;

use super::bridge3d::apply_iso;
use super::net_interp::{InterpConfig, SnapshotBuffer};
use super::sim3d::BodyId;
use crate::harvest::HarvestTarget;
use crate::net::client_thread::{
    HarvestCommand, Intent, NetClientHandle, NetClientState, PetCommand,
};
use crate::net::pets::{PET_BODY_BASE, PetId};
use crate::net::session::ClientStatus;

/// True for a body id inside the band the host reserves for pets.
///
/// Classified by id rather than by looking it up in the pet roster: bodies arrive
/// in the snapshot, which is unreliable and frequent, while the roster is reliable
/// and only sent on change. A pet's body can turn up first, and a client that
/// waited for the roster to recognise it would spawn a player avatar for a robot.
fn is_pet(id: BodyId) -> bool {
    id.0 >= PET_BODY_BASE
}

#[derive(GodotClass)]
#[class(init, base = Node3D)]
pub struct QNetClient3D {
    base: Base<Node3D>,

    #[export]
    #[init(val = "ws://127.0.0.1:7980/ws".into())]
    server_url: GString,
    #[export]
    #[init(val = 60.0)]
    tick_hz: f64,
    /// Name to ask for.
    #[export]
    player_name: GString,
    /// Bearer token to join with.
    #[export]
    access_token: GString,
    /// Connect in `_ready`.
    #[export]
    autoconnect: bool,

    /// Seconds behind the newest snapshot that other players are drawn. Has to cover one
    /// snapshot interval plus jitter — under that the buffer runs dry and they stutter;
    /// over it they are needlessly late.
    #[export]
    #[init(val = 0.1)]
    interp_delay: f64,
    /// Carry our own body forward from the newest snapshot instead of drawing it in the
    /// past with everyone else.
    #[export]
    #[init(val = true)]
    lead_local_body: bool,

    client: Option<NetClientHandle>,
    /// Every stage this session has been told about, keyed by target and prop.
    ///
    /// The host says each of these exactly once -- as a delta when it happens, or in the
    /// ledger replayed on join -- and whoever is listening at that moment is whoever
    /// hears it. The listener is a tool on the local avatar, which does not exist until
    /// a body arrives, which is after the ledger. Keeping them lets it ask.
    harvest_seen: HashMap<(i64, i64), i64>,
    tracked: HashMap<BodyId, Gd<Node3D>>,
    known: HashSet<BodyId>,
    last: Option<NetClientState>,
    buffer: SnapshotBuffer,
}

#[godot_api]
impl INode3D for QNetClient3D {
    fn ready(&mut self) {
        if Engine::singleton().is_editor_hint() {
            return;
        }
        if self.autoconnect {
            self.connect_to_server();
        }
    }

    /// Draining the session and drawing it are deliberately separate: state arrives at
    /// the host's snapshot rate, but the render clock has to move every frame or bodies
    /// sit still between arrivals, which is the staircase interpolation exists to remove.
    fn process(&mut self, delta: f64) {
        // Re-read every frame rather than at connect, so the delay can be tuned against a
        // live session instead of only across a reconnect.
        self.buffer.set_config(InterpConfig {
            delay: self.interp_delay.max(0.0),
            ..InterpConfig::default()
        });
        self.drain_session();
        self.drain_harvest();
        self.drain_pet_denials();
        self.buffer.advance(delta);
        self.draw();
    }
}

impl QNetClient3D {
    /// Picks up whatever the session thread has published since the last frame, files any
    /// new snapshot, and reports what changed.
    fn drain_session(&mut self) {
        let Some(state) = self.client.as_mut().and_then(|c| c.state_if_changed()) else {
            return;
        };

        let roster_changed = self
            .last
            .as_ref()
            .is_none_or(|previous| previous.roster != state.roster);
        let status_changed = self.last.as_ref().map(|s| s.status) != Some(state.status);
        let pets_changed = self
            .last
            .as_ref()
            .is_none_or(|previous| previous.pets != state.pets);

        self.last = Some((*state).clone());

        if status_changed {
            match state.status {
                ClientStatus::Joined => {
                    let seed = state.seed.unwrap_or(0) as i64;
                    let name = GString::from(state.name.clone().unwrap_or_default().as_str());
                    self.signals().joined().emit(seed, &name);
                }
                ClientStatus::Rejected => {
                    let reason = GString::from(state.error.clone().unwrap_or_default().as_str());
                    self.signals().rejected().emit(&reason);
                }
                ClientStatus::Connecting => {}
            }
        }

        // The session thread republishes its state every tick whether or not a snapshot
        // came with it, so most of these are the same one over again.
        if let Some(snapshot) = state.snapshot.as_ref()
            && self.buffer.push(snapshot.clone())
        {
            let live: HashSet<BodyId> = snapshot.bodies.iter().map(|b| b.id).collect();
            let added: Vec<BodyId> = live.difference(&self.known).copied().collect();
            let removed: Vec<BodyId> = self.known.difference(&live).copied().collect();
            self.known = live;

            for id in added {
                if is_pet(id) {
                    self.signals().pet_added().emit(id.0 as i64);
                } else {
                    self.signals().body_added().emit(id.0 as i64);
                }
            }
            for id in removed {
                self.tracked.remove(&id);
                if is_pet(id) {
                    self.signals().pet_removed().emit(id.0 as i64);
                } else {
                    self.signals().body_removed().emit(id.0 as i64);
                }
            }
        }

        if roster_changed {
            self.signals().roster_changed().emit();
        }
        if pets_changed {
            self.signals().pets_changed().emit();
        }
    }

    /// Reports every deploy the host turned down, so a button that did nothing can
    /// say why. Drained rather than published with the state, which is latest-wins.
    fn drain_pet_denials(&mut self) {
        let denials = match self.client.as_mut() {
            Some(client) => client.take_pet_denials(),
            None => return,
        };
        for reason in denials {
            self.signals().pet_denied().emit(&GString::from(&reason));
        }
    }

    fn request_harvest(&self, target: HarvestTarget, cell_x: i64, cell_z: i64, ordinal: i64) {
        let Some(client) = self.client.as_ref() else {
            return;
        };
        client.harvest(HarvestCommand::Begin {
            target,
            cell: [cell_x as i32, cell_z as i32],
            ordinal: ordinal.max(0) as u32,
        });
    }

    /// Reports the host's harvest rulings, so whoever owns the scatter can apply
    /// them. Drained every frame; a delta missed is a rock left standing.
    fn drain_harvest(&mut self) {
        let events = match self.client.as_mut() {
            Some(client) => client.take_harvest_events(),
            None => return,
        };
        for event in events {
            let target = match event.target {
                HarvestTarget::Stone => 0,
                HarvestTarget::Tree => 1,
            };
            self.harvest_seen
                .insert((target, event.id as i64), event.stage as i64);
            self.signals()
                .harvest_applied()
                .emit(target, event.id as i64, event.stage as i64);
        }

        let rewards = match self.client.as_mut() {
            Some(client) => client.take_harvest_rewards(),
            None => return,
        };
        for reward in rewards {
            let target = match reward.target {
                HarvestTarget::Stone => 0,
                HarvestTarget::Tree => 1,
            };
            self.signals().harvest_rewarded().emit(
                target,
                reward.id as i64,
                &GString::from(reward.ore),
                reward.amount as i64,
            );
        }
    }

    /// The roster entry for a pet's body, once the reliable list has caught up
    /// with the body the snapshot already carries.
    fn pet_info(&self, body_id: i64) -> Option<&crate::net::pets::PetInfo> {
        let body = BodyId(body_id as u32);
        self.last.as_ref()?.pets.iter().find(|p| p.body == body)
    }

    /// Writes the pose the render clock currently reads onto every tracked node.
    fn draw(&mut self) {
        let local = match self.local_body() {
            -1 => None,
            id => Some(BodyId(id as u32)),
        };
        // Collected because sampling borrows the buffer while the nodes are written.
        let ids: Vec<BodyId> = self.tracked.keys().copied().collect();
        for id in ids {
            let pose = if self.lead_local_body && Some(id) == local {
                self.buffer.sample_leading(id)
            } else {
                self.buffer.sample(id)
            };
            let Some(pose) = pose else {
                continue;
            };
            if let Some(node) = self.tracked.get_mut(&id)
                && node.is_instance_valid()
            {
                apply_iso(node, &pose);
            }
        }
    }
}

#[godot_api]
impl QNetClient3D {
    /// Emitted once the host accepts, carrying the world seed and the name we were
    /// actually given — which is not necessarily the one we asked for.
    #[signal]
    fn joined(seed: i64, name: GString);

    #[signal]
    fn rejected(reason: GString);

    /// Someone joined or left, or a name changed.
    #[signal]
    fn roster_changed();

    /// A body appeared in the server's snapshot.
    #[signal]
    fn body_added(id: i64);

    #[signal]
    fn body_removed(id: i64);

    /// The host ruled on a scattered object. `target` is 0 for stone, 1 for
    /// tree, matching `harvest_stone` / `harvest_tree`.
    #[signal]
    fn harvest_applied(target: i64, id: i64, stage: i64);

    /// The host paid us for finishing something off. Only ever about this player:
    /// everybody's rocks break on `harvest_applied`, but only ours pay.
    ///
    /// `ore` is the item slug, already resolved out of the drop table, so nothing
    /// downstream has to know the table exists.
    #[signal]
    fn harvest_rewarded(target: i64, id: i64, ore: GString, amount: i64);

    /// A pet's body appeared in the snapshot. Distinct from `body_added` because
    /// a robot is not an avatar and must not be drawn as one — and this fires on
    /// the body alone, which may beat the roster that says whose it is.
    #[signal]
    fn pet_added(body_id: i64);

    #[signal]
    fn pet_removed(body_id: i64);

    /// The pet list changed: somebody deployed, recalled, or left.
    #[signal]
    fn pets_changed();

    /// A deploy was turned down, with wording to show the player.
    #[signal]
    fn pet_denied(reason: GString);

    /// Asks the host to put a robot down beside us.
    ///
    /// Only the chassis is ours to choose. Where it lands, what id it gets and
    /// whether we may have it at all are the host's.
    #[func]
    fn deploy_pet(&self, kind: i64) {
        if let Some(client) = self.client.as_ref() {
            client.command_pet(PetCommand::Deploy {
                kind: kind.clamp(0, 255) as u8,
            });
        }
    }

    #[func]
    fn recall_pet(&self, pet_id: i64) {
        if let Some(client) = self.client.as_ref() {
            client.command_pet(PetCommand::Recall(PetId(pet_id.max(0) as u32)));
        }
    }

    #[func]
    fn recall_pets(&self) {
        if let Some(client) = self.client.as_ref() {
            client.command_pet(PetCommand::RecallAll);
        }
    }

    /// Body ids of every pet in the session, in a stable order.
    #[func]
    fn pet_bodies(&self) -> PackedInt64Array {
        self.last
            .as_ref()
            .map(|s| s.pets.iter().map(|p| p.body.0 as i64).collect())
            .unwrap_or_default()
    }

    /// Body ids of the pets we own, which is what a recall menu lists.
    #[func]
    fn my_pet_bodies(&self) -> PackedInt64Array {
        let Some(state) = self.last.as_ref() else {
            return PackedInt64Array::new();
        };
        let Some(me) = state.local_body.map(|b| b.0) else {
            return PackedInt64Array::new();
        };
        state
            .pets
            .iter()
            .filter(|p| crate::net::session::player_body(p.owner).0 == me)
            .map(|p| p.body.0 as i64)
            .collect()
    }

    /// Handle to recall the pet drawn under `body_id` with, or -1 if the roster
    /// has not caught up with the body yet.
    #[func]
    fn pet_id_of(&self, body_id: i64) -> i64 {
        self.pet_info(body_id).map_or(-1, |p| p.pet.0 as i64)
    }

    /// Which chassis to draw for `body_id`, or -1 before the roster says.
    #[func]
    fn pet_kind_of(&self, body_id: i64) -> i64 {
        self.pet_info(body_id).map_or(-1, |p| p.kind as i64)
    }

    /// Body of whoever owns the pet drawn under `body_id`, or -1.
    #[func]
    fn pet_owner_body(&self, body_id: i64) -> i64 {
        self.pet_info(body_id)
            .map_or(-1, |p| crate::net::session::player_body(p.owner).0 as i64)
    }

    /// True when we are the one who deployed it.
    #[func]
    fn pet_is_mine(&self, body_id: i64) -> bool {
        let mine = self.local_body();
        mine >= 0 && self.pet_owner_body(body_id) == mine
    }

    /// Tells the host we have started mining the stone in a cell, and will keep at
    /// it until told otherwise. The host derives the id, so this cannot name
    /// something the player is nowhere near, and the host times the stages, so it
    /// cannot be asked for them faster than they take.
    #[func]
    fn harvest_stone(&self, cell_x: i64, cell_z: i64, ordinal: i64) {
        self.request_harvest(HarvestTarget::Stone, cell_x, cell_z, ordinal);
    }

    #[func]
    fn harvest_tree(&self, cell_x: i64, cell_z: i64, ordinal: i64) {
        self.request_harvest(HarvestTarget::Tree, cell_x, cell_z, ordinal);
    }

    /// Tells the host we have stopped working whatever we were working.
    #[func]
    fn harvest_stop(&self) {
        if let Some(client) = self.client.as_ref() {
            client.harvest(HarvestCommand::End);
        }
    }

    #[func]
    fn connect_to_server(&mut self) {
        self.disconnect_from_server();
        let url = self.server_url.to_string();
        let token = self.access_token.to_string();
        self.client = Some(if token.is_empty() {
            NetClientHandle::spawn_as(url, self.tick_hz, self.player_name.to_string())
        } else {
            NetClientHandle::spawn_with_token(url, self.tick_hz, token)
        });
    }

    #[func]
    fn disconnect_from_server(&mut self) {
        self.client = None;
        self.tracked.clear();
        self.known.clear();
        self.last = None;
        self.buffer.clear();
    }

    /// Drives `node`'s transform from the body the server publishes under `id`.
    #[func]
    fn track(&mut self, id: i64, node: Gd<Node3D>) {
        self.tracked.insert(BodyId(id as u32), node);
    }

    #[func]
    fn untrack(&mut self, id: i64) {
        self.tracked.remove(&BodyId(id as u32));
    }

    /// Horizontal wish direction and facing; the host decides what they mean.
    #[func]
    fn set_intent(&mut self, wish_dir: Vector2, jump: bool, yaw: f32) {
        if let Some(client) = self.client.as_ref() {
            client.set_intent(Intent {
                wish_dir: [wish_dir.x, wish_dir.y],
                jump,
                yaw,
            });
        }
    }

    /// The wire version this build speaks. A host that answers a different one will
    /// turn the join down, so this is what a client has to compare against `/healthz`
    /// to know that before it asks.
    #[func]
    fn protocol_version() -> i64 {
        crate::proto::PROTOCOL_VERSION as i64
    }

    /// Host clock in hours, 0..24. Zero before the first `Welcome`.
    #[func]
    fn world_hour(&self) -> f64 {
        self.last.as_ref().map_or(0.0, |s| s.hour as f64)
    }

    /// Seconds the host has simulated. Monotonic and never wrapped, unlike the hour, so
    /// it is what anything scheduled against world time should read.
    #[func]
    fn world_elapsed(&self) -> f64 {
        self.last.as_ref().map_or(0.0, |s| s.elapsed)
    }

    /// Whole days the world has run, counting from the host's first tick.
    #[func]
    fn world_day(&self) -> i64 {
        self.last.as_ref().map_or(0, |s| s.day)
    }

    /// The hour the host's day started at. With the day length and the elapsed seconds
    /// this is the whole clock, so the sky is a function of it rather than a free-run
    /// that gets corrected.
    #[func]
    fn world_start_hour(&self) -> f64 {
        self.last
            .as_ref()
            .and_then(|s| s.world)
            .map_or(0.0, |w| w.start_hour as f64)
    }

    /// Real-world minutes the host's day takes, or 0 before joining.
    #[func]
    fn day_length_minutes(&self) -> f64 {
        self.last
            .as_ref()
            .and_then(|s| s.world)
            .map_or(0.0, |w| w.day_length_minutes as f64)
    }

    /// Half-width of the host's terrain. Authoritative — a client that bakes a
    /// different extent disagrees about ground height and its players sink or hover.
    #[func]
    fn terrain_extent(&self) -> f64 {
        self.last
            .as_ref()
            .and_then(|s| s.world)
            .map_or(0.0, |w| w.terrain_extent as f64)
    }

    #[func]
    fn terrain_resolution(&self) -> i64 {
        self.last
            .as_ref()
            .and_then(|s| s.world)
            .map_or(0, |w| w.terrain_resolution as i64)
    }

    /// Water surface the host is simulating. The bridge deck is measured up from it, so
    /// a client holding a different one lays planks where its own server holds river.
    #[func]
    fn world_water_level(&self) -> f64 {
        self.last
            .as_ref()
            .and_then(|s| s.world)
            .map_or(0.0, |w| w.water_level as f64)
    }

    /// Trunk road width the host is simulating. The deck is a multiple of it.
    #[func]
    fn world_road_width(&self) -> f64 {
        self.last
            .as_ref()
            .and_then(|s| s.world)
            .map_or(0.0, |w| w.road_width as f64)
    }

    /// What the host scattered its rocks from. A field drawing from anything else
    /// draws a forest the host is not holding: every trunk the player can see is walked
    /// through, and every one they cannot is walked into.
    /// Says every harvest this session has heard about, again.
    ///
    /// For a listener that attached after the fact. The stages are absolute, so hearing
    /// one twice lands on the same answer as hearing it once.
    #[func]
    fn replay_harvest(&mut self) {
        let seen: Vec<((i64, i64), i64)> =
            self.harvest_seen.iter().map(|(k, v)| (*k, *v)).collect();
        for ((target, id), stage) in seen {
            self.signals().harvest_applied().emit(target, id, stage);
        }
    }

    #[func]
    fn world_stone_seed(&self) -> i64 {
        self.last
            .as_ref()
            .and_then(|s| s.world)
            .map_or(0, |w| w.stone_seed as i64)
    }

    #[func]
    fn world_tree_seed(&self) -> i64 {
        self.last
            .as_ref()
            .and_then(|s| s.world)
            .map_or(0, |w| w.tree_seed as i64)
    }

    #[func]
    fn world_stone_grid(&self) -> f64 {
        self.last
            .as_ref()
            .and_then(|s| s.world)
            .map_or(0.0, |w| w.stone_grid_size as f64)
    }

    #[func]
    fn world_tree_grid(&self) -> f64 {
        self.last
            .as_ref()
            .and_then(|s| s.world)
            .map_or(0.0, |w| w.tree_grid_size as f64)
    }

    #[func]
    fn is_joined(&self) -> bool {
        self.last
            .as_ref()
            .is_some_and(|s| s.status == ClientStatus::Joined)
    }

    /// Body id of the local player, or -1 before the host has welcomed us.
    #[func]
    fn local_body(&self) -> i64 {
        self.last
            .as_ref()
            .and_then(|s| s.local_body)
            .map_or(-1, |b| b.0 as i64)
    }

    /// Name the server assigned us — empty until welcomed.
    #[func]
    fn local_name(&self) -> GString {
        GString::from(
            self.last
                .as_ref()
                .and_then(|s| s.name.as_deref())
                .unwrap_or_default(),
        )
    }

    /// Name of whoever owns `id`, or empty for a body with no player behind it (props,
    /// and any player whose roster entry has not arrived yet).
    #[func]
    fn body_name(&self, id: i64) -> GString {
        GString::from(
            self.last
                .as_ref()
                .and_then(|s| s.roster.iter().find(|p| p.body == BodyId(id as u32)))
                .map(|p| p.name.as_str())
                .unwrap_or_default(),
        )
    }

    /// Every player in the session, in a stable order, as `[name, ...]`.
    #[func]
    fn roster_names(&self) -> PackedStringArray {
        self.last
            .as_ref()
            .map(|s| s.roster.iter().map(|p| GString::from(&p.name)).collect())
            .unwrap_or_default()
    }

    /// Body ids matching [`roster_names`](Self::roster_names), index for index.
    #[func]
    fn roster_bodies(&self) -> PackedInt64Array {
        self.last
            .as_ref()
            .map(|s| s.roster.iter().map(|p| p.body.0 as i64).collect())
            .unwrap_or_default()
    }

    #[func]
    fn world_seed(&self) -> i64 {
        self.last
            .as_ref()
            .and_then(|s| s.seed)
            .map_or(0, |s| s as i64)
    }

    /// Half-width of the ground the host simulates. A client that bakes a
    /// different one puts its players into the floor or above it.
    #[func]
    fn world_extent(&self) -> f32 {
        self.last
            .as_ref()
            .and_then(|s| s.world.as_ref())
            .map_or(0.0, |w| w.terrain_extent)
    }

    #[func]
    fn world_resolution(&self) -> i64 {
        self.last
            .as_ref()
            .and_then(|s| s.world.as_ref())
            .map_or(0, |w| w.terrain_resolution as i64)
    }

    #[func]
    fn last_error(&self) -> GString {
        GString::from(
            self.last
                .as_ref()
                .and_then(|s| s.error.as_deref())
                .unwrap_or_default(),
        )
    }

    /// Ids present in the most recent snapshot.
    #[func]
    fn body_ids(&self) -> PackedInt64Array {
        self.known.iter().map(|b| b.0 as i64).collect()
    }

    /// Where the body is being drawn this frame, which is behind the newest snapshot by
    /// [`interp_delay`](Self::get_interp_delay) for everyone but us.
    #[func]
    fn body_position(&self, id: i64) -> Vector3 {
        self.buffer
            .sample(BodyId(id as u32))
            .map(|iso| Vector3::new(iso.pos[0], iso.pos[1], iso.pos[2]))
            .unwrap_or(Vector3::ZERO)
    }

    /// Velocity the body is being drawn with, on the same clock as `body_position`.
    #[func]
    fn body_velocity(&self, id: i64) -> Vector3 {
        self.buffer
            .sample_velocity(BodyId(id as u32))
            .map(|v| Vector3::new(v[0], v[1], v[2]))
            .unwrap_or(Vector3::ZERO)
    }

    /// Whether the host had this body on the ground at the instant it is drawn at.
    #[func]
    fn body_grounded(&self, id: i64) -> bool {
        let body = BodyId(id as u32);
        let leading = self.lead_local_body && self.local_body() == id;
        let sampled = if leading {
            self.buffer.leading_grounded(body)
        } else {
            self.buffer.sample_grounded(body)
        };
        sampled.unwrap_or(true)
    }

    /// Snapshots held for blending. Persistently at one means [`interp_delay`] is too
    /// short for the link and bodies are being extrapolated rather than interpolated.
    #[func]
    fn interp_depth(&self) -> i64 {
        self.buffer.depth() as i64
    }

    /// Sim-time the render clock is sampling at.
    #[func]
    fn render_time(&self) -> f64 {
        self.buffer.render_time()
    }

    #[func]
    fn snapshot_tick(&self) -> i64 {
        self.last
            .as_ref()
            .and_then(|s| s.snapshot.as_ref())
            .map_or(0, |s| s.tick as i64)
    }
}

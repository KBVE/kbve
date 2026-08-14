//! Godot adapter for a networked session.

use std::collections::{HashMap, HashSet};

use godot::classes::{Engine, INode3D, Node3D};
use godot::prelude::*;

use super::bridge3d::apply_iso;
use super::net_interp::{InterpConfig, SnapshotBuffer};
use super::sim3d::BodyId;
use crate::net::client_thread::{Intent, NetClientHandle, NetClientState};
use crate::net::session::ClientStatus;

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
                self.signals().body_added().emit(id.0 as i64);
            }
            for id in removed {
                self.tracked.remove(&id);
                self.signals().body_removed().emit(id.0 as i64);
            }
        }

        if roster_changed {
            self.signals().roster_changed().emit();
        }
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

    /// Host clock in hours, 0..24. Zero before the first `Welcome`.
    #[func]
    fn world_hour(&self) -> f64 {
        self.last.as_ref().map_or(0.0, |s| s.hour as f64)
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

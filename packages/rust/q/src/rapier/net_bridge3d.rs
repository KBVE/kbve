//! Godot adapter for a networked session.
//!
//! The mirror of `bridge3d`: that node owns a local sim, this one renders a
//! remote one. Bodies are authored by the server, so GDScript reacts to
//! `body_added`/`body_removed` and hands back a node to drive rather than
//! spawning into the sim itself.

use std::collections::{HashMap, HashSet};

use godot::classes::{Engine, INode3D, Node3D};
use godot::prelude::*;

use super::bridge3d::apply_iso;
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
    /// Name to ask for. Empty — the default — is guest mode: the server hands
    /// back an `Anon-XXXX`. Whatever is set here is a request either way; the
    /// server sanitizes it and [`local_name`](Self::local_name) is the answer.
    #[export]
    player_name: GString,
    /// Connect in `_ready`. Off by default so a scene can be opened without a
    /// server running.
    #[export]
    autoconnect: bool,

    client: Option<NetClientHandle>,
    tracked: HashMap<BodyId, Gd<Node3D>>,
    known: HashSet<BodyId>,
    last: Option<NetClientState>,
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

    fn process(&mut self, _delta: f64) {
        let Some(state) = self.client.as_mut().and_then(|c| c.state_if_changed()) else {
            return;
        };

        let roster_changed = self
            .last
            .as_ref()
            .is_none_or(|previous| previous.roster != state.roster);

        let previous = self.last.as_ref().map(|s| s.status);
        if previous != Some(state.status) {
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

        if let Some(snapshot) = state.snapshot.as_ref() {
            let live: HashSet<BodyId> = snapshot.bodies.iter().map(|b| b.id).collect();

            for id in live.difference(&self.known).copied().collect::<Vec<_>>() {
                self.known.insert(id);
                self.signals().body_added().emit(id.0 as i64);
            }
            for id in self.known.difference(&live).copied().collect::<Vec<_>>() {
                self.tracked.remove(&id);
                self.signals().body_removed().emit(id.0 as i64);
            }
            self.known = live;

            for body in &snapshot.bodies {
                if let Some(node) = self.tracked.get_mut(&body.id)
                    && node.is_instance_valid()
                {
                    apply_iso(node, &body.iso);
                }
            }
        }

        // After the body diff: a nameplate needs the node to exist first, and
        // `body_added` is what creates it.
        if roster_changed {
            self.signals().roster_changed().emit();
        }

        self.last = Some((*state).clone());
    }
}

#[godot_api]
impl QNetClient3D {
    /// Emitted once the host accepts, carrying the world seed and the name we
    /// were actually given — which is not necessarily the one we asked for.
    #[signal]
    fn joined(seed: i64, name: GString);

    #[signal]
    fn rejected(reason: GString);

    /// Someone joined or left, or a name changed. Nameplates re-read
    /// [`body_name`](Self::body_name) from here.
    #[signal]
    fn roster_changed();

    /// A body appeared in the server's snapshot. Bind a node to it with
    /// [`track`](Self::track) to have its transform driven.
    #[signal]
    fn body_added(id: i64);

    #[signal]
    fn body_removed(id: i64);

    #[func]
    fn connect_to_server(&mut self) {
        self.disconnect_from_server();
        self.client = Some(NetClientHandle::spawn_as(
            self.server_url.to_string(),
            self.tick_hz,
            self.player_name.to_string(),
        ));
    }

    #[func]
    fn disconnect_from_server(&mut self) {
        self.client = None;
        self.tracked.clear();
        self.known.clear();
        self.last = None;
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

    /// Horizontal wish direction; the host decides what it means.
    #[func]
    fn set_intent(&mut self, wish_dir: Vector2, jump: bool) {
        if let Some(client) = self.client.as_ref() {
            client.set_intent(Intent {
                wish_dir: [wish_dir.x, wish_dir.y],
                jump,
            });
        }
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

    /// Name of whoever owns `id`, or empty for a body with no player behind it
    /// (props, and any player whose roster entry has not arrived yet).
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

    #[func]
    fn body_position(&self, id: i64) -> Vector3 {
        self.last
            .as_ref()
            .and_then(|s| s.snapshot.as_ref())
            .and_then(|s| s.body(BodyId(id as u32)))
            .map(|b| Vector3::new(b.iso.pos[0], b.iso.pos[1], b.iso.pos[2]))
            .unwrap_or(Vector3::ZERO)
    }

    #[func]
    fn snapshot_tick(&self) -> i64 {
        self.last
            .as_ref()
            .and_then(|s| s.snapshot.as_ref())
            .map_or(0, |s| s.tick as i64)
    }
}

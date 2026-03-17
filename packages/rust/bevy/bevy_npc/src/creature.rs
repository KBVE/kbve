//! Game-agnostic ECS components for creature pooling, capture, and interaction.
//!
//! Available when the `creature` feature is enabled. Provides shared types that
//! both client and server can use without pulling in game-specific rendering
//! or networking code.
//!
//! ## What belongs here
//!
//! - Lifecycle state (`CreatureState`) — pooled, active, captured
//! - Pool identification (`CreaturePoolIndex`) — which entity in the pool
//! - Capture tracking (`CapturedCreatures`) — server + client shared resource
//! - Capture event (`CreatureCaptureEvent`) — triggers capture flow
//!
//! ## What stays in your game
//!
//! - Render-specific components (emissive glow, billboard, sprite sheet)
//! - Interaction detection (colliders, raycasting, click handlers)
//! - Network transport (lightyear message senders/receivers)

use std::collections::HashSet;

use bevy::prelude::*;

use crate::ProtoNpcId;

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

/// Pool index identifying a creature entity within its type pool.
///
/// Assigned once at spawn (0..pool_size). Used to match network messages
/// (capture requests/broadcasts) to the correct ECS entity.
#[derive(Component, Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub struct CreaturePoolIndex(pub u32);

/// Current lifecycle state of a creature entity.
///
/// Transitions: `Pooled → Active → Captured` (or back to `Pooled` on recycle).
/// Server-authoritative — clients receive state via network messages.
#[derive(Clone, Copy, PartialEq, Eq, Debug, Default, Hash)]
pub enum CreatureState {
    /// In the pool, not assigned to a world slot. Hidden.
    #[default]
    Pooled,
    /// Assigned to a deterministic world slot. Visible (subject to time-of-day).
    Active,
    /// Captured by a player. Slot is blocked across all clients.
    Captured,
}

// ---------------------------------------------------------------------------
// Resources
// ---------------------------------------------------------------------------

/// Tracks which creatures have been captured, keyed by `(ProtoNpcId, pool_index)`.
///
/// Shared between server and client — both maintain their own instance.
/// Uses `ProtoNpcId` instead of a hardcoded enum so new creature types
/// don't require protocol changes.
#[derive(Resource, Default, Debug)]
pub struct CapturedCreatures {
    captured: HashSet<(ProtoNpcId, u32)>,
}

impl CapturedCreatures {
    /// Record a creature as captured.
    pub fn insert(&mut self, npc_id: ProtoNpcId, pool_index: u32) {
        self.captured.insert((npc_id, pool_index));
    }

    /// Check if a specific creature is captured.
    pub fn is_captured(&self, npc_id: ProtoNpcId, pool_index: u32) -> bool {
        self.captured.contains(&(npc_id, pool_index))
    }

    /// Remove a capture record (e.g. on respawn or disconnect reset).
    pub fn remove(&mut self, npc_id: ProtoNpcId, pool_index: u32) {
        self.captured.remove(&(npc_id, pool_index));
    }

    /// Clear all captured creatures (e.g. on disconnect/reconnect).
    pub fn clear(&mut self) {
        self.captured.clear();
    }

    /// Number of captured creatures.
    pub fn len(&self) -> usize {
        self.captured.len()
    }

    /// Whether any creatures are captured.
    pub fn is_empty(&self) -> bool {
        self.captured.is_empty()
    }

    /// Iterate over all captured `(npc_id, pool_index)` pairs.
    pub fn iter(&self) -> impl Iterator<Item = &(ProtoNpcId, u32)> {
        self.captured.iter()
    }
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

/// Fired when a player attempts to capture a creature.
///
/// Game code should trigger this event (e.g. on click, proximity, or item use).
/// The networking layer observes it and sends the appropriate server message.
/// Uses `ProtoNpcId` so it works with any NPC type without protocol changes.
#[derive(Event, Clone, Debug)]
pub struct CreatureCaptureEvent {
    /// NPC definition ID of the creature being captured.
    pub npc_id: ProtoNpcId,
    /// Pool index of the creature entity.
    pub creature_index: u32,
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

/// Registers creature ECS resources and events.
///
/// Add this plugin to your Bevy app to get `CapturedCreatures` resource
/// and `CreatureCaptureEvent` event type. Does NOT add any systems —
/// capture handling, networking, and interaction are game-specific.
pub struct CreaturePlugin;

impl Plugin for CreaturePlugin {
    fn build(&self, app: &mut App) {
        app.init_resource::<CapturedCreatures>();
    }
}

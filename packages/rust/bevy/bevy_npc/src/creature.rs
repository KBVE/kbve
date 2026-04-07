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
/// Assigned once at spawn (0..pool_size). Used internally for pool management.
/// Network identification uses `CreatureId` (ULID) instead.
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

/// Tracks which creatures have been captured, keyed by ULID (u128).
///
/// Shared between server and client — both maintain their own instance.
#[derive(Resource, Default, Debug)]
pub struct CapturedCreatures {
    captured: HashSet<u128>,
}

impl CapturedCreatures {
    /// Record a creature as captured by its ULID.
    pub fn insert(&mut self, creature_id: u128) {
        self.captured.insert(creature_id);
    }

    /// Check if a specific creature is captured.
    pub fn is_captured(&self, creature_id: u128) -> bool {
        self.captured.contains(&creature_id)
    }

    /// Remove a capture record (e.g. on respawn or disconnect reset).
    pub fn remove(&mut self, creature_id: u128) {
        self.captured.remove(&creature_id);
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

    /// Iterate over all captured creature ULIDs.
    pub fn iter(&self) -> impl Iterator<Item = &u128> {
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
#[derive(Event, Clone, Debug)]
pub struct CreatureCaptureEvent {
    /// Server-assigned ULID of the creature being captured.
    pub creature_id: u128,
    /// NPC definition ID of the creature type.
    pub npc_id: ProtoNpcId,
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

/// Registers creature ECS resources and events.
///
/// Add this plugin to your Bevy app to get `CapturedCreatures` resource
/// and `CreatureCaptureEvent` event automatically.
pub struct CreaturePlugin;

impl Plugin for CreaturePlugin {
    fn build(&self, app: &mut App) {
        app.init_resource::<CapturedCreatures>();
    }
}

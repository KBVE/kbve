//! Layer 3: Influence maps — per-creature-type weight overlays on waypoints.
//!
//! Static scoring profiles that determine which waypoints each creature type
//! prefers. Pure functions, deterministic, no runtime state.

use bevy::prelude::*;

use super::waypoint_graph::{Waypoint, ZoneTag};

// ---------------------------------------------------------------------------
// Patrol mode
// ---------------------------------------------------------------------------

/// How a creature traverses its patrol route.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PatrolMode {
    /// A → B → C → D → A → B → ...
    Loop,
    /// A → B → C → D → C → B → A → B → ...
    PingPong,
}

// ---------------------------------------------------------------------------
// Influence profile
// ---------------------------------------------------------------------------

/// Per-creature-type configuration that scores waypoints for patrol selection.
#[derive(Clone, Debug)]
pub struct InfluenceProfile {
    /// Zone weight multipliers. Missing zones default to 1.0.
    pub zone_weights: &'static [(ZoneTag, f32)],
    /// (preferred_min_height, preferred_max_height, penalty_per_unit_outside)
    pub elevation_pref: (f32, f32, f32),
    /// Vegetation density affinity. >1.0 = prefer dense vegetation.
    pub veg_affinity: f32,
    /// Centrality affinity. >1.0 = prefer chokepoints/hubs.
    pub centrality_affinity: f32,
    /// Maximum patrol radius from spawn anchor (world units).
    pub patrol_radius: f32,
    /// Number of waypoints to select for the patrol route.
    pub waypoint_count: u32,
    /// Traversal pattern.
    pub patrol_mode: PatrolMode,
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

/// Score a waypoint for a given creature type. Pure, deterministic.
/// Higher score = more preferred.
pub fn score_waypoint(wp: &Waypoint, profile: &InfluenceProfile, anchor: Vec3) -> f32 {
    let mut score = 1.0f32;

    // Zone weight
    let zone_weight = profile
        .zone_weights
        .iter()
        .find(|&&(z, _)| z == wp.zone)
        .map(|&(_, w)| w)
        .unwrap_or(1.0);
    score *= zone_weight;

    // Elevation preference
    let h = wp.world_pos.y;
    let (pmin, pmax, penalty) = profile.elevation_pref;
    if h < pmin {
        score /= 1.0 + (pmin - h) * penalty;
    } else if h > pmax {
        score /= 1.0 + (h - pmax) * penalty;
    }

    // Vegetation density affinity
    score *= 1.0 + (wp.veg_density - 0.5) * (profile.veg_affinity - 1.0);

    // Centrality affinity
    score *= 1.0 + wp.centrality * (profile.centrality_affinity - 1.0);

    // Distance from anchor — prefer waypoints within patrol_radius
    let dist = Vec2::new(wp.world_pos.x - anchor.x, wp.world_pos.z - anchor.z).length();
    if dist > profile.patrol_radius {
        score /= 1.0 + (dist - profile.patrol_radius) * 0.3;
    }

    score.max(0.001)
}

// ---------------------------------------------------------------------------
// Static influence profiles per creature type
// ---------------------------------------------------------------------------

/// Wolf: patrols forest edges, drawn to chokepoints.
pub const WOLF_INFLUENCE: InfluenceProfile = InfluenceProfile {
    zone_weights: &[
        (ZoneTag::ForestEdge, 2.5),
        (ZoneTag::Forest, 1.8),
        (ZoneTag::Meadow, 1.0),
    ],
    elevation_pref: (0.0, 3.0, 0.3),
    veg_affinity: 1.3,
    centrality_affinity: 1.8,
    patrol_radius: 10.0,
    waypoint_count: 5,
    patrol_mode: PatrolMode::PingPong,
};

/// Stag: grazes in meadows, visits waterfronts.
pub const STAG_INFLUENCE: InfluenceProfile = InfluenceProfile {
    zone_weights: &[
        (ZoneTag::Meadow, 2.0),
        (ZoneTag::Waterfront, 1.5),
        (ZoneTag::ForestEdge, 0.8),
    ],
    elevation_pref: (0.0, 2.0, 0.5),
    veg_affinity: 0.8,
    centrality_affinity: 0.5,
    patrol_radius: 12.0,
    waypoint_count: 5,
    patrol_mode: PatrolMode::Loop,
};

/// Boar: sticks to dense forest, tight patrol.
pub const BOAR_INFLUENCE: InfluenceProfile = InfluenceProfile {
    zone_weights: &[(ZoneTag::Forest, 2.0), (ZoneTag::Meadow, 1.2)],
    elevation_pref: (0.0, 3.0, 0.3),
    veg_affinity: 1.8,
    centrality_affinity: 0.7,
    patrol_radius: 6.0,
    waypoint_count: 3,
    patrol_mode: PatrolMode::Loop,
};

/// Badger: forages in forest and edges.
pub const BADGER_INFLUENCE: InfluenceProfile = InfluenceProfile {
    zone_weights: &[(ZoneTag::Forest, 2.2), (ZoneTag::ForestEdge, 1.5)],
    elevation_pref: (0.0, 3.0, 0.4),
    veg_affinity: 1.6,
    centrality_affinity: 0.6,
    patrol_radius: 7.0,
    waypoint_count: 4,
    patrol_mode: PatrolMode::Loop,
};

/// Wraith: haunts highlands and peaks.
pub const WRAITH_INFLUENCE: InfluenceProfile = InfluenceProfile {
    zone_weights: &[(ZoneTag::Highland, 2.5), (ZoneTag::Peak, 2.0)],
    elevation_pref: (3.0, 6.0, 0.1),
    veg_affinity: 0.5,
    centrality_affinity: 1.5,
    patrol_radius: 14.0,
    waypoint_count: 5,
    patrol_mode: PatrolMode::PingPong,
};

/// Frog: hugs the waterfront.
pub const FROG_INFLUENCE: InfluenceProfile = InfluenceProfile {
    zone_weights: &[(ZoneTag::Waterfront, 3.0), (ZoneTag::Meadow, 1.5)],
    elevation_pref: (0.0, 1.0, 1.0),
    veg_affinity: 0.8,
    centrality_affinity: 0.3,
    patrol_radius: 4.0,
    waypoint_count: 3,
    patrol_mode: PatrolMode::Loop,
};

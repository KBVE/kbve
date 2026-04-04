//! Creature type descriptors — the data that drives the generic system.

use super::behavior::BehaviorNode;
use super::types::*;

/// Build all sprite creature type descriptors.
pub fn build_sprite_creature_types() -> SpriteCreatureTypes {
    SpriteCreatureTypes {
        types: vec![boar(), badger()],
    }
}

// ---------------------------------------------------------------------------
// Boar: 4-directional, 2 anims (idle + run), always visible, linear run
// ---------------------------------------------------------------------------

fn boar() -> SpriteCreatureType {
    SpriteCreatureType {
        npc_ref: "wild-boar",
        texture_path: "textures/creatures/boar/boar-sprite.png",
        sheet_cols: 7,
        sheet_rows: 8,
        sprite_size: 1.4,
        shadow_radius_factor: 0.4,
        shadow_height_factor: 0.5,
        frame_duration_base: 0.12,
        idle_min: 3.0,
        idle_max: 10.0,
        recycle_dist: 32.0,
        spawn_ring_inner: 18.0,
        spawn_ring_outer: 26.0,
        seed_offset: 4400,
        direction_model: DirectionModel::FourWay {
            // NE=0, NW=1, SE=2, SW=3 (stag/boar row order)
            // quadrant index: (diff>=0)<<1 | (sum>=0)
            //   diff>=0, sum<0  → q=2 → NE → row 0
            //   diff<0,  sum<0  → q=0 → NW → row 1
            //   diff>=0, sum>=0 → q=3 → SE → row 2
            //   diff<0,  sum>=0 → q=1 → SW → row 3
            quadrant_to_row: [1, 3, 0, 2],
        },
        movement: MovementProfile::LinearRun,
        visibility: VisibilitySchedule::Always,
        tint: TintProfile::Standard,
        anims: AnimSet {
            idle: AnimDef {
                base_row: 0,
                frame_count: 7,
            },
            actions: vec![AnimAction {
                name: "run",
                def: AnimDef {
                    base_row: 4,
                    frame_count: 4,
                },
            }],
        },
        behavior: BehaviorProfile {
            choices: vec![
                BehaviorChoice {
                    threshold: 0.40,
                    action: BehaviorAction::Move {
                        anim_name: "run",
                        min_dist: 2.0,
                        max_dist: 5.0,
                        speed: 3.5,
                    },
                },
                BehaviorChoice {
                    threshold: 1.0,
                    action: BehaviorAction::ExtendedIdle { repeat: 2 },
                },
            ],
        },
        behavior_tree: Some(boar_tree()),
        physics_lod: Some(super::physics_lod::PhysicsLodConfig {
            kinematic_radius: 8.0,
            sensor_radius: 16.0,
            collider_radius: 0.5,
            collider_half_height: 0.4,
        }),
    }
}

fn boar_tree() -> BehaviorNode {
    BehaviorNode::Selector(vec![
        // Flee if player too close
        BehaviorNode::Sequence(vec![
            BehaviorNode::PlayerNearby { radius: 5.0 },
            BehaviorNode::Flee {
                speed: 4.5,
                anim: "run",
            },
        ]),
        // Normal ambient behavior
        BehaviorNode::Selector(vec![
            BehaviorNode::Chance {
                probability: 0.4,
                child: Box::new(BehaviorNode::Wander {
                    min_dist: 2.0,
                    max_dist: 5.0,
                    speed: 3.5,
                    anim: "run",
                }),
            },
            BehaviorNode::Idle {
                min: 3.0,
                max: 10.0,
            },
        ]),
    ])
}

// ---------------------------------------------------------------------------
// Badger: 4-directional, 5 anims (idle + walk + burrow + unburrow),
// always visible, slow walker with burrowing emotes
// ---------------------------------------------------------------------------

fn badger() -> SpriteCreatureType {
    SpriteCreatureType {
        npc_ref: "honey-badger",
        texture_path: "textures/creatures/badger/badger-sprite.png",
        sheet_cols: 25,
        sheet_rows: 20,
        sprite_size: 1.3,
        shadow_radius_factor: 0.35,
        shadow_height_factor: 0.45,
        frame_duration_base: 0.10,
        idle_min: 3.0,
        idle_max: 10.0,
        recycle_dist: 32.0,
        spawn_ring_inner: 18.0,
        spawn_ring_outer: 26.0,
        seed_offset: 6600,
        direction_model: DirectionModel::FourWay {
            quadrant_to_row: [1, 3, 0, 2],
        },
        movement: MovementProfile::LinearRun,
        visibility: VisibilitySchedule::Always,
        tint: TintProfile::Standard,
        anims: AnimSet {
            idle: AnimDef {
                base_row: 0,
                frame_count: 22,
            },
            actions: vec![
                AnimAction {
                    name: "walk",
                    def: AnimDef {
                        base_row: 4,
                        frame_count: 9,
                    },
                },
                AnimAction {
                    name: "burrow",
                    def: AnimDef {
                        base_row: 8,
                        frame_count: 25,
                    },
                },
                AnimAction {
                    name: "unburrow",
                    def: AnimDef {
                        base_row: 12,
                        frame_count: 13,
                    },
                },
            ],
        },
        behavior: BehaviorProfile {
            choices: vec![
                BehaviorChoice {
                    threshold: 0.35,
                    action: BehaviorAction::Move {
                        anim_name: "walk",
                        min_dist: 1.0,
                        max_dist: 3.0,
                        speed: 1.5,
                    },
                },
                BehaviorChoice {
                    threshold: 0.50,
                    action: BehaviorAction::Emote {
                        anim_name: "burrow",
                        repeat: 1,
                    },
                },
                BehaviorChoice {
                    threshold: 0.65,
                    action: BehaviorAction::Emote {
                        anim_name: "unburrow",
                        repeat: 1,
                    },
                },
                BehaviorChoice {
                    threshold: 1.0,
                    action: BehaviorAction::ExtendedIdle { repeat: 1 },
                },
            ],
        },
        behavior_tree: None,
        physics_lod: None,
    }
}

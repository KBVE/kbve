//! Creature type descriptors — the data that drives the generic system.

use super::behavior::BehaviorNode;
use super::types::*;

/// Build all sprite creature type descriptors.
pub fn build_sprite_creature_types() -> SpriteCreatureTypes {
    SpriteCreatureTypes {
        types: vec![boar(), badger(), wolf(), stag(), frog(), wraith()],
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
        vitals: VitalsConfig {
            max_health: 20.0,
            max_mana: 0.0,
            max_energy: 50.0,
        },
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
        vitals: VitalsConfig {
            max_health: 15.0,
            max_mana: 0.0,
            max_energy: 40.0,
        },
    }
}

// ---------------------------------------------------------------------------
// Wolf: 4-directional, 4 anims (idle + run + bite + howl),
// always visible, linear run with flee behavior
// ---------------------------------------------------------------------------

fn wolf() -> SpriteCreatureType {
    SpriteCreatureType {
        npc_ref: "forest-wolf",
        texture_path: "textures/creatures/wolf/wolf-sprite.png",
        sheet_cols: 15,
        sheet_rows: 20,
        sprite_size: 1.8,
        shadow_radius_factor: 0.4,
        shadow_height_factor: 0.5,
        frame_duration_base: 0.10,
        idle_min: 3.0,
        idle_max: 10.0,
        recycle_dist: 32.0,
        spawn_ring_inner: 20.0,
        spawn_ring_outer: 28.0,
        seed_offset: 5500,
        direction_model: DirectionModel::FourWay {
            // Wolf atlas direction order: NE=+0, SE=+1, SW=+2, NW=+3
            // quadrant index: (diff>=0)<<1 | (sum>=0)
            //   q=0: diff<0, sum<0  → NW → row 3
            //   q=1: diff<0, sum>=0 → SW → row 2
            //   q=2: diff>=0, sum<0 → NE → row 0
            //   q=3: diff>=0, sum>=0 → SE → row 1
            quadrant_to_row: [3, 2, 0, 1],
        },
        movement: MovementProfile::LinearRun,
        visibility: VisibilitySchedule::Always,
        tint: TintProfile::Standard,
        anims: AnimSet {
            idle: AnimDef {
                base_row: 0,
                frame_count: 4,
            },
            actions: vec![
                AnimAction {
                    name: "run",
                    def: AnimDef {
                        base_row: 4,
                        frame_count: 8,
                    },
                },
                AnimAction {
                    name: "bite",
                    def: AnimDef {
                        base_row: 8,
                        frame_count: 15,
                    },
                },
                AnimAction {
                    name: "howl",
                    def: AnimDef {
                        base_row: 12,
                        frame_count: 9,
                    },
                },
            ],
        },
        behavior: BehaviorProfile {
            choices: vec![
                BehaviorChoice {
                    threshold: 0.40,
                    action: BehaviorAction::Move {
                        anim_name: "run",
                        min_dist: 2.0,
                        max_dist: 5.0,
                        speed: 3.0,
                    },
                },
                BehaviorChoice {
                    threshold: 0.55,
                    action: BehaviorAction::Emote {
                        anim_name: "bite",
                        repeat: 1,
                    },
                },
                BehaviorChoice {
                    threshold: 0.70,
                    action: BehaviorAction::Emote {
                        anim_name: "howl",
                        repeat: 1,
                    },
                },
                BehaviorChoice {
                    threshold: 1.0,
                    action: BehaviorAction::ExtendedIdle { repeat: 2 },
                },
            ],
        },
        behavior_tree: Some(wolf_tree()),
        physics_lod: None,
        vitals: VitalsConfig {
            max_health: 30.0,
            max_mana: 0.0,
            max_energy: 60.0,
        },
    }
}

fn wolf_tree() -> BehaviorNode {
    BehaviorNode::Selector(vec![
        // Flee if player too close
        BehaviorNode::Sequence(vec![
            BehaviorNode::PlayerNearby { radius: 6.0 },
            BehaviorNode::Flee {
                speed: 4.0,
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
                    speed: 3.0,
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
// Stag: 4-directional, 3 anims (idle + run + walk),
// day visibility, skittish flee behavior
// ---------------------------------------------------------------------------

fn stag() -> SpriteCreatureType {
    SpriteCreatureType {
        npc_ref: "woodland-stag",
        texture_path: "textures/creatures/stag/stag-sprite.png",
        sheet_cols: 24,
        sheet_rows: 12,
        sprite_size: 1.6,
        shadow_radius_factor: 0.4,
        shadow_height_factor: 0.5,
        frame_duration_base: 0.09,
        idle_min: 4.0,
        idle_max: 12.0,
        recycle_dist: 32.0,
        spawn_ring_inner: 18.0,
        spawn_ring_outer: 26.0,
        seed_offset: 3300,
        direction_model: DirectionModel::FourWay {
            // Stag atlas direction order: NE=+0, NW=+1, SE=+2, SW=+3
            // Same mapping as boar
            quadrant_to_row: [1, 3, 0, 2],
        },
        movement: MovementProfile::LinearRun,
        visibility: VisibilitySchedule::Day,
        tint: TintProfile::Standard,
        anims: AnimSet {
            idle: AnimDef {
                base_row: 0,
                frame_count: 24,
            },
            actions: vec![
                AnimAction {
                    name: "run",
                    def: AnimDef {
                        base_row: 4,
                        frame_count: 10,
                    },
                },
                AnimAction {
                    name: "walk",
                    def: AnimDef {
                        base_row: 8,
                        frame_count: 11,
                    },
                },
            ],
        },
        behavior: BehaviorProfile {
            choices: vec![
                BehaviorChoice {
                    threshold: 0.15,
                    action: BehaviorAction::Move {
                        anim_name: "run",
                        min_dist: 3.0,
                        max_dist: 7.0,
                        speed: 4.0,
                    },
                },
                BehaviorChoice {
                    threshold: 0.50,
                    action: BehaviorAction::Move {
                        anim_name: "walk",
                        min_dist: 1.5,
                        max_dist: 3.5,
                        speed: 1.8,
                    },
                },
                BehaviorChoice {
                    threshold: 1.0,
                    action: BehaviorAction::ExtendedIdle { repeat: 2 },
                },
            ],
        },
        behavior_tree: Some(stag_tree()),
        physics_lod: None,
        vitals: VitalsConfig {
            max_health: 25.0,
            max_mana: 0.0,
            max_energy: 70.0,
        },
    }
}

fn stag_tree() -> BehaviorNode {
    BehaviorNode::Selector(vec![
        // Stags are skittish — flee at larger radius, faster speed
        BehaviorNode::Sequence(vec![
            BehaviorNode::PlayerNearby { radius: 8.0 },
            BehaviorNode::Flee {
                speed: 5.0,
                anim: "run",
            },
        ]),
        // Normal ambient behavior
        BehaviorNode::Selector(vec![
            BehaviorNode::Chance {
                probability: 0.35,
                child: Box::new(BehaviorNode::Wander {
                    min_dist: 1.5,
                    max_dist: 3.5,
                    speed: 1.8,
                    anim: "walk",
                }),
            },
            BehaviorNode::Chance {
                probability: 0.15,
                child: Box::new(BehaviorNode::Wander {
                    min_dist: 3.0,
                    max_dist: 7.0,
                    speed: 4.0,
                    anim: "run",
                }),
            },
            BehaviorNode::Idle {
                min: 4.0,
                max: 12.0,
            },
        ]),
    ])
}

// ---------------------------------------------------------------------------
// Frog: flip direction, 2 anims (idle + jump), day visibility, hop arc
// ---------------------------------------------------------------------------

fn frog() -> SpriteCreatureType {
    SpriteCreatureType {
        npc_ref: "green-toad",
        texture_path: "textures/frog_green_mob.png",
        sheet_cols: 9,
        sheet_rows: 5,
        sprite_size: 1.4,
        shadow_radius_factor: 0.4,
        shadow_height_factor: 0.5,
        frame_duration_base: 0.15,
        idle_min: 3.0,
        idle_max: 10.0,
        recycle_dist: 28.0,
        spawn_ring_inner: 22.0,
        spawn_ring_outer: 26.0,
        seed_offset: 900,
        direction_model: DirectionModel::Flip,
        movement: MovementProfile::HopArc {
            base_height: 0.3,
            height_per_dist: 0.15,
            max_jump_height_diff: 0.8,
            jump_airborne_frame: 4,
        },
        visibility: VisibilitySchedule::Day,
        tint: TintProfile::Standard,
        anims: AnimSet {
            idle: AnimDef {
                base_row: 0,
                frame_count: 8,
            },
            actions: vec![AnimAction {
                name: "jump",
                def: AnimDef {
                    base_row: 1,
                    frame_count: 7,
                },
            }],
        },
        behavior: BehaviorProfile {
            choices: vec![
                BehaviorChoice {
                    threshold: 0.35,
                    action: BehaviorAction::Move {
                        anim_name: "jump",
                        min_dist: 0.5,
                        max_dist: 2.0,
                        speed: 2.0,
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
        vitals: VitalsConfig {
            max_health: 5.0,
            max_mana: 0.0,
            max_energy: 20.0,
        },
    }
}

// ---------------------------------------------------------------------------
// Wraith: flip direction, 5 anims (idle + idle2 + attack + skill + summon),
// night visibility, ghost tint, glide movement
// ---------------------------------------------------------------------------

fn wraith() -> SpriteCreatureType {
    SpriteCreatureType {
        npc_ref: "wraith-executioner",
        texture_path: "textures/creatures/wraith/wraith_executioner.png",
        sheet_cols: 20,
        sheet_rows: 6,
        sprite_size: 3.52,
        shadow_radius_factor: 0.35,
        shadow_height_factor: 0.5,
        frame_duration_base: 0.12,
        idle_min: 4.0,
        idle_max: 12.0,
        recycle_dist: 32.0,
        spawn_ring_inner: 24.0,
        spawn_ring_outer: 30.0,
        seed_offset: 7700,
        direction_model: DirectionModel::Flip,
        movement: MovementProfile::Glide {
            speed: 1.2,
            hover_base: 0.3,
            hover_amplitude: 0.15,
            hover_frequency: 1.5,
        },
        visibility: VisibilitySchedule::Night,
        tint: TintProfile::Ghost,
        anims: AnimSet {
            idle: AnimDef {
                base_row: 0,
                frame_count: 4,
            },
            actions: vec![
                AnimAction {
                    name: "idle2",
                    def: AnimDef {
                        base_row: 1,
                        frame_count: 4,
                    },
                },
                AnimAction {
                    name: "attack",
                    def: AnimDef {
                        base_row: 2,
                        frame_count: 13,
                    },
                },
                AnimAction {
                    name: "skill",
                    def: AnimDef {
                        base_row: 3,
                        frame_count: 12,
                    },
                },
                AnimAction {
                    name: "summon",
                    def: AnimDef {
                        base_row: 5,
                        frame_count: 5,
                    },
                },
            ],
        },
        behavior: BehaviorProfile {
            choices: vec![
                BehaviorChoice {
                    threshold: 0.30,
                    action: BehaviorAction::Move {
                        anim_name: "idle2",
                        min_dist: 1.5,
                        max_dist: 4.0,
                        speed: 1.2,
                    },
                },
                BehaviorChoice {
                    threshold: 0.50,
                    action: BehaviorAction::Emote {
                        anim_name: "attack",
                        repeat: 1,
                    },
                },
                BehaviorChoice {
                    threshold: 0.60,
                    action: BehaviorAction::Emote {
                        anim_name: "skill",
                        repeat: 1,
                    },
                },
                BehaviorChoice {
                    threshold: 0.75,
                    action: BehaviorAction::Emote {
                        anim_name: "summon",
                        repeat: 1,
                    },
                },
                BehaviorChoice {
                    threshold: 1.0,
                    action: BehaviorAction::ExtendedIdle { repeat: 2 },
                },
            ],
        },
        behavior_tree: Some(wraith_tree()),
        physics_lod: None,
        vitals: VitalsConfig {
            max_health: 50.0,
            max_mana: 30.0,
            max_energy: 40.0,
        },
    }
}

fn wraith_tree() -> BehaviorNode {
    // Wraith is aggressive — no flee, just ambient patrol
    BehaviorNode::Selector(vec![
        BehaviorNode::Chance {
            probability: 0.3,
            child: Box::new(BehaviorNode::Wander {
                min_dist: 1.5,
                max_dist: 4.0,
                speed: 1.2,
                anim: "idle2",
            }),
        },
        BehaviorNode::Idle {
            min: 4.0,
            max: 12.0,
        },
    ])
}

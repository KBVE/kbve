//! Creature type descriptors — the data that drives the generic system.

use super::types::*;

/// Build all sprite creature type descriptors.
pub fn build_sprite_creature_types() -> SpriteCreatureTypes {
    SpriteCreatureTypes {
        types: vec![boar()],
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
    }
}

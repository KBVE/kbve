//! Server-authoritative ship piloting. A player boards a parked ship (`EnterShip`),
//! becomes its pilot, and drives it; everyone sees the ship animate + move and the
//! pilot's body vanish (the snapshot carries `piloting = ship_eid` on the player, and
//! the ship's facing+phase in its `FurnitureRot`/`sub`). Mirrors the client
//! `ShipController` state machine (entities/ship.ts).
//!
//! Collision: the ship blocks its per-facing footprint (re-blocked as it moves) so NPC
//! pathing routes around the hull, and `resolve_ship_collision` pushes OTHER players out
//! of the convex hull. The pilot is exempt (`Without<Piloting>`) so it isn't ejected
//! from the ship it's flying.
use bevy::prelude::*;
use simgrid::proto::{self, Facing, Tile};
use simgrid::{
    EnvObject, FloatMove, Floor, FurnitureRot, GridPos, PendingPilotOps, PilotOp, Piloting,
    PlayerSlotTag, WalkableMap,
};

use crate::game::{SHIP_PARKED_FACING, SHIP_REF, ship_footprint};

// Phase in the high nibble of the ship's `FurnitureRot` byte; facing in the low nibble
// (`sub = facing | phase << 4`). The client maps phase → ShipController state.
pub const PHASE_OFF: u8 = 0; // parked
pub const PHASE_LIFT: u8 = 1; // taking off
pub const PHASE_FLY: u8 = 2; // hovering / driving
pub const PHASE_LAND: u8 = 3; // landing
pub const PHASE_LEAVING: u8 = 4; // rising off-planet into space (then off-grid)
pub const PHASE_ENTERING: u8 = 5; // descending back from space into flight

/// Sim ticks the lift / land transitions hold before advancing (≈ the baked anim).
const LIFT_TICKS: u32 = 18;
const LAND_TICKS: u32 = 18;
/// Ticks the leaving / entering atmosphere cutscenes hold (≈ the baked 18-frame anim).
const LEAVING_TICKS: u32 = 18;
const ENTERING_TICKS: u32 = 18;

/// On the pilot entity while in the solo 3D space instance — the ship + pilot are
/// off-grid (no `GridPos`, so every snapshot drops them: they "left the planet").
/// Holds what's needed to re-materialise both at the launch tile on return.
#[derive(Component)]
pub struct InSpace {
    pub ship: Entity,
    pub tile: Tile,
    pub floor: i32,
    pub facing: u8,
}
/// How close (tiles, Chebyshev) the player must stand to board.
const ENTER_RANGE: i32 = 3;
/// Speed² below which the ship keeps its last heading instead of re-deriving it.
const FACING_VEL_EPS2: f32 = 0.02;

/// On the ship entity while occupied: who flies it.
#[derive(Component)]
pub struct Piloted {
    pub pilot: proto::PlayerSlot,
}

/// On the ship entity while occupied: the live drive state (mirrors the client rig).
#[derive(Component)]
pub struct ShipDrive {
    pub phase: u8,
    pub ticks: u32,
    pub facing: u8,
    /// Tiles currently blocked for this ship (re-blocked as it moves).
    pub blocked: Vec<Tile>,
    pub floor: i32,
    pub tile: Tile,
}

/// 16-way heading from a world velocity. Facing 0 = West (matches the parked sheet);
/// each step is +22.5°. Calibrate via `FACING_OFFSET` if the in-game heading reads off.
const FACING_OFFSET: i32 = 0;
fn facing16(vx: f32, vy: f32) -> u8 {
    let a = vy.atan2(vx) + std::f32::consts::PI; // 0..2π, π(west)→0
    let step = (a / (std::f32::consts::TAU) * 16.0).round() as i32;
    (step + FACING_OFFSET).rem_euclid(16) as u8
}

/// Drain board/leave requests. Validates range + parked + unoccupied, then links the
/// player to the ship and co-locates it onto the hull so driving binds cleanly.
#[allow(clippy::type_complexity)]
pub fn apply_pilot_ops(
    mut commands: Commands,
    mut ops: ResMut<PendingPilotOps>,
    players: Query<(Entity, &PlayerSlotTag, &GridPos, Option<&Piloting>)>,
    space_pilots: Query<(Entity, &PlayerSlotTag, &InSpace)>,
    ships: Query<(
        Entity,
        &GridPos,
        &EnvObject,
        Option<&Floor>,
        Option<&FurnitureRot>,
        Option<&Piloted>,
    )>,
    mut bodies: Query<&mut FloatMove>,
    mut drives: Query<&mut ShipDrive>,
    mut map: ResMut<WalkableMap>,
) {
    for (slot, op) in ops.0.drain(..) {
        match op {
            PilotOp::Enter(ship_eid) => {
                let Some((pent, _, ppos, piloting)) =
                    players.iter().find(|(_, t, _, _)| t.0 == slot)
                else {
                    continue;
                };
                if piloting.is_some() {
                    continue; // already flying something
                }
                let Some((sent, spos, _, floor, rot, piloted)) =
                    ships.iter().find(|(e, _, env, _, _, _)| {
                        e.index_u32() == ship_eid.0 && env.def_ref == SHIP_REF
                    })
                else {
                    continue;
                };
                if piloted.is_some() {
                    continue; // someone else is aboard
                }
                if ppos.tile.chebyshev(spos.tile) > ENTER_RANGE {
                    continue; // out of reach
                }
                let z = floor.map(|f| f.0).unwrap_or(0);
                let facing = rot.map(|r| r.0 & 0x0F).unwrap_or(SHIP_PARKED_FACING);
                // Ship lifts off → clear its parked footprint so the pilot (and NPCs)
                // aren't blocked by the now-airborne hull. While flown it tile-blocks
                // nothing (other players collide via the OBB); re-blocked on landing.
                for t in ship_footprint(spos.tile, facing) {
                    map.unblock_tile_z(z, t);
                }
                commands.entity(pent).insert(Piloting(sent));
                commands.entity(sent).insert((
                    Piloted { pilot: slot },
                    ShipDrive {
                        phase: PHASE_LIFT,
                        ticks: 0,
                        facing,
                        blocked: Vec::new(),
                        floor: z,
                        tile: spos.tile,
                    },
                ));
                // Snap the pilot onto the ship so `ship.tile = pilot.tile` holds from
                // the first drive tick (the body is hidden client-side).
                if let Ok(mut b) = bodies.get_mut(pent) {
                    b.body.x = spos.tile.x as f32;
                    b.body.y = spos.tile.y as f32;
                    b.body.vx = 0.0;
                    b.body.vy = 0.0;
                }
            }
            PilotOp::Exit => {
                let Some((_, _, _, Some(piloting))) =
                    players.iter().find(|(_, t, _, _)| t.0 == slot)
                else {
                    continue;
                };
                if let Ok(mut d) = drives.get_mut(piloting.0) {
                    if d.phase == PHASE_FLY {
                        d.phase = PHASE_LAND;
                        d.ticks = 0;
                    }
                }
            }
            PilotOp::Launch => {
                // Only a flying ship can launch to space; the leaving cutscene then
                // runs in `drive_ships`, which takes both off-grid when it completes.
                let Some((_, _, _, Some(piloting))) =
                    players.iter().find(|(_, t, _, _)| t.0 == slot)
                else {
                    continue;
                };
                if let Ok(mut d) = drives.get_mut(piloting.0) {
                    if d.phase == PHASE_FLY {
                        d.phase = PHASE_LEAVING;
                        d.ticks = 0;
                    }
                }
            }
            PilotOp::Return => {
                // Re-materialise ship + pilot at the launch tile and play the entering
                // cutscene back into flight. `blocked` starts empty so `drive_ships`
                // re-blocks the footprint on its first tick.
                let Some((pent, _, in_space)) = space_pilots.iter().find(|(_, t, _)| t.0 == slot)
                else {
                    continue;
                };
                let InSpace {
                    ship,
                    tile,
                    floor,
                    facing,
                } = *in_space;
                commands.entity(pent).insert((
                    GridPos {
                        tile,
                        facing: Facing::Down,
                    },
                    Floor(floor),
                    Piloting(ship),
                ));
                commands.entity(pent).remove::<InSpace>();
                commands.entity(ship).insert((
                    GridPos {
                        tile,
                        facing: Facing::Down,
                    },
                    Floor(floor),
                    Piloted { pilot: slot },
                    ShipDrive {
                        phase: PHASE_ENTERING,
                        ticks: 0,
                        facing,
                        blocked: Vec::new(),
                        floor,
                        tile,
                    },
                ));
                if let Ok(mut b) = bodies.get_mut(pent) {
                    b.body.x = tile.x as f32;
                    b.body.y = tile.y as f32;
                    b.body.vx = 0.0;
                    b.body.vy = 0.0;
                }
            }
        }
    }
}

/// Per tick: bind each piloted ship to its pilot, re-block the moving footprint, derive
/// heading from velocity, advance the lift/land phase, and pack facing+phase into
/// `FurnitureRot` (streamed as the ship's `sub`). On land-complete the links drop; the
/// now-non-pilot player is ejected from the hull next tick by `resolve_ship_collision`.
#[allow(clippy::type_complexity)]
pub fn drive_ships(
    mut commands: Commands,
    mut map: ResMut<WalkableMap>,
    // `Without<PlayerSlotTag>` makes this &mut GridPos query provably disjoint from the
    // players' &GridPos query below — otherwise Bevy aborts the sim with a B0001 access
    // conflict at startup (panicked sim thread → no snapshots → client hangs forever).
    mut ships: Query<
        (
            Entity,
            &mut GridPos,
            &mut FurnitureRot,
            &Piloted,
            &mut ShipDrive,
        ),
        Without<PlayerSlotTag>,
    >,
    players: Query<(Entity, &PlayerSlotTag, &GridPos, &FloatMove)>,
) {
    for (sent, mut spos, mut rot, piloted, mut drive) in ships.iter_mut() {
        let Some((pent, _, ppos, fm)) = players.iter().find(|(_, t, _, _)| t.0 == piloted.pilot)
        else {
            continue;
        };

        // Heading from the pilot's velocity (hold last when nearly stopped).
        let (vx, vy) = (fm.body.vx, fm.body.vy);
        if vx * vx + vy * vy > FACING_VEL_EPS2 {
            drive.facing = facing16(vx, vy);
        }

        // The ship is AIRBORNE while flown — it does NOT tile-block (else the pilot
        // would collide with its own hull and be unable to move). Other players are
        // pushed out by the OBB collision instead; the footprint is re-blocked only
        // when it lands. Just bind the ship to the pilot's tile + heading.
        let new_tile = ppos.tile;
        drive.tile = new_tile;
        spos.tile = new_tile;

        // Phase machine.
        match drive.phase {
            PHASE_LIFT => {
                drive.ticks += 1;
                if drive.ticks >= LIFT_TICKS {
                    drive.phase = PHASE_FLY;
                }
            }
            PHASE_LAND => {
                drive.ticks += 1;
                if drive.ticks >= LAND_TICKS {
                    drive.phase = PHASE_OFF;
                    // Parked again: re-block the hull footprint at the landing tile so
                    // it blocks NPC pathing + on-foot collision like any parked ship.
                    for t in ship_footprint(drive.tile, drive.facing) {
                        map.block_tile_z(drive.floor, t);
                    }
                    // Hand control back: drop the links. The ex-pilot is shoved clear of
                    // the hull next tick (it no longer carries `Piloting`).
                    commands.entity(pent).remove::<Piloting>();
                    commands.entity(sent).remove::<Piloted>();
                    commands.entity(sent).remove::<ShipDrive>();
                }
            }
            PHASE_LEAVING => {
                drive.ticks += 1;
                if drive.ticks >= LEAVING_TICKS {
                    // Cutscene done: free the footprint and take ship + pilot off-grid.
                    // Removing `GridPos` drops both from every snapshot (`emit_snapshot`
                    // requires it) — to other clients they rose and vanished. The pilot
                    // carries `InSpace` so `PilotOp::Return` can re-materialise them.
                    for t in std::mem::take(&mut drive.blocked) {
                        map.unblock_tile_z(drive.floor, t);
                    }
                    commands.entity(pent).insert(InSpace {
                        ship: sent,
                        tile: drive.tile,
                        floor: drive.floor,
                        facing: drive.facing,
                    });
                    commands.entity(pent).remove::<Piloting>();
                    commands.entity(pent).remove::<GridPos>();
                    commands.entity(sent).remove::<GridPos>();
                    commands.entity(sent).remove::<Piloted>();
                    commands.entity(sent).remove::<ShipDrive>();
                    continue; // off-grid now; nothing left to drive this tick
                }
            }
            PHASE_ENTERING => {
                drive.ticks += 1;
                if drive.ticks >= ENTERING_TICKS {
                    drive.phase = PHASE_FLY;
                }
            }
            _ => {}
        }

        rot.0 = (drive.facing & 0x0F) | (drive.phase << 4);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn facing16_cardinals() {
        // Facing 0 = West (matches the parked sheet); quarters land on 0/4/8/12.
        assert_eq!(facing16(-1.0, 0.0), 0, "west");
        assert_eq!(facing16(0.0, -1.0), 4, "north (screen up)");
        assert_eq!(facing16(1.0, 0.0), 8, "east");
        assert_eq!(facing16(0.0, 1.0), 12, "south");
    }

    #[test]
    fn facing16_always_in_range() {
        // Any velocity maps into 0..=15, never out of the nibble.
        for i in 0..360 {
            let a = (i as f32).to_radians();
            let f = facing16(a.cos(), a.sin());
            assert!(f < 16, "facing {f} out of range at {i}deg");
        }
    }

    #[test]
    fn sub_packs_facing_and_phase_losslessly() {
        // The wire byte is `facing | phase << 4`; the client decodes
        // facing = sub & 0x0F, phase = sub >> 4. Round-trip every combo.
        for facing in 0u8..16 {
            for phase in [
                PHASE_OFF,
                PHASE_LIFT,
                PHASE_FLY,
                PHASE_LAND,
                PHASE_LEAVING,
                PHASE_ENTERING,
            ] {
                let sub = (facing & 0x0F) | (phase << 4);
                assert_eq!(sub & 0x0F, facing, "facing survives pack");
                assert_eq!(sub >> 4, phase, "phase survives pack");
            }
        }
    }

    #[test]
    fn phases_fit_the_high_nibble() {
        // All phases must fit in 4 bits so they never clobber the facing nibble.
        for phase in [
            PHASE_OFF,
            PHASE_LIFT,
            PHASE_FLY,
            PHASE_LAND,
            PHASE_LEAVING,
            PHASE_ENTERING,
        ] {
            assert!(phase < 16, "phase {phase} exceeds the nibble");
        }
    }
}

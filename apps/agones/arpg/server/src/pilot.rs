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
    EnvObject, FloatMove, Floor, FurnitureRot, GridPos, IntentBuffer, PendingPilotOps, PilotOp,
    Piloting, PlayerSlotTag, WalkableMap,
};

use std::collections::HashSet;

use crate::game::{SHIP_PARKED_FACING, SHIP_REF, SPAWN_FLOOR, ship_footprint, ship_home_tile};

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
/// each step is +22.5°. The screen-Y axis is inverted vs world-Y, so we negate `vy`.
/// `FACING_OFFSET = -2` aligns the iso-transformed key directions to the sprite spin:
/// A(west) maps to facing 0, D(east) to 8 (raw 2/10 before the offset).
const FACING_OFFSET: i32 = -2;
fn facing16(vx: f32, vy: f32) -> u8 {
    let a = (-vy).atan2(vx) + std::f32::consts::PI; // 0..2π, π(west)→0
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
    mut intents: Query<&mut IntentBuffer>,
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
                    // The ship is now a LOCOMOTION entity: its own float body (mirrored
                    // from the pilot in `drive_ships`) so it streams sub-tile pos/vel and
                    // moves smoothly, like a player — not a tile-snapped env prop.
                    FloatMove::at(spos.tile),
                ));
                // Snap the pilot onto the ship so `ship.tile = pilot.tile` holds from
                // the first drive tick (the body is hidden client-side). Clear any
                // leftover walk intents so the ship doesn't auto-drive off the moment
                // you board (you walked here holding a direction).
                if let Ok(mut b) = bodies.get_mut(pent) {
                    b.body.x = spos.tile.x as f32;
                    b.body.y = spos.tile.y as f32;
                    b.body.vx = 0.0;
                    b.body.vy = 0.0;
                }
                if let Ok(mut ib) = intents.get_mut(pent) {
                    ib.clear();
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
                    FloatMove::at(tile),
                ));
                if let Ok(mut b) = bodies.get_mut(pent) {
                    b.body.x = tile.x as f32;
                    b.body.y = tile.y as f32;
                    b.body.vx = 0.0;
                    b.body.vy = 0.0;
                }
                if let Ok(mut ib) = intents.get_mut(pent) {
                    ib.clear();
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
            Option<&Piloted>,
            &mut ShipDrive,
            &mut FloatMove,
        ),
        Without<PlayerSlotTag>,
    >,
    players: Query<(Entity, &PlayerSlotTag, &GridPos, &FloatMove)>,
) {
    for (sent, mut spos, mut rot, piloted, mut drive, mut ship_fm) in ships.iter_mut() {
        // A PILOTED ship mirrors its pilot's smooth float body (driving). A PILOTLESS
        // one is running a place-from-space / remove-to-space cutscene — it just plays
        // its phase machine in place. `pilot` is set only when a live pilot is aboard.
        let mut pilot = None;
        if let Some(p) = piloted {
            let Some((pe, _, _ppos, fm)) = players.iter().find(|(_, t, _, _)| t.0 == p.pilot)
            else {
                continue; // piloted but pilot missing this tick — recovery handles it
            };
            pilot = Some(pe);
            // The ship is the streamed locomotion entity (its `FloatMove` → sub-tile
            // qx/qy), so it moves exactly as the pilot drives, smoothly. Heading from
            // velocity; the airborne hull tile-blocks nothing (re-blocked on landing).
            ship_fm.body = fm.body;
            let (vx, vy) = (fm.body.vx, fm.body.vy);
            if vx * vx + vy * vy > FACING_VEL_EPS2 {
                drive.facing = facing16(vx, vy);
            }
            let (tx, ty) = ship_fm.body.tile();
            let new_tile = Tile::new(tx, ty);
            drive.tile = new_tile;
            spos.tile = new_tile;
        }

        // Phase machine (runs for piloted + pilotless cutscenes alike).
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
                    // Hand control back: drop the links. The ex-pilot (if any) is shoved
                    // clear of the hull next tick (it no longer carries `Piloting`).
                    if let Some(pe) = pilot {
                        commands.entity(pe).remove::<Piloting>();
                    }
                    commands.entity(sent).remove::<Piloted>();
                    commands.entity(sent).remove::<ShipDrive>();
                    commands.entity(sent).remove::<FloatMove>(); // parked = not a mover
                }
            }
            PHASE_LEAVING => {
                drive.ticks += 1;
                if drive.ticks >= LEAVING_TICKS {
                    // Cutscene done: free any footprint it held.
                    for t in std::mem::take(&mut drive.blocked) {
                        map.unblock_tile_z(drive.floor, t);
                    }
                    if let Some(pe) = pilot {
                        // PILOTED launch → take ship + pilot off-grid into the solo space
                        // instance. Removing `GridPos` drops both from every snapshot; the
                        // pilot carries `InSpace` so `PilotOp::Return` re-materialises them.
                        commands.entity(pe).insert(InSpace {
                            ship: sent,
                            tile: drive.tile,
                            floor: drive.floor,
                            facing: drive.facing,
                        });
                        commands.entity(pe).remove::<Piloting>();
                        commands.entity(pe).remove::<GridPos>();
                        commands.entity(sent).remove::<GridPos>();
                        commands.entity(sent).remove::<Piloted>();
                        commands.entity(sent).remove::<ShipDrive>();
                        commands.entity(sent).remove::<FloatMove>();
                    } else {
                        // PILOTLESS removal → the ship has risen to space; despawn it.
                        // (The kit was already returned to the remover's inventory when
                        // the reclaim was queued.)
                        commands.entity(sent).despawn();
                    }
                    continue; // gone (off-grid or despawned) this tick
                }
            }
            PHASE_ENTERING => {
                drive.ticks += 1;
                if drive.ticks >= ENTERING_TICKS {
                    // Descended from space back to hover height → keep landing all the
                    // way to the ground (the player expects to touch down on return,
                    // not hang in the air). LAND completes → parked + pilot returned.
                    drive.phase = PHASE_LAND;
                    drive.ticks = 0;
                }
            }
            _ => {}
        }

        rot.0 = (drive.facing & 0x0F) | (drive.phase << 4);
    }
}

/// Self-heal for a pilot that vanished (disconnect / roster eviction) while flying or
/// stranded in the space instance. Such a ship is orphaned — `Piloted` but its slot
/// has no live player, or off-grid with no live `InSpace` holding it — and would
/// otherwise hang around forever (or stay invisible) until a server restart. We just
/// FLOAT IT AWAY: free any tiles it held and despawn it, so it stops cluttering the
/// world. A fresh parked ship returns on the next boot.
///
/// Single indestructible ship for now. Per-player OWNED ships come next — that's an
/// ECS `ShipOwner(slot)` component on the ship + a per-player spawn; recovery then
/// re-parks an owner's ship at its home tile instead of despawning the shared one.
#[allow(clippy::type_complexity)]
pub fn recover_orphaned_ships(
    mut commands: Commands,
    mut map: ResMut<WalkableMap>,
    players: Query<&PlayerSlotTag>,
    space: Query<&InSpace>,
    ships: Query<(
        Entity,
        Option<&GridPos>,
        &EnvObject,
        Option<&Piloted>,
        Option<&ShipDrive>,
    )>,
) {
    // Build the live-pilot view once: slots with a connected player + ships a live
    // space-pilot still holds. Plain local sets inside one ECS system — no shared
    // state, no lock (the scheduler already gives this system exclusive access).
    let live_slots: HashSet<u16> = players.iter().map(|t| t.0.0).collect();
    let held_ships: HashSet<u32> = space.iter().map(|s| s.ship.index_u32()).collect();
    for (sent, gpos, env, piloted, drive) in ships.iter() {
        if env.def_ref != SHIP_REF {
            continue;
        }
        let orphaned = match piloted {
            // Flying, but the pilot's slot no longer has a live player.
            Some(p) => !live_slots.contains(&p.pilot.0),
            // Off-grid (in space) and no live pilot's `InSpace` references it.
            None => gpos.is_none() && !held_ships.contains(&sent.index_u32()),
        };
        if !orphaned {
            continue;
        }
        // Return the single indestructible ship HOME (parked + grounded) so it's always
        // findable, instead of vanishing until a restart. Free whatever it held, re-block
        // the home footprint, drop the drive links + any locomotion body.
        if let Some(d) = drive {
            for &t in &d.blocked {
                map.unblock_tile_z(d.floor, t);
            }
        }
        let home = ship_home_tile();
        for t in ship_footprint(home, SHIP_PARKED_FACING) {
            map.block_tile_z(SPAWN_FLOOR, t);
        }
        commands
            .entity(sent)
            .remove::<Piloted>()
            .remove::<ShipDrive>()
            .remove::<FloatMove>()
            .insert((
                GridPos {
                    tile: home,
                    facing: Facing::Down,
                },
                Floor(SPAWN_FLOOR),
                FurnitureRot(SHIP_PARKED_FACING),
            ));
    }
}

/// A freshly-spawned ship env (the `starship-kit` deployable just placed it, or it
/// restored from a prior session) gets the ENTERING phase + a float body so it DROPS
/// FROM ORBIT and lands, instead of popping in parked. `drive_ships` advances pilotless
/// ENTERING→LAND→OFF, and LAND re-blocks the hull footprint at the landing tile.
pub fn start_placed_ship_descent(
    mut commands: Commands,
    placed: Query<
        (
            Entity,
            &GridPos,
            &EnvObject,
            Option<&FurnitureRot>,
            Option<&Floor>,
        ),
        Added<EnvObject>,
    >,
) {
    for (e, pos, env, rot, floor) in placed.iter() {
        if env.def_ref != SHIP_REF {
            continue;
        }
        let facing = rot.map(|r| r.0 & 0x0F).unwrap_or(SHIP_PARKED_FACING);
        commands.entity(e).insert((
            ShipDrive {
                phase: PHASE_ENTERING,
                ticks: 0,
                facing,
                blocked: Vec::new(),
                floor: floor.map(|f| f.0).unwrap_or(0),
                tile: pos.tile,
            },
            FloatMove::at(pos.tile),
        ));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn facing16_opposites_and_quarters() {
        // Offset-agnostic structural checks (so calibrating FACING_OFFSET won't break
        // this): opposite world directions land 8 facings apart, perpendicular ones 4.
        let w = facing16(-1.0, 0.0);
        let e = facing16(1.0, 0.0);
        let n = facing16(0.0, -1.0);
        let s = facing16(0.0, 1.0);
        let gap = |a: u8, b: u8| {
            let d = (a as i32 - b as i32).rem_euclid(16);
            d.min(16 - d)
        };
        assert_eq!(gap(w, e), 8, "west/east are opposite");
        assert_eq!(gap(n, s), 8, "north/south are opposite");
        assert_eq!(gap(w, n), 4, "west/north are a quarter apart");
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

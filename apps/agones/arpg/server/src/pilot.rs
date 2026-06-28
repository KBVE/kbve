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
    EnvObject, EnvOpts, FloatMove, Floor, FurnitureRot, GridPos, InSpaceFlag, IntentBuffer,
    KindRegistry, PendingPilotOps, PilotOp, Piloting, PlacedBy, PlayerSlotTag,
    ReturnedFromInstance, WalkableMap, spawn_env_object,
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
/// Per-tick ease the landing ship glides toward its approved pad (≈ converges over
/// LAND_TICKS). Higher = snappier approach, lower = a longer drift to the spot.
const LAND_EASE: f32 = 0.28;
/// Ticks the leaving / entering atmosphere cutscenes hold (≈ the baked 18-frame anim).
const LEAVING_TICKS: u32 = 18;
const ENTERING_TICKS: u32 = 18;

/// How close (tiles, Chebyshev) the player must stand to board.
const ENTER_RANGE: i32 = 3;

/// On the ship entity while occupied: who flies it.
#[derive(Component)]
pub struct Piloted {
    pub pilot: proto::PlayerSlot,
}

/// Stable per-player ownership of a ship entity. Set when a ship is placed (from the
/// owner's `PlacedBy`) and when one is re-materialised on a space return. The invariant
/// is AT MOST ONE ship per owner: `return_from_space` despawns any pre-existing ship the
/// returning player owns before spawning their fresh flight ship, so a disconnect mid
/// launch (which leaves an orphan-reparked hull) can't leave a second ship behind.
#[derive(Component, Clone, Copy)]
pub struct ShipOwner(pub proto::PlayerSlot);

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
    /// Server-approved touchdown tile. While LANDING the ship glides here (a clear pad
    /// where the whole footprint fits) and parks, so a cramped spot doesn't snap. Equal
    /// to `tile` except during the land approach.
    pub land_tile: Tile,
}

/// 16-way heading the ship SHOWS, from its world velocity. The iso grid is rotated 45°,
/// so the world-tile direction isn't the on-screen direction the player navigates by
/// (pressing W moves world-NW but screen-North). We project world → screen space first
/// (`sx = vx - vy`, `sy = vx + vy`) so the sprite faces the way it moves on screen.
/// `sy` negated for screen-down = +y. `FACING_OFFSET = 0` matches the uniform re-bake's
/// frame map (verified in the Ship Codex): 0=W, 8=E, 4=S, 12=N. Flip `SY_SIGN` if N/S
/// swap; nudge `FACING_OFFSET` (±1 = 22.5°) on a re-bake that shifts the spin.
const FACING_OFFSET: i32 = 0;
const SY_SIGN: f32 = -1.0;
fn facing16(vx: f32, vy: f32) -> u8 {
    let (sx, sy) = (vx - vy, vx + vy); // world → iso screen velocity
    let a = (SY_SIGN * sy).atan2(sx) + std::f32::consts::PI; // 0..2π, π(west)→0
    let step = (a / (std::f32::consts::TAU) * 16.0).round() as i32;
    (step + FACING_OFFSET).rem_euclid(16) as u8
}

/// The server-approved touchdown tile: the nearest tile to `from` (spiral, ≤6 rings)
/// where the ship's WHOLE footprint is walkable — so landing never wedges the hull into
/// rock or another blocker. Falls back to the terrain-snapped tile so it always returns
/// a real floor. The pilot requests landing; the server picks the spot + the ship glides
/// to it (in `drive_ships`) instead of snapping.
fn clear_landing(map: &WalkableMap, z: i32, from: Tile, facing: u8) -> Tile {
    let fits = |t: Tile| {
        ship_footprint(t, facing)
            .into_iter()
            .all(|c| map.is_walkable_z(z, c))
    };
    if fits(from) {
        return from;
    }
    for r in 1..=6i32 {
        for dy in -r..=r {
            for dx in -r..=r {
                if dx.abs() != r && dy.abs() != r {
                    continue; // walk the ring only (interior covered by smaller r)
                }
                let t = Tile::new(from.x + dx, from.y + dy);
                if fits(t) {
                    return t;
                }
            }
        }
    }
    crate::game::floor_near_z(from, z)
}

/// Drain board/leave requests. Validates range + parked + unoccupied, then links the
/// player to the ship and co-locates it onto the hull so driving binds cleanly.
#[allow(clippy::type_complexity)]
pub fn apply_pilot_ops(
    mut commands: Commands,
    mut ops: ResMut<PendingPilotOps>,
    players: Query<(Entity, &PlayerSlotTag, &GridPos, Option<&Piloting>)>,
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
                        land_tile: spos.tile,
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
                        // Server approves the touchdown spot; the ship glides there over
                        // the LAND descent (drive_ships) so it never snaps into rock.
                        d.land_tile = clear_landing(&map, d.floor, d.tile, d.facing);
                        d.phase = PHASE_LAND;
                        d.ticks = 0;
                    }
                }
            }
            PilotOp::Launch => {
                // Only a flying ship can launch to space; the leaving cutscene then
                // runs in `drive_ships`, which takes both off-grid when it completes.
                let Some((pent, _, _, Some(piloting))) =
                    players.iter().find(|(_, t, _, _)| t.0 == slot)
                else {
                    continue;
                };
                if let Ok(mut d) = drives.get_mut(piloting.0) {
                    if d.phase == PHASE_FLY {
                        d.phase = PHASE_LEAVING;
                        d.ticks = 0;
                        // Flag bound-for-space NOW (reliable, ahead of any disconnect race)
                        // so the disconnect-save records `in_space` → auto-board on return.
                        commands.entity(pent).insert(InSpaceFlag);
                    }
                }
            }
            PilotOp::Return => {
                // Legacy no-op. Returning from space is now a DISCONNECT/RECONNECT: the
                // client closes its WS on entering space and rejoins on return, and
                // `return_from_space` re-materialises the player in their ship from the
                // persisted `in_space` flag. Kept for wire/enum compatibility.
            }
        }
    }
}

/// A player who just rejoined FROM the solo 3D space scene (the spawn system tagged them
/// `ReturnedFromInstance` off their persisted `in_space` flag) re-materialises mid-flight:
/// spawn their ship on their spawn tile, board it, and let `start_placed_ship_descent` +
/// `drive_ships` play the ENTERING descent → FLY so they arrive piloting. One-shot.
#[allow(clippy::type_complexity)]
pub fn return_from_space(
    mut commands: Commands,
    registry: Res<KindRegistry>,
    mut map: ResMut<WalkableMap>,
    returned: Query<
        (Entity, &PlayerSlotTag, &GridPos, Option<&Floor>),
        Added<ReturnedFromInstance>,
    >,
    owned: Query<(
        Entity,
        &ShipOwner,
        Option<&GridPos>,
        Option<&FurnitureRot>,
        Option<&ShipDrive>,
    )>,
) {
    for (pent, tag, gpos, floor) in returned.iter() {
        commands.entity(pent).remove::<ReturnedFromInstance>();
        // One ship per owner: clear any hull this player already owns (e.g. one the
        // orphan-recovery system re-parked after a disconnect mid-launch) before
        // spawning the fresh flight ship — otherwise the re-parked hull + the new one
        // would both exist. Free whatever tiles it held so its footprint isn't left
        // permanently blocked.
        for (sent, _, sgp, srot, sdrive) in owned.iter().filter(|(_, o, ..)| o.0 == tag.0) {
            if let Some(d) = sdrive {
                for &t in &d.blocked {
                    map.unblock_tile_z(d.floor, t);
                }
            }
            if let Some(gp) = sgp {
                let facing = srot.map(|r| r.0 & 0x0F).unwrap_or(SHIP_PARKED_FACING);
                let fz = sdrive.map(|d| d.floor).unwrap_or(SPAWN_FLOOR);
                for t in ship_footprint(gp.tile, facing) {
                    map.unblock_tile_z(fz, t);
                }
            }
            commands.entity(sent).despawn();
        }
        let z = floor.map(|f| f.0).unwrap_or(0);
        let tile = gpos.tile;
        let Some(ship) = spawn_env_object(
            &mut commands,
            &registry,
            SHIP_REF,
            tile,
            EnvOpts {
                floor: z,
                ..Default::default()
            },
        ) else {
            continue; // ship kind not registered — leave them on foot
        };
        // Boarded + facing: `start_placed_ship_descent` (Added<EnvObject>) gives it the
        // ENTERING descent + a float body next tick; with `Piloted` present, `drive_ships`
        // routes ENTERING → FLY so the pilot arrives flying, not parked.
        commands.entity(ship).insert((
            FurnitureRot(SHIP_PARKED_FACING),
            Piloted { pilot: tag.0 },
            ShipOwner(tag.0),
        ));
        commands.entity(pent).insert(Piloting(ship));
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
    mut players: Query<(Entity, &PlayerSlotTag, &GridPos, &mut FloatMove)>,
) {
    for (sent, mut spos, mut rot, piloted, mut drive, mut ship_fm) in ships.iter_mut() {
        // A PILOTED ship mirrors its pilot's smooth float body (driving). A PILOTLESS
        // one is running a place-from-space / remove-to-space cutscene — it just plays
        // its phase machine in place. `pilot` is set only when a live pilot is aboard.
        let mut pilot = None;
        if let Some(p) = piloted {
            let Some((pe, _, _ppos, mut fm)) =
                players.iter_mut().find(|(_, t, _, _)| t.0 == p.pilot)
            else {
                continue; // piloted but pilot missing this tick — recovery handles it
            };
            pilot = Some(pe);
            // LANDING: the ship glides itself to the server-approved pad. Ease the pilot's
            // body toward it (ignoring steer input) — the ship mirrors the body just below,
            // so pilot + hull ride in together and the pilot ejects beside the parked hull,
            // not where they hit F.
            if drive.phase == PHASE_LAND {
                let (lx, ly) = (drive.land_tile.x as f32, drive.land_tile.y as f32);
                fm.body.x += (lx - fm.body.x) * LAND_EASE;
                fm.body.y += (ly - fm.body.y) * LAND_EASE;
                fm.body.vx = 0.0;
                fm.body.vy = 0.0;
            }
            // The ship is the streamed locomotion entity (its `FloatMove` → sub-tile
            // qx/qy), so it moves exactly as the pilot drives, smoothly. The airborne hull
            // tile-blocks nothing (re-blocked on landing).
            ship_fm.body = fm.body;
            // Heading from the pilot's INTENT (the steered direction) so the ship's nose
            // LEADS the drift — but only while actually flyable, so a held key during the
            // land approach doesn't spin the parked nose. Keep the last heading otherwise.
            if matches!(drive.phase, PHASE_LIFT | PHASE_FLY)
                && (fm.intent_x != 0 || fm.intent_y != 0)
            {
                drive.facing = facing16(fm.intent_x as f32, fm.intent_y as f32);
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
                    // Settle exactly on the approved pad — the glide gets close; this
                    // removes sub-tile drift before we park + block the footprint.
                    drive.tile = drive.land_tile;
                    spos.tile = drive.land_tile;
                    ship_fm.body.x = drive.land_tile.x as f32;
                    ship_fm.body.y = drive.land_tile.y as f32;
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
                        // PILOTED launch → the pilot heads into the SOLO client-side space
                        // scene, so the client closes its WS. Flag them `InSpaceFlag` (the
                        // disconnect-save records `in_space` → `return_from_space` re-boards
                        // them on rejoin) and DESPAWN the ship: a fresh one is dropped on
                        // return. Drop GridPos so they vanish ("left the planet") in the
                        // brief window before the socket closes.
                        commands.entity(pe).insert(InSpaceFlag);
                        commands.entity(pe).remove::<Piloting>();
                        commands.entity(pe).remove::<GridPos>();
                        commands.entity(sent).despawn();
                    } else {
                        // PILOTLESS removal → the ship has risen to space; despawn it.
                        // (The kit was already returned to the remover's inventory when
                        // the reclaim was queued.)
                        commands.entity(sent).despawn();
                    }
                    continue; // gone (despawned / off-grid) this tick
                }
            }
            PHASE_ENTERING => {
                drive.ticks += 1;
                if drive.ticks >= ENTERING_TICKS {
                    // Two different arrivals share the ENTERING descent:
                    //   PILOTED return-from-space → hand control straight back to the
                    //     pilot (hovering, still aboard). They fly + land themselves.
                    //     (A server LAND here desynced + dumped them on foot.)
                    //   PILOTLESS kit-summon ("call my ship") → finish LANDING so it
                    //     parks at the safe tile and can be boarded.
                    drive.phase = if pilot.is_some() {
                        PHASE_FLY
                    } else {
                        PHASE_LAND
                    };
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
/// Ships are per-player (`ShipOwner`), so recovery re-parks the orphan at a CLEAR pad
/// near the shared home tile (spiralling out of any hull already parked there) rather
/// than stacking every orphan on one tile. The one-ship-per-owner invariant is enforced
/// at the return funnel: `return_from_space` despawns a player's pre-existing ship before
/// spawning their fresh one, so a re-parked orphan can't survive into a duplicate.
#[allow(clippy::type_complexity)]
pub fn recover_orphaned_ships(
    mut commands: Commands,
    mut map: ResMut<WalkableMap>,
    players: Query<&PlayerSlotTag>,
    ships: Query<(
        Entity,
        Option<&GridPos>,
        &EnvObject,
        Option<&Piloted>,
        Option<&ShipDrive>,
    )>,
) {
    // Live-pilot view: slots with a connected player. Plain local set inside one ECS
    // system — no shared state, no lock. A launch-to-space DESPAWNS the ship, so there
    // are no off-grid held ships to track anymore; only a disconnect mid-flight orphans.
    let live_slots: HashSet<u16> = players.iter().map(|t| t.0.0).collect();
    for (sent, gpos, env, piloted, drive) in ships.iter() {
        let _ = gpos;
        if env.def_ref != SHIP_REF {
            continue;
        }
        let orphaned = match piloted {
            // Flying, but the pilot's slot no longer has a live player (disconnected).
            Some(p) => !live_slots.contains(&p.pilot.0),
            // Pilotless ships are parked/descending env props — not orphans.
            None => false,
        };
        if !orphaned {
            continue;
        }
        // Return the owner's ship HOME (parked + grounded) so it's always findable,
        // instead of vanishing until a restart. Free whatever it held, then pick a clear
        // pad near home (so a second orphan doesn't stack on the first) + re-block its
        // footprint, and drop the drive links + any locomotion body.
        if let Some(d) = drive {
            for &t in &d.blocked {
                map.unblock_tile_z(d.floor, t);
            }
        }
        let home = clear_landing(&map, SPAWN_FLOOR, ship_home_tile(), SHIP_PARKED_FACING);
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
            Option<&PlacedBy>,
        ),
        Added<EnvObject>,
    >,
) {
    for (e, pos, env, rot, floor, placed_by) in placed.iter() {
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
                land_tile: pos.tile,
            },
            FloatMove::at(pos.tile),
        ));
        // A ship placed from a player's starship-kit carries `PlacedBy`; record its
        // owner so the one-ship-per-owner invariant (return_from_space dedup +
        // orphan recovery) can find and reclaim it later.
        if let Some(pb) = placed_by {
            commands.entity(e).insert(ShipOwner(pb.owner));
        }
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

    /// A returning player who already owns a hull (e.g. one orphan-recovery re-parked
    /// after a disconnect mid-launch) ends up with exactly ONE ship: the stale hull is
    /// despawned + its footprint freed before the fresh flight ship spawns.
    #[test]
    fn return_from_space_dedups_existing_owned_ship() {
        let mut app = App::new();
        let mut registry = KindRegistry::new();
        registry.register_env(SHIP_REF);
        app.insert_resource(registry);
        app.insert_resource(WalkableMap::open(64, 64));
        app.add_systems(Update, return_from_space);

        let slot = proto::PlayerSlot(0);
        // A hull this player already owns, parked at a fixed tile with its footprint
        // blocked (stand-in for an orphan-recovery re-park).
        let stale_tile = Tile::new(20, 20);
        {
            let mut map = app.world_mut().resource_mut::<WalkableMap>();
            for t in ship_footprint(stale_tile, SHIP_PARKED_FACING) {
                map.block_tile_z(SPAWN_FLOOR, t);
            }
        }
        let stale = app
            .world_mut()
            .spawn((
                GridPos::at(stale_tile),
                Floor(SPAWN_FLOOR),
                FurnitureRot(SHIP_PARKED_FACING),
                ShipOwner(slot),
            ))
            .id();

        let player = app
            .world_mut()
            .spawn((
                PlayerSlotTag(slot),
                GridPos::at(Tile::new(8, 8)),
                Floor(SPAWN_FLOOR),
                ReturnedFromInstance,
            ))
            .id();

        app.update();

        assert!(
            !app.world().entities().contains(stale),
            "pre-existing owned ship despawned"
        );
        {
            let map = app.world().resource::<WalkableMap>();
            for t in ship_footprint(stale_tile, SHIP_PARKED_FACING) {
                assert!(
                    map.is_walkable_z(SPAWN_FLOOR, t),
                    "stale ship footprint freed"
                );
            }
        }
        let count = {
            let mut q = app.world_mut().query::<&ShipOwner>();
            q.iter(app.world()).filter(|o| o.0 == slot).count()
        };
        assert_eq!(count, 1, "exactly one ship per owner after return");
        assert!(
            app.world().get::<Piloting>(player).is_some(),
            "returning player pilots the fresh ship"
        );
    }

    /// A ship placed from a player's starship-kit (carrying `PlacedBy`) inherits a
    /// matching `ShipOwner` from the descent system, so the dedup can later find it.
    #[test]
    fn placed_ship_inherits_owner_from_placedby() {
        let mut app = App::new();
        app.add_systems(Update, start_placed_ship_descent);

        let slot = proto::PlayerSlot(3);
        let ship = app
            .world_mut()
            .spawn((
                EnvObject {
                    def_ref: SHIP_REF.to_string(),
                },
                GridPos::at(Tile::new(10, 10)),
                Floor(SPAWN_FLOOR),
                FurnitureRot(SHIP_PARKED_FACING),
                PlacedBy {
                    owner: slot,
                    kit_ref: "starship-kit".to_string(),
                },
            ))
            .id();

        app.update();

        let owner = app.world().get::<ShipOwner>(ship);
        assert!(owner.is_some(), "placed ship inherits an owner");
        assert_eq!(owner.unwrap().0, slot, "owner matches the placer");
        assert!(
            app.world().get::<ShipDrive>(ship).is_some(),
            "placed ship also got the ENTERING descent rig"
        );
    }
}

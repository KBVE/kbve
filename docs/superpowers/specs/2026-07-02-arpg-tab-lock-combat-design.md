# ARPG Hybrid Combat: Soft-Aim + Tab-Lock

**Date:** 2026-07-02
**App:** `apps/agones/arpg/web` (Phaser isometric arpg / rentearth client)
**Status:** Design approved, pending implementation plan

## Problem

The arpg's ranged combat is cursor-aimed with soft aim-assist cones
(`acquireBowTarget`, `acquireSpellTarget`). The assist works but is **invisible**:
the player can't see what the cone locked onto, so a shot that visually looks like
a miss still registers as a hit — reading as a bug. There is also no way to
focus-fire a single target in a pack while repositioning (kiting), which a ranged
class wants.

## Goal

Add a **hybrid combat model**: keep cursor soft-aim as the default (free-aim), and
layer a **Tab hard-lock** on top. A locked target takes all attacks regardless of
cursor, freeing the cursor purely for movement so the player can kite. A visible
reticle shows the current lock (and, when free-aiming, what the cone will grab),
fixing the "why did that hit count" confusion.

## Non-Goals (YAGNI)

- No auto-attack toggle (attacks stay per-input; only their _target_ changes).
- No lock-priority weighting, threat, or tab-target tab-order config.
- No multi-lock / AoE lock.
- No server changes — the server is already target-authoritative by `serverEid`
  (`fireBowAt(aim, target?)`, `castSpell(ref, target)`), so lock is a
  client-side target-selection layer only.

## Architecture

One new isolated system, consulted by combat/spells, plus a reticle renderer.

### `systems/targetLock.ts` — the lock state + pure logic

```ts
export interface TargetLockState {
	lockedEid: number | null; // server eid of the locked hostile; null = free-aim
}

export function makeTargetLockState(): TargetLockState;

// First Tab (or click on a hostile): lock the hostile under the cursor, else the
// nearest hostile. Returns the new lockedEid (or null if no hostile available).
export function lockUnderCursor(
	st: TargetLockState,
	deps: TargetLockDeps,
	cursorTile: TileXY,
): number | null;

// Subsequent Tab: advance to the next-nearest hostile (by tile distance from the
// player), wrapping around; skips the current lock. Null if none.
export function cycleLock(
	st: TargetLockState,
	deps: TargetLockDeps,
): number | null;

// Manual clear (Tab on empty space / Esc).
export function clearLock(st: TargetLockState): void;

// Per-frame validity: clears the lock (with auto-advance on death) when any break
// condition trips. Returns the effective lockedEid after the tick.
export function tickLockValidity(
	st: TargetLockState,
	deps: TargetLockDeps,
): number | null;

// The aim point attacks should use while locked: the locked target's tile (so the
// shot auto-faces it). Null when unlocked (caller falls back to cursor aim).
export function lockedAimPoint(
	st: TargetLockState,
	deps: TargetLockDeps,
): TileXY | null;
```

`TargetLockDeps` exposes only what the logic needs — read-only store access,
`isHostile`, `isCorpse`, the player's predicted position, and a
range/line-of-sight probe — mirroring how `CombatDeps` / `SpellDeps` are shaped.
The scene owns exactly one `TargetLockState`, same lifecycle pattern as
`this.combat` / `this.spells`.

**Boundary:** combat and spells _read_ the lock; they do not own it. `targetLock`
depends on the store and the player position, not on combat internals.

### `systems/lockReticle.ts` — the visual feedback

A `Phaser.GameObjects.Graphics` (or pooled image) that each frame:

- Draws a **lock ring** pinned to the locked target's on-screen sprite position
  (`refs.sprite.x/y`, already hover-adjusted for flyers) — colored/pulsing.
- Optionally draws a **dimmer soft-hover highlight** on the hostile the free-aim
  cone would currently grab (cursor target), so free-aim also shows its pick.

The reticle reads `TargetLockState.lockedEid` and the cursor tile; it renders
only, holds no game state.

## Data Flow

```
Tab keydown ─► lockUnderCursor / cycleLock ─► TargetLockState.lockedEid
                                                     │
   each frame: tickLockValidity ──────────────────► (breaks on death/range/LoS/disengage)
                                                     │
attack input (Space / RMB / 1-9) ─► lockedAimPoint? ─┬─ locked: target = lockedEid, aim = its tile
                                                     └─ free:   existing cursor-acquire soft cone
                                                     │
                                              fireBowAt(aim, target) / castSpellSlot(...)
                                                     │
lockReticle (render) ◄───────────────────────────────
```

## Input Wiring (`input/sceneInput.ts`)

- **Tab** (`keydown`, `ev.code === 'Tab'`, `preventDefault` to stop browser focus
  jump; skip when `isTextInputFocused()`):
    - no current lock → `lockUnderCursor(cursorTile)`.
    - already locked → `cycleLock`.
- **Esc**: extend the existing Esc chain — if a lock is active, `clearLock` before
  the placement/inventory handling.
- **Attack inputs while locked** — Space (`fireKey`), right-click bow, and `1-9`
  spell slots route to the locked target instead of the cursor aim (see Attack
  Routing). Left-click stays **pure move** (kite). Exception: left-click _on a
  different hostile_ re-locks that hostile (preserves click-to-target muscle
  memory).
- **Cursor** movement/hover behavior is otherwise unchanged.

New `SceneInputDeps` members: `toggleLock()` / `cycleLock()` / `clearLock()` and a
`lockedTarget(): number | null` reader (thin scene methods over the state), so the
input hub stays decoupled from the state shape.

## Attack Routing (core change)

Both attack entry points gain a lock check _before_ the cursor-acquire path:

- `fireBowAt(st, deps, aim, target?)` — if a valid lock exists and no explicit
  `target` was passed, set `target = lockedEid` and `aim = lockedAimPoint` (the
  locked tile) so the shot auto-faces the lock. Otherwise the current soft-cone
  `acquireBowTarget` path runs (free-aim assist preserved).
- `castSpellSlot(st, deps, idx)` — same: a valid lock supplies the `target` to
  `castSpell` and the aim for the VFX, bypassing `acquireSpellTarget`; unlocked
  keeps the cone.

Both functions already accept/produce an explicit `target` serverEid, so this is a
small splice, not a rewrite. **Locked = hard target; free = soft cone.**

## Lock Validity (`tickLockValidity`, all four break conditions)

Run once per frame from the scene update loop:

1. **Target dies / despawns** — not in store, or `isCorpse(lockedEid)` → clear,
   then **auto-advance** to the next-nearest hostile within `ARROW_MAX_RANGE`
   (keeps focus-fire flowing); if none, unlock.
2. **Out of range / LoS** — target beyond `ARROW_MAX_RANGE`, or line-of-sight
   blocked, continuously for a short grace (~1.5 s) → clear. The grace avoids
   flicker when a target briefly ducks behind a prop.
3. **Player disengages** — player's predicted position leaves the fight radius
   (same range test from the player side) → clear.
4. **Manual** — Tab-on-empty / Esc → immediate clear (handled in input, not the
   tick).

## Reticle Feedback

- **Lock ring**: always shown on the locked target; the primary fix for the
  "invisible assist" complaint.
- **Soft-hover**: dim highlight on the free-aim cone's current pick, so even
  unlocked the player sees what a shot will hit.

Both derive from sprite screen positions (hover-aware) and the lock/cursor state;
render-only.

## Error / Edge Handling

- Lock references a `serverEid`; every read guards on the entity still existing in
  the store (returns null / triggers a break) — no stale-eid crashes.
- Locking during placement/inventory-open is suppressed (Tab ignored when a text
  field is focused; placement owns its own input mode).
- Auto-advance on death picks deterministically (nearest by tile distance, stable
  tie-break by serverEid) so it's testable.

## Testing

- **`targetLock.spec.ts`** (pure logic, vitest — the existing arpg-web test
  harness): lock-under-cursor picks the correct eid (under-cursor beats nearest);
  cycle order is nearest-outward and wraps; each break condition clears; death
  auto-advances to the next-nearest-in-range and unlocks when the pack is clear;
  `lockedAimPoint` returns the target tile.
- **Input, routing, reticle** — driven live in the running client (serve the app,
  Tab-lock a wyvern, kite, confirm shots stay on the lock and the ring tracks the
  sprite). No server or parity surface is touched.

## Files Touched

- **New:** `systems/targetLock.ts`, `systems/lockReticle.ts`,
  `systems/targetLock.spec.ts`.
- **Edited:** `input/sceneInput.ts` (Tab/Esc + routing branch),
  `systems/combat.ts` (`fireBowAt` lock check), `systems/spells.ts`
  (`castSpellSlot` lock check), `IsoArpgScene.ts` (own the state, wire deps, tick
  validity, render reticle).
- **Untouched:** all server / simgrid / shared-parity code.

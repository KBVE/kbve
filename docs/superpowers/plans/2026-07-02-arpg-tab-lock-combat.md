# ARPG Tab-Lock Combat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a hybrid soft-aim + Tab-lock combat model to the arpg web client — a locked hostile takes all bow/spell attacks regardless of cursor (freeing the cursor for kiting), with a visible reticle.

**Architecture:** One new pure-logic system (`targetLock.ts`) owns the lock state and selection/validity logic; a render-only system (`lockReticle.ts`) draws the ring. Combat (`fireBowAt`) and spells (`castSpellSlot`) consult the lock before their existing cursor-acquire cones. The scene owns one `TargetLockState`, ticks validity each frame, and renders the reticle. No server/simgrid/parity code changes — the server is already target-authoritative by `serverEid`.

**Tech Stack:** TypeScript, Phaser 4, vitest, nx. `@kbve/laser` `EntityStore`.

## Global Constraints

- Build/test via nx from repo root: `cd /Users/alappatel/Documents/GitHub/kbve && ./kbve.sh -nx arpg-web:typecheck` and `arpg-web:test`. If nx daemon flakes ("Plugin worker exited"), run `pnpm nx reset` then retry.
- No code comments unless they explain non-obvious _why_ (repo convention: minimal comments). Match surrounding tab-indent style (hard tabs).
- Vitest specs in `apps/agones/arpg/web/src` MUST NOT value-import `@kbve/laser` or `../ecs/store` (unresolvable under vitest node env). Inline `Cat.Npc = 1` as a number; hand-roll a fake store cast `as unknown as EntityStore<Ref>`. Pattern: `apps/agones/arpg/web/src/game/systems/netSync.spec.ts`.
- Server target-authoritative already: `fireBowAt(aim, target?)`, `castSpell(ref, target)`. Lock only selects the client-side `target` serverEid.
- LoS break condition is DEFERRED (no reusable tile-to-tile LoS helper exists in the scene). Validity uses range + disengage + death only. Note this in code, don't invent a raycast.

---

## File Structure

- **Create** `apps/agones/arpg/web/src/game/systems/targetLock.ts` — lock state + pure selection/validity logic.
- **Create** `apps/agones/arpg/web/src/game/systems/targetLock.spec.ts` — unit tests (hand-rolled fake store).
- **Create** `apps/agones/arpg/web/src/game/systems/lockReticle.ts` — render-only ring.
- **Modify** `apps/agones/arpg/web/src/game/systems/combat.ts` — `fireBowAt` lock check.
- **Modify** `apps/agones/arpg/web/src/game/systems/spells.ts` — `castSpellSlot` lock check.
- **Modify** `apps/agones/arpg/web/src/game/input/sceneInput.ts` — Tab/Esc dispatch, `SceneInputDeps` members.
- **Modify** `apps/agones/arpg/web/src/game/IsoArpgScene.ts` — own `TargetLockState`, build `TargetLockDeps`, tick validity, render reticle, wire input deps + attack routing.

---

## Task 1: `targetLock.ts` — state + selection + validity (pure logic)

**Files:**

- Create: `apps/agones/arpg/web/src/game/systems/targetLock.ts`
- Test: `apps/agones/arpg/web/src/game/systems/targetLock.spec.ts`

**Interfaces:**

- Consumes: `EntityStore<EntityRefs>` (`serverIdsWith(cat)`, `tile(sid)`, `has(sid)`), `TileXY` from `../iso`, `EntityRefs` from `../entities/sprites`, `Cat` from `@kbve/laser`.
- Produces:
    - `interface TargetLockState { lockedEid: number | null; }`
    - `interface TargetLockDeps { store: EntityStore<EntityRefs>; myEid(): number; isHostile(sid: number): boolean; isCorpse(sid: number): boolean; playerTile(): TileXY; maxRange(): number; }`
    - `makeTargetLockState(): TargetLockState`
    - `lockUnderCursor(st, deps, cursorTile: TileXY): number | null`
    - `cycleLock(st, deps): number | null`
    - `clearLock(st): void`
    - `tickLockValidity(st, deps): number | null`
    - `lockedAimPoint(st, deps): TileXY | null`
    - Helper (exported for tests): `hostilesByDistance(deps): { sid: number; dist: number }[]` — hostiles sorted nearest→farthest by tile distance from `playerTile()`, stable tie-break by ascending `sid`.

- [ ] **Step 1: Write the failing test**

Create `apps/agones/arpg/web/src/game/systems/targetLock.spec.ts`:

```ts
import { describe, it, expect } from 'vitest';
import type { EntityStore } from '@kbve/laser';
import type { EntityRefs } from '../entities/sprites';
import {
	makeTargetLockState,
	lockUnderCursor,
	cycleLock,
	clearLock,
	tickLockValidity,
	lockedAimPoint,
	hostilesByDistance,
	type TargetLockDeps,
} from './targetLock';

const CAT_NPC = 1;

interface FakeEntity {
	tile: { x: number; y: number };
	kind: number;
	corpse?: boolean;
}

function fakeDeps(
	ents: Record<number, FakeEntity>,
	player = { x: 0, y: 0 },
	range = 10,
): TargetLockDeps {
	const store = {
		serverIdsWith: (_c: number) =>
			Object.keys(ents)
				.map(Number)
				.filter((id) => ents[id].kind === CAT_NPC),
		tile: (id: number) => (ents[id] ? { ...ents[id].tile } : null),
		has: (id: number) => ents[id] !== undefined,
		refs: (id: number) => (ents[id] ? ({} as EntityRefs) : undefined),
	} as unknown as EntityStore<EntityRefs>;
	return {
		store,
		myEid: () => 999,
		isHostile: (id) => ents[id]?.kind === CAT_NPC && !ents[id]?.corpse,
		isCorpse: (id) => ents[id]?.corpse === true,
		playerTile: () => ({ ...player }),
		maxRange: () => range,
	};
}

describe('targetLock', () => {
	it('locks the hostile under the cursor when one is there', () => {
		const deps = fakeDeps({
			1: { tile: { x: 5, y: 0 }, kind: CAT_NPC },
			2: { tile: { x: 2, y: 0 }, kind: CAT_NPC },
		});
		const st = makeTargetLockState();
		const got = lockUnderCursor(st, deps, { x: 5, y: 0 });
		expect(got).toBe(1);
		expect(st.lockedEid).toBe(1);
	});

	it('falls back to nearest hostile when cursor is on empty tile', () => {
		const deps = fakeDeps({
			1: { tile: { x: 5, y: 0 }, kind: CAT_NPC },
			2: { tile: { x: 2, y: 0 }, kind: CAT_NPC },
		});
		const st = makeTargetLockState();
		expect(lockUnderCursor(st, deps, { x: 9, y: 9 })).toBe(2);
	});

	it('cycles nearest-outward and wraps, skipping the current lock', () => {
		const deps = fakeDeps({
			1: { tile: { x: 1, y: 0 }, kind: CAT_NPC },
			2: { tile: { x: 3, y: 0 }, kind: CAT_NPC },
			3: { tile: { x: 6, y: 0 }, kind: CAT_NPC },
		});
		const st = makeTargetLockState();
		lockUnderCursor(st, deps, { x: 1, y: 0 }); // lock 1 (nearest)
		expect(cycleLock(st, deps)).toBe(2);
		expect(cycleLock(st, deps)).toBe(3);
		expect(cycleLock(st, deps)).toBe(1); // wrap
	});

	it('clears the lock', () => {
		const deps = fakeDeps({ 1: { tile: { x: 1, y: 0 }, kind: CAT_NPC } });
		const st = makeTargetLockState();
		lockUnderCursor(st, deps, { x: 1, y: 0 });
		clearLock(st);
		expect(st.lockedEid).toBeNull();
	});

	it('validity: breaks and auto-advances when the target dies', () => {
		const ents: Record<number, FakeEntity> = {
			1: { tile: { x: 1, y: 0 }, kind: CAT_NPC },
			2: { tile: { x: 2, y: 0 }, kind: CAT_NPC },
		};
		const deps = fakeDeps(ents);
		const st = makeTargetLockState();
		lockUnderCursor(st, deps, { x: 1, y: 0 }); // lock 1
		ents[1].corpse = true; // 1 dies
		expect(tickLockValidity(st, deps)).toBe(2); // advanced to next-nearest
		expect(st.lockedEid).toBe(2);
	});

	it('validity: unlocks on death when no other hostile in range', () => {
		const ents: Record<number, FakeEntity> = {
			1: { tile: { x: 1, y: 0 }, kind: CAT_NPC },
		};
		const deps = fakeDeps(ents);
		const st = makeTargetLockState();
		lockUnderCursor(st, deps, { x: 1, y: 0 });
		ents[1].corpse = true;
		expect(tickLockValidity(st, deps)).toBeNull();
		expect(st.lockedEid).toBeNull();
	});

	it('validity: breaks when the target leaves range', () => {
		const ents: Record<number, FakeEntity> = {
			1: { tile: { x: 1, y: 0 }, kind: CAT_NPC },
		};
		const deps = fakeDeps(ents, { x: 0, y: 0 }, 5);
		const st = makeTargetLockState();
		lockUnderCursor(st, deps, { x: 1, y: 0 });
		ents[1].tile = { x: 50, y: 0 }; // far out of range
		expect(tickLockValidity(st, deps)).toBeNull();
	});

	it('lockedAimPoint returns the locked target tile, null when unlocked', () => {
		const deps = fakeDeps({ 1: { tile: { x: 4, y: 2 }, kind: CAT_NPC } });
		const st = makeTargetLockState();
		expect(lockedAimPoint(st, deps)).toBeNull();
		lockUnderCursor(st, deps, { x: 4, y: 2 });
		expect(lockedAimPoint(st, deps)).toEqual({ x: 4, y: 2 });
	});

	it('hostilesByDistance sorts nearest-first, tie-breaks by sid', () => {
		const deps = fakeDeps({
			5: { tile: { x: 2, y: 0 }, kind: CAT_NPC },
			3: { tile: { x: 2, y: 0 }, kind: CAT_NPC },
			1: { tile: { x: 5, y: 0 }, kind: CAT_NPC },
		});
		const order = hostilesByDistance(deps).map((h) => h.sid);
		expect(order).toEqual([3, 5, 1]);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/alappatel/Documents/GitHub/kbve && ./kbve.sh -nx arpg-web:test 2>&1 | tail -20`
Expected: FAIL — `targetLock.ts` does not exist / imports unresolved.

- [ ] **Step 3: Write minimal implementation**

Create `apps/agones/arpg/web/src/game/systems/targetLock.ts`:

```ts
import { EntityStore, Cat } from '@kbve/laser';
import type { EntityRefs } from '../entities/sprites';
import type { TileXY } from '../iso';

/**
 * Client-side target lock. A locked hostile takes all attacks regardless of the
 * cursor, so the cursor is freed for kiting. Pure selection/validity logic; the
 * scene owns the state and ticks validity each frame. LoS break is deferred —
 * the scene has no tile-to-tile LoS helper — so validity is range + death only.
 */
export interface TargetLockState {
	lockedEid: number | null;
}

export interface TargetLockDeps {
	store: EntityStore<EntityRefs>;
	myEid(): number;
	isHostile(sid: number): boolean;
	isCorpse(sid: number): boolean;
	playerTile(): TileXY;
	maxRange(): number;
}

export function makeTargetLockState(): TargetLockState {
	return { lockedEid: null };
}

export function clearLock(st: TargetLockState): void {
	st.lockedEid = null;
}

function isLiveHostile(deps: TargetLockDeps, sid: number): boolean {
	return deps.store.has(sid) && deps.isHostile(sid) && !deps.isCorpse(sid);
}

/** Hostiles sorted nearest→farthest by tile distance from the player, stable
 * tie-break by ascending serverEid. */
export function hostilesByDistance(
	deps: TargetLockDeps,
): { sid: number; dist: number }[] {
	const p = deps.playerTile();
	const out: { sid: number; dist: number }[] = [];
	for (const sid of deps.store.serverIdsWith(Cat.Npc)) {
		if (!isLiveHostile(deps, sid)) continue;
		const t = deps.store.tile(sid);
		if (!t) continue;
		out.push({ sid, dist: Math.hypot(t.x - p.x, t.y - p.y) });
	}
	out.sort((a, b) => a.dist - b.dist || a.sid - b.sid);
	return out;
}

/** First Tab / click: lock the hostile under the cursor, else the nearest. */
export function lockUnderCursor(
	st: TargetLockState,
	deps: TargetLockDeps,
	cursorTile: TileXY,
): number | null {
	const under = deps.store.at(cursorTile.x, cursorTile.y, deps.myEid());
	if (under && isLiveHostile(deps, under.serverEid)) {
		st.lockedEid = under.serverEid;
		return st.lockedEid;
	}
	const nearest = hostilesByDistance(deps)[0];
	st.lockedEid = nearest ? nearest.sid : null;
	return st.lockedEid;
}

/** Subsequent Tab: advance to the next hostile nearest-outward, wrapping. */
export function cycleLock(
	st: TargetLockState,
	deps: TargetLockDeps,
): number | null {
	const ordered = hostilesByDistance(deps).map((h) => h.sid);
	if (ordered.length === 0) {
		st.lockedEid = null;
		return null;
	}
	const idx = st.lockedEid == null ? -1 : ordered.indexOf(st.lockedEid);
	st.lockedEid = ordered[(idx + 1) % ordered.length];
	return st.lockedEid;
}

/** Per-frame validity: break on death (auto-advance to next-nearest in range)
 * or out-of-range; returns the effective lockedEid after the tick. */
export function tickLockValidity(
	st: TargetLockState,
	deps: TargetLockDeps,
): number | null {
	if (st.lockedEid == null) return null;
	const sid = st.lockedEid;
	const range = deps.maxRange();
	const p = deps.playerTile();
	const t = isLiveHostile(deps, sid) ? deps.store.tile(sid) : null;
	const inRange = t != null && Math.hypot(t.x - p.x, t.y - p.y) <= range;
	if (inRange) return sid;
	// Dead or out of range: auto-advance to the nearest hostile still in range.
	const next = hostilesByDistance(deps).find((h) => h.dist <= range);
	st.lockedEid = next ? next.sid : null;
	return st.lockedEid;
}

/** The aim point attacks use while locked (the locked target's tile). */
export function lockedAimPoint(
	st: TargetLockState,
	deps: TargetLockDeps,
): TileXY | null {
	if (st.lockedEid == null) return null;
	return deps.store.tile(st.lockedEid);
}
```

Note for the implementer: `store.at` needs adding to the fake store in the test if a test exercises the under-cursor path with `at`. The spec's `fakeDeps` above only stubs `serverIdsWith/tile/has/refs` — **add `at`** to the fake `store` object so `lockUnderCursor`'s under-cursor branch resolves. Update the fake:

```ts
		at: (x: number, y: number, _except: number) => {
			const id = Object.keys(ents)
				.map(Number)
				.find((k) => ents[k].tile.x === x && ents[k].tile.y === y);
			return id === undefined
				? null
				: { serverEid: id, eid: id, refs: {} as EntityRefs };
		},
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/alappatel/Documents/GitHub/kbve && ./kbve.sh -nx arpg-web:test 2>&1 | tail -20`
Expected: PASS — all `targetLock` tests green, existing 25 still pass.

- [ ] **Step 5: Typecheck**

Run: `cd /Users/alappatel/Documents/GitHub/kbve && ./kbve.sh -nx arpg-web:typecheck 2>&1 | tail -10`
Expected: `Successfully ran target typecheck`.

- [ ] **Step 6: Commit**

```bash
git add apps/agones/arpg/web/src/game/systems/targetLock.ts apps/agones/arpg/web/src/game/systems/targetLock.spec.ts
git commit -m "feat(arpg): target-lock state + selection/validity logic"
```

---

## Task 2: `lockReticle.ts` — the ring renderer (render-only)

**Files:**

- Create: `apps/agones/arpg/web/src/game/systems/lockReticle.ts`

**Interfaces:**

- Consumes: `Phaser`, `EntityStore<EntityRefs>`, `TargetLockState` from `./targetLock`, `DEPTH_UI` from `../config`.
- Produces:
    - `interface LockReticleHandle { update(lockedEid: number | null): void; destroy(): void; }`
    - `makeLockReticle(scene: Phaser.Scene, store: EntityStore<EntityRefs>): LockReticleHandle`

No unit test — render-only, verified live. This task's deliverable is the handle wired in Task 5.

- [ ] **Step 1: Write the implementation**

Create `apps/agones/arpg/web/src/game/systems/lockReticle.ts`:

```ts
import Phaser from 'phaser';
import { EntityStore } from '@kbve/laser';
import type { EntityRefs } from '../entities/sprites';
import { DEPTH_UI } from '../config';

/**
 * Lock reticle: a ring pinned to the locked target's on-screen sprite (already
 * hover-adjusted for flyers). Render-only — reads the locked eid each frame and
 * draws; holds no game state.
 */
export interface LockReticleHandle {
	update(lockedEid: number | null): void;
	destroy(): void;
}

const RING_COLOR = 0xf87171;
const RING_RADIUS = 26;

export function makeLockReticle(
	scene: Phaser.Scene,
	store: EntityStore<EntityRefs>,
): LockReticleHandle {
	const g = scene.add.graphics();
	g.setDepth(DEPTH_UI + 1);
	let phase = 0;
	return {
		update(lockedEid: number | null) {
			g.clear();
			if (lockedEid == null) return;
			const refs = store.refs(lockedEid);
			const sprite = refs?.sprite;
			if (!sprite) return;
			phase = (phase + 0.08) % (Math.PI * 2);
			const pulse = RING_RADIUS + Math.sin(phase) * 3;
			g.lineStyle(2, RING_COLOR, 0.9);
			g.strokeCircle(sprite.x, sprite.y, pulse);
		},
		destroy() {
			g.destroy();
		},
	};
}
```

- [ ] **Step 2: Typecheck**

Run: `cd /Users/alappatel/Documents/GitHub/kbve && ./kbve.sh -nx arpg-web:typecheck 2>&1 | tail -10`
Expected: `Successfully ran target typecheck` (unused-export warnings OK until Task 5 wires it).

- [ ] **Step 3: Commit**

```bash
git add apps/agones/arpg/web/src/game/systems/lockReticle.ts
git commit -m "feat(arpg): lock reticle ring renderer"
```

---

## Task 3: attack routing — `fireBowAt` + `castSpellSlot` consult the lock

**Files:**

- Modify: `apps/agones/arpg/web/src/game/systems/combat.ts` (`CombatDeps` + `fireBowAt`)
- Modify: `apps/agones/arpg/web/src/game/systems/spells.ts` (`SpellDeps` + `castSpellSlot`)

**Interfaces:**

- Consumes: `TileXY` from `../iso`.
- Produces: `CombatDeps` and `SpellDeps` each gain `lockedTarget(): number | null` and `lockedAim(): TileXY | null`. Behavior: when a lock exists and the caller passed no explicit `target`, attacks route to the locked eid with the locked tile as aim.

- [ ] **Step 1: Add the two deps to `CombatDeps`**

In `apps/agones/arpg/web/src/game/systems/combat.ts`, extend `CombatDeps` (after `isHostile`):

```ts
export interface CombatDeps {
	scene: Phaser.Scene;
	store: EntityStore<EntityRefs>;
	client(): GameClient | null;
	myEid(): number;
	floatPos(): { x: number; y: number };
	isHostile(serverEid: number): boolean;
	lockedTarget(): number | null;
	lockedAim(): TileXY | null;
	clearMovePath(): void;
	refreshHud(): void;
	destroyRefs(refs: EntityRefs): void;
}
```

- [ ] **Step 2: Route `fireBowAt` through the lock**

In `fireBowAt`, replace the `shotTarget` / `shotTile` derivation (currently lines ~141-146) with a lock-first version:

```ts
const locked = target == null ? deps.lockedTarget() : null;
const shotTarget = target ?? locked ?? acquireBowTarget(deps, from, aim);
// A lock supplies both the target and the aim (auto-face); else the arrow
// flies at the acquired enemy's tile, else the raw cursor aim.
const lockedAim = locked != null ? deps.lockedAim() : null;
const shotTile =
	lockedAim ??
	(shotTarget != null ? (deps.store.tile(shotTarget) ?? aim) : aim);
```

(The rest of `fireBowAt` — `shotSprite` / `screenTarget` / `fireBow(...)` — is unchanged; `shotTarget` and `shotTile` now already account for the lock.)

- [ ] **Step 3: Add the two deps to `SpellDeps`**

In `apps/agones/arpg/web/src/game/systems/spells.ts`, extend `SpellDeps`:

```ts
export interface SpellDeps {
	scene: Phaser.Scene;
	client(): GameClient | null;
	store: EntityStore<EntityRefs>;
	floatState: FloatState;
	predicted(): TileXY;
	aim(): TileXY;
	isHostile(serverEid: number): boolean;
	lockedTarget(): number | null;
	lockedAim(): TileXY | null;
}
```

- [ ] **Step 4: Route `castSpellSlot` through the lock**

In `castSpellSlot`, replace the `target` / `aim` derivation (currently lines ~66-72) so a lock wins for targeted spells:

```ts
const from = deps.predicted();
const locked = deps.lockedTarget();
const lockedAim = locked != null ? deps.lockedAim() : null;
const aim = lockedAim ?? deps.aim();
const target = targeted
	? (locked ?? acquireSpellTarget(deps, from, aim, meta?.range ?? 0))
	: null;
deps.client()?.castSpell(ref, target);
playSpellVfxAt(deps, meta, target, aim);
```

(The rest — `CastResult`, `boltTravelMs`, area-storm branch — is unchanged.)

- [ ] **Step 5: Typecheck (expected to FAIL until Task 4 supplies the deps)**

Run: `cd /Users/alappatel/Documents/GitHub/kbve && ./kbve.sh -nx arpg-web:typecheck 2>&1 | tail -15`
Expected: FAIL — `combatDeps()` / `spellDeps()` in `IsoArpgScene.ts` don't yet provide `lockedTarget` / `lockedAim`. This is expected; Task 4 fixes it. (If you prefer green-between-tasks, do Task 4 before typechecking.)

- [ ] **Step 6: Commit**

```bash
git add apps/agones/arpg/web/src/game/systems/combat.ts apps/agones/arpg/web/src/game/systems/spells.ts
git commit -m "feat(arpg): route bow + spell attacks through target lock"
```

---

## Task 4: scene owns the lock — state, deps, validity tick

**Files:**

- Modify: `apps/agones/arpg/web/src/game/IsoArpgScene.ts`

**Interfaces:**

- Consumes: everything from Tasks 1-3.
- Produces: scene methods `lockedTargetEid(): number | null`, `toggleLockTarget(cursorTile: TileXY): void`, `cycleLockTarget(): void`, `clearLockTarget(): void`; `combatDeps()` / `spellDeps()` now supply `lockedTarget` / `lockedAim`; `update()` ticks validity.

- [ ] **Step 1: Import the targetLock system**

Near the other `./systems/*` imports in `IsoArpgScene.ts`:

```ts
import {
	makeTargetLockState,
	lockUnderCursor as lockUnderCursorV,
	cycleLock as cycleLockV,
	clearLock as clearLockV,
	tickLockValidity as tickLockValidityV,
	lockedAimPoint as lockedAimPointV,
	type TargetLockState,
	type TargetLockDeps,
} from './systems/targetLock';
```

- [ ] **Step 2: Add the state field**

Alongside `private combat` / `private spells` fields (near line 311):

```ts
	private targetLock: TargetLockState = makeTargetLockState();
```

- [ ] **Step 3: Add a `targetLockDeps()` builder**

Mirror `combatDeps()` (uses `ARROW_MAX_RANGE` already imported in the file; `this.move.predicted` is the player tile):

```ts
	private targetLockDeps(): TargetLockDeps {
		return {
			store: this.store,
			myEid: () => this.myEid,
			isHostile: (e) => this.isHostileServer(e),
			isCorpse: (e) => this.kinds.ref(this.store.kind(e)) === CORPSE_REF,
			playerTile: () => this.move.predicted,
			maxRange: () => ARROW_MAX_RANGE,
		};
	}
```

(Confirm `CORPSE_REF` is imported — it already is, from `../entities/sprites`. `ARROW_MAX_RANGE` is imported from `../config`.)

- [ ] **Step 4: Add the scene lock methods**

```ts
	private lockedTargetEid(): number | null {
		return this.targetLock.lockedEid;
	}

	private toggleLockTarget(cursorTile: TileXY): void {
		if (this.targetLock.lockedEid == null) {
			lockUnderCursorV(this.targetLock, this.targetLockDeps(), cursorTile);
		} else {
			cycleLockV(this.targetLock, this.targetLockDeps());
		}
	}

	private cycleLockTarget(): void {
		cycleLockV(this.targetLock, this.targetLockDeps());
	}

	private clearLockTarget(): void {
		clearLockV(this.targetLock);
	}
```

- [ ] **Step 5: Supply the deps in `combatDeps()` and `spellDeps()`**

In `combatDeps()` add after `isHostile`:

```ts
			lockedTarget: () => this.targetLock.lockedEid,
			lockedAim: () => lockedAimPointV(this.targetLock, this.targetLockDeps()),
```

In `spellDeps()` add after `isHostile`:

```ts
			lockedTarget: () => this.targetLock.lockedEid,
			lockedAim: () => lockedAimPointV(this.targetLock, this.targetLockDeps()),
```

- [ ] **Step 6: Tick validity each frame**

In `update()`, after the `if (!this.client || !this.predictSeeded) return;` guard (line ~1954) and where `myRefs` is available (near `tickLocalMotion`, line ~1973), add:

```ts
tickLockValidityV(this.targetLock, this.targetLockDeps());
```

- [ ] **Step 7: Typecheck**

Run: `cd /Users/alappatel/Documents/GitHub/kbve && ./kbve.sh -nx arpg-web:typecheck 2>&1 | tail -10`
Expected: `Successfully ran target typecheck` (Task 3's consumers are now satisfied).

- [ ] **Step 8: Test (regression — existing suite still green)**

Run: `cd /Users/alappatel/Documents/GitHub/kbve && ./kbve.sh -nx arpg-web:test 2>&1 | tail -15`
Expected: PASS — targetLock specs + prior 25.

- [ ] **Step 9: Commit**

```bash
git add apps/agones/arpg/web/src/game/IsoArpgScene.ts
git commit -m "feat(arpg): scene owns target lock — deps + validity tick"
```

---

## Task 5: input wiring (Tab / Esc) + reticle render

**Files:**

- Modify: `apps/agones/arpg/web/src/game/input/sceneInput.ts`
- Modify: `apps/agones/arpg/web/src/game/IsoArpgScene.ts`

**Interfaces:**

- Consumes: scene lock methods (Task 4), `makeLockReticle` (Task 2).
- Produces: Tab toggles/cycles lock; Esc clears lock first; left-click on a different hostile re-locks it; reticle renders each frame.

- [ ] **Step 1: Add lock members to `SceneInputDeps`**

In `sceneInput.ts`, extend `SceneInputDeps` (after `startMoveTo`):

```ts
	toggleLockTarget(cursorTile: TileXY): void;
	cycleLockTarget(): void;
	clearLockTarget(): void;
	lockedTarget(): number | null;
```

- [ ] **Step 2: Add the Tab branch in keydown**

In the `keydown` handler, add to the `if/else if` chain (after the `Escape` branch, before the closing brace at ~line 93). Tab reads the cursor tile the same way `pointerdown` does:

```ts
		} else if (ev.key === 'Tab') {
			ev.preventDefault();
			const p = scene.input.activePointer;
			const aim = screenToWorldF(p.worldX, p.worldY);
			deps.toggleLockTarget({ x: Math.round(aim.x), y: Math.round(aim.y) });
		}
```

(`screenToWorldF` is already imported at the top of `sceneInput.ts`.)

- [ ] **Step 3: Clear lock on Escape**

In the existing `Escape` branch, clear an active lock first (before placement/inventory handling):

```ts
		} else if (ev.key === 'Escape') {
			if (deps.lockedTarget() != null) {
				deps.clearLockTarget();
			} else if (deps.inv.placingRef) {
				deps.exitPlacement();
			} else if (deps.inv.open) {
				deps.inv.open = false;
				emitInventoryOpen(false);
			}
		}
```

- [ ] **Step 4: Left-click a different hostile re-locks it**

In the `pointerdown` handler, in the hostile branch (currently lines ~155-163, `if (hit && deps.isHostile(hit.serverEid))`), lock that hostile before firing so the reticle follows a clicked target:

```ts
const hit = deps.store.at(tile.x, tile.y, deps.myEid());
if (hit && deps.isHostile(hit.serverEid)) {
	deps.toggleLockTarget({ x: tile.x, y: tile.y });
	deps.move.movePath = [];
	deps.fireBowAt(aim, hit.serverEid);
	return;
}
```

Note: `toggleLockTarget` only _locks_ here (its under-cursor branch resolves the clicked hostile); if a lock already exists it cycles — undesirable on a direct click. To always lock the clicked enemy, add a dedicated scene method instead. **Use this exact input dep** — add `lockTargetEid(serverEid: number): void` to `SceneInputDeps` and call `deps.lockTargetEid(hit.serverEid)` here. Wire it in Step 6.

Corrected click branch:

```ts
const hit = deps.store.at(tile.x, tile.y, deps.myEid());
if (hit && deps.isHostile(hit.serverEid)) {
	deps.lockTargetEid(hit.serverEid);
	deps.move.movePath = [];
	deps.fireBowAt(aim, hit.serverEid);
	return;
}
```

And add to `SceneInputDeps`:

```ts
	lockTargetEid(serverEid: number): void;
```

- [ ] **Step 5: Add `lockTargetEid` scene method + set it directly**

In `IsoArpgScene.ts`, add:

```ts
	private lockTargetEid(serverEid: number): void {
		this.targetLock.lockedEid = serverEid;
	}
```

- [ ] **Step 6: Wire the input deps in the scene**

Where the scene builds `SceneInputDeps` (the `setupInput` call / input deps object, near line 966), add:

```ts
			toggleLockTarget: (t) => this.toggleLockTarget(t),
			cycleLockTarget: () => this.cycleLockTarget(),
			clearLockTarget: () => this.clearLockTarget(),
			lockedTarget: () => this.lockedTargetEid(),
			lockTargetEid: (e) => this.lockTargetEid(e),
```

- [ ] **Step 7: Create + render the reticle**

Import at top of `IsoArpgScene.ts`:

```ts
import { makeLockReticle, type LockReticleHandle } from './systems/lockReticle';
```

Add a field (near `targetLock`):

```ts
	private lockReticle!: LockReticleHandle;
```

Initialize it in `create()` (after the store/systems are set up — place alongside other `make*` system inits):

```ts
this.lockReticle = makeLockReticle(this, this.store);
```

Render each frame in `update()`, after `refreshHud()` (line ~1987):

```ts
this.lockReticle.update(this.targetLock.lockedEid);
```

- [ ] **Step 8: Typecheck**

Run: `cd /Users/alappatel/Documents/GitHub/kbve && ./kbve.sh -nx arpg-web:typecheck 2>&1 | tail -10`
Expected: `Successfully ran target typecheck`.

- [ ] **Step 9: Test (regression)**

Run: `cd /Users/alappatel/Documents/GitHub/kbve && ./kbve.sh -nx arpg-web:test 2>&1 | tail -15`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add apps/agones/arpg/web/src/game/input/sceneInput.ts apps/agones/arpg/web/src/game/IsoArpgScene.ts
git commit -m "feat(arpg): Tab-lock input wiring + reticle render"
```

---

## Task 6: live verification

**Files:** none (drive the running app).

- [ ] **Step 1: Serve**

Run: `cd /Users/alappatel/Documents/GitHub/kbve && ./kbve.sh -nx arpg-web:serve`

- [ ] **Step 2: Verify each behavior in-game**

- Tab with cursor over a wyvern → ring appears on it; bow/spell keys hit it regardless of where the cursor then points.
- Move (WASD / left-click) while locked → player kites; shots stay on the locked wyvern; ring tracks the sprite (including its hover lift).
- Tab again → lock cycles to next-nearest hostile.
- Kill the locked target → lock auto-advances to the next in range, or clears if none.
- Walk the target out of range → lock clears.
- Esc → lock clears. Left-click a different hostile → lock jumps to it.
- Unlocked free-aim → soft cones still work (prior behavior intact).

- [ ] **Step 3: Report observations** (feel, reticle readability, cycle order, any jank). Tune constants (`RING_RADIUS`, cycle order) if needed.

---

## Self-Review Notes

- **Spec coverage:** lock-under-cursor+cycle (Task 1), attack routing hard-lock (Task 3), all break conditions except LoS (Task 1 — LoS explicitly deferred per Global Constraints, no helper exists), reticle (Tasks 2/5), input/kite (Task 5), tests (Task 1), live drive (Task 6). Soft-hover free-aim highlight from the spec is DROPPED as YAGNI for v1 (lock ring alone fixes the invisible-assist complaint); revisit if free-aim still reads as a mystery.
- **Type consistency:** `lockedTarget()`/`lockedAim()` names identical across CombatDeps, SpellDeps, and the scene builders. `TargetLockDeps` members match the fake store in the spec (with `at` added per the Task 1 note).
- **Known plan seam:** Task 3 Step 5 typecheck fails by design (deps not yet supplied); Task 4 closes it. Implementer may reorder 3↔4 for green-between if using strict per-task gates.

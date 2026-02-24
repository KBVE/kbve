# ASTRO_DROID_PLAN — Phases 13–15

> Phases 1–12 completed and delivered in prior PRs.

---

## Phase 13: Element Pooling for Overlay Components

**Problem:** All three overlay components return `null` when inactive, causing full React unmount/remount on each show/hide. This creates unnecessary DOM churn.

**Solution:** Keep elements always rendered, toggle visibility via CSS, mutate content in-place.

### 13a — ToastContainer

**File:** `packages/npm/astro/src/react/ToastContainer.tsx`

- Container always renders (no more early `return null`)
- Pre-render `maxVisible` `PooledToastSlot` elements
- Each slot receives `toast: ToastPayload | null`
    - `null` → `opacity-0 invisible max-h-0 overflow-hidden pointer-events-none` + `aria-hidden="true"`
    - non-null → `opacity-100 visible max-h-40 pointer-events-auto`
- Slot assignment: `entries[i]` maps to slot `i`, remaining slots get `null`
- Auto-dismiss timer inside `PooledToastSlot` via `useEffect`
- `transition-all duration-200` for smooth fade

**Status:** Complete

### 13b — ModalOverlay

**File:** `packages/npm/astro/src/react/ModalOverlay.tsx`

- Portal always exists in `document.body` (removed `if (!open) return null`)
- When closed: `opacity-0 invisible pointer-events-none` + `aria-hidden="true"` on backdrop
- When open: `opacity-100 visible pointer-events-auto bg-black/50 backdrop-blur-sm`
- Content panel: `scale-95` → `scale-100` transition on open
- Body scroll lock / escape key / backdrop click effects remain guarded by `if (!open)`
- `transition-all duration-200` on backdrop, `transition-transform duration-200` on panel

**Status:** Complete

### 13c — TooltipOverlay

**File:** `packages/npm/astro/src/react/TooltipOverlay.tsx`

- Portal always exists in `document.body` (removed `if (!open) return null`)
- When closed: `opacity-0 invisible pointer-events-none` + positioned offscreen (`top: -9999px`)
- When open: `opacity-100 visible` + positioned via `getBoundingClientRect()`
- `transition-opacity duration-150`

**Status:** Complete

---

## Phase 14: SharedWorker First-Connection Detection

**Problem:** `db-worker.ts` and `ws-worker.ts` have no port tracking — no way to know if a tab is the first to connect (leader tab) or a subsequent tab joining an existing worker.

**Solution:** Add `ports` Set, emit `first-connect` or `reconnect` message to each connecting port.

### 14a — db-worker.ts

**File:** `packages/npm/droid/src/lib/workers/db-worker.ts`

- Added `const ports = new Set<MessagePort>()`
- On `self.onconnect`: track port, check `ports.size === 0` before adding, `postMessage({ type: 'first-connect' | 'reconnect' })`

**Status:** Complete

### 14b — ws-worker.ts

**File:** `packages/npm/droid/src/lib/workers/ws-worker.ts`

- Same pattern as 14a

**Status:** Complete

### 14c — main.ts receiver

**File:** `packages/npm/droid/src/lib/workers/main.ts`

- Added `listenFirstConnect(port)` helper — listens for `first-connect`/`reconnect` message with 5s timeout
- `initStorageComlink()` returns `{ api, isFirstConnection }`
- `initWsComlink()` returns `{ ws, isFirstConnection }`
- In `main()`: `const isLeaderTab = dbFirst && wsFirst`

**Status:** Complete

### 14d — New event type

**File:** `packages/npm/droid/src/lib/types/event-types.ts`

- Added `DroidFirstConnectSchema` with `timestamp` and `workersFirst: { db, ws }`
- Registered `'droid-first-connect'` in `DroidEventSchemas`

**Status:** Complete

---

## Phase 15: Welcome Toast on SharedWorker Init

**Problem:** No user-facing feedback when the droid system initializes and the user is authenticated.

**Solution:** When leader tab is detected (Phase 14) and `$auth.tone === 'auth'`, show "Welcome back, {name}" toast. Anonymous users see nothing.

### 15a — welcome-toast.ts

**File:** `packages/npm/droid/src/lib/state/welcome-toast.ts` (NEW)

- `showWelcomeToast()` with auth-awaiting logic
- Fast path: auth already resolved → fires immediately
- Slow path: subscribes to `$auth`, waits for tone change
- 10s timeout if auth never resolves
- Module-level `shown` flag prevents duplicate toasts across Astro view transitions

**Status:** Complete

### 15b — Wire into main.ts

**File:** `packages/npm/droid/src/lib/workers/main.ts`

- Import `showWelcomeToast` from `'../state/welcome-toast'`
- Call after determining `isLeaderTab`:
    ```ts
    if (isLeaderTab) {
      events.emit('droid-first-connect', { ... });
      showWelcomeToast();
    }
    ```

**Status:** Complete

### 15c — Export

**File:** `packages/npm/droid/src/lib/state/index.ts`

- Added `export { showWelcomeToast } from './welcome-toast'`

**Status:** Complete

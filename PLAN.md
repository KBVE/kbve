# Droid Library Upgrade + Droid E2E Plan

## Context

The `@kbve/droid` package (v0.0.6) manages workers (canvas, db, ws), UIUX state, i18n, mod-manager, and flex/protobuf data encoding. The new `kbve.com/website/astro` project has a more modern gateway system with strategy-based worker selection (SharedWorker/WebWorker/Direct), a proper WorkerPool, BroadcastChannel communication, heartbeat/reconnect logic, and IDB-backed auth storage for Supabase.

**Goal**: Upgrade droid to incorporate the gateway pattern from kbve.com, update outdated deps, modernize the worker init system, add protobuf support from the new kbve.com protos, and create a `droid-e2e` package for Playwright-based testing.

---

## Step 1: Update droid package.json dependencies

**Current (outdated)**:
- `comlink: ^4.3.1` → keep (still latest)
- `@nanostores/persistent: ^0.7.1` → bump to `^0.9.1` (match workspace)
- `dexie: ^3.2.4` → **bump to `^4.0.9`** (Dexie 4 — BREAKING, see below)
- `zod: ^3.22.4` → bump to `^3.23.8` (match workspace)
- `flatbuffers: ^25.2.10` → keep
- Add `@bufbuild/protobuf` for protobuf wire support (used by kbve.com protos)

Also bump version to `0.1.0` to reflect breaking changes.

### Dexie 3 → 4 Migration (Critical)

Dexie 4 is a major upgrade. Current droid has `^3.2.4`, workspace root has `^4.0.9`, new kbve.com uses `^4.2.1`.

**Breaking changes that affect `db-worker.ts`**:
- `Table` type import path changed — now accessed via `Dexie` namespace or direct import
- Second generic on `Table<T, Key>` is now optional (inferred from schema)
- `version().stores()` API is the same but internal indexing behavior changed
- `bulkPut` / `bulkAdd` now return arrays of keys instead of `void`
- `toCollection().primaryKeys()` return type is stricter

**Migration steps for `db-worker.ts`**:
1. Update `import Dexie, { type Table } from 'dexie'` → verify Table still exports (it does in v4)
2. Bump `AppDexie` version number (`this.version(3)` → `this.version(4)`) to trigger Dexie's upgrade path
3. Verify all `bulkPut`, `toArray`, `get`, `put`, `clear` calls still compile
4. The new `supabase-shared-worker.ts` and `supabase-db-worker.ts` (from kbve.com) already use Dexie 4 patterns — use those as reference

## Step 2: Add Gateway system from kbve.com into droid

Port the following from `kbve.com/website/astro/src/lib/gateway/` into `packages/npm/droid/src/lib/gateway/`:

- `types.ts` — `ISupabaseStrategy`, `SelectOptions`, `SessionResponse`, `WebSocketStatus`, `StrategyType`, `BrowserCapabilities`, `WorkerMessage/Response`, `BroadcastEvent`
- `capabilities.ts` — `detectCapabilities()`, `selectStrategy()`, `logCapabilities()`
- `WorkerCommunication.ts` — BroadcastChannel wrapper
- `WorkerPool.ts` — Worker pool with round-robin dispatch
- `SupabaseGateway.ts` — Strategy-selecting unified gateway
- `strategies/SharedWorkerStrategy.ts`
- `strategies/WebWorkerStrategy.ts`
- `strategies/DirectStrategy.ts`

Also port the worker implementations:
- `supabase.shared.ts` → `src/lib/workers/supabase-shared-worker.ts`
- `supabase.db.ts` → `src/lib/workers/supabase-db-worker.ts`

These replace the current fragile 5-fallback cascade in `main.ts` for Supabase operations.

## Step 3: Add protobuf support (from kbve.com protos)

Copy the proto definitions from `kbve.com/proto/kbve/` into `packages/data/proto/kbve/` (the ones that are new: `common.proto`, `enums.proto`, `profile.proto`, `schema.proto`, `pool.proto`, `snapshot.proto`).

Add a `buf.gen.yaml` to droid and generate TS types using `@bufbuild/buf`, matching the kbve.com setup. Export generated types from droid so downstream packages (`@kbve/astro`) can import them.

## Step 4: Modernize existing workers

- **db-worker.ts**: Update Dexie from v3 to v4 API, add IDB-backed auth storage (from kbve.com's `IDBStorage` pattern)
- **ws-worker.ts**: Add heartbeat/ping-pong, reconnect logic, proper status broadcasting (from kbve.com's `supabase.shared.ts`)
- **canvas-worker.ts**: No changes needed, already clean
- **main.ts**: Refactor the init chain to use the gateway's strategy selection instead of the 5-step fallback cascade. Keep the UIUX/i18n/mod-manager mounting but delegate worker creation to the gateway.

## Step 5: Update vite.config.ts build entries

Add the new gateway workers and supabase workers to the Rollup input/output config so they're properly bundled as separate worker entry points.

## Step 6: Update exports in index.ts and package.json

- Export gateway types and the `SupabaseGateway` class
- Export proto-generated types
- Update `package.json` exports map for new worker entry points
- Update `files` array

## Step 7: Create `packages/npm/droid-e2e` package

Following the `laser-e2e` pattern:

```
packages/npm/droid-e2e/
  project.json          # Nx project config with e2e/serve/build targets
  package.json          # @kbve/droid-e2e, private
  playwright.config.ts  # Playwright config, port 4301
  vite.config.ts        # Vite dev server for test harness
  tsconfig.json
  index.html            # Test harness entry
  src/
    main.tsx            # React entry
    app/
      App.tsx           # Test harness root
      WorkerTest.tsx    # Tests worker init + messaging
      GatewayTest.tsx   # Tests SupabaseGateway strategy selection
      EventBusTest.tsx  # Tests DroidEventBus emit/on/wait
  e2e/
    worker-init.spec.ts       # E2E: workers initialize without errors
    gateway-strategy.spec.ts  # E2E: correct strategy selected per browser
    event-bus.spec.ts         # E2E: events fire and are received
    uiux-panels.spec.ts       # E2E: panel open/close/toggle state
```

The e2e tests will:
1. Verify droid initializes all workers (canvas, db, ws) without console errors
2. Verify the gateway selects the correct strategy (SharedWorker in Chromium)
3. Verify the event bus fires `droid-ready` after init
4. Verify UIUX panel state management (open/close/toggle)
5. Verify i18n key get/set round-trip through the db worker

---

## Files to create/modify (in worktree `/Users/alappatel/Documents/GitHub/kbve-droid-upgrade`)

### Modified:
- `packages/npm/droid/package.json`
- `packages/npm/droid/src/index.ts`
- `packages/npm/droid/src/lib/workers/main.ts`
- `packages/npm/droid/src/lib/workers/db-worker.ts`
- `packages/npm/droid/src/lib/workers/ws-worker.ts`
- `packages/npm/droid/vite.config.ts`
- `packages/npm/droid/src/types.d.ts`

### New (gateway):
- `packages/npm/droid/src/lib/gateway/types.ts`
- `packages/npm/droid/src/lib/gateway/capabilities.ts`
- `packages/npm/droid/src/lib/gateway/WorkerCommunication.ts`
- `packages/npm/droid/src/lib/gateway/WorkerPool.ts`
- `packages/npm/droid/src/lib/gateway/SupabaseGateway.ts`
- `packages/npm/droid/src/lib/gateway/strategies/SharedWorkerStrategy.ts`
- `packages/npm/droid/src/lib/gateway/strategies/WebWorkerStrategy.ts`
- `packages/npm/droid/src/lib/gateway/strategies/DirectStrategy.ts`
- `packages/npm/droid/src/lib/gateway/index.ts`
- `packages/npm/droid/src/lib/workers/supabase-shared-worker.ts`
- `packages/npm/droid/src/lib/workers/supabase-db-worker.ts`

### New (droid-e2e):
- `packages/npm/droid-e2e/project.json`
- `packages/npm/droid-e2e/package.json`
- `packages/npm/droid-e2e/playwright.config.ts`
- `packages/npm/droid-e2e/vite.config.ts`
- `packages/npm/droid-e2e/tsconfig.json`
- `packages/npm/droid-e2e/index.html`
- `packages/npm/droid-e2e/src/main.tsx`
- `packages/npm/droid-e2e/src/app/App.tsx`
- `packages/npm/droid-e2e/src/app/WorkerTest.tsx`
- `packages/npm/droid-e2e/src/app/GatewayTest.tsx`
- `packages/npm/droid-e2e/src/app/EventBusTest.tsx`
- `packages/npm/droid-e2e/e2e/worker-init.spec.ts`
- `packages/npm/droid-e2e/e2e/gateway-strategy.spec.ts`
- `packages/npm/droid-e2e/e2e/event-bus.spec.ts`
- `packages/npm/droid-e2e/e2e/uiux-panels.spec.ts`

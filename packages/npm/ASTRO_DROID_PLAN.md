# Toast, Tooltip & Modal Event System Integration

> Connecting UI overlays to the `DroidEventBus` across `@kbve/droid` and `@kbve/astro`.

---

## Problem

The `@kbve/droid` package has a `DroidEventBus` (typed, Zod-validated, dual-dispatch via Map listeners + `window.CustomEvent`) and nanostores-based UI state (`$activeTooltip`, `$modalId`, `toastManager`). These two systems are **completely disconnected**:

- State functions (`openModal`, `addToast`, etc.) mutate nanostores but never emit events.
- The event bus only has 4 events (`droid-ready`, `droid-mod-ready`, `panel-open`, `panel-close`) — the panel events are defined but never emitted.
- Toast payloads are `Record<string, any>` — no typing, no validation.
- Workers have no way to produce toasts, tooltips, or modals — `emitFromWorker` only handles `injectVNode`.
- `@kbve/astro` re-exports state functions but provides zero rendering components for overlays.
- Consumers (discord.sh, etc.) must build their own modal/toast/tooltip UI from scratch.

## Goal

Wire the event bus into every UI state change, type all payloads with Zod, bridge worker→main thread for overlay messages, and provide opt-in rendering components — while preserving the `droid → astro` dependency direction and keeping workers off the DOM.

---

## Architecture

```
Worker Thread                     Main Thread
┌──────────────────┐  postMsg    ┌──────────────────────────────────────────────┐
│ Mod Worker       │ ──────────► │ emitFromWorker(msg)                          │
│                  │             │   │                                          │
│ Builds typed     │             │   ├─ Zod-validates payload                   │
│ payload (plain   │             │   ├─ Calls state fn (addToast / openModal)   │
│ data, no DOM)    │             │   │    ├─ Mutates nanostore (state-first)    │
│                  │             │   │    └─ DroidEvents.emit() (event-second)  │
│ Example:         │             │   │         ├─ Map-based listeners           │
│ { type: 'toast', │             │   │         └─ window.CustomEvent dispatch   │
│   payload: {     │             │   │                                          │
│     id, message, │             │   └─ React/Astro components re-render        │
│     severity }}  │             │       via useStore() / .subscribe()          │
└──────────────────┘             └──────────────────────────────────────────────┘
```

### Two layers, one flow

| Layer             | Role                       | Mechanism                                             | Consumers                                                |
| ----------------- | -------------------------- | ----------------------------------------------------- | -------------------------------------------------------- |
| **Nanostores**    | Reactive UI state          | `$toasts`, `$modalId`, `$activeTooltip` atoms/maps    | React (`useStore()`), Astro (`.subscribe()`), vanilla JS |
| **DroidEventBus** | Cross-cutting notification | `DroidEvents.on()` / `.emit()` + `window.CustomEvent` | Analytics, logging, inter-module coordination, workers   |

**State mutates first, then events emit.** This guarantees any event handler that reads state sees the current value.

### Dependency direction (no circular deps)

```
@kbve/droid  (schemas, event bus, state, workers, VirtualNode)
     ↑  one-way dependency
@kbve/astro  (React hooks, rendering components, Astro wrappers)
```

Droid never imports from Astro. All type definitions, Zod schemas, nanostores, and event bus logic live in Droid. Astro only consumes and wraps.

### Workers stay off the DOM

Workers produce **serializable descriptors** — typed payloads with optional `VirtualNode` fields. They never touch `document`, `HTMLElement`, or any DOM API. The main thread receives these descriptors via `emitFromWorker`, validates with Zod, and delegates to state functions. Rendering components in Astro handle the final DOM materialization.

When a payload contains a `VirtualNode` (for custom worker-produced content), the React component calls `renderVNode()` from droid inside a `ref`-managed container — converting the descriptor to a real element only on the main thread.

---

## Phase 1: Typed Payloads

**Package:** `@kbve/droid`
**Depends on:** Nothing (first phase)

### New file: `src/lib/types/ui-event-types.ts`

Define Zod schemas and TypeScript types for all three UI overlay payloads.

```ts
import { z } from 'zod';

// Recursive VirtualNode schema matching the type in modules.ts.
// Validates worker-produced descriptors at runtime.
const VirtualNodeSchema: z.ZodType<any> = z.lazy(() =>
	z.object({
		tag: z.string(),
		id: z.string().optional(),
		key: z.string().optional(),
		class: z.string().optional(),
		attrs: z.record(z.any()).optional(),
		style: z.record(z.string()).optional(),
		children: z.array(z.union([z.string(), VirtualNodeSchema])).optional(),
	}),
);

// ── Toast ──
export const ToastSeveritySchema = z.enum([
	'success',
	'warning',
	'error',
	'info',
]);
export type ToastSeverity = z.infer<typeof ToastSeveritySchema>;

export const ToastPayloadSchema = z.object({
	id: z.string(),
	message: z.string(),
	severity: ToastSeveritySchema,
	duration: z.number().positive().optional(), // ms, default 5000; 0 = persistent
	vnode: VirtualNodeSchema.optional(), // optional custom content from worker
});
export type ToastPayload = z.infer<typeof ToastPayloadSchema>;

// ── Tooltip ──
export const TooltipPositionSchema = z.enum([
	'top',
	'bottom',
	'left',
	'right',
	'auto',
]);
export type TooltipPosition = z.infer<typeof TooltipPositionSchema>;

export const TooltipPayloadSchema = z.object({
	id: z.string(),
	content: z.union([z.string(), VirtualNodeSchema]).optional(),
	position: TooltipPositionSchema.optional(),
	anchor: z.string().optional(), // CSS selector or element ID
});
export type TooltipPayload = z.infer<typeof TooltipPayloadSchema>;

// ── Modal ──
export const ModalPayloadSchema = z.object({
	id: z.string(),
	content: VirtualNodeSchema.optional(),
	title: z.string().optional(),
	metadata: z.record(z.any()).optional(),
});
export type ModalPayload = z.infer<typeof ModalPayloadSchema>;

export { VirtualNodeSchema };
```

### Modify: `src/lib/types/event-types.ts`

Add 6 new events to `DroidEventSchemas`:

```ts
import {
	ToastPayloadSchema,
	TooltipPayloadSchema,
	ModalPayloadSchema,
} from './ui-event-types';

export const DroidEventSchemas = {
	// existing
	'droid-ready': DroidReadySchema,
	'droid-mod-ready': DroidModReadySchema,
	'panel-open': PanelEventSchema,
	'panel-close': PanelEventSchema,
	// new
	'toast-added': ToastPayloadSchema,
	'toast-removed': ToastPayloadSchema.pick({ id: true }),
	'tooltip-opened': TooltipPayloadSchema,
	'tooltip-closed': TooltipPayloadSchema.pick({ id: true }),
	'modal-opened': ModalPayloadSchema,
	'modal-closed': ModalPayloadSchema.pick({ id: true }),
};
```

`DroidEventMap` and `EventKey` are derived automatically via the existing mapped type — they pick up the new events with zero additional code.

---

## Phase 2: Wire `emit()` into State Functions

**Package:** `@kbve/droid`
**Depends on:** Phase 1

### New file: `src/lib/state/toasts.ts`

Dedicated ephemeral toast store. Uses `map()` (NOT `persistentMap`) because toasts should not survive page refresh.

```ts
import { map } from 'nanostores';
import { DroidEvents } from '../workers/events';
import type { ToastPayload } from '../types/ui-event-types';

export const $toasts = map<Record<string, ToastPayload>>({});

export function addToast(payload: ToastPayload): void {
	$toasts.set({ ...$toasts.get(), [payload.id]: payload });
	DroidEvents.emit('toast-added', payload);
}

export function removeToast(id: string): void {
	const current = { ...$toasts.get() };
	delete current[id];
	$toasts.set(current);
	DroidEvents.emit('toast-removed', { id });
}
```

**Import safety:** `state/toasts.ts` → `workers/events.ts` → `types/event-types.ts`. No cycle — `events.ts` never imports from `state/`.

### Modify: `src/lib/state/ui.ts`

Add `DroidEvents.emit()` after every state mutation:

```ts
import { DroidEvents } from '../workers/events';

export function openTooltip(id: string) {
	$activeTooltip.set(id);
	DroidEvents.emit('tooltip-opened', { id });
}

export function closeTooltip(id?: string) {
	if (id && $activeTooltip.get() !== id) return;
	const closedId = $activeTooltip.get();
	$activeTooltip.set(null);
	if (closedId) DroidEvents.emit('tooltip-closed', { id: closedId });
}

export function openModal(id: string) {
	$modalId.set(id);
	$drawerOpen.set(false);
	$activeTooltip.set(null);
	DroidEvents.emit('modal-opened', { id });
}

export function closeModal(id?: string) {
	if (id && $modalId.get() !== id) return;
	const closedId = $modalId.get();
	$modalId.set(null);
	if (closedId) DroidEvents.emit('modal-closed', { id: closedId });
}
```

Function signatures are unchanged — existing consumers are unaffected.

### Modify: `src/lib/state/index.ts`

Re-export the new toast module:

```ts
export { $toasts, addToast, removeToast } from './toasts';
```

### Modify: `src/lib/workers/main.ts`

Wire the already-defined `panel-open` / `panel-close` events into panel functions:

```ts
openPanel(id: PanelId, payload?: PanelPayload) {
  const panels = { ...uiuxState.get().panelManager };
  panels[id] = { open: true, payload };
  uiuxState.setKey('panelManager', panels);
  DroidEvents.emit('panel-open', { id, payload });       // was defined but never fired
},

closePanel(id: PanelId) {
  const panels = { ...uiuxState.get().panelManager };
  panels[id] = { open: false, payload: undefined };
  uiuxState.setKey('panelManager', panels);
  DroidEvents.emit('panel-close', { id });                // was defined but never fired
},
```

Deprecate the old toast functions on `uiux` (no consumer uses them — confirmed via grep):

```ts
/** @deprecated Use addToast() from '@kbve/droid' state exports instead */
addToast(id: string, data: any) {
  console.warn('[KBVE] uiux.addToast is deprecated. Use addToast() from @kbve/droid.');
  const toasts = { ...uiuxState.get().toastManager, [id]: data };
  uiuxState.setKey('toastManager', toasts);
},
```

---

## Phase 3: Extend `emitFromWorker` for UI Messages

**Package:** `@kbve/droid`
**Depends on:** Phases 1, 2

### Modify: `src/lib/workers/main.ts` — `emitFromWorker`

Expand to handle typed UI overlay messages from workers. Every message is Zod-validated before dispatching to state functions (which in turn emit events).

```ts
import { addToast, removeToast } from '../state/toasts';
import { openTooltip, closeTooltip, openModal, closeModal } from '../state/ui';
import {
  ToastPayloadSchema,
  TooltipPayloadSchema,
  ModalPayloadSchema,
} from '../types/ui-event-types';

emitFromWorker(msg: any) {
  // Existing: VNode injection (unchanged)
  if (msg.type === 'injectVNode' && msg.vnode) {
    dispatchAsync(() => { /* ... existing logic ... */ });
    return;
  }

  // Toast
  if (msg.type === 'toast' && msg.payload) {
    const parsed = ToastPayloadSchema.safeParse(msg.payload);
    if (!parsed.success) {
      console.error('[KBVE] Invalid toast payload from worker:', parsed.error);
      return;
    }
    addToast(parsed.data);
    return;
  }
  if (msg.type === 'toast-remove' && msg.payload?.id) {
    removeToast(msg.payload.id);
    return;
  }

  // Tooltip
  if (msg.type === 'tooltip-open' && msg.payload) {
    const parsed = TooltipPayloadSchema.safeParse(msg.payload);
    if (!parsed.success) {
      console.error('[KBVE] Invalid tooltip payload from worker:', parsed.error);
      return;
    }
    openTooltip(parsed.data.id);
    return;
  }
  if (msg.type === 'tooltip-close') {
    closeTooltip(msg.payload?.id);
    return;
  }

  // Modal
  if (msg.type === 'modal-open' && msg.payload) {
    const parsed = ModalPayloadSchema.safeParse(msg.payload);
    if (!parsed.success) {
      console.error('[KBVE] Invalid modal payload from worker:', parsed.error);
      return;
    }
    openModal(parsed.data.id);
    return;
  }
  if (msg.type === 'modal-close') {
    closeModal(msg.payload?.id);
    return;
  }

  console.warn('[KBVE] Unknown worker UI message type:', msg.type);
},
```

### Worker-side usage example

Workers call `emitFromWorker` (passed via the mod init context). The main thread validates — workers don't need Zod themselves.

```ts
// Inside a mod worker's init():
ctx.emitFromWorker({
	type: 'toast',
	payload: {
		id: `toast-${Date.now()}`,
		message: 'Data sync complete',
		severity: 'success',
		duration: 3000,
	},
});
```

---

## Phase 4: Export from `@kbve/droid`

**Package:** `@kbve/droid`
**Depends on:** Phases 1–3

### Modify: `src/index.ts`

Add exports for new types, schemas, and the `VirtualNode` type:

```ts
// UI event types & schemas
export type {
	ToastPayload,
	ToastSeverity,
	TooltipPayload,
	TooltipPosition,
	ModalPayload,
} from './lib/types/ui-event-types';

export {
	ToastPayloadSchema,
	ToastSeveritySchema,
	TooltipPayloadSchema,
	TooltipPositionSchema,
	ModalPayloadSchema,
	VirtualNodeSchema,
} from './lib/types/ui-event-types';

// VirtualNode type (not previously exported)
export type { VirtualNode } from './lib/types/modules';
```

The `$toasts`, `addToast`, `removeToast` are already available through the existing `export * from './lib/state'` barrel.

---

## Phase 5: React Hooks in `@kbve/astro`

**Package:** `@kbve/astro`
**Depends on:** Phase 4

### New file: `src/hooks/useToast.ts`

```ts
import { useCallback } from 'react';
import { useStore } from '@nanostores/react';
import { $toasts, addToast, removeToast } from '@kbve/droid';
import type { ToastPayload, ToastSeverity } from '@kbve/droid';

export function useToast() {
	const toasts = useStore($toasts);

	const add = useCallback((payload: ToastPayload) => addToast(payload), []);
	const remove = useCallback((id: string) => removeToast(id), []);

	/** Convenience: auto-generates ID, returns it */
	const notify = useCallback(
		(
			message: string,
			severity: ToastSeverity = 'info',
			duration = 5000,
		): string => {
			const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
			addToast({ id, message, severity, duration });
			return id;
		},
		[],
	);

	return { toasts, add, remove, notify };
}
```

### New file: `src/hooks/useTooltip.ts`

```ts
import { useCallback } from 'react';
import { useStore } from '@nanostores/react';
import { $activeTooltip, openTooltip, closeTooltip } from '@kbve/droid';

export function useTooltip() {
	const activeTooltipId = useStore($activeTooltip);
	const isOpen = useCallback(
		(id: string) => activeTooltipId === id,
		[activeTooltipId],
	);
	const open = useCallback((id: string) => openTooltip(id), []);
	const close = useCallback((id?: string) => closeTooltip(id), []);

	return { activeTooltipId, isOpen, open, close };
}
```

### New file: `src/hooks/useModal.ts`

```ts
import { useCallback } from 'react';
import { useStore } from '@nanostores/react';
import { $modalId, openModal, closeModal } from '@kbve/droid';

export function useModal() {
	const modalId = useStore($modalId);
	const isOpen = useCallback((id: string) => modalId === id, [modalId]);
	const open = useCallback((id: string) => openModal(id), []);
	const close = useCallback((id?: string) => closeModal(id), []);

	return { modalId, isOpen, open, close };
}
```

### Modify: `src/index.ts`

```ts
// Hooks
export { useToast } from './hooks/useToast';
export { useTooltip } from './hooks/useTooltip';
export { useModal } from './hooks/useModal';

// Pass-through from @kbve/droid
export {
	$toasts,
	addToast,
	removeToast,
	ToastPayloadSchema,
	ToastSeveritySchema,
	TooltipPayloadSchema,
	ModalPayloadSchema,
} from '@kbve/droid';
export type {
	ToastPayload,
	ToastSeverity,
	TooltipPayload,
	TooltipPosition,
	ModalPayload,
	VirtualNode,
} from '@kbve/droid';
```

### Modify: `package.json`

Add `@nanostores/react` as optional peer dependency:

```json
"peerDependencies": {
  "@nanostores/react": ">=0.7.0"
},
"peerDependenciesMeta": {
  "@nanostores/react": { "optional": true }
}
```

---

## Phase 6: Rendering Components in `@kbve/astro`

**Package:** `@kbve/astro`
**Depends on:** Phase 5

### Design principle

React JSX for component chrome (backdrop, close button, positioning, animations). `renderVNode()` via dynamic import for worker-produced `VirtualNode` content, materialized inside a `ref`-managed container `<div>`. This keeps SSR-safe (no droid import at module scope in components that might SSR).

### New file: `src/react/ToastContainer.tsx`

Renders active toasts from `$toasts` state. Features:

- Severity-based styling (success/warning/error/info color classes)
- Auto-dismiss via `setTimeout` based on `duration` (default 5000ms)
- Configurable position (`top-right`, `bottom-center`, etc.)
- Max visible limit
- Dismiss button
- `VNodeSlot` sub-component for worker-produced custom content
- `role="alert"` accessibility

### New file: `src/react/ModalOverlay.tsx`

Renders when `$modalId` matches a given `id` prop. Features:

- `createPortal` to `document.body`
- Backdrop with click-to-close (configurable)
- Escape key handler
- Body scroll lock
- `role="dialog"` + `aria-modal="true"` accessibility
- Accepts React `children` (preferred) or `VirtualNode` vnode prop
- `VNodeSlot` for worker-produced content

### New file: `src/react/TooltipOverlay.tsx`

Global tooltip renderer for event/worker-driven tooltips. Features:

- `createPortal` to `document.body`
- Anchor-based positioning (reads `getBoundingClientRect` of anchor element)
- `role="tooltip"` accessibility
- Accepts React `children` or plain `content` string

**Note:** This is a complement to, not a replacement for, anchor-specific tooltips like `SocialTooltip.astro` which uses `.subscribe()` directly. `TooltipOverlay` is for cases where tooltip content comes from the event system or workers.

### New file: `src/components/ToastContainer.astro`

Astro wrapper:

```astro
---
import { ToastContainer as ReactToastContainer } from '../react/ToastContainer';
const { position = 'top-right', maxVisible = 5, className } = Astro.props;
---

<ReactToastContainer
	client:only="react"
	position={position}
	maxVisible={maxVisible}
	className={className}
/>
```

### Modify: `src/index.ts`

```ts
export { ToastContainer } from './react/ToastContainer';
export { ModalOverlay } from './react/ModalOverlay';
export { TooltipOverlay } from './react/TooltipOverlay';
```

### Modify: `package.json` exports

```json
"./components/ToastContainer.astro": "./components/ToastContainer.astro"
```

---

## Backward Compatibility

| Consumer                                  | Current usage                                                       | Impact                                                                                                                                           |
| ----------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `SocialTooltip.astro` (discord.sh)        | `$activeTooltip.subscribe()`, `openTooltip(id)`, `closeTooltip(id)` | **None.** Function signatures unchanged. Now also emits events (additive).                                                                       |
| `ReactNavBar.tsx` (discord.sh)            | `useStore($modalId)`, `openModal('signin')`, `closeModal()`         | **None.** Same signatures, same nanostore. `ModalOverlay` component is opt-in.                                                                   |
| `window.kbve.uiux.addToast`               | Direct call on global object                                        | **Deprecated.** Logs console warning. Old `toastManager` persistentMap field retained. New `$toasts` store is the source of truth for rendering. |
| Vanilla JS `window.CustomEvent` listeners | `window.addEventListener('droid-ready', ...)`                       | **Enhanced.** 6 new event types available to listen for.                                                                                         |

---

## File Summary

### New files (9)

| Package | Path                                  | Purpose                                                                            |
| ------- | ------------------------------------- | ---------------------------------------------------------------------------------- |
| `droid` | `src/lib/types/ui-event-types.ts`     | Zod schemas: `ToastPayload`, `TooltipPayload`, `ModalPayload`, `VirtualNodeSchema` |
| `droid` | `src/lib/state/toasts.ts`             | `$toasts` nanostore + `addToast`/`removeToast` with event emission                 |
| `astro` | `src/hooks/useToast.ts`               | React hook wrapping toast state                                                    |
| `astro` | `src/hooks/useTooltip.ts`             | React hook wrapping tooltip state                                                  |
| `astro` | `src/hooks/useModal.ts`               | React hook wrapping modal state                                                    |
| `astro` | `src/react/ToastContainer.tsx`        | Toast rendering with auto-dismiss, severity styles, VNode support                  |
| `astro` | `src/react/ModalOverlay.tsx`          | Modal rendering with portal, backdrop, scroll lock, VNode support                  |
| `astro` | `src/react/TooltipOverlay.tsx`        | Global tooltip rendering with anchor positioning                                   |
| `astro` | `src/components/ToastContainer.astro` | Astro wrapper for `ToastContainer`                                                 |

### Modified files (7)

| Package | Path                           | Change                                                                                    |
| ------- | ------------------------------ | ----------------------------------------------------------------------------------------- |
| `droid` | `src/lib/types/event-types.ts` | Add 6 event entries to `DroidEventSchemas`                                                |
| `droid` | `src/lib/state/ui.ts`          | Add `DroidEvents.emit()` to tooltip/modal functions                                       |
| `droid` | `src/lib/state/index.ts`       | Re-export `$toasts`, `addToast`, `removeToast`                                            |
| `droid` | `src/lib/workers/main.ts`      | Extend `emitFromWorker` with UI message types; wire panel events; deprecate old toast fns |
| `droid` | `src/index.ts`                 | Export new types, schemas, `VirtualNode`                                                  |
| `astro` | `src/index.ts`                 | Export hooks, components, pass-through types                                              |
| `astro` | `package.json`                 | Add `@nanostores/react` optional peer; add `ToastContainer.astro` export                  |

---

## Phase Dependency Graph

```
Phase 1 ─── Typed Payloads (Zod schemas + TS types)
   │
   └──► Phase 2 ─── Wire emit() into state functions
           │
           └──► Phase 3 ─── Extend emitFromWorker (worker→main bridge)
                   │
                   └──► Phase 4 ─── Export from @kbve/droid index
                           │
                           └──► Phase 5 ─── React hooks in @kbve/astro
                                   │
                                   └──► Phase 6 ─── Rendering components
```

Phases 1–4: purely `@kbve/droid`.
Phases 5–6: purely `@kbve/astro`.
No phase introduces a circular dependency.

---

## Verification

1. **Build droid:** `pnpm nx run droid:build` — compiles with new types/schemas/state
2. **Build astro:** `pnpm nx run astro:build` — compiles with new hooks/components
3. **Run droid tests:** `pnpm nx run droid:test` — existing tests pass
4. **No circular deps:** Verify no file in `packages/npm/droid/src/` imports from `@kbve/astro`
5. **Manual smoke test (browser console):**
    - `window.kbve.events.on('toast-added', (p) => console.log('toast!', p))` — register listener
    - Import and call `addToast({ id: 'test', message: 'Hello', severity: 'info' })` — listener fires
    - `window.kbve.events.on('modal-opened', (p) => console.log('modal!', p))` — register listener
    - Call `openModal('test')` — listener fires, `$modalId.get()` returns `'test'`
6. **Worker integration test:** From a mod worker, call `ctx.emitFromWorker({ type: 'toast', payload: { id: 'w1', message: 'From worker', severity: 'success' } })` — toast appears in `$toasts` on main thread

---

---

# Dual-Path Rendering: Worker Canvas + Main-Thread DOM

> Extension to the event system plan. Introduces off-thread OffscreenCanvas rendering for UI overlays alongside the existing DOM path, with Dexie as the theme color bridge and worker-side Zod validation.

## Motivation

Phases 1–6 established the event bus, typed payloads, and React rendering components — but everything still renders on the main thread. For apps with heavy main-thread workloads (Three.js scenes, complex layouts, frequent re-renders), painting toasts/tooltips/modals in React adds jank.

**OffscreenCanvas** lets a dedicated worker paint overlay UI without touching the DOM or blocking the main thread. However, canvas-rendered overlays can't provide:

- Keyboard/screen-reader accessibility (`role`, `aria-*`, focus management)
- Text selection or copy
- Interactive form inputs (buttons, links, inputs)

**Solution: dual-path rendering.** Each overlay component has two implementations — a DOM path (React, accessible, interactive) and a Canvas path (worker-rendered, zero main-thread paint). Consumers choose or the system auto-selects based on capability detection.

---

## Architecture Overview

```
Main Thread                                  Worker Thread (canvas-worker)
┌────────────────────────────────────┐      ┌──────────────────────────────────────┐
│  ThemeSync                         │      │  CanvasUIRenderer                    │
│  ┌──────────────────────────────┐  │      │  ┌──────────────────────────────┐    │
│  │ getComputedStyle(root)       │  │      │  │ Reads theme from Dexie       │    │
│  │ resolve --sl-color-* values  │  │      │  │ Listens BroadcastChannel     │    │
│  │ → Dexie settings.put()      │──┼──────┼──│ → re-reads on 'theme-sync'   │    │
│  │ → BroadcastChannel.post()   │  │      │  │                              │    │
│  └──────────────────────────────┘  │      │  │ Zod-validates payloads       │    │
│                                    │      │  │ BEFORE postMessage to main   │    │
│  DualOverlayManager                │      │  │                              │    │
│  ┌──────────────────────────────┐  │      │  │ Renders toasts/tooltips/     │    │
│  │ 'dom' path:                 │  │      │  │ modals on OffscreenCanvas    │    │
│  │   React <ToastContainer/>   │  │      │  └──────────────────────────────┘    │
│  │   React <ModalOverlay/>     │  │      │                                      │
│  │   React <TooltipOverlay/>   │  │      │  Queue (ToastPayload[])              │
│  │                             │  │      │  ┌──────────────────────────────┐    │
│  │ 'canvas' path:              │  │      │  │ addToast → push to queue     │    │
│  │   <canvas> ──transfer──────►┼──┼──────┼──│ removeToast → splice queue   │    │
│  │   OffscreenCanvas           │  │      │  │ rAF loop → draw from queue   │    │
│  │   (transparent overlay)     │  │      │  └──────────────────────────────┘    │
│  └──────────────────────────────┘  │      └──────────────────────────────────────┘
│                                    │
│  $toasts / $modalId / $tooltip     │      Dexie (IndexedDB)
│  nanostores (unchanged)            │      ┌──────────────────────────────┐
│                                    │      │ settings table               │
│                                    │      │  'theme:accent' → '#8b5cf6'  │
│                                    │      │  'theme:bg'     → '#1e1033'  │
│                                    │      │  'theme:text'   → '#a78bfa'  │
│                                    │      │  'theme:border' → '#4c1d95'  │
│                                    │      │  'theme:mode'   → 'dark'     │
│                                    │      └──────────────────────────────┘
└────────────────────────────────────┘
```

### Key principles

1. **Worker-side Zod validation** — validate payloads _before_ `postMessage`, not after. Invalid data never crosses the thread boundary. Main-thread `emitFromWorker` becomes a thin dispatcher.
2. **Dexie as theme bridge** — main thread reads resolved CSS custom property values via `getComputedStyle()`, writes them to the Dexie `settings` table. Workers read from Dexie. No DOM access required.
3. **BroadcastChannel for live theme updates** — when the user toggles dark/light, main thread writes new colors to Dexie and broadcasts `'theme-sync'`. All workers re-read immediately.
4. **Canvas overlay is transparent** — the `<canvas>` element sits above the page via `position: fixed; pointer-events: none; z-index: 9999`. It only paints overlay items. Click-through is preserved.
5. **DOM path is the default** — Canvas path is opt-in. Degradation is automatic: if `OffscreenCanvas` isn't supported or the consumer doesn't opt in, DOM components render as before.

---

## Phase 7: Worker-Side Zod Validation

**Package:** `@kbve/droid`
**Depends on:** Phase 1 (schemas exist)

### Problem

Currently, workers produce raw payloads and the main thread validates with `safeParse` inside `emitFromWorker`. This means invalid data has already crossed the `postMessage` boundary — wasted serialization/deserialization and a delayed error report.

### Solution

Create a worker-safe validation utility that workers import directly. Vite bundles workers as ES modules (confirmed in `vite.config.ts`), so they can import Zod.

### New file: `src/lib/workers/validate.ts`

```ts
import {
	ToastPayloadSchema,
	TooltipPayloadSchema,
	ModalPayloadSchema,
} from '../types/ui-event-types';
import type { z } from 'zod';

type UIMessageType =
	| 'toast'
	| 'toast-remove'
	| 'tooltip-open'
	| 'tooltip-close'
	| 'modal-open'
	| 'modal-close';

const SCHEMAS: Partial<Record<UIMessageType, z.ZodType<any>>> = {
	toast: ToastPayloadSchema,
	'tooltip-open': TooltipPayloadSchema,
	'modal-open': ModalPayloadSchema,
};

export interface ValidatedWorkerMessage {
	type: UIMessageType;
	payload: any;
}

/**
 * Validate a UI message payload BEFORE postMessage to main thread.
 * Returns the validated message or throws with a descriptive error.
 *
 * Usage (inside worker):
 *   const msg = validateUIMessage('toast', rawPayload);
 *   emitFromWorker(msg); // guaranteed valid
 */
export function validateUIMessage(
	type: UIMessageType,
	payload: unknown,
): ValidatedWorkerMessage {
	const schema = SCHEMAS[type];
	if (schema) {
		const result = schema.safeParse(payload);
		if (!result.success) {
			throw new Error(
				`[KBVE Worker] Invalid ${type} payload: ${result.error.message}`,
			);
		}
		return { type, payload: result.data };
	}
	// Types without full schemas (toast-remove, tooltip-close, modal-close)
	// only require an id field
	if (
		type === 'toast-remove' ||
		type === 'tooltip-close' ||
		type === 'modal-close'
	) {
		if (!payload || typeof (payload as any).id !== 'string') {
			throw new Error(`[KBVE Worker] ${type} requires { id: string }`);
		}
	}
	return { type, payload };
}
```

### Modify: `src/lib/workers/main.ts` — `emitFromWorker`

Simplify the main-thread side. Since workers pre-validate, `emitFromWorker` trusts the payload shape but still routes to the correct state function. The `safeParse` calls become optional safety nets (logged as warnings if they ever fire, indicating a worker skipped validation).

### Modify: `src/index.ts`

Export `validateUIMessage` so mod workers and custom workers can import it:

```ts
export { validateUIMessage } from './lib/workers/validate';
```

---

## Phase 8: Dexie Theme Bridge

**Package:** `@kbve/droid`
**Depends on:** Phase 7 (validation utility), existing Dexie infra

### Problem

Canvas workers need to know the current theme colors (accent, background, text, border) to render overlays that match the site. Workers have no access to `getComputedStyle()` or CSS custom properties.

### Solution

Main thread resolves CSS variables → writes resolved hex/rgb values to the existing Dexie `settings` table → workers read via `dbGet`.

### Starlight CSS variables to sync

Each app customizes these `--sl-color-*` variables. We sync the **resolved** values (not the variable names):

| Dexie key           | CSS variable source                      | Purpose               |
| ------------------- | ---------------------------------------- | --------------------- |
| `theme:mode`        | `document.documentElement.dataset.theme` | `'light'` or `'dark'` |
| `theme:accent`      | `--sl-color-accent`                      | Primary accent color  |
| `theme:accent-low`  | `--sl-color-accent-low`                  | Low-contrast accent   |
| `theme:accent-high` | `--sl-color-accent-high`                 | High-contrast accent  |
| `theme:bg`          | `--sl-color-bg`                          | Page background       |
| `theme:bg-accent`   | `--sl-color-bg-accent`                   | Accent background     |
| `theme:text`        | `--sl-color-text`                        | Primary text          |
| `theme:text-accent` | `--sl-color-text-accent`                 | Accent text           |
| `theme:border`      | `--sl-color-border`                      | Border color          |
| `theme:white`       | `--sl-color-white`                       | White reference       |
| `theme:black`       | `--sl-color-black`                       | Black reference       |

### New file: `src/lib/state/theme-sync.ts`

```ts
import type { Remote } from 'comlink';
import type { LocalStorageAPI } from '../workers/db-worker';

const THEME_VARS = [
	'accent',
	'accent-low',
	'accent-high',
	'bg',
	'bg-accent',
	'text',
	'text-accent',
	'border',
	'white',
	'black',
] as const;

/**
 * Read resolved CSS custom property values from the document root
 * and persist them to Dexie so workers can access theme colors.
 */
export async function syncThemeToDexie(
	api: Remote<LocalStorageAPI>,
): Promise<void> {
	const root = document.documentElement;
	const styles = getComputedStyle(root);
	const mode = root.dataset.theme ?? 'dark';

	await api.dbSet('theme:mode', mode);

	for (const name of THEME_VARS) {
		const value = styles.getPropertyValue(`--sl-color-${name}`).trim();
		if (value) {
			await api.dbSet(`theme:${name}`, value);
		}
	}
}

/**
 * Broadcast a theme-sync event so workers re-read colors from Dexie.
 */
export function broadcastThemeChange(): void {
	try {
		const bc = new BroadcastChannel('kbve_theme');
		bc.postMessage({ type: 'theme-sync', timestamp: Date.now() });
		bc.close();
	} catch {
		// BroadcastChannel not available — workers won't get live updates
	}
}

/**
 * Observe theme attribute changes and auto-sync.
 * Call once from main() after Dexie is initialized.
 */
export function observeThemeChanges(api: Remote<LocalStorageAPI>): void {
	// MutationObserver on document.documentElement data-theme attribute
	const observer = new MutationObserver(async (mutations) => {
		for (const mutation of mutations) {
			if (
				mutation.type === 'attributes' &&
				mutation.attributeName === 'data-theme'
			) {
				await syncThemeToDexie(api);
				broadcastThemeChange();
			}
		}
	});

	observer.observe(document.documentElement, {
		attributes: true,
		attributeFilter: ['data-theme'],
	});

	// Initial sync
	void syncThemeToDexie(api);
}
```

### Modify: `src/lib/workers/main.ts` — `main()`

After Dexie is initialized and `window.kbve` is set up, call `observeThemeChanges(api)`:

```ts
import { observeThemeChanges } from '../state/theme-sync';

// Inside main(), after window.kbve assignment:
observeThemeChanges(api);
```

### Worker-side theme reading

Workers read theme colors from Dexie via the existing `dbGet` API and listen for changes on BroadcastChannel:

```ts
// Inside any worker that needs theme colors:
const accent = await api.dbGet('theme:accent'); // → '#8b5cf6'
const bg = await api.dbGet('theme:bg'); // → '#1e1033'
const mode = await api.dbGet('theme:mode'); // → 'dark'

// Live updates:
const bc = new BroadcastChannel('kbve_theme');
bc.onmessage = async () => {
	// Re-read all theme colors from Dexie
	const newAccent = await api.dbGet('theme:accent');
	// ... re-render with new colors
};
```

---

## Phase 9: CanvasUIRenderer — Toast/Tooltip/Modal on OffscreenCanvas

**Package:** `@kbve/droid`
**Depends on:** Phases 7, 8

### Problem

The existing `canvas-worker.ts` handles generic canvas bindings (static/animated/dynamic demo modes) but has no concept of UI overlays. We need a dedicated renderer that can paint toasts, tooltips, and modals on an OffscreenCanvas using theme colors from Dexie.

### Approach

Extend the canvas worker with a `CanvasUIRenderer` class that:

- Maintains an internal queue of active toasts (mirrors `$toasts` but worker-local)
- Receives overlay commands via Comlink method calls (`addCanvasToast`, `removeCanvasToast`, `showCanvasTooltip`, `showCanvasModal`)
- Reads theme colors from Dexie on init and on `'theme-sync'` broadcasts
- Paints overlays using Canvas 2D API (rounded rects, text, icons via path data)
- Manages animation frames for toast enter/exit transitions and auto-dismiss

### New file: `src/lib/workers/canvas-ui-renderer.ts`

```ts
import type {
	ToastPayload,
	TooltipPayload,
	ModalPayload,
} from '../types/ui-event-types';

interface ThemeColors {
	accent: string;
	accentLow: string;
	accentHigh: string;
	bg: string;
	bgAccent: string;
	text: string;
	textAccent: string;
	border: string;
	white: string;
	black: string;
	mode: 'light' | 'dark';
}

const SEVERITY_COLORS: Record<
	string,
	{ bg: string; border: string; text: string }
> = {
	success: { bg: '#065f46', border: '#10b981', text: '#d1fae5' },
	warning: { bg: '#78350f', border: '#f59e0b', text: '#fef3c7' },
	error: { bg: '#7f1d1d', border: '#ef4444', text: '#fee2e2' },
	info: { bg: '#1e3a5f', border: '#3b82f6', text: '#dbeafe' },
};

interface ActiveToast extends ToastPayload {
	createdAt: number;
	opacity: number; // 0–1, for fade in/out
	y: number; // current Y position
	targetY: number; // target Y position
}

export class CanvasUIRenderer {
	private ctx: OffscreenCanvasRenderingContext2D | null = null;
	private canvas: OffscreenCanvas | null = null;
	private toasts: ActiveToast[] = [];
	private tooltip: TooltipPayload | null = null;
	private modal: ModalPayload | null = null;
	private theme: ThemeColors = {
		/* defaults */
	} as ThemeColors;
	private animFrame: number | null = null;
	private dbGet: ((key: string) => Promise<string | null>) | null = null;

	async bind(
		canvas: OffscreenCanvas,
		dbGet: (key: string) => Promise<string | null>,
	): Promise<void> {
		this.canvas = canvas;
		this.ctx = canvas.getContext('2d');
		this.dbGet = dbGet;
		await this.refreshTheme();
		this.startLoop();
	}

	async refreshTheme(): Promise<void> {
		if (!this.dbGet) return;
		this.theme = {
			accent: (await this.dbGet('theme:accent')) ?? '#8b5cf6',
			accentLow: (await this.dbGet('theme:accent-low')) ?? '#1e1033',
			accentHigh: (await this.dbGet('theme:accent-high')) ?? '#c4b5fd',
			bg: (await this.dbGet('theme:bg')) ?? '#0a0a0a',
			bgAccent: (await this.dbGet('theme:bg-accent')) ?? '#3b1f6e',
			text: (await this.dbGet('theme:text')) ?? '#e0e0e0',
			textAccent: (await this.dbGet('theme:text-accent')) ?? '#a78bfa',
			border: (await this.dbGet('theme:border')) ?? '#4c1d95',
			white: (await this.dbGet('theme:white')) ?? '#ffffff',
			black: (await this.dbGet('theme:black')) ?? '#000000',
			mode:
				((await this.dbGet('theme:mode')) as 'light' | 'dark') ??
				'dark',
		};
	}

	addToast(payload: ToastPayload): void {
		const yOffset = 20 + this.toasts.length * 80;
		this.toasts.push({
			...payload,
			createdAt: Date.now(),
			opacity: 0,
			y: yOffset - 20,
			targetY: yOffset,
		});
	}

	removeToast(id: string): void {
		const idx = this.toasts.findIndex((t) => t.id === id);
		if (idx !== -1) this.toasts.splice(idx, 1);
		this.recalcPositions();
	}

	showTooltip(payload: TooltipPayload | null): void {
		this.tooltip = payload;
	}

	showModal(payload: ModalPayload | null): void {
		this.modal = payload;
	}

	private recalcPositions(): void {
		this.toasts.forEach((t, i) => {
			t.targetY = 20 + i * 80;
		});
	}

	private startLoop(): void {
		const draw = () => {
			this.render();
			this.animFrame = requestAnimationFrame(draw);
		};
		draw();
	}

	private render(): void {
		if (!this.ctx || !this.canvas) return;
		const { width, height } = this.canvas;
		this.ctx.clearRect(0, 0, width, height);

		// Auto-dismiss expired toasts
		const now = Date.now();
		this.toasts = this.toasts.filter((t) => {
			if (
				t.duration &&
				t.duration > 0 &&
				now - t.createdAt > t.duration
			) {
				return false;
			}
			return true;
		});
		this.recalcPositions();

		// Animate toasts
		for (const toast of this.toasts) {
			// Fade in
			if (toast.opacity < 1)
				toast.opacity = Math.min(1, toast.opacity + 0.05);
			// Slide to target
			toast.y += (toast.targetY - toast.y) * 0.15;
			this.drawToast(toast, width);
		}

		// Draw modal backdrop + content
		if (this.modal) {
			this.drawModal(width, height);
		}
	}

	private drawToast(toast: ActiveToast, canvasWidth: number): void {
		if (!this.ctx) return;
		const ctx = this.ctx;
		const w = 320;
		const h = 64;
		const x = canvasWidth - w - 20;
		const y = toast.y;
		const colors = SEVERITY_COLORS[toast.severity] ?? SEVERITY_COLORS.info;

		ctx.globalAlpha = toast.opacity;

		// Background
		ctx.fillStyle = colors.bg;
		this.roundRect(ctx, x, y, w, h, 8);
		ctx.fill();

		// Border
		ctx.strokeStyle = colors.border;
		ctx.lineWidth = 1.5;
		this.roundRect(ctx, x, y, w, h, 8);
		ctx.stroke();

		// Text
		ctx.fillStyle = colors.text;
		ctx.font = '14px system-ui, -apple-system, sans-serif';
		ctx.fillText(toast.message, x + 12, y + 24, w - 24);

		// Severity label
		ctx.font = 'bold 10px system-ui, sans-serif';
		ctx.fillStyle = colors.border;
		ctx.fillText(toast.severity.toUpperCase(), x + 12, y + 48);

		ctx.globalAlpha = 1;
	}

	private drawModal(canvasWidth: number, canvasHeight: number): void {
		if (!this.ctx || !this.modal) return;
		const ctx = this.ctx;

		// Backdrop
		ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
		ctx.fillRect(0, 0, canvasWidth, canvasHeight);

		// Modal box
		const w = Math.min(500, canvasWidth - 40);
		const h = 300;
		const x = (canvasWidth - w) / 2;
		const y = (canvasHeight - h) / 2;

		ctx.fillStyle = this.theme.bg;
		this.roundRect(ctx, x, y, w, h, 12);
		ctx.fill();

		ctx.strokeStyle = this.theme.border;
		ctx.lineWidth = 1;
		this.roundRect(ctx, x, y, w, h, 12);
		ctx.stroke();

		// Title
		if (this.modal.title) {
			ctx.fillStyle = this.theme.text;
			ctx.font = 'bold 18px system-ui, sans-serif';
			ctx.fillText(this.modal.title, x + 20, y + 36, w - 40);
		}

		// ID label
		ctx.fillStyle = this.theme.textAccent;
		ctx.font = '12px system-ui, sans-serif';
		ctx.fillText(this.modal.id, x + 20, y + 60, w - 40);
	}

	private roundRect(
		ctx: OffscreenCanvasRenderingContext2D,
		x: number,
		y: number,
		w: number,
		h: number,
		r: number,
	): void {
		ctx.beginPath();
		ctx.moveTo(x + r, y);
		ctx.lineTo(x + w - r, y);
		ctx.quadraticCurveTo(x + w, y, x + w, y + r);
		ctx.lineTo(x + w, y + h - r);
		ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
		ctx.lineTo(x + r, y + h);
		ctx.quadraticCurveTo(x, y + h, x, y + h - r);
		ctx.lineTo(x, y + r);
		ctx.quadraticCurveTo(x, y, x + r, y);
		ctx.closePath();
	}

	unbind(): void {
		if (this.animFrame !== null) {
			cancelAnimationFrame(this.animFrame);
			this.animFrame = null;
		}
		this.ctx = null;
		this.canvas = null;
		this.toasts = [];
		this.tooltip = null;
		this.modal = null;
	}
}
```

### Modify: `src/lib/workers/canvas-worker.ts`

Import and expose `CanvasUIRenderer` alongside the existing `CanvasManager`:

```ts
import { CanvasUIRenderer } from './canvas-ui-renderer';

const uiRenderer = new CanvasUIRenderer();

// Extend exposed API:
const CanvasManager = {
	// ... existing bindCanvas/unbindCanvas ...

	// UI overlay canvas
	async bindUICanvas(
		canvas: OffscreenCanvas,
		dbGet: (key: string) => Promise<string | null>,
	) {
		await uiRenderer.bind(canvas, dbGet);
	},
	unbindUICanvas() {
		uiRenderer.unbind();
	},
	addCanvasToast(payload: ToastPayload) {
		uiRenderer.addToast(payload);
	},
	removeCanvasToast(id: string) {
		uiRenderer.removeToast(id);
	},
	showCanvasTooltip(payload: TooltipPayload | null) {
		uiRenderer.showTooltip(payload);
	},
	showCanvasModal(payload: ModalPayload | null) {
		uiRenderer.showModal(payload);
	},
	refreshUITheme() {
		return uiRenderer.refreshTheme();
	},
};
```

### BroadcastChannel listener inside canvas-worker

```ts
// At top level of canvas-worker.ts:
try {
	const bc = new BroadcastChannel('kbve_theme');
	bc.onmessage = () => {
		uiRenderer.refreshTheme();
	};
} catch {
	// BroadcastChannel unavailable in this context
}
```

---

## Phase 10: Dual-Path Overlay Manager

**Package:** `@kbve/droid`
**Depends on:** Phases 8, 9

### Problem

Consumers need a single API that routes overlay commands to either the DOM path or the Canvas path. The choice should be explicit (consumer opts in) or automatic (capability detection).

### New file: `src/lib/state/overlay-manager.ts`

```ts
import type { Remote } from 'comlink';
import type { CanvasWorkerAPI } from '../workers/canvas-worker';
import { addToast, removeToast } from './toasts';
import { openTooltip, closeTooltip, openModal, closeModal } from './ui';
import type {
	ToastPayload,
	TooltipPayload,
	ModalPayload,
} from '../types/ui-event-types';

export type RenderPath = 'dom' | 'canvas' | 'auto';

interface OverlayManagerConfig {
	preferredPath: RenderPath;
	canvasWorker?: Remote<CanvasWorkerAPI>;
}

/**
 * Unified overlay manager that routes to DOM or Canvas rendering.
 *
 * - 'dom': Uses nanostores → React components (Phases 1–6)
 * - 'canvas': Uses CanvasUIRenderer in canvas-worker (Phase 9)
 * - 'auto': Uses canvas if OffscreenCanvas is available AND a canvas worker
 *           is bound, otherwise falls back to DOM
 */
export class OverlayManager {
	private path: RenderPath;
	private canvasWorker: Remote<CanvasWorkerAPI> | null;
	private canvasBound = false;

	constructor(config: OverlayManagerConfig) {
		this.path = config.preferredPath;
		this.canvasWorker = config.canvasWorker ?? null;
	}

	private get effectivePath(): 'dom' | 'canvas' {
		if (this.path === 'canvas' && this.canvasBound && this.canvasWorker) {
			return 'canvas';
		}
		if (this.path === 'auto' && this.canvasBound && this.canvasWorker) {
			return 'canvas';
		}
		return 'dom';
	}

	/**
	 * Bind a <canvas> element for off-thread overlay rendering.
	 * Must be called before canvas path can be used.
	 */
	async bindCanvas(
		canvasEl: HTMLCanvasElement,
		dbGet: (key: string) => Promise<string | null>,
	): Promise<void> {
		if (!this.canvasWorker) {
			console.warn('[OverlayManager] No canvas worker available');
			return;
		}
		const offscreen = canvasEl.transferControlToOffscreen();
		await (this.canvasWorker as any).bindUICanvas(offscreen, dbGet);
		this.canvasBound = true;
	}

	// ── Toast ──
	toast(payload: ToastPayload): void {
		if (this.effectivePath === 'canvas') {
			void (this.canvasWorker as any)?.addCanvasToast(payload);
		}
		// Always update DOM state (nanostores) so event listeners and
		// any DOM-rendered components stay in sync
		addToast(payload);
	}

	dismissToast(id: string): void {
		if (this.effectivePath === 'canvas') {
			void (this.canvasWorker as any)?.removeCanvasToast(id);
		}
		removeToast(id);
	}

	// ── Tooltip ──
	showTooltip(payload: TooltipPayload): void {
		if (this.effectivePath === 'canvas') {
			void (this.canvasWorker as any)?.showCanvasTooltip(payload);
		}
		openTooltip(payload.id);
	}

	hideTooltip(id?: string): void {
		if (this.effectivePath === 'canvas') {
			void (this.canvasWorker as any)?.showCanvasTooltip(null);
		}
		closeTooltip(id);
	}

	// ── Modal ──
	showModal(payload: ModalPayload): void {
		if (this.effectivePath === 'canvas') {
			void (this.canvasWorker as any)?.showCanvasModal(payload);
		}
		openModal(payload.id);
	}

	hideModal(id?: string): void {
		if (this.effectivePath === 'canvas') {
			void (this.canvasWorker as any)?.showCanvasModal(null);
		}
		closeModal(id);
	}

	/** Switch rendering path at runtime */
	setPath(path: RenderPath): void {
		this.path = path;
	}

	/** Unbind canvas and clean up */
	async destroy(): Promise<void> {
		if (this.canvasBound && this.canvasWorker) {
			await (this.canvasWorker as any).unbindUICanvas();
			this.canvasBound = false;
		}
	}
}
```

### Design decision: always update nanostores

Even when using the canvas path, the `OverlayManager` always writes to nanostores (`addToast`, `openModal`, etc.). This means:

- Event bus listeners still fire (analytics, logging)
- If both DOM and Canvas components are mounted (e.g., during transition), they stay in sync
- `$toasts.get()` always reflects truth regardless of render path

---

## Phase 11: Canvas Overlay Component (`@kbve/astro`)

**Package:** `@kbve/astro`
**Depends on:** Phase 10

### New file: `src/react/CanvasOverlay.tsx`

A thin React component that mounts a full-viewport `<canvas>` and transfers it to the canvas worker.

```tsx
import { useRef, useEffect } from 'react';
import type { OverlayManager } from '@kbve/droid';

interface CanvasOverlayProps {
	overlayManager: OverlayManager;
	dbGet: (key: string) => Promise<string | null>;
	zIndex?: number;
}

export function CanvasOverlay({
	overlayManager,
	dbGet,
	zIndex = 9999,
}: CanvasOverlayProps) {
	const canvasRef = useRef<HTMLCanvasElement>(null);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;

		// Size to viewport
		const resize = () => {
			canvas.width = window.innerWidth;
			canvas.height = window.innerHeight;
		};
		resize();
		window.addEventListener('resize', resize);

		// Transfer to worker
		void overlayManager.bindCanvas(canvas, dbGet);

		return () => {
			window.removeEventListener('resize', resize);
			void overlayManager.destroy();
		};
	}, [overlayManager, dbGet]);

	return (
		<canvas
			ref={canvasRef}
			style={{
				position: 'fixed',
				top: 0,
				left: 0,
				width: '100vw',
				height: '100vh',
				pointerEvents: 'none',
				zIndex,
			}}
			aria-hidden="true"
		/>
	);
}
```

**Note:** `aria-hidden="true"` and `pointer-events: none` ensure the canvas overlay doesn't interfere with accessibility or click events. The DOM-rendered components (from Phase 6) handle all accessible interactions.

### New file: `src/components/CanvasOverlay.astro`

```astro
---
import { CanvasOverlay as ReactCanvasOverlay } from '../react/CanvasOverlay';
---

<ReactCanvasOverlay client:only="react" />
```

---

## Phase 12: Export & Integration

**Package:** both `@kbve/droid` and `@kbve/astro`
**Depends on:** Phases 7–11

### Modify: `@kbve/droid` `src/index.ts`

```ts
// Worker-side validation
export { validateUIMessage } from './lib/workers/validate';
export type { ValidatedWorkerMessage } from './lib/workers/validate';

// Theme sync
export {
	syncThemeToDexie,
	broadcastThemeChange,
	observeThemeChanges,
} from './lib/state/theme-sync';

// Overlay manager
export { OverlayManager } from './lib/state/overlay-manager';
export type { RenderPath } from './lib/state/overlay-manager';

// Canvas UI renderer (for direct worker usage)
export { CanvasUIRenderer } from './lib/workers/canvas-ui-renderer';
```

### Modify: `@kbve/droid` `src/lib/state/index.ts`

```ts
export {
	syncThemeToDexie,
	broadcastThemeChange,
	observeThemeChanges,
} from './theme-sync';
export { OverlayManager } from './overlay-manager';
export type { RenderPath } from './overlay-manager';
```

### Modify: `@kbve/astro` `src/index.ts`

```ts
// Canvas overlay
export { CanvasOverlay } from './react/CanvasOverlay';

// Re-export from droid
export { OverlayManager } from '@kbve/droid';
export type { RenderPath } from '@kbve/droid';
```

### Modify: `@kbve/droid` `src/lib/workers/main.ts` — `main()`

Wire theme observation and expose `OverlayManager` on `window.kbve`:

```ts
import { observeThemeChanges } from '../state/theme-sync';
import { OverlayManager } from '../state/overlay-manager';

// Inside main(), after window.kbve assignment:
observeThemeChanges(api);

const overlay = new OverlayManager({
	preferredPath: 'auto',
	canvasWorker: canvas,
});

window.kbve = {
	...window.kbve,
	overlay,
};
```

---

## Updated File Summary

### New files (Phases 7–12): 5

| Package | Path                                    | Purpose                                             |
| ------- | --------------------------------------- | --------------------------------------------------- |
| `droid` | `src/lib/workers/validate.ts`           | Worker-side Zod validation utility                  |
| `droid` | `src/lib/state/theme-sync.ts`           | CSS var → Dexie bridge + MutationObserver           |
| `droid` | `src/lib/workers/canvas-ui-renderer.ts` | CanvasUIRenderer class for off-thread overlay paint |
| `droid` | `src/lib/state/overlay-manager.ts`      | Dual-path routing (DOM / Canvas / auto)             |
| `astro` | `src/react/CanvasOverlay.tsx`           | React canvas element with worker transfer           |

### Modified files (Phases 7–12): 5

| Package | Path                               | Change                                                            |
| ------- | ---------------------------------- | ----------------------------------------------------------------- |
| `droid` | `src/lib/workers/canvas-worker.ts` | Expose UI renderer methods + BroadcastChannel listen              |
| `droid` | `src/lib/workers/main.ts`          | Theme observation, OverlayManager init, simplified emitFromWorker |
| `droid` | `src/lib/state/index.ts`           | Re-export theme-sync and overlay-manager                          |
| `droid` | `src/index.ts`                     | Export new modules                                                |
| `astro` | `src/index.ts`                     | Export CanvasOverlay and OverlayManager pass-through              |

---

## Updated Phase Dependency Graph

```
Phases 1–6 (merged in PR #7218)
───────────────────────────────
Phase 1 ─── Typed Payloads
   └──► Phase 2 ─── Wire emit() into state
           └──► Phase 3 ─── Extend emitFromWorker
                   └──► Phase 4 ─── Export from droid
                           └──► Phase 5 ─── React hooks
                                   └──► Phase 6 ─── Rendering components (DOM path)

Phases 7–12 (this PR)
─────────────────────
Phase 7 ─── Worker-side Zod validation
   │
   └──► Phase 8 ─── Dexie theme bridge
           │
           └──► Phase 9 ─── CanvasUIRenderer
                   │
                   └──► Phase 10 ─── OverlayManager (dual-path router)
                           │
                           └──► Phase 11 ─── CanvasOverlay component (astro)
                                   │
                                   └──► Phase 12 ─── Exports & main() integration
```

---

## Dual-Path Decision Matrix

| Scenario                                 | Recommended path | Why                                                     |
| ---------------------------------------- | ---------------- | ------------------------------------------------------- |
| Toast notification (display only)        | Canvas           | No interaction needed, pure visual, offload main thread |
| Modal with form inputs                   | DOM              | Requires focus management, keyboard nav, form elements  |
| Tooltip on hover (text only)             | Canvas           | Ephemeral, no interaction beyond hover                  |
| Modal with accessible content            | DOM              | Screen reader support, ARIA roles, focus trap           |
| High-frequency toasts (game/monitoring)  | Canvas           | Avoids React re-render storm                            |
| Toast with action button (undo, dismiss) | DOM              | Requires click handling                                 |
| Worker-produced overlay                  | Canvas           | Data already in worker, skip main-thread round-trip     |
| SSR/SEO-relevant content                 | DOM              | Canvas content is invisible to crawlers                 |

### Auto-detection logic (`'auto'` path)

```
if (typeof OffscreenCanvas !== 'undefined'
    && canvasWorker is bound
    && canvas element is transferred) {
  → use 'canvas' path
} else {
  → use 'dom' path (fallback, always works)
}
```

---

## Verification (Phases 7–12)

1. **Build droid:** `./kbve.sh -nx droid:build` — compiles with new validate, theme-sync, canvas-ui-renderer, overlay-manager
2. **Build astro:** `./kbve.sh -nx astro:build` — compiles with CanvasOverlay
3. **Run droid tests:** `./kbve.sh -nx droid:test` — existing tests pass
4. **No circular deps:** Verify no file in `packages/npm/droid/src/` imports from `@kbve/astro`
5. **Theme sync test (browser):**
    - Open app, check Dexie → `settings` table has `theme:accent`, `theme:bg`, etc.
    - Toggle dark/light mode → values update in Dexie
    - BroadcastChannel `'kbve_theme'` fires on toggle
6. **Canvas overlay test:**
    - Mount `<CanvasOverlay>` component
    - Call `overlay.toast({ id: 'test', message: 'Hello', severity: 'info' })`
    - Toast appears rendered on canvas (not in DOM)
    - Verify `pointer-events: none` — can click through canvas to page content
7. **Dual-path test:**
    - Set `overlay.setPath('dom')` → toasts render in React `<ToastContainer>`
    - Set `overlay.setPath('canvas')` → toasts render on `<canvas>`
    - Set `overlay.setPath('auto')` → uses canvas if bound, DOM otherwise
8. **Worker validation test:**
    - From mod worker, call `validateUIMessage('toast', { bad: 'data' })` → throws
    - Call `validateUIMessage('toast', validPayload)` → returns validated message

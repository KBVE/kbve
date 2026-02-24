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

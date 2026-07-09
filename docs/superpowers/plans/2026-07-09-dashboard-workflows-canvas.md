# Dashboard Workflows Canvas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a POC workflows canvas at `kbve.com/dashboard/workflows/` that invokes scripts on three backends — Supabase edge functions, firecracker microVMs, and Windmill — and shows per-node status, built once as react-native-skia components in `@kbve/rn/workflows` so the same module later mounts on desktop and mobile (Phase 2). The web mount is the proving ground for this POC.

**Architecture:** A new axum-kbve dashboard proxy forwards the caller's Supabase token to the windmill-gate SSO bridge (per-user impersonation). A new `@kbve/rn/workflows` module holds the RN-safe node model, invoke/poll service, nanostore state, and a Skia canvas that renders identically on mobile (native), website (react-native-web + CanvasKit WASM via `@kbve/rn-astro`), and desktop (Tauri webview). Edge + firecracker reuse existing proxies.

**Tech Stack:** Rust/axum (proxy), TypeScript, React Native, `@shopify/react-native-skia@2.6.9`, `react-native-gesture-handler@2.31.1`, `react-native-reanimated@4.3.1`, nanostores, Astro islands, Tauri.

## Global Constraints

- Skia dependency is `@shopify/react-native-skia@2.6.9` — the ONLY new dependency. Peers verified: `react >=19.0` (repo 19.2.3), `react-native >=0.78` (repo 0.85.3), `react-native-reanimated >=3.19.1` (repo 4.3.1).
- Do NOT bump `react-native-worklets` (pinned 0.8.x) or `react-native-reanimated` (4.3.1) — Expo SDK 56 worklets ceiling.
- New JS/TS deps go in the ROOT `package.json` AND the declarative `packages/npm/rn/package.json` copy — the repo has no pnpm workspace for RN. After any failed dep experiment: `git checkout pnpm-lock.yaml && pnpm install --frozen-lockfile`.
- Windmill workspace id is `kbve`. Windmill API paths (verified against 1.751.0 openapi): run = `POST /api/w/kbve/jobs/run/p/{path}`, poll = `GET /api/w/kbve/jobs_u/completed/get_result_maybe/{id}`, list = `GET /api/w/kbve/scripts/list`.
- The axum windmill proxy forwards the CALLER's Supabase token upstream to windmill-gate (via `handle_with_auth`), NOT a service token — the gate bridge does per-user impersonation. Upstream is `windmill-gate.windmill.svc.cluster.local:5678`.
- Prefer no comments in new code; match the terse style of surrounding files. Keep only `pub fn` doc comments where the neighboring Rust code already uses them.
- Run nx tasks via `./kbve.sh -nx <target>`. Never edit `version.toml`/Cargo/`package.json` version fields for release — CI owns them; bump the MDX `version:` only.
- Frequent commits: one per task minimum. TDD where logic is pure (reducers, service URL/poll, canvas math).

---

## File Structure

**axum-kbve (Rust):**

- `apps/kbve/axum-kbve/src/transport/proxy.rs` — add `WINDMILL` static, `init_windmill_proxy()`, `windmill_proxy_handler()`.
- `apps/kbve/axum-kbve/src/transport/https.rs` — register two routes.
- `apps/kbve/axum-kbve/src/main.rs` — init the proxy at startup.

**@kbve/rn workflows module (new `packages/npm/rn/src/workflows/`):**

- `types.ts` — node model, backend + status enums, pure helpers.
- `store.ts` — nanostore `$workflows` + reducers.
- `geometry.ts` — pure canvas math (hit-testing, screen↔world transform).
- `workflowsService.ts` — three invoke functions + registry fetchers + windmill poll.
- `NodeCard.tsx` — RN overlay control (label, ▶, status badge, result).
- `WorkflowsCanvas.tsx` — Skia surface + gesture drag/pan, composes NodeCard.
- `index.ts`, `_ui.ts` — barrels (web-safe leaf).
- `__tests__/` — unit tests for types/store/geometry/service.

**@kbve/rn package wiring:**

- `packages/npm/rn/package.json` — add `./workflows` subpath export + Skia dep.

**Website (astro-kbve):**

- `src/components/rnweb/ReactWorkflowsDashRN.tsx` — island wrapper.
- `src/components/rnweb/AstroWorkflowsDashRN.astro` — Astro mount.
- `src/content/docs/dashboard/workflows/index.mdx` — route page.
- `src/components/navigation/dashboardMenu.ts` — nav entry (staff).

**Desktop + mobile:** Phase 2 (see the "Phase 2 (follow-up)" section) — the
shared `@kbve/rn/workflows` module is the whole cross-platform investment; both
mounts consume it and need per-app plumbing scoped separately.

**Root:**

- `package.json` — add Skia dep.

---

## Task 1: axum-kbve Windmill proxy

**Files:**

- Modify: `apps/kbve/axum-kbve/src/transport/proxy.rs` (add after the firecracker block, ~line 1976)
- Modify: `apps/kbve/axum-kbve/src/transport/https.rs:642` (add routes near the firecracker routes)
- Modify: `apps/kbve/axum-kbve/src/main.rs:213` (init near firecracker init)

**Interfaces:**

- Consumes: `ServiceProxy`, `require_dashboard_view`, `extract_auth_token`, `handle_with_auth` (all already in `proxy.rs`).
- Produces: `pub fn init_windmill_proxy() -> bool`, `pub async fn windmill_proxy_handler(path: Option<Path<String>>, req: Request<Body>) -> Response`. Routes `/dashboard/workflows/proxy/{*path}` and `/dashboard/workflows/proxy`.

- [ ] **Step 1: Add the proxy static + init + handler**

In `proxy.rs`, after the firecracker openapi handler (~line 1976), add:

```rust
static WINDMILL: OnceLock<ServiceProxy> = OnceLock::new();

pub fn init_windmill_proxy() -> bool {
    let upstream = std::env::var("WINDMILL_GATE_URL")
        .unwrap_or_else(|_| "http://windmill-gate.windmill.svc.cluster.local:5678".into());

    let client = Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .connect_timeout(Duration::from_secs(10))
        .timeout(Duration::from_secs(60))
        .build()
        .expect("failed to build reqwest client for windmill proxy");

    WINDMILL
        .set(ServiceProxy {
            name: "Windmill",
            client,
            upstream: upstream.trim_end_matches('/').to_string(),
            upstream_token: None,
            upstream_headers: Vec::new(),
            iframe_safe: false,
            streaming: false,
        })
        .is_ok()
}

/// Proxy for the Windmill dashboard canvas. Staff-gated at axum, then forwards
/// the caller's Supabase token to windmill-gate, whose SSO bridge impersonates
/// the user — so Windmill actions carry per-user attribution.
pub async fn windmill_proxy_handler(path: Option<Path<String>>, req: Request<Body>) -> Response {
    let headers = req.headers().clone();
    let raw_query = req.uri().query().map(|q| q.to_string());

    if let Err(resp) = require_dashboard_view(&headers, "Windmill").await {
        return resp;
    }

    let token = match extract_auth_token(&headers, raw_query.as_deref()) {
        Some(t) => t,
        None => {
            return (
                StatusCode::UNAUTHORIZED,
                axum::Json(json!({"error": "Missing Authorization token for Windmill"})),
            )
                .into_response();
        }
    };

    match WINDMILL.get() {
        Some(proxy) => proxy.handle_with_auth(path, req, format!("Bearer {token}")).await,
        None => (
            StatusCode::SERVICE_UNAVAILABLE,
            axum::Json(json!({"error": "Windmill proxy not configured"})),
        )
            .into_response(),
    }
}
```

- [ ] **Step 2: Register routes**

In `https.rs`, after the firecracker routes (~line 649) add:

```rust
        .route(
            "/dashboard/workflows/proxy/{*path}",
            any(super::proxy::windmill_proxy_handler),
        )
        .route(
            "/dashboard/workflows/proxy",
            any(super::proxy::windmill_proxy_handler),
        )
```

- [ ] **Step 3: Init at startup**

In `main.rs`, after the firecracker init block (~line 218) add:

```rust
    // Windmill proxy (optional - for /dashboard/workflows, routes to windmill-gate)
    if transport::proxy::init_windmill_proxy() {
        info!("Windmill proxy initialized - /dashboard/workflows/proxy enabled");
    } else {
        info!("Windmill proxy not configured (using default cluster URL)");
    }
```

- [ ] **Step 4: Build**

Run: `./kbve.sh -nx axum-kbve:build`
Expected: `Successfully ran target build`.

- [ ] **Step 5: Lint**

Run: `./kbve.sh -nx axum-kbve:lint`
Expected: `Successfully ran target lint` (no clippy errors).

- [ ] **Step 6: Commit**

```bash
git add apps/kbve/axum-kbve/src/transport/proxy.rs apps/kbve/axum-kbve/src/transport/https.rs apps/kbve/axum-kbve/src/main.rs
git commit -m "feat(axum-kbve): windmill dashboard proxy via gate bridge"
```

---

## Task 2: Add Skia dependency

**Files:**

- Modify: `package.json` (root) — dependencies
- Modify: `packages/npm/rn/package.json` — dependencies (declarative copy)

**Interfaces:**

- Produces: `@shopify/react-native-skia` importable from `@kbve/rn/workflows`.

- [ ] **Step 1: Add to root package.json**

In root `package.json` `dependencies`, add (alphabetical position, near other `@shopify`/react-native entries):

```json
		"@shopify/react-native-skia": "2.6.9",
```

- [ ] **Step 2: Add to rn package.json**

In `packages/npm/rn/package.json` `dependencies`, add:

```json
		"@shopify/react-native-skia": "2.6.9",
```

- [ ] **Step 3: Install**

Run: `pnpm install`
Expected: resolves without peer errors; installs skia 2.6.9.

- [ ] **Step 4: Verify no worklets/reanimated drift**

Run: `git diff pnpm-lock.yaml | grep -E "react-native-worklets|react-native-reanimated" | head`
Expected: no version change on worklets (stays 0.8.x) or reanimated (stays 4.3.1). If either bumped, STOP — `git checkout pnpm-lock.yaml package.json packages/npm/rn/package.json && pnpm install --frozen-lockfile` and reassess the Skia version.

- [ ] **Step 5: Commit**

```bash
git add package.json packages/npm/rn/package.json pnpm-lock.yaml
git commit -m "chore(rn): add @shopify/react-native-skia for workflows canvas"
```

---

## Task 3: workflows types + store

**Files:**

- Create: `packages/npm/rn/src/workflows/types.ts`
- Create: `packages/npm/rn/src/workflows/store.ts`
- Test: `packages/npm/rn/src/workflows/__tests__/store.test.ts`

**Interfaces:**

- Produces:
    - `type Backend = 'edge' | 'firecracker' | 'windmill'`
    - `type NodeStatus = 'idle' | 'running' | 'ok' | 'err'`
    - `interface WorkflowNode { id: string; backend: Backend; ref: string; x: number; y: number; status: NodeStatus; result: string | null }`
    - `createWorkflowsStore(): WorkflowsStore` with `get()`, `subscribe(fn)`, `addNode(partial)`, `moveNode(id, x, y)`, `setStatus(id, status, result?)`, `nodes()`.

- [ ] **Step 1: Write types**

Create `types.ts`:

```typescript
export type Backend = 'edge' | 'firecracker' | 'windmill';
export type NodeStatus = 'idle' | 'running' | 'ok' | 'err';

export interface WorkflowNode {
	id: string;
	backend: Backend;
	ref: string;
	x: number;
	y: number;
	status: NodeStatus;
	result: string | null;
}

export interface WorkflowsState {
	nodes: Record<string, WorkflowNode>;
	order: string[];
}
```

- [ ] **Step 2: Write the failing store test**

Create `__tests__/store.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { createWorkflowsStore } from '../store';

describe('workflows store', () => {
	it('adds a node with defaults', () => {
		const s = createWorkflowsStore();
		const id = s.addNode({ backend: 'edge', ref: 'health', x: 10, y: 20 });
		const n = s.get().nodes[id];
		expect(n.status).toBe('idle');
		expect(n.result).toBeNull();
		expect(s.get().order).toEqual([id]);
	});

	it('moves a node', () => {
		const s = createWorkflowsStore();
		const id = s.addNode({ backend: 'windmill', ref: 'u/x/f', x: 0, y: 0 });
		s.moveNode(id, 100, 50);
		expect(s.get().nodes[id].x).toBe(100);
		expect(s.get().nodes[id].y).toBe(50);
	});

	it('sets status and result', () => {
		const s = createWorkflowsStore();
		const id = s.addNode({ backend: 'edge', ref: 'health', x: 0, y: 0 });
		s.setStatus(id, 'ok', '{"ok":true}');
		expect(s.get().nodes[id].status).toBe('ok');
		expect(s.get().nodes[id].result).toBe('{"ok":true}');
	});

	it('notifies subscribers on change', () => {
		const s = createWorkflowsStore();
		let calls = 0;
		s.subscribe(() => {
			calls++;
		});
		s.addNode({ backend: 'edge', ref: 'health', x: 0, y: 0 });
		expect(calls).toBe(1);
	});
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `./kbve.sh -nx rn:test -- --run src/workflows/__tests__/store.test.ts`
Expected: FAIL — cannot find `../store`.

- [ ] **Step 4: Write the store**

Create `store.ts`:

```typescript
import type { Backend, WorkflowNode, WorkflowsState } from './types';

export interface WorkflowsStore {
	get: () => WorkflowsState;
	subscribe: (fn: () => void) => () => void;
	addNode: (p: {
		backend: Backend;
		ref: string;
		x: number;
		y: number;
	}) => string;
	moveNode: (id: string, x: number, y: number) => void;
	setStatus: (
		id: string,
		status: WorkflowNode['status'],
		result?: string | null,
	) => void;
	nodes: () => WorkflowNode[];
}

let counter = 0;
function nextId(): string {
	counter += 1;
	return `n${counter}`;
}

export function createWorkflowsStore(): WorkflowsStore {
	let state: WorkflowsState = { nodes: {}, order: [] };
	const listeners = new Set<() => void>();

	const emit = () => {
		for (const fn of listeners) fn();
	};

	return {
		get: () => state,
		subscribe: (fn) => {
			listeners.add(fn);
			return () => listeners.delete(fn);
		},
		addNode: ({ backend, ref, x, y }) => {
			const id = nextId();
			const node: WorkflowNode = {
				id,
				backend,
				ref,
				x,
				y,
				status: 'idle',
				result: null,
			};
			state = {
				nodes: { ...state.nodes, [id]: node },
				order: [...state.order, id],
			};
			emit();
			return id;
		},
		moveNode: (id, x, y) => {
			const prev = state.nodes[id];
			if (!prev) return;
			state = {
				...state,
				nodes: { ...state.nodes, [id]: { ...prev, x, y } },
			};
			emit();
		},
		setStatus: (id, status, result = null) => {
			const prev = state.nodes[id];
			if (!prev) return;
			state = {
				...state,
				nodes: { ...state.nodes, [id]: { ...prev, status, result } },
			};
			emit();
		},
		nodes: () => state.order.map((id) => state.nodes[id]),
	};
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `./kbve.sh -nx rn:test -- --run src/workflows/__tests__/store.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/npm/rn/src/workflows/types.ts packages/npm/rn/src/workflows/store.ts packages/npm/rn/src/workflows/__tests__/store.test.ts
git commit -m "feat(rn/workflows): node model + store"
```

---

## Task 4: canvas geometry (pure math)

**Files:**

- Create: `packages/npm/rn/src/workflows/geometry.ts`
- Test: `packages/npm/rn/src/workflows/__tests__/geometry.test.ts`

**Interfaces:**

- Consumes: `WorkflowNode` from `./types`.
- Produces:
    - `interface Viewport { tx: number; ty: number; scale: number }`
    - `const NODE_W = 160`, `const NODE_H = 64`
    - `screenToWorld(px: number, py: number, vp: Viewport): { x: number; y: number }`
    - `nodeAtPoint(nodes: WorkflowNode[], worldX: number, worldY: number): WorkflowNode | null` (topmost hit; last in array wins)

- [ ] **Step 1: Write the failing test**

Create `__tests__/geometry.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { screenToWorld, nodeAtPoint, NODE_W, NODE_H } from '../geometry';
import type { WorkflowNode } from '../types';

const mk = (id: string, x: number, y: number): WorkflowNode => ({
	id,
	backend: 'edge',
	ref: 'r',
	x,
	y,
	status: 'idle',
	result: null,
});

describe('geometry', () => {
	it('screenToWorld inverts pan and scale', () => {
		const w = screenToWorld(120, 80, { tx: 20, ty: 10, scale: 2 });
		expect(w.x).toBe(50);
		expect(w.y).toBe(35);
	});

	it('nodeAtPoint hits inside a node box', () => {
		const nodes = [mk('a', 0, 0)];
		const hit = nodeAtPoint(nodes, 10, 10);
		expect(hit?.id).toBe('a');
	});

	it('nodeAtPoint misses outside every node', () => {
		const nodes = [mk('a', 0, 0)];
		expect(nodeAtPoint(nodes, NODE_W + 5, NODE_H + 5)).toBeNull();
	});

	it('nodeAtPoint returns topmost (last) on overlap', () => {
		const nodes = [mk('a', 0, 0), mk('b', 10, 10)];
		expect(nodeAtPoint(nodes, 15, 15)?.id).toBe('b');
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./kbve.sh -nx rn:test -- --run src/workflows/__tests__/geometry.test.ts`
Expected: FAIL — cannot find `../geometry`.

- [ ] **Step 3: Write geometry**

Create `geometry.ts`:

```typescript
import type { WorkflowNode } from './types';

export interface Viewport {
	tx: number;
	ty: number;
	scale: number;
}

export const NODE_W = 160;
export const NODE_H = 64;

export function screenToWorld(
	px: number,
	py: number,
	vp: Viewport,
): { x: number; y: number } {
	return { x: (px - vp.tx) / vp.scale, y: (py - vp.ty) / vp.scale };
}

export function nodeAtPoint(
	nodes: WorkflowNode[],
	worldX: number,
	worldY: number,
): WorkflowNode | null {
	for (let i = nodes.length - 1; i >= 0; i--) {
		const n = nodes[i];
		if (
			worldX >= n.x &&
			worldX <= n.x + NODE_W &&
			worldY >= n.y &&
			worldY <= n.y + NODE_H
		) {
			return n;
		}
	}
	return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./kbve.sh -nx rn:test -- --run src/workflows/__tests__/geometry.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/npm/rn/src/workflows/geometry.ts packages/npm/rn/src/workflows/__tests__/geometry.test.ts
git commit -m "feat(rn/workflows): canvas geometry helpers"
```

---

## Task 5: workflows service (invoke + poll + registries)

**Files:**

- Create: `packages/npm/rn/src/workflows/workflowsService.ts`
- Test: `packages/npm/rn/src/workflows/__tests__/service.test.ts`

**Interfaces:**

- Consumes: `Backend` from `./types`.
- Produces:
    - `interface ServiceConfig { baseUrl: string; getToken: () => Promise<string | null>; supabaseUrl?: string }`
    - `invokeNode(backend: Backend, ref: string, cfg: ServiceConfig): Promise<{ ok: boolean; body: string }>`
    - `listWindmillScripts(cfg: ServiceConfig): Promise<string[]>`
    - Windmill invoke posts to `${baseUrl}/dashboard/workflows/proxy/api/w/kbve/jobs/run/p/${ref}`, then polls `${baseUrl}/dashboard/workflows/proxy/api/w/kbve/jobs_u/completed/get_result_maybe/${id}` until `completed === true`.

- [ ] **Step 1: Write the failing test**

Create `__tests__/service.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { invokeNode, listWindmillScripts } from '../workflowsService';

const cfg = { baseUrl: '', getToken: async () => 'tok' };

beforeEach(() => {
	vi.restoreAllMocks();
});

describe('workflowsService', () => {
	it('invokes an edge function via the edge proxy', async () => {
		const spy = vi
			.spyOn(globalThis, 'fetch')
			.mockResolvedValue(new Response('{"ok":true}', { status: 200 }));
		const r = await invokeNode('edge', 'health', cfg);
		expect(r.ok).toBe(true);
		expect(spy.mock.calls[0][0]).toBe('/dashboard/edge/proxy/health');
	});

	it('invokes a firecracker job via the firecracker proxy', async () => {
		const spy = vi
			.spyOn(globalThis, 'fetch')
			.mockResolvedValue(new Response('ok', { status: 200 }));
		const r = await invokeNode('firecracker', 'build', cfg);
		expect(r.ok).toBe(true);
		expect(spy.mock.calls[0][0]).toBe('/dashboard/firecracker/proxy/build');
	});

	it('runs a windmill script then polls for the result', async () => {
		const spy = vi
			.spyOn(globalThis, 'fetch')
			.mockResolvedValueOnce(new Response('job-123', { status: 200 }))
			.mockResolvedValueOnce(
				new Response(
					JSON.stringify({ completed: true, result: { done: 1 } }),
					{ status: 200 },
				),
			);
		const r = await invokeNode('windmill', 'u/me/f', cfg);
		expect(r.ok).toBe(true);
		expect(spy.mock.calls[0][0]).toBe(
			'/dashboard/workflows/proxy/api/w/kbve/jobs/run/p/u/me/f',
		);
		expect(spy.mock.calls[1][0]).toBe(
			'/dashboard/workflows/proxy/api/w/kbve/jobs_u/completed/get_result_maybe/job-123',
		);
	});

	it('lists windmill scripts as paths', async () => {
		vi.spyOn(globalThis, 'fetch').mockResolvedValue(
			new Response(
				JSON.stringify([{ path: 'u/a/one' }, { path: 'u/b/two' }]),
				{ status: 200 },
			),
		);
		const paths = await listWindmillScripts(cfg);
		expect(paths).toEqual(['u/a/one', 'u/b/two']);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./kbve.sh -nx rn:test -- --run src/workflows/__tests__/service.test.ts`
Expected: FAIL — cannot find `../workflowsService`.

- [ ] **Step 3: Write the service**

Create `workflowsService.ts`:

```typescript
import type { Backend } from './types';

export interface ServiceConfig {
	baseUrl: string;
	getToken: () => Promise<string | null>;
	supabaseUrl?: string;
}

const POLL_MS = 1500;
const POLL_MAX = 40;

async function authHeaders(
	cfg: ServiceConfig,
): Promise<Record<string, string>> {
	const token = await cfg.getToken();
	return token ? { Authorization: `Bearer ${token}` } : {};
}

async function invokeEdge(
	ref: string,
	cfg: ServiceConfig,
): Promise<{ ok: boolean; body: string }> {
	const resp = await fetch(`${cfg.baseUrl}/dashboard/edge/proxy/${ref}`, {
		method: 'POST',
		headers: await authHeaders(cfg),
	});
	return { ok: resp.ok, body: await resp.text() };
}

async function invokeFirecracker(
	ref: string,
	cfg: ServiceConfig,
): Promise<{ ok: boolean; body: string }> {
	const resp = await fetch(
		`${cfg.baseUrl}/dashboard/firecracker/proxy/${ref}`,
		{
			method: 'POST',
			headers: await authHeaders(cfg),
		},
	);
	return { ok: resp.ok, body: await resp.text() };
}

const WM = (cfg: ServiceConfig) =>
	`${cfg.baseUrl}/dashboard/workflows/proxy/api/w/kbve`;

async function invokeWindmill(
	ref: string,
	cfg: ServiceConfig,
): Promise<{ ok: boolean; body: string }> {
	const headers = await authHeaders(cfg);
	const runResp = await fetch(`${WM(cfg)}/jobs/run/p/${ref}`, {
		method: 'POST',
		headers: { ...headers, 'Content-Type': 'application/json' },
		body: '{}',
	});
	if (!runResp.ok) return { ok: false, body: await runResp.text() };
	const jobId = (await runResp.text()).trim().replace(/^"|"$/g, '');

	for (let i = 0; i < POLL_MAX; i++) {
		const poll = await fetch(
			`${WM(cfg)}/jobs_u/completed/get_result_maybe/${jobId}`,
			{ headers },
		);
		if (poll.ok) {
			const data = await poll.json().catch(() => null);
			if (data && data.completed) {
				const success = data.success !== false;
				return {
					ok: success,
					body: JSON.stringify(data.result ?? data),
				};
			}
		}
		await new Promise((r) => setTimeout(r, POLL_MS));
	}
	return {
		ok: false,
		body: `windmill job ${jobId} did not complete in time`,
	};
}

export async function invokeNode(
	backend: Backend,
	ref: string,
	cfg: ServiceConfig,
): Promise<{ ok: boolean; body: string }> {
	if (backend === 'edge') return invokeEdge(ref, cfg);
	if (backend === 'firecracker') return invokeFirecracker(ref, cfg);
	return invokeWindmill(ref, cfg);
}

export async function listWindmillScripts(
	cfg: ServiceConfig,
): Promise<string[]> {
	const resp = await fetch(`${WM(cfg)}/scripts/list`, {
		headers: await authHeaders(cfg),
	});
	if (!resp.ok) return [];
	const rows = (await resp.json().catch(() => [])) as Array<{
		path?: string;
	}>;
	return rows.map((r) => r.path ?? '').filter(Boolean);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./kbve.sh -nx rn:test -- --run src/workflows/__tests__/service.test.ts`
Expected: PASS (4 tests). The windmill test resolves both fetches without hitting the poll delay because the second response is `completed: true`.

- [ ] **Step 5: Commit**

```bash
git add packages/npm/rn/src/workflows/workflowsService.ts packages/npm/rn/src/workflows/__tests__/service.test.ts
git commit -m "feat(rn/workflows): invoke + poll service for 3 backends"
```

---

## Task 6: Skia canvas + node card + module barrel

**Files:**

- Create: `packages/npm/rn/src/workflows/NodeCard.tsx`
- Create: `packages/npm/rn/src/workflows/WorkflowsCanvas.tsx`
- Create: `packages/npm/rn/src/workflows/index.ts`
- Modify: `packages/npm/rn/package.json` (add `./workflows` export)

**Interfaces:**

- Consumes: `createWorkflowsStore`, `WorkflowNode`, geometry (`NODE_W`, `NODE_H`, `nodeAtPoint`, `screenToWorld`, `Viewport`), `invokeNode`, `listWindmillScripts`, `ServiceConfig`.
- Produces:
    - `WorkflowsCanvas(props: { config: ServiceConfig }): JSX.Element`
    - re-exports from `index.ts`: `WorkflowsCanvas`, `createWorkflowsStore`, `invokeNode`, `listWindmillScripts`, and all `types`.

- [ ] **Step 1: Write NodeCard (RN overlay)**

Create `NodeCard.tsx`:

```tsx
import { Pressable, StyleSheet, View } from 'react-native';
import { Badge, Stack, Surface, Text } from '../dash/_ui';
import type { BadgeTone } from '../dash/_ui';
import type { WorkflowNode } from './types';
import { NODE_W, NODE_H } from './geometry';

const TONE: Record<WorkflowNode['status'], BadgeTone> = {
	idle: 'neutral',
	running: 'info',
	ok: 'success',
	err: 'danger',
};

export function NodeCard({
	node,
	screenX,
	screenY,
	onRun,
}: {
	node: WorkflowNode;
	screenX: number;
	screenY: number;
	onRun: (id: string) => void;
}) {
	return (
		<View
			style={[
				styles.wrap,
				{ left: screenX, top: screenY, width: NODE_W, height: NODE_H },
			]}>
			<Surface>
				<Stack>
					<Text>{node.backend}</Text>
					<Text>{node.ref}</Text>
					<View style={styles.row}>
						<Pressable
							onPress={() => onRun(node.id)}
							accessibilityLabel="run node">
							<Text>▶</Text>
						</Pressable>
						<Badge tone={TONE[node.status]}>{node.status}</Badge>
					</View>
				</Stack>
			</Surface>
		</View>
	);
}

const styles = StyleSheet.create({
	wrap: { position: 'absolute' },
	row: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
	},
});
```

- [ ] **Step 2: Write WorkflowsCanvas**

Create `WorkflowsCanvas.tsx`. The Skia `Canvas` draws the background grid + node rectangles + edges; the `NodeCard` overlay renders the interactive controls positioned in screen space. A single pan gesture drags the node under the press point, or the viewport when the press misses all nodes.

```tsx
import { useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { StyleSheet, View } from 'react-native';
import { Canvas, Rect, Group } from '@shopify/react-native-skia';
import {
	Gesture,
	GestureDetector,
	GestureHandlerRootView,
} from 'react-native-gesture-handler';
import { createWorkflowsStore } from './store';
import {
	NODE_W,
	NODE_H,
	nodeAtPoint,
	screenToWorld,
	type Viewport,
} from './geometry';
import { invokeNode, type ServiceConfig } from './workflowsService';
import { NodeCard } from './NodeCard';

export function WorkflowsCanvas({ config }: { config: ServiceConfig }) {
	const store = useMemo(() => createWorkflowsStore(), []);
	const state = useSyncExternalStore(store.subscribe, store.get);
	const [vp, setVp] = useState<Viewport>({ tx: 0, ty: 0, scale: 1 });
	const drag = useRef<{
		id: string | null;
		startX: number;
		startY: number;
		nodeX: number;
		nodeY: number;
	}>({
		id: null,
		startX: 0,
		startY: 0,
		nodeX: 0,
		nodeY: 0,
	});

	if (state.order.length === 0) {
		store.addNode({ backend: 'edge', ref: 'health', x: 40, y: 40 });
		store.addNode({
			backend: 'windmill',
			ref: 'u/admin/hello',
			x: 260,
			y: 40,
		});
		store.addNode({ backend: 'firecracker', ref: 'ping', x: 150, y: 180 });
	}

	const nodes = store.nodes();

	const onRun = async (id: string) => {
		const n = store.get().nodes[id];
		if (!n) return;
		store.setStatus(id, 'running');
		try {
			const r = await invokeNode(n.backend, n.ref, config);
			store.setStatus(id, r.ok ? 'ok' : 'err', r.body);
		} catch (e) {
			store.setStatus(id, 'err', String(e));
		}
	};

	const pan = Gesture.Pan()
		.onBegin((e) => {
			const w = screenToWorld(e.x, e.y, vp);
			const hit = nodeAtPoint(store.nodes(), w.x, w.y);
			drag.current = hit
				? {
						id: hit.id,
						startX: e.x,
						startY: e.y,
						nodeX: hit.x,
						nodeY: hit.y,
					}
				: {
						id: null,
						startX: e.x,
						startY: e.y,
						nodeX: vp.tx,
						nodeY: vp.ty,
					};
		})
		.onUpdate((e) => {
			const dx = e.x - drag.current.startX;
			const dy = e.y - drag.current.startY;
			if (drag.current.id) {
				store.moveNode(
					drag.current.id,
					drag.current.nodeX + dx / vp.scale,
					drag.current.nodeY + dy / vp.scale,
				);
			} else {
				setVp((v) => ({
					...v,
					tx: drag.current.nodeX + dx,
					ty: drag.current.nodeY + dy,
				}));
			}
		});

	return (
		<GestureHandlerRootView style={styles.root}>
			<GestureDetector gesture={pan}>
				<View style={styles.root}>
					<Canvas style={StyleSheet.absoluteFill}>
						<Group
							transform={[
								{ translateX: vp.tx },
								{ translateY: vp.ty },
								{ scale: vp.scale },
							]}>
							{nodes.map((n) => (
								<Rect
									key={n.id}
									x={n.x}
									y={n.y}
									width={NODE_W}
									height={NODE_H}
									color="#1e293b"
								/>
							))}
						</Group>
					</Canvas>
					{nodes.map((n) => (
						<NodeCard
							key={n.id}
							node={n}
							screenX={n.x * vp.scale + vp.tx}
							screenY={n.y * vp.scale + vp.ty}
							onRun={onRun}
						/>
					))}
				</View>
			</GestureDetector>
		</GestureHandlerRootView>
	);
}

const styles = StyleSheet.create({
	root: { flex: 1 },
});
```

- [ ] **Step 3: Write the module barrel**

Create `index.ts`:

```typescript
export { WorkflowsCanvas } from './WorkflowsCanvas';
export { createWorkflowsStore } from './store';
export { invokeNode, listWindmillScripts } from './workflowsService';
export type { ServiceConfig } from './workflowsService';
export type {
	Backend,
	NodeStatus,
	WorkflowNode,
	WorkflowsState,
} from './types';
```

- [ ] **Step 4: Add the subpath export**

In `packages/npm/rn/package.json` `exports`, after the `./dash` block add:

```json
		"./workflows": {
			"types": "./src/workflows/index.ts",
			"import": "./src/workflows/index.ts"
		},
```

- [ ] **Step 5: Typecheck the rn package**

Run: `./kbve.sh -nx rn:test -- --run src/workflows`
Expected: PASS (store + geometry + service suites; no new tests here but the import graph must typecheck under vitest).

- [ ] **Step 6: Commit**

```bash
git add packages/npm/rn/src/workflows/NodeCard.tsx packages/npm/rn/src/workflows/WorkflowsCanvas.tsx packages/npm/rn/src/workflows/index.ts packages/npm/rn/package.json
git commit -m "feat(rn/workflows): skia canvas + node card + module export"
```

---

## Task 7: Website mount

**Files:**

- Create: `apps/kbve/astro-kbve/src/components/rnweb/ReactWorkflowsDashRN.tsx`
- Create: `apps/kbve/astro-kbve/src/components/rnweb/AstroWorkflowsDashRN.astro`
- Create: `apps/kbve/astro-kbve/src/content/docs/dashboard/workflows/index.mdx`
- Modify: `apps/kbve/astro-kbve/src/components/navigation/dashboardMenu.ts`

**Interfaces:**

- Consumes: `WorkflowsCanvas` from `@kbve/rn/workflows`, `initSupa`/`getSupa` from `@/lib/supa`, `DASH_PROXY_BASE` from `./dashProxyBase`.

- [ ] **Step 1: Write the island wrapper**

Create `ReactWorkflowsDashRN.tsx` (mirrors `ReactEdgeDashRN.tsx`):

```tsx
import { useMemo } from 'react';
import { WorkflowsCanvas } from '@kbve/rn/workflows';
import { initSupa, getSupa } from '@/lib/supa';
import { DASH_PROXY_BASE } from './dashProxyBase';

async function getToken(): Promise<string | null> {
	try {
		await initSupa();
		const result = await getSupa()
			.getSession()
			.catch(() => null);
		return result?.session?.access_token ?? null;
	} catch {
		return null;
	}
}

export default function ReactWorkflowsDashRN() {
	const config = useMemo(() => ({ baseUrl: DASH_PROXY_BASE, getToken }), []);
	return <WorkflowsCanvas config={config} />;
}
```

- [ ] **Step 2: Write the Astro mount**

Create `AstroWorkflowsDashRN.astro`:

```astro
---
import ReactWorkflowsDashRN from './ReactWorkflowsDashRN';
---

<ReactWorkflowsDashRN client:only="react" />
```

- [ ] **Step 3: Write the route page**

Create `content/docs/dashboard/workflows/index.mdx`:

```mdx
---
title: Workflows
description: KBVE Workflows canvas — invoke scripts across edge, firecracker, and Windmill
template: splash
tableOfContents: false
graph:
    visible: false
editUrl: false
lastUpdated: false
next: false
sidebar:
    label: Workflows
    order: 3
tags:
    - dashboard
    - workflows
---

import AstroWorkflowsDashRN from '@/components/rnweb/AstroWorkflowsDashRN.astro';

<AstroWorkflowsDashRN />
```

- [ ] **Step 4: Add the nav entry**

In `dashboardMenu.ts`, after the `{ label: 'Edge', link: '/dashboard/edge/' },` line, add:

```typescript
	{ label: 'Workflows', link: '/dashboard/workflows/', staff: true },
```

- [ ] **Step 5: Build the site**

Run: `./kbve.sh -nx astro-kbve:build`
Expected: `Successfully ran target build` — the `/dashboard/workflows/` page renders and the `@kbve/rn/workflows` island resolves (react-native-web + Skia CanvasKit).

- [ ] **Step 6: Commit**

```bash
git add apps/kbve/astro-kbve/src/components/rnweb/ReactWorkflowsDashRN.tsx apps/kbve/astro-kbve/src/components/rnweb/AstroWorkflowsDashRN.astro apps/kbve/astro-kbve/src/content/docs/dashboard/workflows/index.mdx apps/kbve/astro-kbve/src/components/navigation/dashboardMenu.ts
git commit -m "feat(astro-kbve): /dashboard/workflows route + rn island"
```

---

## Task 8: Version bump + manifest regen

**Files:**

- Modify: `apps/kbve/astro-kbve/src/content/docs/project/api.mdx` (axum-kbve `version:` bump — the proxy change ships in the axum-kbve image)
- Modify: `.github/ci-dispatch-manifest.json` (regenerated)

**Interfaces:** none (release plumbing).

- [ ] **Step 1: Bump the axum-kbve MDX version**

In `api.mdx` frontmatter, increment the `version:` patch (e.g. `1.0.229` → `1.0.230`). Do NOT touch `version.toml` or `Cargo.toml`.

- [ ] **Step 2: Regenerate the manifest**

Run:

```bash
./kbve.sh -nx astro-kbve:build
./kbve.sh -nx astro-kbve:sync:ci-manifest
```

Expected: `Wrote .github/ci-dispatch-manifest.json`. Commit the full diff (may include unrelated MDX version drift — that is expected per the regenerate-whole-file rule).

- [ ] **Step 3: Commit**

```bash
git add apps/kbve/astro-kbve/src/content/docs/project/api.mdx .github/ci-dispatch-manifest.json
git commit -m "chore(axum-kbve): bump version for windmill proxy + regen manifest"
```

---

## Task 9: Final verification + PR

- [ ] **Step 1: Full test sweep**

Run: `./kbve.sh -nx rn:test -- --run src/workflows`
Expected: all workflows suites PASS (store, geometry, service).

- [ ] **Step 2: Build gates**

Run: `./kbve.sh -nx axum-kbve:build && ./kbve.sh -nx axum-kbve:lint && ./kbve.sh -nx astro-kbve:build`
Expected: all green.

- [ ] **Step 3: Push + update PR**

```bash
git push
```

The branch `workflows-dashboard-spec` already backs PR #13983 — the pushed commits extend it from spec-only to the full POC. Update the PR body to describe the implementation.

---

## Phase 2 (follow-up): desktop + mobile mounts

Deliberately deferred from this POC. The cross-platform investment — the
`@kbve/rn/workflows` module — is complete after Task 6, so both mounts are the
same component consuming the same module. Each needs per-app plumbing that is
its own scoped change, documented here so the follow-up starts from facts, not
discovery:

**Desktop (`apps/kbve/desktop-kbve`)** — it is a plain React + Tailwind DOM app
with a view registry (`engine/registry.ts`: `registerView({ id, label, icon,
component })`, wired in `views/index.ts` `initViews()`). To render the RN Skia
canvas there, its Vite config first needs the `react-native` → `react-native-web`
alias and Skia's web CanvasKit setup (astro-kbve already has this via the
rn-astro bridge; desktop does not). Once aliased, add a `WorkflowsView`
(`views/workflows.tsx`) rendering `<WorkflowsCanvas config={...} />` and register
it in `initViews()` alongside the others. Desktop auth token source:
`stores/auth` (`useAuthStore`).

**Mobile (`packages/npm/rn/src/screens`)** — `DashboardScreen.tsx` is a
link-launcher today (`open('https://kbve.com/...')`), not an in-app screen
router. Two options: (a) POC-fast — add a launcher tile that opens
`https://kbve.com/dashboard/workflows/`; (b) native — add a `WorkflowsScreen.tsx`
rendering `<WorkflowsCanvas>` and wire it into the app's navigation (requires the
Expo app's nav framework, out of scope here). The shared module already supports
(b) with zero changes.

Neither blocks the POC: web (Tasks 1–7) proves all three backend links and that
the unified Skia canvas renders on DOM; desktop is the same DOM target once
RN-web is aliased.

## Notes for the implementer

- **Skia on web** loads CanvasKit WASM (~2.9MB) only on the `/dashboard/workflows/` route (the island is `client:only`), so it never enters the global dashboard bundle.
- **Windmill auth**: the axum proxy forwards the caller's Supabase token; the windmill-gate bridge (already live) provisions/impersonates the user. No token is minted client-side.
- **`ref` formats**: edge = function name; firecracker = ctl path segment; windmill = script path like `u/<user>/<script>`. The seeded demo nodes in `WorkflowsCanvas` use placeholder refs — replace them with a real edge fn, firecracker job, and Windmill script during manual verification.
- **Manual verification**: on `/dashboard/workflows/`, click ▶ on each node; the badge should go `running → ok`. Confirm the Windmill node's job appears in the Windmill UI run history attributed to your user (proves the bridge path end-to-end).

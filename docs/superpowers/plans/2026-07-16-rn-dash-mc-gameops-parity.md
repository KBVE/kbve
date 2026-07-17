# RN Dash — Minecraft GameOps Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the `/dashboard/gameops/mc/` dashboard to a `@kbve/rn` `dash/mc/` composition (status via `GET /api/v1/mc/players`, per-server RCON console via `POST /api/v1/rcon/mc/{server}/exec`), fixing the all-servers-offline bug and deleting the legacy astro-kbve MC components.

**Architecture:** New `packages/npm/rn/src/dash/mc/` composition dir (ClickHouse-migration pattern): one polling stream mapping the players payload into per-server items, a ported command table, an injected-auth exec client, cross-platform ServerCard + RconConsole + McView. The astro bridge keeps the staff gate; a native McScreen mirrors ClickHouseScreen.

**Tech Stack:** React Native (+ react-native-web), TypeScript, vitest, existing `createStreamSource` kit in `@kbve/rn/dash`, Astro (astro-kbve mount), Nx.

**Spec:** `docs/superpowers/specs/2026-07-16-rn-dash-mc-gameops-parity-design.md`

## Global Constraints

- Work happens in a git worktree (created via superpowers:using-git-worktrees) on a feature branch off `dev`. Never commit to `dev`/`main` directly, never push them.
- Worktrees in this monorepo have NO `node_modules`. Run tooling as main-checkout binaries with the worktree as cwd: `cd <worktree> && /Users/alappatel/Documents/GitHub/kbve/node_modules/.bin/<vitest|nx|tsc> …` and add `--skip-nx-cache` to nx invocations (established worktree gotcha). Task 0 Step 3 verifies which invocation works once; every later "Run:" step reuses that verified form verbatim, written as `<TEST>`.
- No code comments in new/modified code (user preference). Existing comments in untouched lines stay.
- Commit messages: conventional commits, no co-author trailers, no Claude references.
- No manual version bumps anywhere.
- `packages/npm/rn/src/dash/mc/index.ts` and the dash barrel use NAMED re-exports only (TS2308 barrel-clash lesson from the ClickHouse migration).
- Types used across tasks are defined in Task 2 (`mcStream.ts`) and Task 3 (`rconExec.ts`); later tasks import them — signatures must match exactly.

---

### Task 0: Worktree + test-command bootstrap

**Files:** none created (environment setup)

- [ ] **Step 1: Create worktree**

Use superpowers:using-git-worktrees. Branch `feat/rn-dash-mc-parity` off `dev`.

- [ ] **Step 2: Copy spec+plan into worktree and commit**

```bash
git add docs/superpowers/specs/2026-07-16-rn-dash-mc-gameops-parity-design.md docs/superpowers/plans/2026-07-16-rn-dash-mc-gameops-parity.md
git commit -m "docs(rn-dash): mc gameops parity spec + plan"
```

(If the spec/plan only exist in the main tree, copy them in first.)

- [ ] **Step 3: Establish the test command**

Worktrees have no node_modules. From the WORKTREE root, verify:

```bash
cd <worktree>/packages/npm/rn
/Users/alappatel/Documents/GitHub/kbve/node_modules/.bin/vitest run src/dash/adapters/__tests__/clickhouse.test.ts
```

Expected: existing ClickHouse adapter tests PASS. If vitest cannot resolve config/plugins this way, fall back to running nx from the main checkout binary with worktree cwd:

```bash
cd <worktree> && /Users/alappatel/Documents/GitHub/kbve/node_modules/.bin/nx test rn --skip-nx-cache
```

Whichever form passes becomes `<TEST>` for all later steps (single-file variant preferred for speed).

---

### Task 1: Command table — `mc/commands.ts`

**Files:**

- Create: `packages/npm/rn/src/dash/mc/commands.ts`
- Create: `packages/npm/rn/src/dash/mc/labels.ts`
- Test: `packages/npm/rn/src/dash/mc/__tests__/commands.test.ts`

**Interfaces:**

- Produces: `type Tier = 'read' | 'write' | 'destructive'`; `type Scope = 'velocity' | 'backend' | 'shared'`; `interface CommandDef { name: string; label: string; template: string; args: { label: string; placeholder?: string }[]; tier: Tier; scope: Scope; description: string }`; `MC_COMMANDS: CommandDef[]`; `commandsForServer(server: string): CommandDef[]`; from labels: `MC_SERVER_ORDER: string[]`; `serverMeta(server: string): { label: string; role: string }`.

- [ ] **Step 1: Write the failing test**

`packages/npm/rn/src/dash/mc/__tests__/commands.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { MC_COMMANDS, commandsForServer } from '../commands';
import { serverMeta, MC_SERVER_ORDER } from '../labels';

describe('commandsForServer', () => {
	it('velocity gets velocity + shared scoped commands only', () => {
		const cmds = commandsForServer('velocity');
		expect(cmds.length).toBeGreaterThan(0);
		expect(cmds.every((c) => c.scope !== 'backend')).toBe(true);
		expect(cmds.some((c) => c.name === 'glist')).toBe(true);
		expect(cmds.some((c) => c.name === 'list')).toBe(false);
	});
	it('backends get backend + shared scoped commands only', () => {
		const cmds = commandsForServer('survival');
		expect(cmds.every((c) => c.scope !== 'velocity')).toBe(true);
		expect(cmds.some((c) => c.name === 'ban')).toBe(true);
		expect(cmds.some((c) => c.name === 'alert')).toBe(false);
	});
	it('every command has a tier and description', () => {
		for (const c of MC_COMMANDS) {
			expect(['read', 'write', 'destructive']).toContain(c.tier);
			expect(c.description.length).toBeGreaterThan(0);
		}
	});
});

describe('labels', () => {
	it('known servers have labels and roles', () => {
		expect(serverMeta('velocity').label).toBe('Velocity Proxy');
		expect(serverMeta('lobby').role.length).toBeGreaterThan(0);
	});
	it('unknown server falls back to its name', () => {
		expect(serverMeta('creative')).toEqual({ label: 'creative', role: '' });
	});
	it('order is velocity, lobby, survival', () => {
		expect(MC_SERVER_ORDER).toEqual(['velocity', 'lobby', 'survival']);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `<TEST> src/dash/mc/__tests__/commands.test.ts`
Expected: FAIL — cannot resolve `../commands`.

- [ ] **Step 3: Implement `commands.ts` and `labels.ts`**

`commands.ts` is a verbatim port of `apps/kbve/astro-kbve/src/components/dashboard/mc/commands.ts` with two changes: strip all comments, and widen `commandsForServer` to accept any string:

```ts
export type Tier = 'read' | 'write' | 'destructive';
export type Scope = 'velocity' | 'backend' | 'shared';

export interface CommandDef {
	name: string;
	label: string;
	template: string;
	args: { label: string; placeholder?: string }[];
	tier: Tier;
	scope: Scope;
	description: string;
}

export const MC_COMMANDS: CommandDef[] = [
	/* full 20-entry table copied verbatim from
	   apps/kbve/astro-kbve/src/components/dashboard/mc/commands.ts lines 14-207:
	   list, tps, save_all, glist, find, server_info,
	   say, alert, tp, send, gamemode, time_set, weather,
	   kick, op, deop, ban, pardon, whitelist_add, whitelist_remove */
];

export function commandsForServer(server: string): CommandDef[] {
	return MC_COMMANDS.filter((c) => {
		if (c.scope === 'shared') return true;
		if (server === 'velocity') return c.scope === 'velocity';
		return c.scope === 'backend';
	});
}
```

The `/* ... */` block above is an instruction to the implementer, not a comment to keep: paste the actual 20 command objects from the source file, unchanged.

`labels.ts`:

```ts
export const MC_SERVER_ORDER = ['velocity', 'lobby', 'survival'];

const META: Record<string, { label: string; role: string }> = {
	velocity: {
		label: 'Velocity Proxy',
		role: 'Network edge — routes /glist, /alert, /send across backends.',
	},
	lobby: {
		label: 'Lobby Backend',
		role: 'Spawn world. List, kick, gamemode, broadcast.',
	},
	survival: {
		label: 'Survival Backend',
		role: 'Main play world. Whitelist, bans, world ops.',
	},
};

export function serverMeta(server: string): { label: string; role: string } {
	return META[server] ?? { label: server, role: '' };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `<TEST> src/dash/mc/__tests__/commands.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/npm/rn/src/dash/mc/commands.ts packages/npm/rn/src/dash/mc/labels.ts packages/npm/rn/src/dash/mc/__tests__/commands.test.ts
git commit -m "feat(rn-dash): mc command table + server labels"
```

---

### Task 2: Status stream — `mc/mcStream.ts`

**Files:**

- Create: `packages/npm/rn/src/dash/mc/mcStream.ts`
- Test: `packages/npm/rn/src/dash/mc/__tests__/mcStream.test.ts`

**Interfaces:**

- Consumes: `createStreamSource` from `../createStreamSource`, `StreamStore` from `../types`, `MC_SERVER_ORDER` from `./labels`.
- Produces:

```ts
export interface McPlayer {
	name: string;
	uuid: string | null;
	skinUrl: string | null;
	server: string;
}
export interface McServerItem {
	id: string;
	name: string;
	online: number;
	max: number;
	reachable: boolean;
	players: McPlayer[];
	cachedAt: number;
}
export interface RawMcPlayerList {
	online: number;
	max: number;
	players: {
		name: string;
		uuid: string | null;
		skin_url: string | null;
		server: string;
	}[];
	servers: {
		server: string;
		online: number;
		max: number;
		reachable: boolean;
	}[];
	cached_at: number;
}
export function mapPlayerList(raw: RawMcPlayerList): McServerItem[];
export interface McStreamOptions {
	baseUrl?: string;
	pollMs?: number;
}
export function createMcStream(
	opts?: McStreamOptions,
): StreamStore<McServerItem>;
```

- [ ] **Step 1: Write the failing test**

`packages/npm/rn/src/dash/mc/__tests__/mcStream.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { mapPlayerList } from '../mcStream';
import type { RawMcPlayerList } from '../mcStream';

const raw: RawMcPlayerList = {
	online: 3,
	max: 120,
	players: [
		{ name: 'alice', uuid: 'u1', skin_url: null, server: 'survival' },
		{ name: 'bob', uuid: 'u2', skin_url: 's2', server: 'survival' },
		{ name: 'carol', uuid: null, skin_url: null, server: 'lobby' },
	],
	servers: [
		{ server: 'survival', online: 2, max: 60, reachable: true },
		{ server: 'creative', online: 0, max: 20, reachable: true },
		{ server: 'lobby', online: 1, max: 40, reachable: true },
		{ server: 'velocity', online: 3, max: 200, reachable: false },
	],
	cached_at: 1750000000,
};

describe('mapPlayerList', () => {
	it('joins players onto their server', () => {
		const items = mapPlayerList(raw);
		const survival = items.find((i) => i.id === 'survival')!;
		expect(survival.players.map((p) => p.name)).toEqual(['alice', 'bob']);
		expect(survival.players[1].skinUrl).toBe('s2');
		const velocity = items.find((i) => i.id === 'velocity')!;
		expect(velocity.players).toEqual([]);
		expect(velocity.reachable).toBe(false);
	});
	it('orders known servers first, unknown appended', () => {
		expect(mapPlayerList(raw).map((i) => i.id)).toEqual([
			'velocity',
			'lobby',
			'survival',
			'creative',
		]);
	});
	it('carries cached_at onto every item', () => {
		expect(mapPlayerList(raw).every((i) => i.cachedAt === 1750000000)).toBe(
			true,
		);
	});
	it('handles empty payload', () => {
		expect(
			mapPlayerList({
				online: 0,
				max: 0,
				players: [],
				servers: [],
				cached_at: 0,
			}),
		).toEqual([]);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `<TEST> src/dash/mc/__tests__/mcStream.test.ts`
Expected: FAIL — cannot resolve `../mcStream`.

- [ ] **Step 3: Implement `mcStream.ts`**

```ts
import { createStreamSource } from '../createStreamSource';
import type { StreamStore } from '../types';
import { MC_SERVER_ORDER } from './labels';

export interface McPlayer {
	name: string;
	uuid: string | null;
	skinUrl: string | null;
	server: string;
}

export interface McServerItem {
	id: string;
	name: string;
	online: number;
	max: number;
	reachable: boolean;
	players: McPlayer[];
	cachedAt: number;
}

export interface RawMcPlayerList {
	online: number;
	max: number;
	players: {
		name: string;
		uuid: string | null;
		skin_url: string | null;
		server: string;
	}[];
	servers: {
		server: string;
		online: number;
		max: number;
		reachable: boolean;
	}[];
	cached_at: number;
}

export function mapPlayerList(raw: RawMcPlayerList): McServerItem[] {
	const rank = (s: string) => {
		const i = MC_SERVER_ORDER.indexOf(s);
		return i === -1 ? MC_SERVER_ORDER.length : i;
	};
	return (raw.servers ?? [])
		.map((s) => ({
			id: s.server,
			name: s.server,
			online: s.online,
			max: s.max,
			reachable: s.reachable,
			players: (raw.players ?? [])
				.filter((p) => p.server === s.server)
				.map((p) => ({
					name: p.name,
					uuid: p.uuid,
					skinUrl: p.skin_url,
					server: p.server,
				})),
			cachedAt: raw.cached_at,
		}))
		.sort((a, b) => rank(a.id) - rank(b.id) || a.id.localeCompare(b.id));
}

export interface McStreamOptions {
	baseUrl?: string;
	pollMs?: number;
}

export function createMcStream(
	opts: McStreamOptions = {},
): StreamStore<McServerItem> {
	const { baseUrl = '', pollMs = 15_000 } = opts;
	return createStreamSource<McServerItem, McServerItem>({
		key: 'mc:servers',
		pollMs,
		cacheTtlMs: 60_000,
		id: (it) => it.id,
		signature: (it) =>
			`${it.reachable}|${it.online}|${it.max}|${it.players
				.map((p) => p.name)
				.join(',')}`,
		normalize: (x) => x,
		fetch: async ({ signal }) => {
			const res = await fetch(`${baseUrl}/api/v1/mc/players`, { signal });
			if (!res.ok) throw new Error(`MC status error: ${res.status}`);
			const json = (await res.json()) as RawMcPlayerList;
			return mapPlayerList(json);
		},
	});
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `<TEST> src/dash/mc/__tests__/mcStream.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/npm/rn/src/dash/mc/mcStream.ts packages/npm/rn/src/dash/mc/__tests__/mcStream.test.ts
git commit -m "feat(rn-dash): mc status stream from /api/v1/mc/players"
```

---

### Task 3: Exec client — `mc/rconExec.ts`

**Files:**

- Create: `packages/npm/rn/src/dash/mc/rconExec.ts`
- Test: `packages/npm/rn/src/dash/mc/__tests__/rconExec.test.ts`

**Interfaces:**

- Produces:

```ts
export interface RconExecRequest {
	command: string;
	args?: string[];
}
export interface RconExecResponse {
	ok: boolean;
	output: string;
	latency_ms: number;
	error?: string;
}
export type RconExecFn = (
	server: string,
	body: RconExecRequest,
) => Promise<RconExecResponse>;
export function createRconExec(opts: {
	getToken: () => Promise<string | null>;
	baseUrl?: string;
}): RconExecFn;
```

Behavior (port of astro-kbve `src/lib/rcon-client.ts` `execRcon`, `game` fixed to `mc`): no token → resolve `{ ok:false, output:'', latency_ms:0, error:'Not signed in' }` (resolve, not throw — console renders it as a failed entry); POST JSON to `{baseUrl}/api/v1/rcon/mc/{server}/exec` with bearer header; non-OK → parse body as JSON `RconExecResponse`, fall back to raw text, fall back to `HTTP {status}`, return `ok:false`; OK with empty body → `{ ok:false, error:'empty response', ... }`; network throw → `{ ok:false, error: message }`.

- [ ] **Step 1: Write the failing test**

`packages/npm/rn/src/dash/mc/__tests__/rconExec.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRconExec } from '../rconExec';

const token = async () => 'tok';

describe('createRconExec', () => {
	beforeEach(() => {
		global.fetch = vi.fn();
	});

	it('posts command to the exec endpoint with bearer token', async () => {
		(global.fetch as any).mockResolvedValue({
			ok: true,
			text: async () =>
				JSON.stringify({ ok: true, output: 'done', latency_ms: 12 }),
		});
		const exec = createRconExec({ getToken: token, baseUrl: 'https://x' });
		const res = await exec('survival', { command: 'list', args: [] });
		expect(res).toEqual({ ok: true, output: 'done', latency_ms: 12 });
		const [url, init] = (global.fetch as any).mock.calls[0];
		expect(url).toBe('https://x/api/v1/rcon/mc/survival/exec');
		expect(init.method).toBe('POST');
		expect(init.headers.Authorization).toBe('Bearer tok');
		expect(JSON.parse(init.body)).toEqual({ command: 'list', args: [] });
	});

	it('missing token resolves as failed entry', async () => {
		const exec = createRconExec({ getToken: async () => null });
		const res = await exec('lobby', { command: 'list' });
		expect(res.ok).toBe(false);
		expect(res.error).toBe('Not signed in');
		expect(global.fetch).not.toHaveBeenCalled();
	});

	it('non-OK JSON error body surfaces its error', async () => {
		(global.fetch as any).mockResolvedValue({
			ok: false,
			status: 403,
			text: async () =>
				JSON.stringify({
					ok: false,
					output: '',
					latency_ms: 0,
					error: 'staff only',
				}),
		});
		const exec = createRconExec({ getToken: token });
		const res = await exec('survival', {
			command: 'ban',
			args: ['bob', 'grief'],
		});
		expect(res.ok).toBe(false);
		expect(res.error).toBe('staff only');
	});

	it('non-OK non-JSON body falls back to text then status', async () => {
		(global.fetch as any).mockResolvedValue({
			ok: false,
			status: 502,
			text: async () => 'bad gateway',
		});
		const exec = createRconExec({ getToken: token });
		expect((await exec('lobby', { command: 'list' })).error).toBe(
			'bad gateway',
		);

		(global.fetch as any).mockResolvedValue({
			ok: false,
			status: 500,
			text: async () => '',
		});
		expect((await exec('lobby', { command: 'list' })).error).toBe(
			'HTTP 500',
		);
	});

	it('network throw resolves as failed entry', async () => {
		(global.fetch as any).mockRejectedValue(new Error('offline'));
		const exec = createRconExec({ getToken: token });
		const res = await exec('lobby', { command: 'list' });
		expect(res).toEqual({
			ok: false,
			output: '',
			latency_ms: 0,
			error: 'offline',
		});
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `<TEST> src/dash/mc/__tests__/rconExec.test.ts`
Expected: FAIL — cannot resolve `../rconExec`.

- [ ] **Step 3: Implement `rconExec.ts`**

```ts
export interface RconExecRequest {
	command: string;
	args?: string[];
}

export interface RconExecResponse {
	ok: boolean;
	output: string;
	latency_ms: number;
	error?: string;
}

export type RconExecFn = (
	server: string,
	body: RconExecRequest,
) => Promise<RconExecResponse>;

const FAIL = (error: string): RconExecResponse => ({
	ok: false,
	output: '',
	latency_ms: 0,
	error,
});

export function createRconExec(opts: {
	getToken: () => Promise<string | null>;
	baseUrl?: string;
}): RconExecFn {
	const { getToken, baseUrl = '' } = opts;
	return async (server, body) => {
		const token = await getToken().catch(() => null);
		if (!token) return FAIL('Not signed in');
		try {
			const res = await fetch(
				`${baseUrl}/api/v1/rcon/mc/${encodeURIComponent(server)}/exec`,
				{
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						Authorization: `Bearer ${token}`,
					},
					body: JSON.stringify(body),
				},
			);
			const text = await res.text();
			let parsed: RconExecResponse | undefined;
			try {
				parsed = text
					? (JSON.parse(text) as RconExecResponse)
					: undefined;
			} catch {
				parsed = undefined;
			}
			if (!res.ok) {
				return FAIL(
					parsed?.error ??
						(parsed?.output || undefined) ??
						(text || `HTTP ${res.status}`),
				);
			}
			return parsed ?? FAIL('empty response');
		} catch (e) {
			return FAIL(e instanceof Error ? e.message : 'request failed');
		}
	};
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `<TEST> src/dash/mc/__tests__/rconExec.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/npm/rn/src/dash/mc/rconExec.ts packages/npm/rn/src/dash/mc/__tests__/rconExec.test.ts
git commit -m "feat(rn-dash): mc rcon exec client"
```

---

### Task 4: Rewrite `adapters/minecraft.tsx` onto the players endpoint

**Files:**

- Modify: `packages/npm/rn/src/dash/adapters/minecraft.tsx`
- Test: `packages/npm/rn/src/dash/adapters/__tests__/minecraft.test.ts` (create)

**Interfaces:**

- Consumes: `mapPlayerList`, `McServerItem`, `RawMcPlayerList`, `McStreamOptions`, `createMcStream` from `../mc/mcStream`; `serverMeta` from `../mc/labels`.
- Produces (keeps existing export names so `StreamView` consumers compile): `createMinecraftStream(opts?: McStreamOptions): StreamStore<McServerItem>` and `minecraftLens: StreamLens<McServerItem>`. The old `MinecraftServerItem`, `MinecraftStreamOptions`, `ServerStatus` types are DELETED (host/port/version/motd fields don't exist on the real endpoint). `createMinecraftStream` becomes a thin alias of `createMcStream`.

- [ ] **Step 1: Write the failing test**

`packages/npm/rn/src/dash/adapters/__tests__/minecraft.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { minecraftLens } from '../minecraft';
import type { McServerItem } from '../../mc/mcStream';

const item = (over: Partial<McServerItem> = {}): McServerItem => ({
	id: 'survival',
	name: 'survival',
	online: 2,
	max: 60,
	reachable: true,
	players: [{ name: 'alice', uuid: 'u1', skinUrl: null, server: 'survival' }],
	cachedAt: 1750000000,
	...over,
});

describe('minecraftLens', () => {
	it('search text covers server name, label, and player names', () => {
		const text = minecraftLens.searchText!(item());
		expect(text).toContain('survival');
		expect(text).toContain('Survival Backend');
		expect(text).toContain('alice');
	});
	it('groups by reachability', () => {
		expect(minecraftLens.group!(item())).toBe('Online');
		expect(minecraftLens.group!(item({ reachable: false }))).toBe(
			'Unreachable',
		);
	});
	it('filters split reachable vs unreachable vs with players', () => {
		const online = minecraftLens.filters!.find((f) => f.id === 'online')!;
		const offline = minecraftLens.filters!.find((f) => f.id === 'offline')!;
		const withPlayers = minecraftLens.filters!.find(
			(f) => f.id === 'with_players',
		)!;
		expect(online.predicate(item())).toBe(true);
		expect(offline.predicate(item({ reachable: false }))).toBe(true);
		expect(withPlayers.predicate(item({ players: [] }))).toBe(false);
	});
	it('stats aggregate totals', () => {
		const stats = minecraftLens.stats!([
			item(),
			item({
				id: 'lobby',
				name: 'lobby',
				online: 1,
				reachable: false,
				players: [],
			}),
		]);
		const byId = Object.fromEntries(stats.map((s) => [s.id, s.value]));
		expect(byId['total']).toBe(2);
		expect(byId['online']).toBe(1);
		expect(byId['players']).toBe(3);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `<TEST> src/dash/adapters/__tests__/minecraft.test.ts`
Expected: FAIL — lens shape mismatch (old lens expects host/motd fields; `searchText` won't contain the label).

- [ ] **Step 3: Rewrite `adapters/minecraft.tsx`**

Replace the entire file:

```tsx
import { StyleSheet, View } from 'react-native';
import { Badge, Stack, Surface, Text, tokens } from '../_ui';
import type { StreamLens, StreamStore } from '../types';
import { createMcStream } from '../mc/mcStream';
import type { McServerItem, McStreamOptions } from '../mc/mcStream';
import { serverMeta } from '../mc/labels';

export function createMinecraftStream(
	opts: McStreamOptions = {},
): StreamStore<McServerItem> {
	return createMcStream(opts);
}

function dotColor(reachable: boolean): string {
	return reachable ? tokens.color.success : tokens.color.textFaint;
}

export const minecraftLens: StreamLens<McServerItem> = {
	searchText: (it) =>
		`${it.name} ${serverMeta(it.name).label} ${it.players
			.map((p) => p.name)
			.join(' ')}`,
	group: (it) => (it.reachable ? 'Online' : 'Unreachable'),
	filters: [
		{
			id: 'online',
			label: 'Online',
			tone: 'success',
			predicate: (it) => it.reachable,
		},
		{
			id: 'offline',
			label: 'Unreachable',
			tone: 'neutral',
			predicate: (it) => !it.reachable,
		},
		{
			id: 'with_players',
			label: 'With Players',
			tone: 'success',
			predicate: (it) => it.players.length > 0,
		},
	],
	stats: (items) => [
		{ id: 'total', label: 'Servers', value: items.length },
		{
			id: 'online',
			label: 'Online',
			tone: 'success',
			value: items.filter((i) => i.reachable).length,
		},
		{
			id: 'players',
			label: 'Players',
			tone: 'success',
			value: items.reduce((sum, i) => sum + i.online, 0),
		},
	],
	row: (it) => (
		<Surface padded={false} style={styles.row}>
			<View
				style={[
					styles.dot,
					{ backgroundColor: dotColor(it.reachable) },
				]}
			/>
			<Stack gap="xs" style={styles.rowContent}>
				<Stack direction="row" align="center" gap="xs" wrap>
					<Text variant="label" numberOfLines={1} style={styles.name}>
						{serverMeta(it.name).label}
					</Text>
					<Badge
						label={it.reachable ? 'ONLINE' : 'UNREACHABLE'}
						tone={it.reachable ? 'success' : 'neutral'}
					/>
					<Badge label={`${it.online}/${it.max}`} tone="neutral" />
				</Stack>
				{it.players.length > 0 && (
					<Text variant="caption" tone="muted" numberOfLines={1}>
						{it.players.map((p) => p.name).join(', ')}
					</Text>
				)}
			</Stack>
		</Surface>
	),
	detail: (it) => (
		<Stack gap="xs">
			<Fact label="Server" value={it.name} />
			<Fact
				label="Status"
				value={it.reachable ? 'ONLINE' : 'UNREACHABLE'}
			/>
			<Fact label="Players" value={`${it.online} / ${it.max}`} />
			<Fact
				label="Cached"
				value={new Date(it.cachedAt * 1000).toLocaleTimeString()}
			/>
		</Stack>
	),
};

function Fact({ label, value }: { label: string; value: string }) {
	return (
		<Stack direction="row" gap="sm" justify="space-between">
			<Text variant="caption" tone="muted">
				{label}
			</Text>
			<Text variant="caption" numberOfLines={1} style={styles.factValue}>
				{value}
			</Text>
		</Stack>
	);
}

const styles = StyleSheet.create({
	row: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: tokens.space.sm,
		paddingHorizontal: tokens.space.md,
		paddingVertical: tokens.space.sm,
	},
	rowContent: { flexShrink: 1, flexGrow: 1 },
	dot: { width: 10, height: 10, borderRadius: 5, flexShrink: 0 },
	name: { flexShrink: 1 },
	factValue: { flexShrink: 1, textAlign: 'right' },
});
```

Note `cachedAt` is unix seconds from the backend — multiply by 1000 for `Date`.

- [ ] **Step 4: Run test to verify it passes**

Run: `<TEST> src/dash/adapters/__tests__/minecraft.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Check nothing else consumed the deleted types**

```bash
rg -l 'MinecraftServerItem|MinecraftStreamOptions|ServerStatus' packages/npm/rn/src apps/kbve/astro-kbve/src
```

Expected: only `adapters/minecraft.tsx` history (no remaining references). `ReactMinecraftDashRN.tsx` passes `{ getToken, baseUrl }` — extra `getToken` prop is now unused but still type-compatible only if `McStreamOptions` ignores it; it does NOT. That call site is rewritten in Task 6; compile is checked there.

- [ ] **Step 6: Commit**

```bash
git add packages/npm/rn/src/dash/adapters/minecraft.tsx packages/npm/rn/src/dash/adapters/__tests__/minecraft.test.ts
git commit -m "fix(rn-dash): minecraft adapter reads /api/v1/mc/players instead of nonexistent status route"
```

---

### Task 5: Console + cards + view — `RconConsole.tsx`, `ServerCard.tsx`, `McView.tsx`, `mc/index.ts`, barrel

**Files:**

- Create: `packages/npm/rn/src/dash/mc/RconConsole.tsx`
- Create: `packages/npm/rn/src/dash/mc/ServerCard.tsx`
- Create: `packages/npm/rn/src/dash/mc/McView.tsx`
- Create: `packages/npm/rn/src/dash/mc/index.ts`
- Modify: `packages/npm/rn/src/dash/index.ts` (add named mc re-export line)
- Test: `packages/npm/rn/src/dash/mc/__tests__/consoleLog.test.ts`

**Interfaces:**

- Consumes: `commandsForServer`, `CommandDef`, `Tier` (Task 1); `serverMeta` (Task 1); `createMcStream`, `McServerItem` (Task 2); `createRconExec`, `RconExecFn`, `RconExecResponse` (Task 3); `minecraftLens` stats via direct computation; `useStream`, `useStreamLifecycle` from `../useStream`; `Select` from `../_ui`; `Button` from `../../ui/primitives/Button`; `formatAgo` from `../shared`.
- Produces: `McView(props: { getToken: () => Promise<string | null>; baseUrl?: string })`; `ServerCard(props: { item: McServerItem; exec: RconExecFn })`; `RconConsole(props: { server: string; exec: RconExecFn })`; pure helper `appendLog(log: LogEntry[], entry: Omit<LogEntry, 'id'>): LogEntry[]` (id assigned internally, cap 50, newest first) exported for tests, with `interface LogEntry { id: number; ts: number; command: string; args: string[]; ok: boolean; output: string; error?: string; latency_ms: number }`; `confirmDestructive(message: string): Promise<boolean>` exported for tests (web → `window.confirm`, native → `Alert.alert` two-button promise).

- [ ] **Step 1: Write the failing helper test**

`packages/npm/rn/src/dash/mc/__tests__/consoleLog.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { appendLog } from '../RconConsole';

const entry = (n: number) => ({
	ts: n,
	command: 'list',
	args: [] as string[],
	ok: true,
	output: `out${n}`,
	latency_ms: 5,
});

describe('appendLog', () => {
	it('prepends newest first with increasing ids', () => {
		let log = appendLog([], entry(1));
		log = appendLog(log, entry(2));
		expect(log[0].output).toBe('out2');
		expect(log[1].output).toBe('out1');
		expect(log[0].id).not.toBe(log[1].id);
	});
	it('caps at 50 entries', () => {
		let log: ReturnType<typeof appendLog> = [];
		for (let i = 0; i < 60; i++) log = appendLog(log, entry(i));
		expect(log).toHaveLength(50);
		expect(log[0].output).toBe('out59');
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `<TEST> src/dash/mc/__tests__/consoleLog.test.ts`
Expected: FAIL — cannot resolve `../RconConsole`.

- [ ] **Step 3: Implement `RconConsole.tsx`**

```tsx
import { useMemo, useState } from 'react';
import {
	Alert,
	Platform,
	Pressable,
	StyleSheet,
	TextInput,
	View,
} from 'react-native';
import { Badge, Select, Stack, Surface, Text, tokens } from '../_ui';
import { commandsForServer } from './commands';
import type { CommandDef, Tier } from './commands';
import type { RconExecFn } from './rconExec';

export interface LogEntry {
	id: number;
	ts: number;
	command: string;
	args: string[];
	ok: boolean;
	output: string;
	error?: string;
	latency_ms: number;
}

let entryId = 0;

export function appendLog(
	log: LogEntry[],
	entry: Omit<LogEntry, 'id'>,
): LogEntry[] {
	return [{ ...entry, id: ++entryId }, ...log].slice(0, 50);
}

export function confirmDestructive(message: string): Promise<boolean> {
	if (Platform.OS === 'web') {
		return Promise.resolve(
			typeof window !== 'undefined' ? window.confirm(message) : false,
		);
	}
	return new Promise((resolve) => {
		Alert.alert('Destructive command', message, [
			{ text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
			{ text: 'Run', style: 'destructive', onPress: () => resolve(true) },
		]);
	});
}

const TIERS: Tier[] = ['read', 'write', 'destructive'];
const TIER_LABEL: Record<Tier, string> = {
	read: 'Read',
	write: 'Write',
	destructive: 'Destructive',
};

export function RconConsole({
	server,
	exec,
}: {
	server: string;
	exec: RconExecFn;
}) {
	const commands = useMemo(() => commandsForServer(server), [server]);
	const [tier, setTier] = useState<Tier>('read');
	const visible = useMemo(
		() => commands.filter((c) => c.tier === tier),
		[commands, tier],
	);
	const [selectedName, setSelectedName] = useState('');
	const selected: CommandDef | undefined =
		visible.find((c) => c.name === selectedName) ?? visible[0];
	const [args, setArgs] = useState<string[]>([]);
	const [pending, setPending] = useState(false);
	const [log, setLog] = useState<LogEntry[]>([]);

	const pickTier = (next: Tier) => {
		setTier(next);
		setSelectedName('');
		setArgs([]);
	};

	const updateArg = (index: number, value: string) => {
		setArgs((prev) => {
			const next = prev.slice();
			while (next.length <= index) next.push('');
			next[index] = value;
			return next;
		});
	};

	const run = async () => {
		if (!selected || pending) return;
		const fullArgs = selected.args.map((_, i) => args[i] ?? '');
		if (selected.tier === 'destructive') {
			const summary = [selected.label, ...fullArgs.filter(Boolean)].join(
				' ',
			);
			const ok = await confirmDestructive(`Run ${summary} on ${server}?`);
			if (!ok) return;
		}
		setPending(true);
		const ts = Date.now();
		const res = await exec(server, {
			command: selected.name,
			args: fullArgs,
		});
		setLog((prev) =>
			appendLog(prev, {
				ts,
				command: selected.name,
				args: fullArgs,
				ok: res.ok,
				output: res.output,
				error: res.error,
				latency_ms: res.latency_ms,
			}),
		);
		setPending(false);
	};

	return (
		<Surface style={styles.root}>
			<Stack gap="sm">
				<Text variant="caption" tone="muted">
					RCON · {server}
				</Text>
				<Stack direction="row" gap="xs">
					{TIERS.map((t) =>
						commands.some((c) => c.tier === t) ? (
							<Pressable
								key={t}
								onPress={() => pickTier(t)}
								style={[
									styles.tab,
									tier === t && styles.tabActive,
								]}>
								<Text
									variant="caption"
									tone={tier === t ? undefined : 'muted'}>
									{TIER_LABEL[t]}
								</Text>
							</Pressable>
						) : null,
					)}
				</Stack>
				<Select
					value={selected?.name ?? ''}
					options={visible.map((c) => ({
						label: `${c.label} (${c.name})`,
						value: c.name,
					}))}
					placeholder="command"
					onValueChange={(name) => {
						setSelectedName(name);
						setArgs([]);
					}}
				/>
				{selected && (
					<Text variant="caption" tone="faint">
						{selected.description}
					</Text>
				)}
				{selected?.args.map((arg, i) => (
					<View key={`${selected.name}:${i}`} style={styles.argRow}>
						<Text variant="caption" tone="muted">
							{arg.label}
						</Text>
						<TextInput
							style={styles.input}
							placeholder={arg.placeholder}
							placeholderTextColor={tokens.color.textFaint}
							value={args[i] ?? ''}
							onChangeText={(v) => updateArg(i, v)}
						/>
					</View>
				))}
				<Stack direction="row" gap="sm" align="center">
					<Pressable
						onPress={run}
						disabled={pending || !selected}
						style={[
							styles.runBtn,
							(pending || !selected) && styles.runBtnDisabled,
						]}>
						<Text variant="caption">
							{pending
								? 'Running…'
								: `Run ${selected?.label ?? ''}`}
						</Text>
					</Pressable>
					{log.length > 0 && (
						<Pressable onPress={() => setLog([])}>
							<Text variant="caption" tone="faint">
								Clear log
							</Text>
						</Pressable>
					)}
				</Stack>
				<Stack gap="xs" style={styles.log}>
					{log.length === 0 ? (
						<Text variant="caption" tone="faint">
							No commands run yet.
						</Text>
					) : (
						log.map((entry) => (
							<View key={entry.id} style={styles.logEntry}>
								<Stack
									direction="row"
									justify="space-between"
									gap="sm">
									<Text variant="caption" tone="muted">
										{new Date(
											entry.ts,
										).toLocaleTimeString()}{' '}
										· {entry.command}
									</Text>
									<Badge
										label={
											entry.ok
												? `${entry.latency_ms}ms`
												: 'failed'
										}
										tone={entry.ok ? 'success' : 'danger'}
									/>
								</Stack>
								<Text
									variant="caption"
									tone={entry.ok ? undefined : 'muted'}>
									{entry.ok
										? entry.output || '(empty)'
										: (entry.error ?? 'failed')}
								</Text>
							</View>
						))
					)}
				</Stack>
			</Stack>
		</Surface>
	);
}

const styles = StyleSheet.create({
	root: { padding: tokens.space.md },
	tab: {
		paddingVertical: tokens.space.xs,
		paddingHorizontal: tokens.space.sm,
		borderRadius: tokens.radius.sm,
		borderWidth: 1,
		borderColor: tokens.color.border,
	},
	tabActive: {
		backgroundColor: tokens.color.surfaceAlt,
		borderColor: tokens.color.primary,
	},
	argRow: { gap: 4 },
	input: {
		borderWidth: 1,
		borderColor: tokens.color.border,
		borderRadius: tokens.radius.sm,
		paddingHorizontal: tokens.space.sm,
		paddingVertical: tokens.space.xs,
		color: tokens.color.text,
	},
	runBtn: {
		paddingVertical: tokens.space.xs,
		paddingHorizontal: tokens.space.md,
		borderRadius: tokens.radius.sm,
		borderWidth: 1,
		borderColor: tokens.color.primary,
	},
	runBtnDisabled: { opacity: 0.5 },
	log: { maxHeight: 280, overflow: 'hidden' },
	logEntry: {
		borderLeftWidth: 2,
		borderLeftColor: tokens.color.border,
		paddingLeft: tokens.space.sm,
		gap: 2,
	},
});
```

Adjust `tokens.color.*` / `tokens.radius.*` names to the real theme file (`packages/npm/rn/src/ui/theme.ts`) — read it first; if e.g. `surfaceAlt` or `danger` tone don't exist, use the nearest existing token (check `BadgeTone` union in `ui/primitives/Badge.tsx`).

- [ ] **Step 4: Run helper test to verify it passes**

Run: `<TEST> src/dash/mc/__tests__/consoleLog.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Implement `ServerCard.tsx`**

```tsx
import { StyleSheet, View } from 'react-native';
import { Badge, Stack, Surface, Text, tokens } from '../_ui';
import { serverMeta } from './labels';
import type { McServerItem } from './mcStream';
import type { RconExecFn } from './rconExec';
import { RconConsole } from './RconConsole';

export function ServerCard({
	item,
	exec,
}: {
	item: McServerItem;
	exec: RconExecFn;
}) {
	const meta = serverMeta(item.name);
	const showPlayers = item.name !== 'velocity';
	return (
		<Surface style={styles.card}>
			<Stack gap="sm">
				<Stack
					direction="row"
					justify="space-between"
					align="center"
					gap="sm">
					<Stack gap="xs" style={styles.title}>
						<Text variant="label">{meta.label}</Text>
						{meta.role ? (
							<Text variant="caption" tone="muted">
								{meta.role}
							</Text>
						) : null}
					</Stack>
					<Badge
						label={item.reachable ? 'online' : 'unreachable'}
						tone={item.reachable ? 'success' : 'neutral'}
					/>
				</Stack>
				<Stack direction="row" gap="sm">
					<View style={styles.metric}>
						<Text variant="caption" tone="muted">
							ONLINE
						</Text>
						<Text variant="label">
							{item.online} / {item.max}
						</Text>
					</View>
					<View style={styles.metric}>
						<Text variant="caption" tone="muted">
							ENDPOINT
						</Text>
						<Text variant="label">
							RCON_MC_{item.name.toUpperCase()}
						</Text>
					</View>
				</Stack>
				{showPlayers && (
					<Stack gap="xs">
						<Text variant="caption" tone="muted">
							Players ({item.players.length})
						</Text>
						{item.players.length === 0 ? (
							<Text variant="caption" tone="faint">
								No players online.
							</Text>
						) : (
							<Stack direction="row" gap="xs" wrap>
								{item.players.map((p) => (
									<Badge
										key={p.uuid ?? p.name}
										label={p.name}
										tone="primary"
									/>
								))}
							</Stack>
						)}
					</Stack>
				)}
				<RconConsole server={item.name} exec={exec} />
			</Stack>
		</Surface>
	);
}

const styles = StyleSheet.create({
	card: { padding: tokens.space.md },
	title: { flexShrink: 1 },
	metric: {
		flex: 1,
		borderWidth: 1,
		borderColor: tokens.color.border,
		borderRadius: tokens.radius.sm,
		padding: tokens.space.sm,
		gap: 2,
	},
});
```

(Same token caveat as Step 3. `Badge` tone `primary` exists — HomeView uses it.)

- [ ] **Step 6: Implement `McView.tsx`**

```tsx
import { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Stack, Text, tokens } from '../_ui';
import { StatGrid } from '../StatGrid';
import { formatAgo } from '../shared';
import { useStream, useStreamLifecycle } from '../useStream';
import { createMcStream } from './mcStream';
import { createRconExec } from './rconExec';
import { ServerCard } from './ServerCard';

export interface McViewProps {
	getToken: () => Promise<string | null>;
	baseUrl?: string;
}

export function McView({ getToken, baseUrl = '' }: McViewProps) {
	const store = useMemo(() => createMcStream({ baseUrl }), [baseUrl]);
	const exec = useMemo(
		() => createRconExec({ getToken, baseUrl }),
		[getToken, baseUrl],
	);
	useStreamLifecycle(store);
	const state = useStream(store);

	const stats = [
		{ id: 'servers', label: 'Servers', value: state.items.length },
		{
			id: 'online',
			label: 'Online',
			tone: 'success' as const,
			value: state.items.filter((i) => i.reachable).length,
		},
		{
			id: 'players',
			label: 'Players',
			tone: 'success' as const,
			value: state.items.reduce((sum, i) => sum + i.online, 0),
		},
	];

	return (
		<Stack gap="md">
			<Stack direction="row" justify="space-between" align="center">
				<Text variant="subtitle">Minecraft Gameops</Text>
				<Pressable onPress={() => void store.refresh()}>
					<Text variant="caption" tone="muted">
						{state.lastUpdated
							? `updated ${formatAgo(new Date(state.lastUpdated))}`
							: 'refresh'}
					</Text>
				</Pressable>
			</Stack>
			{state.error && state.items.length === 0 ? (
				<Text variant="caption" tone="muted">
					MC status unavailable — {state.error}
				</Text>
			) : (
				<>
					<StatGrid stats={stats} />
					<View style={styles.grid}>
						{state.items.map((item) => (
							<View key={item.id} style={styles.cell}>
								<ServerCard item={item} exec={exec} />
							</View>
						))}
					</View>
				</>
			)}
		</Stack>
	);
}

const styles = StyleSheet.create({
	grid: {
		flexDirection: 'row',
		flexWrap: 'wrap',
		gap: tokens.space.md,
	},
	cell: { flexGrow: 1, flexBasis: 340, maxWidth: '100%' },
});
```

Read `StatGrid.tsx` first for its actual prop name/shape (`stats` vs `items`) and adjust. Read `shared.tsx` `formatAgo` signature (`string | Date`) — pass accordingly.

- [ ] **Step 7: Barrels**

`packages/npm/rn/src/dash/mc/index.ts`:

```ts
export { McView } from './McView';
export type { McViewProps } from './McView';
export { ServerCard } from './ServerCard';
export { RconConsole, appendLog, confirmDestructive } from './RconConsole';
export type { LogEntry } from './RconConsole';
export { createMcStream, mapPlayerList } from './mcStream';
export type {
	McPlayer,
	McServerItem,
	McStreamOptions,
	RawMcPlayerList,
} from './mcStream';
export { createRconExec } from './rconExec';
export type { RconExecFn, RconExecRequest, RconExecResponse } from './rconExec';
export { MC_COMMANDS, commandsForServer } from './commands';
export type { CommandDef, Tier, Scope } from './commands';
export { serverMeta, MC_SERVER_ORDER } from './labels';
```

`packages/npm/rn/src/dash/index.ts` — append after the clickhouse line, NAMED (avoid TS2308 with `adapters/minecraft` re-exports):

```ts
export { McView, ServerCard, RconConsole, createRconExec } from './mc';
export type { McViewProps, RconExecFn } from './mc';
```

(`createMcStream`, `McServerItem` etc. are NOT re-exported here — `adapters/minecraft` already exports `createMinecraftStream` and the types flow through it; deep import `@kbve/rn/dash/mc` remains available. If tsc still reports TS2308 on any name, drop that name from the dash barrel and keep it only in `./mc`.)

- [ ] **Step 8: Typecheck + full package test**

```bash
cd <worktree> && /Users/alappatel/Documents/GitHub/kbve/node_modules/.bin/tsc -p packages/npm/rn/tsconfig.json --noEmit
```

(Adjust to the package's actual tsconfig name — check `packages/npm/rn/` root; if the project uses `nx lint`/`nx typecheck` targets, use those from the main checkout binary.)
Then run: `<TEST> src/dash/mc src/dash/adapters/__tests__/minecraft.test.ts`
Expected: all mc + minecraft tests PASS.

- [ ] **Step 9: Commit**

```bash
git add packages/npm/rn/src/dash/mc packages/npm/rn/src/dash/index.ts
git commit -m "feat(rn-dash): mc composition — McView, ServerCard, cross-platform RconConsole"
```

---

### Task 6: astro-kbve bridge — staff gate + legacy deletion

**Files:**

- Modify: `apps/kbve/astro-kbve/src/components/rnweb/ReactMinecraftDashRN.tsx`
- Delete: `apps/kbve/astro-kbve/src/components/dashboard/ReactMcDashboard.tsx`
- Delete: `apps/kbve/astro-kbve/src/components/dashboard/mc/ServerCard.tsx`
- Delete: `apps/kbve/astro-kbve/src/components/dashboard/mc/RconConsole.tsx`
- Delete: `apps/kbve/astro-kbve/src/components/dashboard/mc/commands.ts`

**Interfaces:**

- Consumes: `McView` from `@kbve/rn/dash`; `homeService.$isStaff` from `@/components/dashboard/homeService`; `initSupa`/`getSupa` from `@/lib/supa`; `DASH_PROXY_BASE` from `./dashProxyBase`.

- [ ] **Step 1: Verify legacy usage graph before deleting**

```bash
rg -l 'ReactMcDashboard|dashboard/mc/|rcon-client' apps/kbve/astro-kbve/src
```

Expected consumers: only the files being deleted/modified. `lib/rcon-client.ts` — check other importers (`rg "from '@/lib/rcon-client'"`); Factorio or others may use `execRcon` — if so KEEP `rcon-client.ts`, delete nothing there (it is not in the delete list). If `ReactMcDashboard` is imported by any page other than via `AstroMcDashboard.astro`, stop and reassess.

- [ ] **Step 2: Rewrite `ReactMinecraftDashRN.tsx`**

```tsx
import { useMemo } from 'react';
import { useStore } from '@nanostores/react';
import { ShieldOff } from 'lucide-react';
import { McView } from '@kbve/rn/dash';
import { homeService } from '@/components/dashboard/homeService';
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

const styles = {
	centered: {
		display: 'flex',
		flexDirection: 'column' as const,
		alignItems: 'center',
		justifyContent: 'center',
		gap: '1rem',
		minHeight: '40vh',
		textAlign: 'center' as const,
	},
	heading: {
		margin: 0,
		fontSize: '1.75rem',
		color: 'var(--sl-color-text, #e6edf3)',
	},
	sub: {
		margin: 0,
		color: 'var(--sl-color-gray-3, #8b949e)',
		maxWidth: '40rem',
	},
};

export default function ReactMinecraftDashRN() {
	const isStaff = useStore(homeService.$isStaff);
	const token = useMemo(() => getToken, []);

	if (!isStaff) {
		return (
			<div style={styles.centered}>
				<ShieldOff size={48} color="var(--sl-color-gray-3)" />
				<h2 style={styles.heading}>Staff Access Required</h2>
				<p style={styles.sub}>
					The Minecraft control panel is restricted to KBVE staff.
				</p>
			</div>
		);
	}

	return <McView getToken={token} baseUrl={DASH_PROXY_BASE} />;
}
```

First verify `homeService.$isStaff` exists with that name (`rg '\$isStaff' apps/kbve/astro-kbve/src/components/dashboard/homeService.ts`) — copy the exact accessor `ReactMcDashboard.tsx` used.

- [ ] **Step 3: Delete legacy files**

```bash
git rm apps/kbve/astro-kbve/src/components/dashboard/ReactMcDashboard.tsx apps/kbve/astro-kbve/src/components/dashboard/mc/ServerCard.tsx apps/kbve/astro-kbve/src/components/dashboard/mc/RconConsole.tsx apps/kbve/astro-kbve/src/components/dashboard/mc/commands.ts
```

If Step 1 showed `rcon-client.ts` has no remaining importers after these deletions, also `git rm apps/kbve/astro-kbve/src/lib/rcon-client.ts`; otherwise keep it.

- [ ] **Step 4: Build astro-kbve to verify**

From the main checkout binary against worktree cwd (worktree has no node_modules):

```bash
cd <worktree> && /Users/alappatel/Documents/GitHub/kbve/node_modules/.bin/nx run kbve:check --skip-nx-cache
```

(Use the project's actual check/build target — `nx show project kbve` to list targets; astro check target per repo convention. Expected: no unresolved imports, no type errors.)

- [ ] **Step 5: Commit**

```bash
git add -A apps/kbve/astro-kbve/src/components
git commit -m "feat(astro-kbve): mount rn McView with staff gate; remove legacy mc dashboard components"
```

---

### Task 7: Native McScreen + HomeView entry

**Files:**

- Create: `packages/npm/rn/src/screens/McScreen.tsx`
- Modify: `packages/npm/rn/src/screens/HomeView.tsx`

**Interfaces:**

- Consumes: `McView` from `../dash/mc`; `useKbve` from `../auth/KbveProvider` (same as `ClickHouseScreen`).

- [ ] **Step 1: Create `McScreen.tsx`**

```tsx
import { useCallback } from 'react';
import { useKbve } from '../auth/KbveProvider';
import { McView } from '../dash/mc';

export function McScreen() {
	const { client } = useKbve();
	const getToken = useCallback(async () => {
		const { data } = await client.auth.getSession();
		return data.session?.access_token ?? null;
	}, [client]);

	return <McView getToken={getToken} baseUrl="https://kbve.com" />;
}
```

- [ ] **Step 2: Wire into `HomeView.tsx`**

Mirror the ClickHouse pattern exactly:

- `import { McScreen } from './McScreen';`
- `const [showMc, setShowMc] = useState(false);`
- A full-screen branch above the main return, identical structure to the `showClickHouse` branch (`packages/npm/rn/src/screens/HomeView.tsx:110-132`) with title `Minecraft · GameOps`, `onPress={() => setShowMc(false)}`, body `<McScreen />`.
- Staff-gated launcher button next to the ClickHouse one:

```tsx
{
	staff.isStaff ? (
		<Button
			title="⛏  Minecraft Dashboard"
			variant="secondary"
			onPress={() => setShowMc(true)}
		/>
	) : null;
}
```

- [ ] **Step 3: Typecheck**

```bash
cd <worktree> && /Users/alappatel/Documents/GitHub/kbve/node_modules/.bin/tsc -p packages/npm/rn/tsconfig.json --noEmit
```

Expected: clean (same target as Task 5 Step 8).

- [ ] **Step 4: Commit**

```bash
git add packages/npm/rn/src/screens/McScreen.tsx packages/npm/rn/src/screens/HomeView.tsx
git commit -m "feat(rn): native McScreen reachable from HomeView"
```

---

### Task 8: Full verification + PR

**Files:** none

- [ ] **Step 1: Full rn test suite**

```bash
cd <worktree> && /Users/alappatel/Documents/GitHub/kbve/node_modules/.bin/nx test rn --skip-nx-cache
```

Expected: PASS including pre-existing suites.

- [ ] **Step 2: astro-kbve check/build**

```bash
cd <worktree> && /Users/alappatel/Documents/GitHub/kbve/node_modules/.bin/nx run kbve:check --skip-nx-cache
```

Expected: PASS.

- [ ] **Step 3: Verify end-to-end shape (superpowers:verification-before-completion)**

Grep-level sanity: no remaining references to the dead endpoint or deleted components:

```bash
rg 'rcon/mc/.*/status|ReactMcDashboard|dashboard/mc/' packages/npm/rn/src apps/kbve/astro-kbve/src
```

Expected: no hits (exec route `rcon/mc/${server}/exec` is fine and will match nothing here).

- [ ] **Step 4: Push branch + PR to `dev`**

```bash
git push -u origin feat/rn-dash-mc-parity
gh pr create --base dev --title "feat(rn-dash): migrate GameOps MC dashboard to @kbve/rn with RCON console" --body "$(cat <<'EOF'
## Summary
- Fix all-servers-offline: minecraft adapter polled nonexistent GET /api/v1/rcon/mc/{server}/status; now reads GET /api/v1/mc/players (single cached endpoint, backend list = source of truth, no hardcoded worldedit)
- New dash/mc composition in @kbve/rn: McView + ServerCard grid + cross-platform tiered RconConsole (POST /api/v1/rcon/mc/{server}/exec)
- astro-kbve mounts McView behind the existing staff gate; legacy ReactMcDashboard + dashboard/mc components removed
- Native McScreen wired into HomeView (staff-gated), ClickHouseScreen pattern

## Testing
- vitest: mc commands/labels, mapPlayerList join+order, rconExec response parsing, console log helper, minecraft lens
- nx test rn + astro-kbve check clean
EOF
)"
```

(No Claude/co-author trailers per repo preference.)

- [ ] **Step 5: Follow superpowers:finishing-a-development-branch**

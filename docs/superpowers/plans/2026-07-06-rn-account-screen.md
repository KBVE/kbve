# RN AccountScreen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build one `@kbve/rn` AccountScreen (profile + storage/device/health settings) that renders on both web (react-native-web Astro island) and mobile (Expo), replacing the web-only Astro account page.

**Architecture:** Universal UI shell in `packages/npm/rn/src/account/`. Platform-specific data (storage/device/health) lives behind three data hooks, each split by file extension (`.web.ts` = browser APIs, `.ts` = native). UI sections consume plain serializable models and never touch platform APIs. Web mounts via the existing `rnweb/ReactX.tsx → AstroX.astro → mdx` bridge chain.

**Tech Stack:** React Native + react-native-web, TypeScript, Vitest (jsdom), Astro islands, existing `@kbve/rn` UI kit (Screen/Surface/Stack/Text/Badge/Button/Avatar/Skeleton/MenuList + `dash/StatGrid`) and `useAuth`/`useAuthActions`/`useStaff`.

## Global Constraints

- No code comments anywhere (repo style — `feedback_no_comments_at_all`).
- Do NOT touch `RN_PACKAGE_VERSION` / any `.version` / package versions.
- UI sections import ONLY from `../ui/*` and `../dash/*`; they must never reference `navigator`, `localStorage`, `AsyncStorage`, `Platform`, or `expo-*` directly — only via a data hook.
- Add NO new npm dependencies. Native device hook uses `react-native` built-ins (`Platform`, `Dimensions`) only; native storage uses already-installed `@react-native-async-storage/async-storage` (2.2.0).
- Each data hook file pair exports an identical public signature so `.web.ts` and `.ts` are interchangeable.
- Vitest resolves `.web.ts` before `.ts`, so unit tests exercise the web impls + shared pure helpers.
- Run tasks from the worktree root `.claude/worktrees/rn-account-screen`. Nx test command: `pnpm nx test rn`. Typecheck: `pnpm nx typecheck rn`. Lint: `pnpm nx lint rn`.

---

### Task 1: Types + storage data hook

**Files:**
- Create: `packages/npm/rn/src/account/types.ts`
- Create: `packages/npm/rn/src/account/storageMath.ts`
- Create: `packages/npm/rn/src/account/useStorageInfo.web.ts`
- Create: `packages/npm/rn/src/account/useStorageInfo.ts`
- Test: `packages/npm/rn/src/account/__tests__/storageMath.test.ts`

**Interfaces:**
- Produces:
  - `interface StorageInfo { usage: number; quota: number; percent: number; itemCount: number }`
  - `interface DeviceRow { label: string; value: string }`
  - `interface DeviceInfo { rows: DeviceRow[] }`
  - `type HealthStatus = 'ok' | 'unavailable' | 'checking' | 'error'`
  - `interface HealthCheck { label: string; status: HealthStatus; detail?: string }`
  - `interface DataHook<T> { loading: boolean; data: T | null; refresh: () => void }`
  - `interface StorageHook extends DataHook<StorageInfo> { clear: () => Promise<void> }`
  - `toStorageInfo(usage: number, quota: number, itemCount: number): StorageInfo`
  - `useStorageInfo(): StorageHook`

- [ ] **Step 1: Write the failing test**

Create `packages/npm/rn/src/account/__tests__/storageMath.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { toStorageInfo } from '../storageMath';

describe('toStorageInfo', () => {
	it('computes percent from usage/quota', () => {
		const info = toStorageInfo(50, 200, 7);
		expect(info).toEqual({ usage: 50, quota: 200, percent: 25, itemCount: 7 });
	});

	it('rounds percent to nearest integer', () => {
		expect(toStorageInfo(1, 3, 0).percent).toBe(33);
	});

	it('returns 0 percent when quota is 0', () => {
		expect(toStorageInfo(10, 0, 0).percent).toBe(0);
	});

	it('clamps percent to 100 max', () => {
		expect(toStorageInfo(300, 200, 0).percent).toBe(100);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm nx test rn`
Expected: FAIL — `Cannot find module '../storageMath'`.

- [ ] **Step 3: Write the types file**

Create `packages/npm/rn/src/account/types.ts`:

```ts
export interface StorageInfo {
	usage: number;
	quota: number;
	percent: number;
	itemCount: number;
}

export interface DeviceRow {
	label: string;
	value: string;
}

export interface DeviceInfo {
	rows: DeviceRow[];
}

export type HealthStatus = 'ok' | 'unavailable' | 'checking' | 'error';

export interface HealthCheck {
	label: string;
	status: HealthStatus;
	detail?: string;
}

export interface DataHook<T> {
	loading: boolean;
	data: T | null;
	refresh: () => void;
}

export interface StorageHook extends DataHook<StorageInfo> {
	clear: () => Promise<void>;
}
```

- [ ] **Step 4: Write the pure helper**

Create `packages/npm/rn/src/account/storageMath.ts`:

```ts
import type { StorageInfo } from './types';

export function toStorageInfo(
	usage: number,
	quota: number,
	itemCount: number,
): StorageInfo {
	const raw = quota > 0 ? (usage / quota) * 100 : 0;
	const percent = Math.min(100, Math.round(raw));
	return { usage, quota, percent, itemCount };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm nx test rn`
Expected: PASS (4 storageMath assertions).

- [ ] **Step 6: Write the web storage hook**

Create `packages/npm/rn/src/account/useStorageInfo.web.ts`:

```ts
import { useCallback, useEffect, useState } from 'react';
import type { StorageHook, StorageInfo } from './types';
import { toStorageInfo } from './storageMath';

async function read(): Promise<StorageInfo> {
	let itemCount = 0;
	try {
		itemCount = localStorage.length;
	} catch {
		itemCount = 0;
	}
	let usage = 0;
	let quota = 0;
	try {
		if (navigator.storage?.estimate) {
			const est = await navigator.storage.estimate();
			usage = est.usage ?? 0;
			quota = est.quota ?? 0;
		}
	} catch {
		usage = 0;
		quota = 0;
	}
	return toStorageInfo(usage, quota, itemCount);
}

export function useStorageInfo(): StorageHook {
	const [data, setData] = useState<StorageInfo | null>(null);
	const [loading, setLoading] = useState(true);

	const refresh = useCallback(() => {
		setLoading(true);
		void read().then((info) => {
			setData(info);
			setLoading(false);
		});
	}, []);

	useEffect(() => {
		refresh();
	}, [refresh]);

	const clear = useCallback(async () => {
		try {
			localStorage.clear();
		} catch {
			/* noop */
		}
		try {
			if (typeof caches !== 'undefined') {
				const keys = await caches.keys();
				await Promise.all(keys.map((k) => caches.delete(k)));
			}
		} catch {
			/* noop */
		}
		refresh();
	}, [refresh]);

	return { data, loading, refresh, clear };
}
```

Note: the two empty-catch `/* noop */` markers are placeholders for THIS PLAN's readability only — write the real files with empty catch blocks `catch {}` and NO comment (Global Constraint: no comments).

- [ ] **Step 7: Write the native storage hook**

Create `packages/npm/rn/src/account/useStorageInfo.ts`:

```ts
import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { StorageHook, StorageInfo } from './types';
import { toStorageInfo } from './storageMath';

async function read(): Promise<StorageInfo> {
	let itemCount = 0;
	let usage = 0;
	try {
		const keys = await AsyncStorage.getAllKeys();
		itemCount = keys.length;
		const entries = await AsyncStorage.multiGet(keys);
		for (const [key, value] of entries) {
			usage += key.length + (value ? value.length : 0);
		}
	} catch {}
	return toStorageInfo(usage, 0, itemCount);
}

export function useStorageInfo(): StorageHook {
	const [data, setData] = useState<StorageInfo | null>(null);
	const [loading, setLoading] = useState(true);

	const refresh = useCallback(() => {
		setLoading(true);
		void read().then((info) => {
			setData(info);
			setLoading(false);
		});
	}, []);

	useEffect(() => {
		refresh();
	}, [refresh]);

	const clear = useCallback(async () => {
		try {
			await AsyncStorage.clear();
		} catch {}
		refresh();
	}, [refresh]);

	return { data, loading, refresh, clear };
}
```

- [ ] **Step 8: Typecheck + commit**

Run: `pnpm nx typecheck rn` → Expected: PASS.

```bash
git add packages/npm/rn/src/account/types.ts packages/npm/rn/src/account/storageMath.ts packages/npm/rn/src/account/useStorageInfo.web.ts packages/npm/rn/src/account/useStorageInfo.ts packages/npm/rn/src/account/__tests__/storageMath.test.ts
git commit -m "feat(rn): account storage data hook + types"
```

---

### Task 2: Device data hook

**Files:**
- Create: `packages/npm/rn/src/account/deviceRows.ts`
- Create: `packages/npm/rn/src/account/useDeviceInfo.web.ts`
- Create: `packages/npm/rn/src/account/useDeviceInfo.ts`
- Test: `packages/npm/rn/src/account/__tests__/deviceRows.test.ts`

**Interfaces:**
- Consumes: `DeviceRow`, `DeviceInfo`, `DataHook` from `./types` (Task 1).
- Produces:
  - `interface WebNavLike { userAgent?: string; platform?: string; language?: string; hardwareConcurrency?: number; deviceMemory?: number; onLine?: boolean }`
  - `webDeviceRows(nav: WebNavLike): DeviceRow[]`
  - `useDeviceInfo(): DataHook<DeviceInfo>`

- [ ] **Step 1: Write the failing test**

Create `packages/npm/rn/src/account/__tests__/deviceRows.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { webDeviceRows } from '../deviceRows';

describe('webDeviceRows', () => {
	it('builds labelled rows from a navigator-like object', () => {
		const rows = webDeviceRows({
			userAgent: 'Mozilla/5.0 (Macintosh)',
			platform: 'MacIntel',
			language: 'en-US',
			hardwareConcurrency: 8,
			deviceMemory: 16,
			onLine: true,
		});
		const map = Object.fromEntries(rows.map((r) => [r.label, r.value]));
		expect(map['Platform']).toBe('MacIntel');
		expect(map['Language']).toBe('en-US');
		expect(map['CPU cores']).toBe('8');
		expect(map['Memory']).toBe('16 GB');
		expect(map['Network']).toBe('Online');
	});

	it('omits rows for missing fields and shows Offline', () => {
		const rows = webDeviceRows({ platform: 'Linux', onLine: false });
		const labels = rows.map((r) => r.label);
		expect(labels).not.toContain('CPU cores');
		expect(labels).not.toContain('Memory');
		const map = Object.fromEntries(rows.map((r) => [r.label, r.value]));
		expect(map['Network']).toBe('Offline');
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm nx test rn`
Expected: FAIL — `Cannot find module '../deviceRows'`.

- [ ] **Step 3: Write the pure helper**

Create `packages/npm/rn/src/account/deviceRows.ts`:

```ts
import type { DeviceRow } from './types';

export interface WebNavLike {
	userAgent?: string;
	platform?: string;
	language?: string;
	hardwareConcurrency?: number;
	deviceMemory?: number;
	onLine?: boolean;
}

export function webDeviceRows(nav: WebNavLike): DeviceRow[] {
	const rows: DeviceRow[] = [];
	if (nav.userAgent) {
		const browser = nav.userAgent.split(/[()]/)[1] ?? nav.userAgent.slice(0, 60);
		rows.push({ label: 'Browser', value: browser });
	}
	if (nav.platform) rows.push({ label: 'Platform', value: nav.platform });
	if (nav.language) rows.push({ label: 'Language', value: nav.language });
	if (typeof nav.hardwareConcurrency === 'number') {
		rows.push({ label: 'CPU cores', value: String(nav.hardwareConcurrency) });
	}
	if (typeof nav.deviceMemory === 'number') {
		rows.push({ label: 'Memory', value: `${nav.deviceMemory} GB` });
	}
	if (typeof nav.onLine === 'boolean') {
		rows.push({ label: 'Network', value: nav.onLine ? 'Online' : 'Offline' });
	}
	return rows;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm nx test rn`
Expected: PASS.

- [ ] **Step 5: Write the web device hook**

Create `packages/npm/rn/src/account/useDeviceInfo.web.ts`:

```ts
import { useCallback, useEffect, useState } from 'react';
import type { DataHook, DeviceInfo } from './types';
import { webDeviceRows } from './deviceRows';

export function useDeviceInfo(): DataHook<DeviceInfo> {
	const [data, setData] = useState<DeviceInfo | null>(null);
	const [loading, setLoading] = useState(true);

	const refresh = useCallback(() => {
		const nav = navigator as unknown as {
			userAgent?: string;
			platform?: string;
			language?: string;
			hardwareConcurrency?: number;
			deviceMemory?: number;
			onLine?: boolean;
		};
		setData({ rows: webDeviceRows(nav) });
		setLoading(false);
	}, []);

	useEffect(() => {
		refresh();
	}, [refresh]);

	return { data, loading, refresh };
}
```

- [ ] **Step 6: Write the native device hook**

Create `packages/npm/rn/src/account/useDeviceInfo.ts`:

```ts
import { useCallback, useEffect, useState } from 'react';
import { Dimensions, Platform } from 'react-native';
import type { DataHook, DeviceInfo, DeviceRow } from './types';

function nativeRows(): DeviceRow[] {
	const { width, height } = Dimensions.get('window');
	const rows: DeviceRow[] = [
		{ label: 'OS', value: `${Platform.OS} ${String(Platform.Version)}` },
		{ label: 'Screen', value: `${Math.round(width)}×${Math.round(height)}` },
	];
	return rows;
}

export function useDeviceInfo(): DataHook<DeviceInfo> {
	const [data, setData] = useState<DeviceInfo | null>(null);
	const [loading, setLoading] = useState(true);

	const refresh = useCallback(() => {
		setData({ rows: nativeRows() });
		setLoading(false);
	}, []);

	useEffect(() => {
		refresh();
	}, [refresh]);

	return { data, loading, refresh };
}
```

- [ ] **Step 7: Typecheck + commit**

Run: `pnpm nx typecheck rn` → Expected: PASS.

```bash
git add packages/npm/rn/src/account/deviceRows.ts packages/npm/rn/src/account/useDeviceInfo.web.ts packages/npm/rn/src/account/useDeviceInfo.ts packages/npm/rn/src/account/__tests__/deviceRows.test.ts
git commit -m "feat(rn): account device data hook"
```

---

### Task 3: Health data hook

**Files:**
- Create: `packages/npm/rn/src/account/healthChecks.ts`
- Create: `packages/npm/rn/src/account/useHealthInfo.web.ts`
- Create: `packages/npm/rn/src/account/useHealthInfo.ts`
- Test: `packages/npm/rn/src/account/__tests__/healthChecks.test.ts`

**Interfaces:**
- Consumes: `HealthCheck`, `HealthStatus`, `DataHook` from `./types` (Task 1).
- Produces:
  - `interface WebCaps { serviceWorker: boolean; storage: boolean; indexedDB: boolean; online: boolean }`
  - `evaluateHealthChecks(caps: WebCaps): HealthCheck[]`
  - `useHealthInfo(): DataHook<HealthCheck[]>`

- [ ] **Step 1: Write the failing test**

Create `packages/npm/rn/src/account/__tests__/healthChecks.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { evaluateHealthChecks } from '../healthChecks';

describe('evaluateHealthChecks', () => {
	it('reports ok for available capabilities', () => {
		const checks = evaluateHealthChecks({
			serviceWorker: true,
			storage: true,
			indexedDB: true,
			online: true,
		});
		const map = Object.fromEntries(checks.map((c) => [c.label, c.status]));
		expect(map['Service Worker']).toBe('ok');
		expect(map['Local Storage']).toBe('ok');
		expect(map['IndexedDB']).toBe('ok');
		expect(map['Network']).toBe('ok');
	});

	it('reports unavailable for missing capabilities and offline network', () => {
		const checks = evaluateHealthChecks({
			serviceWorker: false,
			storage: false,
			indexedDB: false,
			online: false,
		});
		const map = Object.fromEntries(checks.map((c) => [c.label, c.status]));
		expect(map['Service Worker']).toBe('unavailable');
		expect(map['Network']).toBe('error');
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm nx test rn`
Expected: FAIL — `Cannot find module '../healthChecks'`.

- [ ] **Step 3: Write the pure helper**

Create `packages/npm/rn/src/account/healthChecks.ts`:

```ts
import type { HealthCheck } from './types';

export interface WebCaps {
	serviceWorker: boolean;
	storage: boolean;
	indexedDB: boolean;
	online: boolean;
}

export function evaluateHealthChecks(caps: WebCaps): HealthCheck[] {
	return [
		{
			label: 'Service Worker',
			status: caps.serviceWorker ? 'ok' : 'unavailable',
		},
		{ label: 'Local Storage', status: caps.storage ? 'ok' : 'unavailable' },
		{ label: 'IndexedDB', status: caps.indexedDB ? 'ok' : 'unavailable' },
		{
			label: 'Network',
			status: caps.online ? 'ok' : 'error',
			detail: caps.online ? undefined : 'Offline',
		},
	];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm nx test rn`
Expected: PASS.

- [ ] **Step 5: Write the web health hook**

Create `packages/npm/rn/src/account/useHealthInfo.web.ts`:

```ts
import { useCallback, useEffect, useState } from 'react';
import type { DataHook, HealthCheck } from './types';
import { evaluateHealthChecks } from './healthChecks';

function probe(): HealthCheck[] {
	let storage = false;
	try {
		storage = typeof localStorage !== 'undefined';
	} catch {}
	return evaluateHealthChecks({
		serviceWorker: 'serviceWorker' in navigator,
		storage,
		indexedDB: typeof indexedDB !== 'undefined',
		online: navigator.onLine,
	});
}

export function useHealthInfo(): DataHook<HealthCheck[]> {
	const [data, setData] = useState<HealthCheck[] | null>(null);
	const [loading, setLoading] = useState(true);

	const refresh = useCallback(() => {
		setLoading(true);
		setData(probe());
		setLoading(false);
	}, []);

	useEffect(() => {
		refresh();
	}, [refresh]);

	return { data, loading, refresh };
}
```

- [ ] **Step 6: Write the native health hook (stub)**

Create `packages/npm/rn/src/account/useHealthInfo.ts`:

```ts
import { useCallback, useEffect, useState } from 'react';
import type { DataHook, HealthCheck } from './types';

function probe(): HealthCheck[] {
	return [
		{
			label: 'Native diagnostics',
			status: 'unavailable',
			detail: 'Coming soon',
		},
	];
}

export function useHealthInfo(): DataHook<HealthCheck[]> {
	const [data, setData] = useState<HealthCheck[] | null>(null);
	const [loading, setLoading] = useState(true);

	const refresh = useCallback(() => {
		setData(probe());
		setLoading(false);
	}, []);

	useEffect(() => {
		refresh();
	}, [refresh]);

	return { data, loading, refresh };
}
```

- [ ] **Step 7: Typecheck + commit**

Run: `pnpm nx typecheck rn` → Expected: PASS.

```bash
git add packages/npm/rn/src/account/healthChecks.ts packages/npm/rn/src/account/useHealthInfo.web.ts packages/npm/rn/src/account/useHealthInfo.ts packages/npm/rn/src/account/__tests__/healthChecks.test.ts
git commit -m "feat(rn): account health data hook"
```

---

### Task 4: UI sections + AccountScreen + barrels

**Files:**
- Create: `packages/npm/rn/src/account/ProfileHeader.tsx`
- Create: `packages/npm/rn/src/account/StorageSection.tsx`
- Create: `packages/npm/rn/src/account/DeviceSection.tsx`
- Create: `packages/npm/rn/src/account/HealthSection.tsx`
- Create: `packages/npm/rn/src/account/AccountScreen.tsx`
- Create: `packages/npm/rn/src/account/index.ts`
- Modify: `packages/npm/rn/src/index.ts` (add `export * from './account/AccountScreen';` after DashboardScreen line)
- Modify: `packages/npm/rn/src/index.web.ts` (same addition)
- Modify: `tsconfig.base.json` (add `@kbve/rn/account` path)

**Interfaces:**
- Consumes: `useStorageInfo` (Task 1), `useDeviceInfo` (Task 2), `useHealthInfo` (Task 3); `useAuth`/`useAuthActions` (`../auth/useAuth`), `useStaff` (`../auth/useStaff`); UI kit primitives; `StatGrid` + `StatModel` from `../dash`.
- Produces:
  - `ProfileHeader(): JSX.Element`
  - `StorageSection(): JSX.Element`
  - `DeviceSection(): JSX.Element`
  - `HealthSection(): JSX.Element`
  - `interface AccountScreenProps { onOpenUrl?: (url: string) => void }`
  - `AccountScreen(props: AccountScreenProps): JSX.Element`

- [ ] **Step 1: Write ProfileHeader**

Create `packages/npm/rn/src/account/ProfileHeader.tsx`:

```tsx
import { View, StyleSheet } from 'react-native';
import { Surface } from '../ui/primitives/Surface';
import { Stack } from '../ui/primitives/Stack';
import { Text } from '../ui/primitives/Text';
import { Badge } from '../ui/primitives/Badge';
import { Avatar } from '../ui/primitives/Avatar';
import { Skeleton } from '../ui/feedback/Skeleton';
import { tokens } from '../ui/theme';
import { useAuth } from '../auth/useAuth';
import { useStaff } from '../auth/useStaff';

export function ProfileHeader() {
	const auth = useAuth();
	const staff = useStaff();

	if (auth.loading) {
		return (
			<Surface>
				<Stack direction="row" gap="md" align="center">
					<Skeleton width={56} height={56} radius={28} />
					<Stack gap="xs" style={styles.grow}>
						<Skeleton width={140} height={18} />
						<Skeleton width={90} height={13} />
					</Stack>
				</Stack>
			</Surface>
		);
	}

	const username = auth.username ?? 'you';
	const email = auth.user?.email ?? undefined;

	return (
		<Surface>
			<Stack direction="row" gap="md" align="center">
				<Avatar name={username} size={56} />
				<Stack gap="xs" style={styles.grow}>
					<Stack direction="row" gap="sm" align="center" wrap>
						<Text variant="subtitle">@{username}</Text>
						{staff.isStaff ? <Badge tone="warning">Staff</Badge> : null}
					</Stack>
					{email ? (
						<Text variant="caption" tone="muted">
							{email}
						</Text>
					) : null}
				</Stack>
			</Stack>
		</Surface>
	);
}

const styles = StyleSheet.create({
	grow: { flexShrink: 1 },
});
```

Note: confirm `Badge` accepts a `tone` prop and children by reading `packages/npm/rn/src/ui/primitives/Badge.tsx` before writing; if the prop is named differently, match it. (BadgeTone type is referenced by `models.ts`.)

- [ ] **Step 2: Write StorageSection**

Create `packages/npm/rn/src/account/StorageSection.tsx`:

```tsx
import { Surface } from '../ui/primitives/Surface';
import { Stack } from '../ui/primitives/Stack';
import { Text } from '../ui/primitives/Text';
import { Button } from '../ui/primitives/Button';
import { StatGrid } from '../dash/StatGrid';
import type { StatModel } from '../dash/types';
import { useStorageInfo } from './useStorageInfo';

function formatBytes(n: number): string {
	if (n <= 0) return '0 B';
	const units = ['B', 'KB', 'MB', 'GB'];
	const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
	return `${(n / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export function StorageSection() {
	const { data, loading, clear } = useStorageInfo();

	const stats: StatModel[] = data
		? [
				{ id: 'usage', label: 'Used', value: formatBytes(data.usage) },
				{ id: 'quota', label: 'Quota', value: formatBytes(data.quota) },
				{ id: 'percent', label: 'Percent', value: `${data.percent}%` },
				{ id: 'items', label: 'Items', value: data.itemCount },
			]
		: [];

	return (
		<Surface>
			<Stack gap="md">
				<Text variant="label">Storage</Text>
				{loading ? <Text tone="muted">Loading…</Text> : <StatGrid stats={stats} />}
				<Button
					variant="danger"
					title="Clear local storage"
					onPress={() => void clear()}
				/>
			</Stack>
		</Surface>
	);
}
```

- [ ] **Step 3: Write DeviceSection**

Create `packages/npm/rn/src/account/DeviceSection.tsx`:

```tsx
import { View, StyleSheet } from 'react-native';
import { Surface } from '../ui/primitives/Surface';
import { Stack } from '../ui/primitives/Stack';
import { Text } from '../ui/primitives/Text';
import { tokens } from '../ui/theme';
import { useDeviceInfo } from './useDeviceInfo';

export function DeviceSection() {
	const { data, loading } = useDeviceInfo();

	return (
		<Surface>
			<Stack gap="md">
				<Text variant="label">Device</Text>
				{loading || !data ? (
					<Text tone="muted">Loading…</Text>
				) : (
					<Stack gap="sm">
						{data.rows.map((row) => (
							<View key={row.label} style={styles.row}>
								<Text tone="muted">{row.label}</Text>
								<Text>{row.value}</Text>
							</View>
						))}
					</Stack>
				)}
			</Stack>
		</Surface>
	);
}

const styles = StyleSheet.create({
	row: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		gap: tokens.space.md,
	},
});
```

- [ ] **Step 4: Write HealthSection**

Create `packages/npm/rn/src/account/HealthSection.tsx`:

```tsx
import { View, StyleSheet } from 'react-native';
import { Surface } from '../ui/primitives/Surface';
import { Stack } from '../ui/primitives/Stack';
import { Text } from '../ui/primitives/Text';
import { Button } from '../ui/primitives/Button';
import { tokens } from '../ui/theme';
import type { HealthStatus } from './types';
import { useHealthInfo } from './useHealthInfo';

const DOT: Record<HealthStatus, string> = {
	ok: tokens.color.success,
	unavailable: tokens.color.textFaint,
	checking: tokens.color.primary,
	error: tokens.color.danger,
};

export function HealthSection() {
	const { data, loading, refresh } = useHealthInfo();

	return (
		<Surface>
			<Stack gap="md">
				<Stack direction="row" justify="space-between" align="center">
					<Text variant="label">System Health</Text>
					<Button variant="ghost" title="Refresh" onPress={refresh} />
				</Stack>
				{loading || !data ? (
					<Text tone="muted">Checking…</Text>
				) : (
					<Stack gap="sm">
						{data.map((check) => (
							<View key={check.label} style={styles.row}>
								<Stack direction="row" gap="sm" align="center">
									<View
										style={[
											styles.dot,
											{ backgroundColor: DOT[check.status] },
										]}
									/>
									<Text tone="muted">{check.label}</Text>
								</Stack>
								<Text>{check.detail ?? check.status}</Text>
							</View>
						))}
					</Stack>
				)}
			</Stack>
		</Surface>
	);
}

const styles = StyleSheet.create({
	row: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'center',
		gap: tokens.space.md,
	},
	dot: { width: 8, height: 8, borderRadius: 4 },
});
```

- [ ] **Step 5: Write AccountScreen**

Create `packages/npm/rn/src/account/AccountScreen.tsx`:

```tsx
import { ScrollView, StyleSheet } from 'react-native';
import { Screen } from '../ui/primitives/Screen';
import { Stack } from '../ui/primitives/Stack';
import { MenuList } from '../ui/menus/MenuList';
import { tokens } from '../ui/theme';
import type { MenuSectionModel } from '../ui/models';
import { useAuth, useAuthActions } from '../auth/useAuth';
import { ProfileHeader } from './ProfileHeader';
import { StorageSection } from './StorageSection';
import { DeviceSection } from './DeviceSection';
import { HealthSection } from './HealthSection';

export interface AccountScreenProps {
	onOpenUrl?: (url: string) => void;
}

export function AccountScreen({ onOpenUrl }: AccountScreenProps) {
	const auth = useAuth();
	const actions = useAuthActions();
	const open = (url: string) => onOpenUrl?.(url);

	const username = auth.username ?? '';

	const menu: MenuSectionModel[] = [
		{
			id: 'account',
			title: 'Account',
			items: [
				{
					id: 'profile',
					label: 'View public profile',
					trailingText: username ? `@${username}` : undefined,
					onPress: () =>
						open(`https://kbve.com/${username ? `@${username}` : ''}`),
				},
				{
					id: 'legal',
					label: 'Legal & privacy',
					onPress: () => open('https://kbve.com/legal/'),
				},
				{
					id: 'signout',
					label: 'Sign out',
					destructive: true,
					onPress: () => actions.signOut(),
				},
			],
		},
	];

	return (
		<Screen padded={false}>
			<ScrollView contentContainerStyle={styles.content}>
				<Stack gap="lg">
					<ProfileHeader />
					<StorageSection />
					<DeviceSection />
					<HealthSection />
					<MenuList sections={menu} />
				</Stack>
			</ScrollView>
		</Screen>
	);
}

const styles = StyleSheet.create({
	content: {
		padding: tokens.space.xl,
		gap: tokens.space.lg,
	},
});
```

- [ ] **Step 6: Write the account barrel**

Create `packages/npm/rn/src/account/index.ts`:

```ts
export * from './types';
export * from './AccountScreen';
export * from './ProfileHeader';
export * from './StorageSection';
export * from './DeviceSection';
export * from './HealthSection';
```

- [ ] **Step 7: Wire into package barrels**

In `packages/npm/rn/src/index.ts`, add after `export * from './screens/DashboardScreen';`:

```ts
export * from './account/AccountScreen';
export * from './account/types';
```

In `packages/npm/rn/src/index.web.ts`, add after `export * from './screens/DashboardScreen';`:

```ts
export * from './account/AccountScreen';
export * from './account/types';
```

- [ ] **Step 8: Add tsconfig path**

In `tsconfig.base.json`, in `compilerOptions.paths`, next to the existing `"@kbve/rn/dash"` entry, add:

```json
"@kbve/rn/account": ["packages/npm/rn/src/account/index.ts"],
```

- [ ] **Step 9: Typecheck, lint, test, commit**

Run: `pnpm nx typecheck rn` → PASS
Run: `pnpm nx lint rn` → PASS (fix any no-comment / unused-import findings)
Run: `pnpm nx test rn` → PASS (all Task 1-3 tests still green)

```bash
git add packages/npm/rn/src/account tsconfig.base.json packages/npm/rn/src/index.ts packages/npm/rn/src/index.web.ts
git commit -m "feat(rn): AccountScreen shell + profile/storage/device/health sections"
```

---

### Task 5: Web island mount

**Files:**
- Create: `apps/kbve/astro-kbve/src/components/rnweb/ReactAccountRN.tsx`
- Create: `apps/kbve/astro-kbve/src/components/rnweb/AstroAccountRN.astro`
- Modify: `apps/kbve/astro-kbve/tsconfig.json` (add web `@kbve/rn/account` path)

**Interfaces:**
- Consumes: `AccountScreen` from `@kbve/rn/account`; `KbveProvider` (already used by other RN islands — confirm the exact provider wrapper other islands use by reading a sibling like `ReactRowsDashRN.tsx`).
- Produces: default-exported `ReactAccountRN` React component; `AstroAccountRN.astro` island wrapper.

- [ ] **Step 1: Add the web tsconfig path**

In `apps/kbve/astro-kbve/tsconfig.json`, next to `"@kbve/rn/dash"`, add:

```json
"@kbve/rn/account": ["../../../packages/npm/rn/src/account/index.ts"],
```

(The `.web.ts` data-hook variants resolve automatically via the Vite `resolveExtensions` already configured for RN-web islands; no separate web index needed — `AccountScreen` pulls no nav/vector-icons.)

- [ ] **Step 2: Inspect a sibling island for the provider pattern**

Read `apps/kbve/astro-kbve/src/components/rnweb/ReactRowsDashRN.tsx` and `RnWebDemo.tsx`. Determine whether islands wrap children in `KbveProvider` (AccountScreen calls `useAuth`/`useStaff`/`useAuthActions`, which require `KbveProvider`). If a shared provider wrapper exists, reuse it; otherwise wrap inline as in Step 3.

- [ ] **Step 3: Write the React island**

Create `apps/kbve/astro-kbve/src/components/rnweb/ReactAccountRN.tsx`:

```tsx
import { KbveProvider, AccountScreen } from '@kbve/rn';

export default function ReactAccountRN() {
	return (
		<KbveProvider>
			<AccountScreen
				onOpenUrl={(url) => {
					window.location.href = url;
				}}
			/>
		</KbveProvider>
	);
}
```

If Step 2 shows sibling islands import `KbveProvider` from a different specifier or receive config props (supabase url/anon key), match that exact usage instead. Do NOT invent new config — mirror the working siblings.

- [ ] **Step 4: Write the Astro wrapper**

Create `apps/kbve/astro-kbve/src/components/rnweb/AstroAccountRN.astro`:

```astro
---
import ReactAccountRN from './ReactAccountRN';
---

<ReactAccountRN client:only="react" />
```

- [ ] **Step 5: Typecheck + commit**

Run: `pnpm nx typecheck astro-kbve` → Expected: PASS (or same baseline as before the change — compare against a clean run if the app has pre-existing type noise).

```bash
git add apps/kbve/astro-kbve/src/components/rnweb/ReactAccountRN.tsx apps/kbve/astro-kbve/src/components/rnweb/AstroAccountRN.astro apps/kbve/astro-kbve/tsconfig.json
git commit -m "feat(astro-kbve): AccountScreen RN-web island"
```

---

### Task 6: Mount on the account page + web render-verify

**Files:**
- Modify: `apps/kbve/astro-kbve/src/content/docs/dashboard/account.mdx`

**Interfaces:**
- Consumes: `AstroAccountRN.astro` (Task 5), existing `AstroAuthGate.astro`.

- [ ] **Step 1: Swap the account page body**

Edit `apps/kbve/astro-kbve/src/content/docs/dashboard/account.mdx`. Keep the frontmatter and `<AstroAuthGate />`. Replace the `BentoAccount` import + usage with the RN island. Result body:

```mdx
import AstroAccountRN from '@/components/rnweb/AstroAccountRN.astro';
import AstroAuthGate from '@/components/auth/AstroAuthGate.astro';

<AstroAuthGate />

<AstroAccountRN />
```

(Leave `BentoAccount.astro` and the `ReactSettings*` components in the repo untouched — retire them in a follow-up only after render parity is confirmed.)

- [ ] **Step 2: Build the astro app**

Run: `pnpm nx build astro-kbve`
Expected: build succeeds, no bundler resolution error for `@kbve/rn/account` or the RN graph.

- [ ] **Step 3: Web render-verify with headless Playwright**

Serve the built site and load the account page in `chrome-headless-shell`, capturing `pageerror` + console. Confirm the AccountScreen renders (profile header + Storage/Device/Health cards) with zero page errors. (Per `project_rn_web_astro_bridge`: bundle-clean ≠ render-verified — a real headless load is required.) Note the account page is behind `AstroAuthGate`; verify against the signed-out gate state OR a seeded session, whichever the gate renders client-side.

Expected: no `pageerror`; account UI nodes present in the DOM.

- [ ] **Step 4: Commit**

```bash
git add apps/kbve/astro-kbve/src/content/docs/dashboard/account.mdx
git commit -m "feat(astro-kbve): mount RN AccountScreen on dashboard/account page"
```

---

## Self-Review

**Spec coverage:**
- Universal shell + `.web.ts`/native hook split → Tasks 1-3 (hooks) + Task 4 (shell). ✓
- Provider contract `{ loading, data, refresh, clear? }` → `DataHook`/`StorageHook` in `types.ts`. ✓
- ProfileHeader (useAuth/useStaff), Storage/Device/Health sections, Actions MenuList → Task 4. ✓
- Data models `StorageInfo/DeviceInfo/HealthCheck` → Task 1 `types.ts`. ✓
- Native health stub → Task 3 Step 6. ✓
- Web mount chain `rnweb/ReactAccountRN.tsx → AstroAccountRN.astro → account.mdx` → Tasks 5-6. ✓
- Testing: pure-helper vitest (storageMath/deviceRows/healthChecks) + web render-verify → Tasks 1-3 tests + Task 6 Step 3. ✓
- Subpath `@kbve/rn/account` (base + web tsconfig) → Task 4 Step 8 + Task 5 Step 1. ✓
- YAGNI: no wallet/market/referral; no new deps; BentoAccount retired later → scope guard honored. ✓

**Placeholder scan:** The only `/* noop */` markers (Task 1 Step 6/7) are explicitly flagged as plan-readability aids with instruction to write empty `catch {}` and no comment. No TBD/TODO elsewhere. All code steps show full code.

**Type consistency:** `StorageInfo`/`DeviceInfo`/`DeviceRow`/`HealthCheck`/`HealthStatus`/`DataHook`/`StorageHook` defined once in Task 1 `types.ts`, consumed by name in Tasks 2-4. Hook names (`useStorageInfo`/`useDeviceInfo`/`useHealthInfo`) identical across `.web.ts`/`.ts` pairs and their consuming sections. `StatModel`/`StatGrid` from `../dash` match the real signatures verified in the source.

**Known verification point:** `Badge` prop name (`tone` + children) assumed from `models.ts` `BadgeTone` usage — Task 4 Step 1 instructs confirming against `Badge.tsx` before writing. Sibling-island provider wiring (`KbveProvider` import path / config props) confirmed in Task 5 Step 2 before writing the island.

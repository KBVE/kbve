# RN AccountScreen — Unified Web + Mobile Account Component

**Date:** 2026-07-06
**Scope:** A (profile + settings core). Wallet / market / referral deferred to scope B.

## Goal

Replace the web-only Astro account page (`BentoAccount.astro` on `kbve.com/dashboard/account/`)
with a single React Native `AccountScreen` in `@kbve/rn` that renders on both web
(via the existing `react-native-web` + Astro island bridge) and mobile (Expo NavShell).

One UI codebase; platform-specific data (storage/device/health) resolves via `.web.ts`
file-extension splits — the same idiom already used for HCaptcha, offload, supabase, and theme.

## Architecture

New domain folder `packages/npm/rn/src/account/`:

```
account/
  AccountScreen.tsx        universal shell, composes sections in a ScrollView
  ProfileHeader.tsx        avatar / username / email / staff badge — reuses useAuth + useStaff
  StorageSection.tsx       UI, reads useStorageInfo()
  DeviceSection.tsx        UI, reads useDeviceInfo()
  HealthSection.tsx        UI, reads useHealthInfo()
  useStorageInfo.web.ts    navigator.storage.estimate + localStorage.length + clear()
  useStorageInfo.ts        AsyncStorage size/keys + clear() (native)
  useDeviceInfo.web.ts     navigator userAgent / platform / battery
  useDeviceInfo.ts         expo-device + Platform (native)
  useHealthInfo.web.ts     service-worker / worker reachability checks
  useHealthInfo.ts         connectivity / store reachability (native stub = 'unavailable' v1)
  types.ts                 StorageInfo / DeviceInfo / HealthCheck models + hook return type
  index.ts                 barrel
  __tests__/               vitest — model shape + section render (jsdom for .web.ts)
```

Also export from `src/index.ts` and the web barrel path so `@kbve/rn/account` resolves web-safe
(no nav/vector-icons in the graph).

### Contract

Each data hook returns a plain, serializable model:

```ts
interface HookResult<T> {
	loading: boolean;
	data: T | null;
	refresh: () => void;
	clear?: () => Promise<void>; // storage only
}
```

UI sections are 100% universal — they consume the model and never touch `navigator`,
`localStorage`, `AsyncStorage`, or `expo-device` directly. Only the `.web.ts` / native
hook files reach platform APIs. Extension priority (`.web.ts` wins on web bundler,
plain `.ts` on Metro) selects the impl at build time — no runtime `Platform.OS` branching
in the UI.

## Data models (`types.ts`)

```ts
interface StorageInfo {
	usage: number;
	quota: number;
	percent: number;
	itemCount: number;
}
interface DeviceRow {
	label: string;
	value: string;
}
interface DeviceInfo {
	rows: DeviceRow[];
}
type HealthStatus = 'ok' | 'unavailable' | 'checking' | 'error';
interface HealthCheck {
	label: string;
	status: HealthStatus;
	detail?: string;
}
```

- `useStorageInfo(): HookResult<StorageInfo>` (+ `clear`)
- `useDeviceInfo(): HookResult<DeviceInfo>`
- `useHealthInfo(): HookResult<HealthCheck[]>`

Web hooks port the logic already living in the Astro `ReactSettingsStorage/Device/Health.tsx`.
Native storage = AsyncStorage key count + JSON byte size; native device = expo-device model/OS/mem;
native health = stub `unavailable` v1 (architecture intact, fill later).

## UI composition (existing kit only — zero new primitives)

`AccountScreen` = `Screen` + `ScrollView` stacking:

- **ProfileHeader** — `Avatar` + `Text`(username) + email + `Badge` (staff via `useStaff`);
  loading state = `Skeleton`. Mirrors `DashboardScreen` header.
- **StorageSection** — `Surface` card, `StatGrid`/stat tiles (usage / quota / % / item count)
    - danger `Button` "Clear" → `clear()`.
- **DeviceSection** — `Surface` card, info rows from `data.rows`.
- **HealthSection** — `Surface` card, check rows with status dot + refresh `Button`.
- **Actions** — `MenuList` section: Profile link (`kbve.com/@username`), Legal links,
  Sign out (`useAuthActions`).

Reuses `Screen / Surface / Stack / Text / Badge / Button / Avatar / Skeleton / MenuList /
StatGrid / Divider / tokens`.

## Web mount (existing bridge chain)

```
apps/kbve/astro-kbve/src/components/rnweb/
  ReactAccountRN.tsx     imports AccountScreen from @kbve/rn/account; injects supa getToken
  AstroAccountRN.astro   <ReactAccountRN client:only="react" />
```

`account.mdx` swaps the `<BentoAccount />` body region for `<AstroAccountRN />`; keeps
`<AstroAuthGate />`. Old Astro settings cards (`ReactSettingsStorage/Health/Device`,
`SettingsCard`) retire only after web render parity is confirmed.

## Testing

- `account/__tests__/` vitest: hook model shape + section render (jsdom for `.web.ts`).
  Matches the `dash/__tests__` idiom.
- Web render-verify: headless Playwright on the account page, catch `pageerror` / console
  (bridge memory: bundle-clean ≠ render-verified).
- Native: typecheck; mount in `UiPreview` NavShell to confirm render.

## Scope guard (YAGNI)

Out of v1: wallet, market, referral (scope B). Native health impl = stub `unavailable`.
No new theme or primitive work. No changes to `BentoAccount` beyond the mdx swap.

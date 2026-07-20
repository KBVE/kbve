# `@kbve/rn/markets` Phase 4 — Sidecar + IdiotCard + Expo MarketsScreen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the three deferred P3 pieces — MCItemMarketSidecar (RN port on `/mc/`), IdiotCard (platform-split into StoreView), Expo MarketsScreen — on one branch off `dev`.

**Architecture:** Reuse the shipped `createMarketApi`/`StoreView`/`MarketView`/`ItemIcon`/`format` (P1/P2, merged). Sidecar = a new read-only composition + a `client:visible` bridge replacing the DOM sidecar. IdiotCard = `.web.tsx` (existing three-fiber) + `.tsx` (native static), rendered by StoreView for the featured collectible. Expo screen = a `HomeView` flag block mounting StoreView+MarketView with a native `getToken`.

**Tech Stack:** React Native / react-native-web, `@kbve/rn/ui`, Expo 56, Astro + Starlight, vitest + @testing-library/react, Nx.

## Global Constraints

- **WT** = `/Users/alappatel/Documents/GitHub/kbve/.claude/worktrees/markets-p4-widgets` (created off `origin/dev` @ 4f403899b4; `node_modules` symlinked to main). **MAIN** = `/Users/alappatel/Documents/GitHub/kbve`.
- **Tests (vitest-direct):** `cd $WT/packages/npm/rn && NX_DAEMON=false $MAIN/node_modules/.bin/vitest run <paths>`.
- **Lint:** `cd $WT/packages/npm/rn && NX_DAEMON=false $MAIN/node_modules/.bin/nx lint rn --skip-nx-cache`.
- **Worktree only:** never edit/commit the main `dev` checkout; PRs → `dev`; never push `dev`/`main`. Never stage `node_modules`.
- **No code comments** anywhere. **No bare `catch {}`** → `catch { void 0; }`. **Named exports** in composition barrels (screens may also `export default` per existing screen convention).
- **Relative UI imports inside rn** (`../../ui/primitives/*`, `../ui/primitives/*` from `screens/`); NEVER the `@kbve/rn/ui` barrel/subpath.
- **Public market:** sidecar `listActive` is unauthenticated — `getToken` may return null; no staff gate. Expo screen also public.
- **Platform split** resolves per bundler (precedent: `markets/store/openCheckout.ts`/`.web.ts`): native → `.tsx`, web → `.web.tsx`.
- **Native `getToken`:** `const { client } = useKbve(); const getToken = useCallback(async () => { const { data } = await client.auth.getSession(); return data.session?.access_token ?? null; }, [client]);` `baseUrl="https://kbve.com"`.
- **Commit trailer:** end messages with `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`; NO "Generated with Claude Code" line. Stage only named files with explicit `git add`.

**Spec:** `docs/superpowers/specs/2026-07-20-markets-p4-widgets-design.md`. References (shipped): `markets/market/{api,format,ItemIcon,ListingCard}.tsx`, `markets/store/{StoreView,openCheckout.web}.tsx`, `screens/McScreen.tsx`, `screens/HomeView.tsx` (showMc block lines 138-160 + button 232-238).

---

## Task 1: MCItemMarketSidecar composition (TDD render)

**Files:** Create `packages/npm/rn/src/markets/market/MCItemMarketSidecar.tsx`; modify `markets/market/index.ts`; Test `markets/market/__tests__/MCItemMarketSidecar.test.tsx`.

**Interfaces:**
- Consumes `createMarketApi` (`.listActive`), `MarketApiError`, `formatKhash`/`formatRelative`/`itemRefLabel` (`./format`), `ItemIcon` (`./ItemIcon`), types `MarketListing`.
- Produces `MCItemMarketSidecar({ itemRef, excludeListingId?, getToken?, baseUrl? })` + `MCItemMarketSidecarProps`.

**Design** (port of `apps/kbve/astro-kbve/src/components/market/MCItemMarketSidecar.tsx` — read it):
- Props `{ itemRef: string; excludeListingId?: number; getToken?: () => Promise<string|null>; baseUrl?: string }`. Defaults `getToken = async () => null`, `baseUrl = ''`. `api = useMemo(() => createMarketApi({ getToken, baseUrl }), [getToken, baseUrl])`.
- Effect (dep `[api, itemRef]`, `cancelled` flag): `listActive({limit:100})`; if first page `length >= 100`, fetch a second `listActive({limit:100, before_created_at:last.created_at, before_id:last.listing_id})` and concat. `setRows`/`setError`(`MarketApiError`→message else 'failed to load market listings')/`setLoading`.
- `matches(item_ref, itemRef)` = `item_ref?.kind==='mc_item' && String(item_ref.id)===itemRef`. `filtered = rows.filter(r => matches(r.item_ref, itemRef) && r.listing_id !== excludeListingId)`.
- `stats` (memo): count, min/median/max buy-now (non-null, sorted), currentBid min/max, nextExpiry (future-most-recent ISO). Same `median` helper. `cards` = filtered sorted by buy-now asc (nulls last), top 6.
- Render (RN primitives, relative imports): `Surface` with a header `Stack` (`Text` "Other live listings for this item" + `Badge label={String(stats.count)}`); a stat grid (`Stack`/`View` rows of `Text` label + `formatKhash`/`formatRelative` value); a card grid of up to 6 `Pressable` → `openListing(id)` (`window.location.href='/market/listing/?id='+id` guarded `typeof window!=='undefined'`), each `ItemIcon itemRef={{kind:'mc_item', id:itemRef}} size={48}` + title (`itemRefLabel` or display_name) + `formatKhash(buy_now_price)` + `Bid {formatKhash(current_bid)}` + `formatRelative(created_at)`. Loading/empty/error `Text` states.

- [ ] **Step 1: Write render test** `markets/market/__tests__/MCItemMarketSidecar.test.tsx`

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { MCItemMarketSidecar } from '../MCItemMarketSidecar';

const ROW = {
	listing_id: 1,
	seller_account: 's',
	item_ref: { kind: 'mc_item', id: 'diamond' },
	currency: 'khash',
	buy_now_price: 500,
	min_bid: null,
	current_bid: null,
	expires_at: new Date(Date.now() + 86400000).toISOString(),
	created_at: '2020',
};

describe('MCItemMarketSidecar', () => {
	beforeEach(() => {
		global.fetch = vi.fn();
	});
	it('renders matching listing stats + a card', async () => {
		(global.fetch as any).mockResolvedValue({ ok: true, status: 200, text: async () => JSON.stringify([ROW]) });
		const { findByText } = render(<MCItemMarketSidecar itemRef="diamond" />);
		expect(await findByText(/Other live listings/)).toBeTruthy();
		expect(await findByText(/500 KHash/)).toBeTruthy();
	});
	it('shows empty state when nothing matches', async () => {
		(global.fetch as any).mockResolvedValue({ ok: true, status: 200, text: async () => '[]' });
		const { findByText } = render(<MCItemMarketSidecar itemRef="diamond" />);
		expect(await findByText(/No other active listings/)).toBeTruthy();
	});
});
```

- [ ] **Step 2: RED** — `vitest run src/markets/market/__tests__/MCItemMarketSidecar.test.tsx` → FAIL.
- [ ] **Step 3: Implement `MCItemMarketSidecar.tsx`** per Design. Reference `ListingCard.tsx` for card/primitive shape. Relative imports. Comment-free.
- [ ] **Step 4: Export** — `markets/market/index.ts`: `export { MCItemMarketSidecar } from './MCItemMarketSidecar'; export type { MCItemMarketSidecarProps } from './MCItemMarketSidecar';`
- [ ] **Step 5: GREEN + lint + commit**

`vitest run src/markets/market/__tests__/MCItemMarketSidecar.test.tsx` → PASS; `nx lint rn --skip-nx-cache` clean on the file. Commit:
```bash
git add packages/npm/rn/src/markets/market/MCItemMarketSidecar.tsx packages/npm/rn/src/markets/market/index.ts packages/npm/rn/src/markets/market/__tests__/MCItemMarketSidecar.test.tsx
git commit -m "feat(rn): MCItemMarketSidecar composition (per-item live listings)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: sidecar bridge + wire MCItemPanel.astro

**Files:** Create `apps/kbve/astro-kbve/src/components/market/ReactMCItemMarketRN.tsx`; modify `components/mcdb/MCItemPanel.astro`.

- [ ] **Step 1: `ReactMCItemMarketRN.tsx`**

```tsx
import { useMemo } from 'react';
import { MCItemMarketSidecar } from '@kbve/rn/markets';
import { initSupa, getSupa } from '@/lib/supa';

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

export default function ReactMCItemMarketRN({ itemRef }: { itemRef: string }) {
	const token = useMemo(() => getToken, []);
	return <MCItemMarketSidecar itemRef={itemRef} getToken={token} baseUrl="" />;
}
```

- [ ] **Step 2: Wire `MCItemPanel.astro`** — at line ~330, replace `<MCItemMarketSidecar client:visible ref={item.ref} />` with `<ReactMCItemMarketRN client:visible itemRef={item.ref} />`. Update the import at the top of the file: replace `import MCItemMarketSidecar from '../market/MCItemMarketSidecar';` (or its named form) with `import ReactMCItemMarketRN from '../market/ReactMCItemMarketRN';`. Keep the surrounding bento "Marketplace" block + the sibling `/market/?kind=mc_item&q=` link untouched. Verify no other reference to the old `MCItemMarketSidecar` remains in the file.

- [ ] **Step 3: Commit** (astro island; verified by the build in Task 6)
```bash
git add apps/kbve/astro-kbve/src/components/market/ReactMCItemMarketRN.tsx apps/kbve/astro-kbve/src/components/mcdb/MCItemPanel.astro
git commit -m "feat(astro): mount MCItemMarketSidecar via @kbve/rn/markets bridge on /mc/

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: IdiotCard platform split + StoreView wiring + retire orphans (TDD native)

**Files:** Create `packages/npm/rn/src/markets/store/IdiotCard.web.tsx`, `markets/store/IdiotCard.tsx`; modify `markets/store/index.ts`, `markets/store/StoreView.tsx`, `packages/npm/rn/package.json`; Test `markets/store/__tests__/IdiotCard.test.tsx`; Delete `apps/kbve/astro-kbve/src/components/store/IdiotCard.tsx`, `ReactStoreCard.tsx`.

**Interfaces:** Produces `IdiotCard({ revealed: boolean })` (both platform files export the same named `IdiotCard`).

- [ ] **Step 1: `IdiotCard.web.tsx`** — port `apps/kbve/astro-kbve/src/components/store/IdiotCard.tsx` (read it). Keep `CardMesh` (three-fiber `useFrame` spin, `RoundedBox`, three `Text`, lights) verbatim. Replace the outer DOM `<div className="kbve-store-card__stage">` with an RN `View` (fixed height, e.g. 320, `overflow:'hidden'`, rounded); render the `<Canvas camera dpr>` inside it; when `!revealed` overlay an RN `View` (absolute-fill, semi-opaque) with a `Text` lock glyph "🔒". Props `{ revealed: boolean }`. Imports: `Canvas`/`useFrame` from `@react-three/fiber`, `RoundedBox`/`Text` from `@react-three/drei`, `Group` type from `three`, `View`/`StyleSheet` from `react-native`, `Text` (RN) from relative `../../ui/primitives/Text` for the overlay label (alias the drei `Text` import to avoid the name clash, e.g. `import { RoundedBox, Text as DreiText } from '@react-three/drei'`). No comments.

- [ ] **Step 2: `IdiotCard.tsx` (native static)**

```tsx
import { StyleSheet, View } from 'react-native';
import { Text } from '../../ui/primitives/Text';

export interface IdiotCardProps {
	revealed: boolean;
}

export function IdiotCard({ revealed }: IdiotCardProps) {
	return (
		<View style={styles.stage}>
			<View style={styles.card}>
				<Text variant="caption" style={styles.small}>I AM AN</Text>
				<Text variant="title" style={styles.big}>IDIOT</Text>
				<Text variant="caption" style={styles.foot}>· KBVE COLLECTIBLE ·</Text>
			</View>
			{!revealed ? (
				<View style={styles.lock}>
					<Text variant="title">🔒</Text>
				</View>
			) : null}
		</View>
	);
}

const styles = StyleSheet.create({
	stage: { alignItems: 'center', justifyContent: 'center', paddingVertical: 24 },
	card: {
		width: 200,
		height: 288,
		borderRadius: 18,
		backgroundColor: '#7c3aed',
		alignItems: 'center',
		justifyContent: 'center',
		gap: 8,
	},
	small: { color: '#fde68a' },
	big: { color: '#fef3c7', fontSize: 44, fontWeight: '800' },
	foot: { color: '#e9d5ff' },
	lock: {
		...StyleSheet.absoluteFillObject,
		alignItems: 'center',
		justifyContent: 'center',
		backgroundColor: 'rgba(10,6,20,0.55)',
	},
});

export default IdiotCard;
```

- [ ] **Step 3: package.json peer deps** — in `packages/npm/rn/package.json`, add to `peerDependencies`: `"@react-three/fiber": "^9.6.1"`, `"@react-three/drei": "^10.7.7"`, `"three": "^0.184.0"`; and to `peerDependenciesMeta` mark all three `{ "optional": true }` (native never imports them). Do NOT run `pnpm install` (worktree uses the hoisted symlinked node_modules; CI installs). Match the JSON style (tabs/quotes) of the existing file.

- [ ] **Step 4: Wire `StoreView.tsx`** — import `import { IdiotCard } from './IdiotCard';`. In the featured block (around line 90, `{featured ? (`), render `<IdiotCard revealed={owns(featured.slug)} />` immediately above the featured `<ProductCard .../>` (wrap both in a `Stack gap="md"` if needed). No other StoreView logic changes.

- [ ] **Step 5: Export + native fallback test**

`markets/store/index.ts`: `export { IdiotCard } from './IdiotCard';`. Test `markets/store/__tests__/IdiotCard.test.tsx` (imports the native `.tsx` — vitest resolves `.tsx`, not `.web.tsx`):
```tsx
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { IdiotCard } from '../IdiotCard';

describe('IdiotCard native fallback', () => {
	it('shows the collectible; locks when not revealed', () => {
		const locked = render(<IdiotCard revealed={false} />);
		expect(locked.getByText('IDIOT')).toBeTruthy();
		expect(locked.getByText('🔒')).toBeTruthy();
		const open = render(<IdiotCard revealed={true} />);
		expect(open.queryByText('🔒')).toBeNull();
	});
});
```

- [ ] **Step 6: Retire orphans** — verify no importer remains, then delete:
```bash
grep -rn "ReactStoreCard\|store/IdiotCard\|from './IdiotCard'" apps/kbve/astro-kbve/src || true
git rm apps/kbve/astro-kbve/src/components/store/IdiotCard.tsx apps/kbve/astro-kbve/src/components/store/ReactStoreCard.tsx
```
(If grep shows an astro importer other than these two files referencing each other, STOP and report — do not delete.)

- [ ] **Step 7: GREEN + lint + commit**

`vitest run src/markets/store/__tests__/IdiotCard.test.tsx` → PASS; `nx lint rn --skip-nx-cache` clean. Commit:
```bash
git add packages/npm/rn/src/markets/store/IdiotCard.tsx packages/npm/rn/src/markets/store/IdiotCard.web.tsx packages/npm/rn/src/markets/store/index.ts packages/npm/rn/src/markets/store/StoreView.tsx packages/npm/rn/src/markets/store/__tests__/IdiotCard.test.tsx packages/npm/rn/package.json apps/kbve/astro-kbve/src/components/store/IdiotCard.tsx apps/kbve/astro-kbve/src/components/store/ReactStoreCard.tsx
git commit -m "feat(rn): IdiotCard platform split into StoreView; retire orphan DOM card

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: rn barrel export markets + MarketsScreen (TDD smoke)

**Files:** Create `packages/npm/rn/src/screens/MarketsScreen.tsx`; modify `packages/npm/rn/src/index.ts`; Test `packages/npm/rn/src/screens/__tests__/MarketsScreen.test.tsx`.

**Interfaces:** Produces `MarketsScreen()` (default + named export, per screen convention).

- [ ] **Step 1: barrel export** — `packages/npm/rn/src/index.ts`: add `export * from './markets';` (verify no export-name collision with existing barrel exports — if `Text`/`Badge` etc. are NOT re-exported by markets, safe; markets only exports its own view/type names). Also add `export { MarketsScreen } from './screens/MarketsScreen';`.

- [ ] **Step 2: `MarketsScreen.tsx`**

```tsx
import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { useKbve } from '../auth/KbveProvider';
import { useAuth } from '../auth/useAuth';
import { Button } from '../ui/primitives/Button';
import { Stack } from '../ui/primitives/Stack';
import { StoreView } from '../markets/store/StoreView';
import { MarketView } from '../markets/market/MarketView';

type Tab = 'store' | 'market';

export function MarketsScreen() {
	const { client } = useKbve();
	const auth = useAuth();
	const authenticated = Boolean(auth?.authenticated);
	const [tab, setTab] = useState<Tab>('store');
	const getToken = useCallback(async () => {
		const { data } = await client.auth.getSession();
		return data.session?.access_token ?? null;
	}, [client]);

	return (
		<View>
			<Stack direction="row" gap="sm">
				<Button title="Store" variant={tab === 'store' ? 'primary' : 'ghost'} onPress={() => setTab('store')} />
				<Button title="Marketplace" variant={tab === 'market' ? 'primary' : 'ghost'} onPress={() => setTab('market')} />
			</Stack>
			{tab === 'store' ? (
				<StoreView getToken={getToken} baseUrl="https://kbve.com" authenticated={authenticated} />
			) : (
				<MarketView getToken={getToken} baseUrl="https://kbve.com" authenticated={authenticated} />
			)}
		</View>
	);
}

export default MarketsScreen;
```
Verify `useAuth()`'s field for authentication — open `packages/npm/rn/src/auth/useAuth.ts`; if the boolean is named differently (e.g. `status === 'authenticated'` or `session != null`), adjust `authenticated` accordingly. Verify `MarketView`'s prop name (`authenticated`) matches `MarketView.tsx`.

- [ ] **Step 3: smoke test** `screens/__tests__/MarketsScreen.test.tsx`

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MarketsScreen } from '../MarketsScreen';

vi.mock('../../auth/KbveProvider', () => ({
	useKbve: () => ({ client: { auth: { getSession: async () => ({ data: { session: null } }) } } }),
}));
vi.mock('../../auth/useAuth', () => ({ useAuth: () => ({ authenticated: false }) }));

describe('MarketsScreen', () => {
	it('renders the store/marketplace tab toggle', () => {
		global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => '[]' });
		const { getByText } = render(<MarketsScreen />);
		expect(getByText('Store')).toBeTruthy();
		expect(getByText('Marketplace')).toBeTruthy();
	});
});
```
(Adjust the `useAuth` mock shape to match the real hook's return.)

- [ ] **Step 4: GREEN + lint + commit**

`vitest run src/screens/__tests__/MarketsScreen.test.tsx` → PASS; `nx lint rn --skip-nx-cache` clean. Commit:
```bash
git add packages/npm/rn/src/screens/MarketsScreen.tsx packages/npm/rn/src/index.ts packages/npm/rn/src/screens/__tests__/MarketsScreen.test.tsx
git commit -m "feat(rn): MarketsScreen (store+market) + export markets from barrel

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: wire MarketsScreen into HomeView

**Files:** Modify `packages/npm/rn/src/screens/HomeView.tsx`.

- [ ] **Step 1: import + state** — add `import { MarketsScreen } from './MarketsScreen';` (next to the other screen imports ~line 18-20); add `const [showMarkets, setShowMarkets] = useState(false);` (next to `showMc`, line 81).

- [ ] **Step 2: return block** — add after the `showMc` block (~line 160), mirroring it exactly:
```tsx
if (showMarkets) {
	return (
		<View style={styles.root}>
			<View style={[styles.canvasBar, { paddingTop: insets.top + tokens.space.sm }]}>
				<Text variant="label">Store · Marketplace</Text>
				<Button title="Close" variant="ghost" onPress={() => setShowMarkets(false)} />
			</View>
			<ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.body}>
				<MarketsScreen />
			</ScrollView>
		</View>
	);
}
```

- [ ] **Step 3: button** — in the body (after the staff-gated buttons, ~line 246, before "Quick actions"), add a NON-gated `Button`:
```tsx
<Button
	title="🛒  Store & Marketplace"
	variant="secondary"
	onPress={() => setShowMarkets(true)}
/>
```

- [ ] **Step 4: lint + commit**

`nx lint rn --skip-nx-cache` clean. Commit:
```bash
git add packages/npm/rn/src/screens/HomeView.tsx
git commit -m "feat(rn): surface Store & Marketplace in the Expo HomeView

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: verification + PR

**Files:** none (verify; fix as needed).

- [ ] **Step 1: full markets + screens vitest**

`cd $WT/packages/npm/rn && NX_DAEMON=false $MAIN/node_modules/.bin/vitest run src/markets src/screens/__tests__/MarketsScreen.test.tsx` → all green.

- [ ] **Step 2: lint** — `NX_DAEMON=false $MAIN/node_modules/.bin/nx lint rn --skip-nx-cache` → 0 errors.

- [ ] **Step 3: native-graph safety** — confirm the native barrel never pulls three-fiber:
```bash
cd $WT/packages/npm/rn
grep -rn "@react-three\|from 'three'" src/markets/store/IdiotCard.tsx src/screens/MarketsScreen.tsx && echo "LEAK" || echo "clean (three only in .web.tsx)"
```
Expect "clean". `.web.tsx` is the ONLY file importing three.

- [ ] **Step 4: astro build** — `cd $WT/apps/kbve/astro-kbve && NX_DAEMON=false $MAIN/node_modules/.bin/astro build 2>&1 | tail -30`. Known: the client bundle may fail on the PRE-EXISTING dev `d3-shape` break (`ReactKanbanAssignees.tsx`, unrelated). If it reaches the market chunks, grep `dist/_astro/ReactMCItemMarketRN.*.js` for `vector-icons` (expect 0). If it aborts on d3-shape only, record that (SSG page-render pass compiling clean is sufficient evidence for the Phase 4 astro changes).

- [ ] **Step 5: Expo typecheck** (best-effort) — `cd $WT/apps/kbve/kbve-react-native && NX_DAEMON=false $MAIN/node_modules/.bin/tsc --noEmit -p tsconfig.json 2>&1 | grep -i "MarketsScreen\|HomeView\|markets" | head` → no errors referencing the new code (pre-existing unrelated errors, if any, are out of scope). If `tsc` isn't wired, rely on the rn vitest + lint.

- [ ] **Step 6: push + PR → dev**

```bash
cd $WT
git push -u origin feat/markets-p4-widgets
gh pr create --base dev --title "feat(markets): Phase 4 — MC sidecar + IdiotCard split + Expo MarketsScreen" --body "$(cat <<'EOF'
Phase 4 (final) of the store+market epic — the three deferred P3 widgets. Follows #14338 / #14398 / #14410.

## What
- **MCItemMarketSidecar** ported to `@kbve/rn/markets` + a `client:visible` bridge; `/mc/` item pages now mount the RN sidecar (retires the DOM one).
- **IdiotCard** platform-split — `IdiotCard.web.tsx` (three-fiber, web) + `IdiotCard.tsx` (native static) — rendered by `StoreView` for the featured collectible; orphan DOM `IdiotCard`/`ReactStoreCard` deleted.
- **Expo MarketsScreen** — store + marketplace tabs wired into the app `HomeView` (public, native `getToken`).

## Verify
- markets + screens vitest green; `nx lint rn` clean; native graph pulls only `IdiotCard.tsx` (no three-fiber in the native bundle).
- Astro SSG page-render compiles the sidecar changes clean.

> ⚠️ Full `astro build` client bundle may still hit the pre-existing dev `d3-shape` break (`ReactKanbanAssignees.tsx`, unrelated to this PR). CI builds in an installed env.
> ⚠️ `packages/npm/rn/package.json` declares `@react-three/*`/`three` as **optional peer deps** (web-only `.web.tsx`); CI install resolves them.

## Deferred (P5)
`MarketProfileView`/admin on mobile; category-aware sidecar texture URLs.

Docs: `docs/superpowers/specs/2026-07-20-markets-p4-widgets-design.md`, `docs/superpowers/plans/2026-07-20-markets-p4-widgets.md`.
EOF
)"
```

---

## Self-Review notes

- **Spec coverage:** A sidecar → Tasks 1-2; B IdiotCard → Task 3; C Expo → Tasks 4-5; verify → Task 6.
- **Type consistency:** `MCItemMarketSidecarProps` (T1) consumed by the bridge (T2); `IdiotCard` same named export in both platform files (T3), consumed by StoreView (T3) + tested via native (T3); `MarketsScreen` (T4) wired in HomeView (T5). `getToken`/`baseUrl`/`authenticated` prop names verified against `StoreView`/`MarketView`.
- **Gotchas:** platform split (`.web.tsx`/`.tsx`) — three-fiber ONLY in `.web.tsx`; peer-dep optional (no install in worktree); relative UI imports; `catch { void 0; }`; delete orphans only after grep confirms no importer; sidecar `ref`→`itemRef` rename.

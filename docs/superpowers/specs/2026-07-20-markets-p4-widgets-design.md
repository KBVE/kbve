# `@kbve/rn/markets` Phase 4 — Sidecar + IdiotCard + Expo MarketsScreen

**Date:** 2026-07-20
**Scope:** `apps/kbve/astro-kbve` + `apps/kbve/kbve-react-native` + `packages/npm/rn` — the three deferred pieces from Phase 3, each an independent part on one branch. See [[project_rn_markets_store]]. Branches off `origin/dev` (NOT stacked on P3 — Expo screen uses only merged customer views).

Final epic phase. P1 = `/store/` (#14338), P2 = `/market/` (#14398), P3 = admin/personal (#14410). **P4 = the deferred widgets + mobile.**

## Parts (independent; ship together)

- **A. MCItemMarketSidecar** → RN composition + bridge; retire the DOM sidecar on `/mc/` item pages.
- **B. IdiotCard** → platform-split into the composition (web three-fiber / native static), rendered by `StoreView` for the featured collectible; retire the orphaned DOM `IdiotCard`/`ReactStoreCard`.
- **C. Expo MarketsScreen** → a mobile screen (`StoreView` + `MarketView`) wired into the Expo app's `HomeView`.

## Decisions (locked)

- **Branch off `origin/dev`.** Expo `MarketsScreen` = customer `StoreView` + `MarketView` only (P1/P2, merged); `MarketProfileView`/admin on mobile deferred → avoids stacking on the unmerged P3.
- **Native `getToken`:** the Expo pattern (`screens/McScreen.tsx`): `const { client } = useKbve(); const getToken = useCallback(async () => (await client.auth.getSession()).data.session?.access_token ?? null, [client]);` with `baseUrl="https://kbve.com"`. Markets is public → no staff gate on the screen.
- **IdiotCard native = NOT three-fiber.** The Expo app has zero three/fiber/expo-gl deps (uses `react-native-webgpu`/`typegpu`). Platform split (precedent: P1 `openCheckout.ts`/`.web.ts`): `IdiotCard.web.tsx` (existing three-fiber, web only) + `IdiotCard.tsx` (native static RN card, no GL). No new native deps.
- **Sidecar icon:** `ItemIcon` replaces web-only `MCTextureImage`; adapt the call site — wrap the flat `ref` into `{ kind: 'mc_item', id: ref }`. Category-aware URL selection is dropped (acceptable; ItemIcon uses mcasset item+block fallback).
- **Barrel export:** `packages/npm/rn/src/index.ts` gains `export * from './markets'` so the Expo screen can import `StoreView`/`MarketView` from `@kbve/rn`. Must stay native-safe (platform split keeps three-fiber out of the native graph).

## A. MCItemMarketSidecar — `markets/market/MCItemMarketSidecar.tsx`

Port of `apps/kbve/astro-kbve/src/components/market/MCItemMarketSidecar.tsx` to RN primitives.

- Props: `{ itemRef: string; excludeListingId?: number; getToken?: () => Promise<string|null>; baseUrl?: string }` (rename DOM's `ref` → `itemRef`; `ref` is reserved). Default `getToken = async () => null` (public), `baseUrl = ''`.
- `api = useMemo(() => createMarketApi({ getToken, baseUrl }), [...])`. Load: `listActive({limit:100})` + one paginated follow-up when the first page is full (identical logic to the DOM version). `matches(item_ref, itemRef)` = `kind==='mc_item' && String(id)===itemRef`, exclude `excludeListingId`. Same stats (count, min/median/max buy-now, bid range, next expiry) + top-6 cards sorted by buy-now.
- Render with `Surface`/`Stack`/`Text`/`Badge` (relative imports); a stat grid; up to 6 `Pressable` cards (`ItemIcon` with `{kind:'mc_item', id:itemRef}` + `formatKhash`/`formatRelative`), each opening `/market/listing/?id=` (web-guarded). Loading/empty/error `Text` states. Reuse `markets/market/format.ts` + `MarketApiError`.
- Export from `markets/market/index.ts`.

**Bridge:** `apps/kbve/astro-kbve/src/components/market/ReactMCItemMarketRN.tsx` — `client:visible`, prop `itemRef`, `getToken` via `initSupa`/`getSupa` (nullable — public), `baseUrl=''`, renders `<MCItemMarketSidecar>`.

**Wire:** `apps/kbve/astro-kbve/src/components/mcdb/MCItemPanel.astro:330` — replace `<MCItemMarketSidecar client:visible ref={item.ref} />` with `<ReactMCItemMarketRN client:visible itemRef={item.ref} />`. Keep the surrounding bento "Marketplace" block + sibling link.

## B. IdiotCard — platform split in `markets/store/`

- `markets/store/IdiotCard.web.tsx` — port of the DOM `IdiotCard.tsx` three-fiber code (`Canvas`/`useFrame` from `@react-three/fiber`, `RoundedBox`/`Text` from `@react-three/drei`, spinning `CardMesh`). Wrap the `<Canvas>` in an RN `View` (react-native-web renders a div); replace the DOM lock `<div>`/SVG with an RN overlay `View`+`Text` (lock glyph) shown when `!revealed`. Props `{ revealed: boolean }`.
- `markets/store/IdiotCard.tsx` — native static fallback: an RN `View` styled as the purple collectible (rounded, `#7c3aed`), `Text` "I AM AN" / "IDIOT" / "· KBVE COLLECTIBLE ·", a lock overlay `View` when `!revealed`. No three/GL imports.
- `@kbve/rn` package.json: declare `@react-three/fiber` (^9.6.1), `@react-three/drei` (^10.7.7), `three` (^0.184.0) as **peerDependencies** (`peerDependenciesMeta` optional) — the `.web.tsx` needs them at web-bundle time; they are already hoisted in the monorepo (arpg/web declares them), so local build/tsc resolves; only the web bundle pulls them (native resolves `.tsx`). Do NOT add to the Expo app.
- **Wire into `StoreView.tsx`:** in the featured block, render `<IdiotCard revealed={owns(featured.slug)} />` above the featured `ProductCard` (the featured slug IS `FEATURED_SLUG='i-am-an-idiot'`). Import from `./IdiotCard` (platform-resolved).
- Export `IdiotCard` from `markets/store/index.ts`.
- **Retire orphans:** delete `apps/kbve/astro-kbve/src/components/store/IdiotCard.tsx` and `ReactStoreCard.tsx` (confirmed unmounted — grep shows they reference only each other, no shell/mdx importer; superseded by the composition + StoreView). Verify no remaining importer before deleting.

## C. Expo MarketsScreen

- `packages/npm/rn/src/screens/MarketsScreen.tsx` — mirrors `screens/McScreen.tsx`: `const { client } = useKbve()`; native `getToken`; a simple in-screen toggle (two `Button`s) between `StoreView` and `MarketView` (both `getToken`, `baseUrl="https://kbve.com"`, `authenticated` derived from a session check via `useAuth`/session). Public — no staff gate.
- Export `MarketsScreen` from `packages/npm/rn/src/index.ts`.
- **Wire into `packages/npm/rn/src/screens/HomeView.tsx`:** add a `showMarkets` state flag, an early-return block (canvasBar + `ScrollView` + Close, like the `showMc` block), and a `<Button onPress={() => setShowMarkets(true)}>` in the body (NOT staff-gated). Import `MarketsScreen`.

## Non-goals

- No `MarketProfileView`/admin on mobile this phase (P5).
- No native three-fiber / expo-gl (native IdiotCard is a static card).
- Category-aware texture URL fidelity in the sidecar icon.
- No new axum routes.

## Verification

- `nx lint rn` clean; markets vitest green + new tests: `MCItemMarketSidecar` render (loads + empty + a card), `IdiotCard` native fallback render (revealed + locked), `MarketsScreen` smoke render.
- `astro build` EXIT 0 — subject to the pre-existing dev `d3-shape` break (kanban island, unrelated); the sidecar island chunk builds + 0 vector-icons; `/mc/items/<x>/` mounts `ReactMCItemMarketRN`.
- Expo: `MarketsScreen`/`HomeView`/barrel typecheck clean (`tsc`); the native graph pulls `IdiotCard.tsx` (static), never `.web.tsx` (no three-fiber in the native bundle) — verify by grepping the barrel's transitive imports.
- Orphan `IdiotCard`/`ReactStoreCard` deleted with no dangling importer.

## Files

- **New (rn):** `markets/market/MCItemMarketSidecar.tsx`; `markets/store/IdiotCard.web.tsx` + `IdiotCard.tsx`; `screens/MarketsScreen.tsx`; tests.
- **Edit (rn):** `markets/market/index.ts`, `markets/store/index.ts`, `markets/store/StoreView.tsx`, `src/index.ts`, `src/screens/HomeView.tsx`, `package.json` (peer three deps).
- **New (astro):** `components/market/ReactMCItemMarketRN.tsx`.
- **Edit (astro):** `components/mcdb/MCItemPanel.astro`.
- **Delete (astro):** `components/store/IdiotCard.tsx`, `components/store/ReactStoreCard.tsx`.

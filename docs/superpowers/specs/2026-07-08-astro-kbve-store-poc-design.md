# astro-kbve Store — POC Design

Date: 2026-07-08
Status: Approved (brainstorm), pending implementation plan

## Goal

Add a **store** to `astro-kbve` where a signed-in user spends **credits** to buy a
product. First product (proof of concept): the **"I am an idiot" card** — a WebGL
prop, priced at **10 credits**, hidden until purchased.

The store is a **fixed-price mint front-end onto the existing wallet + inventory +
marketplace core**. It introduces no new ownership model: a purchase mints an
`inventory.item`, so anything bought in the store is immediately listable and
tradeable on the existing marketplace with zero extra plumbing later.

## Decisions (locked in brainstorm)

- **Enforcement:** hybrid. Credit spend is **authoritative** in Postgres (existing
  wallet debit path, `source_kind = 'purchase'`, `53100 insufficient_funds` → HTTP
  402). The WebGL asset ships in the static bundle, so the reveal is a **soft
  client-side gate** backed by a real DB ownership row.
- **Ownership:** **inventory-native**. Purchase mints an `inventory.item`
  (`kind = 'store_product'`, `ref = <slug>`). No separate `store.entitlement` table.
  Owned = the caller holds a `held` item of that kind+ref.
- **Catalog:** **full catalog store** — a `store.product` table (id, slug, price,
  currency, metadata) + a public list endpoint. Seeded with one product for the POC.
- **Persistence:** ownership persists (it's an inventory row). Reload re-checks
  inventory and auto-reveals; never double-charges.
- **Dupe guard:** `store_buy` checks existing holding first and is idempotent — a
  user cannot buy the same cosmetic twice.
- **Test funding:** use the existing wallet coupon / `service/credit` path to fund a
  test account with credits. No new funding work.

## Architecture

Static SSG site → all dynamic behavior runs in React islands that call the Rust/Axum
backend. Credits/inventory are authoritative in Postgres ("kilobase"). The store adds
one catalog table + three proxy procs, a Rust transport, and one frontend island.

### 1. Database — `packages/data/sql`

New dbmate migration under `packages/data/sql/dbmate/migrations/` (+ hand-authored
schema mirror under `packages/data/sql/schema/store/`).

**Catalog table (new):**

```
store.product (
    product_id  UUID PK DEFAULT gen_random_uuid(),
    slug        TEXT UNIQUE NOT NULL,        -- 'i-am-an-idiot'
    title       TEXT NOT NULL,
    description TEXT,
    price       BIGINT NOT NULL CHECK (price >= 0),
    currency    wallet.currency_kind NOT NULL DEFAULT 'credits',
    asset_ref   JSONB NOT NULL DEFAULT '{}'::jsonb,   -- WebGL asset descriptor
    status      TEXT NOT NULL DEFAULT 'active',       -- active | hidden | retired
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
)
```

**Ownership:** NO new table. Purchase mints an `inventory.item`:
`kind='store_product'`, `ref=<slug>`, `qty=1`, `source='store'`,
`source_ref={product_id,...}`, `nbt`=product metadata (instanced). Mirrors the
buyer-side mint in the marketplace `listing_settle` path, writing an
`inventory.transition` audit row.

**Seed:** one row — `slug='i-am-an-idiot'`, `title='I am an idiot'`, `price=10`,
`currency='credits'`, `asset_ref` describing the WebGL card.

**Three proxy procs** (mirror `proxy_market_*` conventions — `SECURITY DEFINER`,
`auth.uid()` gated for the authed ones, `WLT01` on missing account for lazy
provisioning):

- `proxy_store_catalog_readonly()` — public; returns `status='active'` products.
  `STABLE`, read-replica safe.
- `proxy_store_my_entitlements_readonly()` — `auth.uid()`; returns the caller's held
  `store_product` items (slug + granted_at). `STABLE`.
- `proxy_store_buy(p_slug TEXT, p_idempotency_key UUID)` — atomic, single txn:
  1. Resolve product by slug (active); raise if missing.
  2. If caller already holds `kind='store_product' AND ref=slug` in `held` state →
     idempotent no-op, return existing item id.
  3. Debit `price` of `currency` from caller via the existing wallet debit routine
     (`source_kind='purchase'`, replay-guarded by `p_idempotency_key`); raises
     `53100` if insufficient.
  4. Mint the `inventory.item` + `inventory.transition` row.
  5. Return the new inventory item id.

### 2. Rust backend — `axum-kbve` + `packages/rust/kbve`

- `packages/rust/kbve/src/wallet/store.rs` — `WalletClient` methods `store_catalog`,
  `store_my_entitlements`, `store_buy`, each following the market.rs shape
  (`set_user_claims` inside a diesel txn, `sql_query("SELECT public.proxy_store_*")`,
  `WalletError::from_diesel`).
- `axum-kbve/src/transport/store.rs` — request/response DTOs (`ToSchema`) + handlers,
  reusing `resolve_user`, `wallet_error_response`, `service_unavailable`. Maps
  `insufficient_funds → 402`, idempotency replay-mismatch `→ 409`.
- Wire the module in the transport mod tree; register routes in
  `axum-kbve/src/transport/https.rs` alongside the existing market routes:
  - `GET  /api/v1/store/products` → `store::list_products` (public)
  - `GET  /api/v1/store/me/entitlements` → `store::my_entitlements` (auth)
  - `POST /api/v1/store/products/{slug}/buy` → `store::buy` (auth; body
    `{ idempotency_key: Uuid }`, returns `{ id }`)
- Add the new paths/DTOs to the utoipa OpenAPI aggregation.

### 3. Frontend — `apps/kbve/astro-kbve`

- `src/components/store/api.ts` — mirrors `market/api.ts`:
  - `catalog(): Promise<StoreProduct[]>` (public `apiFetch`)
  - `myEntitlements(): Promise<StoreEntitlement[]>` (`authedApiFetch`)
  - `buyProduct(slug, { idempotency_key }): Promise<{ id: number }>`
    (`authedApiFetch`, POST). `crypto.randomUUID()` for the key.
  - `StoreApiError extends ApiError` for typed 402/409 handling.
- `src/components/store/AstroStoreShell.astro` + `ReactStoreCard.tsx`
  (`client:only="react"`) — same shell+island pattern as wallet/market.
- **WebGL card** — an R3F island (`three` + `@react-three/fiber`, already root deps).
  - **Locked** (not owned): obscured/blurred placeholder + "Buy · 10 credits" button.
  - **Owned**: reveal the "I am an idiot" card mesh (spinning textured plane / simple
    3D card prop).
- MDX page `src/content/docs/store/index.mdx` renders `AstroStoreShell`. Add a store
  entry to the sidebar / dashboard nav in `astro.config.mjs`
  (`data-auth-visibility: auth` where appropriate).

### 4. Data flow

1. Island mounts → `useSession()` + `catalog()` + `myEntitlements()`.
2. Owns `i-am-an-idiot`? → render WebGL card. Else → render locked placeholder + Buy.
3. Buy click → `buyProduct('i-am-an-idiot', { idempotency_key })`:
   - `200` → refetch `myEntitlements()`, fire `BroadcastChannel('kbve-wallet-sync')`
     to refresh the wallet balance card, reveal the WebGL card, toast success.
   - `402` → toast "not enough credits".
   - `409` (replay) → treat as already-owned; refetch entitlements and reveal.

## Isolation / units

- `store.product` + procs: catalog & purchase authority. Interface = the three procs.
- `WalletClient::store_*`: DB access boundary. Interface = typed methods.
- `transport/store.rs`: HTTP boundary. Interface = the three routes + DTOs.
- `store/api.ts`: client transport. Interface = `catalog/myEntitlements/buyProduct`.
- `ReactStoreCard` + R3F card: presentation. Interface = the API module + session.

Each is independently testable: procs via dbmate migration-tests, transport via
axum-kbve-e2e, the island via the running site with a funded test account.

## Testing

- **DB:** dbmate migration-test asserts buy debits credits, mints one inventory item,
  is idempotent on replay, and rejects on insufficient funds.
- **Backend:** axum-kbve-e2e hits the three routes with a funded test JWT; asserts
  402 when broke, 200 + inventory holding when funded, idempotent re-buy.
- **Frontend:** manual — fund a test account via the existing coupon/credit path, load
  the store page, confirm locked → buy → reveal + balance drops by 10, reload stays
  revealed.

## Out of scope (YAGNI for POC)

- Admin CRUD for the catalog (seed via migration).
- Multiple products / categories / cart (single product, single buy).
- Selling a store item back onto the marketplace (works for free via inventory, but
  not part of this POC's build/test).
- Refunds.

## Future extension

Because ownership is an `inventory.item`, a store-bought product can be listed on the
existing marketplace (`create_listing` → `buy_now`/bids) with no new schema. The store
and marketplace share one wallet + inventory core; the store is simply the primary
(mint) market, the marketplace the secondary (resale) market.

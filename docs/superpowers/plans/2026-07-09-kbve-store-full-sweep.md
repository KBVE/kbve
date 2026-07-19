# KBVE Store — Full Feature Sweep Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the complete KBVE credits-native store — product variants, staff admin, physical orders + fulfillment, Stripe credit on-ramp, and print-on-demand — on top of the shipped Phase 0 digital POC, all on PR #13980.

**Architecture:** Credits are the single spending rail. Stripe tops up credits; credits buy digital or physical goods; digital vs physical differ only in fulfillment. New Postgres schema objects (`store.product_variant`, `store.order*`, `store.topup`) + SECURITY DEFINER proxies mirror the Phase 0 pattern. Axum transports mirror `transport/store.rs` (public) and `transport/mc_lot.rs` (staff gate). Frontend extends `src/components/store/`.

**Tech Stack:** Postgres (dbmate migrations + schema mirror), Rust/Axum (diesel-async, utoipa, `async-stripe`), Astro + React islands + R3F, Tailwind.

## Global Constraints

- Spending currency is `credits` only. `khash` is out of scope for the store. (spec §Currency model)
- Payment is always a `wallet.service_debit`; the store never calls Stripe — only the Phase 3 on-ramp does. (spec §Vision)
- Public wrappers resolve account from `auth.uid()` — never accept a caller-supplied account id. (spec §Security)
- Service internals (`store.service_*`) are `service_role`-only; staff routes gate on `forum.is_staff`. (spec §Security)
- Every credit movement ledgered; orders idempotent on `idempotency_key`, top-ups idempotent on `stripe_event_id`. (spec §Security)
- Digital ownership lives in `inventory.item`; the one-owned-copy invariant (partial unique index) stands. (spec §Domain model)
- SQL: SECURITY DEFINER + `SET search_path = ''`, fully schema-qualified refs, `REVOKE ALL ... FROM PUBLIC, anon, authenticated` then targeted `GRANT`, end migrations with `NOTIFY pgrst, 'reload schema'`. Add a hand-authored mirror under `packages/data/sql/schema/store/`. (Phase 0 pattern)
- Migration timestamps must sort after `20260708120000`. Never edit an applied migration; each change is a new migration file.
- Builds via `node_modules/.bin/nx build <project>` from the worktree root (worktree has a symlinked root `node_modules`). Commit + push each task to `feat/astro-kbve-store-poc`.

**Pattern templates (read before implementing):** `packages/data/sql/dbmate/migrations/20260708120000_store_schema_init.sql` (proc/grant/proxy shape), `packages/rust/kbve/src/wallet/store.rs` (client), `apps/kbve/axum-kbve/src/transport/store.rs` (public transport), `apps/kbve/axum-kbve/src/transport/mc_lot.rs:368` (`require_staff` gate), `apps/kbve/astro-kbve/src/components/store/` (frontend island).

---

## PHASE 1 — Product variants + staff admin

### Task 1.1: `store.product_variant` schema + variant-aware catalog

**Files:**
- Create: `packages/data/sql/dbmate/migrations/20260709120000_store_variants.sql`
- Modify: `packages/data/sql/schema/store/store_core.sql` (mirror)

**Interfaces:**
- Produces SQL: table `store.product_variant(variant_id UUID pk, product_id UUID fk→store.product, sku TEXT unique, attributes JSONB, price BIGINT, stock BIGINT NULL, status TEXT, created_at)`; `public.proxy_store_product_detail_readonly(p_slug TEXT)` returning the product row + a `variants JSONB` array; extends `public.proxy_store_catalog_readonly()` to also return `fulfillment TEXT` and `variant_count BIGINT`.

- [ ] **Step 1: Write the failing migration test**

Create `packages/data/sql/dbmate/migration-tests/20260709120000_store_variants.test.sql` asserting: inserting a variant for the seeded product succeeds; `sku` is unique (duplicate raises); `stock` accepts NULL and a non-negative int (negative raises via CHECK); `proxy_store_product_detail_readonly('i-am-an-idiot')` returns a row whose `variants` is a JSONB array.

- [ ] **Step 2: Run the migration test to verify it fails**

Run: `cd packages/data/sql && ./run-migration-tests.sh 20260709120000` (or the repo's dbmate test entrypoint — check `packages/data/sql/project.json` targets). Expected: FAIL (objects don't exist).

- [ ] **Step 3: Write the migration**

Migrate:up — guard `to_regclass('store.product')`; `CREATE TABLE store.product_variant` (attributes JSONB CHECK object, price BIGINT CHECK >=0, stock BIGINT NULL CHECK stock >= 0, status TEXT CHECK in active/hidden/retired, `CONSTRAINT` fk ON DELETE CASCADE, unique sku); index on `(product_id) WHERE status='active'`. Add `public.proxy_store_product_detail_readonly(TEXT)` (STABLE, SECURITY DEFINER, search_path='') selecting the active product + `COALESCE(jsonb_agg(...) FILTER (WHERE v.variant_id IS NOT NULL), '[]')` of active variants. Replace `public.proxy_store_catalog_readonly()` to add `fulfillment` + `variant_count`. Grants: detail + catalog → anon, authenticated, service_role. `NOTIFY pgrst`. Migrate:down drops the new function signatures, the detail function, the variant table, and restores the prior catalog function body.

- [ ] **Step 4: Run the migration test to verify it passes**

Run the same command. Expected: PASS.

- [ ] **Step 5: Update the schema mirror + commit**

Mirror the table + function summaries into `store_core.sql`. `git add` migration + test + mirror; `git commit -m "feat(store): product_variant table + variant-aware catalog/detail proxies"`; `git push`.

### Task 1.2: WalletClient + DTOs for variants/detail

**Files:**
- Modify: `packages/rust/kbve/src/wallet/store.rs` (add `store_product_detail`, extend `store_catalog`)
- Modify: `packages/rust/kbve/src/wallet/types.rs` (add `StoreVariantRow`, `StoreProductDetail`; add `fulfillment: String`, `variant_count: i64` to `StoreProductRow`)

**Interfaces:**
- Consumes: `proxy_store_product_detail_readonly`, extended catalog columns (Task 1.1).
- Produces: `WalletClient::store_product_detail(slug: String) -> Result<StoreProductDetail>`; `StoreVariantRow { variant_id: Uuid, sku: String, attributes: serde_json::Value, price: i64, stock: Option<i64> }`; `StoreProductDetail { product: StoreProductRow, variants: Vec<StoreVariantRow> }`.

- [ ] **Step 1:** Add the types to `types.rs` (mirror the `StoreProductRow` derive style). Add `fulfillment` + `variant_count` fields to `StoreProductRow` and update its construction in `store.rs::map_product` (select `fulfillment`, `variant_count` in `store_catalog`'s SQL).
- [ ] **Step 2:** Add `store_product_detail` to `store.rs` using the anon `read()` pool + a `QueryableByName` row struct for `(product cols…, variants JSONB)`; parse `variants` with `serde_json::from_value`.
- [ ] **Step 3: Build.** Run `node_modules/.bin/nx build axum-kbve`. Expected: success.
- [ ] **Step 4: Commit.** `git commit -m "feat(store): wallet client store_product_detail + variant types"`; push.

### Task 1.3: Staff product/variant CRUD — SQL

**Files:**
- Create: `packages/data/sql/dbmate/migrations/20260709130000_store_admin_rpcs.sql`
- Modify: `store_core.sql` mirror

**Interfaces:**
- Produces SQL (all SECURITY DEFINER, service_role-only, callers pass a resolved staff actor uuid — the transport enforces `forum.is_staff`, the RPC trusts service_role): `store.service_upsert_product(p_slug, p_title, p_description, p_price, p_fulfillment, p_asset_ref, p_status) -> UUID`; `store.service_set_product_status(p_product_id, p_status)`; `store.service_upsert_variant(p_product_id, p_sku, p_attributes, p_price, p_stock, p_status) -> UUID`; `store.service_set_variant_status(p_variant_id, p_status)`. No `public.proxy_*` wrappers — staff writes go through the service-role client path (Task 1.4), not PostgREST.

- [ ] **Step 1: Migration test.** `..._store_admin_rpcs.test.sql`: `service_upsert_product` inserts then updates on conflicting slug; `service_upsert_variant` enforces the product fk; `service_set_*_status` flips status; retired products drop out of `proxy_store_catalog_readonly`.
- [ ] **Step 2: Run — fails.**
- [ ] **Step 3: Write migration.** Implement the four functions (UPSERT via `INSERT ... ON CONFLICT (slug|sku) DO UPDATE`), `ALTER FUNCTION ... OWNER TO service_role`, `REVOKE ALL ... FROM PUBLIC, anon, authenticated`, `GRANT EXECUTE ... TO service_role`. `NOTIFY pgrst`. Down drops all four.
- [ ] **Step 4: Run — passes.**
- [ ] **Step 5: Mirror + commit + push.**

### Task 1.4: Staff CRUD — WalletClient (service-role path)

**Files:** Modify `packages/rust/kbve/src/wallet/store.rs`, `types.rs`.

**Interfaces:**
- Produces: `WalletClient::store_upsert_product(req: StoreUpsertProduct) -> Result<Uuid>`, `store_set_product_status`, `store_upsert_variant(req: StoreUpsertVariant) -> Result<Uuid>`, `store_set_variant_status`. These use `self.write()` WITHOUT `set_user_claims` (they call `store.service_*` directly as service_role). Request structs in `types.rs`.

- [ ] **Step 1:** Add request structs to `types.rs`.
- [ ] **Step 2:** Add the four methods to `store.rs` (each a `write()` + `sql_query("SELECT store.service_*(...)")`, bind params, map errors).
- [ ] **Step 3: Build axum-kbve.** Expected success.
- [ ] **Step 4: Commit + push.**

### Task 1.5: Staff transport + routes

**Files:**
- Modify: `apps/kbve/axum-kbve/src/transport/store.rs` (add staff handlers + a local `require_staff` mirror), `transport/https.rs` (routes), `openapi.rs`.

**Interfaces:**
- Consumes: `require_staff(&HeaderMap) -> Result<String, Response>` (copy the shape from `transport/mc_lot.rs:368`, using `get_forum_service()`), the Task 1.4 client methods.
- Produces routes: `POST /api/v1/store/staff/products`, `PATCH /api/v1/store/staff/products/{product_id}`, `POST /api/v1/store/staff/products/{product_id}/status`, `POST /api/v1/store/staff/products/{product_id}/variants`, `POST /api/v1/store/staff/variants/{variant_id}/status`. DTOs: `StaffUpsertProductBody`, `StaffProductStatusBody`, `StaffUpsertVariantBody`, `StaffVariantStatusBody`, `StoreIdDto{ id: Uuid }`.

- [ ] **Step 1:** Add `require_staff` to `store.rs` (mirror mc_lot; on non-staff return 403 json). Add the DTOs + five handlers, each: `require_staff` → `get_wallet_client` → client call → `Json(StoreIdDto)` / `wallet_error_response`.
- [ ] **Step 2:** Register the five routes in `https.rs` after the existing store routes; add all handlers + DTOs to `openapi.rs` `paths(...)` and `schemas(...)`.
- [ ] **Step 3: Build axum-kbve.** Expected success.
- [ ] **Step 4:** Manual smoke via curl against a local run if available; else note deferred to e2e. Commit + push.

### Task 1.6: Frontend — catalog grid + product detail + staff admin

**Files:**
- Modify: `apps/kbve/astro-kbve/src/components/store/api.ts` (add `productDetail`, `staffUpsertProduct`, etc., + types).
- Create: `src/components/store/StoreCatalog.tsx` (grid over `catalog()`), `src/components/store/ProductDetail.tsx`, `src/components/store/StoreAdmin.tsx`, `AstroStoreAdminShell.astro`.
- Create: `src/content/docs/store/[slug].astro` OR keep single-product POC page; add `src/content/docs/dashboard/store/index.mdx` (staff admin, `data-auth-visibility: staff`).
- Modify: `astro.config.mjs` (dashboard "Store" admin entry).

**Interfaces:**
- Consumes: `GET /api/v1/store/products`, `/products/{slug}`, staff endpoints.
- Produces: `productDetail(slug)`, `staffUpsertProduct(body)`, `staffUpsertVariant(productId, body)`, `staffSetProductStatus`, `staffSetVariantStatus` in `api.ts`.

- [ ] **Step 1:** Extend `api.ts` with the detail + staff client fns + TS types (`StoreVariant`, `StoreProductDetail`).
- [ ] **Step 2:** Build `StoreCatalog` (renders products, links to detail; digital → existing card, physical/both → variant summary). Keep `ReactStoreCard` for the digital POC path.
- [ ] **Step 3:** Build `ProductDetail` (variant picker for physical/both; digital keeps the R3F reveal). Build `StoreAdmin` (staff CRUD forms; gated by `useSession().tone === 'staff'` or the staff flag).
- [ ] **Step 4:** Wire Astro shells + MDX pages + sidebar entry.
- [ ] **Step 5: Build astro-kbve.** Expected success (7000+ pages). Commit + push.

---

## PHASE 2 — Physical orders + fulfillment + refunds

### Task 2.1: `store.order` schema + status enum + event log

**Files:** Create `packages/data/sql/dbmate/migrations/20260709140000_store_orders.sql`; modify mirror.

**Interfaces:**
- Produces SQL: `store.order_status` ENUM (`paid, processing, shipped, delivered, cancelled, refunded`); `store.order` (per spec §Domain model, `idempotency_key UUID UNIQUE`, `ledger_id`, `twin_item_id`, `shipping_address JSONB`, `tracking JSONB`); `store.order_event` (append-only, INSERT-only trigger blocking UPDATE/DELETE, mirror `inventory.transition` trigger pattern); indexes `(account_id, created_at DESC)`, `(status, updated_at) WHERE status IN ('paid','processing')`.

- [ ] **Step 1: Migration test** — table accepts an order row; `idempotency_key` unique; event log blocks UPDATE/DELETE; enum transitions storable.
- [ ] **Step 2: Run — fails.**
- [ ] **Step 3: Write migration** (enum, tables, trigger fn `store.order_event_block_mutation`, indexes, grants: tables owned by service_role, no anon). `NOTIFY pgrst`. Down drops trigger, tables, enum.
- [ ] **Step 4: Run — passes.**
- [ ] **Step 5: Mirror + commit + push.**

### Task 2.2: Physical purchase RPC + `service_buy` dispatch

**Files:** Create `packages/data/sql/dbmate/migrations/20260709150000_store_buy_physical.sql`; modify mirror.

**Interfaces:**
- Produces SQL: `store.service_buy_physical(p_account UUID, p_variant_id UUID, p_qty BIGINT, p_shipping_address JSONB, p_idempotency_key UUID) -> BIGINT (order_id)`; `public.proxy_store_buy_physical(p_variant_id, p_qty, p_shipping_address, p_idempotency_key) -> BIGINT` (resolves `private.proxy_store_caller_account()`); `public.proxy_store_my_orders_readonly() -> TABLE(...)`.

- [ ] **Step 1: Migration test** — buy_physical: debits `price*qty` credits, decrements finite stock (guarded), inserts a `paid` order + event, mints a twin `inventory.item` when `fulfillment='both'`; idempotent replay on the same key returns the existing order without a second debit; insufficient credits raises 53100; out-of-stock raises a defined SQLSTATE; `proxy_store_my_orders_readonly` returns caller-scoped orders.
- [ ] **Step 2: Run — fails.**
- [ ] **Step 3: Write migration.** `service_buy_physical`: advisory lock on `(account:variant)`; replay check on `store.order.idempotency_key`; resolve variant+product (active, fulfillment physical|both); `IF stock IS NOT NULL THEN UPDATE ... SET stock = stock - qty WHERE stock >= qty` (no row → raise out-of-stock); `wallet.service_debit(credits, price*qty, 'purchase', 'store_order', NULL, key)`; if `fulfillment='both'` mint twin item (reuse the Phase 0 mint block); insert order(`paid`) + event; RETURN order_id. Add `proxy_store_buy_physical` wrapper + `proxy_store_my_orders_readonly`. Grants. `NOTIFY pgrst`. Down drops all three.
- [ ] **Step 4: Run — passes.**
- [ ] **Step 5: Mirror + commit + push.**

### Task 2.3: Staff fulfillment + refund RPCs

**Files:** Create `packages/data/sql/dbmate/migrations/20260709160000_store_fulfillment.sql`; modify mirror.

**Interfaces:**
- Produces SQL: `store.service_advance_order(p_order_id BIGINT, p_to_status store.order_status, p_tracking JSONB, p_note TEXT)` (validates legal transitions: paid→processing→shipped→delivered, any non-terminal→cancelled); `store.service_refund_order(p_order_id BIGINT, p_reason TEXT)` (credit back via `wallet.service_credit(source_kind='refund')`, restore finite stock, status→refunded, consume twin item if present); `public.proxy_store_staff_list_orders(p_status, p_limit, p_before_id)` (staff-only via `forum.is_staff` — but since staff enforcement is transport-side, expose as service_role-only `store.service_list_orders`).

- [ ] **Step 1: Migration test** — advance enforces legal transitions (illegal raises), records events + tracking; refund credits the account, restores stock, sets refunded, consumes twin; double-refund is a no-op/raises.
- [ ] **Step 2: Run — fails.**
- [ ] **Step 3: Write migration.** Implement all functions; transition validation via a `CASE`/lookup; refund uses `wallet.service_credit`. Grants service_role-only. `NOTIFY pgrst`. Down drops.
- [ ] **Step 4: Run — passes.**
- [ ] **Step 5: Mirror + commit + push.**

### Task 2.4: Orders — WalletClient + transport + routes

**Files:** Modify `wallet/store.rs`, `types.rs`, `transport/store.rs`, `https.rs`, `openapi.rs`.

**Interfaces:**
- Produces client: `store_buy_physical(user_id, StoreBuyPhysical) -> Result<i64>`, `store_my_orders(user_id) -> Result<Vec<StoreOrderRow>>`, `store_list_orders(filter) -> Result<Vec<StoreOrderRow>>` (service-role), `store_advance_order(StoreAdvanceOrder)`, `store_refund_order(order_id, reason)`.
- Produces routes: `POST /api/v1/store/variants/{variant_id}/buy` (auth, body `{qty, shipping_address, idempotency_key}`), `GET /api/v1/store/me/orders` (auth), `GET /api/v1/store/staff/orders` (staff), `POST /api/v1/store/staff/orders/{order_id}/advance` (staff), `POST /api/v1/store/staff/orders/{order_id}/refund` (staff).

- [ ] **Step 1:** Add row/request types to `types.rs` (`StoreOrderRow`, `StoreBuyPhysical`, `StoreAdvanceOrder`).
- [ ] **Step 2:** Add the five client methods to `store.rs` (auth methods use `set_user_claims`; staff/service methods use `write()` direct).
- [ ] **Step 3:** Add transport handlers + DTOs + register routes + openapi.
- [ ] **Step 4: Build axum-kbve.** Commit + push.

### Task 2.5: Frontend — variant buy + address form + order history + staff order queue

**Files:** Modify `store/api.ts`; create `src/components/store/CheckoutModal.tsx` (address form), `OrderHistory.tsx`, `StaffOrderQueue.tsx`; wire into `ProductDetail`, `StoreAdmin`, MDX pages.

- [ ] **Step 1:** `api.ts`: `buyPhysical(variantId, {qty, shipping_address, idempotency_key})`, `myOrders()`, `staffListOrders(status?)`, `staffAdvanceOrder(id, body)`, `staffRefundOrder(id, reason)` + types.
- [ ] **Step 2:** `CheckoutModal` — address fields (name, lines, city, region, postal, country), qty, submit → `buyPhysical` → success/402/out-of-stock handling + wallet BroadcastChannel refresh.
- [ ] **Step 3:** `OrderHistory` (caller orders + status), `StaffOrderQueue` (advance status + tracking, refund).
- [ ] **Step 4:** Wire into detail + dashboard admin + `/dashboard/store/orders/` page.
- [ ] **Step 5: Build astro-kbve.** Commit + push.

---

## PHASE 3 — Stripe → credits on-ramp

### Task 3.1: `store.topup` schema + credit-grant RPC

**Files:** Create `packages/data/sql/dbmate/migrations/20260709170000_store_topup.sql`; modify mirror.

**Interfaces:**
- Produces SQL: `store.topup` (per spec, `stripe_event_id TEXT UNIQUE`); `store.service_apply_topup(p_account UUID, p_stripe_event_id TEXT, p_stripe_session_id TEXT, p_credits BIGINT, p_amount_cents BIGINT, p_currency_fiat TEXT) -> BIGINT` (idempotent insert on `stripe_event_id`; on fresh row calls `wallet.service_credit(credits, source_kind='topup')`; returns ledger_id; replay returns the existing ledger_id).

Note: `source_kind='topup'` must be added to `wallet.source_kind` — check whether it exists; if not, this task's migration also runs `ALTER TYPE wallet.source_kind ADD VALUE IF NOT EXISTS 'topup'` in its own migration **before** any function that references it (enum add + use cannot share a txn in older PG; use a separate earlier migration `20260709165000_wallet_source_kind_topup.sql`). Also add `Topup => "topup"` to the Rust `SourceKind` enum in `packages/rust/kbve/src/wallet/types.rs`.

- [ ] **Step 1:** Create `20260709165000_wallet_source_kind_topup.sql` adding the enum value; add `Topup => "topup"` to `types.rs`.
- [ ] **Step 2: Migration test** for topup: idempotent on `stripe_event_id`; credits the account via ledger; replay no-ops.
- [ ] **Step 3: Run — fails.**
- [ ] **Step 4: Write the topup migration** (table + `service_apply_topup`). Grants service_role-only. `NOTIFY pgrst`.
- [ ] **Step 5: Run — passes.** Mirror + commit + push.

### Task 3.2: Stripe dependency + config

**Files:** Modify root `package.json`/`Cargo.toml` workspace (add `async-stripe`), `apps/kbve/axum-kbve/Cargo.toml`; add config keys (Stripe secret key, webhook secret, price/credit-pack map) to the axum-kbve config loader + a sealed-secret note.

**Interfaces:**
- Produces: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STORE_CREDIT_PACKS` env/config surfaced to the axum service.

- [ ] **Step 1:** Add `async-stripe` (or `stripe-rust`) to the workspace deps at the pinned version; `nx build axum-kbve` to fetch/compile the dep only (empty usage). Expected success.
- [ ] **Step 2:** Add config fields (Option-typed; absence disables the on-ramp routes gracefully — return 503). Document required sealed secrets in the PR body + `docs/`. Commit + push.

**External dependency (cannot be provisioned in-agent):** real Stripe keys + a webhook endpoint registration. Code paths must degrade to 503 when unset so builds/e2e pass without them.

### Task 3.3: Checkout + webhook transport

**Files:** Create `apps/kbve/axum-kbve/src/transport/topup.rs`; modify `transport/mod.rs`, `https.rs`, `openapi.rs`, `wallet/store.rs` (client `store_apply_topup`).

**Interfaces:**
- Produces routes: `POST /api/v1/wallet/topup/checkout` (auth → create Stripe Checkout Session for a chosen credit pack → return `{ checkout_url }`), `POST /api/v1/wallet/topup/webhook` (no auth header; verify `Stripe-Signature` with `STRIPE_WEBHOOK_SECRET`; on `checkout.session.completed` resolve account from session metadata `account_id` → `store_apply_topup`). Client `store_apply_topup(...) -> Result<i64>`.

- [ ] **Step 1:** Add `store_apply_topup` to `wallet/store.rs` (service-role write).
- [ ] **Step 2:** Implement `topup.rs`: checkout handler (build session with `metadata.account_id`, `success_url`/`cancel_url`, line item = credit pack price id); webhook handler (raw body extractor, signature verify, event dispatch, idempotent apply). 503 when Stripe unconfigured.
- [ ] **Step 3:** Register routes + openapi. `nx build axum-kbve`. Expected success.
- [ ] **Step 4:** Commit + push.

### Task 3.4: Frontend — Buy Credits

**Files:** Modify `store/api.ts` (`topupCheckout(packId)`), wallet card / a `BuyCredits.tsx` island; add a "Buy credits" entry near the wallet balance.

- [ ] **Step 1:** `api.ts`: `topupCheckout(packId) -> { checkout_url }`; redirect `window.location = checkout_url`.
- [ ] **Step 2:** `BuyCredits` island (pack selector → checkout redirect); mount on `/store/` and the wallet card.
- [ ] **Step 3: Build astro-kbve.** Commit + push.

---

## PHASE 4 — Print-on-demand fulfillment

### Task 4.1: POD adapter + auto-submit on paid

**Files:** Create `apps/kbve/axum-kbve/src/transport/pod.rs` (Printful/Printify client); create `packages/data/sql/dbmate/migrations/20260709180000_store_pod.sql` (add `pod_ref JSONB` to `store.order`, `store.service_attach_pod_ref`); modify config (POD api key), `https.rs` (POD webhook route).

**Interfaces:**
- Produces: on a physical order reaching `paid`, submit to POD (background task or explicit staff action `POST /api/v1/store/staff/orders/{id}/submit-pod`); POD shipment webhook → `store.service_advance_order(..., 'shipped', tracking)`. `pod_ref` stores the external order id.

- [ ] **Step 1:** Migration: `ALTER TABLE store.order ADD COLUMN pod_ref JSONB DEFAULT '{}'`; `store.service_attach_pod_ref(order_id, pod_ref)`. Migration test. Run fail→pass.
- [ ] **Step 2:** `pod.rs`: submit-order + a webhook handler mapping POD shipment events → `advance_order`. Degrade to 503/no-op when POD unconfigured.
- [ ] **Step 3:** Staff `submit-pod` route + POD webhook route + openapi.
- [ ] **Step 4: Build axum-kbve.** Commit + push.

**External dependency:** POD provider account + API key + webhook registration. Not provisionable in-agent; code degrades gracefully when unset.

### Task 4.2: E2E + migration-test sweep + docs

**Files:** `apps/kbve/axum-kbve-e2e/` (store suite), PR body update, `docs/`.

- [ ] **Step 1:** Add axum-kbve-e2e cases: digital buy (402 when broke, 200 + entitlement funded, idempotent), physical buy (order created, stock decremented, out-of-stock), staff advance/refund, topup apply idempotency. Use a funded test JWT.
- [ ] **Step 2:** Run the store migration-tests + e2e locally where a DB is available; document any that require live infra (Stripe/POD).
- [ ] **Step 3:** Update PR #13980 body with the full phase list, required sealed secrets (Stripe/POD), and the `kbve.com/application/kubernetes/` docs link. Commit + push.

---

## Self-Review

**Spec coverage:** Currency model → Global Constraints + Task 3.1 enum. Product model → 1.1. Variants → 1.1. Orders/fulfillment → 2.1–2.4. Refund → 2.3. Stripe on-ramp → 3.1–3.4. POD → 4.1. Admin → 1.3–1.6. Security invariants → enforced per-task (service-role RPCs, `require_staff`, `auth.uid()` wrappers, idempotency uniques). Frontend → 1.6, 2.5, 3.4. Out-of-scope items (tax, subscriptions, khash pricing) correctly absent.

**Placeholder scan:** External-integration tasks (3.2, 3.3, 4.1) name the real dependency and require graceful 503 degradation so builds/e2e pass without live keys — this is an explicit constraint, not a placeholder.

**Type consistency:** `StoreProductRow` extended in 1.2 and consumed in 1.6; `StoreOrderRow`/`StoreBuyPhysical` defined in 2.4 and consumed in 2.5; `SourceKind::Topup` added in 3.1 and used in 3.3. `store.service_advance_order` defined in 2.3 and reused by POD webhook in 4.1.

## Known external blockers (surface to user before Phase 3/4 execution)
- Stripe: secret key, webhook signing secret, credit-pack price ids, webhook endpoint registration.
- POD: provider choice (Printful vs Printify), API key, product/variant mapping, webhook registration.
- A live Postgres (kilobase) to run migration-tests + a funded test account for e2e.

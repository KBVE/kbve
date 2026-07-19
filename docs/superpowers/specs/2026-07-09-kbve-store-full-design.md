# KBVE Store — Full Design (Credits-Native Commerce)

Date: 2026-07-09
Status: Approved (brainstorm), phased implementation
Supersedes scope of: `2026-07-08-astro-kbve-store-poc-design.md` (that POC is Phase 0 here)
Branch / PR: `feat/astro-kbve-store-poc` → PR #13980 (all phases push here)

## Vision

A first-party store where **credits are the single spending currency** for
everything KBVE sells — digital collectibles, cosmetics, and physical
merchandise (shirts, etc.). Credits are a real-money-backed virtual currency:
users buy credits with Stripe (the on-ramp), then spend credits on any product.

```
Stripe checkout ──(webhook)──▶ wallet.service_credit (source_kind='topup') ──▶ credits balance
credits balance ──▶ store purchase (wallet.service_debit) ──▶ digital mint AND/OR physical order
```

**Central architectural principle:** payment is uniform (always a credit
debit). Digital vs physical differ only in **fulfillment**, never in payment.
There is exactly one spending rail. This is what makes the whole system
tractable: the store never touches Stripe — only the on-ramp does.

Ownership of digital goods stays in `inventory.item` (marketplace-native, per
the Phase 0 POC). Physical goods introduce a new axis: **orders** with async
fulfillment.

## Currency model

- `credits` (existing `wallet.currency_kind`) is the store currency for ALL
  products. `khash` remains the marketplace/auction currency and is out of
  scope for the store.
- Credits enter the wallet only via authoritative server paths:
  `wallet.service_credit` (rewards, coupons, and — new — Stripe top-ups).
  Never client-trusted.
- Credit supply governance is a product concern, not an engineering one, but
  because physical goods now consume credits, **top-up must be the dominant
  credit source** and reward/coupon grants must be sized accordingly. Flagged
  for product; the engineering guarantee is only that every credit movement is
  ledgered and auditable (`wallet.ledger` + `wallet.verify_balance`).

## Domain model (target end-state)

### store.product (catalog)
Phase 0 table, extended:
```
store.product (
    product_id  UUID PK,
    slug        TEXT UNIQUE,
    title       TEXT,
    description TEXT,
    price       BIGINT,              -- credits; base price / digital price
    currency    wallet.currency_kind DEFAULT 'credits',
    fulfillment TEXT DEFAULT 'digital'   -- digital | physical | both
                CHECK (fulfillment IN ('digital','physical','both')),
    asset_ref   JSONB,               -- PUBLIC, client-safe render descriptor
    status      TEXT DEFAULT 'active',   -- active | hidden | retired
    created_at  TIMESTAMPTZ
)
```

### store.product_variant (Phase 1)
Physical/both products sell a variant (size/color); digital products may have a
single implicit variant or none.
```
store.product_variant (
    variant_id  UUID PK,
    product_id  UUID REFERENCES store.product(product_id) ON DELETE CASCADE,
    sku         TEXT UNIQUE,
    attributes  JSONB,               -- {"size":"L","color":"black"}
    price       BIGINT,              -- credits; overrides product.price
    stock       BIGINT NULL,         -- NULL = unlimited (print-on-demand / digital)
    status      TEXT DEFAULT 'active',
    created_at  TIMESTAMPTZ
)
```
Stock, when non-NULL, is decremented atomically inside the purchase txn and
guarded (`stock >= 0`). NULL stock skips the decrement (digital + POD).

### store.order (Phase 2)
Created for `physical` and `both` purchases. Digital-only purchases never
create an order.
```
store.order (
    order_id        BIGINT GENERATED ALWAYS AS IDENTITY PK,
    account_id      UUID REFERENCES wallet.account(id),
    product_id      UUID,
    variant_id      UUID NULL,
    qty             BIGINT DEFAULT 1,
    credits_amount  BIGINT,          -- total credits debited
    ledger_id       BIGINT,          -- the debit ledger row
    twin_item_id    UUID NULL,       -- inventory.item minted for 'both'
    status          store.order_status DEFAULT 'paid',
    shipping_address JSONB,          -- name, lines, city, region, postal, country
    tracking        JSONB DEFAULT '{}'::jsonb,   -- carrier, number, url
    idempotency_key UUID UNIQUE,
    created_at      TIMESTAMPTZ,
    updated_at      TIMESTAMPTZ
)

store.order_status ENUM:
  paid → processing → shipped → delivered
  cancelled, refunded  (terminal side-branches)
store.order_event (append-only audit: order_id, from_status, to_status,
                   actor, note, metadata, created_at)
```
Because the credit debit already succeeded, an order is born `paid` (no
`pending`). Payment failure means no order row exists at all — the debit and
the order insert share one txn.

### store.topup (Phase 3, wallet on-ramp)
```
store.topup (
    topup_id           BIGINT IDENTITY PK,
    account_id         UUID,
    stripe_event_id    TEXT UNIQUE,     -- idempotency on the webhook
    stripe_session_id  TEXT,
    credits_granted    BIGINT,
    amount_cents       BIGINT,
    currency_fiat      TEXT,            -- 'usd'
    ledger_id          BIGINT,          -- the wallet.service_credit row
    status             TEXT,            -- completed | refunded
    created_at         TIMESTAMPTZ
)
```

## Transaction flows

### Digital purchase (Phase 0, live)
`proxy_store_buy(slug, key)` → advisory lock → dupe-guard → debit → mint
`inventory.item(kind=store_product, ref=slug)`. Terminal.

### Physical / both purchase (Phase 2)
`proxy_store_buy_physical(variant_id, qty, address, key)`:
1. Advisory lock on `(account, variant)`.
2. Resolve variant + product (active); compute `credits_amount = price*qty`.
3. If `stock` non-NULL: `UPDATE ... SET stock = stock - qty WHERE stock >= qty`
   (guarded; raises out-of-stock on no row).
4. `wallet.service_debit(credits, credits_amount, 'purchase', ref='order', key)`.
5. `both` → mint the digital twin `inventory.item`, capture `twin_item_id`.
6. Insert `store.order(status='paid', ...)` + `store.order_event`.
All in one txn. Insufficient credits (53100) or out-of-stock rolls back
everything. Idempotent on `idempotency_key` (unique on `store.order`; replay
returns the existing order).

`service_buy` becomes a dispatcher on `product.fulfillment` so the client has
one conceptual "buy" per product; the digital and physical entrypoints share
the debit core.

### Refund (Phase 2)
Staff action: `store.service_refund_order(order_id, reason)` → credit back via
`wallet.service_credit(source_kind='refund')`, restore stock, status→`refunded`,
event row. Digital twin (if any) transitions to `consumed` (revoked).

### Stripe top-up (Phase 3)
Stripe Checkout Session for a credit pack → Stripe webhook
(`checkout.session.completed`) → verify signature → idempotent insert
`store.topup(stripe_event_id)` → `wallet.service_credit(credits, 'topup')`.
Webhook replay is a no-op via the `stripe_event_id` unique constraint.

## Backend surface (axum-kbve)

### Public / caller (authenticated where noted)
- `GET  /api/v1/store/products` — catalog (anon). Includes `fulfillment` + variants summary.
- `GET  /api/v1/store/products/{slug}` — product detail + variants (anon).
- `GET  /api/v1/store/me/entitlements` — owned digital goods (auth). *(Phase 0)*
- `GET  /api/v1/store/me/orders` — caller's orders (auth). *(Phase 2)*
- `POST /api/v1/store/products/{slug}/buy` — digital buy (auth). *(Phase 0)*
- `POST /api/v1/store/variants/{variant_id}/buy` — physical/both buy + address (auth). *(Phase 2)*

### Staff (behind `forum.is_staff`) *(Phase 1–2)*
- `POST /api/v1/store/staff/products` — create; `PATCH .../{id}` — update; `POST .../{id}/status`.
- `POST /api/v1/store/staff/products/{id}/variants` — add/update variants.
- `GET  /api/v1/store/staff/orders` — queue; `POST .../orders/{id}/advance` (set status + tracking); `POST .../orders/{id}/refund`.

### On-ramp *(Phase 3)*
- `POST /api/v1/wallet/topup/checkout` — create Stripe Checkout Session (auth).
- `POST /api/v1/wallet/topup/webhook` — Stripe webhook (signature-verified, no auth header).

All backed by SECURITY DEFINER proxies mirroring the Phase 0 pattern:
`private.proxy_store_caller_account()` for auth; `forum.is_staff` gate for
staff; service-role internals (`store.service_*`) never exposed to PostgREST.

## Frontend (astro-kbve)

- `src/components/store/` — catalog grid, product detail, variant picker,
  address form, order history, R3F previews for digital cards. `client:only`
  islands, `store/api.ts` client (extends Phase 0).
- Digital product card = current WebGL reveal. Physical product card = variant
  select + "Buy · N credits" → address modal → order confirmation.
- `/store/` catalog + `/store/{slug}/` detail (MDX shells). `/dashboard/store/`
  staff admin (products, orders). Credit balance + a "Buy credits" (Stripe)
  entry on the wallet card *(Phase 3)*.
- Wallet balance refresh via existing `BroadcastChannel('kbve-wallet-sync')`.

## Phasing

- **Phase 0 — Digital POC (this PR, mostly done).** `store.product` + digital
  mint + WebGL card + the `fulfillment` column (default `digital`) added now for
  forward-compat. Ship the "I am an idiot" card. *No orders, no variants, no
  Stripe.*
- **Phase 1 — Product management.** `store.product_variant`; staff CRUD RPCs +
  `/dashboard/store/` admin; catalog exposes `fulfillment` + variants. Products
  managed via API, not migrations.
- **Phase 2 — Physical orders.** `store.order` + `order_status` + `order_event`;
  physical/both purchase flow with shipping address + stock; manual staff
  fulfillment (status + tracking); refunds. `service_buy` dispatcher.
- **Phase 3 — Stripe on-ramp.** `store.topup`; Checkout + webhook →
  `wallet.service_credit`; "Buy credits" UI.
- **Phase 4 — Print-on-demand.** Printful/Printify adapter behind the Phase 2
  order status pipeline (auto-submit on `paid`, tracking webhook → `shipped`).
  No schema change — slots into the existing order lifecycle.

Each phase is independently shippable and testable (dbmate migration-tests +
axum-kbve-e2e + manual store walkthrough with a funded test account).

## Security & invariants

- Public wrappers resolve the account from `auth.uid()` — never accept a
  caller-supplied account id (prevents spoofing). Confirmed in Phase 0.
- Service internals (`store.service_*`) are `service_role`-only.
- Staff routes gate on `forum.is_staff` (existing pattern from mc_lot).
- One-owned-copy invariant for digital goods via the partial unique index
  (Phase 0). Stock invariants via guarded `UPDATE ... WHERE stock >= qty`.
- Every credit movement is ledgered; orders and top-ups are idempotent
  (`idempotency_key` / `stripe_event_id` unique).
- Stripe webhook verifies the signature and is replay-safe.
- `asset_ref` is public/anon-readable by contract; never store secrets there.

## Out of scope (explicitly)

- Multi-currency store pricing (khash pricing) — credits only.
- Tax / VAT calculation, address validation service — Phase 2 collects address
  as-is; validation is a later concern.
- Subscriptions / recurring billing.
- International shipping-rate calculation (flat or credit-priced shipping only).

## Open questions for product (non-blocking for engineering)

- Credit pack pricing + reward/coupon credit sizing (supply governance).
- Whether physical shipping is a separate credit line-item or baked into price.
- Return/exchange policy (affects refund + order states).

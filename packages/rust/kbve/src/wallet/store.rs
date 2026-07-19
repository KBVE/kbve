//! Store client surface. Wraps the store PostgREST proxies:
//!
//!   public.proxy_store_catalog_readonly
//!   public.proxy_store_my_entitlements_readonly
//!   public.proxy_store_buy
//!
//! The catalog read is anon-callable (read pool, no claims). The entitlements
//! read is caller-scoped: on AccountMissing (WLT01) it falls back to the rw
//! pool so the lazy-provision trigger fires, mirroring market.rs. The buy
//! write mints an inventory.item after an authoritative credit debit.

use chrono::{DateTime, Utc};
use diesel::OptionalExtension;
use diesel::QueryableByName;
use diesel::sql_query;
use diesel::sql_types::{Jsonb, Nullable, Text, Timestamptz};
use diesel_async::{AsyncConnection, AsyncPgConnection, RunQueryDsl};
use uuid::Uuid;

use super::client::{WalletClient, set_user_claims};
use super::error::{Result, WalletError};
use super::types::*;

#[derive(QueryableByName)]
struct ProductRowDb {
    #[diesel(sql_type = diesel::sql_types::Uuid)]
    product_id: Uuid,
    #[diesel(sql_type = Text)]
    slug: String,
    #[diesel(sql_type = Text)]
    title: String,
    #[diesel(sql_type = Nullable<Text>)]
    description: Option<String>,
    #[diesel(sql_type = diesel::sql_types::BigInt)]
    price: i64,
    #[diesel(sql_type = Text)]
    currency: String,
    #[diesel(sql_type = Text)]
    fulfillment: String,
    #[diesel(sql_type = Jsonb)]
    asset_ref: serde_json::Value,
    #[diesel(sql_type = diesel::sql_types::BigInt)]
    variant_count: i64,
    #[diesel(sql_type = Timestamptz)]
    created_at: DateTime<Utc>,
}

#[derive(QueryableByName)]
struct ProductDetailRowDb {
    #[diesel(sql_type = diesel::sql_types::Uuid)]
    product_id: Uuid,
    #[diesel(sql_type = Text)]
    slug: String,
    #[diesel(sql_type = Text)]
    title: String,
    #[diesel(sql_type = Nullable<Text>)]
    description: Option<String>,
    #[diesel(sql_type = diesel::sql_types::BigInt)]
    price: i64,
    #[diesel(sql_type = Text)]
    currency: String,
    #[diesel(sql_type = Text)]
    fulfillment: String,
    #[diesel(sql_type = Jsonb)]
    asset_ref: serde_json::Value,
    #[diesel(sql_type = Timestamptz)]
    created_at: DateTime<Utc>,
    #[diesel(sql_type = Jsonb)]
    variants: serde_json::Value,
}

#[derive(QueryableByName)]
struct EntitlementRowDb {
    #[diesel(sql_type = diesel::sql_types::Uuid)]
    item_id: Uuid,
    #[diesel(sql_type = Text)]
    slug: String,
    #[diesel(sql_type = diesel::sql_types::Uuid)]
    product_id: Uuid,
    #[diesel(sql_type = Nullable<Text>)]
    title: Option<String>,
    #[diesel(sql_type = Timestamptz)]
    granted_at: DateTime<Utc>,
}

#[derive(QueryableByName)]
struct ScalarUuid {
    #[diesel(sql_type = diesel::sql_types::Uuid)]
    value: Uuid,
}

#[derive(QueryableByName)]
struct ScalarBigInt {
    #[diesel(sql_type = diesel::sql_types::BigInt)]
    value: i64,
}

#[derive(QueryableByName)]
struct ScalarJson {
    #[diesel(sql_type = Nullable<Jsonb>)]
    value: Option<serde_json::Value>,
}

#[derive(QueryableByName)]
struct OrderRowDb {
    #[diesel(sql_type = diesel::sql_types::BigInt)]
    order_id: i64,
    #[diesel(sql_type = diesel::sql_types::Uuid)]
    product_id: Uuid,
    #[diesel(sql_type = Nullable<diesel::sql_types::Uuid>)]
    variant_id: Option<Uuid>,
    #[diesel(sql_type = diesel::sql_types::BigInt)]
    qty: i64,
    #[diesel(sql_type = diesel::sql_types::BigInt)]
    credits_amount: i64,
    #[diesel(sql_type = Text)]
    status: String,
    #[diesel(sql_type = Jsonb)]
    tracking: serde_json::Value,
    #[diesel(sql_type = Timestamptz)]
    created_at: DateTime<Utc>,
    #[diesel(sql_type = Timestamptz)]
    updated_at: DateTime<Utc>,
}

#[derive(QueryableByName)]
struct OrderStaffRowDb {
    #[diesel(sql_type = diesel::sql_types::BigInt)]
    order_id: i64,
    #[diesel(sql_type = diesel::sql_types::Uuid)]
    account_id: Uuid,
    #[diesel(sql_type = diesel::sql_types::Uuid)]
    product_id: Uuid,
    #[diesel(sql_type = Nullable<diesel::sql_types::Uuid>)]
    variant_id: Option<Uuid>,
    #[diesel(sql_type = diesel::sql_types::BigInt)]
    qty: i64,
    #[diesel(sql_type = diesel::sql_types::BigInt)]
    credits_amount: i64,
    #[diesel(sql_type = Text)]
    status: String,
    #[diesel(sql_type = Jsonb)]
    shipping_address: serde_json::Value,
    #[diesel(sql_type = Jsonb)]
    tracking: serde_json::Value,
    #[diesel(sql_type = Timestamptz)]
    created_at: DateTime<Utc>,
    #[diesel(sql_type = Timestamptz)]
    updated_at: DateTime<Utc>,
}

fn map_order(r: OrderRowDb) -> StoreOrderRow {
    StoreOrderRow {
        order_id: r.order_id,
        product_id: r.product_id,
        variant_id: r.variant_id,
        qty: r.qty,
        credits_amount: r.credits_amount,
        status: r.status,
        tracking: r.tracking,
        created_at: r.created_at,
        updated_at: r.updated_at,
    }
}

async fn my_orders_async(
    conn: &mut AsyncPgConnection,
    limit: i32,
    before_created_at: Option<DateTime<Utc>>,
    before_id: Option<i64>,
) -> Result<Vec<StoreOrderRow>> {
    let rows: Vec<OrderRowDb> = sql_query(
        "SELECT order_id, product_id, variant_id, qty, credits_amount, \
                status::text AS status, tracking, created_at, updated_at \
         FROM public.proxy_store_my_orders_readonly($1, $2, $3)",
    )
    .bind::<diesel::sql_types::Integer, _>(limit)
    .bind::<Nullable<Timestamptz>, _>(before_created_at)
    .bind::<Nullable<diesel::sql_types::BigInt>, _>(before_id)
    .get_results(conn)
    .await
    .map_err(WalletError::from_diesel)?;
    Ok(rows.into_iter().map(map_order).collect())
}

fn map_product(r: ProductRowDb) -> Result<StoreProductRow> {
    let currency = CurrencyKind::from_pg(&r.currency)
        .ok_or_else(|| WalletError::InvalidArgument(format!("unknown currency: {}", r.currency)))?;
    Ok(StoreProductRow {
        product_id: r.product_id,
        slug: r.slug,
        title: r.title,
        description: r.description,
        price: r.price,
        currency,
        fulfillment: r.fulfillment,
        asset_ref: r.asset_ref,
        variant_count: r.variant_count,
        created_at: r.created_at,
    })
}

fn map_entitlement(r: EntitlementRowDb) -> StoreEntitlementRow {
    StoreEntitlementRow {
        item_id: r.item_id,
        slug: r.slug,
        product_id: r.product_id,
        title: r.title,
        granted_at: r.granted_at,
    }
}

async fn my_entitlements_async(
    conn: &mut AsyncPgConnection,
) -> Result<Vec<StoreEntitlementRow>> {
    let rows: Vec<EntitlementRowDb> = sql_query(
        "SELECT item_id, slug, product_id, title, granted_at \
         FROM public.proxy_store_my_entitlements_readonly()",
    )
    .get_results(conn)
    .await
    .map_err(WalletError::from_diesel)?;
    Ok(rows.into_iter().map(map_entitlement).collect())
}

impl WalletClient {
    // -------------------------------------------------------------------
    // Anon-safe catalog (no auth claims; uses read pool)
    // -------------------------------------------------------------------

    pub async fn store_catalog(&self) -> Result<Vec<StoreProductRow>> {
        let mut conn = self.read().await?;
        let rows: Vec<ProductRowDb> = sql_query(
            "SELECT product_id, slug, title, description, price, \
                    currency::text AS currency, fulfillment, asset_ref, \
                    variant_count, created_at \
             FROM public.proxy_store_catalog_readonly()",
        )
        .get_results(&mut *conn)
        .await
        .map_err(WalletError::from_diesel)?;
        rows.into_iter().map(map_product).collect()
    }

    pub async fn store_product_detail(&self, slug: String) -> Result<Option<StoreProductDetail>> {
        let mut conn = self.read().await?;
        let row: Option<ProductDetailRowDb> = sql_query(
            "SELECT product_id, slug, title, description, price, \
                    currency::text AS currency, fulfillment, asset_ref, \
                    created_at, variants \
             FROM public.proxy_store_product_detail_readonly($1)",
        )
        .bind::<Text, _>(slug)
        .get_result(&mut *conn)
        .await
        .optional()
        .map_err(WalletError::from_diesel)?;
        let Some(r) = row else { return Ok(None) };
        let currency = CurrencyKind::from_pg(&r.currency).ok_or_else(|| {
            WalletError::InvalidArgument(format!("unknown currency: {}", r.currency))
        })?;
        let variants: Vec<StoreVariantRow> = serde_json::from_value(r.variants)
            .map_err(|e| WalletError::InvalidArgument(format!("bad variants json: {e}")))?;
        Ok(Some(StoreProductDetail {
            product: StoreProductRow {
                product_id: r.product_id,
                slug: r.slug,
                title: r.title,
                description: r.description,
                price: r.price,
                currency,
                fulfillment: r.fulfillment,
                asset_ref: r.asset_ref,
                variant_count: variants.len() as i64,
                created_at: r.created_at,
            },
            variants,
        }))
    }

    // -------------------------------------------------------------------
    // Staff writes (service_role; caller-staff enforced at transport)
    // -------------------------------------------------------------------

    pub async fn store_upsert_product(&self, req: StoreUpsertProduct) -> Result<Uuid> {
        let mut conn = self.write().await?;
        let row: ScalarUuid = sql_query(
            "SELECT store.service_upsert_product($1, $2, $3, $4, $5, $6, $7) AS value",
        )
        .bind::<Text, _>(req.slug)
        .bind::<Text, _>(req.title)
        .bind::<Nullable<Text>, _>(req.description)
        .bind::<diesel::sql_types::BigInt, _>(req.price)
        .bind::<Text, _>(req.fulfillment)
        .bind::<Jsonb, _>(req.asset_ref)
        .bind::<Text, _>(req.status)
        .get_result(&mut *conn)
        .await
        .map_err(WalletError::from_diesel)?;
        Ok(row.value)
    }

    pub async fn store_set_product_status(&self, product_id: Uuid, status: String) -> Result<()> {
        let mut conn = self.write().await?;
        sql_query("SELECT store.service_set_product_status($1, $2)")
            .bind::<diesel::sql_types::Uuid, _>(product_id)
            .bind::<Text, _>(status)
            .execute(&mut *conn)
            .await
            .map_err(WalletError::from_diesel)?;
        Ok(())
    }

    pub async fn store_upsert_variant(&self, req: StoreUpsertVariant) -> Result<Uuid> {
        let mut conn = self.write().await?;
        let row: ScalarUuid = sql_query(
            "SELECT store.service_upsert_variant($1, $2, $3, $4, $5, $6) AS value",
        )
        .bind::<diesel::sql_types::Uuid, _>(req.product_id)
        .bind::<Text, _>(req.sku)
        .bind::<Jsonb, _>(req.attributes)
        .bind::<diesel::sql_types::BigInt, _>(req.price)
        .bind::<Nullable<diesel::sql_types::BigInt>, _>(req.stock)
        .bind::<Text, _>(req.status)
        .get_result(&mut *conn)
        .await
        .map_err(WalletError::from_diesel)?;
        Ok(row.value)
    }

    pub async fn store_set_variant_status(&self, variant_id: Uuid, status: String) -> Result<()> {
        let mut conn = self.write().await?;
        sql_query("SELECT store.service_set_variant_status($1, $2)")
            .bind::<diesel::sql_types::Uuid, _>(variant_id)
            .bind::<Text, _>(status)
            .execute(&mut *conn)
            .await
            .map_err(WalletError::from_diesel)?;
        Ok(())
    }

    // -------------------------------------------------------------------
    // Orders (Phase 2)
    // -------------------------------------------------------------------

    pub async fn store_buy_physical(&self, user_id: Uuid, req: StoreBuyPhysical) -> Result<i64> {
        let mut conn = self.write().await?;
        let inner: &mut AsyncPgConnection = &mut conn;
        inner
            .transaction::<i64, WalletError, _>(async |conn| {
                set_user_claims(conn, user_id).await?;
                let row: ScalarBigInt = sql_query(
                    "SELECT public.proxy_store_buy_physical($1, $2, $3, $4) AS value",
                )
                .bind::<diesel::sql_types::Uuid, _>(req.variant_id)
                .bind::<diesel::sql_types::BigInt, _>(req.qty)
                .bind::<Jsonb, _>(req.shipping_address)
                .bind::<diesel::sql_types::Uuid, _>(req.idempotency_key)
                .get_result(conn)
                .await
                .map_err(WalletError::from_diesel)?;
                Ok(row.value)
            })
            .await
    }

    pub async fn store_my_orders(
        &self,
        user_id: Uuid,
        limit: i32,
        before_created_at: Option<DateTime<Utc>>,
        before_id: Option<i64>,
    ) -> Result<Vec<StoreOrderRow>> {
        match self
            .read_my_orders(user_id, limit, before_created_at, before_id)
            .await
        {
            Ok(rows) => Ok(rows),
            Err(WalletError::AccountMissing) => {
                self.write_my_orders(user_id, limit, before_created_at, before_id)
                    .await
            }
            Err(e) => Err(e),
        }
    }

    async fn read_my_orders(
        &self,
        user_id: Uuid,
        limit: i32,
        before_created_at: Option<DateTime<Utc>>,
        before_id: Option<i64>,
    ) -> Result<Vec<StoreOrderRow>> {
        let mut conn = self.read().await?;
        let inner: &mut AsyncPgConnection = &mut conn;
        inner
            .transaction::<Vec<StoreOrderRow>, WalletError, _>(async |conn| {
                set_user_claims(conn, user_id).await?;
                my_orders_async(conn, limit, before_created_at, before_id).await
            })
            .await
    }

    async fn write_my_orders(
        &self,
        user_id: Uuid,
        limit: i32,
        before_created_at: Option<DateTime<Utc>>,
        before_id: Option<i64>,
    ) -> Result<Vec<StoreOrderRow>> {
        let mut conn = self.write().await?;
        let inner: &mut AsyncPgConnection = &mut conn;
        inner
            .transaction::<Vec<StoreOrderRow>, WalletError, _>(async |conn| {
                set_user_claims(conn, user_id).await?;
                my_orders_async(conn, limit, before_created_at, before_id).await
            })
            .await
    }

    pub async fn store_list_orders(
        &self,
        status: Option<String>,
        limit: i32,
        before_id: Option<i64>,
    ) -> Result<Vec<StoreOrderStaffRow>> {
        let mut conn = self.write().await?;
        let rows: Vec<OrderStaffRowDb> = sql_query(
            "SELECT order_id, account_id, product_id, variant_id, qty, credits_amount, \
                    status::text AS status, shipping_address, tracking, created_at, updated_at \
             FROM store.service_list_orders($1::store.order_status, $2, $3)",
        )
        .bind::<Nullable<Text>, _>(status)
        .bind::<diesel::sql_types::Integer, _>(limit)
        .bind::<Nullable<diesel::sql_types::BigInt>, _>(before_id)
        .get_results(&mut *conn)
        .await
        .map_err(WalletError::from_diesel)?;
        Ok(rows
            .into_iter()
            .map(|r| StoreOrderStaffRow {
                order_id: r.order_id,
                account_id: r.account_id,
                product_id: r.product_id,
                variant_id: r.variant_id,
                qty: r.qty,
                credits_amount: r.credits_amount,
                status: r.status,
                shipping_address: r.shipping_address,
                tracking: r.tracking,
                created_at: r.created_at,
                updated_at: r.updated_at,
            })
            .collect())
    }

    pub async fn store_advance_order(&self, req: StoreAdvanceOrder) -> Result<()> {
        let mut conn = self.write().await?;
        sql_query(
            "SELECT store.service_advance_order($1, $2::store.order_status, $3, $4)",
        )
        .bind::<diesel::sql_types::BigInt, _>(req.order_id)
        .bind::<Text, _>(req.to_status)
        .bind::<Jsonb, _>(req.tracking)
        .bind::<Nullable<Text>, _>(req.note)
        .execute(&mut *conn)
        .await
        .map_err(WalletError::from_diesel)?;
        Ok(())
    }

    pub async fn store_refund_order(&self, order_id: i64, reason: Option<String>) -> Result<()> {
        let mut conn = self.write().await?;
        sql_query("SELECT store.service_refund_order($1, $2)")
            .bind::<diesel::sql_types::BigInt, _>(order_id)
            .bind::<Nullable<Text>, _>(reason)
            .execute(&mut *conn)
            .await
            .map_err(WalletError::from_diesel)?;
        Ok(())
    }

    // -------------------------------------------------------------------
    // Stripe on-ramp (Phase 3)
    // -------------------------------------------------------------------

    /// Idempotently credit a wallet from a completed Stripe checkout. Called
    /// by the webhook handler as service_role. Returns the ledger id.
    pub async fn store_apply_topup(
        &self,
        user_id: Uuid,
        stripe_event_id: String,
        stripe_session_id: Option<String>,
        pack_id: String,
        amount_cents: i64,
        currency_fiat: String,
    ) -> Result<i64> {
        let mut conn = self.write().await?;
        let row: ScalarBigInt = sql_query(
            "SELECT store.service_apply_topup($1, $2, $3, $4, $5, $6) AS value",
        )
        .bind::<diesel::sql_types::Uuid, _>(user_id)
        .bind::<Text, _>(stripe_event_id)
        .bind::<Nullable<Text>, _>(stripe_session_id)
        .bind::<Text, _>(pack_id)
        .bind::<diesel::sql_types::BigInt, _>(amount_cents)
        .bind::<Text, _>(currency_fiat)
        .get_result(&mut *conn)
        .await
        .map_err(WalletError::from_diesel)?;
        Ok(row.value)
    }

    /// Record a POD webhook receipt (append-only audit + provider-event dedupe).
    /// Returns true when newly recorded, false on a duplicate provider event.
    pub async fn store_record_pod_webhook(
        &self,
        provider: String,
        provider_event_id: String,
        order_id: Option<i64>,
        payload: serde_json::Value,
    ) -> Result<bool> {
        #[derive(QueryableByName)]
        struct ScalarBool {
            #[diesel(sql_type = diesel::sql_types::Bool)]
            value: bool,
        }
        let mut conn = self.write().await?;
        let row: ScalarBool = sql_query(
            "SELECT store.service_record_pod_webhook($1, $2, $3, $4) AS value",
        )
        .bind::<Text, _>(provider)
        .bind::<Text, _>(provider_event_id)
        .bind::<Nullable<diesel::sql_types::BigInt>, _>(order_id)
        .bind::<Jsonb, _>(payload)
        .get_result(&mut *conn)
        .await
        .map_err(WalletError::from_diesel)?;
        Ok(row.value)
    }

    // -------------------------------------------------------------------
    // Print-on-demand (Phase 4)
    // -------------------------------------------------------------------

    /// Lease an order for POD submission. Returns the claim payload (incl.
    /// `claim_token`, which must be passed to `store_ack_pod_submission`).
    pub async fn store_order_for_pod(
        &self,
        order_id: i64,
        claimed_by: Option<String>,
    ) -> Result<Option<serde_json::Value>> {
        let mut conn = self.write().await?;
        let row: ScalarJson = sql_query("SELECT store.service_order_for_pod($1, $2) AS value")
            .bind::<diesel::sql_types::BigInt, _>(order_id)
            .bind::<Nullable<Text>, _>(claimed_by)
            .get_result(&mut *conn)
            .await
            .map_err(WalletError::from_diesel)?;
        Ok(row.value)
    }

    /// Acknowledge a confirmed provider submission. Requires the lease token
    /// from `store_order_for_pod` and a complete provider identity in `pod_ref`
    /// (`provider` + `external_order_id`).
    pub async fn store_ack_pod_submission(
        &self,
        order_id: i64,
        claim_token: Uuid,
        pod_ref: serde_json::Value,
    ) -> Result<()> {
        let mut conn = self.write().await?;
        sql_query("SELECT store.service_ack_pod_submission($1, $2, $3)")
            .bind::<diesel::sql_types::BigInt, _>(order_id)
            .bind::<diesel::sql_types::Uuid, _>(claim_token)
            .bind::<Jsonb, _>(pod_ref)
            .execute(&mut *conn)
            .await
            .map_err(WalletError::from_diesel)?;
        Ok(())
    }

    /// Status/metadata-only POD update (e.g. provider webhook) after an external
    /// identity exists. Never mutates the provider identity.
    pub async fn store_update_pod_status(
        &self,
        order_id: i64,
        pod_ref: serde_json::Value,
    ) -> Result<()> {
        let mut conn = self.write().await?;
        sql_query("SELECT store.service_update_pod_status($1, $2)")
            .bind::<diesel::sql_types::BigInt, _>(order_id)
            .bind::<Jsonb, _>(pod_ref)
            .execute(&mut *conn)
            .await
            .map_err(WalletError::from_diesel)?;
        Ok(())
    }

    // -------------------------------------------------------------------
    // Authenticated read (rw on WLT01 fallback)
    // -------------------------------------------------------------------

    pub async fn store_my_entitlements(
        &self,
        user_id: Uuid,
    ) -> Result<Vec<StoreEntitlementRow>> {
        match self.read_my_entitlements(user_id).await {
            Ok(rows) => Ok(rows),
            Err(WalletError::AccountMissing) => self.write_my_entitlements(user_id).await,
            Err(e) => Err(e),
        }
    }

    async fn read_my_entitlements(&self, user_id: Uuid) -> Result<Vec<StoreEntitlementRow>> {
        let mut conn = self.read().await?;
        let inner: &mut AsyncPgConnection = &mut conn;
        inner
            .transaction::<Vec<StoreEntitlementRow>, WalletError, _>(async |conn| {
                set_user_claims(conn, user_id).await?;
                my_entitlements_async(conn).await
            })
            .await
    }

    async fn write_my_entitlements(&self, user_id: Uuid) -> Result<Vec<StoreEntitlementRow>> {
        let mut conn = self.write().await?;
        let inner: &mut AsyncPgConnection = &mut conn;
        inner
            .transaction::<Vec<StoreEntitlementRow>, WalletError, _>(async |conn| {
                set_user_claims(conn, user_id).await?;
                my_entitlements_async(conn).await
            })
            .await
    }

    // -------------------------------------------------------------------
    // Write proxy (rw pool only)
    // -------------------------------------------------------------------

    pub async fn store_buy(&self, user_id: Uuid, req: StoreBuyRequest) -> Result<Uuid> {
        let mut conn = self.write().await?;
        let inner: &mut AsyncPgConnection = &mut conn;
        inner
            .transaction::<Uuid, WalletError, _>(async |conn| {
                set_user_claims(conn, user_id).await?;
                let row: ScalarUuid =
                    sql_query("SELECT public.proxy_store_buy($1, $2) AS value")
                        .bind::<Text, _>(req.slug)
                        .bind::<diesel::sql_types::Uuid, _>(req.idempotency_key)
                        .get_result(conn)
                        .await
                        .map_err(WalletError::from_diesel)?;
                Ok(row.value)
            })
            .await
    }
}

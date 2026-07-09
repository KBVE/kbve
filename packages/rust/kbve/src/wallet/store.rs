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

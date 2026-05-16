//! Marketplace client surface. Wraps the Phase 3 PostgREST proxies:
//!
//!   public.proxy_market_list_active_readonly
//!   public.proxy_market_listing_detail_readonly
//!   public.proxy_market_my_listings_readonly
//!   public.proxy_market_my_bids_readonly
//!   public.proxy_market_create_listing
//!   public.proxy_market_place_bid
//!   public.proxy_market_buy_now
//!   public.proxy_market_cancel_listing
//!
//! Read methods use the rw/ro pool split (PR #10941); on AccountMissing
//! (SQLSTATE WLT01) for the authenticated paths the client falls back
//! to the rw pool so the trigger from PR #10920 still lazy-provisions.
//! The anon-callable browse + detail pair never carries auth claims.

use chrono::{DateTime, Utc};
use diesel::QueryableByName;
use diesel::sql_query;
use diesel::sql_types::{BigInt, Jsonb, Nullable, Text, Timestamptz};
use diesel_async::{AsyncConnection, AsyncPgConnection, RunQueryDsl};
use uuid::Uuid;

use super::client::{WalletClient, set_user_claims};
use super::error::{Result, WalletError};
use super::types::*;

#[derive(QueryableByName)]
struct ListingRowDb {
    #[diesel(sql_type = BigInt)]
    listing_id: i64,
    #[diesel(sql_type = diesel::sql_types::Uuid)]
    seller_account: Uuid,
    #[diesel(sql_type = Jsonb)]
    item_ref: serde_json::Value,
    #[diesel(sql_type = Text)]
    currency: String,
    #[diesel(sql_type = Nullable<BigInt>)]
    buy_now_price: Option<i64>,
    #[diesel(sql_type = Nullable<BigInt>)]
    min_bid: Option<i64>,
    #[diesel(sql_type = Nullable<BigInt>)]
    current_bid: Option<i64>,
    #[diesel(sql_type = Timestamptz)]
    expires_at: DateTime<Utc>,
    #[diesel(sql_type = Timestamptz)]
    created_at: DateTime<Utc>,
}

#[derive(QueryableByName)]
struct ListingDetailDb {
    #[diesel(sql_type = BigInt)]
    listing_id: i64,
    #[diesel(sql_type = diesel::sql_types::Uuid)]
    seller_account: Uuid,
    #[diesel(sql_type = Jsonb)]
    item_ref: serde_json::Value,
    #[diesel(sql_type = Text)]
    currency: String,
    #[diesel(sql_type = Nullable<BigInt>)]
    buy_now_price: Option<i64>,
    #[diesel(sql_type = Nullable<BigInt>)]
    min_bid: Option<i64>,
    #[diesel(sql_type = Nullable<BigInt>)]
    current_bid: Option<i64>,
    #[diesel(sql_type = Nullable<BigInt>)]
    current_bid_id: Option<i64>,
    #[diesel(sql_type = Text)]
    listing_status: String,
    #[diesel(sql_type = Timestamptz)]
    expires_at: DateTime<Utc>,
    #[diesel(sql_type = Timestamptz)]
    created_at: DateTime<Utc>,
    #[diesel(sql_type = Timestamptz)]
    updated_at: DateTime<Utc>,
    #[diesel(sql_type = Nullable<Timestamptz>)]
    settled_at: Option<DateTime<Utc>>,
    #[diesel(sql_type = Jsonb)]
    bids: serde_json::Value,
}

#[derive(QueryableByName)]
struct MyListingRowDb {
    #[diesel(sql_type = BigInt)]
    listing_id: i64,
    #[diesel(sql_type = Jsonb)]
    item_ref: serde_json::Value,
    #[diesel(sql_type = Text)]
    currency: String,
    #[diesel(sql_type = Nullable<BigInt>)]
    buy_now_price: Option<i64>,
    #[diesel(sql_type = Nullable<BigInt>)]
    min_bid: Option<i64>,
    #[diesel(sql_type = Nullable<BigInt>)]
    current_bid: Option<i64>,
    #[diesel(sql_type = Nullable<diesel::sql_types::Uuid>)]
    current_bid_account: Option<Uuid>,
    #[diesel(sql_type = Nullable<diesel::sql_types::Uuid>)]
    buyer_account: Option<Uuid>,
    #[diesel(sql_type = Text)]
    listing_status: String,
    #[diesel(sql_type = Timestamptz)]
    expires_at: DateTime<Utc>,
    #[diesel(sql_type = Timestamptz)]
    created_at: DateTime<Utc>,
    #[diesel(sql_type = Nullable<Timestamptz>)]
    settled_at: Option<DateTime<Utc>>,
}

#[derive(QueryableByName)]
struct MyBidRowDb {
    #[diesel(sql_type = BigInt)]
    bid_id: i64,
    #[diesel(sql_type = BigInt)]
    listing_id: i64,
    #[diesel(sql_type = BigInt)]
    amount: i64,
    #[diesel(sql_type = Text)]
    bid_status: String,
    #[diesel(sql_type = Timestamptz)]
    placed_at: DateTime<Utc>,
    #[diesel(sql_type = Nullable<Timestamptz>)]
    settled_at: Option<DateTime<Utc>>,
    #[diesel(sql_type = BigInt)]
    escrow_ledger_id: i64,
    #[diesel(sql_type = Nullable<BigInt>)]
    refund_ledger_id: Option<i64>,
}

#[derive(QueryableByName)]
struct ScalarBigInt {
    #[diesel(sql_type = BigInt)]
    value: i64,
}

fn map_listing_row(r: ListingRowDb) -> Result<MarketListingRow> {
    let currency = CurrencyKind::from_pg(&r.currency)
        .ok_or_else(|| WalletError::InvalidArgument(format!("unknown currency: {}", r.currency)))?;
    Ok(MarketListingRow {
        listing_id: r.listing_id,
        seller_account: r.seller_account,
        item_ref: r.item_ref,
        currency,
        buy_now_price: r.buy_now_price,
        min_bid: r.min_bid,
        current_bid: r.current_bid,
        expires_at: r.expires_at,
        created_at: r.created_at,
    })
}

fn map_listing_detail(r: ListingDetailDb) -> Result<MarketListingDetail> {
    let currency = CurrencyKind::from_pg(&r.currency)
        .ok_or_else(|| WalletError::InvalidArgument(format!("unknown currency: {}", r.currency)))?;
    let status = ListingStatus::from_pg(&r.listing_status).ok_or_else(|| {
        WalletError::InvalidArgument(format!("unknown listing_status: {}", r.listing_status))
    })?;
    Ok(MarketListingDetail {
        listing_id: r.listing_id,
        seller_account: r.seller_account,
        item_ref: r.item_ref,
        currency,
        buy_now_price: r.buy_now_price,
        min_bid: r.min_bid,
        current_bid: r.current_bid,
        current_bid_id: r.current_bid_id,
        listing_status: status,
        expires_at: r.expires_at,
        created_at: r.created_at,
        updated_at: r.updated_at,
        settled_at: r.settled_at,
        bids: r.bids,
    })
}

fn map_my_listing(r: MyListingRowDb) -> Result<MarketMyListingRow> {
    let currency = CurrencyKind::from_pg(&r.currency)
        .ok_or_else(|| WalletError::InvalidArgument(format!("unknown currency: {}", r.currency)))?;
    let status = ListingStatus::from_pg(&r.listing_status).ok_or_else(|| {
        WalletError::InvalidArgument(format!("unknown listing_status: {}", r.listing_status))
    })?;
    Ok(MarketMyListingRow {
        listing_id: r.listing_id,
        item_ref: r.item_ref,
        currency,
        buy_now_price: r.buy_now_price,
        min_bid: r.min_bid,
        current_bid: r.current_bid,
        current_bid_account: r.current_bid_account,
        buyer_account: r.buyer_account,
        listing_status: status,
        expires_at: r.expires_at,
        created_at: r.created_at,
        settled_at: r.settled_at,
    })
}

fn map_my_bid(r: MyBidRowDb) -> Result<MarketMyBidRow> {
    let status = BidStatus::from_pg(&r.bid_status).ok_or_else(|| {
        WalletError::InvalidArgument(format!("unknown bid_status: {}", r.bid_status))
    })?;
    Ok(MarketMyBidRow {
        bid_id: r.bid_id,
        listing_id: r.listing_id,
        amount: r.amount,
        bid_status: status,
        placed_at: r.placed_at,
        settled_at: r.settled_at,
        escrow_ledger_id: r.escrow_ledger_id,
        refund_ledger_id: r.refund_ledger_id,
    })
}

impl WalletClient {
    // -------------------------------------------------------------------
    // Anon-safe browse (no auth claims; uses read pool)
    // -------------------------------------------------------------------

    pub async fn market_list_active(
        &self,
        limit: i32,
        before_created_at: Option<DateTime<Utc>>,
        before_id: Option<i64>,
    ) -> Result<Vec<MarketListingRow>> {
        let mut conn = self.read().await?;
        let rows: Vec<ListingRowDb> = sql_query(
            "SELECT listing_id, seller_account, item_ref, currency::text AS currency, \
                    buy_now_price, min_bid, current_bid, expires_at, created_at \
             FROM public.proxy_market_list_active_readonly($1, $2, $3)",
        )
        .bind::<diesel::sql_types::Integer, _>(limit)
        .bind::<Nullable<Timestamptz>, _>(before_created_at)
        .bind::<Nullable<BigInt>, _>(before_id)
        .get_results(&mut *conn)
        .await
        .map_err(WalletError::from_diesel)?;
        rows.into_iter().map(map_listing_row).collect()
    }

    pub async fn market_listing_detail(&self, listing_id: i64) -> Result<MarketListingDetail> {
        let mut conn = self.read().await?;
        let row: ListingDetailDb = sql_query(
            "SELECT listing_id, seller_account, item_ref, currency::text AS currency, \
                    buy_now_price, min_bid, current_bid, current_bid_id, \
                    listing_status::text AS listing_status, expires_at, created_at, \
                    updated_at, settled_at, bids \
             FROM public.proxy_market_listing_detail_readonly($1)",
        )
        .bind::<BigInt, _>(listing_id)
        .get_result(&mut *conn)
        .await
        .map_err(WalletError::from_diesel)?;
        map_listing_detail(row)
    }

    // -------------------------------------------------------------------
    // Authenticated reads (rw on WLT01 fallback)
    // -------------------------------------------------------------------

    pub async fn market_my_listings(
        &self,
        user_id: Uuid,
        limit: i32,
        before_created_at: Option<DateTime<Utc>>,
        before_id: Option<i64>,
    ) -> Result<Vec<MarketMyListingRow>> {
        match self
            .read_my_listings(user_id, limit, before_created_at, before_id)
            .await
        {
            Ok(rows) => Ok(rows),
            Err(WalletError::AccountMissing) => {
                self.write_my_listings(user_id, limit, before_created_at, before_id)
                    .await
            }
            Err(e) => Err(e),
        }
    }

    async fn read_my_listings(
        &self,
        user_id: Uuid,
        limit: i32,
        before_created_at: Option<DateTime<Utc>>,
        before_id: Option<i64>,
    ) -> Result<Vec<MarketMyListingRow>> {
        let mut conn = self.read().await?;
        let inner: &mut AsyncPgConnection = &mut *conn;
        inner
            .transaction::<Vec<MarketMyListingRow>, WalletError, _>(async |conn| {
                set_user_claims(conn, user_id).await?;
                my_listings_async(conn, limit, before_created_at, before_id).await
            })
            .await
    }

    async fn write_my_listings(
        &self,
        user_id: Uuid,
        limit: i32,
        before_created_at: Option<DateTime<Utc>>,
        before_id: Option<i64>,
    ) -> Result<Vec<MarketMyListingRow>> {
        let mut conn = self.write().await?;
        let inner: &mut AsyncPgConnection = &mut *conn;
        inner
            .transaction::<Vec<MarketMyListingRow>, WalletError, _>(async |conn| {
                set_user_claims(conn, user_id).await?;
                my_listings_async(conn, limit, before_created_at, before_id).await
            })
            .await
    }

    pub async fn market_my_bids(
        &self,
        user_id: Uuid,
        limit: i32,
        before_placed_at: Option<DateTime<Utc>>,
        before_id: Option<i64>,
    ) -> Result<Vec<MarketMyBidRow>> {
        match self
            .read_my_bids(user_id, limit, before_placed_at, before_id)
            .await
        {
            Ok(rows) => Ok(rows),
            Err(WalletError::AccountMissing) => {
                self.write_my_bids(user_id, limit, before_placed_at, before_id)
                    .await
            }
            Err(e) => Err(e),
        }
    }

    async fn read_my_bids(
        &self,
        user_id: Uuid,
        limit: i32,
        before_placed_at: Option<DateTime<Utc>>,
        before_id: Option<i64>,
    ) -> Result<Vec<MarketMyBidRow>> {
        let mut conn = self.read().await?;
        let inner: &mut AsyncPgConnection = &mut *conn;
        inner
            .transaction::<Vec<MarketMyBidRow>, WalletError, _>(async |conn| {
                set_user_claims(conn, user_id).await?;
                my_bids_async(conn, limit, before_placed_at, before_id).await
            })
            .await
    }

    async fn write_my_bids(
        &self,
        user_id: Uuid,
        limit: i32,
        before_placed_at: Option<DateTime<Utc>>,
        before_id: Option<i64>,
    ) -> Result<Vec<MarketMyBidRow>> {
        let mut conn = self.write().await?;
        let inner: &mut AsyncPgConnection = &mut *conn;
        inner
            .transaction::<Vec<MarketMyBidRow>, WalletError, _>(async |conn| {
                set_user_claims(conn, user_id).await?;
                my_bids_async(conn, limit, before_placed_at, before_id).await
            })
            .await
    }

    // -------------------------------------------------------------------
    // Write proxies (rw pool only)
    // -------------------------------------------------------------------

    pub async fn market_create_listing(
        &self,
        user_id: Uuid,
        req: MarketCreateListingRequest,
    ) -> Result<i64> {
        let mut conn = self.write().await?;
        let inner: &mut AsyncPgConnection = &mut *conn;
        inner
            .transaction::<i64, WalletError, _>(async |conn| {
                set_user_claims(conn, user_id).await?;
                let row: ScalarBigInt = sql_query(
                    "SELECT public.proxy_market_create_listing($1, $2, $3, $4, $5) AS value",
                )
                .bind::<Jsonb, _>(req.item_ref)
                .bind::<Nullable<BigInt>, _>(req.buy_now_price)
                .bind::<Nullable<BigInt>, _>(req.min_bid)
                .bind::<Timestamptz, _>(req.expires_at)
                .bind::<diesel::sql_types::Uuid, _>(req.idempotency_key)
                .get_result(conn)
                .await
                .map_err(WalletError::from_diesel)?;
                Ok(row.value)
            })
            .await
    }

    pub async fn market_place_bid(&self, user_id: Uuid, req: MarketPlaceBidRequest) -> Result<i64> {
        let mut conn = self.write().await?;
        let inner: &mut AsyncPgConnection = &mut *conn;
        inner
            .transaction::<i64, WalletError, _>(async |conn| {
                set_user_claims(conn, user_id).await?;
                let row: ScalarBigInt =
                    sql_query("SELECT public.proxy_market_place_bid($1, $2, $3) AS value")
                        .bind::<BigInt, _>(req.listing_id)
                        .bind::<BigInt, _>(req.amount)
                        .bind::<diesel::sql_types::Uuid, _>(req.idempotency_key)
                        .get_result(conn)
                        .await
                        .map_err(WalletError::from_diesel)?;
                Ok(row.value)
            })
            .await
    }

    pub async fn market_buy_now(&self, user_id: Uuid, req: MarketBuyNowRequest) -> Result<i64> {
        let mut conn = self.write().await?;
        let inner: &mut AsyncPgConnection = &mut *conn;
        inner
            .transaction::<i64, WalletError, _>(async |conn| {
                set_user_claims(conn, user_id).await?;
                let row: ScalarBigInt =
                    sql_query("SELECT public.proxy_market_buy_now($1, $2) AS value")
                        .bind::<BigInt, _>(req.listing_id)
                        .bind::<diesel::sql_types::Uuid, _>(req.idempotency_key)
                        .get_result(conn)
                        .await
                        .map_err(WalletError::from_diesel)?;
                Ok(row.value)
            })
            .await
    }

    pub async fn market_cancel_listing(
        &self,
        user_id: Uuid,
        req: MarketCancelListingRequest,
    ) -> Result<()> {
        let mut conn = self.write().await?;
        let inner: &mut AsyncPgConnection = &mut *conn;
        inner
            .transaction::<(), WalletError, _>(async |conn| {
                set_user_claims(conn, user_id).await?;
                sql_query("SELECT public.proxy_market_cancel_listing($1, $2)")
                    .bind::<BigInt, _>(req.listing_id)
                    .bind::<Nullable<Text>, _>(req.reason)
                    .execute(conn)
                    .await
                    .map_err(WalletError::from_diesel)?;
                Ok(())
            })
            .await
    }
}

async fn my_listings_async(
    conn: &mut AsyncPgConnection,
    limit: i32,
    before_created_at: Option<DateTime<Utc>>,
    before_id: Option<i64>,
) -> Result<Vec<MarketMyListingRow>> {
    let rows: Vec<MyListingRowDb> = sql_query(
        "SELECT listing_id, item_ref, currency::text AS currency, \
                buy_now_price, min_bid, current_bid, current_bid_account, \
                buyer_account, listing_status::text AS listing_status, \
                expires_at, created_at, settled_at \
         FROM public.proxy_market_my_listings_readonly($1, $2, $3)",
    )
    .bind::<diesel::sql_types::Integer, _>(limit)
    .bind::<Nullable<Timestamptz>, _>(before_created_at)
    .bind::<Nullable<BigInt>, _>(before_id)
    .get_results(conn)
    .await
    .map_err(WalletError::from_diesel)?;
    rows.into_iter().map(map_my_listing).collect()
}

async fn my_bids_async(
    conn: &mut AsyncPgConnection,
    limit: i32,
    before_placed_at: Option<DateTime<Utc>>,
    before_id: Option<i64>,
) -> Result<Vec<MarketMyBidRow>> {
    let rows: Vec<MyBidRowDb> = sql_query(
        "SELECT bid_id, listing_id, amount, bid_status::text AS bid_status, \
                placed_at, settled_at, escrow_ledger_id, refund_ledger_id \
         FROM public.proxy_market_my_bids_readonly($1, $2, $3)",
    )
    .bind::<diesel::sql_types::Integer, _>(limit)
    .bind::<Nullable<Timestamptz>, _>(before_placed_at)
    .bind::<Nullable<BigInt>, _>(before_id)
    .get_results(conn)
    .await
    .map_err(WalletError::from_diesel)?;
    rows.into_iter().map(map_my_bid).collect()
}

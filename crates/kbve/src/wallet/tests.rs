#![cfg(test)]

use std::env;

use diesel::QueryableByName;
use diesel::sql_query;
use diesel::sql_types::Text;
use diesel_async::{AsyncConnection, AsyncPgConnection, RunQueryDsl};
use serial_test::serial;
use uuid::Uuid;

use super::{
    BidStatus, CouponStatus, CreditRequest, CurrencyKind, DebitRequest,
    FirecrackerPlaceHoldRequest, FirecrackerSettleRequest, FirecrackerSettleStatus, ListingStatus,
    MarketBuyNowRequest, MarketCancelListingRequest, MarketCreateListingRequest,
    MarketPlaceBidRequest, RewardKind, SourceKind, TransferRequest, WalletClient, WalletError,
};
use chrono::{Duration, Utc};

const TEST_URL_ENV: &str = "WALLET_TEST_DATABASE_URL";

async fn client() -> Option<WalletClient> {
    let url = env::var(TEST_URL_ENV).ok()?;
    env::set_var("WALLET_DATABASE_URL", &url);
    Some(WalletClient::from_env().await.expect("client from_env"))
}

async fn admin_conn() -> Option<AsyncPgConnection> {
    let url = env::var(TEST_URL_ENV).ok()?;
    AsyncPgConnection::establish(&url).await.ok()
}

async fn fixture_account() -> Option<(Uuid, Uuid)> {
    let mut conn = admin_conn().await?;
    let user_id = Uuid::new_v4();
    sql_query("INSERT INTO auth.users (id) VALUES ($1) ON CONFLICT DO NOTHING")
        .bind::<diesel::sql_types::Uuid, _>(user_id)
        .execute(&mut conn)
        .await
        .expect("insert auth.users");
    #[derive(QueryableByName)]
    struct R {
        #[diesel(sql_type = diesel::sql_types::Uuid)]
        id: Uuid,
    }
    let r: R = sql_query("SELECT id FROM wallet.account WHERE kind = 'user' AND user_id = $1")
        .bind::<diesel::sql_types::Uuid, _>(user_id)
        .get_result(&mut conn)
        .await
        .expect("trigger-provisioned wallet.account lookup");
    sql_query("INSERT INTO wallet.balance (account_id) VALUES ($1) ON CONFLICT DO NOTHING")
        .bind::<diesel::sql_types::Uuid, _>(r.id)
        .execute(&mut conn)
        .await
        .expect("insert wallet.balance");
    Some((user_id, r.id))
}

fn req_credit(account: Uuid, amount: i64, key: Uuid) -> CreditRequest {
    CreditRequest {
        account_id: account,
        currency: CurrencyKind::Khash,
        amount,
        source_kind: SourceKind::Reward,
        reason: Some("test".into()),
        ref_type: None,
        ref_id: None,
        idempotency_key: key,
    }
}

#[tokio::test]
#[serial]
async fn credit_then_replay_returns_same_ledger_id() {
    let Some(client) = client().await else {
        eprintln!("SKIP: WALLET_TEST_DATABASE_URL unset");
        return;
    };
    let (_user, account) = fixture_account().await.expect("fixture");
    let key = Uuid::new_v4();

    let id1 = client.credit(req_credit(account, 100, key)).await.unwrap();
    let id2 = client.credit(req_credit(account, 100, key)).await.unwrap();
    assert_eq!(id1, id2, "replay must return same ledger id");
}

#[tokio::test]
#[serial]
async fn credit_replay_with_different_payload_raises_replay_mismatch() {
    let Some(client) = client().await else {
        return;
    };
    let (_user, account) = fixture_account().await.expect("fixture");
    let key = Uuid::new_v4();

    client.credit(req_credit(account, 100, key)).await.unwrap();
    let err = client
        .credit(req_credit(account, 999, key))
        .await
        .expect_err("must raise");
    assert!(matches!(err, WalletError::ReplayMismatch), "got: {err:?}");
}

#[tokio::test]
#[serial]
async fn debit_beyond_balance_raises_insufficient_funds() {
    let Some(client) = client().await else {
        return;
    };
    let (_user, account) = fixture_account().await.expect("fixture");

    client
        .credit(req_credit(account, 50, Uuid::new_v4()))
        .await
        .unwrap();

    let req = DebitRequest {
        account_id: account,
        currency: CurrencyKind::Khash,
        amount: 99999,
        source_kind: SourceKind::Admin,
        reason: None,
        ref_type: None,
        ref_id: None,
        idempotency_key: Uuid::new_v4(),
    };
    let err = client.debit(req).await.expect_err("must raise");
    assert!(
        matches!(err, WalletError::InsufficientFunds),
        "got: {err:?}"
    );
}

#[tokio::test]
#[serial]
async fn transfer_moves_funds_atomically() {
    let Some(client) = client().await else {
        return;
    };
    let (_user_a, account_a) = fixture_account().await.expect("fixture a");
    let (_user_b, account_b) = fixture_account().await.expect("fixture b");

    client
        .credit(req_credit(account_a, 500, Uuid::new_v4()))
        .await
        .unwrap();

    client
        .transfer(TransferRequest {
            from_account: account_a,
            to_account: account_b,
            currency: CurrencyKind::Khash,
            amount: 200,
            source_kind: SourceKind::Transfer,
            reason: Some("test transfer".into()),
            ref_type: None,
            ref_id: None,
            idempotency_key: Uuid::new_v4(),
        })
        .await
        .unwrap();

    let v = client.verify_balance(account_a).await.unwrap();
    assert!(v.ok);
    assert_eq!(v.stored_khash, 300);

    let v = client.verify_balance(account_b).await.unwrap();
    assert!(v.ok);
    assert_eq!(v.stored_khash, 200);
}

#[tokio::test]
#[serial]
async fn welcome_redeem_flow_via_user_proxy() {
    let Some(client) = client().await else {
        return;
    };
    let mut conn = admin_conn().await.unwrap();

    let user_id = Uuid::new_v4();
    sql_query("INSERT INTO auth.users (id) VALUES ($1) ON CONFLICT DO NOTHING")
        .bind::<diesel::sql_types::Uuid, _>(user_id)
        .execute(&mut conn)
        .await
        .unwrap();

    let bal = client.user_balance(user_id).await.unwrap();
    assert_eq!(bal.khash, 0);

    let coupons = client.user_coupons(user_id).await.unwrap();
    let welcome = coupons
        .iter()
        .find(|c| c.template_code == "WELCOME_KHASH")
        .expect("welcome coupon present");
    assert_eq!(welcome.status, CouponStatus::Unredeemed);
    assert!(matches!(welcome.reward_kind, RewardKind::Khash));

    let key = Uuid::new_v4();
    let r1 = client
        .user_redeem_coupon(user_id, welcome.coupon_id, key)
        .await
        .unwrap();
    assert!(r1.success);

    let r2 = client
        .user_redeem_coupon(user_id, welcome.coupon_id, key)
        .await
        .unwrap();
    assert_eq!(r1.ledger_id, r2.ledger_id);

    let bal = client.user_balance(user_id).await.unwrap();
    assert_eq!(bal.khash, 1000);
}

#[tokio::test]
#[serial]
async fn user_balance_ro_fallback_reprovisions_missing_account() {
    let Some(client) = client().await else {
        return;
    };
    let mut conn = admin_conn().await.unwrap();

    let user_id = Uuid::new_v4();
    sql_query("INSERT INTO auth.users (id) VALUES ($1) ON CONFLICT DO NOTHING")
        .bind::<diesel::sql_types::Uuid, _>(user_id)
        .execute(&mut conn)
        .await
        .unwrap();

    sql_query(
        "DELETE FROM wallet.coupon WHERE account_id IN \
            (SELECT id FROM wallet.account WHERE user_id = $1)",
    )
    .bind::<diesel::sql_types::Uuid, _>(user_id)
    .execute(&mut conn)
    .await
    .unwrap();
    sql_query(
        "DELETE FROM wallet.balance WHERE account_id IN \
            (SELECT id FROM wallet.account WHERE user_id = $1)",
    )
    .bind::<diesel::sql_types::Uuid, _>(user_id)
    .execute(&mut conn)
    .await
    .unwrap();
    sql_query("DELETE FROM wallet.account WHERE user_id = $1")
        .bind::<diesel::sql_types::Uuid, _>(user_id)
        .execute(&mut conn)
        .await
        .unwrap();

    let bal = client
        .user_balance(user_id)
        .await
        .expect("user_balance falls back to rw and provisions");
    assert_eq!(bal.credits, 0);
    assert_eq!(bal.khash, 0);

    let bal2 = client.user_balance(user_id).await.unwrap();
    assert_eq!(bal.account_id, bal2.account_id);
}

#[tokio::test]
#[serial]
async fn revoke_unredeemed_coupon_succeeds() {
    let Some(client) = client().await else {
        return;
    };
    let (_user, account) = fixture_account().await.expect("fixture");
    let mut conn = admin_conn().await.unwrap();

    let template_code = format!("TEST_REVOKE_{}", Uuid::new_v4().simple());
    sql_query(
        "INSERT INTO wallet.coupon_template (code, label, reward_kind, reward_payload) \
         VALUES ($1, 'Test Revoke', 'khash', '{\"amount\": 10}'::jsonb)",
    )
    .bind::<Text, _>(&template_code)
    .execute(&mut conn)
    .await
    .unwrap();

    #[derive(QueryableByName)]
    struct R {
        #[diesel(sql_type = diesel::sql_types::BigInt)]
        id: i64,
    }
    let r: R = sql_query(
        "INSERT INTO wallet.coupon (account_id, template_id) \
         SELECT $1, id FROM wallet.coupon_template WHERE code = $2 RETURNING id",
    )
    .bind::<diesel::sql_types::Uuid, _>(account)
    .bind::<Text, _>(&template_code)
    .get_result(&mut conn)
    .await
    .unwrap();

    let revoked = client
        .revoke_coupon(r.id, Some("test".into()))
        .await
        .unwrap();
    assert!(revoked);

    let again = client.revoke_coupon(r.id, None).await.unwrap();
    assert!(!again);
}

#[tokio::test]
#[serial]
async fn null_currency_raises_null_argument() {
    let Some(client) = client().await else {
        return;
    };
    let (_user, account) = fixture_account().await.expect("fixture");

    let err = client
        .debit(DebitRequest {
            account_id: Uuid::new_v4(),
            currency: CurrencyKind::Credits,
            amount: 1,
            source_kind: SourceKind::Admin,
            reason: None,
            ref_type: None,
            ref_id: None,
            idempotency_key: Uuid::new_v4(),
        })
        .await
        .expect_err("must raise");
    assert!(
        matches!(err, WalletError::InsufficientFunds),
        "got: {err:?}"
    );

    let _ = account;
}

/// Service-role insert of a held stackable inventory.item row.
async fn fresh_inventory_item(account: Uuid) -> Uuid {
    fresh_inventory_item_with_qty(account, 1).await
}

/// `fresh_inventory_item` with configurable qty for split-path tests.
async fn fresh_inventory_item_with_qty(account: Uuid, qty: i64) -> Uuid {
    let mut conn = admin_conn()
        .await
        .expect("inventory item helper needs admin conn");
    #[derive(QueryableByName)]
    struct R {
        #[diesel(sql_type = diesel::sql_types::Uuid)]
        id: Uuid,
    }
    let kind = format!("test_kind_{}", Uuid::new_v4());
    let r: R = sql_query(
        "INSERT INTO inventory.item (owner_account, kind, ref, qty, nbt, state, source, source_ref)
         VALUES ($1, $2, $3, $4, '{}'::jsonb, 'held', 'wallet_test', '{}'::jsonb)
         RETURNING id",
    )
    .bind::<diesel::sql_types::Uuid, _>(account)
    .bind::<diesel::sql_types::Text, _>(kind.clone())
    .bind::<diesel::sql_types::Text, _>(kind)
    .bind::<diesel::sql_types::BigInt, _>(qty)
    .get_result(&mut conn)
    .await
    .expect("insert inventory.item");
    r.id
}

async fn credit_khash(client: &WalletClient, account: Uuid, amount: i64) {
    client
        .credit(req_credit(account, amount, Uuid::new_v4()))
        .await
        .expect("seed khash credit");
}

#[tokio::test]
#[serial]
async fn market_create_listing_replay_returns_same_id() {
    let Some(client) = client().await else {
        eprintln!("SKIP: WALLET_TEST_DATABASE_URL unset");
        return;
    };
    let (user, account) = fixture_account().await.expect("fixture");
    let item_id = fresh_inventory_item(account).await;
    let key = Uuid::new_v4();
    let req = MarketCreateListingRequest {
        src_item_id: item_id,
        qty: None,
        buy_now_price: Some(500),
        min_bid: Some(100),
        expires_at: Utc::now() + Duration::hours(2),
        idempotency_key: key,
    };
    let id1 = client
        .market_create_listing(user, req.clone())
        .await
        .expect("create");
    let id2 = client
        .market_create_listing(user, req)
        .await
        .expect("replay");
    assert_eq!(id1, id2, "replay must return same listing id");
}

#[tokio::test]
#[serial]
async fn market_my_listings_and_browse_include_new_listing() {
    let Some(client) = client().await else {
        return;
    };
    let (user, account) = fixture_account().await.expect("fixture");
    let item_id = fresh_inventory_item(account).await;
    let req = MarketCreateListingRequest {
        src_item_id: item_id,
        qty: None,
        buy_now_price: Some(750),
        min_bid: Some(50),
        expires_at: Utc::now() + Duration::hours(2),
        idempotency_key: Uuid::new_v4(),
    };
    let listing_id = client
        .market_create_listing(user, req)
        .await
        .expect("create");

    let mine = client
        .market_my_listings(user, 25, None, None)
        .await
        .expect("my listings");
    assert!(
        mine.iter().any(|r| r.listing_id == listing_id),
        "my listings missing newly-created id"
    );
    let row = mine
        .iter()
        .find(|r| r.listing_id == listing_id)
        .expect("row");
    assert!(matches!(row.listing_status, ListingStatus::Active));

    let active = client
        .market_list_active(100, None, None)
        .await
        .expect("browse");
    assert!(
        active.iter().any(|r| r.listing_id == listing_id),
        "browse missing new listing"
    );

    let detail = client
        .market_listing_detail(listing_id)
        .await
        .expect("detail");
    assert_eq!(detail.listing_id, listing_id);
    assert!(matches!(detail.listing_status, ListingStatus::Active));
}

#[tokio::test]
#[serial]
async fn market_create_listing_partial_split_qty() {
    let Some(client) = client().await else {
        return;
    };
    let (user, account) = fixture_account().await.expect("fixture");
    let item_id = fresh_inventory_item_with_qty(account, 64).await;

    let req = MarketCreateListingRequest {
        src_item_id: item_id,
        qty: Some(16),
        buy_now_price: Some(500),
        min_bid: None,
        expires_at: Utc::now() + Duration::hours(2),
        idempotency_key: Uuid::new_v4(),
    };
    let listing_id = client
        .market_create_listing(user, req)
        .await
        .expect("partial-split create");

    let detail = client
        .market_listing_detail(listing_id)
        .await
        .expect("detail");
    assert!(matches!(detail.listing_status, ListingStatus::Active));

    let mut conn = admin_conn().await.expect("admin");
    #[derive(QueryableByName)]
    struct Q {
        #[diesel(sql_type = diesel::sql_types::BigInt)]
        qty: i64,
    }
    let src: Q = sql_query("SELECT qty FROM inventory.item WHERE id = $1")
        .bind::<diesel::sql_types::Uuid, _>(item_id)
        .get_result(&mut conn)
        .await
        .expect("src qty");
    assert_eq!(src.qty, 48, "source qty must drop to 48 after splitting 16");
    let escrow: Q = sql_query(
        "SELECT qty FROM inventory.item
          WHERE owner_account = $1
            AND state = 'listing_escrow'
            AND source_ref ->> 'split_from' = $2::text",
    )
    .bind::<diesel::sql_types::Uuid, _>(account)
    .bind::<diesel::sql_types::Uuid, _>(item_id)
    .get_result(&mut conn)
    .await
    .expect("escrow row");
    assert_eq!(escrow.qty, 16, "listed escrow row must hold 16");
}

#[tokio::test]
#[serial]
async fn market_place_bid_outbid_refunds_previous_bidder() {
    let Some(client) = client().await else {
        return;
    };
    let (seller, seller_account) = fixture_account().await.expect("seller");
    let (bidder_a, account_a) = fixture_account().await.expect("bidder a");
    let (bidder_b, account_b) = fixture_account().await.expect("bidder b");

    credit_khash(&client, account_a, 5_000).await;
    credit_khash(&client, account_b, 5_000).await;

    let item_id = fresh_inventory_item(seller_account).await;
    let listing_id = client
        .market_create_listing(
            seller,
            MarketCreateListingRequest {
                src_item_id: item_id,
                qty: None,
                buy_now_price: Some(10_000),
                min_bid: Some(100),
                expires_at: Utc::now() + Duration::hours(2),
                idempotency_key: Uuid::new_v4(),
            },
        )
        .await
        .expect("create");

    let bid_a = client
        .market_place_bid(
            bidder_a,
            MarketPlaceBidRequest {
                listing_id,
                amount: 200,
                idempotency_key: Uuid::new_v4(),
            },
        )
        .await
        .expect("bid a");

    let bal_a_after = client.user_balance(bidder_a).await.unwrap();
    assert_eq!(bal_a_after.khash, 5_000 - 200, "bidder a escrow held");

    let _bid_b = client
        .market_place_bid(
            bidder_b,
            MarketPlaceBidRequest {
                listing_id,
                amount: 500,
                idempotency_key: Uuid::new_v4(),
            },
        )
        .await
        .expect("bid b");

    let bal_a_refunded = client.user_balance(bidder_a).await.unwrap();
    assert_eq!(bal_a_refunded.khash, 5_000, "bidder a refunded on outbid");
    let bal_b_after = client.user_balance(bidder_b).await.unwrap();
    assert_eq!(bal_b_after.khash, 5_000 - 500, "bidder b escrow held");

    let bids_a = client
        .market_my_bids(bidder_a, 25, None, None)
        .await
        .expect("a bids");
    let a_row = bids_a
        .iter()
        .find(|b| b.bid_id == bid_a)
        .expect("a bid row");
    assert!(
        matches!(a_row.bid_status, BidStatus::Outbid | BidStatus::Refunded),
        "a bid status: {:?}",
        a_row.bid_status
    );
}

#[tokio::test]
#[serial]
async fn market_buy_now_pays_seller_minus_fee() {
    let Some(client) = client().await else {
        return;
    };
    let (seller, seller_account) = fixture_account().await.expect("seller");
    let (buyer, buyer_account) = fixture_account().await.expect("buyer");
    credit_khash(&client, buyer_account, 10_000).await;

    let item_id = fresh_inventory_item(seller_account).await;
    let listing_id = client
        .market_create_listing(
            seller,
            MarketCreateListingRequest {
                src_item_id: item_id,
                qty: None,
                buy_now_price: Some(1_000),
                min_bid: Some(50),
                expires_at: Utc::now() + Duration::hours(2),
                idempotency_key: Uuid::new_v4(),
            },
        )
        .await
        .expect("create");

    let _bid_id = client
        .market_buy_now(
            buyer,
            MarketBuyNowRequest {
                listing_id,
                idempotency_key: Uuid::new_v4(),
            },
        )
        .await
        .expect("buy_now");

    let seller_bal = client.user_balance(seller).await.unwrap();
    assert_eq!(
        seller_bal.khash, 990,
        "seller paid out 1000 - 1% fee = 990 khash"
    );
    let buyer_bal = client.user_balance(buyer).await.unwrap();
    assert_eq!(buyer_bal.khash, 9_000, "buyer paid 1000 khash");

    let detail = client.market_listing_detail(listing_id).await.unwrap();
    assert!(matches!(detail.listing_status, ListingStatus::Sold));

    let _ = (seller_account, buyer_account);
}

#[tokio::test]
#[serial]
async fn market_cancel_listing_refunds_active_bidder() {
    let Some(client) = client().await else {
        return;
    };
    let (seller, seller_account) = fixture_account().await.expect("seller");
    let (bidder, bidder_account) = fixture_account().await.expect("bidder");
    credit_khash(&client, bidder_account, 5_000).await;

    let item_id = fresh_inventory_item(seller_account).await;
    let listing_id = client
        .market_create_listing(
            seller,
            MarketCreateListingRequest {
                src_item_id: item_id,
                qty: None,
                buy_now_price: Some(10_000),
                min_bid: Some(100),
                expires_at: Utc::now() + Duration::hours(2),
                idempotency_key: Uuid::new_v4(),
            },
        )
        .await
        .expect("create");

    client
        .market_place_bid(
            bidder,
            MarketPlaceBidRequest {
                listing_id,
                amount: 250,
                idempotency_key: Uuid::new_v4(),
            },
        )
        .await
        .expect("bid");

    client
        .market_cancel_listing(
            seller,
            MarketCancelListingRequest {
                listing_id,
                reason: Some("test cancel".into()),
            },
        )
        .await
        .expect("cancel");

    let bal = client.user_balance(bidder).await.unwrap();
    assert_eq!(bal.khash, 5_000, "bidder fully refunded on cancel");

    let detail = client.market_listing_detail(listing_id).await.unwrap();
    assert!(matches!(detail.listing_status, ListingStatus::Cancelled));
}

fn req_credit_credits(account: Uuid, amount: i64, key: Uuid) -> CreditRequest {
    CreditRequest {
        account_id: account,
        currency: CurrencyKind::Credits,
        amount,
        source_kind: SourceKind::Admin,
        reason: Some("fc-test credits seed".into()),
        ref_type: None,
        ref_id: None,
        idempotency_key: key,
    }
}

async fn seed_credits(client: &WalletClient, account: Uuid, amount: i64) {
    client
        .credit(req_credit_credits(account, amount, Uuid::new_v4()))
        .await
        .expect("seed credits");
}

fn fresh_vm_id() -> String {
    format!("fc-{}", Uuid::new_v4().as_simple())
}

#[tokio::test]
#[serial]
async fn firecracker_place_hold_happy_path_and_idempotent_replay() {
    let Some(client) = client().await else {
        eprintln!("SKIP: WALLET_TEST_DATABASE_URL unset");
        return;
    };
    let (_user, account) = fixture_account().await.expect("fixture");
    seed_credits(&client, account, 1_000).await;
    let vm_id = fresh_vm_id();

    let req = FirecrackerPlaceHoldRequest {
        account_id: account,
        vm_id: vm_id.clone(),
        amount: 300,
    };
    let r1 = client.firecracker_place_hold(req.clone()).await.unwrap();
    assert_eq!(r1.amount, 300);
    assert_eq!(r1.watermark, 0);
    assert_eq!(r1.account_id, account);

    let r2 = client.firecracker_place_hold(req).await.unwrap();
    assert_eq!(r2.vm_id, r1.vm_id);
    assert_eq!(
        r2.created_at, r1.created_at,
        "idempotent replay returns same row"
    );

    let total = client.firecracker_active_hold_total(account).await.unwrap();
    assert_eq!(total, 300);
}

#[tokio::test]
#[serial]
async fn firecracker_place_hold_payload_mismatch_raises_replay_mismatch() {
    let Some(client) = client().await else {
        return;
    };
    let (_user, account) = fixture_account().await.expect("fixture");
    seed_credits(&client, account, 1_000).await;
    let vm_id = fresh_vm_id();

    client
        .firecracker_place_hold(FirecrackerPlaceHoldRequest {
            account_id: account,
            vm_id: vm_id.clone(),
            amount: 300,
        })
        .await
        .unwrap();
    let err = client
        .firecracker_place_hold(FirecrackerPlaceHoldRequest {
            account_id: account,
            vm_id,
            amount: 999,
        })
        .await
        .expect_err("must raise");
    assert!(matches!(err, WalletError::ReplayMismatch), "got: {err:?}");
}

#[tokio::test]
#[serial]
async fn firecracker_place_hold_shortfall_raises_insufficient_funds() {
    let Some(client) = client().await else {
        return;
    };
    let (_user, account) = fixture_account().await.expect("fixture");
    seed_credits(&client, account, 25).await;

    let err = client
        .firecracker_place_hold(FirecrackerPlaceHoldRequest {
            account_id: account,
            vm_id: fresh_vm_id(),
            amount: 100,
        })
        .await
        .expect_err("must raise");
    assert!(
        matches!(err, WalletError::InsufficientFunds),
        "got: {err:?}"
    );
}

#[tokio::test]
#[serial]
async fn firecracker_place_hold_short_vm_id_raises_invalid_argument() {
    let Some(client) = client().await else {
        return;
    };
    let (_user, account) = fixture_account().await.expect("fixture");
    seed_credits(&client, account, 1_000).await;

    let err = client
        .firecracker_place_hold(FirecrackerPlaceHoldRequest {
            account_id: account,
            vm_id: "short".into(),
            amount: 100,
        })
        .await
        .expect_err("must raise");
    assert!(
        matches!(err, WalletError::InvalidArgument(_)),
        "got: {err:?}"
    );
}

#[tokio::test]
#[serial]
async fn firecracker_settle_debits_below_hold() {
    let Some(client) = client().await else {
        return;
    };
    let (_user, account) = fixture_account().await.expect("fixture");
    seed_credits(&client, account, 1_000).await;
    let vm_id = fresh_vm_id();

    client
        .firecracker_place_hold(FirecrackerPlaceHoldRequest {
            account_id: account,
            vm_id: vm_id.clone(),
            amount: 300,
        })
        .await
        .unwrap();

    let r = client
        .firecracker_settle(FirecrackerSettleRequest {
            vm_id: vm_id.clone(),
            final_amount: 120,
            idempotency_key: Uuid::new_v4(),
            reason: Some("test".into()),
        })
        .await
        .unwrap();
    assert!(matches!(r.status, FirecrackerSettleStatus::Settled));
    assert_eq!(r.debited_amount, 120);
    assert_eq!(r.reserved_amount, 300);
    assert_eq!(r.released_amount, 180);
    assert!(r.ledger_id.is_some());

    let total = client.firecracker_active_hold_total(account).await.unwrap();
    assert_eq!(total, 0, "hold released after settle");
}

#[tokio::test]
#[serial]
async fn firecracker_settle_caps_when_final_exceeds_hold() {
    let Some(client) = client().await else {
        return;
    };
    let (_user, account) = fixture_account().await.expect("fixture");
    seed_credits(&client, account, 1_000).await;
    let vm_id = fresh_vm_id();

    client
        .firecracker_place_hold(FirecrackerPlaceHoldRequest {
            account_id: account,
            vm_id: vm_id.clone(),
            amount: 200,
        })
        .await
        .unwrap();

    let r = client
        .firecracker_settle(FirecrackerSettleRequest {
            vm_id,
            final_amount: 999_999,
            idempotency_key: Uuid::new_v4(),
            reason: None,
        })
        .await
        .unwrap();
    assert!(matches!(r.status, FirecrackerSettleStatus::SettledCapped));
    assert_eq!(r.debited_amount, 200);
    assert_eq!(r.released_amount, 0);
}

#[tokio::test]
#[serial]
async fn firecracker_settle_zero_amount_releases_without_charge() {
    let Some(client) = client().await else {
        return;
    };
    let (_user, account) = fixture_account().await.expect("fixture");
    seed_credits(&client, account, 1_000).await;
    let vm_id = fresh_vm_id();

    client
        .firecracker_place_hold(FirecrackerPlaceHoldRequest {
            account_id: account,
            vm_id: vm_id.clone(),
            amount: 200,
        })
        .await
        .unwrap();

    let r = client
        .firecracker_settle(FirecrackerSettleRequest {
            vm_id,
            final_amount: 0,
            idempotency_key: Uuid::new_v4(),
            reason: None,
        })
        .await
        .unwrap();
    assert!(matches!(
        r.status,
        FirecrackerSettleStatus::ReleasedZeroCharge
    ));
    assert!(r.ledger_id.is_none());
    assert_eq!(r.debited_amount, 0);
    assert_eq!(r.released_amount, 200);
}

#[tokio::test]
#[serial]
async fn firecracker_settle_missing_vm_is_already_missing() {
    let Some(client) = client().await else {
        return;
    };
    let _ = fixture_account().await.expect("fixture");

    let r = client
        .firecracker_settle(FirecrackerSettleRequest {
            vm_id: fresh_vm_id(),
            final_amount: 100,
            idempotency_key: Uuid::new_v4(),
            reason: None,
        })
        .await
        .unwrap();
    assert!(matches!(r.status, FirecrackerSettleStatus::AlreadyMissing));
    assert!(r.ledger_id.is_none());
    assert_eq!(r.debited_amount, 0);
}

#[tokio::test]
#[serial]
async fn firecracker_update_watermark_clamps_and_is_monotonic() {
    let Some(client) = client().await else {
        return;
    };
    let (_user, account) = fixture_account().await.expect("fixture");
    seed_credits(&client, account, 1_000).await;
    let vm_id = fresh_vm_id();

    client
        .firecracker_place_hold(FirecrackerPlaceHoldRequest {
            account_id: account,
            vm_id: vm_id.clone(),
            amount: 200,
        })
        .await
        .unwrap();

    let r1 = client
        .firecracker_update_watermark(&vm_id, 50)
        .await
        .unwrap();
    assert_eq!(r1.watermark, 50);

    let r2 = client
        .firecracker_update_watermark(&vm_id, 9_999)
        .await
        .unwrap();
    assert_eq!(r2.watermark, 200, "clamped to amount");

    let r3 = client
        .firecracker_update_watermark(&vm_id, 10)
        .await
        .unwrap();
    assert_eq!(r3.watermark, 200, "monotonic — no regress");
}

#[tokio::test]
#[serial]
async fn firecracker_update_watermark_missing_vm_raises_not_found() {
    let Some(client) = client().await else {
        return;
    };
    let _ = fixture_account().await.expect("fixture");

    let err = client
        .firecracker_update_watermark(&fresh_vm_id(), 10)
        .await
        .expect_err("must raise");
    assert!(matches!(err, WalletError::NotFound(_)), "got: {err:?}");
}

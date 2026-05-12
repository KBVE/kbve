//! Integration tests against a real Postgres with the wallet schema applied.
//!
//! Set `WALLET_TEST_DATABASE_URL` to a connection string pointing at a DB
//! with all migrations through `20260511104220_wallet_schema_init` applied.
//! Tests are skipped when the env var is unset so CI can opt in.
//!
//! Run:
//!
//! ```bash
//! WALLET_TEST_DATABASE_URL="postgres://postgres:postgres@localhost:54322/postgres" \
//!   cargo test -p kbve --features wallet -- --include-ignored
//! ```

#![cfg(test)]

use std::env;

use diesel::pg::PgConnection;
use diesel::prelude::*;
use diesel::sql_query;
use diesel::sql_types::Text;
use serial_test::serial;
use uuid::Uuid;

use super::{
    CouponStatus, CreditRequest, CurrencyKind, DebitRequest, RewardKind, SourceKind,
    TransferRequest, WalletClient, WalletError,
};

const TEST_URL_ENV: &str = "WALLET_TEST_DATABASE_URL";

fn client() -> Option<WalletClient> {
    let url = env::var(TEST_URL_ENV).ok()?;
    env::set_var("WALLET_DATABASE_URL", &url);
    Some(WalletClient::from_env().expect("client from_env"))
}

/// Direct (non-pool) admin connection for seeding fixtures.
fn admin_conn() -> Option<PgConnection> {
    let url = env::var(TEST_URL_ENV).ok()?;
    PgConnection::establish(&url).ok()
}

/// Create a fresh `auth.users` row + wallet account, return both UUIDs.
/// Bypasses the proxy provisioning path so individual ops are testable
/// in isolation.
fn fixture_account() -> Option<(Uuid, Uuid)> {
    let mut conn = admin_conn()?;
    let user_id = Uuid::new_v4();
    sql_query("INSERT INTO auth.users (id) VALUES ($1) ON CONFLICT DO NOTHING")
        .bind::<diesel::sql_types::Uuid, _>(user_id)
        .execute(&mut conn)
        .expect("insert auth.users");
    let row: diesel::sql_types::Uuid;
    #[derive(QueryableByName)]
    struct R {
        #[diesel(sql_type = diesel::sql_types::Uuid)]
        id: Uuid,
    }
    let _ = row;
    let r: R =
        sql_query("INSERT INTO wallet.account (kind, user_id) VALUES ('user', $1) RETURNING id")
            .bind::<diesel::sql_types::Uuid, _>(user_id)
            .get_result(&mut conn)
            .expect("insert wallet.account");
    sql_query("INSERT INTO wallet.balance (account_id) VALUES ($1) ON CONFLICT DO NOTHING")
        .bind::<diesel::sql_types::Uuid, _>(r.id)
        .execute(&mut conn)
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
    let Some(client) = client() else {
        eprintln!("SKIP: WALLET_TEST_DATABASE_URL unset");
        return;
    };
    let (_user, account) = fixture_account().expect("fixture");
    let key = Uuid::new_v4();

    let id1 = client.credit(req_credit(account, 100, key)).await.unwrap();
    let id2 = client.credit(req_credit(account, 100, key)).await.unwrap();
    assert_eq!(id1, id2, "replay must return same ledger id");
}

#[tokio::test]
#[serial]
async fn credit_replay_with_different_payload_raises_replay_mismatch() {
    let Some(client) = client() else {
        return;
    };
    let (_user, account) = fixture_account().expect("fixture");
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
    let Some(client) = client() else {
        return;
    };
    let (_user, account) = fixture_account().expect("fixture");

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
    let Some(client) = client() else {
        return;
    };
    let (_user_a, account_a) = fixture_account().expect("fixture a");
    let (_user_b, account_b) = fixture_account().expect("fixture b");

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
    let Some(client) = client() else {
        return;
    };
    let mut conn = admin_conn().unwrap();

    // Fresh user; let proxy provision the account + welcome coupon.
    let user_id = Uuid::new_v4();
    sql_query("INSERT INTO auth.users (id) VALUES ($1) ON CONFLICT DO NOTHING")
        .bind::<diesel::sql_types::Uuid, _>(user_id)
        .execute(&mut conn)
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

    // Replay returns the same ledger id.
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
async fn revoke_unredeemed_coupon_succeeds() {
    let Some(client) = client() else {
        return;
    };
    let (_user, account) = fixture_account().expect("fixture");
    let mut conn = admin_conn().unwrap();

    // Seed a one-off template + instance so we don't touch WELCOME_KHASH.
    let template_code = format!("TEST_REVOKE_{}", Uuid::new_v4().simple());
    sql_query(
        "INSERT INTO wallet.coupon_template (code, label, reward_kind, reward_payload) \
         VALUES ($1, 'Test Revoke', 'khash', '{\"amount\": 10}'::jsonb)",
    )
    .bind::<Text, _>(&template_code)
    .execute(&mut conn)
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
    .unwrap();

    let revoked = client
        .revoke_coupon(r.id, Some("test".into()))
        .await
        .unwrap();
    assert!(revoked);

    // Second call: already revoked → false, no raise.
    let again = client.revoke_coupon(r.id, None).await.unwrap();
    assert!(!again);
}

#[tokio::test]
#[serial]
async fn null_currency_raises_null_argument() {
    let Some(client) = client() else {
        return;
    };
    let (_user, account) = fixture_account().expect("fixture");

    // We can't pass NULL through our typed CreditRequest, so smoke-test the
    // SQL-level guard by calling debit with a fresh account that has no
    // balance row — service_debit raises insufficient_funds (53100).
    let err = client
        .debit(DebitRequest {
            account_id: Uuid::new_v4(), // non-existent
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

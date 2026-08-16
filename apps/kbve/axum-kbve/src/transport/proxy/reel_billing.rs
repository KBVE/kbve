//! Credit billing for reel fetches.
//!
//! Reel pulls torrents; the wallet lives here. Reel records who asked for a
//! fetch and how many bytes it must move, this module turns that into ledger
//! rows. One charge per fetch at **1 credit per MiB**, and re-adding something
//! reel still has cached costs nothing because reel reuses the existing entry
//! (same fetch epoch → same idempotency key → the wallet no-ops).

use std::time::Duration;

use kbve::wallet::{CurrencyKind, DebitRequest, SourceKind, WalletClient};
use serde::Deserialize;
use uuid::Uuid;

use crate::db::get_wallet_client;

/// Namespace for deriving a fetch's idempotency key. Fixed forever — changing
/// it would re-bill every cached fetch.
const REEL_BILLING_NAMESPACE: Uuid = Uuid::from_u128(0x7265_656c_0000_4000_8000_6269_6c6c_696eu128);

#[derive(Debug, Clone, Deserialize)]
pub(crate) struct PendingCharge {
    pub id: String,
    pub account_id: String,
    pub added_at: u64,
    pub credits: u64,
}

#[derive(Debug, Clone, Deserialize)]
pub(crate) struct PendingRefund {
    pub id: String,
    pub account_id: String,
    pub added_at: u64,
    pub credits: u64,
    pub reason: String,
}

#[derive(Debug, Clone, Deserialize)]
pub(crate) struct BillingQueue {
    pub charges: Vec<PendingCharge>,
    pub refunds: Vec<PendingRefund>,
}

/// The charge key. `added_at` is the fetch epoch, so the same torrent re-fetched
/// after reel reaped it produces a different key and bills again — you pay each
/// time reel actually has to pull the bytes. The account is in the key because
/// `wallet.ledger.idempotency_key` is globally unique: an account-less key would
/// collide across users and trip the replay-fingerprint check instead of
/// charging them.
pub(crate) fn charge_key(account_id: &str, infohash: &str, added_at: u64) -> Uuid {
    Uuid::new_v5(
        &REEL_BILLING_NAMESPACE,
        format!("reel_fetch:{account_id}:{infohash}:{added_at}").as_bytes(),
    )
}

pub(crate) fn refund_key(account_id: &str, infohash: &str, added_at: u64) -> Uuid {
    Uuid::new_v5(
        &REEL_BILLING_NAMESPACE,
        format!("reel_refund:{account_id}:{infohash}:{added_at}").as_bytes(),
    )
}

fn upstream() -> String {
    std::env::var("REEL_UPSTREAM_URL")
        .unwrap_or_else(|_| "http://reel.reel.svc.cluster.local:8080".into())
        .trim_end_matches('/')
        .to_string()
}

fn authed(req: reqwest::RequestBuilder) -> reqwest::RequestBuilder {
    match std::env::var("REEL_API_TOKEN") {
        Ok(t) if !t.is_empty() => req.bearer_auth(t),
        _ => req,
    }
}

async fn fetch_queue(client: &reqwest::Client) -> anyhow::Result<BillingQueue> {
    let url = format!("{}/billing/queue", upstream());
    let resp = authed(client.get(&url)).send().await?;
    if !resp.status().is_success() {
        anyhow::bail!("reel billing queue returned {}", resp.status());
    }
    Ok(resp.json::<BillingQueue>().await?)
}

async fn report_settled(
    client: &reqwest::Client,
    id: &str,
    credits: u64,
    error: Option<String>,
) -> anyhow::Result<()> {
    let url = format!("{}/torrents/{}/billing/settle", upstream(), id);
    let body = serde_json::json!({ "credits": credits, "error": error });
    let resp = authed(client.post(&url).json(&body)).send().await?;
    if !resp.status().is_success() {
        anyhow::bail!("reel settle returned {}", resp.status());
    }
    Ok(())
}

async fn report_refunded(client: &reqwest::Client, id: &str) -> anyhow::Result<()> {
    let url = format!("{}/torrents/{}/billing/refunded", upstream(), id);
    let resp = authed(client.post(&url)).send().await?;
    if !resp.status().is_success() {
        anyhow::bail!("reel refund ack returned {}", resp.status());
    }
    Ok(())
}

async fn delete_torrent(client: &reqwest::Client, id: &str) -> anyhow::Result<()> {
    let url = format!("{}/torrents/{}", upstream(), id);
    authed(client.delete(&url)).send().await?;
    Ok(())
}

async fn settle_charge(
    wallet: &WalletClient,
    http: &reqwest::Client,
    c: &PendingCharge,
) -> anyhow::Result<()> {
    let account_id = Uuid::parse_str(&c.account_id)?;
    let amount = i64::try_from(c.credits)?;
    let req = DebitRequest {
        account_id,
        currency: CurrencyKind::Credits,
        amount,
        // No reel-specific `wallet.source_kind` variant: adding one means an
        // enum ALTER in its own migration. A fetch is a purchase.
        source_kind: SourceKind::Purchase,
        reason: Some(format!("reel fetch {}", c.id)),
        ref_type: Some("reel_fetch".into()),
        ref_id: None,
        idempotency_key: charge_key(&c.account_id, &c.id, c.added_at),
    };
    match wallet.debit(req).await {
        Ok(ledger_id) => {
            tracing::info!(id = %c.id, credits = c.credits, ledger_id, "reel fetch billed");
            report_settled(http, &c.id, c.credits, None).await
        }
        Err(e) => {
            let msg = e.to_string();
            // Out of credits is terminal for this fetch: stop the download
            // rather than let it finish something nobody paid for. Anything
            // else (wallet blip, pool exhausted) is left for the next sweep.
            if is_insufficient_funds(&msg) {
                tracing::warn!(id = %c.id, credits = c.credits, "reel fetch unpaid; dropping torrent");
                let _ = report_settled(http, &c.id, 0, Some(msg)).await;
                delete_torrent(http, &c.id).await
            } else {
                tracing::warn!(id = %c.id, error = %msg, "reel fetch debit failed; will retry");
                report_settled(http, &c.id, 0, Some(msg)).await
            }
        }
    }
}

pub(crate) fn is_insufficient_funds(msg: &str) -> bool {
    let m = msg.to_ascii_lowercase();
    m.contains("insufficient") || m.contains("balance")
}

async fn settle_refund(
    wallet: &WalletClient,
    http: &reqwest::Client,
    r: &PendingRefund,
) -> anyhow::Result<()> {
    let account_id = Uuid::parse_str(&r.account_id)?;
    let amount = i64::try_from(r.credits)?;
    let req = DebitRequest {
        account_id,
        currency: CurrencyKind::Credits,
        amount,
        source_kind: SourceKind::Refund,
        reason: Some(format!("reel fetch failed: {}", r.reason)),
        ref_type: Some("reel_fetch_refund".into()),
        ref_id: None,
        idempotency_key: refund_key(&r.account_id, &r.id, r.added_at),
    };
    let ledger_id = wallet.credit(req).await?;
    tracing::info!(id = %r.id, credits = r.credits, ledger_id, "reel fetch refunded");
    report_refunded(http, &r.id).await
}

/// Poll reel for owed charges and refunds and move the credits. Runs forever;
/// every step is idempotent, so a crash mid-sweep replays harmlessly.
pub async fn reel_billing_loop(interval_secs: u64) {
    let http = match reqwest::Client::builder()
        .timeout(Duration::from_secs(15))
        .build()
    {
        Ok(c) => c,
        Err(e) => {
            tracing::error!(error = %e, "reel billing: http client build failed; billing disabled");
            return;
        }
    };
    let mut ticker = tokio::time::interval(Duration::from_secs(interval_secs.max(5)));
    loop {
        ticker.tick().await;
        let wallet = match get_wallet_client() {
            Some(w) => w,
            None => continue,
        };
        let queue = match fetch_queue(&http).await {
            Ok(q) => q,
            Err(e) => {
                tracing::debug!(error = %e, "reel billing: queue unavailable");
                continue;
            }
        };
        for c in &queue.charges {
            if let Err(e) = settle_charge(wallet, &http, c).await {
                tracing::warn!(id = %c.id, error = %e, "reel billing: charge sweep failed");
            }
        }
        for r in &queue.refunds {
            if let Err(e) = settle_refund(wallet, &http, r).await {
                tracing::warn!(id = %r.id, error = %e, "reel billing: refund sweep failed");
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn key_is_stable_for_the_same_fetch() {
        let a = charge_key("acct-1", "hash-1", 100);
        let b = charge_key("acct-1", "hash-1", 100);
        assert_eq!(a, b, "a retried sweep must not double-charge");
    }

    #[test]
    fn refetch_after_a_reap_is_a_new_charge() {
        let first = charge_key("acct-1", "hash-1", 100);
        let after_reap = charge_key("acct-1", "hash-1", 900);
        assert_ne!(
            first, after_reap,
            "the bytes get pulled again, so it bills again"
        );
    }

    #[test]
    fn accounts_do_not_share_a_key() {
        assert_ne!(
            charge_key("acct-1", "hash-1", 100),
            charge_key("acct-2", "hash-1", 100),
            "ledger idempotency_key is globally unique; a shared key would trip \
             the replay fingerprint instead of billing the second account"
        );
    }

    #[test]
    fn charge_and_refund_keys_never_collide() {
        assert_ne!(
            charge_key("acct-1", "hash-1", 100),
            refund_key("acct-1", "hash-1", 100)
        );
    }

    #[test]
    fn insufficient_funds_is_detected() {
        assert!(is_insufficient_funds("insufficient_funds"));
        assert!(is_insufficient_funds("Insufficient credits for debit"));
        assert!(!is_insufficient_funds("connection pool timed out"));
    }
}

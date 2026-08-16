//! Fetch billing: reel charges a wallet account once per fetch, priced on the
//! bytes it has to pull. Reel itself never touches the wallet — it records who
//! asked, exposes what is owed, and stores the settlement the gateway reports
//! back. All credit movement stays in axum-kbve, which owns wallet access.

use crate::state::{Metadata, TorrentState};

pub const BYTES_PER_CREDIT: u64 = 1024 * 1024;

/// One credit per MiB, rounded up: any fetch that moves bytes costs at least
/// one credit, since `wallet.service_debit` rejects a zero debit.
pub fn credits_for_bytes(bytes: u64) -> u64 {
    bytes.div_ceil(BYTES_PER_CREDIT)
}

/// A fetch waiting to be charged. `bytes` is the torrent's resolved total —
/// live `total_bytes` while leeching, the moved size once seeding.
#[derive(Clone, Debug, PartialEq, Eq, serde::Serialize)]
pub struct PendingCharge {
    pub id: String,
    pub account_id: String,
    pub added_at: u64,
    pub bytes: u64,
    pub credits: u64,
}

/// A fetch that was charged and then failed, so the credits are owed back.
#[derive(Clone, Debug, PartialEq, Eq, serde::Serialize)]
pub struct PendingRefund {
    pub id: String,
    pub account_id: String,
    pub added_at: u64,
    pub credits: u64,
    pub reason: String,
}

/// Resolved size for billing: nothing until the torrent's metadata lands, so a
/// magnet that never finds peers is never charged.
pub fn billable_bytes(m: &Metadata, live_total: Option<u64>) -> u64 {
    if m.size > 0 {
        return m.size;
    }
    live_total.unwrap_or(0)
}

pub fn pending_charge(m: &Metadata, live_total: Option<u64>) -> Option<PendingCharge> {
    let account_id = m.account_id.clone()?;
    if m.billed_at.is_some() {
        return None;
    }
    // A fetch that already died owes nothing — charging it just to refund it
    // would put two rows on the ledger for a download that never happened.
    if matches!(m.state, TorrentState::Failed | TorrentState::Reaped) {
        return None;
    }
    let bytes = billable_bytes(m, live_total);
    if bytes == 0 {
        return None;
    }
    Some(PendingCharge {
        id: m.id.clone(),
        account_id,
        added_at: m.added_at,
        bytes,
        credits: credits_for_bytes(bytes),
    })
}

pub fn pending_refund(m: &Metadata) -> Option<PendingRefund> {
    let account_id = m.account_id.clone()?;
    let credits = m.billed_credits?;
    if m.billed_at.is_none() || m.refunded_at.is_some() || credits == 0 {
        return None;
    }
    if m.state != TorrentState::Failed {
        return None;
    }
    Some(PendingRefund {
        id: m.id.clone(),
        account_id,
        added_at: m.added_at,
        credits,
        reason: m
            .error
            .clone()
            .unwrap_or_else(|| "fetch failed".to_string()),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::state::{HlsStatus, TranscodeStatus};

    fn meta(state: TorrentState) -> Metadata {
        Metadata {
            id: "abc".into(),
            name: "abc".into(),
            path: "/lib/abc".into(),
            size: 0,
            completed_at: None,
            last_access: 10,
            state,
            error: None,
            active_path: None,
            transcode: TranscodeStatus::None,
            transcode_path: None,
            transcode_error: None,
            hls: HlsStatus::None,
            hls_dir: None,
            hls_error: None,
            added_at: 100,
            account_id: Some("acct-1".into()),
            billed_credits: None,
            billed_at: None,
            refunded_at: None,
            billing_error: None,
        }
    }

    #[test]
    fn one_credit_per_mib_rounded_up() {
        assert_eq!(credits_for_bytes(0), 0);
        assert_eq!(credits_for_bytes(1), 1, "any bytes at all cost a credit");
        assert_eq!(credits_for_bytes(BYTES_PER_CREDIT), 1);
        assert_eq!(credits_for_bytes(BYTES_PER_CREDIT + 1), 2);
        assert_eq!(credits_for_bytes(1024 * BYTES_PER_CREDIT), 1024, "1 GiB");
    }

    #[test]
    fn charges_once_metadata_resolves() {
        let m = meta(TorrentState::Leeching);
        assert_eq!(pending_charge(&m, None), None, "size unknown yet");
        let c = pending_charge(&m, Some(400 * BYTES_PER_CREDIT)).unwrap();
        assert_eq!(c.credits, 400);
        assert_eq!(c.added_at, 100, "epoch rides along for the idempotency key");
    }

    #[test]
    fn completed_size_wins_over_live_estimate() {
        let mut m = meta(TorrentState::Seeding);
        m.size = 10 * BYTES_PER_CREDIT;
        let c = pending_charge(&m, Some(999 * BYTES_PER_CREDIT)).unwrap();
        assert_eq!(c.credits, 10);
    }

    #[test]
    fn already_billed_is_not_charged_again() {
        let mut m = meta(TorrentState::Seeding);
        m.size = BYTES_PER_CREDIT;
        m.billed_at = Some(5);
        m.billed_credits = Some(1);
        assert_eq!(pending_charge(&m, None), None);
    }

    #[test]
    fn unowned_fetch_is_never_charged() {
        let mut m = meta(TorrentState::Seeding);
        m.size = BYTES_PER_CREDIT;
        m.account_id = None;
        assert_eq!(pending_charge(&m, None), None);
    }

    #[test]
    fn dead_fetch_is_not_charged() {
        for state in [TorrentState::Failed, TorrentState::Reaped] {
            let mut m = meta(state);
            m.size = BYTES_PER_CREDIT;
            assert_eq!(pending_charge(&m, None), None);
        }
    }

    #[test]
    fn failure_after_billing_owes_a_refund() {
        let mut m = meta(TorrentState::Failed);
        m.billed_at = Some(5);
        m.billed_credits = Some(400);
        m.error = Some("no data received for 300s — no seeders".into());
        let r = pending_refund(&m).unwrap();
        assert_eq!(r.credits, 400);
        assert!(r.reason.contains("no seeders"));

        m.refunded_at = Some(7);
        assert_eq!(pending_refund(&m), None, "refunded once, never twice");
    }

    #[test]
    fn reaped_fetch_keeps_its_charge() {
        let mut m = meta(TorrentState::Reaped);
        m.billed_at = Some(5);
        m.billed_credits = Some(400);
        assert_eq!(
            pending_refund(&m),
            None,
            "expiry is the deal, not a failure — the bytes were delivered"
        );
    }
}

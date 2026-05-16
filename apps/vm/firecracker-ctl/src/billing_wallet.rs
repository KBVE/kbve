use std::sync::Arc;

use axum::http::HeaderMap;
use kbve::wallet::{
    FirecrackerPlaceHoldRequest, FirecrackerSettleRequest, WalletClient, WalletError,
};
use uuid::Uuid;

use crate::billing;

pub const ACCOUNT_HEADER: &str = "x-kbve-account-id";

#[derive(Clone)]
pub struct BillingContext {
    pub wallet: Arc<WalletClient>,
    pub enabled: bool,
}

impl BillingContext {
    pub fn new(wallet: Arc<WalletClient>, enabled: bool) -> Self {
        Self { wallet, enabled }
    }
}

pub fn extract_account_id(headers: &HeaderMap) -> Option<Uuid> {
    headers
        .get(ACCOUNT_HEADER)?
        .to_str()
        .ok()?
        .parse::<Uuid>()
        .ok()
}

pub fn settle_idempotency_key(vm_id: &str) -> Uuid {
    Uuid::new_v5(
        &Uuid::NAMESPACE_OID,
        format!("fc-settle:{vm_id}").as_bytes(),
    )
}

#[derive(Debug)]
pub enum HoldOutcome {
    Skipped,
    Placed { amount: i64 },
}

#[derive(Debug)]
pub enum HoldError {
    MissingAccount,
    Insufficient { balance_short_of: i64 },
    Other(String),
}

pub async fn place_hold(
    ctx: Option<&BillingContext>,
    account_id: Option<Uuid>,
    vm_id: &str,
    vcpu_count: u8,
    mem_size_mib: u16,
    idle_ttl_secs: u32,
    expected_requests: u64,
) -> Result<HoldOutcome, HoldError> {
    let ctx = match ctx {
        Some(c) if c.enabled => c,
        _ => return Ok(HoldOutcome::Skipped),
    };
    let account_id = match account_id {
        Some(a) => a,
        None => return Err(HoldError::MissingAccount),
    };
    let amount = billing::hold_amount(vcpu_count, mem_size_mib, idle_ttl_secs, expected_requests)
        .min(i64::MAX as u64) as i64;
    match ctx
        .wallet
        .firecracker_place_hold(FirecrackerPlaceHoldRequest {
            account_id,
            vm_id: vm_id.to_string(),
            amount,
        })
        .await
    {
        Ok(_) => Ok(HoldOutcome::Placed { amount }),
        Err(WalletError::InsufficientFunds) => Err(HoldError::Insufficient {
            balance_short_of: amount,
        }),
        Err(e) => Err(HoldError::Other(e.to_string())),
    }
}

pub async fn settle(ctx: Option<&BillingContext>, vm_id: &str, accumulated_credits: u64) {
    let ctx = match ctx {
        Some(c) if c.enabled => c,
        _ => return,
    };
    let final_amount = accumulated_credits.min(i64::MAX as u64) as i64;
    let key = settle_idempotency_key(vm_id);
    match ctx
        .wallet
        .firecracker_settle(FirecrackerSettleRequest {
            vm_id: vm_id.to_string(),
            final_amount,
            idempotency_key: key,
            reason: None,
        })
        .await
    {
        Ok(r) => {
            tracing::info!(
                "fc-billing: settled vm_id={vm_id} status={:?} debited={} reserved={} released={} ledger={:?}",
                r.status,
                r.debited_amount,
                r.reserved_amount,
                r.released_amount,
                r.ledger_id,
            );
        }
        Err(e) => {
            tracing::warn!("fc-billing: settle failed for vm_id={vm_id}: {e}");
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::http::HeaderValue;

    #[test]
    fn extract_account_id_returns_uuid_when_header_valid() {
        let mut h = HeaderMap::new();
        let id = Uuid::new_v4();
        h.insert(
            ACCOUNT_HEADER,
            HeaderValue::from_str(&id.to_string()).unwrap(),
        );
        assert_eq!(extract_account_id(&h), Some(id));
    }

    #[test]
    fn extract_account_id_returns_none_when_header_missing() {
        let h = HeaderMap::new();
        assert_eq!(extract_account_id(&h), None);
    }

    #[test]
    fn extract_account_id_returns_none_when_header_malformed() {
        let mut h = HeaderMap::new();
        h.insert(ACCOUNT_HEADER, HeaderValue::from_static("not-a-uuid"));
        assert_eq!(extract_account_id(&h), None);
    }

    #[test]
    fn settle_idempotency_key_is_deterministic_per_vm_id() {
        let a = settle_idempotency_key("fc-demo-1");
        let b = settle_idempotency_key("fc-demo-1");
        assert_eq!(a, b);
    }

    #[test]
    fn settle_idempotency_key_differs_across_vm_ids() {
        let a = settle_idempotency_key("fc-demo-1");
        let b = settle_idempotency_key("fc-demo-2");
        assert_ne!(a, b);
    }
}

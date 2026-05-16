use tokio::sync::OnceCell;

use kbve::referral::ReferralClient;

use super::wallet::get_wallet_client;

static REFERRAL_CLIENT: OnceCell<Option<ReferralClient>> = OnceCell::const_new();

/// Build the referral client from the already-initialized wallet pool.
/// Returns `true` only if the wallet pool was up — the referral client
/// has no independent DB config, it just borrows the wallet's bb8 pool.
pub async fn init_referral_client() -> bool {
    REFERRAL_CLIENT
        .get_or_init(|| async {
            match get_wallet_client() {
                Some(wallet) => {
                    let client = ReferralClient::new(wallet.rw_pool().clone());
                    tracing::info!("ReferralClient initialized");
                    Some(client)
                }
                None => {
                    tracing::warn!("ReferralClient disabled: wallet pool not available");
                    None
                }
            }
        })
        .await
        .is_some()
}

pub fn get_referral_client() -> Option<&'static ReferralClient> {
    REFERRAL_CLIENT.get().and_then(|c| c.as_ref())
}

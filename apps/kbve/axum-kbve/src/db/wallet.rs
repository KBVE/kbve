//! WalletClient registry — boots once at startup, returned to handlers via
//! a `OnceLock`-backed getter (same pattern as the forum / mc / profile
//! services in this crate). Heavy state stays out of `AppState`.

use std::sync::OnceLock;

use kbve::wallet::WalletClient;

static WALLET_CLIENT: OnceLock<Option<WalletClient>> = OnceLock::new();

/// Build the wallet client from env (`WALLET_DATABASE_URL` with
/// `DATABASE_URL_PROD` fallback). Returns `true` if the client is live.
///
/// Idempotent — subsequent calls return the cached result.
pub fn init_wallet_client() -> bool {
    WALLET_CLIENT
        .get_or_init(|| match WalletClient::from_env() {
            Ok(client) => {
                tracing::info!("WalletClient initialized");
                Some(client)
            }
            Err(e) => {
                tracing::warn!(
                    error = %e,
                    "WalletClient disabled: failed to build pool"
                );
                None
            }
        })
        .is_some()
}

pub fn get_wallet_client() -> Option<&'static WalletClient> {
    WALLET_CLIENT.get().and_then(|c| c.as_ref())
}

use tokio::sync::OnceCell;

use kbve::lot::proxy::LotClient;
use kbve::wallet::WalletClient;

use super::get_wallet_client;

static LOT_CLIENT: OnceCell<Option<LotClient>> = OnceCell::const_new();

pub async fn init_lot_client() -> bool {
    LOT_CLIENT
        .get_or_init(|| async {
            match get_wallet_client() {
                Some(wallet) => {
                    tracing::info!("LotClient initialized (sharing WalletClient pool)");
                    Some(LotClient::new(wallet.clone()))
                }
                None => match WalletClient::from_env().await {
                    Ok(wallet) => {
                        tracing::info!("LotClient initialized (standalone wallet pool)");
                        Some(LotClient::new(wallet))
                    }
                    Err(e) => {
                        tracing::warn!(error = %e, "LotClient disabled: no wallet pool available");
                        None
                    }
                },
            }
        })
        .await
        .is_some()
}

pub fn get_lot_client() -> Option<&'static LotClient> {
    LOT_CLIENT.get().and_then(|c| c.as_ref())
}

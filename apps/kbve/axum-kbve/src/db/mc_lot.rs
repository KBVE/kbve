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
                    tracing::info!(
                        source = "shared_wallet_pool",
                        "LotClient initialized"
                    );
                    Some(LotClient::new(wallet.clone()))
                }
                None => match WalletClient::from_env().await {
                    Ok(wallet) => {
                        tracing::info!(
                            source = "standalone_pool",
                            "LotClient initialized; wallet client wasn't ready so we bootstrapped a private pool — check init order if this is unexpected"
                        );
                        Some(LotClient::new(wallet))
                    }
                    Err(e) => {
                        tracing::warn!(
                            error = %e,
                            error.kind = std::any::type_name_of_val(&e),
                            "LotClient disabled: WalletClient::from_env failed; /api/v1/mc/lots/* will return 503 until wallet env is configured"
                        );
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

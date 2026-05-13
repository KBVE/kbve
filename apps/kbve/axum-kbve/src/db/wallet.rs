use tokio::sync::OnceCell;

use kbve::wallet::WalletClient;

static WALLET_CLIENT: OnceCell<Option<WalletClient>> = OnceCell::const_new();

pub async fn init_wallet_client() -> bool {
    WALLET_CLIENT
        .get_or_init(|| async {
            match WalletClient::from_env().await {
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
            }
        })
        .await
        .is_some()
}

pub fn get_wallet_client() -> Option<&'static WalletClient> {
    WALLET_CLIENT.get().and_then(|c| c.as_ref())
}

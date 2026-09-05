use kbve::entity::client::vault::VaultClient;
use tracing::{info, warn};

/// Environment variable names checked (in order) for a GitHub token.
const ENV_KEYS: &[&str] = &["GITHUB_TOKEN", "GITHUB_TOKEN_API", "GITHUB_TOKEN_PAT"];

/// Resolve a GitHub personal-access token.
///
/// **Priority:**
/// 1. Environment variables: `GITHUB_TOKEN`, `GITHUB_TOKEN_API`, `GITHUB_TOKEN_PAT`
///    (first non-empty value wins)
/// 2. Supabase Vault via Edge Function, keyed by `guild_id`
///    (calls `vault-reader` with command `"get_by_tag"` and tag `github_pat:<guild_id>`)
///
/// Returns `None` when no token is available from any source.
pub async fn resolve_github_token(guild_id: Option<u64>) -> Option<String> {
    // 1. Check env vars
    for key in ENV_KEYS {
        if let Ok(val) = std::env::var(key)
            && !val.is_empty()
        {
            info!(source = key, "Using GitHub token from env var");
            return Some(val);
        }
    }

    // 2. Fall back to Supabase vault (requires guild context)
    let gid = match guild_id {
        Some(id) => id,
        None => {
            warn!("No GitHub token in env and no guild_id provided for vault lookup");
            return None;
        }
    };

    if let Some(vault) = VaultClient::from_env() {
        let tag = format!("github_pat:{gid}");
        info!(guild_id = gid, tag = %tag, "Fetching GitHub token from Supabase Vault");
        match vault.get_secret_by_tag(&tag).await {
            Ok(token) => {
                info!(guild_id = gid, "GitHub token retrieved from Supabase Vault");
                return Some(token);
            }
            Err(e) => {
                warn!(
                    error = %e,
                    guild_id = gid,
                    "Failed to fetch GitHub token from vault"
                );
            }
        }
    } else {
        warn!("No GitHub token in env and Supabase vault not configured");
    }

    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use serial_test::serial;

    #[test]
    #[serial]
    fn test_env_priority_first_wins() {
        unsafe {
            std::env::set_var("GITHUB_TOKEN", "tok-env");
            std::env::set_var("GITHUB_TOKEN_API", "tok-api");
            std::env::set_var("GITHUB_TOKEN_PAT", "tok-pat");
        }

        let rt = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();
        let result = rt.block_on(resolve_github_token(None));
        assert_eq!(result, Some("tok-env".to_string()));

        unsafe {
            std::env::remove_var("GITHUB_TOKEN");
            std::env::remove_var("GITHUB_TOKEN_API");
            std::env::remove_var("GITHUB_TOKEN_PAT");
        }
    }

    #[test]
    #[serial]
    fn test_env_skips_empty() {
        unsafe {
            std::env::set_var("GITHUB_TOKEN", "");
            std::env::set_var("GITHUB_TOKEN_API", "tok-api");
            std::env::remove_var("GITHUB_TOKEN_PAT");
        }

        let rt = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();
        let result = rt.block_on(resolve_github_token(None));
        assert_eq!(result, Some("tok-api".to_string()));

        unsafe {
            std::env::remove_var("GITHUB_TOKEN");
            std::env::remove_var("GITHUB_TOKEN_API");
        }
    }

    #[test]
    #[serial]
    fn test_env_fallback_to_pat() {
        unsafe {
            std::env::remove_var("GITHUB_TOKEN");
            std::env::remove_var("GITHUB_TOKEN_API");
            std::env::set_var("GITHUB_TOKEN_PAT", "tok-pat");
        }

        let rt = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();
        let result = rt.block_on(resolve_github_token(None));
        assert_eq!(result, Some("tok-pat".to_string()));

        unsafe {
            std::env::remove_var("GITHUB_TOKEN_PAT");
        }
    }

    #[test]
    #[serial]
    fn test_no_env_no_guild_returns_none() {
        unsafe {
            std::env::remove_var("GITHUB_TOKEN");
            std::env::remove_var("GITHUB_TOKEN_API");
            std::env::remove_var("GITHUB_TOKEN_PAT");
            std::env::remove_var("SUPABASE_URL");
            std::env::remove_var("SUPABASE_SERVICE_ROLE_KEY");
        }

        let rt = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();
        let result = rt.block_on(resolve_github_token(None));
        assert_eq!(result, None);
    }

    #[test]
    #[serial]
    fn test_no_env_no_vault_config_returns_none() {
        unsafe {
            std::env::remove_var("GITHUB_TOKEN");
            std::env::remove_var("GITHUB_TOKEN_API");
            std::env::remove_var("GITHUB_TOKEN_PAT");
            std::env::remove_var("SUPABASE_URL");
            std::env::remove_var("SUPABASE_SERVICE_ROLE_KEY");
        }

        let rt = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();
        let result = rt.block_on(resolve_github_token(Some(123456)));
        assert_eq!(result, None);
    }
}

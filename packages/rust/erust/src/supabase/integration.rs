//! Integration tests that run against a real Supabase instance.
//!
//! These tests are `#[ignore]` by default and only run when:
//!   - `SUPABASE_URL` and `SUPABASE_ANON_KEY` env vars are set
//!   - Invoked with `cargo test -- --ignored` or `cargo test -- --include-ignored`
//!
//! In GitHub Actions, set these as repository secrets and expose them as env vars.

#[cfg(test)]
mod tests {
	use crate::supabase::{SupabaseClient, SupabaseConfig};
	use std::sync::mpsc;
	use std::time::Duration;

	/// Returns (url, anon_key) from env vars, or panics with a clear message.
	fn env_config() -> (String, String) {
		let url = std::env::var("SUPABASE_URL")
			.expect("SUPABASE_URL env var required for integration tests");
		let anon_key = std::env::var("SUPABASE_ANON_KEY")
			.expect("SUPABASE_ANON_KEY env var required for integration tests");
		(url, anon_key)
	}

	#[test]
	#[ignore]
	fn config_builds_valid_auth_url() {
		let (url, anon_key) = env_config();
		let config = SupabaseConfig::new(&url, &anon_key);
		let auth_url = config.auth_url("token?grant_type=password");
		assert!(auth_url.starts_with(&url.trim_end_matches('/')));
		assert!(auth_url.contains("/auth/v1/"));
	}

	#[test]
	#[ignore]
	fn config_builds_valid_functions_url() {
		let (url, anon_key) = env_config();
		let config = SupabaseConfig::new(&url, &anon_key);
		let func_url = config.functions_url("test-function");
		assert!(func_url.starts_with(&url.trim_end_matches('/')));
		assert!(func_url.contains("/functions/v1/test-function"));
	}

	#[test]
	#[ignore]
	fn config_builds_valid_realtime_url() {
		let (url, anon_key) = env_config();
		let config = SupabaseConfig::new(&url, &anon_key);
		let rt_url = config.realtime_url();
		assert!(rt_url.starts_with("wss://"));
		assert!(rt_url.contains(&anon_key));
		assert!(rt_url.contains("/realtime/v1/websocket"));
	}

	#[test]
	#[ignore]
	fn client_sign_in_bad_credentials_returns_error() {
		let (url, anon_key) = env_config();
		let client = SupabaseClient::new(&url, &anon_key);
		let (tx, rx) = mpsc::channel();

		client.sign_in_with_password(
			"nonexistent@invalid-test-account.example",
			"wrong-password-123",
			move |result| {
				tx.send(result).unwrap();
			},
		);

		let result = rx
			.recv_timeout(Duration::from_secs(15))
			.expect("sign_in timed out after 15s");

		// Should fail with an auth/HTTP error — bad credentials
		assert!(result.is_err(), "Expected error for invalid credentials");
	}

	#[test]
	#[ignore]
	fn client_invoke_nonexistent_function_returns_error() {
		let (url, anon_key) = env_config();
		let client = SupabaseClient::new(&url, &anon_key);
		let (tx, rx) = mpsc::channel();

		client.invoke_function(
			"nonexistent-function-that-does-not-exist",
			&serde_json::json!({}),
			move |result| {
				tx.send(result).unwrap();
			},
		);

		let result = rx
			.recv_timeout(Duration::from_secs(15))
			.expect("invoke_function timed out after 15s");

		// Should fail — function doesn't exist
		assert!(
			result.is_err(),
			"Expected error for nonexistent function"
		);
	}

	#[test]
	#[ignore]
	fn client_state_is_correct_after_failed_sign_in() {
		let (url, anon_key) = env_config();
		let client = SupabaseClient::new(&url, &anon_key);
		let (tx, rx) = mpsc::channel();

		assert!(!client.is_loading());
		assert!(client.last_error().is_none());

		client.sign_in_with_password(
			"bad@example.com",
			"wrong",
			move |result| {
				tx.send(result).unwrap();
			},
		);

		let _result = rx
			.recv_timeout(Duration::from_secs(15))
			.expect("sign_in timed out after 15s");

		// After callback completes, loading should be false and error should be set
		assert!(!client.is_loading());
		assert!(client.last_error().is_some());
		assert!(!client.is_authenticated());
		assert!(client.get_session().is_none());
	}
}

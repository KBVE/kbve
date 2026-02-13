#[derive(serde::Deserialize, serde::Serialize, Debug, Clone)]
pub struct SupabaseConfig {
	pub url: String,
	pub anon_key: String,
}

impl SupabaseConfig {
	pub fn new(url: impl Into<String>, anon_key: impl Into<String>) -> Self {
		Self {
			url: url.into(),
			anon_key: anon_key.into(),
		}
	}

	pub fn auth_url(&self, path: &str) -> String {
		format!("{}/auth/v1/{}", self.url.trim_end_matches('/'), path)
	}

	pub fn functions_url(&self, function_name: &str) -> String {
		format!(
			"{}/functions/v1/{}",
			self.url.trim_end_matches('/'),
			function_name
		)
	}

	pub fn realtime_url(&self) -> String {
		let host = self
			.url
			.trim_start_matches("https://")
			.trim_start_matches("http://");
		format!(
			"wss://{}/realtime/v1/websocket?apikey={}&vsn=1.0.0",
			host, self.anon_key
		)
	}
}

#[cfg(test)]
mod tests {
	use super::*;

	#[test]
	fn auth_url_construction() {
		let config = SupabaseConfig::new("https://supabase.example.com", "test-key");
		assert_eq!(
			config.auth_url("token?grant_type=password"),
			"https://supabase.example.com/auth/v1/token?grant_type=password"
		);
	}

	#[test]
	fn auth_url_trailing_slash() {
		let config = SupabaseConfig::new("https://supabase.example.com/", "test-key");
		assert_eq!(
			config.auth_url("logout"),
			"https://supabase.example.com/auth/v1/logout"
		);
	}

	#[test]
	fn functions_url_construction() {
		let config = SupabaseConfig::new("https://supabase.example.com", "test-key");
		assert_eq!(
			config.functions_url("my-function"),
			"https://supabase.example.com/functions/v1/my-function"
		);
	}

	#[test]
	fn realtime_url_construction() {
		let config = SupabaseConfig::new("https://supabase.example.com", "test-key");
		assert_eq!(
			config.realtime_url(),
			"wss://supabase.example.com/realtime/v1/websocket?apikey=test-key&vsn=1.0.0"
		);
	}

	#[test]
	fn serde_round_trip() {
		let config = SupabaseConfig::new("https://supabase.example.com", "anon-key-123");
		let json = serde_json::to_string(&config).unwrap();
		let restored: SupabaseConfig = serde_json::from_str(&json).unwrap();
		assert_eq!(restored.url, "https://supabase.example.com");
		assert_eq!(restored.anon_key, "anon-key-123");
	}

	#[test]
	fn new_stores_values() {
		let config = SupabaseConfig::new("https://test.com", "key-abc");
		assert_eq!(config.url, "https://test.com");
		assert_eq!(config.anon_key, "key-abc");
	}

	#[test]
	fn auth_url_empty_path() {
		let config = SupabaseConfig::new("https://example.com", "key");
		assert_eq!(config.auth_url(""), "https://example.com/auth/v1/");
	}

	#[test]
	fn auth_url_multiple_trailing_slashes() {
		let config = SupabaseConfig::new("https://example.com///", "key");
		assert_eq!(config.auth_url("token"), "https://example.com/auth/v1/token");
	}

	#[test]
	fn functions_url_trailing_slash() {
		let config = SupabaseConfig::new("https://example.com/", "key");
		assert_eq!(
			config.functions_url("my-func"),
			"https://example.com/functions/v1/my-func"
		);
	}

	#[test]
	fn functions_url_empty_name() {
		let config = SupabaseConfig::new("https://example.com", "key");
		assert_eq!(
			config.functions_url(""),
			"https://example.com/functions/v1/"
		);
	}

	#[test]
	fn functions_url_with_special_chars() {
		let config = SupabaseConfig::new("https://example.com", "key");
		assert_eq!(
			config.functions_url("my-func_v2.beta"),
			"https://example.com/functions/v1/my-func_v2.beta"
		);
	}

	#[test]
	fn realtime_url_http_protocol() {
		let config = SupabaseConfig::new("http://localhost:54321", "local-key");
		assert_eq!(
			config.realtime_url(),
			"wss://localhost:54321/realtime/v1/websocket?apikey=local-key&vsn=1.0.0"
		);
	}

	#[test]
	fn realtime_url_with_port() {
		let config = SupabaseConfig::new("https://supabase.example.com:8443", "key");
		assert_eq!(
			config.realtime_url(),
			"wss://supabase.example.com:8443/realtime/v1/websocket?apikey=key&vsn=1.0.0"
		);
	}

	#[test]
	fn clone_produces_independent_copy() {
		let config = SupabaseConfig::new("https://example.com", "key");
		let cloned = config.clone();
		assert_eq!(config.url, cloned.url);
		assert_eq!(config.anon_key, cloned.anon_key);
	}

	#[test]
	fn serde_ignores_extra_fields() {
		let json = r#"{"url":"https://example.com","anon_key":"key","extra":"ignored"}"#;
		let config: SupabaseConfig = serde_json::from_str(json).unwrap();
		assert_eq!(config.url, "https://example.com");
		assert_eq!(config.anon_key, "key");
	}

	#[test]
	fn serde_missing_field_errors() {
		let json = r#"{"url":"https://example.com"}"#;
		let result = serde_json::from_str::<SupabaseConfig>(json);
		assert!(result.is_err());
	}

	#[test]
	fn debug_format() {
		let config = SupabaseConfig::new("https://example.com", "key");
		let debug = format!("{:?}", config);
		assert!(debug.contains("SupabaseConfig"));
		assert!(debug.contains("https://example.com"));
	}
}

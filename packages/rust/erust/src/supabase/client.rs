use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

use crate::supabase::{SupabaseConfig, SupabaseError, Session, auth, functions};

#[derive(serde::Deserialize, serde::Serialize, Clone)]
pub struct SupabaseClient {
	pub config: SupabaseConfig,

	#[serde(skip)]
	pub session: Arc<Mutex<Option<Session>>>,

	#[serde(skip)]
	pub is_loading: Arc<AtomicBool>,

	#[serde(skip)]
	pub last_error: Arc<Mutex<Option<String>>>,
}

impl SupabaseClient {
	pub fn new(url: impl Into<String>, anon_key: impl Into<String>) -> Self {
		Self {
			config: SupabaseConfig::new(url, anon_key),
			session: Arc::new(Mutex::new(None)),
			is_loading: Arc::new(AtomicBool::new(false)),
			last_error: Arc::new(Mutex::new(None)),
		}
	}

	pub fn from_config(config: SupabaseConfig) -> Self {
		Self {
			config,
			session: Arc::new(Mutex::new(None)),
			is_loading: Arc::new(AtomicBool::new(false)),
			last_error: Arc::new(Mutex::new(None)),
		}
	}

	pub fn get_session(&self) -> Option<Session> {
		self.session
			.lock()
			.expect("session mutex poisoned")
			.clone()
	}

	pub fn access_token(&self) -> Option<String> {
		self.get_session().map(|s| s.access_token)
	}

	pub fn is_authenticated(&self) -> bool {
		self.get_session()
			.map(|s| !s.is_expired())
			.unwrap_or(false)
	}

	pub fn is_loading(&self) -> bool {
		self.is_loading.load(Ordering::Acquire)
	}

	pub fn last_error(&self) -> Option<String> {
		self.last_error
			.lock()
			.expect("last_error mutex poisoned")
			.clone()
	}

	pub fn clear_error(&self) {
		*self.last_error.lock().expect("last_error mutex poisoned") = None;
	}

	pub fn set_session(&self, session: Session) {
		*self.session.lock().expect("session mutex poisoned") = Some(session);
	}

	pub fn clear_session(&self) {
		*self.session.lock().expect("session mutex poisoned") = None;
	}

	pub fn sign_in_with_password<F>(&self, email: &str, password: &str, callback: F)
	where
		F: FnOnce(Result<Session, SupabaseError>) + Send + 'static,
	{
		let session_handle = self.session.clone();
		let loading_flag = self.is_loading.clone();
		let error_handle = self.last_error.clone();

		loading_flag.store(true, Ordering::Release);
		*error_handle.lock().expect("last_error mutex poisoned") = None;

		auth::sign_in_with_password(&self.config, email, password, move |result| {
			match &result {
				Ok(session) => {
					*session_handle.lock().expect("session mutex poisoned") =
						Some(session.clone());
				}
				Err(err) => {
					*error_handle.lock().expect("last_error mutex poisoned") =
						Some(format!("{}", err));
				}
			}
			loading_flag.store(false, Ordering::Release);
			callback(result);
		});
	}

	pub fn sign_out<F>(&self, callback: F)
	where
		F: FnOnce(Result<(), SupabaseError>) + Send + 'static,
	{
		let session_handle = self.session.clone();
		let loading_flag = self.is_loading.clone();
		let error_handle = self.last_error.clone();

		let token = match self.access_token() {
			Some(t) => t,
			None => {
				callback(Err(SupabaseError::ClientError(
					"No active session".to_string(),
				)));
				return;
			}
		};

		loading_flag.store(true, Ordering::Release);

		auth::sign_out(&self.config, &token, move |result| {
			*session_handle.lock().expect("session mutex poisoned") = None;
			if let Err(ref err) = result {
				*error_handle.lock().expect("last_error mutex poisoned") =
					Some(format!("{}", err));
			}
			loading_flag.store(false, Ordering::Release);
			callback(result);
		});
	}

	pub fn refresh_session<F>(&self, callback: F)
	where
		F: FnOnce(Result<Session, SupabaseError>) + Send + 'static,
	{
		let session_handle = self.session.clone();
		let loading_flag = self.is_loading.clone();
		let error_handle = self.last_error.clone();

		let refresh_token = match self.get_session() {
			Some(s) => s.refresh_token,
			None => {
				callback(Err(SupabaseError::ClientError(
					"No session to refresh".to_string(),
				)));
				return;
			}
		};

		loading_flag.store(true, Ordering::Release);

		auth::refresh_session(&self.config, &refresh_token, move |result| {
			match &result {
				Ok(session) => {
					*session_handle.lock().expect("session mutex poisoned") =
						Some(session.clone());
				}
				Err(err) => {
					*error_handle.lock().expect("last_error mutex poisoned") =
						Some(format!("{}", err));
				}
			}
			loading_flag.store(false, Ordering::Release);
			callback(result);
		});
	}

	pub fn invoke_function<F>(
		&self,
		function_name: &str,
		body: &serde_json::Value,
		callback: F,
	)
	where
		F: FnOnce(Result<Vec<u8>, SupabaseError>) + Send + 'static,
	{
		let token = self.access_token();
		functions::invoke(&self.config, function_name, body, token.as_deref(), callback);
	}

	pub fn invoke_function_json<T, F>(
		&self,
		function_name: &str,
		body: &serde_json::Value,
		callback: F,
	)
	where
		T: serde::de::DeserializeOwned + 'static,
		F: FnOnce(Result<T, SupabaseError>) + Send + 'static,
	{
		let token = self.access_token();
		functions::invoke_json::<T, F>(
			&self.config,
			function_name,
			body,
			token.as_deref(),
			callback,
		);
	}
}

#[cfg(test)]
mod tests {
	use super::*;
	use crate::supabase::{Session, SupabaseUser};

	fn make_test_session() -> Session {
		let now = std::time::SystemTime::now()
			.duration_since(std::time::UNIX_EPOCH)
			.unwrap()
			.as_secs();
		Session {
			access_token: "test-token".to_string(),
			refresh_token: "test-refresh".to_string(),
			token_type: "bearer".to_string(),
			expires_in: 3600,
			expires_at: Some(now + 3600),
			user: SupabaseUser::default(),
		}
	}

	#[test]
	fn new_creates_empty_client() {
		let client = SupabaseClient::new("https://example.com", "key123");
		assert_eq!(client.config.url, "https://example.com");
		assert_eq!(client.config.anon_key, "key123");
		assert!(client.get_session().is_none());
		assert!(!client.is_authenticated());
		assert!(!client.is_loading());
		assert!(client.last_error().is_none());
	}

	#[test]
	fn set_and_get_session() {
		let client = SupabaseClient::new("https://example.com", "key123");
		assert!(client.get_session().is_none());

		let session = make_test_session();
		client.set_session(session.clone());

		let retrieved = client.get_session().unwrap();
		assert_eq!(retrieved.access_token, "test-token");
	}

	#[test]
	fn access_token_returns_none_when_no_session() {
		let client = SupabaseClient::new("https://example.com", "key123");
		assert!(client.access_token().is_none());
	}

	#[test]
	fn access_token_returns_token_when_session_exists() {
		let client = SupabaseClient::new("https://example.com", "key123");
		client.set_session(make_test_session());
		assert_eq!(client.access_token(), Some("test-token".to_string()));
	}

	#[test]
	fn is_authenticated_with_valid_session() {
		let client = SupabaseClient::new("https://example.com", "key123");
		client.set_session(make_test_session());
		assert!(client.is_authenticated());
	}

	#[test]
	fn is_authenticated_with_expired_session() {
		let client = SupabaseClient::new("https://example.com", "key123");
		let mut session = make_test_session();
		session.expires_at = Some(0);
		client.set_session(session);
		assert!(!client.is_authenticated());
	}

	#[test]
	fn clear_session_removes_it() {
		let client = SupabaseClient::new("https://example.com", "key123");
		client.set_session(make_test_session());
		assert!(client.get_session().is_some());
		client.clear_session();
		assert!(client.get_session().is_none());
	}

	#[test]
	fn clear_error_removes_it() {
		let client = SupabaseClient::new("https://example.com", "key123");
		*client.last_error.lock().unwrap() = Some("test error".to_string());
		assert!(client.last_error().is_some());
		client.clear_error();
		assert!(client.last_error().is_none());
	}

	#[test]
	fn serde_preserves_config_skips_state() {
		let client = SupabaseClient::new("https://example.com", "key123");
		client.set_session(make_test_session());

		let json = serde_json::to_string(&client).unwrap();
		let restored: SupabaseClient = serde_json::from_str(&json).unwrap();

		assert_eq!(restored.config.url, "https://example.com");
		assert_eq!(restored.config.anon_key, "key123");
		// Session is skipped during serialization
		assert!(restored.get_session().is_none());
		assert!(!restored.is_loading());
	}

	#[test]
	fn from_config_works() {
		let config = SupabaseConfig::new("https://test.com", "my-key");
		let client = SupabaseClient::from_config(config);
		assert_eq!(client.config.url, "https://test.com");
		assert_eq!(client.config.anon_key, "my-key");
	}

	#[test]
	fn sign_out_without_session_returns_error() {
		let client = SupabaseClient::new("https://example.com", "key123");
		let called = Arc::new(AtomicBool::new(false));
		let called_clone = called.clone();
		client.sign_out(move |result| {
			called_clone.store(true, Ordering::Release);
			assert!(result.is_err());
			match result.unwrap_err() {
				SupabaseError::ClientError(msg) => assert_eq!(msg, "No active session"),
				other => panic!("Expected ClientError, got: {:?}", other),
			}
		});
		assert!(called.load(Ordering::Acquire));
	}

	#[test]
	fn refresh_without_session_returns_error() {
		let client = SupabaseClient::new("https://example.com", "key123");
		let called = Arc::new(AtomicBool::new(false));
		let called_clone = called.clone();
		client.refresh_session(move |result| {
			called_clone.store(true, Ordering::Release);
			assert!(result.is_err());
			match result.unwrap_err() {
				SupabaseError::ClientError(msg) => assert_eq!(msg, "No session to refresh"),
				other => panic!("Expected ClientError, got: {:?}", other),
			}
		});
		assert!(called.load(Ordering::Acquire));
	}

	#[test]
	fn clone_shares_session_arc() {
		let client = SupabaseClient::new("https://example.com", "key123");
		let cloned = client.clone();

		// Set session on original
		client.set_session(make_test_session());

		// Clone should see the same session (shared Arc)
		let session = cloned.get_session().unwrap();
		assert_eq!(session.access_token, "test-token");
	}

	#[test]
	fn clone_shares_loading_arc() {
		let client = SupabaseClient::new("https://example.com", "key123");
		let cloned = client.clone();

		client.is_loading.store(true, Ordering::Release);
		assert!(cloned.is_loading());

		client.is_loading.store(false, Ordering::Release);
		assert!(!cloned.is_loading());
	}

	#[test]
	fn clone_shares_error_arc() {
		let client = SupabaseClient::new("https://example.com", "key123");
		let cloned = client.clone();

		*client.last_error.lock().unwrap() = Some("shared error".to_string());
		assert_eq!(cloned.last_error(), Some("shared error".to_string()));

		client.clear_error();
		assert!(cloned.last_error().is_none());
	}

	#[test]
	fn set_session_multiple_times() {
		let client = SupabaseClient::new("https://example.com", "key123");

		let mut session1 = make_test_session();
		session1.access_token = "token-1".to_string();
		client.set_session(session1);
		assert_eq!(client.access_token(), Some("token-1".to_string()));

		let mut session2 = make_test_session();
		session2.access_token = "token-2".to_string();
		client.set_session(session2);
		assert_eq!(client.access_token(), Some("token-2".to_string()));
	}

	#[test]
	fn clear_session_then_set_again() {
		let client = SupabaseClient::new("https://example.com", "key123");
		client.set_session(make_test_session());
		assert!(client.is_authenticated());

		client.clear_session();
		assert!(!client.is_authenticated());
		assert!(client.access_token().is_none());

		client.set_session(make_test_session());
		assert!(client.is_authenticated());
		assert_eq!(client.access_token(), Some("test-token".to_string()));
	}

	#[test]
	fn clear_error_on_already_none() {
		let client = SupabaseClient::new("https://example.com", "key123");
		assert!(client.last_error().is_none());
		client.clear_error(); // Should not panic
		assert!(client.last_error().is_none());
	}

	#[test]
	fn clear_session_on_already_none() {
		let client = SupabaseClient::new("https://example.com", "key123");
		assert!(client.get_session().is_none());
		client.clear_session(); // Should not panic
		assert!(client.get_session().is_none());
	}

	#[test]
	fn is_authenticated_returns_false_no_session() {
		let client = SupabaseClient::new("https://example.com", "key123");
		assert!(!client.is_authenticated());
	}

	#[test]
	fn serde_preserves_config_only() {
		let client = SupabaseClient::new("https://test.com", "my-anon-key");
		client.set_session(make_test_session());
		client.is_loading.store(true, Ordering::Release);
		*client.last_error.lock().unwrap() = Some("some error".to_string());

		let json = serde_json::to_string(&client).unwrap();
		let restored: SupabaseClient = serde_json::from_str(&json).unwrap();

		// Config is preserved
		assert_eq!(restored.config.url, "https://test.com");
		assert_eq!(restored.config.anon_key, "my-anon-key");
		// All Arc state is reset to defaults
		assert!(restored.get_session().is_none());
		assert!(!restored.is_loading());
		assert!(restored.last_error().is_none());
	}

	#[test]
	fn serde_json_structure() {
		let client = SupabaseClient::new("https://example.com", "key");
		let json = serde_json::to_string(&client).unwrap();
		let value: serde_json::Value = serde_json::from_str(&json).unwrap();

		// Only config fields should appear (skipped fields omitted)
		assert!(value.get("config").is_some());
		assert!(value.get("session").is_none());
		assert!(value.get("is_loading").is_none());
		assert!(value.get("last_error").is_none());
	}

	#[test]
	fn from_config_has_empty_state() {
		let config = SupabaseConfig::new("https://test.com", "key");
		let client = SupabaseClient::from_config(config);
		assert!(client.get_session().is_none());
		assert!(!client.is_loading());
		assert!(client.last_error().is_none());
		assert!(!client.is_authenticated());
		assert!(client.access_token().is_none());
	}

	#[test]
	fn sign_out_no_session_does_not_set_loading() {
		let client = SupabaseClient::new("https://example.com", "key123");
		assert!(!client.is_loading());

		client.sign_out(|_result| {});

		// sign_out returns early if no token, so loading never gets set
		assert!(!client.is_loading());
	}

	#[test]
	fn refresh_no_session_does_not_set_loading() {
		let client = SupabaseClient::new("https://example.com", "key123");
		assert!(!client.is_loading());

		client.refresh_session(|_result| {});

		// refresh returns early if no session, so loading never gets set
		assert!(!client.is_loading());
	}

	#[test]
	fn thread_safety_session_from_multiple_threads() {
		let client = SupabaseClient::new("https://example.com", "key123");
		let client_clone = client.clone();

		let handle = std::thread::spawn(move || {
			client_clone.set_session(make_test_session());
			client_clone.get_session()
		});

		let result = handle.join().unwrap();
		assert!(result.is_some());
		// Main thread should see the session set by the spawned thread
		assert_eq!(client.access_token(), Some("test-token".to_string()));
	}

	#[test]
	fn thread_safety_error_from_multiple_threads() {
		let client = SupabaseClient::new("https://example.com", "key123");
		let client_clone = client.clone();

		let handle = std::thread::spawn(move || {
			*client_clone.last_error.lock().unwrap() = Some("thread error".to_string());
		});

		handle.join().unwrap();
		assert_eq!(client.last_error(), Some("thread error".to_string()));
	}

	#[test]
	fn thread_safety_loading_flag() {
		let client = SupabaseClient::new("https://example.com", "key123");
		let client_clone = client.clone();

		let handle = std::thread::spawn(move || {
			client_clone.is_loading.store(true, Ordering::Release);
		});

		handle.join().unwrap();
		assert!(client.is_loading());
	}

	#[test]
	fn access_token_after_expired_session() {
		let client = SupabaseClient::new("https://example.com", "key123");
		let mut session = make_test_session();
		session.expires_at = Some(0); // expired
		client.set_session(session);

		// access_token still returns the token even if expired
		assert_eq!(client.access_token(), Some("test-token".to_string()));
		// but is_authenticated returns false
		assert!(!client.is_authenticated());
	}

	#[test]
	fn new_with_various_url_formats() {
		let cases = [
			("https://example.com", "key"),
			("https://example.com/", "key"),
			("http://localhost:54321", "local-key"),
			("https://project-ref.supabase.co", "anon-key"),
		];
		for (url, key) in cases {
			let client = SupabaseClient::new(url, key);
			assert_eq!(client.config.url, url);
			assert_eq!(client.config.anon_key, key);
			assert!(client.get_session().is_none());
		}
	}
}

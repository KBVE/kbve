#[derive(serde::Deserialize, serde::Serialize, Debug, Clone, Default)]
pub struct SupabaseUser {
	pub id: String,
	pub email: Option<String>,
	#[serde(default)]
	pub role: String,
	pub aud: Option<String>,
	#[serde(default)]
	pub user_metadata: serde_json::Value,
	#[serde(default)]
	pub app_metadata: serde_json::Value,
	pub created_at: Option<String>,
	pub updated_at: Option<String>,
}

#[derive(serde::Deserialize, serde::Serialize, Debug, Clone)]
pub struct Session {
	pub access_token: String,
	pub refresh_token: String,
	pub token_type: String,
	pub expires_in: u64,
	pub expires_at: Option<u64>,
	pub user: SupabaseUser,
}

impl Session {
	pub fn is_expired(&self) -> bool {
		if let Some(expires_at) = self.expires_at {
			let now = now_unix_secs();
			now + 60 >= expires_at
		} else {
			false
		}
	}
}

#[derive(serde::Deserialize, serde::Serialize, Debug, Clone)]
pub struct AuthResponse {
	pub access_token: String,
	pub refresh_token: String,
	pub token_type: String,
	pub expires_in: u64,
	pub user: SupabaseUser,
}

impl AuthResponse {
	pub fn into_session(self) -> Session {
		let now = now_unix_secs();
		Session {
			access_token: self.access_token,
			refresh_token: self.refresh_token,
			token_type: self.token_type,
			expires_in: self.expires_in,
			expires_at: Some(now + self.expires_in),
			user: self.user,
		}
	}
}

fn now_unix_secs() -> u64 {
	std::time::SystemTime::now()
		.duration_since(std::time::UNIX_EPOCH)
		.map(|d| d.as_secs())
		.unwrap_or(0)
}

#[cfg(test)]
mod tests {
	use super::*;

	fn make_session(expires_at: Option<u64>) -> Session {
		Session {
			access_token: "token123".to_string(),
			refresh_token: "refresh456".to_string(),
			token_type: "bearer".to_string(),
			expires_in: 3600,
			expires_at,
			user: SupabaseUser::default(),
		}
	}

	#[test]
	fn user_default_values() {
		let user = SupabaseUser::default();
		assert!(user.id.is_empty());
		assert!(user.email.is_none());
		assert!(user.role.is_empty());
	}

	#[test]
	fn session_serde_round_trip() {
		let session = make_session(Some(9999999999));
		let json = serde_json::to_string(&session).unwrap();
		let restored: Session = serde_json::from_str(&json).unwrap();
		assert_eq!(restored.access_token, "token123");
		assert_eq!(restored.refresh_token, "refresh456");
		assert_eq!(restored.expires_at, Some(9999999999));
	}

	#[test]
	fn is_expired_returns_false_for_future() {
		let session = make_session(Some(now_unix_secs() + 3600));
		assert!(!session.is_expired());
	}

	#[test]
	fn is_expired_returns_true_for_past() {
		let session = make_session(Some(now_unix_secs() - 100));
		assert!(session.is_expired());
	}

	#[test]
	fn is_expired_returns_true_within_buffer() {
		let session = make_session(Some(now_unix_secs() + 30));
		assert!(session.is_expired());
	}

	#[test]
	fn is_expired_returns_false_when_no_expires_at() {
		let session = make_session(None);
		assert!(!session.is_expired());
	}

	#[test]
	fn auth_response_into_session() {
		let auth = AuthResponse {
			access_token: "acc".to_string(),
			refresh_token: "ref".to_string(),
			token_type: "bearer".to_string(),
			expires_in: 3600,
			user: SupabaseUser::default(),
		};
		let before = now_unix_secs();
		let session = auth.into_session();
		let after = now_unix_secs();

		assert_eq!(session.access_token, "acc");
		assert_eq!(session.refresh_token, "ref");
		let expires_at = session.expires_at.unwrap();
		assert!(expires_at >= before + 3600);
		assert!(expires_at <= after + 3600);
	}

	#[test]
	fn user_serde_with_metadata() {
		let json = r#"{
			"id": "abc-123",
			"email": "test@example.com",
			"role": "authenticated",
			"aud": "authenticated",
			"user_metadata": {"name": "Test"},
			"app_metadata": {},
			"created_at": "2024-01-01T00:00:00Z",
			"updated_at": null
		}"#;
		let user: SupabaseUser = serde_json::from_str(json).unwrap();
		assert_eq!(user.id, "abc-123");
		assert_eq!(user.email, Some("test@example.com".to_string()));
		assert_eq!(user.user_metadata["name"], "Test");
	}

	#[test]
	fn user_serde_minimal_json() {
		// Only required field is id; all others have defaults or are optional
		let json = r#"{"id": "min-id"}"#;
		let user: SupabaseUser = serde_json::from_str(json).unwrap();
		assert_eq!(user.id, "min-id");
		assert!(user.email.is_none());
		assert!(user.role.is_empty());
		assert!(user.aud.is_none());
		assert!(user.created_at.is_none());
		assert!(user.updated_at.is_none());
	}

	#[test]
	fn user_serde_round_trip() {
		let user = SupabaseUser {
			id: "test-id".to_string(),
			email: Some("a@b.com".to_string()),
			role: "authenticated".to_string(),
			aud: Some("authenticated".to_string()),
			user_metadata: serde_json::json!({"key": "value"}),
			app_metadata: serde_json::json!({"provider": "email"}),
			created_at: Some("2024-01-01T00:00:00Z".to_string()),
			updated_at: Some("2024-06-01T00:00:00Z".to_string()),
		};
		let json = serde_json::to_string(&user).unwrap();
		let restored: SupabaseUser = serde_json::from_str(&json).unwrap();
		assert_eq!(restored.id, "test-id");
		assert_eq!(restored.email, Some("a@b.com".to_string()));
		assert_eq!(restored.user_metadata["key"], "value");
		assert_eq!(restored.app_metadata["provider"], "email");
	}

	#[test]
	fn user_serde_ignores_extra_fields() {
		let json = r#"{"id": "x", "email": null, "unknown_field": 42}"#;
		let user: SupabaseUser = serde_json::from_str(json).unwrap();
		assert_eq!(user.id, "x");
		assert!(user.email.is_none());
	}

	#[test]
	fn user_default_metadata_is_null() {
		let user = SupabaseUser::default();
		assert!(user.user_metadata.is_null());
		assert!(user.app_metadata.is_null());
	}

	#[test]
	fn user_debug_format() {
		let user = SupabaseUser::default();
		let debug = format!("{:?}", user);
		assert!(debug.contains("SupabaseUser"));
	}

	#[test]
	fn user_clone_is_independent() {
		let user = SupabaseUser {
			id: "orig".to_string(),
			email: Some("orig@test.com".to_string()),
			..Default::default()
		};
		let cloned = user.clone();
		assert_eq!(user.id, cloned.id);
		assert_eq!(user.email, cloned.email);
	}

	#[test]
	fn session_clone_preserves_all_fields() {
		let session = make_session(Some(12345));
		let cloned = session.clone();
		assert_eq!(cloned.access_token, "token123");
		assert_eq!(cloned.refresh_token, "refresh456");
		assert_eq!(cloned.token_type, "bearer");
		assert_eq!(cloned.expires_in, 3600);
		assert_eq!(cloned.expires_at, Some(12345));
	}

	#[test]
	fn session_serde_with_none_expires_at() {
		let session = make_session(None);
		let json = serde_json::to_string(&session).unwrap();
		let restored: Session = serde_json::from_str(&json).unwrap();
		assert!(restored.expires_at.is_none());
		assert_eq!(restored.access_token, "token123");
	}

	#[test]
	fn session_serde_missing_optional_field() {
		// expires_at missing entirely should deserialize as None
		let json = r#"{
			"access_token": "t",
			"refresh_token": "r",
			"token_type": "bearer",
			"expires_in": 100,
			"user": {"id": "u"}
		}"#;
		let session: Session = serde_json::from_str(json).unwrap();
		assert!(session.expires_at.is_none());
		assert_eq!(session.access_token, "t");
	}

	#[test]
	fn session_serde_missing_required_field() {
		// access_token missing should error
		let json = r#"{
			"refresh_token": "r",
			"token_type": "bearer",
			"expires_in": 100,
			"user": {"id": "u"}
		}"#;
		assert!(serde_json::from_str::<Session>(json).is_err());
	}

	#[test]
	fn is_expired_at_exact_boundary() {
		// At exactly now + 60, the condition is now + 60 >= expires_at, which is true
		let session = make_session(Some(now_unix_secs() + 60));
		assert!(session.is_expired());
	}

	#[test]
	fn is_expired_just_outside_buffer() {
		// At now + 61, the condition is now + 60 >= expires_at -> now + 60 >= now + 61 -> false
		let session = make_session(Some(now_unix_secs() + 61));
		assert!(!session.is_expired());
	}

	#[test]
	fn is_expired_with_zero_expires_at() {
		let session = make_session(Some(0));
		assert!(session.is_expired());
	}

	#[test]
	fn is_expired_with_max_u64() {
		let session = make_session(Some(u64::MAX));
		assert!(!session.is_expired());
	}

	#[test]
	fn auth_response_serde_round_trip() {
		let auth = AuthResponse {
			access_token: "acc".to_string(),
			refresh_token: "ref".to_string(),
			token_type: "bearer".to_string(),
			expires_in: 7200,
			user: SupabaseUser::default(),
		};
		let json = serde_json::to_string(&auth).unwrap();
		let restored: AuthResponse = serde_json::from_str(&json).unwrap();
		assert_eq!(restored.access_token, "acc");
		assert_eq!(restored.expires_in, 7200);
	}

	#[test]
	fn auth_response_into_session_zero_expires_in() {
		let auth = AuthResponse {
			access_token: "acc".to_string(),
			refresh_token: "ref".to_string(),
			token_type: "bearer".to_string(),
			expires_in: 0,
			user: SupabaseUser::default(),
		};
		let before = now_unix_secs();
		let session = auth.into_session();
		let after = now_unix_secs();
		let expires_at = session.expires_at.unwrap();
		assert!(expires_at >= before);
		assert!(expires_at <= after);
		// With 0 expires_in, session should be immediately within the 60s buffer
		assert!(session.is_expired());
	}

	#[test]
	fn auth_response_into_session_preserves_user() {
		let auth = AuthResponse {
			access_token: "a".to_string(),
			refresh_token: "r".to_string(),
			token_type: "bearer".to_string(),
			expires_in: 3600,
			user: SupabaseUser {
				id: "user-123".to_string(),
				email: Some("test@test.com".to_string()),
				role: "authenticated".to_string(),
				..Default::default()
			},
		};
		let session = auth.into_session();
		assert_eq!(session.user.id, "user-123");
		assert_eq!(session.user.email, Some("test@test.com".to_string()));
		assert_eq!(session.user.role, "authenticated");
	}

	#[test]
	fn auth_response_into_session_large_expires_in() {
		let auth = AuthResponse {
			access_token: "a".to_string(),
			refresh_token: "r".to_string(),
			token_type: "bearer".to_string(),
			expires_in: 86400 * 365, // 1 year
			user: SupabaseUser::default(),
		};
		let session = auth.into_session();
		assert!(!session.is_expired());
		let expires_at = session.expires_at.unwrap();
		assert!(expires_at > now_unix_secs() + 86400 * 364);
	}

	#[test]
	fn session_debug_format() {
		let session = make_session(Some(999));
		let debug = format!("{:?}", session);
		assert!(debug.contains("Session"));
		assert!(debug.contains("token123"));
	}

	#[test]
	fn auth_response_debug_format() {
		let auth = AuthResponse {
			access_token: "a".to_string(),
			refresh_token: "r".to_string(),
			token_type: "bearer".to_string(),
			expires_in: 100,
			user: SupabaseUser::default(),
		};
		let debug = format!("{:?}", auth);
		assert!(debug.contains("AuthResponse"));
	}

	#[test]
	fn user_with_nested_metadata() {
		let json = r#"{
			"id": "deep",
			"user_metadata": {"profile": {"avatar": "url", "settings": {"theme": "dark"}}},
			"app_metadata": {"providers": ["email", "google"]}
		}"#;
		let user: SupabaseUser = serde_json::from_str(json).unwrap();
		assert_eq!(user.user_metadata["profile"]["settings"]["theme"], "dark");
		assert_eq!(user.app_metadata["providers"][0], "email");
		assert_eq!(user.app_metadata["providers"][1], "google");
	}

	#[test]
	fn now_unix_secs_is_reasonable() {
		let secs = now_unix_secs();
		// Should be after 2024-01-01 (1704067200) and before 2100-01-01 (4102444800)
		assert!(secs > 1_704_067_200);
		assert!(secs < 4_102_444_800);
	}
}

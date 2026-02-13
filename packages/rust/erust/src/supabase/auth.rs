use ehttp::Request;
use crate::supabase::{SupabaseConfig, SupabaseError, Session, AuthResponse};

#[derive(serde::Serialize)]
struct SignInBody {
	email: String,
	password: String,
}

pub fn sign_in_with_password<F>(
	config: &SupabaseConfig,
	email: &str,
	password: &str,
	callback: F,
)
where
	F: FnOnce(Result<Session, SupabaseError>) + Send + 'static,
{
	let url = config.auth_url("token?grant_type=password");
	let body = SignInBody {
		email: email.to_string(),
		password: password.to_string(),
	};
	let body_bytes = match serde_json::to_vec(&body) {
		Ok(b) => b,
		Err(e) => {
			callback(Err(SupabaseError::from(e)));
			return;
		}
	};

	let mut request = Request::post(&url, body_bytes);
	request.headers = ehttp::Headers::new(&[
		("Content-Type", "application/json"),
		("apikey", &config.anon_key),
	]);

	ehttp::fetch(request, move |result| {
		let response = match result {
			Ok(resp) => resp,
			Err(err) => {
				callback(Err(SupabaseError::NetworkError(err)));
				return;
			}
		};
		callback(parse_auth_response(response));
	});
}

pub fn sign_out<F>(config: &SupabaseConfig, access_token: &str, callback: F)
where
	F: FnOnce(Result<(), SupabaseError>) + Send + 'static,
{
	let url = config.auth_url("logout");
	let auth_header = format!("Bearer {}", access_token);
	let mut request = Request::post(&url, vec![]);
	request.headers = ehttp::Headers::new(&[
		("Content-Type", "application/json"),
		("apikey", &config.anon_key),
		("Authorization", &auth_header),
	]);

	ehttp::fetch(request, move |result| match result {
		Ok(response) => {
			if response.ok {
				callback(Ok(()));
			} else {
				callback(Err(SupabaseError::HttpError {
					status: response.status,
					message: String::from_utf8_lossy(&response.bytes).to_string(),
				}));
			}
		}
		Err(err) => callback(Err(SupabaseError::NetworkError(err))),
	});
}

pub fn refresh_session<F>(config: &SupabaseConfig, refresh_token: &str, callback: F)
where
	F: FnOnce(Result<Session, SupabaseError>) + Send + 'static,
{
	let url = config.auth_url("token?grant_type=refresh_token");
	let body = serde_json::json!({ "refresh_token": refresh_token });
	let body_bytes = match serde_json::to_vec(&body) {
		Ok(b) => b,
		Err(e) => {
			callback(Err(SupabaseError::from(e)));
			return;
		}
	};

	let mut request = Request::post(&url, body_bytes);
	request.headers = ehttp::Headers::new(&[
		("Content-Type", "application/json"),
		("apikey", &config.anon_key),
	]);

	ehttp::fetch(request, move |result| {
		let response = match result {
			Ok(resp) => resp,
			Err(err) => {
				callback(Err(SupabaseError::NetworkError(err)));
				return;
			}
		};
		callback(parse_auth_response(response));
	});
}

fn parse_auth_response(response: ehttp::Response) -> Result<Session, SupabaseError> {
	if !response.ok {
		let message = String::from_utf8_lossy(&response.bytes).to_string();
		return Err(SupabaseError::HttpError {
			status: response.status,
			message,
		});
	}
	let auth_response: AuthResponse = serde_json::from_slice(&response.bytes)?;
	Ok(auth_response.into_session())
}

#[cfg(test)]
mod tests {
	use super::*;

	fn mock_auth_json() -> String {
		serde_json::json!({
			"access_token": "eyJhbGciOiJIUzI1NiJ9.test",
			"refresh_token": "refresh-token-value",
			"token_type": "bearer",
			"expires_in": 3600,
			"user": {
				"id": "user-uuid-123",
				"email": "test@example.com",
				"role": "authenticated",
				"aud": "authenticated",
				"user_metadata": {},
				"app_metadata": {},
				"created_at": "2024-01-01T00:00:00Z",
				"updated_at": "2024-01-01T00:00:00Z"
			}
		})
		.to_string()
	}

	#[test]
	fn parse_auth_response_success() {
		let response = ehttp::Response {
			url: "https://example.com/auth/v1/token".to_string(),
			ok: true,
			status: 200,
			status_text: "OK".to_string(),
			bytes: mock_auth_json().into_bytes(),
			headers: ehttp::Headers::new(&[]),
		};

		let result = parse_auth_response(response);
		assert!(result.is_ok());
		let session = result.unwrap();
		assert_eq!(session.access_token, "eyJhbGciOiJIUzI1NiJ9.test");
		assert_eq!(session.refresh_token, "refresh-token-value");
		assert_eq!(session.token_type, "bearer");
		assert_eq!(session.expires_in, 3600);
		assert!(session.expires_at.is_some());
		assert_eq!(session.user.id, "user-uuid-123");
		assert_eq!(session.user.email, Some("test@example.com".to_string()));
	}

	#[test]
	fn parse_auth_response_unauthorized() {
		let response = ehttp::Response {
			url: "https://example.com/auth/v1/token".to_string(),
			ok: false,
			status: 401,
			status_text: "Unauthorized".to_string(),
			bytes: b"Invalid login credentials".to_vec(),
			headers: ehttp::Headers::new(&[]),
		};

		let result = parse_auth_response(response);
		assert!(result.is_err());
		match result.unwrap_err() {
			SupabaseError::HttpError { status, message } => {
				assert_eq!(status, 401);
				assert_eq!(message, "Invalid login credentials");
			}
			other => panic!("Expected HttpError, got: {:?}", other),
		}
	}

	#[test]
	fn parse_auth_response_invalid_json() {
		let response = ehttp::Response {
			url: "https://example.com/auth/v1/token".to_string(),
			ok: true,
			status: 200,
			status_text: "OK".to_string(),
			bytes: b"not json at all".to_vec(),
			headers: ehttp::Headers::new(&[]),
		};

		let result = parse_auth_response(response);
		assert!(result.is_err());
		assert!(matches!(result.unwrap_err(), SupabaseError::JsonError(_)));
	}

	#[test]
	fn parse_auth_response_server_error() {
		let response = ehttp::Response {
			url: "https://example.com/auth/v1/token".to_string(),
			ok: false,
			status: 500,
			status_text: "Internal Server Error".to_string(),
			bytes: b"Internal server error".to_vec(),
			headers: ehttp::Headers::new(&[]),
		};

		let result = parse_auth_response(response);
		assert!(result.is_err());
		match result.unwrap_err() {
			SupabaseError::HttpError { status, .. } => assert_eq!(status, 500),
			other => panic!("Expected HttpError, got: {:?}", other),
		}
	}

	#[test]
	fn sign_in_body_serialization() {
		let body = SignInBody {
			email: "user@example.com".to_string(),
			password: "secret123".to_string(),
		};
		let json = serde_json::to_string(&body).unwrap();
		assert!(json.contains("\"email\":\"user@example.com\""));
		assert!(json.contains("\"password\":\"secret123\""));
	}

	#[test]
	fn parse_auth_response_missing_user_field() {
		let json = serde_json::json!({
			"access_token": "tok",
			"refresh_token": "ref",
			"token_type": "bearer",
			"expires_in": 3600
		})
		.to_string();
		let response = ehttp::Response {
			url: "https://example.com/auth/v1/token".to_string(),
			ok: true,
			status: 200,
			status_text: "OK".to_string(),
			bytes: json.into_bytes(),
			headers: ehttp::Headers::new(&[]),
		};
		let result = parse_auth_response(response);
		assert!(result.is_err());
		assert!(matches!(result.unwrap_err(), SupabaseError::JsonError(_)));
	}

	#[test]
	fn parse_auth_response_missing_access_token() {
		let json = serde_json::json!({
			"refresh_token": "ref",
			"token_type": "bearer",
			"expires_in": 3600,
			"user": {"id": "u"}
		})
		.to_string();
		let response = ehttp::Response {
			url: "https://example.com/auth/v1/token".to_string(),
			ok: true,
			status: 200,
			status_text: "OK".to_string(),
			bytes: json.into_bytes(),
			headers: ehttp::Headers::new(&[]),
		};
		let result = parse_auth_response(response);
		assert!(result.is_err());
		assert!(matches!(result.unwrap_err(), SupabaseError::JsonError(_)));
	}

	#[test]
	fn parse_auth_response_extra_fields_ignored() {
		let json = serde_json::json!({
			"access_token": "tok",
			"refresh_token": "ref",
			"token_type": "bearer",
			"expires_in": 3600,
			"user": {"id": "u"},
			"extra_field": "ignored",
			"another": 42
		})
		.to_string();
		let response = ehttp::Response {
			url: "https://example.com/auth/v1/token".to_string(),
			ok: true,
			status: 200,
			status_text: "OK".to_string(),
			bytes: json.into_bytes(),
			headers: ehttp::Headers::new(&[]),
		};
		let result = parse_auth_response(response);
		assert!(result.is_ok());
		let session = result.unwrap();
		assert_eq!(session.access_token, "tok");
	}

	#[test]
	fn parse_auth_response_empty_body_ok() {
		let response = ehttp::Response {
			url: "https://example.com/auth/v1/token".to_string(),
			ok: true,
			status: 200,
			status_text: "OK".to_string(),
			bytes: vec![],
			headers: ehttp::Headers::new(&[]),
		};
		let result = parse_auth_response(response);
		assert!(result.is_err());
		assert!(matches!(result.unwrap_err(), SupabaseError::JsonError(_)));
	}

	#[test]
	fn parse_auth_response_empty_body_error() {
		let response = ehttp::Response {
			url: "https://example.com/auth/v1/token".to_string(),
			ok: false,
			status: 400,
			status_text: "Bad Request".to_string(),
			bytes: vec![],
			headers: ehttp::Headers::new(&[]),
		};
		let result = parse_auth_response(response);
		assert!(result.is_err());
		match result.unwrap_err() {
			SupabaseError::HttpError { status, message } => {
				assert_eq!(status, 400);
				assert_eq!(message, "");
			}
			other => panic!("Expected HttpError, got: {:?}", other),
		}
	}

	#[test]
	fn parse_auth_response_403_forbidden() {
		let response = ehttp::Response {
			url: "https://example.com/auth/v1/token".to_string(),
			ok: false,
			status: 403,
			status_text: "Forbidden".to_string(),
			bytes: b"Email not confirmed".to_vec(),
			headers: ehttp::Headers::new(&[]),
		};
		let result = parse_auth_response(response);
		match result.unwrap_err() {
			SupabaseError::HttpError { status, message } => {
				assert_eq!(status, 403);
				assert_eq!(message, "Email not confirmed");
			}
			other => panic!("Expected HttpError, got: {:?}", other),
		}
	}

	#[test]
	fn parse_auth_response_422_validation_error() {
		let body = serde_json::json!({
			"error": "invalid_grant",
			"error_description": "Invalid password"
		})
		.to_string();
		let response = ehttp::Response {
			url: "https://example.com/auth/v1/token".to_string(),
			ok: false,
			status: 422,
			status_text: "Unprocessable Entity".to_string(),
			bytes: body.into_bytes(),
			headers: ehttp::Headers::new(&[]),
		};
		let result = parse_auth_response(response);
		match result.unwrap_err() {
			SupabaseError::HttpError { status, message } => {
				assert_eq!(status, 422);
				assert!(message.contains("invalid_grant"));
			}
			other => panic!("Expected HttpError, got: {:?}", other),
		}
	}

	#[test]
	fn parse_auth_response_429_rate_limited() {
		let response = ehttp::Response {
			url: "https://example.com/auth/v1/token".to_string(),
			ok: false,
			status: 429,
			status_text: "Too Many Requests".to_string(),
			bytes: b"Rate limit exceeded".to_vec(),
			headers: ehttp::Headers::new(&[]),
		};
		let result = parse_auth_response(response);
		match result.unwrap_err() {
			SupabaseError::HttpError { status, message } => {
				assert_eq!(status, 429);
				assert_eq!(message, "Rate limit exceeded");
			}
			other => panic!("Expected HttpError, got: {:?}", other),
		}
	}

	#[test]
	fn parse_auth_response_non_utf8_error_body() {
		let response = ehttp::Response {
			url: "https://example.com/auth/v1/token".to_string(),
			ok: false,
			status: 500,
			status_text: "Internal Server Error".to_string(),
			bytes: vec![0xFF, 0xFE, 0xFD],
			headers: ehttp::Headers::new(&[]),
		};
		let result = parse_auth_response(response);
		// Should still produce an HttpError with lossy UTF-8 conversion
		match result.unwrap_err() {
			SupabaseError::HttpError { status, message } => {
				assert_eq!(status, 500);
				// from_utf8_lossy replaces invalid bytes with replacement character
				assert!(message.contains('\u{FFFD}'));
			}
			other => panic!("Expected HttpError, got: {:?}", other),
		}
	}

	#[test]
	fn parse_auth_response_success_sets_expires_at() {
		let response = ehttp::Response {
			url: "https://example.com/auth/v1/token".to_string(),
			ok: true,
			status: 200,
			status_text: "OK".to_string(),
			bytes: mock_auth_json().into_bytes(),
			headers: ehttp::Headers::new(&[]),
		};
		let before = std::time::SystemTime::now()
			.duration_since(std::time::UNIX_EPOCH)
			.unwrap()
			.as_secs();
		let session = parse_auth_response(response).unwrap();
		let after = std::time::SystemTime::now()
			.duration_since(std::time::UNIX_EPOCH)
			.unwrap()
			.as_secs();
		let expires_at = session.expires_at.unwrap();
		// expires_at should be approximately now + 3600
		assert!(expires_at >= before + 3600);
		assert!(expires_at <= after + 3600);
	}

	#[test]
	fn parse_auth_response_html_error_body() {
		let html = "<html><body><h1>502 Bad Gateway</h1></body></html>";
		let response = ehttp::Response {
			url: "https://example.com/auth/v1/token".to_string(),
			ok: false,
			status: 502,
			status_text: "Bad Gateway".to_string(),
			bytes: html.as_bytes().to_vec(),
			headers: ehttp::Headers::new(&[]),
		};
		let result = parse_auth_response(response);
		match result.unwrap_err() {
			SupabaseError::HttpError { status, message } => {
				assert_eq!(status, 502);
				assert!(message.contains("502 Bad Gateway"));
			}
			other => panic!("Expected HttpError, got: {:?}", other),
		}
	}

	#[test]
	fn parse_auth_response_truncated_json() {
		let truncated = r#"{"access_token": "tok", "refresh_token": "ref", "token_type"#;
		let response = ehttp::Response {
			url: "https://example.com/auth/v1/token".to_string(),
			ok: true,
			status: 200,
			status_text: "OK".to_string(),
			bytes: truncated.as_bytes().to_vec(),
			headers: ehttp::Headers::new(&[]),
		};
		let result = parse_auth_response(response);
		assert!(result.is_err());
		assert!(matches!(result.unwrap_err(), SupabaseError::JsonError(_)));
	}

	#[test]
	fn sign_in_body_with_special_chars() {
		let body = SignInBody {
			email: "user+tag@example.com".to_string(),
			password: "p@$$w0rd!#%".to_string(),
		};
		let json = serde_json::to_string(&body).unwrap();
		assert!(json.contains("user+tag@example.com"));
		assert!(json.contains("p@$$w0rd!#%"));
	}

	#[test]
	fn sign_in_body_with_unicode() {
		let body = SignInBody {
			email: "用户@example.com".to_string(),
			password: "密码🔑".to_string(),
		};
		let json = serde_json::to_string(&body).unwrap();
		let parsed: serde_json::Value = serde_json::from_str(&json).unwrap();
		assert_eq!(parsed["email"], "用户@example.com");
		assert_eq!(parsed["password"], "密码🔑");
	}

	#[test]
	fn sign_in_body_with_empty_fields() {
		let body = SignInBody {
			email: String::new(),
			password: String::new(),
		};
		let json = serde_json::to_string(&body).unwrap();
		assert!(json.contains("\"email\":\"\""));
		assert!(json.contains("\"password\":\"\""));
	}

	#[test]
	fn parse_auth_response_success_with_full_user() {
		let json = serde_json::json!({
			"access_token": "tok",
			"refresh_token": "ref",
			"token_type": "bearer",
			"expires_in": 7200,
			"user": {
				"id": "full-user-id",
				"email": "full@example.com",
				"role": "authenticated",
				"aud": "authenticated",
				"user_metadata": {"display_name": "Test User"},
				"app_metadata": {"provider": "email"},
				"created_at": "2024-01-01T00:00:00Z",
				"updated_at": "2024-06-15T12:00:00Z"
			}
		})
		.to_string();
		let response = ehttp::Response {
			url: "https://example.com/auth/v1/token".to_string(),
			ok: true,
			status: 200,
			status_text: "OK".to_string(),
			bytes: json.into_bytes(),
			headers: ehttp::Headers::new(&[]),
		};
		let session = parse_auth_response(response).unwrap();
		assert_eq!(session.access_token, "tok");
		assert_eq!(session.expires_in, 7200);
		assert_eq!(session.user.id, "full-user-id");
		assert_eq!(session.user.email, Some("full@example.com".to_string()));
		assert_eq!(session.user.user_metadata["display_name"], "Test User");
		assert_eq!(session.user.app_metadata["provider"], "email");
		assert_eq!(
			session.user.created_at,
			Some("2024-01-01T00:00:00Z".to_string())
		);
	}

	#[test]
	fn parse_auth_response_wrong_type_for_expires_in() {
		let json = serde_json::json!({
			"access_token": "tok",
			"refresh_token": "ref",
			"token_type": "bearer",
			"expires_in": "not-a-number",
			"user": {"id": "u"}
		})
		.to_string();
		let response = ehttp::Response {
			url: "https://example.com/auth/v1/token".to_string(),
			ok: true,
			status: 200,
			status_text: "OK".to_string(),
			bytes: json.into_bytes(),
			headers: ehttp::Headers::new(&[]),
		};
		let result = parse_auth_response(response);
		assert!(result.is_err());
		assert!(matches!(result.unwrap_err(), SupabaseError::JsonError(_)));
	}
}

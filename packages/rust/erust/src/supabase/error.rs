use std::fmt;

#[derive(Debug)]
pub enum SupabaseError {
	NetworkError(String),
	HttpError { status: u16, message: String },
	JsonError(serde_json::Error),
	AuthError(String),
	ClientError(String),
}

impl fmt::Display for SupabaseError {
	fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
		match self {
			SupabaseError::NetworkError(msg) => write!(f, "network error: {}", msg),
			SupabaseError::HttpError { status, message } => {
				write!(f, "HTTP {} error: {}", status, message)
			}
			SupabaseError::JsonError(err) => write!(f, "JSON parse error: {}", err),
			SupabaseError::AuthError(msg) => write!(f, "auth error: {}", msg),
			SupabaseError::ClientError(msg) => write!(f, "client error: {}", msg),
		}
	}
}

impl std::error::Error for SupabaseError {
	fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
		match self {
			SupabaseError::JsonError(err) => Some(err),
			_ => None,
		}
	}
}

impl From<serde_json::Error> for SupabaseError {
	fn from(err: serde_json::Error) -> Self {
		SupabaseError::JsonError(err)
	}
}

#[cfg(test)]
mod tests {
	use super::*;

	#[test]
	fn display_network_error() {
		let err = SupabaseError::NetworkError("timeout".to_string());
		assert_eq!(format!("{}", err), "network error: timeout");
	}

	#[test]
	fn display_http_error() {
		let err = SupabaseError::HttpError {
			status: 401,
			message: "Unauthorized".to_string(),
		};
		assert_eq!(format!("{}", err), "HTTP 401 error: Unauthorized");
	}

	#[test]
	fn display_auth_error() {
		let err = SupabaseError::AuthError("invalid credentials".to_string());
		assert_eq!(format!("{}", err), "auth error: invalid credentials");
	}

	#[test]
	fn display_client_error() {
		let err = SupabaseError::ClientError("no session".to_string());
		assert_eq!(format!("{}", err), "client error: no session");
	}

	#[test]
	fn from_serde_json_error() {
		let json_err = serde_json::from_str::<String>("not json").unwrap_err();
		let err: SupabaseError = json_err.into();
		assert!(matches!(err, SupabaseError::JsonError(_)));
		assert!(format!("{}", err).starts_with("JSON parse error:"));
	}

	#[test]
	fn error_source_json() {
		let json_err = serde_json::from_str::<String>("not json").unwrap_err();
		let err = SupabaseError::JsonError(json_err);
		assert!(std::error::Error::source(&err).is_some());
	}

	#[test]
	fn error_source_none_for_others() {
		let err = SupabaseError::NetworkError("test".to_string());
		assert!(std::error::Error::source(&err).is_none());

		let err = SupabaseError::AuthError("test".to_string());
		assert!(std::error::Error::source(&err).is_none());
	}

	#[test]
	fn error_source_none_for_http_error() {
		let err = SupabaseError::HttpError {
			status: 404,
			message: "Not Found".to_string(),
		};
		assert!(std::error::Error::source(&err).is_none());
	}

	#[test]
	fn error_source_none_for_client_error() {
		let err = SupabaseError::ClientError("test".to_string());
		assert!(std::error::Error::source(&err).is_none());
	}

	#[test]
	fn display_json_error_contains_details() {
		let json_err = serde_json::from_str::<u32>("\"not a number\"").unwrap_err();
		let err = SupabaseError::JsonError(json_err);
		let display = format!("{}", err);
		assert!(display.starts_with("JSON parse error:"));
		assert!(display.len() > "JSON parse error:".len());
	}

	#[test]
	fn display_network_error_empty_message() {
		let err = SupabaseError::NetworkError(String::new());
		assert_eq!(format!("{}", err), "network error: ");
	}

	#[test]
	fn display_http_error_with_zero_status() {
		let err = SupabaseError::HttpError {
			status: 0,
			message: "unknown".to_string(),
		};
		assert_eq!(format!("{}", err), "HTTP 0 error: unknown");
	}

	#[test]
	fn display_http_error_common_status_codes() {
		let cases = [
			(400, "Bad Request"),
			(403, "Forbidden"),
			(404, "Not Found"),
			(422, "Unprocessable Entity"),
			(429, "Too Many Requests"),
			(500, "Internal Server Error"),
			(502, "Bad Gateway"),
			(503, "Service Unavailable"),
		];
		for (status, message) in cases {
			let err = SupabaseError::HttpError {
				status,
				message: message.to_string(),
			};
			let display = format!("{}", err);
			assert!(display.contains(&status.to_string()));
			assert!(display.contains(message));
		}
	}

	#[test]
	fn display_auth_error_empty_message() {
		let err = SupabaseError::AuthError(String::new());
		assert_eq!(format!("{}", err), "auth error: ");
	}

	#[test]
	fn display_client_error_empty_message() {
		let err = SupabaseError::ClientError(String::new());
		assert_eq!(format!("{}", err), "client error: ");
	}

	#[test]
	fn display_network_error_with_unicode() {
		let err = SupabaseError::NetworkError("连接超时".to_string());
		assert_eq!(format!("{}", err), "network error: 连接超时");
	}

	#[test]
	fn display_http_error_with_long_message() {
		let long_msg = "x".repeat(1000);
		let err = SupabaseError::HttpError {
			status: 500,
			message: long_msg.clone(),
		};
		let display = format!("{}", err);
		assert!(display.contains(&long_msg));
	}

	#[test]
	fn debug_format_includes_variant_name() {
		let err = SupabaseError::NetworkError("test".to_string());
		let debug = format!("{:?}", err);
		assert!(debug.contains("NetworkError"));

		let err = SupabaseError::HttpError {
			status: 401,
			message: "Unauthorized".to_string(),
		};
		let debug = format!("{:?}", err);
		assert!(debug.contains("HttpError"));
		assert!(debug.contains("401"));

		let err = SupabaseError::AuthError("bad".to_string());
		let debug = format!("{:?}", err);
		assert!(debug.contains("AuthError"));

		let err = SupabaseError::ClientError("no session".to_string());
		let debug = format!("{:?}", err);
		assert!(debug.contains("ClientError"));
	}

	#[test]
	fn from_serde_json_error_preserves_source() {
		let json_err = serde_json::from_str::<Vec<i32>>("{invalid}").unwrap_err();
		let original_msg = format!("{}", json_err);
		let err: SupabaseError = json_err.into();
		let display = format!("{}", err);
		assert!(display.contains(&original_msg));
		// source() should return the original serde_json::Error
		let source = std::error::Error::source(&err).unwrap();
		assert_eq!(format!("{}", source), original_msg);
	}

	#[test]
	fn error_is_send_and_sync() {
		fn assert_send<T: Send>() {}
		fn assert_sync<T: Sync>() {}
		// serde_json::Error is Send + Sync, so SupabaseError should be too
		assert_send::<SupabaseError>();
		assert_sync::<SupabaseError>();
	}

	#[test]
	fn http_error_boundary_status_values() {
		// Valid HTTP status code range edges
		for status in [100, 199, 200, 299, 300, 399, 400, 499, 500, 599] {
			let err = SupabaseError::HttpError {
				status,
				message: "test".to_string(),
			};
			let display = format!("{}", err);
			assert!(display.contains(&status.to_string()));
		}
	}

	#[test]
	fn display_http_error_with_empty_message() {
		let err = SupabaseError::HttpError {
			status: 401,
			message: String::new(),
		};
		assert_eq!(format!("{}", err), "HTTP 401 error: ");
	}

	#[test]
	fn display_network_error_with_newlines() {
		let err = SupabaseError::NetworkError("line1\nline2\nline3".to_string());
		let display = format!("{}", err);
		assert!(display.contains("line1\nline2\nline3"));
	}
}

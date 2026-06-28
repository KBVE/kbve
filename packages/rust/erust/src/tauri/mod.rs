use std::path::{Path, PathBuf};
use std::sync::mpsc;

use crate::supabase::{auth, oauth, Session, SupabaseConfig, SupabaseError, SupabaseUser};

#[derive(serde::Serialize, serde::Deserialize, Debug, Clone)]
pub struct SessionHandoff {
	pub access_token: String,
	pub refresh_token: String,
	pub expires_at: u64,
}

impl From<&Session> for SessionHandoff {
	fn from(s: &Session) -> Self {
		Self {
			access_token: s.access_token.clone(),
			refresh_token: s.refresh_token.clone(),
			expires_at: s.expires_at.unwrap_or(0),
		}
	}
}

pub fn write_session_file(path: &Path, session: &Session) -> std::io::Result<PathBuf> {
	let handoff = SessionHandoff::from(session);
	let raw = serde_json::to_vec(&handoff)
		.map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))?;
	std::fs::write(path, raw)?;
	#[cfg(unix)]
	{
		use std::os::unix::fs::PermissionsExt;
		std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o600))?;
	}
	Ok(path.to_path_buf())
}

pub fn complete_oauth_blocking(
	config: &SupabaseConfig,
	callback_url: &str,
) -> Result<Session, SupabaseError> {
	let (tx, rx) = mpsc::channel();
	oauth::exchange_callback(config, callback_url, move |r| {
		let _ = tx.send(r);
	});
	rx.recv()
		.map_err(|_| SupabaseError::ClientError("oauth channel closed".to_string()))?
}

pub fn refresh_blocking(
	config: &SupabaseConfig,
	refresh_token: &str,
) -> Result<Session, SupabaseError> {
	let (tx, rx) = mpsc::channel();
	auth::refresh_session(config, refresh_token, move |r| {
		let _ = tx.send(r);
	});
	rx.recv()
		.map_err(|_| SupabaseError::ClientError("refresh channel closed".to_string()))?
}

pub fn get_user_blocking(
	config: &SupabaseConfig,
	access_token: &str,
) -> Result<SupabaseUser, SupabaseError> {
	let (tx, rx) = mpsc::channel();
	oauth::get_user(config, access_token, move |r| {
		let _ = tx.send(r);
	});
	rx.recv()
		.map_err(|_| SupabaseError::ClientError("get_user channel closed".to_string()))?
}

#[cfg(test)]
mod tests {
	use super::*;

	fn session() -> Session {
		Session {
			access_token: "acc".to_string(),
			refresh_token: "ref".to_string(),
			token_type: "bearer".to_string(),
			expires_in: 3600,
			expires_at: Some(123456),
			user: SupabaseUser::default(),
		}
	}

	#[test]
	fn handoff_from_session_drops_user() {
		let h = SessionHandoff::from(&session());
		assert_eq!(h.access_token, "acc");
		assert_eq!(h.refresh_token, "ref");
		assert_eq!(h.expires_at, 123456);
	}

	#[test]
	fn handoff_serializes_minimal() {
		let json = serde_json::to_string(&SessionHandoff::from(&session())).unwrap();
		assert!(json.contains("access_token"));
		assert!(json.contains("refresh_token"));
		assert!(json.contains("expires_at"));
		assert!(!json.contains("token_type"));
		assert!(!json.contains("user"));
	}

	#[test]
	fn write_session_file_round_trips() {
		let mut path = std::env::temp_dir();
		path.push("erust_test_session_handoff.json");
		let written = write_session_file(&path, &session()).unwrap();
		let raw = std::fs::read(&written).unwrap();
		let back: SessionHandoff = serde_json::from_slice(&raw).unwrap();
		assert_eq!(back.access_token, "acc");
		assert_eq!(back.expires_at, 123456);
		#[cfg(unix)]
		{
			use std::os::unix::fs::PermissionsExt;
			let mode = std::fs::metadata(&written).unwrap().permissions().mode();
			assert_eq!(mode & 0o777, 0o600);
		}
		let _ = std::fs::remove_file(&written);
	}
}

use crate::state::dbmodels::User;

#[derive(serde::Deserialize, serde::Serialize, Default, holy::Getters, holy::Setters)]
pub struct UserState {
	#[serde(flatten)]
	pub user: User,
	pub userbase: String,
}

trait UserInfo {
	fn get_username(&self) -> &str;
}

impl UserInfo for User {
	fn get_username(&self) -> &str {
		&self.username
	}
}

#[cfg(test)]
mod tests {
	use super::*;

	#[test]
	fn user_info_get_username() {
		let user = User {
			username: "h0lybyte".to_string(),
			..User::default()
		};
		assert_eq!(user.get_username(), "h0lybyte");
	}

	#[test]
	fn user_info_empty_username() {
		let user = User::default();
		assert_eq!(user.get_username(), "");
	}

	#[test]
	fn user_state_default() {
		let state = UserState::default();
		assert!(state.userbase.is_empty());
		assert!(state.user.username.is_empty());
	}

	#[test]
	fn user_state_serde_round_trip() {
		let state = UserState {
			user: User {
				id: 1,
				username: "testuser".to_string(),
				..User::default()
			},
			userbase: "main".to_string(),
		};

		let json = serde_json::to_string(&state).unwrap();
		let restored: UserState = serde_json::from_str(&json).unwrap();

		assert_eq!(restored.user.id, 1);
		assert_eq!(restored.user.username, "testuser");
		assert_eq!(restored.userbase, "main");
	}

	#[test]
	fn user_state_flatten_includes_user_fields_at_top_level() {
		let state = UserState {
			user: User {
				id: 5,
				username: "flat".to_string(),
				..User::default()
			},
			userbase: "db".to_string(),
		};

		let json = serde_json::to_string(&state).unwrap();
		// #[serde(flatten)] means user fields appear at top level
		assert!(json.contains("\"username\":\"flat\""));
		assert!(json.contains("\"userbase\":\"db\""));
		// "user" key should NOT appear since it's flattened
		assert!(!json.contains("\"user\""));
	}
}

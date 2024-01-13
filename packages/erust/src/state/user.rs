use crate::state::dbmodels::User;

#[derive(serde::Deserialize, serde::Serialize, Default)]
pub struct UserState {
	#[serde(flatten)]
	pub user: User,
}

trait UserInfo {
	fn get_username(&self) -> &str;
}

impl UserInfo for User {
	fn get_username(&self) -> &str {
		&self.username
	}
}

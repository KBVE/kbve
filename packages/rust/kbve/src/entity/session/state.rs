use jedi::builder::ValidatorBuilder;
use crate::db::{ self };
use std::sync::Arc;

pub struct KbveState {
	pub db_pool: Arc<db::Pool>,
	pub validator_builder: Arc<ValidatorBuilder<String, String>>,
}

impl KbveState {
	pub fn new(
		db_pool: Arc<db::Pool>,
		validator_builder: Arc<ValidatorBuilder<String, String>>
	) -> Self {
		KbveState { db_pool, validator_builder }
	}
}

use std::sync::Arc;
use async_trait::async_trait;
use std::future::Future;
use std::pin::Pin;

extern crate ammonia;

use crate::builder::RegexBuilder;

use crate::entity::regex::{
	extract_email_from_regex,
	extract_github_username_from_regex,
	extract_instagram_username_from_regex,
	extract_unsplash_photo_id_from_regex,
	extract_discord_server_id_from_regex,
	extract_ulid_from_regex,
	extract_username_from_regex,
	extract_hex_code_from_regex,
	extract_markdown_standalone_href_link_from_regex,
	extract_markdown_image_href_link_from_regex,
	extract_general_input_from_regex,
};

type ValidationResult<T, E> = Result<T, Vec<E>>;

trait SyncValidationRule<T, E>: Sync + Send {
	fn validate(&self, input: T) -> Result<T, E>;
}

pub struct ValidatorBuilder<T, E> {
	sync_rules: Vec<Box<dyn SyncValidationRule<T, E>>>,
}

impl<T, E> ValidatorBuilder<T, E>
	where T: Sync + Send + Default + Clone + 'static, E: Send + 'static
{
	pub fn new() -> Self {
		ValidatorBuilder {
			sync_rules: Vec::new(),
		}
	}

	pub fn add_rule<F>(&mut self, rule: F) -> &mut Self
		where F: Fn(T) -> Result<T, E> + Sync + Send + 'static
	{
		self.sync_rules.push(Box::new(rule));
		self
	}

	pub fn validate(&self, value: T) -> ValidationResult<T, E> {
		let mut errors = Vec::new();
		let mut current_value = Some(value); 

		for rule in &self.sync_rules {
			if let Some(value) = current_value.take() {
				match rule.validate(value) {
					Ok(modified_value) => {
						current_value = Some(modified_value);
					} 
					Err(e) => {
						errors.push(e);
						break; 
					}
				}
			}
		}

		if errors.is_empty() {
			Ok(current_value.unwrap())
		} else {
			Err(errors)
		}
	}
}

impl ValidatorBuilder<String, String> {
	pub fn clean_or_fail(&mut self) -> &mut Self {
		self.add_rule(|s: String| {
			let sanitized = ammonia::clean(&s);
			if sanitized != s {
				Err(
					"Input contains disallowed HTML or script content".to_string()
				)
			} else {
				Ok(sanitized)
			}
		});
		self
	}

	pub fn clean(&mut self) -> &mut Self {
		self.add_rule(|s: String| {
			let sanitized = ammonia::clean(&s);
			Ok(sanitized)
		});
		self
	}

	pub fn username(&mut self) -> &mut Self {
		self.add_rule(|s: String| {
			extract_username_from_regex(&s).map_err(|e| e.to_string())
		});
		self
	}

	pub fn ulid(&mut self) -> &mut Self {
		self.add_rule(|s: String| {
			extract_ulid_from_regex(&s).map_err(|e| e.to_string())
		});
		self
	}

	pub fn email(&mut self) -> &mut Self {
		self.add_rule(|s: String| {
			extract_email_from_regex(&s).map_err(|e| e.to_string())
		});
		self
	}

	pub fn github_username(&mut self) -> &mut Self {
		self.add_rule(|s: String| {
			extract_github_username_from_regex(&s).map_err(|e| e.to_string())
		});
		self
	}

	pub fn instagram_username(&mut self) -> &mut Self {
		self.add_rule(|s: String| {
			extract_instagram_username_from_regex(&s).map_err(|e| e.to_string())
		});
		self
	}

	pub fn unsplash_photo_id(&mut self) -> &mut Self {
		self.add_rule(|s: String| {
			extract_unsplash_photo_id_from_regex(&s).map_err(|e| e.to_string())
		});
		self
	}

	pub fn discord_server_id(&mut self) -> &mut Self {
		self.add_rule(|s: String| {
			extract_discord_server_id_from_regex(&s).map_err(|e| e.to_string())
		});
		self
	}

	pub fn hex(&mut self) -> &mut Self {
		self.add_rule(|s: String| {
			extract_hex_code_from_regex(&s).map_err(|e| e.to_string())
		});
		self
	}

	pub fn markdown_standalone_href_link(&mut self) -> &mut Self {
		self.add_rule(|s: String| {
			extract_markdown_standalone_href_link_from_regex(&s).map_err(|e|
				e.to_string()
			)
		});
		self
	}

	pub fn markdown_image_href_link(&mut self) -> &mut Self {
		self.add_rule(|s: String| {
			extract_markdown_image_href_link_from_regex(&s).map_err(|e|
				e.to_string()
			)
		});
		self
	}

    pub fn general_input(&mut self) -> &mut Self {
        self.add_rule(|s: String| {
            extract_general_input_from_regex(&s).map_err(|e| e.to_string())
        });
        self
    }


}

impl<T, E, F> SyncValidationRule<T, E>
	for F
	where F: Fn(T) -> Result<T, E> + Sync + Send, T: Clone
{
	fn validate(&self, input: T) -> Result<T, E> {
		self(input)
	}
}

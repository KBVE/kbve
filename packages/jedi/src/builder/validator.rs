use std::sync::Arc;
use async_trait::async_trait;
use std::future::Future;

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
};



type ValidationResult<T> = Result<(), Vec<T>>;

pub trait Sanitizer<T> {
	fn sanitize(&self, input: &mut T);
}

pub trait RegexValidator {
    fn validate_with_regex(&self, text: &str, pattern_name: &str) -> Result<(), String>;
}

pub struct HtmlSanitizer;

impl Sanitizer<String> for HtmlSanitizer {
	fn sanitize(&self, input: &mut String) {
		*input = ammonia::clean(input);
	}
}

#[async_trait]
pub trait AsyncValidationRule<T, E>: Sync + Send {
	async fn validate(&self, input: &T) -> Result<(), E>;
}

pub struct ValidatorBuilder<T, E> {
	sync_rules: Vec<Box<dyn Fn(&T) -> Result<(), E>>>,
	async_rules: Vec<Box<dyn AsyncValidationRule<T, E>>>,
	sanitizers: Vec<Box<dyn Sanitizer<T>>>,
	regex_builder: Option<Arc<RegexBuilder>>,
}

impl<T, E> ValidatorBuilder<T, E> where T: Sync + Send + Default, E: Send {
	pub fn new() -> Self {
		ValidatorBuilder {
			sync_rules: Vec::new(),
			async_rules: Vec::new(),
			sanitizers: Vec::new(),
			regex_builder: None,
		}
	}

	pub fn add_rule<F>(&mut self, rule: F) -> &mut Self
		where F: 'static + Fn(&T) -> Result<(), E>
	{
		self.sync_rules.push(Box::new(rule));
		self
	}

	pub fn add_async_rule<R>(&mut self, rule: R) -> &mut Self
		where R: 'static + AsyncValidationRule<T, E>
	{
		self.async_rules.push(Box::new(rule));
		self
	}

	pub fn with_regex_builder(mut self, regex_builder: Arc<RegexBuilder>) -> Self {
        self.regex_builder = Some(regex_builder);
        self
    }

	pub fn validate(&mut self, value: &mut T) -> ValidationResult<E> {
		let mut errors = Vec::new();

		for sanitizer in &self.sanitizers {
			sanitizer.sanitize(value);
		}

		for rule in &self.sync_rules {
			if let Err(e) = rule(value) {
				errors.push(e);
			}
		}

		if errors.is_empty() {
			Ok(())
		} else {
			Err(errors)
		}
	}

	pub async fn async_validate(
		&mut self,
		value: &mut T
	) -> ValidationResult<E> {
		for sanitizer in &self.sanitizers {
			sanitizer.sanitize(value);
		}

		let sync_result = self.validate(value);

		let mut errors = Vec::new();

		if let Err(sync_errors) = sync_result {
			errors.extend(sync_errors);
		}

		for rule in &self.async_rules {
			if let Err(e) = rule.validate(value).await {
				errors.push(e);
			}
		}

		if errors.is_empty() {
			Ok(())
		} else {
			Err(errors)
		}
	}
}

impl<E> ValidatorBuilder<String, E> where E: Send {
	pub fn clean(&mut self) -> &mut Self {
		let html_sanitizer: Box<dyn Sanitizer<String>> = Box::new(
			HtmlSanitizer
		);
		self.sanitizers.push(html_sanitizer);
		self
	}
}

impl<T> RegexValidator for ValidatorBuilder<T, String> where T: AsRef<str> {
    fn validate_with_regex(&self, text: &str, pattern_name: &str) -> Result<(), String> {
        if let Some(ref regex_builder) = self.regex_builder {
            regex_builder.validate(pattern_name, text)
                .map_err(|_| format!("Text does not match the '{}' pattern", pattern_name))
        } else {
            Err("RegexBuilder is not configured".to_string())
        }
    }
}

#[async_trait]
impl<T, E, F, Fut> AsyncValidationRule<T, E>
	for F
	where
		F: Fn(&T) -> Fut + Sync + Send,
		Fut: Future<Output = Result<(), E>> + Send,
		T: Sync + Send,
		E: Send
{
	async fn validate(&self, input: &T) -> Result<(), E> {
		self(input).await
	}
}

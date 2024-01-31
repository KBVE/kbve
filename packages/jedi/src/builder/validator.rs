use async_trait::async_trait;
use std::future::Future;

type ValidationResult<T> = Result<(), Vec<T>>;

#[async_trait]
pub trait AsyncValidationRule<T, E>: Sync + Send {
	async fn validate(&self, input: &T) -> Result<(), E>;
}

pub struct ValidatorBuilder<T, E> {
	sync_rules: Vec<Box<dyn Fn(&T) -> Result<(), E>>>,
	async_rules: Vec<Box<dyn AsyncValidationRule<T, E>>>,
}

impl<T, E> ValidatorBuilder<T, E> where T: Sync + Send, E: Send {
	pub fn new() -> Self {
		ValidatorBuilder {
			sync_rules: Vec::new(),
			async_rules: Vec::new(),
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

	pub fn validate(&self, value: &T) -> ValidationResult<E> {
		let mut errors = Vec::new();

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

	pub async fn async_validate(&self, value: &T) -> ValidationResult<E> {

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

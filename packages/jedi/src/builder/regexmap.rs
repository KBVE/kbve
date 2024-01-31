use thiserror::Error;
use regex::Regex;
use dashmap::DashMap;
use once_cell::sync::Lazy;
use std::fmt::Debug;

type LazyRegex = Lazy<Regex>;

#[derive(Error, Debug)]
pub enum RegexBuilderError {
	#[error("Invalid regex pattern: {0}")] InvalidRegex(String),

	#[error("Pattern not found: {0}")] PatternNotFound(String),
}

pub struct RegexBuilder {
	patterns: DashMap<String, LazyRegex>,
}

impl RegexBuilder {
	pub fn new() -> Self {
		RegexBuilder {
			patterns: DashMap::new(),
		}
	}

	pub fn add_pattern(
		&mut self,
		name: &str,
		pattern: &str
	) -> Result<&mut Self, RegexBuilderError> {
		match Regex::new(pattern) {
			Ok(compiled) => {
				let lazy_compiled = Lazy::new(move || compiled);
				self.patterns.insert(name.to_string(), lazy_compiled);
				Ok(self)
			}
			Err(e) =>
				Err(
					RegexBuilderError::InvalidRegex(
						format!("{}: {}", pattern, e)
					)
				),
		}
	}

	pub fn remove_pattern(&mut self, name: &str) -> Option<LazyRegex> {
		self.patterns.remove(name).map(|(_, regex)| regex)
	}

	pub fn with_common_patterns(mut self) -> Self {
		let common_patterns = vec![
			("email", r"(?i)^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$"),
			("phone", r"^\+?[0-9]{10,15}$")
		];

		for (name, pattern) in common_patterns {
			match self.add_pattern(name, pattern) {
				Ok(_) => {}
				Err(e) => eprintln!("Failed to add pattern {}: {:?}", name, e),
			}
		}

		self
	}

	pub fn validate(
		&self,
		name: &str,
		text: &str
	) -> Result<(), RegexBuilderError> {
		match self.patterns.get(name) {
			Some(regex) => {
				if regex.is_match(text) {
					Ok(())
				} else {
					Err(RegexBuilderError::PatternNotFound(name.to_string()))
				}
			}
			None => Err(RegexBuilderError::PatternNotFound(name.to_string())),
		}
	}
}

use crate::utils::sanitization::{
	extract_email_from_regex,
	extract_github_username_from_regex,
	extract_instagram_username_from_regex,
	extract_unsplash_photo_id_from_regex,
	extract_discord_server_id_from_regex,
	extract_ulid_from_regex,
	extract_username_from_regex,
	extract_service_from_regex,
	extract_captcha_token_from_regex,
};

use ammonia::clean;

type ValidationResult = Result<(), &'static str>;
type ValidationRule<T> = Box<dyn Fn(&T) -> ValidationResult>;

pub struct ValidatorBuilder<T> {
	rules: Vec<Box<dyn Fn(&T) -> ValidationResult>>,
}

impl<T> ValidatorBuilder<T> {
	pub fn new() -> Self {
		ValidatorBuilder { rules: Vec::new() }
	}

	pub fn add_rule<F>(&mut self, rule: F) -> &mut Self
		where F: 'static + Fn(&T) -> ValidationResult
	{
		self.rules.push(Box::new(rule));
		self
	}

	pub fn validate(&self, value: &T) -> ValidationResult {
		for rule in &self.rules {
			if let Err(e) = rule(value) {
				return Err(e);
			}
		}
		Ok(())
	}
}

impl ValidatorBuilder<&str> {

    
    pub fn password(mut self) -> Self {
        self.add_rule(|s: &&str| validate_only_input_password_without_regex(s));
        self
    }

	pub fn username(mut self) -> Self {
		self.add_rule(|s: &&str| {
			extract_username_from_regex(s)
				.map(|_| ())
				.map_err(|_| "Invalid username format")
		});
		self
	}

	pub fn ulid(mut self) -> Self {
		self.add_rule(|s: &&str| {
			extract_ulid_from_regex(s)
				.map(|_| ())
				.map_err(|_| "Invalid ULID format")
		});
		self
	}

	pub fn email(mut self) -> Self {
		self.add_rule(|s: &&str| {
			extract_email_from_regex(s)
				.map(|_| ())
				.map_err(|_| "Invalid email format")
		});
		self
	}

	pub fn github_username(mut self) -> Self {
		self.add_rule(|s: &&str| {
			extract_github_username_from_regex(s)
				.map(|_| ())
				.map_err(|_| "Invalid GitHub username format")
		});
		self
	}

	pub fn instagram_username(mut self) -> Self {
		self.add_rule(|s: &&str| {
			extract_instagram_username_from_regex(s)
				.map(|_| ())
				.map_err(|_| "Invalid Instagram username format")
		});
		self
	}

	pub fn unsplash_photo_id(mut self) -> Self {
		self.add_rule(|s: &&str| {
			extract_unsplash_photo_id_from_regex(s)
				.map(|_| ())
				.map_err(|_| "Invalid Unsplash photo ID format")
		});
		self
	}

	pub fn discord_server_id(mut self) -> Self {
		self.add_rule(|s: &&str| {
			extract_discord_server_id_from_regex(s)
				.map(|_| ())
				.map_err(|_| "Invalid Discord server ID format")
		});
		self
	}

	pub fn service(mut self) -> Self {
        self.add_rule(|s: &&str| {
            extract_service_from_regex(s)
                .map(|_| ())
                .map_err(|_| "Invalid service format")
        });
        self
    }

	pub fn captcha_token(mut self) -> Self {
        self.add_rule(|s: &&str| {
            extract_captcha_token_from_regex(s)
                .map(|_| ())
                .map_err(|_| "Invalid captcha token format")
        });
        self
    }



	pub fn clean_or_fail(mut self) -> Self {
		self.add_rule(|s: &&str| {
			let sanitized = ammonia::clean(*s);
			if sanitized != *s {
				Err("Input contains disallowed HTML or script content")
			} else {
				Ok(())
			}
		});
		self
	}

	pub fn clean(mut self) -> Self {
		self.add_rule(|s: &&str| {
			let _sanitized = clean(*s);
			Ok(())
		});
		self
	}
}


pub fn validate_only_input_password_without_regex(password: &str) -> Result<(), &'static str> {
    if password.chars().count() < 8 {
        return Err("Password is too short");
    }
    if password.chars().count() > 255 {
        return Err("Password is too long");
    }
    let has_uppercase = password.chars().any(|c| c.is_uppercase());
    let has_lowercase = password.chars().any(|c| c.is_lowercase());
    let has_digit = password.chars().any(|c| c.is_digit(10));
    let has_special = password.chars().any(|c| !c.is_alphanumeric());

    if !has_uppercase || !has_lowercase || !has_digit || !has_special {
        return Err(
            "Password must include uppercase, lowercase, digits, and special characters"
        );
    }
    Ok(())
}
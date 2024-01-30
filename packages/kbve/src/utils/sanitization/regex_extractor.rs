use regex::Regex;
use once_cell::sync::Lazy;

pub static SANITIZATION_EMAIL_REGEX: Lazy<Regex> = Lazy::new(||
	Regex::new(r"(?i)^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$").unwrap()
);

pub static SANITIZATION_GITHUB_USERNAME_REGEX: Lazy<Regex> = Lazy::new(||
	Regex::new(r"github\.com/([a-zA-Z0-9_-]+)").unwrap()
);

pub static SANITIZATION_INSTAGRAM_USERNAME_REGEX: Lazy<Regex> = Lazy::new(||
	Regex::new(
		r"(?:@|(?:www\.)?instagram\.com/)?(?:@)?([a-zA-Z0-9_](?:[a-zA-Z0-9_.]*[a-zA-Z0-9_])?)"
	).unwrap()
);

pub static SANITIZATION_UNSPLASH_PHOTO_ID_REGEX: Lazy<Regex> = Lazy::new(||
	Regex::new(r"photo-([a-zA-Z0-9]+-[a-zA-Z0-9]+)").unwrap()
);

pub static SANITIZATION_DISCORD_SERVER_EMBED_REGEX: Lazy<Regex> = Lazy::new(||
	Regex::new(r"discord\.com/widget\?id=(\d+)").unwrap()
);

pub static SANITIZATION_ULID_REGEX: Lazy<Regex> = Lazy::new(||
	Regex::new(r"(?i)^[0123456789ABCDEFGHJKMNPQRSTVWXYZ]{26}$").unwrap()
);

pub static SANITIZATION_USERNAME_REGEX: Lazy<Regex> = Lazy::new(|| {
	Regex::new(r"^[a-zA-Z0-9]{8,255}$").unwrap()
});

pub fn extract_email_from_regex(email: &str) -> Result<String, &'static str> {
	if SANITIZATION_EMAIL_REGEX.is_match(email) {
		Ok(email.to_string())
	} else {
		Err("Invalid email format")
	}
}

pub fn extract_github_username_from_regex(
	url: &str
) -> Result<String, &'static str> {
	SANITIZATION_GITHUB_USERNAME_REGEX.captures(url)
		.and_then(|cap|
			cap.get(1).map(|username| username.as_str().to_string())
		)
		.ok_or("Invalid GitHub URL")
}

pub fn extract_instagram_username_from_regex(
	url: &str
) -> Result<String, &'static str> {
	SANITIZATION_INSTAGRAM_USERNAME_REGEX.captures(url)
		.and_then(|cap| {
			cap.get(1).map(|username| {
				let username = username.as_str();
				if
					username.contains("__") ||
					username.contains("._") ||
					username.contains("_.")
				{
					None
				} else {
					Some(username.to_string())
				}
			})
		})
		.flatten()
		.ok_or("Invalid Instagram username or URL")
}

pub fn extract_unsplash_photo_id_from_regex(
	url: &str
) -> Result<String, &'static str> {
	SANITIZATION_UNSPLASH_PHOTO_ID_REGEX.captures(url)
		.and_then(|cap| cap.get(1).map(|match_| match_.as_str().to_string()))
		.ok_or("Invalid Unsplash URL")
}

pub fn extract_discord_server_id_from_regex(
	url: &str
) -> Result<String, &'static str> {
	SANITIZATION_DISCORD_SERVER_EMBED_REGEX.captures(url)
		.and_then(|cap| { cap.get(1).map(|id| id.as_str().to_string()) })
		.and_then(|id_str| {
			if id_str.chars().all(char::is_numeric) {
				Some(id_str)
			} else {
				None
			}
		})
		.ok_or("Invalid Discord Server URL or ID")
}

pub fn extract_ulid_from_regex(ulid_str: &str) -> Result<String, &'static str> {
	if SANITIZATION_ULID_REGEX.is_match(ulid_str) {
		Ok(ulid_str.to_string())
	} else {
		Err("Invalid ULID format")
	}
}

pub fn extract_username_from_regex(
	username_str: &str
) -> Result<String, &'static str> {
	if SANITIZATION_USERNAME_REGEX.is_match(username_str) {
		Ok(username_str.to_string())
	} else {
		Err("Invalid Username format")
	}
}

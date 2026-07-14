use ehttp::Request;

use crate::supabase::{Session, SupabaseConfig, SupabaseError, SupabaseUser};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OAuthTokens {
	pub access_token: String,
	pub refresh_token: String,
	pub expires_in: u64,
}

pub fn authorize_url(config: &SupabaseConfig, provider: &str, redirect_to: &str) -> String {
	config.auth_url(&format!(
		"authorize?provider={}&redirect_to={}",
		urlencode(provider),
		urlencode(redirect_to)
	))
}

pub fn parse_callback_fragment(callback_url: &str) -> Option<OAuthTokens> {
	let frag = callback_url
		.split_once('#')
		.map(|(_, f)| f)
		.or_else(|| callback_url.split_once('?').map(|(_, q)| q))?;

	let mut access_token = None;
	let mut refresh_token = None;
	let mut expires_in = 3600u64;

	for pair in frag.split('&') {
		let (k, v) = match pair.split_once('=') {
			Some(kv) => kv,
			None => continue,
		};
		match k {
			"access_token" => access_token = Some(urldecode(v)),
			"refresh_token" => refresh_token = Some(urldecode(v)),
			"expires_in" => {
				if let Ok(n) = urldecode(v).parse::<u64>() {
					expires_in = n;
				}
			}
			_ => {}
		}
	}

	Some(OAuthTokens {
		access_token: access_token?,
		refresh_token: refresh_token?,
		expires_in,
	})
}

pub fn get_user<F>(config: &SupabaseConfig, access_token: &str, callback: F)
where
	F: FnOnce(Result<SupabaseUser, SupabaseError>) + Send + 'static,
{
	let url = config.auth_url("user");
	let auth_header = format!("Bearer {}", access_token);
	let mut request = Request::get(&url);
	request.headers = ehttp::Headers::new(&[
		("apikey", config.anon_key.as_str()),
		("Authorization", auth_header.as_str()),
	]);

	ehttp::fetch(request, move |result| {
		let response = match result {
			Ok(resp) => resp,
			Err(err) => {
				callback(Err(SupabaseError::NetworkError(err)));
				return;
			}
		};
		if !response.ok {
			callback(Err(SupabaseError::HttpError {
				status: response.status,
				message: String::from_utf8_lossy(&response.bytes).to_string(),
			}));
			return;
		}
		match serde_json::from_slice::<SupabaseUser>(&response.bytes) {
			Ok(user) => callback(Ok(user)),
			Err(e) => callback(Err(SupabaseError::from(e))),
		}
	});
}

pub fn exchange_callback<F>(config: &SupabaseConfig, callback_url: &str, callback: F)
where
	F: FnOnce(Result<Session, SupabaseError>) + Send + 'static,
{
	let tokens = match parse_callback_fragment(callback_url) {
		Some(t) => t,
		None => {
			callback(Err(SupabaseError::AuthError(
				"callback url missing access_token/refresh_token".to_string(),
			)));
			return;
		}
	};

	let now = std::time::SystemTime::now()
		.duration_since(std::time::UNIX_EPOCH)
		.map(|d| d.as_secs())
		.unwrap_or(0);

	let access = tokens.access_token.clone();
	get_user(config, &access, move |result| {
		let user = result.unwrap_or_default();
		callback(Ok(Session {
			access_token: tokens.access_token,
			refresh_token: tokens.refresh_token,
			token_type: "bearer".to_string(),
			expires_in: tokens.expires_in,
			expires_at: Some(now + tokens.expires_in),
			user,
		}));
	});
}

fn urlencode(s: &str) -> String {
	let mut out = String::with_capacity(s.len());
	for b in s.bytes() {
		match b {
			b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
				out.push(b as char)
			}
			_ => out.push_str(&format!("%{:02X}", b)),
		}
	}
	out
}

fn urldecode(s: &str) -> String {
	let bytes = s.as_bytes();
	let mut out = Vec::with_capacity(bytes.len());
	let mut i = 0;
	while i < bytes.len() {
		match bytes[i] {
			b'%' if i + 2 < bytes.len() => {
				let hi = (bytes[i + 1] as char).to_digit(16);
				let lo = (bytes[i + 2] as char).to_digit(16);
				match (hi, lo) {
					(Some(h), Some(l)) => {
						out.push((h * 16 + l) as u8);
						i += 3;
					}
					_ => {
						out.push(bytes[i]);
						i += 1;
					}
				}
			}
			b'+' => {
				out.push(b' ');
				i += 1;
			}
			b => {
				out.push(b);
				i += 1;
			}
		}
	}
	String::from_utf8_lossy(&out).into_owned()
}

#[cfg(test)]
mod tests {
	use super::*;

	fn cfg() -> SupabaseConfig {
		SupabaseConfig::new("https://supabase.example.com", "anon-key")
	}

	#[test]
	fn authorize_url_encodes_redirect() {
		let url = authorize_url(&cfg(), "github", "chuckrpg-launcher://auth/callback");
		assert_eq!(
			url,
			"https://supabase.example.com/auth/v1/authorize?provider=github&redirect_to=chuckrpg-launcher%3A%2F%2Fauth%2Fcallback"
		);
	}

	#[test]
	fn parse_fragment_extracts_tokens() {
		let url = "chuckrpg-launcher://auth/callback#access_token=abc&refresh_token=def&expires_in=7200&token_type=bearer";
		let t = parse_callback_fragment(url).unwrap();
		assert_eq!(t.access_token, "abc");
		assert_eq!(t.refresh_token, "def");
		assert_eq!(t.expires_in, 7200);
	}

	#[test]
	fn parse_fragment_defaults_expires_in() {
		let url = "app://cb#access_token=a&refresh_token=b";
		let t = parse_callback_fragment(url).unwrap();
		assert_eq!(t.expires_in, 3600);
	}

	#[test]
	fn parse_fragment_query_style() {
		let url = "app://cb?access_token=a&refresh_token=b&expires_in=100";
		let t = parse_callback_fragment(url).unwrap();
		assert_eq!(t.access_token, "a");
		assert_eq!(t.expires_in, 100);
	}

	#[test]
	fn parse_fragment_missing_tokens_returns_none() {
		assert!(parse_callback_fragment("app://cb#error=access_denied").is_none());
		assert!(parse_callback_fragment("app://cb").is_none());
	}

	#[test]
	fn urldecode_handles_percent_and_plus() {
		assert_eq!(urldecode("a%2Bb"), "a+b");
		assert_eq!(urldecode("a+b"), "a b");
		assert_eq!(urldecode("plain"), "plain");
	}

	#[test]
	fn urlencode_reserved_chars() {
		assert_eq!(urlencode("a://b/c"), "a%3A%2F%2Fb%2Fc");
		assert_eq!(urlencode("safe-_.~"), "safe-_.~");
	}
}

//!         [SPELLBOOK]
//?         Collection of all the v2 Macros

#[macro_export]
macro_rules! spellbook_create_jwt {
	($uuid:expr, $email:expr, $username:expr, $secret:expr, $hours:expr) => {
		{

		use jsonwebtoken::{encode, EncodingKey, Header};

        let now = chrono::Utc::now();
        let exp = now + chrono::Duration::minutes($hours * 60);

        let jwt_token = encode(
            &Header::default(),
            &crate::runes::TokenRune {
                uuid: $uuid.to_string(),
                email: $email.to_string(),
                username: $username.to_string(),
                iat: now.timestamp() as usize,
                exp: exp.timestamp() as usize,
            },
            &EncodingKey::from_secret($secret.as_bytes()),
        ).unwrap(); 

		jwt_token
		}
	};
}

#[macro_export]
macro_rules! spellbook_create_cookie {
	($name:expr, $token:expr, $duration:expr) => {
		axum_extra::extract::cookie::Cookie::build($name, $token)
			.path("/")
			.max_age(time::Duration::hours($duration))
			.same_site(axum_extra::extract::cookie::SameSite::Lax)
			.http_only(true)
			.finish()
	};
}

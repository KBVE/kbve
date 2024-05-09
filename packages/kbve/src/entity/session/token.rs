use serde::{ Serialize, Deserialize };
use rand_core::{RngCore, OsRng};


#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TokenJWT {
	pub userid: String,
	pub email: String,
	pub username: String,
	pub iat: usize,
	pub exp: usize,
}

/// Generates a random alphanumeric string of a given length
/// using a cryptographically secure random number generator.
///
/// # Arguments
///
/// * `length` - The length of the string to generate
///
/// # Returns
///
/// A `String` containing random alphanumeric characters.
pub fn generate_random_token(length: usize) -> String {
    const CHARSET: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZ\
                             abcdefghijklmnopqrstuvwxyz\
                             0123456789";
    let mut rng = OsRng::default();
    let mut result = Vec::with_capacity(length);
    for _ in 0..length {
        let idx = (rng.next_u32() as usize) % CHARSET.len();
        result.push(CHARSET[idx]);
    }
    String::from_utf8(result).expect("Valid UTF-8 string")
}
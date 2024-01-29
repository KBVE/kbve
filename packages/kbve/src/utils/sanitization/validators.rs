pub fn validate_input_ulid(ulid_str: &str) -> Result<&str, &'static str> {
    
	// ULID is usually 26 chars.
	if ulid_str.len() != 26 {
		return Err("ulid_invalid");
	}

	// Crockford's base32 set
	let base32_chars = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

	// Validate each character
	for c in ulid_str.chars() {
		if !base32_chars.contains(c) {
			return Err("Invalid character in ULID");
		}
	}

	// ULID is valid
	Ok(ulid_str)
}

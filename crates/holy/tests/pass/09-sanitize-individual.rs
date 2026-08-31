use holy::Sanitize;

#[derive(Sanitize)]
pub struct Data {
	#[holy(sanitize = "uppercase")]
	pub name: String,
	#[holy(sanitize = "trim,alphanumeric")]
	pub code: String,
}

fn main() {
	let mut d = Data {
		name: "hello".into(),
		code: "  ab!c@d  ".into(),
	};
	d.sanitize_name();
	assert_eq!(d.name, "HELLO");
	d.sanitize_code();
	assert_eq!(d.code, "abcd");
}

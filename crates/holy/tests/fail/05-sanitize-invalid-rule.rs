use holy::Sanitize;

#[derive(Sanitize)]
pub struct Bad {
	#[holy(sanitize = "trim,bogus_rule")]
	pub name: String,
}

fn main() {}

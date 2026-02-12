use holy::Sanitize;

#[derive(Sanitize)]
pub struct Bad {
	#[holy(sanitize = "trim")]
	pub count: u32,
}

fn main() {}

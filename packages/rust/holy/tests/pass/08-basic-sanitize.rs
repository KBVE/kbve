use holy::Sanitize;

#[derive(Sanitize)]
pub struct UserInput {
	#[holy(sanitize = "trim,lowercase")]
	pub username: String,
	#[holy(sanitize = "trim")]
	pub email: String,
	pub age: u32,
}

fn main() {
	let mut input = UserInput {
		username: "  Hello World  ".into(),
		email: "  test@example.com  ".into(),
		age: 25,
	};
	input.sanitize();
	assert_eq!(input.username, "hello world");
	assert_eq!(input.email, "test@example.com");
	assert_eq!(input.age, 25);
}

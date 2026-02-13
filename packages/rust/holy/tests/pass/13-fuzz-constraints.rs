use holy::Fuzz;

#[derive(Fuzz)]
pub struct Bounded {
	#[holy(fuzz = "ascii(5, 10)")]
	pub token: String,
	#[holy(fuzz = "range(1, 100)")]
	pub score: u32,
	pub flag: bool,
}

fn main() {
	let b = Bounded::fuzz_default();
	assert!(b.token.len() >= 5 && b.token.len() <= 10);
	assert!(b.score >= 1 && b.score <= 100);
	assert!(!b.flag);
}

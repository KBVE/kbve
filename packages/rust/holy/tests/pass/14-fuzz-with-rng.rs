use holy::Fuzz;

#[derive(Fuzz)]
pub struct Sample {
	#[holy(fuzz = "alphanumeric(3, 8)")]
	pub id: String,
	#[holy(fuzz = "range(0, 255)")]
	pub byte_val: u8,
	pub active: bool,
}

fn main() {
	use rand::SeedableRng;
	let mut rng = rand::rngs::StdRng::seed_from_u64(42);
	let s = Sample::fuzz_with(&mut rng);
	assert!(s.id.len() >= 3 && s.id.len() <= 8);
	assert!(s.id.chars().all(|c| c.is_alphanumeric()));
}

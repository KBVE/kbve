use holy::Getters;

#[derive(Getters)]
pub struct WithSkip {
	pub name: String,
	#[holy(skip)]
	pub internal: u64,
}

fn main() {
	let s = WithSkip {
		name: "test".into(),
		internal: 0,
	};
	let _ = s.internal();
}

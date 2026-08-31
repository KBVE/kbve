use holy::{Getters, Setters};

#[derive(Getters, Setters)]
pub struct WithSkip {
	pub name: String,
	#[holy(skip)]
	pub internal: u64,
}

fn main() {
	let mut s = WithSkip {
		name: "test".into(),
		internal: 0,
	};
	let _n: &String = s.name();
	s.set_name("new".into());
	// No getter/setter for `internal` — that's the point
}

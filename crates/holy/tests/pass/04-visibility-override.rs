mod inner {
	use holy::{Getters, Setters};

	#[derive(Getters, Setters)]
	pub struct Mixed {
		#[holy(public)]
		name: String,
		pub visible: u32,
	}

	impl Mixed {
		pub fn new(name: String, visible: u32) -> Self {
			Self { name, visible }
		}
	}
}

fn main() {
	let s = inner::Mixed::new("pub".into(), 42);
	// name getter is pub despite field being private
	let _n: &String = s.name();
	let _v: &u32 = s.visible();
}

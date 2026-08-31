use holy::Getters;

#[derive(Getters)]
pub struct Simple {
	pub name: String,
	pub age: u32,
}

fn main() {
	let s = Simple {
		name: "test".into(),
		age: 5,
	};
	let _n: &String = s.name();
	let _a: &u32 = s.age();
}

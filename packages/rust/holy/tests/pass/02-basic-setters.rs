use holy::Setters;

#[derive(Setters)]
pub struct Simple {
	pub name: String,
	pub age: u32,
}

fn main() {
	let mut s = Simple {
		name: "test".into(),
		age: 5,
	};
	s.set_name("new".into());
	s.set_age(10);
}

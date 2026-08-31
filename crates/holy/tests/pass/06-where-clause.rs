use holy::Getters;
use std::fmt::Debug;

#[derive(Getters)]
pub struct Bounded<T: Debug> {
	pub value: T,
}

fn main() {
	let b = Bounded { value: 42 };
	let _v: &i32 = b.value();
}

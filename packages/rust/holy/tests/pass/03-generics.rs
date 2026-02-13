use holy::{Getters, Setters};

#[derive(Getters, Setters)]
pub struct Container<T> {
	pub value: T,
	pub label: String,
}

fn main() {
	let mut c = Container {
		value: 42i32,
		label: "test".into(),
	};
	let _v: &i32 = c.value();
	c.set_value(100);
	c.set_label("updated".into());
}

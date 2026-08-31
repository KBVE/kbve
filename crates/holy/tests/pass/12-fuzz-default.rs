use holy::Fuzz;

#[derive(Fuzz)]
pub struct Config {
	pub name: String,
	pub count: u32,
	pub enabled: bool,
}

fn main() {
	let c = Config::fuzz_default();
	let _: &str = &c.name;
	let _: u32 = c.count;
	let _: bool = c.enabled;
}

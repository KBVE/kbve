use holy::Sanitize;

#[derive(Sanitize)]
pub struct Sensor {
	#[holy(sanitize = "clamp(0,100)")]
	pub value: i32,
	#[holy(sanitize = "clamp(0.0,1.0)")]
	pub ratio: f64,
}

fn main() {
	let mut s = Sensor {
		value: 150,
		ratio: -0.5,
	};
	s.sanitize();
	assert_eq!(s.value, 100);
	assert!((s.ratio - 0.0).abs() < f64::EPSILON);
}

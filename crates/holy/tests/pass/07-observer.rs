use holy::Observer;

#[derive(Observer)]
pub struct Sensor {
	#[holy(observe)]
	pub temperature: f64,
	pub name: String,
}

fn main() {
	let sensor = Sensor {
		temperature: 20.0,
		name: "room".into(),
	};

	let mut observers = SensorObservers::new();
	observers.add_temperature_observer(|s| {
		let _ = s.temperature;
	});
	observers.notify_temperature_observers(&sensor);
}

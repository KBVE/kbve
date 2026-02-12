## Holy

A proc-macro library providing derive macros for Rust structs.

### Getters & Setters

```rust
#[derive(holy::Getters, holy::Setters)]
pub struct User {
    pub name: String,
    pub age: u32,
}

let mut user = User { name: "test".into(), age: 25 };
let name: &String = user.name();    // getter
user.set_age(26);                    // setter
```

Supports generic structs:

```rust
#[derive(holy::Getters, holy::Setters)]
pub struct Container<T> {
    pub value: T,
}
```

### Attributes

Control visibility and behavior per-field with `#[holy(...)]`:

- `#[holy(public)]` — make the generated getter/setter `pub` regardless of field visibility
- `#[holy(private)]` — make the generated getter/setter private regardless of field visibility
- `#[holy(skip)]` — skip generating getter/setter for this field
- `#[holy(observe)]` — mark field for observer pattern (used with `Observer` derive)

### Observer

Derive `Observer` to generate a companion struct for the observer pattern:

```rust
#[derive(holy::Observer)]
pub struct Sensor {
    #[holy(observe)]
    pub temperature: f64,
    pub name: String,
}

// Generates `SensorObservers` companion struct
let mut observers = SensorObservers::new();
observers.add_temperature_observer(|s: &Sensor| {
    println!("temp: {}", s.temperature);
});
observers.notify_temperature_observers(&sensor);
```

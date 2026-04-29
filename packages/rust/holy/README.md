## Holy

A proc-macro library that ships derive macros for everyday struct chores:
getters, setters, observers, fuzz constructors, and input sanitization.
Pulling it as a path / crates.io dep keeps each consumer free of
hand-rolled boilerplate and centralizes policy changes (new sanitize
rules, observer hooks, etc.) in one crate.

### Available derives

- `Getters` — auto-generates `get_<field>()` accessors.
- `Setters` — auto-generates `set_<field>()` mutators.
- `Observer` — emits change events on field updates.
- `Fuzz` — generates `random()` constructors for tests.
- `Sanitize` — generates `.sanitize()` + per-field `.sanitize_<field>()`
  methods driven by `#[holy(sanitize = "rule1, rule2(arg)")]` attributes.

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

### Sanitize

Derive `Sanitize` to generate `.sanitize()` plus per-field
`.sanitize_<field>()` methods. Each rule is declared inline on the
field via `#[holy(sanitize = "...")]` and runs in the order written.

| Rule              | Field type | Effect                                                                                                                                   |
| ----------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `trim`            | `String`   | `.trim().to_string()`                                                                                                                    |
| `lowercase`       | `String`   | `.to_lowercase()`                                                                                                                        |
| `uppercase`       | `String`   | `.to_uppercase()`                                                                                                                        |
| `alphanumeric`    | `String`   | retain only `char::is_alphanumeric()`                                                                                                    |
| `escape_html`     | `String`   | replace `& < > " '` with HTML entities                                                                                                   |
| `nul_strip`       | `String`   | drop every `\0` byte _(0.2.1)_                                                                                                           |
| `control_strip`   | `String`   | drop ASCII/Unicode control chars + bidi overrides (U+202A..U+202E, U+2066..U+2069) + zero-width chars (U+200B..U+200D, U+FEFF) _(0.2.1)_ |
| `slug`            | `String`   | lowercase + ASCII alphanumerics + collapse separator runs into single `-` + trim leading/trailing `-` _(0.2.1)_                          |
| `truncate(N)`     | `String`   | UTF-8-safe byte truncate to `N`; walks back to nearest char boundary so multi-byte codepoints never panic                                |
| `clamp(min, max)` | numeric    | `.clamp(min, max)`                                                                                                                       |

Use `control_strip` only on inline text fields (titles, signatures,
slugs). It removes `\n` and `\t` so it is **not** appropriate for
markdown bodies — those should be rendered through a markdown sanitizer
on the read path instead.

```rust
#[derive(holy::Sanitize, serde::Deserialize)]
pub struct CreateThreadBody {
    #[holy(sanitize = "trim, control_strip, escape_html, truncate(180)")]
    pub title: String,
    #[holy(sanitize = "trim, lowercase, slug, truncate(50)")]
    pub space_slug: String,
    #[holy(sanitize = "nul_strip, truncate(50000)")]
    pub body: String,
}
```

After `payload.sanitize()` the struct is safe to forward into downstream
RPCs without per-field length / control-char checks.

### Fuzz

Derive `Fuzz` to generate `random()` constructors for tests:

```rust
#[derive(holy::Fuzz)]
pub struct Coords {
    pub x: i32,
    pub y: i32,
}

let c = Coords::random();
```

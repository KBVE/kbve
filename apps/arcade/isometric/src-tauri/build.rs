fn main() {
    let target = std::env::var("TARGET").unwrap_or_default();
    let desktop = std::env::var_os("CARGO_FEATURE_DESKTOP").is_some();
    if desktop && !target.contains("wasm32") {
        tauri_build::build()
    }
}

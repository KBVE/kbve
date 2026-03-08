fn main() {
    let target = std::env::var("TARGET").unwrap_or_default();
    if !target.contains("wasm32") {
        tauri_build::build()
    }
}

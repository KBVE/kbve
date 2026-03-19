mod views;

use views::ViewError;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! Welcome to KBVE Desktop.", name)
}

#[tauri::command]
async fn view_init(id: String) -> Result<(), ViewError> {
    // Placeholder — once concrete views exist, this dispatches to the
    // matching View::init(). For now it just validates the id.
    let known = ["general", "audio", "models", "shortcuts", "about"];
    if known.contains(&id.as_str()) {
        Ok(())
    } else {
        Err(ViewError::from(format!("unknown view: {}", id)))
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .invoke_handler(tauri::generate_handler![greet, view_init])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

//! Tray menu strings.
//!
//! Handy auto-generates these from frontend locale files via build.rs. This
//! port ships a static English-only version; i18n can be reintroduced later.

#[derive(Debug, Clone)]
pub struct TrayStrings {
    pub settings: String,
    pub check_updates: String,
    pub cancel: String,
    pub quit: String,
}

impl Default for TrayStrings {
    fn default() -> Self {
        Self {
            settings: "Settings".to_string(),
            check_updates: "Check for Updates".to_string(),
            cancel: "Cancel".to_string(),
            quit: "Quit".to_string(),
        }
    }
}

/// Get localized tray menu strings. English-only for now; `locale` is ignored.
pub fn get_tray_translations(_locale: Option<String>) -> TrayStrings {
    TrayStrings::default()
}

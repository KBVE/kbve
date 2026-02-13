use crate::AppState;

pub fn dark_mode_widget(ui: &mut egui::Ui, state: &mut AppState) -> bool {
    let mut state_changed = false;

    ui.horizontal(|ui| {
        // Render the toggle switch
        let response = crate::widgets::toggle_ui_compact(ui, &mut state.is_dark_mode);

        if response.changed() {
            state_changed = true;
            // Update visuals based on the new mode
            if state.is_dark_mode {
                ui.ctx().set_visuals(egui::Visuals::dark());
            } else {
                ui.ctx().set_visuals(egui::Visuals::light());
            }
        }

        // Display the corresponding text next to the toggle switch
        let text = if state.is_dark_mode { "  Dark Mode 🌙 " } else { " ☆ Light Mode " };
        ui.label(text);
    });

    state_changed
}
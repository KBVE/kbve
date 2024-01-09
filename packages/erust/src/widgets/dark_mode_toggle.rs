use crate::AppState;

pub fn dark_mode_widget(ui: &mut egui::Ui, state: &mut AppState) -> bool {
    let text = if state.is_dark_mode { "Dark Mode" } else { "Light Mode" };
    let mut state_changed = false;

    if ui.button(text).clicked() {
        state.is_dark_mode = !state.is_dark_mode;
        state_changed = true;

        if state.is_dark_mode {
            ui.ctx().set_visuals(egui::Visuals::dark());
        } else {
            ui.ctx().set_visuals(egui::Visuals::light());
        }
    }

    state_changed
}

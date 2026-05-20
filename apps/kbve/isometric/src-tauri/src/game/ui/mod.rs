use bevy::prelude::*;

pub mod badge;
pub mod button;
pub mod modal;
pub mod panel;
pub mod text_label;

pub use badge::{BadgeKind, spawn_badge};
pub use button::{ButtonKind, UiButtonConfig, spawn as spawn_button};
pub use modal::{ModalConfig, ModalRoot, spawn_modal};
pub use panel::{PanelConfig, spawn_panel};
pub use text_label::{LabelKind, spawn_label};

pub struct UiLibraryPlugin;

impl Plugin for UiLibraryPlugin {
    fn build(&self, app: &mut App) {
        app.add_plugins((button::ButtonPlugin, modal::ModalPlugin));
    }
}

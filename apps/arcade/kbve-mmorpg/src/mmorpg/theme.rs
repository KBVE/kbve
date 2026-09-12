//! Catppuccin, as a palette rather than a dependency.
//!
//! The `catppuccin-egui` crate stops at egui 0.33 and this game is on 0.36, so
//! the crate cannot be used here. The palette itself is the valuable part and
//! it is only twenty-six colours, taken verbatim from the official
//! `catppuccin/palette` definition.
//!
//! Doing it this way also buys something the crate would not: the same named
//! colours drive the world as well as the interface, so a health bar and the
//! ring under a target are the same red rather than two reds that nearly match.

use bevy_egui::egui;

/// One Catppuccin flavour.
///
/// Only the colours this game actually uses. Adding the rest is a matter of
/// adding fields, but an unused constant is a constant nobody keeps correct.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Flavour {
    pub base: egui::Color32,
    pub mantle: egui::Color32,
    pub crust: egui::Color32,
    pub surface0: egui::Color32,
    pub surface1: egui::Color32,
    pub surface2: egui::Color32,
    pub overlay0: egui::Color32,
    pub overlay1: egui::Color32,
    pub text: egui::Color32,
    pub subtext0: egui::Color32,
    pub red: egui::Color32,
    pub maroon: egui::Color32,
    pub peach: egui::Color32,
    pub yellow: egui::Color32,
    pub green: egui::Color32,
    pub blue: egui::Color32,
    pub lavender: egui::Color32,
    pub mauve: egui::Color32,
}

const fn rgb(r: u8, g: u8, b: u8) -> egui::Color32 {
    egui::Color32::from_rgb(r, g, b)
}

/// The dark flavour, and the game's default.
///
/// Only Mocha for now. The other three flavours are the same twenty-six fields
/// and can be lifted straight from `catppuccin/palette` when there is a setting
/// to choose between them -- an unused one sitting here would only be a
/// constant nobody checks.
pub const MOCHA: Flavour = Flavour {
    base: rgb(30, 30, 46),
    mantle: rgb(24, 24, 37),
    crust: rgb(17, 17, 27),
    surface0: rgb(49, 50, 68),
    surface1: rgb(69, 71, 90),
    surface2: rgb(88, 91, 112),
    overlay0: rgb(108, 112, 134),
    overlay1: rgb(127, 132, 156),
    text: rgb(205, 214, 244),
    subtext0: rgb(166, 173, 200),
    red: rgb(243, 139, 168),
    maroon: rgb(235, 160, 172),
    peach: rgb(250, 179, 135),
    yellow: rgb(249, 226, 175),
    green: rgb(166, 227, 161),
    blue: rgb(137, 180, 250),
    lavender: rgb(180, 190, 254),
    mauve: rgb(203, 166, 247),
};

impl Flavour {
    /// Applies the flavour to an egui context.
    ///
    /// Written against `Visuals` rather than a wholesale `Style` replacement,
    /// so egui's own spacing and layout defaults survive an upgrade and only
    /// the colours are ours.
    pub fn apply(self, ctx: &egui::Context) {
        // Seeded from the light or dark defaults according to the flavour's own
        // background, so a light flavour added later gets egui's light shadows
        // and blend assumptions rather than dark ones wearing light colours.
        let mut visuals = if self.is_dark() {
            egui::Visuals::dark()
        } else {
            egui::Visuals::light()
        };

        visuals.override_text_color = Some(self.text);
        visuals.hyperlink_color = self.blue;
        visuals.faint_bg_color = self.surface0;
        visuals.extreme_bg_color = self.crust;
        visuals.code_bg_color = self.mantle;
        visuals.warn_fg_color = self.peach;
        visuals.error_fg_color = self.red;
        visuals.window_fill = self.base;
        visuals.panel_fill = self.base;
        visuals.window_stroke = egui::Stroke::new(1.0, self.overlay0);

        visuals.widgets.noninteractive.bg_fill = self.base;
        visuals.widgets.noninteractive.weak_bg_fill = self.base;
        visuals.widgets.noninteractive.bg_stroke = egui::Stroke::new(1.0, self.surface1);
        visuals.widgets.noninteractive.fg_stroke = egui::Stroke::new(1.0, self.text);

        visuals.widgets.inactive.bg_fill = self.surface0;
        visuals.widgets.inactive.weak_bg_fill = self.surface0;
        visuals.widgets.inactive.bg_stroke = egui::Stroke::new(1.0, self.surface1);
        visuals.widgets.inactive.fg_stroke = egui::Stroke::new(1.0, self.text);

        visuals.widgets.hovered.bg_fill = self.surface1;
        visuals.widgets.hovered.weak_bg_fill = self.surface1;
        visuals.widgets.hovered.bg_stroke = egui::Stroke::new(1.0, self.overlay0);
        visuals.widgets.hovered.fg_stroke = egui::Stroke::new(1.5, self.text);

        visuals.widgets.active.bg_fill = self.surface2;
        visuals.widgets.active.weak_bg_fill = self.surface2;
        visuals.widgets.active.bg_stroke = egui::Stroke::new(1.0, self.overlay1);
        visuals.widgets.active.fg_stroke = egui::Stroke::new(2.0, self.text);

        visuals.selection.bg_fill = self.blue.linear_multiply(0.4);
        visuals.selection.stroke = egui::Stroke::new(1.0, self.text);

        ctx.set_visuals(visuals);
    }

    /// Whether the flavour is a dark one, decided from the background rather
    /// than stored, so a new flavour cannot be added with the flag set wrong.
    fn is_dark(self) -> bool {
        let [r, g, b, _] = self.base.to_array();
        (r as u32 + g as u32 + b as u32) < 384
    }
}

/// The flavour everything else reads.
///
/// A single point to change, and the place a settings menu would eventually
/// write to.
pub const ACTIVE: Flavour = MOCHA;

/// Original app.rs from here https://raw.githubusercontent.com/emilk/eframe_template/master/src/app.rs

/// This is general bolierplate Template.

use crate::applicationstate::AppState;

/// We derive Deserialize/Serialize so we can persist app state on shutdown.
#[derive(serde::Deserialize, serde::Serialize)]
#[serde(default)] // if we add new fields, give them default values when deserializing old state
pub struct TemplateApp {
	// States
	state: AppState,
}

impl Default for TemplateApp {
	fn default() -> Self {
		Self {
			state: AppState::default(),
		}
	}
}

impl TemplateApp {
	/// Called once before the first frame.
	pub fn new(cc: &eframe::CreationContext<'_>) -> Self {
		// This is also where you can customize the look and feel of egui using
		// `cc.egui_ctx.set_visuals` and `cc.egui_ctx.set_fonts`.

		// Load previous app state (if any).
		// Note that you must enable the `persistence` feature for this to work.
		// if let Some(storage) = cc.storage {
		//     return eframe::get_value(storage, eframe::APP_KEY).unwrap_or_default();
		// }

		// Default::default()

		// Initialize AppState
		// Self {
        //     // Attempt to load the previous state from storage
        //     // If loading fails, initialize a new AppState
        //     state: AppState::load(cc.storage).unwrap_or_else(AppState::new),
        // }

        let app = Self {
            state: AppState::load(cc.storage).unwrap_or_else(AppState::new),
        };

        if app.state.is_dark_mode {
            cc.egui_ctx.set_visuals(egui::Visuals::dark());
        } else {
            cc.egui_ctx.set_visuals(egui::Visuals::light());
        }

        app
	}
}

impl eframe::App for TemplateApp {
	/// Called by the frame work to save state before shutdown.
	fn save(&mut self, storage: &mut dyn eframe::Storage) {
        self.state.save(storage);
	}

	/// Called each time the UI needs repainting, which may be many times per second.
	fn update(&mut self, ctx: &egui::Context, _frame: &mut eframe::Frame) {
		// Put your widgets into a `SidePanel`, `TopBottomPanel`, `CentralPanel`, `Window` or `Area`.
		// For inspiration and more examples, go to https://emilk.github.io/egui

		egui::TopBottomPanel::top("top_panel").show(ctx, |ui| {
			// The top panel is often a good place for a menu bar:

			egui::menu::bar(ui, |ui| {
				// NOTE: no File->Quit on web pages!
				let is_web = cfg!(target_arch = "wasm32");
				if !is_web {
					ui.menu_button("File", |ui| {
						if ui.button("Quit").clicked() {
							ctx.send_viewport_cmd(egui::ViewportCommand::Close);
						}
					});
					ui.add_space(16.0);
				}

				 egui::widgets::global_dark_light_mode_buttons(ui);
			});
		});


		egui::SidePanel::left("side_panel").show(ctx, |ui| {
			ui.heading("Side Panel");
			ui.horizontal(|ui| {
				ui.label("Adjust value: ");
				if ui.button("Increment").clicked() {
					self.state.value += 1.0;
				}
			});
			// Add more widgets here as needed
            if ui.button("Save State").clicked() {
                // Check if storage is available and get a mutable reference
                if let Some(storage) = _frame.storage_mut() {
                    // Now storage is a mutable reference
                    self.state.save(storage);
                }
            }

            //  Dark / Light

            if ui.checkbox(&mut self.state.is_dark_mode, " 🌙 Dark Mode ").changed() {
                if self.state.is_dark_mode {
                    ctx.set_visuals(egui::Visuals::dark());
                } else {
                    ctx.set_visuals(egui::Visuals::light());
                }

                // Optionally save the state immediately when changed
                if let Some(storage) = _frame.storage_mut() {
                    self.state.save(storage);
                }
            }
		});

		egui::CentralPanel::default().show(ctx, |ui| {
			// The central panel the region left after adding TopPanel's and SidePanel's
			ui.heading("eRust - Tonic Talks");

			ui.horizontal(|ui| {
				ui.label("Write something: ");
				ui.text_edit_singleline(&mut self.state.label);
			});

			ui.add(
				egui::Slider
					::new(&mut self.state.value, 0.0..=10.0)
					.text("value")
			);
			if ui.button("Increment").clicked() {
				self.state.value += 1.0;
			}

			ui.separator();

			ui.add(
				egui::github_link_file!(
					"https://github.com/kbve/kbve/blob/main/",
					"Source code."
				)
			);

			ui.with_layout(egui::Layout::bottom_up(egui::Align::LEFT), |ui| {
				powered_by_egui_and_eframe(ui);
				egui::warn_if_debug_build(ui);
			});
		});
	}
}

pub fn powered_by_egui_and_eframe(ui: &mut egui::Ui) {
	ui.horizontal(|ui| {
		ui.spacing_mut().item_spacing.x = 0.0;
		ui.label("Powered by ");
		ui.hyperlink_to("egui", "https://github.com/emilk/egui");
		ui.label(" and ");
		ui.hyperlink_to(
			"eframe",
			"https://github.com/emilk/egui/tree/master/crates/eframe"
		);
		ui.label(" and ");
		ui.hyperlink_to("erust", "https://github.com/kbve/kbve/");
		ui.label(".");
	});
}

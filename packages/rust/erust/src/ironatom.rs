use crate::applicationstate::AppState;

#[derive(serde::Deserialize, serde::Serialize)]
#[serde(default)]
pub struct TemplateApp {
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
	pub fn new(cc: &eframe::CreationContext<'_>) -> Self {
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
	fn save(&mut self, storage: &mut dyn eframe::Storage) {
		self.state.save(storage);
	}

	fn update(&mut self, ctx: &egui::Context, _frame: &mut eframe::Frame) {
		egui::TopBottomPanel::top("top_panel").show(ctx, |ui| {
			egui::MenuBar::new().ui(ui, |ui| {
				let is_web = cfg!(target_arch = "wasm32");
				if !is_web {
					ui.menu_button("File", |ui| {
						if ui.button("Quit").clicked() {
							ctx.send_viewport_cmd(egui::ViewportCommand::Close);
						}
					});
					ui.add_space(16.0);
				}

				egui::widgets::global_theme_preference_buttons(ui);
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

			if ui.checkbox(&mut self.state.is_dark_mode, " 🌙 Dark Mode ").changed() {
				if self.state.is_dark_mode {
					ctx.set_visuals(egui::Visuals::dark());
				} else {
					ctx.set_visuals(egui::Visuals::light());
				}
			}
		});

		egui::CentralPanel::default().show(ctx, |ui| {
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

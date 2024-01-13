use erust::applicationstate::AppState;

use log::{ info, warn };

#[derive(serde::Deserialize, serde::Serialize)]
#[serde(default)]
pub struct RustWasmEmbedApp {
	state: AppState, // State
}

impl Default for RustWasmEmbedApp {
	fn default() -> Self {
		Self {
			state: AppState::default(),
		}
	}
}

impl RustWasmEmbedApp {
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

impl eframe::App for RustWasmEmbedApp {
	/// Called by the frame work to save state before shutdown.

	fn save(&mut self, storage: &mut dyn eframe::Storage) {
		self.state.save(storage);
	}

	/// Called each time the UI needs repainting, which may be many times per second.
	fn update(&mut self, ctx: &egui::Context, _frame: &mut eframe::Frame) {
		// Put your widgets into a `SidePanel`, `TopBottomPanel`, `CentralPanel`, `Window` or `Area`.
		// For inspiration and more examples, go to https://emilk.github.io/egui

		// let url = "https://kbve.com/assets/img/curved-images/wave.jpg".to_string();
		// self.state.start_image_loading(ctx, url);

		if !self.state.is_image_loaded {
			// Call load_image only once
			let base64_string =
				"";
			//self.state.load_image(ctx, "https://rareicon.com/assets/images/nextjs-landing-page-banner.png");
			self.state.load_image_from_base64(ctx, base64_string);
			// Mark the image as being loaded
			self.state.is_image_loaded = true;
		}

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
				if erust::widgets::dark_mode_widget(ui, &mut self.state) {
					// If state changed, save the updated state
					if let Some(storage) = _frame.storage_mut() {
						self.state.save(storage);
					}
				}
			});

			ui.add_space(16.0);
		});

		egui::SidePanel::left("side_panel").show(ctx, |ui| {
			ui.heading("Side Panel");
			ui.horizontal(|ui| {
				ui.label("Adjust value: ");
				if ui.button("Increment").clicked() {
					self.state.value += 1.0;
				}
			});

			ui.add_space(5.0);

			// Add more widgets here as needed
			if ui.button("Save State").clicked() {
				// Check if storage is available and get a mutable reference
				if let Some(storage) = _frame.storage_mut() {
					// Now storage is a mutable reference
					self.state.save(storage);
				}
			}

			// Bottom Up UI Approach

			ui.with_layout(egui::Layout::bottom_up(egui::Align::Min), |ui| {
				//  Dark / Light

				if erust::widgets::dark_mode_widget(ui, &mut self.state) {
					// If state changed, save the updated state
					if let Some(storage) = _frame.storage_mut() {
						self.state.save(storage);
					}
				}
			});
		});

		egui::CentralPanel::default().show(ctx, |ui| {
			// let size = ui.available_size();
			// let rect = egui::Rect::from_min_size(ui.min_rect().min, size);

			// if let Some(texture_handle) = self.state.image_texture.lock().unwrap().as_ref() {
			//     // Paint the image directly onto the canvas as a background
			//     ui.painter().rect_filled(rect, 0.0, egui::Color32::WHITE); // Background color (optional)
			//     ui.painter().add(egui::Shape::image(
			//         texture_handle.id(),
			//         rect,
			//         rect, // Use the same rect for UV to draw the whole image
			//         egui::Color32::BLACK,
			//     ));
			// }

			// let size = ui.available_size();
			// let (_, painter) = ui.allocate_painter(size, egui::Sense::hover());

			// if let Some(texture_handle) = self.state.image_texture.lock().unwrap().as_ref() {
			//     let rect = egui::Rect::from_min_size(egui::pos2(0.0, 0.0), size);
			//     painter.rect_filled(rect, 0.0, egui::Color32::WHITE); // Optional background color
			//     painter.image(texture_handle.id(), rect, rect, egui::Color32::WHITE); // Draw the image
			// }

			//	Header for the Applications
			ui.heading("eRust");

			// The central panel the region left after adding TopPanel's and SidePanel's

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

		

			ui.with_layout(egui::Layout::bottom_up(egui::Align::LEFT), |ui| {
				erust::ironatom::powered_by_egui_and_eframe(ui);
				egui::warn_if_debug_build(ui);
				ui.add(
					egui::github_link_file!(
						"https://github.com/kbve/kbve/blob/main/",
						"Source code."
					)
				);
			});
		});
	}
}

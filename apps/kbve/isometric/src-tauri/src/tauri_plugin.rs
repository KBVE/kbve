// Desktop-only: Tauri plugin and custom runner
#[cfg(not(target_arch = "wasm32"))]
mod desktop {
    use crate::AVERAGE_FRAME_RATE;
    use bevy::app::{App, AppExit, Plugin};
    use std::cell::RefCell;
    use std::rc::Rc;
    use std::sync::Mutex;
    use std::sync::atomic::Ordering;
    use std::time::{Duration, Instant};
    use tauri::RunEvent;

    type BuilderFn =
        Box<dyn FnOnce(tauri::Builder<tauri::Wry>) -> tauri::Builder<tauri::Wry> + Send>;

    pub struct TauriPlugin {
        builder_fn: Mutex<Option<BuilderFn>>,
    }

    impl TauriPlugin {
        pub fn new<F>(builder_fn: F) -> Self
        where
            F: FnOnce(tauri::Builder<tauri::Wry>) -> tauri::Builder<tauri::Wry> + Send + 'static,
        {
            Self {
                builder_fn: Mutex::new(Some(Box::new(builder_fn))),
            }
        }
    }

    impl Plugin for TauriPlugin {
        fn build(&self, app: &mut App) {
            let builder_fn = self
                .builder_fn
                .lock()
                .unwrap()
                .take()
                .expect("TauriPlugin::build called twice");

            let configured_builder = builder_fn(tauri::Builder::default());

            let tauri_app = configured_builder
                .build(tauri::generate_context!())
                .expect("error while building tauri application");

            app.insert_non_send_resource(TauriAppResource(Some(tauri_app)));
            app.set_runner(run_tauri_app);
        }
    }

    struct TauriAppResource(Option<tauri::App>);

    fn run_tauri_app(app: App) -> AppExit {
        let app = Rc::new(RefCell::new(app));
        let app_clone = app.clone();

        let mut tauri_app = {
            let mut app_ref = app_clone.borrow_mut();
            let resource = app_ref
                .world_mut()
                .remove_non_send_resource::<TauriAppResource>()
                .expect("TauriAppResource missing");
            resource.0.expect("Tauri app already consumed")
        };

        let target_frame_duration = Duration::from_secs_f64(1.0 / 60.0);
        let mut frame_count: usize = 0;
        let mut last_fps_update = Instant::now();

        loop {
            let frame_start = Instant::now();

            let exit_requested = Rc::new(RefCell::new(false));
            let exit_clone = exit_requested.clone();

            #[allow(deprecated)]
            tauri_app.run_iteration(move |_app_handle, event| {
                if matches!(
                    event,
                    RunEvent::ExitRequested { .. }
                        | RunEvent::WindowEvent {
                            event: tauri::WindowEvent::CloseRequested { .. },
                            ..
                        }
                ) {
                    *exit_clone.borrow_mut() = true;
                }
            });

            if *exit_requested.borrow() {
                break;
            }

            app.borrow_mut().update();

            frame_count += 1;
            if last_fps_update.elapsed() >= Duration::from_secs(1) {
                AVERAGE_FRAME_RATE.store(frame_count, Ordering::Relaxed);
                frame_count = 0;
                last_fps_update = Instant::now();
            }

            let elapsed = frame_start.elapsed();
            if elapsed < target_frame_duration {
                std::thread::sleep(target_frame_duration - elapsed);
            }
        }

        AppExit::Success
    }
}

#[cfg(not(target_arch = "wasm32"))]
pub use desktop::TauriPlugin;

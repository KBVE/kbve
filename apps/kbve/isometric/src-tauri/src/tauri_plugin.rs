// Desktop-only: Tauri plugin with shared-window Bevy rendering
#[cfg(not(target_arch = "wasm32"))]
mod desktop {
    use crate::AVERAGE_FRAME_RATE;
    use bevy::app::{App, AppExit, Plugin, PluginsState};
    use bevy::prelude::*;
    use bevy::window::{RawHandleWrapper, WindowWrapper};
    use std::cell::RefCell;
    use std::rc::Rc;
    use std::sync::Mutex;
    use std::sync::atomic::Ordering;
    use std::time::{Duration, Instant};
    use tauri::{Manager, RunEvent};

    use crate::game::pixelate::PixelatePlugin;
    use crate::renderer::CustomRendererPlugin;

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

            app.insert_non_send_resource(tauri_app.handle().clone());
            app.insert_non_send_resource(TauriAppResource(Some(tauri_app)));
            app.add_systems(Startup, create_window_handle);
            app.set_runner(run_tauri_app);
        }
    }

    struct TauriAppResource(Option<tauri::App>);

    /// Attaches the Tauri webview's raw window handle to the Bevy Window entity
    /// so Bevy's render pipeline can create a wgpu surface for it.
    fn create_window_handle(
        mut commands: Commands,
        windows: Query<Entity, With<bevy::window::PrimaryWindow>>,
        tauri_handle: NonSend<tauri::AppHandle>,
    ) {
        let tauri_window = tauri_handle.get_webview_window("main").unwrap();
        let window_wrapper = WindowWrapper::new(tauri_window);
        if let Ok(raw_handle) = RawHandleWrapper::new(&window_wrapper) {
            if let Ok(entity) = windows.single() {
                commands.entity(entity).insert(raw_handle);
            }
        }
    }

    fn run_tauri_app(app: App) -> AppExit {
        let app = Rc::new(RefCell::new(app));

        let mut tauri_app = {
            let mut app_ref = app.borrow_mut();
            app_ref
                .world_mut()
                .remove_non_send_resource::<TauriAppResource>()
                .expect("TauriAppResource missing")
                .0
                .expect("Tauri app already consumed")
        };

        let target_frame_duration = Duration::from_secs_f64(1.0 / 60.0);
        let mut frame_count: usize = 0;
        let mut last_fps_update = Instant::now();

        loop {
            let frame_start = Instant::now();
            let exit_requested = Rc::new(RefCell::new(false));

            {
                let exit_clone = exit_requested.clone();
                let app_clone = app.clone();

                #[allow(deprecated)]
                tauri_app.run_iteration(move |app_handle, event| match &event {
                    RunEvent::Ready => {
                        handle_ready_event(app_handle, &mut app_clone.borrow_mut());
                    }
                    RunEvent::WindowEvent {
                        event: win_event, ..
                    } => {
                        handle_window_event(win_event, &mut app_clone.borrow_mut());
                    }
                    RunEvent::ExitRequested { .. } => {
                        *exit_clone.borrow_mut() = true;
                    }
                    _ => {}
                });
            }

            if *exit_requested.borrow() || tauri_app.webview_windows().is_empty() {
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

    /// Called once when Tauri's Ready event fires. Adds all render-dependent
    /// plugins now that the webview window is guaranteed valid.
    fn handle_ready_event(app_handle: &tauri::AppHandle, app: &mut App) {
        if app.plugins_state() == PluginsState::Cleaned {
            return;
        }

        let window = app_handle.get_webview_window("main").unwrap();

        // GPU initialization from the webview window surface
        app.add_plugins(CustomRendererPlugin {
            webview_window: window,
        });

        // Render-dependent Bevy plugins (must be added after RenderPlugin)
        app.add_plugins((
            bevy::image::ImagePlugin::default(),
            bevy::mesh::MeshPlugin,
            bevy::camera::CameraPlugin,
            bevy::light::LightPlugin,
            bevy::core_pipeline::CorePipelinePlugin,
            bevy::sprite::SpritePlugin,
            bevy::text::TextPlugin,
            bevy::ui::UiPlugin,
            bevy::pbr::PbrPlugin::default(),
            bevy::gizmos::GizmoPlugin,
        ));

        // Game plugin with render dependency (FullscreenMaterialPlugin needs RenderApp)
        app.add_plugins(PixelatePlugin);

        // Debug render for avian3d physics
        app.add_plugins(avian3d::prelude::PhysicsDebugPlugin::default());

        // Wait for all plugins to finish async initialization
        while app.plugins_state() != PluginsState::Ready {
            bevy::tasks::tick_global_task_pools_on_main_thread();
        }
        app.finish();
        app.cleanup();
    }

    /// Forward Tauri window events to Bevy.
    fn handle_window_event(event: &tauri::WindowEvent, app: &mut App) {
        if let tauri::WindowEvent::Resized(size) = event {
            let world = app.world_mut();
            let mut query = world.query::<&mut bevy::window::Window>();
            for mut window in query.iter_mut(world) {
                window.resolution.set(size.width as f32, size.height as f32);
            }
        }
    }
}

#[cfg(not(target_arch = "wasm32"))]
pub use desktop::TauriPlugin;

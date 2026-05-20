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

    use crate::renderer::CustomRendererPlugin;

    type BuilderFn =
        Box<dyn FnOnce(tauri::Builder<tauri::Wry>) -> tauri::Builder<tauri::Wry> + Send>;
    type PostRenderFn = Box<dyn FnOnce(&mut App) + Send>;

    pub struct TauriPlugin {
        builder_fn: Mutex<Option<BuilderFn>>,
        post_render_fn: Mutex<Option<PostRenderFn>>,
    }

    impl TauriPlugin {
        pub fn new<F>(builder_fn: F) -> Self
        where
            F: FnOnce(tauri::Builder<tauri::Wry>) -> tauri::Builder<tauri::Wry> + Send + 'static,
        {
            Self {
                builder_fn: Mutex::new(Some(Box::new(builder_fn))),
                post_render_fn: Mutex::new(None),
            }
        }

        /// Register a closure that adds render-dependent plugins (materials,
        /// shaders, pixelate, game plugins that allocate Shader handles) once
        /// Tauri's webview surface exists and RenderPlugin has been installed.
        pub fn with_post_render_setup<F>(self, f: F) -> Self
        where
            F: FnOnce(&mut App) + Send + 'static,
        {
            *self.post_render_fn.lock().unwrap() = Some(Box::new(f));
            self
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
            if let Some(post_render) = self.post_render_fn.lock().unwrap().take() {
                app.insert_non_send_resource(PostRenderSetup(Some(post_render)));
            }
            app.add_systems(Startup, create_window_handle);
            app.set_runner(run_tauri_app);
        }
    }

    struct TauriAppResource(Option<tauri::App>);
    struct PostRenderSetup(Option<PostRenderFn>);

    /// Attaches the Tauri webview's raw window handle to the Bevy Window entity
    /// so Bevy's render pipeline can create a wgpu surface for it.
    fn create_window_handle(
        mut commands: Commands,
        mut windows: Query<(Entity, &mut bevy::window::Window), With<bevy::window::PrimaryWindow>>,
        tauri_handle: NonSend<tauri::AppHandle>,
    ) {
        let tauri_window = tauri_handle.get_webview_window("main").unwrap();
        let inner = tauri_window.inner_size().ok();
        let scale = tauri_window.scale_factor().ok().unwrap_or(1.0) as f32;
        let window_wrapper = WindowWrapper::new(tauri_window);
        if let Ok(raw_handle) = RawHandleWrapper::new(&window_wrapper) {
            if let Ok((entity, mut window)) = windows.single_mut() {
                if let Some(size) = inner {
                    window.resolution.set(size.width as f32, size.height as f32);
                    window.resolution.set_scale_factor(scale);
                }
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

            // Forward Bevy AppExit messages (e.g. title/pause Exit buttons)
            // to the Tauri runtime so the OS window actually closes.
            {
                let mut app_ref = app.borrow_mut();
                let world = app_ref.world_mut();
                let messages = world.resource::<bevy::ecs::message::Messages<AppExit>>();
                let mut reader = messages.get_cursor();
                if reader.read(messages).next().is_some() {
                    tauri_app.handle().exit(0);
                    break;
                }
            }

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
            bevy::sprite_render::SpriteRenderPlugin,
            bevy::text::TextPlugin,
            bevy::ui::UiPlugin,
            bevy::ui_render::UiRenderPlugin,
            bevy::pbr::PbrPlugin::default(),
            bevy::gizmos::GizmoPlugin,
        ));

        let post_render = app
            .world_mut()
            .remove_non_send_resource::<PostRenderSetup>()
            .and_then(|mut h| h.0.take());
        if let Some(setup) = post_render {
            setup(app);
        }

        while app.plugins_state() != PluginsState::Ready {
            bevy::tasks::tick_global_task_pools_on_main_thread();
        }
        app.finish();
        app.cleanup();
    }

    /// Forward Tauri window-level events. Mouse + keyboard are NOT visible
    /// here — Tauri's WindowEvent enum only exposes high-level lifecycle
    /// events (resize, focus, scale change) because the webview consumes the
    /// raw pointer/key stream. Native input forwarding lives in
    /// `crate::commands::forward_pointer_event` etc., which JS captures off
    /// the webview's DOM and invokes via tauri::generate_handler!.
    fn handle_window_event(_event: &tauri::WindowEvent, _app: &mut App) {
        // JS `forward_viewport` (fired on `window.resize`) is the authoritative
        // source for the Bevy Window's logical dimensions. Tauri's Resized
        // event reports raw NSView/winit units that disagree with what JS sees
        // on macOS, so writing them back here causes a brief but visible
        // cursor↔button misalignment after every resize.
    }
}

#[cfg(not(target_arch = "wasm32"))]
pub use desktop::TauriPlugin;

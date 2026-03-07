use bevy::app::{App, AppExit, Plugin};
use bevy::window::{WindowResized, WindowScaleFactorChanged};
use std::cell::RefCell;
use std::rc::Rc;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::time::{Duration, Instant};
use tauri::{Manager, RunEvent, WebviewWindow};

pub static AVERAGE_FRAME_RATE: AtomicUsize = AtomicUsize::new(0);

pub struct TauriPlugin {
    setup: Box<dyn Fn() -> tauri::App + Send + Sync>,
}

impl TauriPlugin {
    pub fn new<F>(setup: F) -> Self
    where
        F: Fn() -> tauri::App + Send + Sync + 'static,
    {
        Self {
            setup: Box::new(setup),
        }
    }
}

impl Plugin for TauriPlugin {
    fn build(&self, app: &mut App) {
        let tauri_app = (self.setup)();
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

        // Process Tauri events
        let exit_requested = Rc::new(RefCell::new(false));
        let exit_clone = exit_requested.clone();
        let app_for_event = app.clone();

        tauri_app.run_iteration(move |_app_handle, event| {
            handle_tauri_events(&app_for_event, event, &exit_clone);
        });

        if *exit_requested.borrow() {
            break;
        }

        // Update Bevy
        app.borrow_mut().update();

        // FPS tracking
        frame_count += 1;
        if last_fps_update.elapsed() >= Duration::from_secs(1) {
            AVERAGE_FRAME_RATE.store(frame_count, Ordering::Relaxed);
            frame_count = 0;
            last_fps_update = Instant::now();
        }

        // Frame rate limiter
        let elapsed = frame_start.elapsed();
        if elapsed < target_frame_duration {
            std::thread::sleep(target_frame_duration - elapsed);
        }
    }

    AppExit::Success
}

fn handle_tauri_events(
    app: &Rc<RefCell<App>>,
    event: RunEvent,
    exit_requested: &Rc<RefCell<bool>>,
) {
    match event {
        RunEvent::Ready => {
            handle_ready_event(app);
        }
        RunEvent::WindowEvent {
            event: tauri::WindowEvent::Resized(size),
            ..
        } => {
            let mut app_ref = app.borrow_mut();
            app_ref.world_mut().send_event(WindowResized {
                window: bevy::ecs::entity::Entity::PLACEHOLDER,
                width: size.width as f32,
                height: size.height as f32,
            });
        }
        RunEvent::WindowEvent {
            event: tauri::WindowEvent::ScaleFactorChanged { scale_factor, .. },
            ..
        } => {
            let mut app_ref = app.borrow_mut();
            app_ref.world_mut().send_event(WindowScaleFactorChanged {
                window: bevy::ecs::entity::Entity::PLACEHOLDER,
                scale_factor,
            });
        }
        RunEvent::WindowEvent {
            event: tauri::WindowEvent::CloseRequested { .. },
            ..
        } => {
            *exit_requested.borrow_mut() = true;
        }
        RunEvent::ExitRequested { .. } => {
            *exit_requested.borrow_mut() = true;
        }
        _ => {}
    }
}

fn handle_ready_event(app: &Rc<RefCell<App>>) {
    // The ready event fires once Tauri is initialized.
    // Additional rendering setup can be done here if needed.
    let _ = app;
}

/// Helper to get the main webview window from a Tauri app handle.
pub fn get_webview_window(app_handle: &tauri::AppHandle) -> Option<WebviewWindow> {
    app_handle.webview_windows().into_values().next()
}

//! No-tauri mobile entry. Hosts the Bevy game on an externally-provided
//! surface (iOS CAMetalLayer / Android ANativeWindow) handed in as anything
//! implementing `raw-window-handle` 0.6 traits. Mirrors the desktop wiring in
//! `main.rs` (base plugins) + `tauri_plugin::handle_ready_event` (render
//! plugins) + `renderer.rs` (manual wgpu RenderResources), minus Tauri.

use avian3d::prelude::PhysicsPlugins;
use bevy::app::{App, PluginsState};
use bevy::prelude::*;
use bevy::render::RenderPlugin;
use bevy::render::renderer::{
    RenderAdapter, RenderAdapterInfo, RenderDevice, RenderInstance, RenderQueue, WgpuWrapper,
};
use bevy::render::settings::{RenderCreation, RenderResources};
use bevy::window::{PrimaryWindow, RawHandleWrapper, WindowWrapper};
use raw_window_handle::{HasDisplayHandle, HasWindowHandle};

use crate::game::GamePluginGroup;

/// Opaque game handle returned to the native host. Hides the Bevy `App` type
/// so callers (e.g. `kbve_wgpu`) need not depend on bevy directly.
pub struct GameHandle {
    app: App,
}

#[derive(Resource)]
struct PendingRawHandle(RawHandleWrapper);

#[derive(Resource, Clone, Copy)]
struct SurfaceSize {
    width: u32,
    height: u32,
    scale: f32,
}

/// Build the game `App` bound to a platform surface. The caller drives frames
/// with [`tick`]. `window` must outlive the app (the native view owns the
/// layer/window). `asset_root` is the on-device path to the game assets.
pub fn init_game<W>(window: W, width: u32, height: u32, scale: f32, asset_root: &str) -> GameHandle
where
    W: HasWindowHandle + HasDisplayHandle + Send + Sync + 'static,
{
    // On Android `dirs::data_local_dir()` is read-only; point bevy_db's
    // persistence at the app's writable filesDir (the parent of the extracted
    // asset root). iOS keeps the default sandboxed data dir.
    #[cfg(target_os = "android")]
    if let Some(parent) = std::path::Path::new(asset_root).parent() {
        std::env::set_var("KBVE_BEVY_DB_DIR", parent);
    }

    // GPU init borrows the window before it is moved into the wrapper. The
    // RawHandleWrapper copies the raw handle values, so the wrapper need not
    // outlive this call — the native view owns the underlying layer/window.
    let (device, queue, adapter_info, adapter, instance) = create_render_resources(&window);
    let wrapper = WindowWrapper::new(window);
    let raw_handle =
        RawHandleWrapper::new(&wrapper).expect("failed to extract raw window handle for mobile");

    let mut app = App::new();
    app.insert_resource(ClearColor(Color::srgba(0.0, 0.0, 0.0, 0.0)));
    app.insert_resource(PendingRawHandle(raw_handle));
    app.insert_resource(SurfaceSize {
        width: width.max(1),
        height: height.max(1),
        scale: if scale > 0.0 { scale } else { 1.0 },
    });

    // On Android, Bevy's default asset source is the APK AssetManager reader,
    // which requires the `ANDROID_APP` global only the `#[bevy_main]`
    // NativeActivity entry sets. We host via a plain JNI surface, so register a
    // filesystem reader over the extracted asset_root instead.
    #[cfg(target_os = "android")]
    {
        use bevy::asset::AssetApp;
        let root = asset_root.to_string();
        app.register_asset_source(
            bevy::asset::io::AssetSourceId::Default,
            bevy::asset::io::AssetSourceBuilder::new(move || {
                Box::new(bevy::asset::io::file::FileAssetReader::new(root.clone()))
                    as Box<dyn bevy::asset::io::ErasedAssetReader>
            }),
        );
    }

    app.add_plugins((
        bevy::app::PanicHandlerPlugin,
        bevy::log::LogPlugin::default(),
        bevy::app::TaskPoolPlugin::default(),
        bevy::diagnostic::FrameCountPlugin,
        bevy::time::TimePlugin,
        bevy::transform::TransformPlugin,
        bevy::diagnostic::DiagnosticsPlugin,
        bevy::input::InputPlugin,
        bevy::window::WindowPlugin {
            primary_window: Some(bevy::window::Window {
                title: "KBVE Isometric".to_string(),
                // iOS Metal layers support PostMultiplied (transparent
                // composite over RN); Android Adreno surfaces only advertise
                // Inherit, so let wgpu auto-pick a supported mode there.
                transparent: !cfg!(target_os = "android"),
                composite_alpha_mode: if cfg!(target_os = "android") {
                    bevy::window::CompositeAlphaMode::Auto
                } else {
                    bevy::window::CompositeAlphaMode::PostMultiplied
                },
                ..default()
            }),
            ..default()
        },
        bevy::a11y::AccessibilityPlugin,
        bevy::asset::AssetPlugin {
            file_path: asset_root.to_string(),
            meta_check: bevy::asset::AssetMetaCheck::Never,
            ..default()
        },
        bevy::state::app::StatesPlugin,
    ));
    app.add_plugins(bevy::picking::DefaultPickingPlugins);
    app.add_plugins(bevy::diagnostic::FrameTimeDiagnosticsPlugin::default());

    app.add_plugins(RenderPlugin {
        render_creation: RenderCreation::Manual(RenderResources(
            device,
            queue,
            adapter_info,
            adapter,
            instance,
        )),
        ..default()
    });

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

    app.add_plugins(PhysicsPlugins::default());
    app.add_plugins(GamePluginGroup);

    app.add_systems(Startup, mount_window_handle);

    while app.plugins_state() != PluginsState::Ready {
        bevy::tasks::tick_global_task_pools_on_main_thread();
    }
    app.finish();
    app.cleanup();
    GameHandle { app }
}

/// Advance one frame. Call from CADisplayLink / Choreographer.
pub fn tick(handle: &mut GameHandle) {
    handle.app.update();
}

fn mount_window_handle(
    mut commands: Commands,
    size: Res<SurfaceSize>,
    pending: Option<Res<PendingRawHandle>>,
    mut windows: Query<(Entity, &mut bevy::window::Window), With<PrimaryWindow>>,
) {
    let Some(pending) = pending else {
        return;
    };
    if let Ok((entity, mut window)) = windows.single_mut() {
        window.resolution.set(size.width as f32, size.height as f32);
        window.resolution.set_scale_factor(size.scale);
        commands.entity(entity).insert(pending.0.clone());
    }
    commands.remove_resource::<PendingRawHandle>();
}

type ManualRenderResources = (
    RenderDevice,
    RenderQueue,
    RenderAdapterInfo,
    RenderAdapter,
    RenderInstance,
);

fn create_render_resources<W>(window: &W) -> ManualRenderResources
where
    W: HasWindowHandle + HasDisplayHandle + Send + Sync,
{
    let instance = wgpu::Instance::new(wgpu::InstanceDescriptor {
        backends: wgpu::Backends::all(),
        ..wgpu::InstanceDescriptor::new_without_display_handle()
    });

    let surface = instance
        .create_surface(window)
        .expect("failed to create wgpu surface from mobile window");

    let adapter = pollster::block_on(instance.request_adapter(&wgpu::RequestAdapterOptions {
        power_preference: wgpu::PowerPreference::HighPerformance,
        compatible_surface: Some(&surface),
        force_fallback_adapter: false,
    }))
    .expect("failed to find wgpu adapter");

    let adapter_info = adapter.get_info();

    let (device, queue) = pollster::block_on(adapter.request_device(&wgpu::DeviceDescriptor {
        label: Some("isometric-game-mobile-device"),
        required_features: wgpu::Features::empty(),
        required_limits: adapter.limits(),
        ..Default::default()
    }))
    .expect("failed to create wgpu device");

    drop(surface);

    (
        RenderDevice::from(device),
        RenderQueue(std::sync::Arc::new(WgpuWrapper::new(queue))),
        RenderAdapterInfo(WgpuWrapper::new(adapter_info)),
        RenderAdapter(std::sync::Arc::new(WgpuWrapper::new(adapter))),
        RenderInstance(std::sync::Arc::new(WgpuWrapper::new(instance))),
    )
}

/// Feed the JWT and request an online connection (mirrors the wasm
/// `set_signed_in` path).
pub fn sign_in(jwt: &str) {
    crate::auth_common::record_signin(jwt);
}

/// Connect to the realm server.
pub fn go_online(server_url: &str, jwt: &str) {
    crate::game::net::request_go_online(server_url, jwt);
}

/// Feed a touch/pointer event into the game. `kind`: 0 = down, 1 = move,
/// 2 = up. `x`/`y` are physical pixels (the native_input drain converts them
/// to logical using the window scale factor).
pub fn on_pointer(kind: u32, x: f32, y: f32) {
    use crate::game::native_input::{NativeInputEvent, push_event};
    let (x, y) = (x as f64, y as f64);
    match kind {
        0 => {
            push_event(NativeInputEvent::PointerMove { x, y });
            push_event(NativeInputEvent::PointerButton {
                button: 0,
                pressed: true,
            });
        }
        1 => push_event(NativeInputEvent::PointerMove { x, y }),
        2 => push_event(NativeInputEvent::PointerButton {
            button: 0,
            pressed: false,
        }),
        _ => {}
    }
}

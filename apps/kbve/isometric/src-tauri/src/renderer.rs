use bevy::app::Plugin;
use bevy::render::RenderPlugin;
use bevy::render::renderer::{
    RenderAdapter, RenderAdapterInfo, RenderDevice, RenderInstance, RenderQueue, WgpuWrapper,
};
use bevy::render::settings::RenderCreation;
use tauri::WebviewWindow;

/// Plugin that creates a wgpu surface from a Tauri WebviewWindow
/// and passes it to Bevy's render pipeline.
pub struct CustomRendererPlugin {
    pub webview_window: WebviewWindow,
}

impl Plugin for CustomRendererPlugin {
    fn build(&self, app: &mut bevy::app::App) {
        let instance = wgpu::Instance::new(wgpu::InstanceDescriptor {
            backends: wgpu::Backends::all(),
            ..Default::default()
        });

        let surface = instance
            .create_surface(&self.webview_window)
            .expect("Failed to create wgpu surface from Tauri window");

        let adapter = pollster::block_on(instance.request_adapter(&wgpu::RequestAdapterOptions {
            power_preference: wgpu::PowerPreference::HighPerformance,
            compatible_surface: Some(&surface),
            force_fallback_adapter: false,
        }))
        .expect("Failed to find wgpu adapter");

        let adapter_info = adapter.get_info();

        let (device, queue) = pollster::block_on(adapter.request_device(
            &wgpu::DeviceDescriptor {
                label: Some("isometric-game-device"),
                required_features: wgpu::Features::empty(),
                required_limits: wgpu::Limits::default(),
                ..Default::default()
            },
            None,
        ))
        .expect("Failed to create wgpu device");

        let render_device = RenderDevice::from(device);
        let render_queue = RenderQueue(std::sync::Arc::new(WgpuWrapper::new(queue)));
        let render_adapter = RenderAdapter(std::sync::Arc::new(WgpuWrapper::new(adapter)));
        let render_adapter_info = RenderAdapterInfo(WgpuWrapper::new(adapter_info));
        let render_instance = RenderInstance(std::sync::Arc::new(WgpuWrapper::new(instance)));

        app.add_plugins(RenderPlugin {
            render_creation: RenderCreation::Manual(
                render_device,
                render_queue,
                render_adapter_info,
                render_adapter,
                render_instance,
            ),
            ..Default::default()
        });
    }
}

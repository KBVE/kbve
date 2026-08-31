pub mod ffi;
pub mod handle;
pub mod renderer;

pub use ffi::{FfiInputEvent, WgpuSurface};
pub use handle::{SurfaceKind, SurfaceSource};
pub use renderer::{InputEvent, SurfaceRenderer};

// The `android-activity` `native-activity` backend (pulled by bevy_winit on
// Android, even though we never add WinitPlugin) leaves `android_main`
// undefined — the app entry a NativeActivity would call. Android links the
// `.so` with full RELRO, so an undefined symbol fails `dlopen`. We load the
// lib as a plain JNI library, never as a NativeActivity, so a no-op stub just
// satisfies the linker; it is never called.
#[cfg(all(target_os = "android", feature = "bevy"))]
#[no_mangle]
pub extern "C" fn android_main() {}

#[cfg(target_os = "android")]
mod android_jni {
    use crate::ffi::{kbve_wgpu_create, kbve_wgpu_destroy, kbve_wgpu_render, kbve_wgpu_resize};
    use crate::handle::SurfaceKind;
    use jni::JNIEnv;
    use jni::objects::JObject;
    use jni::sys::{jint, jlong};

    fn native_window(env: &JNIEnv, surface: &JObject) -> *mut std::ffi::c_void {
        unsafe {
            ndk_sys::ANativeWindow_fromSurface(env.get_raw() as *mut _, surface.as_raw() as *mut _)
                as *mut _
        }
    }

    #[no_mangle]
    pub extern "system" fn Java_expo_modules_kbvewgpu_KbveWgpuView_nativeCreate(
        env: JNIEnv,
        _class: JObject,
        surface: JObject,
        width: jint,
        height: jint,
    ) -> jlong {
        android_logger::init_once(
            android_logger::Config::default().with_max_level(log::LevelFilter::Info),
        );
        let window = native_window(&env, &surface);
        if window.is_null() {
            return 0;
        }
        let ptr = unsafe {
            kbve_wgpu_create(
                window,
                SurfaceKind::AndroidNativeWindow as u32,
                width as u32,
                height as u32,
            )
        };
        ptr as jlong
    }

    #[cfg(feature = "bevy")]
    #[no_mangle]
    pub extern "system" fn Java_expo_modules_kbvewgpu_KbveWgpuView_nativeCreateGame(
        mut env: JNIEnv,
        _class: JObject,
        surface: JObject,
        width: jint,
        height: jint,
        asset_root: jni::objects::JString,
    ) -> jlong {
        android_logger::init_once(
            android_logger::Config::default().with_max_level(log::LevelFilter::Info),
        );
        let window = native_window(&env, &surface);
        if window.is_null() {
            return 0;
        }
        let root: String = env
            .get_string(&asset_root)
            .map(|s| s.into())
            .unwrap_or_default();
        let bytes = root.as_bytes();
        let ptr = unsafe {
            crate::ffi::kbve_wgpu_create_game(
                window,
                SurfaceKind::AndroidNativeWindow as u32,
                width as u32,
                height as u32,
                bytes.as_ptr(),
                bytes.len(),
            )
        };
        ptr as jlong
    }

    #[no_mangle]
    pub extern "system" fn Java_expo_modules_kbvewgpu_KbveWgpuView_nativeRender(
        _env: JNIEnv,
        _class: JObject,
        ptr: jlong,
    ) -> jint {
        unsafe { kbve_wgpu_render(ptr as *mut _) as jint }
    }

    #[no_mangle]
    pub extern "system" fn Java_expo_modules_kbvewgpu_KbveWgpuView_nativeInput(
        _env: JNIEnv,
        _class: JObject,
        ptr: jlong,
        kind: jint,
        x: f32,
        y: f32,
        id: jint,
    ) {
        unsafe {
            crate::ffi::kbve_wgpu_input(
                ptr as *mut _,
                crate::ffi::FfiInputEvent {
                    kind: kind as u32,
                    x,
                    y,
                    id: id as u32,
                },
            )
        }
    }

    #[no_mangle]
    pub extern "system" fn Java_expo_modules_kbvewgpu_KbveWgpuView_nativeResize(
        _env: JNIEnv,
        _class: JObject,
        ptr: jlong,
        width: jint,
        height: jint,
    ) {
        unsafe { kbve_wgpu_resize(ptr as *mut _, width as u32, height as u32) }
    }

    #[no_mangle]
    pub extern "system" fn Java_expo_modules_kbvewgpu_KbveWgpuView_nativeDestroy(
        _env: JNIEnv,
        _class: JObject,
        ptr: jlong,
    ) {
        unsafe { kbve_wgpu_destroy(ptr as *mut _) }
    }
}

#[cfg(test)]
mod tests {
    const TEST_SHADER: &str = r#"
@vertex
fn vs_main(@builtin(vertex_index) i: u32) -> @builtin(position) vec4<f32> {
    var p = array<vec2<f32>, 3>(
        vec2<f32>( 0.0,  0.9),
        vec2<f32>(-0.9, -0.9),
        vec2<f32>( 0.9, -0.9),
    );
    return vec4<f32>(p[i], 0.0, 1.0);
}
@fragment
fn fs_main() -> @location(0) vec4<f32> {
    return vec4<f32>(1.0, 0.0, 0.0, 1.0);
}
"#;

    #[test]
    fn renders_clear_and_triangle_offscreen() {
        let instance = wgpu::Instance::new(wgpu::InstanceDescriptor {
            backends: wgpu::Backends::all(),
            ..wgpu::InstanceDescriptor::new_without_display_handle()
        });
        let adapter =
            match pollster::block_on(instance.request_adapter(&wgpu::RequestAdapterOptions {
                power_preference: wgpu::PowerPreference::HighPerformance,
                compatible_surface: None,
                force_fallback_adapter: false,
            })) {
                Ok(adapter) => adapter,
                Err(_) => return,
            };
        let (device, queue) = pollster::block_on(adapter.request_device(&wgpu::DeviceDescriptor {
            label: Some("kbve-wgpu-test"),
            required_features: wgpu::Features::empty(),
            required_limits: wgpu::Limits::downlevel_defaults(),
            ..Default::default()
        }))
        .expect("device");

        let size = 64u32;
        let format = wgpu::TextureFormat::Rgba8Unorm;
        let texture = device.create_texture(&wgpu::TextureDescriptor {
            label: Some("target"),
            size: wgpu::Extent3d {
                width: size,
                height: size,
                depth_or_array_layers: 1,
            },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format,
            usage: wgpu::TextureUsages::RENDER_ATTACHMENT | wgpu::TextureUsages::COPY_SRC,
            view_formats: &[],
        });
        let view = texture.create_view(&wgpu::TextureViewDescriptor::default());

        let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("test-shader"),
            source: wgpu::ShaderSource::Wgsl(TEST_SHADER.into()),
        });
        let layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: None,
            bind_group_layouts: &[],
            immediate_size: 0,
        });
        let pipeline = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: None,
            layout: Some(&layout),
            vertex: wgpu::VertexState {
                module: &shader,
                entry_point: Some("vs_main"),
                buffers: &[],
                compilation_options: Default::default(),
            },
            fragment: Some(wgpu::FragmentState {
                module: &shader,
                entry_point: Some("fs_main"),
                targets: &[Some(format.into())],
                compilation_options: Default::default(),
            }),
            primitive: wgpu::PrimitiveState::default(),
            depth_stencil: None,
            multisample: wgpu::MultisampleState::default(),
            multiview_mask: None,
            cache: None,
        });

        let bytes_per_row = size * 4;
        let buffer = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("readback"),
            size: (bytes_per_row * size) as u64,
            usage: wgpu::BufferUsages::COPY_DST | wgpu::BufferUsages::MAP_READ,
            mapped_at_creation: false,
        });

        let mut encoder =
            device.create_command_encoder(&wgpu::CommandEncoderDescriptor { label: None });
        {
            let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: None,
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: &view,
                    resolve_target: None,
                    ops: wgpu::Operations {
                        load: wgpu::LoadOp::Clear(wgpu::Color::BLACK),
                        store: wgpu::StoreOp::Store,
                    },
                    depth_slice: None,
                })],
                depth_stencil_attachment: None,
                timestamp_writes: None,
                occlusion_query_set: None,
                multiview_mask: None,
            });
            pass.set_pipeline(&pipeline);
            pass.draw(0..3, 0..1);
        }
        encoder.copy_texture_to_buffer(
            wgpu::TexelCopyTextureInfo {
                texture: &texture,
                mip_level: 0,
                origin: wgpu::Origin3d::ZERO,
                aspect: wgpu::TextureAspect::All,
            },
            wgpu::TexelCopyBufferInfo {
                buffer: &buffer,
                layout: wgpu::TexelCopyBufferLayout {
                    offset: 0,
                    bytes_per_row: Some(bytes_per_row),
                    rows_per_image: Some(size),
                },
            },
            wgpu::Extent3d {
                width: size,
                height: size,
                depth_or_array_layers: 1,
            },
        );
        queue.submit(Some(encoder.finish()));

        let slice = buffer.slice(..);
        slice.map_async(wgpu::MapMode::Read, |_| {});
        device
            .poll(wgpu::PollType::Wait {
                submission_index: None,
                timeout: None,
            })
            .expect("poll");
        let data = slice.get_mapped_range();

        let center = ((size / 2 * size + size / 2) * 4) as usize;
        assert!(data[center] > 200, "triangle center should be red");
        assert!(data[1] < 60, "top-left should be cleared black");
    }
}

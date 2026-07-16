use std::ffi::c_void;
use std::ptr;

use crate::handle::{SurfaceKind, SurfaceSource};
use crate::renderer::triangle::TriangleRenderer;
use crate::renderer::{InputEvent, SurfaceRenderer};

pub struct WgpuSurface {
    renderer: Box<dyn SurfaceRenderer>,
}

#[repr(C)]
#[derive(Clone, Copy)]
pub struct FfiInputEvent {
    pub kind: u32,
    pub x: f32,
    pub y: f32,
    pub id: u32,
}

#[repr(i32)]
pub enum RenderStatus {
    Ok = 0,
    SurfaceLost = 1,
    Error = 2,
}

/// # Safety
/// `raw` must be a valid pointer for `kind` (CAMetalLayer* / ANativeWindow*).
/// Returns null on failure; the returned pointer must be freed with
/// `kbve_wgpu_destroy`.
#[no_mangle]
pub unsafe extern "C" fn kbve_wgpu_create(
    raw: *mut c_void,
    kind: u32,
    width: u32,
    height: u32,
) -> *mut WgpuSurface {
    let Some(kind) = SurfaceKind::from_u32(kind) else {
        return ptr::null_mut();
    };
    if raw.is_null() {
        return ptr::null_mut();
    }
    let source = SurfaceSource::new(raw, kind);
    match TriangleRenderer::new(source, width, height) {
        Ok(renderer) => Box::into_raw(Box::new(WgpuSurface {
            renderer: Box::new(renderer),
        })),
        Err(err) => {
            log::error!("kbve_wgpu_create failed: {err}");
            ptr::null_mut()
        }
    }
}

/// Create a surface that hosts the Bevy game engine instead of the triangle.
///
/// # Safety
/// Same pointer contract as [`kbve_wgpu_create`].
#[cfg(feature = "bevy")]
#[no_mangle]
pub unsafe extern "C" fn kbve_wgpu_create_game(
    raw: *mut c_void,
    kind: u32,
    width: u32,
    height: u32,
    asset_root: *const u8,
    asset_root_len: usize,
) -> *mut WgpuSurface {
    let Some(kind) = SurfaceKind::from_u32(kind) else {
        return ptr::null_mut();
    };
    if raw.is_null() {
        return ptr::null_mut();
    }
    let asset_root = if asset_root.is_null() || asset_root_len == 0 {
        "assets".to_string()
    } else {
        let bytes = std::slice::from_raw_parts(asset_root, asset_root_len);
        std::str::from_utf8(bytes).unwrap_or("assets").to_string()
    };
    let window = crate::handle::MobileWindow::new(raw, kind);
    match crate::renderer::bevy::BevyRenderer::with_assets(window, width, height, &asset_root) {
        Ok(renderer) => Box::into_raw(Box::new(WgpuSurface {
            renderer: Box::new(renderer),
        })),
        Err(err) => {
            log::error!("kbve_wgpu_create_game failed: {err}");
            ptr::null_mut()
        }
    }
}

/// # Safety
/// `surface` must be a live pointer from `kbve_wgpu_create`.
#[no_mangle]
pub unsafe extern "C" fn kbve_wgpu_resize(surface: *mut WgpuSurface, width: u32, height: u32) {
    let Some(surface) = surface.as_mut() else {
        return;
    };
    surface.renderer.resize(width, height);
}

/// # Safety
/// `surface` must be a live pointer from `kbve_wgpu_create`.
#[no_mangle]
pub unsafe extern "C" fn kbve_wgpu_render(surface: *mut WgpuSurface) -> i32 {
    let Some(surface) = surface.as_mut() else {
        return RenderStatus::Error as i32;
    };
    match surface.renderer.render() {
        Ok(()) => RenderStatus::Ok as i32,
        Err(crate::renderer::RenderError::SurfaceLost) => RenderStatus::SurfaceLost as i32,
        Err(err) => {
            log::warn!("kbve_wgpu_render: {err}");
            RenderStatus::Error as i32
        }
    }
}

/// # Safety
/// `surface` must be a live pointer from `kbve_wgpu_create`.
#[no_mangle]
pub unsafe extern "C" fn kbve_wgpu_pause(surface: *mut WgpuSurface, paused: bool) {
    if let Some(surface) = surface.as_mut() {
        surface.renderer.set_paused(paused);
    }
}

/// # Safety
/// `surface` must be a live pointer from `kbve_wgpu_create`.
#[no_mangle]
pub unsafe extern "C" fn kbve_wgpu_input(surface: *mut WgpuSurface, event: FfiInputEvent) {
    if let Some(surface) = surface.as_mut() {
        surface.renderer.input(InputEvent {
            kind: event.kind,
            x: event.x,
            y: event.y,
            id: event.id,
        });
    }
}

/// # Safety
/// `surface` must be live; `jwt` must point to `len` valid UTF-8 bytes.
#[no_mangle]
pub unsafe extern "C" fn kbve_wgpu_set_jwt(surface: *mut WgpuSurface, jwt: *const u8, len: usize) {
    let Some(surface) = surface.as_mut() else {
        return;
    };
    if jwt.is_null() {
        return;
    }
    let bytes = std::slice::from_raw_parts(jwt, len);
    if let Ok(token) = std::str::from_utf8(bytes) {
        surface.renderer.set_jwt(token);
    }
}

/// # Safety
/// `surface` must be a pointer from `kbve_wgpu_create`, not previously freed.
#[no_mangle]
pub unsafe extern "C" fn kbve_wgpu_destroy(surface: *mut WgpuSurface) {
    if !surface.is_null() {
        drop(Box::from_raw(surface));
    }
}

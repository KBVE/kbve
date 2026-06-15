use std::ffi::c_void;

#[derive(Clone, Copy, Debug)]
pub enum SurfaceKind {
    MetalLayer = 0,
    AndroidNativeWindow = 1,
    /// iOS `UIView*` — required by engines (Bevy) that mount a window handle
    /// and let wgpu attach its own CAMetalLayer.
    UiView = 2,
}

impl SurfaceKind {
    pub fn from_u32(value: u32) -> Option<Self> {
        match value {
            0 => Some(Self::MetalLayer),
            1 => Some(Self::AndroidNativeWindow),
            2 => Some(Self::UiView),
            _ => None,
        }
    }
}

pub struct SurfaceSource {
    raw: *mut c_void,
    kind: SurfaceKind,
}

unsafe impl Send for SurfaceSource {}

impl SurfaceSource {
    /// # Safety
    /// `raw` must be a valid, non-null pointer matching `kind` for the
    /// lifetime of the resulting surface: a `CAMetalLayer*` for
    /// `MetalLayer`, an `ANativeWindow*` for `AndroidNativeWindow`.
    pub unsafe fn new(raw: *mut c_void, kind: SurfaceKind) -> Self {
        Self { raw, kind }
    }

    pub fn into_target(self) -> wgpu::SurfaceTargetUnsafe {
        match self.kind {
            SurfaceKind::MetalLayer => self.metal_target(),
            SurfaceKind::AndroidNativeWindow => self.android_target(),
            SurfaceKind::UiView => self.uiview_target(),
        }
    }

    #[cfg(target_os = "ios")]
    fn uiview_target(self) -> wgpu::SurfaceTargetUnsafe {
        use raw_window_handle::{
            RawDisplayHandle, RawWindowHandle, UiKitDisplayHandle, UiKitWindowHandle,
        };
        use std::ptr::NonNull;

        let view = NonNull::new(self.raw).expect("null UIView");
        wgpu::SurfaceTargetUnsafe::RawHandle {
            raw_display_handle: RawDisplayHandle::UiKit(UiKitDisplayHandle::new()),
            raw_window_handle: RawWindowHandle::UiKit(UiKitWindowHandle::new(view)),
        }
    }

    #[cfg(not(target_os = "ios"))]
    fn uiview_target(self) -> wgpu::SurfaceTargetUnsafe {
        unreachable!("UiView surface kind is only valid on iOS")
    }

    #[cfg(any(target_os = "ios", target_os = "macos"))]
    fn metal_target(self) -> wgpu::SurfaceTargetUnsafe {
        wgpu::SurfaceTargetUnsafe::CoreAnimationLayer(self.raw)
    }

    #[cfg(not(any(target_os = "ios", target_os = "macos")))]
    fn metal_target(self) -> wgpu::SurfaceTargetUnsafe {
        unreachable!("MetalLayer surface kind is only valid on Apple platforms")
    }

    #[cfg(target_os = "android")]
    fn android_target(self) -> wgpu::SurfaceTargetUnsafe {
        use raw_window_handle::{
            AndroidDisplayHandle, AndroidNdkWindowHandle, RawDisplayHandle, RawWindowHandle,
        };
        use std::ptr::NonNull;

        let window = NonNull::new(self.raw).expect("null ANativeWindow");
        let raw_window_handle = RawWindowHandle::AndroidNdk(AndroidNdkWindowHandle::new(window));
        let raw_display_handle = RawDisplayHandle::Android(AndroidDisplayHandle::new());
        wgpu::SurfaceTargetUnsafe::RawHandle {
            raw_display_handle,
            raw_window_handle,
        }
    }

    #[cfg(all(
        not(target_os = "android"),
        any(target_os = "ios", target_os = "macos")
    ))]
    fn android_target(self) -> wgpu::SurfaceTargetUnsafe {
        wgpu::SurfaceTargetUnsafe::CoreAnimationLayer(self.raw)
    }

    #[cfg(all(
        not(target_os = "android"),
        not(any(target_os = "ios", target_os = "macos"))
    ))]
    fn android_target(self) -> wgpu::SurfaceTargetUnsafe {
        unreachable!("AndroidNativeWindow surface kind is only valid on Android")
    }
}

/// Persistent, clonable window handle for engines (e.g. Bevy) that mount a
/// `RawHandleWrapper` and create the surface themselves. Unlike
/// [`SurfaceSource`] it does not consume the pointer.
#[cfg(feature = "bevy")]
#[derive(Clone, Copy)]
pub struct MobileWindow {
    raw: *mut c_void,
    kind: SurfaceKind,
}

#[cfg(feature = "bevy")]
unsafe impl Send for MobileWindow {}
#[cfg(feature = "bevy")]
unsafe impl Sync for MobileWindow {}

#[cfg(feature = "bevy")]
impl MobileWindow {
    /// # Safety
    /// Same contract as [`SurfaceSource::new`].
    pub unsafe fn new(raw: *mut c_void, kind: SurfaceKind) -> Self {
        Self { raw, kind }
    }
}

#[cfg(feature = "bevy")]
impl raw_window_handle::HasWindowHandle for MobileWindow {
    fn window_handle(
        &self,
    ) -> Result<raw_window_handle::WindowHandle<'_>, raw_window_handle::HandleError> {
        use raw_window_handle::{RawWindowHandle, WindowHandle};
        use std::ptr::NonNull;
        let raw = NonNull::new(self.raw).ok_or(raw_window_handle::HandleError::Unavailable)?;
        let handle = match self.kind {
            SurfaceKind::MetalLayer => {
                let mut h = raw_window_handle::AppKitWindowHandle::new(raw);
                let _ = &mut h;
                RawWindowHandle::AppKit(h)
            }
            SurfaceKind::AndroidNativeWindow => {
                RawWindowHandle::AndroidNdk(raw_window_handle::AndroidNdkWindowHandle::new(raw))
            }
            SurfaceKind::UiView => {
                RawWindowHandle::UiKit(raw_window_handle::UiKitWindowHandle::new(raw))
            }
        };
        Ok(unsafe { WindowHandle::borrow_raw(handle) })
    }
}

#[cfg(feature = "bevy")]
impl raw_window_handle::HasDisplayHandle for MobileWindow {
    fn display_handle(
        &self,
    ) -> Result<raw_window_handle::DisplayHandle<'_>, raw_window_handle::HandleError> {
        use raw_window_handle::{DisplayHandle, RawDisplayHandle};
        let raw = match self.kind {
            SurfaceKind::MetalLayer => {
                RawDisplayHandle::AppKit(raw_window_handle::AppKitDisplayHandle::new())
            }
            SurfaceKind::AndroidNativeWindow => {
                RawDisplayHandle::Android(raw_window_handle::AndroidDisplayHandle::new())
            }
            SurfaceKind::UiView => {
                RawDisplayHandle::UiKit(raw_window_handle::UiKitDisplayHandle::new())
            }
        };
        Ok(unsafe { DisplayHandle::borrow_raw(raw) })
    }
}

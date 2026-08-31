# kbve_wgpu

Reusable native `wgpu` render-surface bridge for KBVE mobile. Renders through the
device GPU (Metal on iOS, Vulkan on Android) into a surface handed in from a React
Native Fabric view — not WebGPU-in-WebView. Mounts via the `@kbve/rn` plugin system's
`native` entry kind. Hosts the Bevy isometric game behind the `bevy` feature flag.

## Layout

- `src/renderer/mod.rs` — `SurfaceRenderer` trait + `InputEvent`.
- `src/renderer/triangle.rs` — minimal clear-color + triangle renderer (vertical slice).
- `src/handle.rs` — `SurfaceSource`: `CAMetalLayer*` / `ANativeWindow*` → `wgpu::SurfaceTargetUnsafe`.
- `src/ffi.rs` — C ABI: `kbve_wgpu_create/resize/render/pause/input/set_jwt/destroy`.
- `src/lib.rs` — Android JNI shim + headless offscreen test.

## FFI contract

```c
WgpuSurface* kbve_wgpu_create(void* raw, uint32_t kind, uint32_t w, uint32_t h);
void kbve_wgpu_resize(WgpuSurface*, uint32_t w, uint32_t h);
int  kbve_wgpu_render(WgpuSurface*);   // 0 ok, 1 surface-lost (recreate), 2 error
void kbve_wgpu_pause(WgpuSurface*, bool);
void kbve_wgpu_input(WgpuSurface*, FfiInputEvent);
void kbve_wgpu_set_jwt(WgpuSurface*, const uint8_t* jwt, size_t len);
void kbve_wgpu_destroy(WgpuSurface*);
```

`kind`: `0` = Metal layer, `1` = Android native window.

## Build (nx)

- `nx run kbve_wgpu:verify` — fmt + clippy + headless test.
- `nx run kbve_wgpu:build:ios` — xcframework → `apps/kbve/kbve-react-native/modules/kbve-wgpu/ios/`.
- `nx run kbve_wgpu:build:android` — jniLibs → `.../modules/kbve-wgpu/android/src/main/jniLibs/`.
- `build:ios:bevy` / `build:android:bevy` — with the Bevy game host.

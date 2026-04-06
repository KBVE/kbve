# bevy_cam

Bevy isometric camera plugin with pixel snapping, multiplicative zoom, and two-stage render-to-texture pipeline for crisp pixel-art rendering.

## Usage

```rust
use bevy::prelude::*;
use bevy_cam::{IsometricCameraPlugin, CameraConfig, CameraFollowTarget};

fn main() {
    App::new()
        .add_plugins(IsometricCameraPlugin::new(CameraConfig::default()))
        .run();
}
```

## Key Types

- `IsometricCameraPlugin` — main plugin, accepts `CameraConfig`
- `CameraConfig` — offset, viewport height, pixel density, zoom factor
- `CameraFollowTarget` — marker component for the entity the camera tracks
- `DisplayCamera` — marker for post-processing hooks

## License

MIT

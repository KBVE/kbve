use bevy::core_pipeline::core_3d::graph::Node3d;
use bevy::core_pipeline::fullscreen_material::{FullscreenMaterial, FullscreenMaterialPlugin};
use bevy::prelude::*;
use bevy::render::extract_component::ExtractComponent;
use bevy::render::render_graph::{InternedRenderLabel, RenderLabel, RenderSubGraph};
use bevy::render::render_resource::ShaderType;
use bevy::shader::ShaderRef;

#[derive(Component, Clone, Copy, ExtractComponent, ShaderType)]
pub struct PixelateSettings {
    /// Size of each pixel block (in logical pixels).
    pub pixel_size: f32,
    /// Strength of normal-like edge outlines (0.0 = off, 1.0 = full).
    pub edge_strength: f32,
    /// Strength of depth-like edge outlines (0.0 = off, 1.0 = full).
    pub depth_edge_strength: f32,
    /// Window DPI scale factor (auto-updated from the window).
    pub scale_factor: f32,
}

impl Default for PixelateSettings {
    fn default() -> Self {
        Self {
            pixel_size: 4.0,
            edge_strength: 0.6,
            depth_edge_strength: 0.4,
            scale_factor: 1.0,
        }
    }
}

impl FullscreenMaterial for PixelateSettings {
    fn fragment_shader() -> ShaderRef {
        "shaders/pixelate.wgsl".into()
    }

    fn node_edges() -> Vec<InternedRenderLabel> {
        vec![
            Node3d::Tonemapping.intern(),
            Self::node_label().intern(),
            Node3d::EndMainPassPostProcessing.intern(),
        ]
    }

    fn sub_graph() -> Option<bevy::render::render_graph::InternedRenderSubGraph> {
        use bevy::core_pipeline::core_3d::graph::Core3d;
        Some(Core3d.intern())
    }
}

/// Syncs the window's DPI scale factor into PixelateSettings each frame.
fn sync_scale_factor(windows: Query<&Window>, mut settings: Query<&mut PixelateSettings>) {
    let Ok(window) = windows.single() else { return };
    let Ok(mut s) = settings.single_mut() else {
        return;
    };
    s.scale_factor = window.scale_factor() as f32;
}

pub struct PixelatePlugin;

impl Plugin for PixelatePlugin {
    fn build(&self, app: &mut App) {
        app.add_plugins(FullscreenMaterialPlugin::<PixelateSettings>::default());
        app.add_systems(Update, sync_scale_factor);
    }
}

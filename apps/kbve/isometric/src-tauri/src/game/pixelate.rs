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
    /// Strength of highlight edges from color-direction shifts (0.0 = off, 1.0 = full).
    pub highlight_strength: f32,
    /// Strength of shadow edges from luminance jumps (0.0 = off, 1.0 = full).
    pub shadow_strength: f32,
    /// Window DPI scale factor (auto-updated from the window).
    pub scale_factor: f32,
    /// How dark shadow edges get (0.0 = black, 1.0 = original color).
    pub shadow_darkness: f32,
    /// How bright highlight edges get (0.0 = no brightening, 1.0 = full white).
    pub highlight_brightness: f32,
    /// Smoothstep low threshold for normal (hue) edge detection.
    pub normal_threshold_low: f32,
    /// Smoothstep high threshold for normal (hue) edge detection.
    pub normal_threshold_high: f32,
    /// Smoothstep low threshold for depth (luminance) edge detection.
    pub depth_threshold_low: f32,
    /// Smoothstep high threshold for depth (luminance) edge detection.
    pub depth_threshold_high: f32,
    /// Suppresses highlights at hard depth edges to avoid double-lining.
    pub artifact_suppression: f32,
    /// Toon/cel-shading: number of discrete brightness bands (0 = off, 3-4 = typical).
    pub toon_bands: f32,
    /// Palette quantization: number of color levels per channel (0 = off, 6-8 = typical).
    pub color_levels: f32,
    /// Per-pixel color noise to break banding (0.0 = off, 0.01-0.03 = subtle).
    pub color_noise: f32,
    pub _pad1: f32,
}

impl Default for PixelateSettings {
    fn default() -> Self {
        Self {
            pixel_size: 2.0,
            highlight_strength: 0.5,
            shadow_strength: 0.55,
            scale_factor: 1.0,
            shadow_darkness: 0.3,
            highlight_brightness: 0.35,
            normal_threshold_low: 0.12,
            normal_threshold_high: 0.40,
            depth_threshold_low: 0.25,
            depth_threshold_high: 0.65,
            artifact_suppression: 1.0,
            toon_bands: 4.0,
            color_levels: 5.0,
            color_noise: 0.02,
            _pad1: 0.0,
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

use bevy::core_pipeline::core_3d::graph::Node3d;
use bevy::core_pipeline::fullscreen_material::{FullscreenMaterial, FullscreenMaterialPlugin};
use bevy::prelude::*;
use bevy::render::extract_component::ExtractComponent;
use bevy::render::render_graph::{InternedRenderLabel, RenderLabel, RenderSubGraph};
use bevy::render::render_resource::ShaderType;
use bevy::shader::ShaderRef;

#[derive(Component, Clone, Copy, Default, ExtractComponent, ShaderType)]
pub struct PixelateSettings {
    pub pixel_size: f32,
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

pub struct PixelatePlugin;

impl Plugin for PixelatePlugin {
    fn build(&self, app: &mut App) {
        app.add_plugins(FullscreenMaterialPlugin::<PixelateSettings>::default());
    }
}

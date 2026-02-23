use crate::data::cache::ResourceCache;
use godot::classes::{Panel, Shader, ShaderMaterial};
use godot::prelude::*;

#[derive(GodotClass)]
#[class(base = Node)]
pub struct ShaderCache {
    base: Base<Node>,
    shader_cache: ResourceCache<Shader>,
    material_cache: ResourceCache<ShaderMaterial>,
}

#[godot_api]
impl INode for ShaderCache {
    fn init(base: Base<Node>) -> Self {
        ShaderCache {
            base,
            shader_cache: ResourceCache::new(),
            material_cache: ResourceCache::new(),
        }
    }
}

#[godot_api]
impl ShaderCache {
    pub fn get_or_create_shader(&mut self, key: &str, shader_code: &str) -> Gd<Shader> {
        if let Some(shader) = self.shader_cache.get(key) {
            return shader;
        }

        let mut shader = Shader::new_gd();
        shader.set_code(shader_code);

        self.shader_cache.insert(key, shader.clone());
        shader
    }

    pub fn get_or_create_shader_material(
        &self,
        key: &str,
        shader: &Gd<Shader>,
    ) -> Gd<ShaderMaterial> {
        if let Some(material) = self.material_cache.get(key) {
            return material;
        }

        let mut shader_material = ShaderMaterial::new_gd();
        shader_material.set_shader(shader);

        self.material_cache.insert(key, shader_material.clone());
        shader_material
    }

    pub fn create_black_rounded_panel(&mut self) -> Gd<Panel> {
        let shader_code = "
            shader_type canvas_item;
            uniform float corner_radius = 20.0;
            uniform vec4 color = vec4(0.0, 0.0, 0.0, 0.55);
            uniform vec2 size = vec2(400.0, 200.0);

            void fragment() {
                vec2 scaled_size = size * UV;
                vec2 pos = FRAGCOORD.xy - scaled_size / 2.0;

                vec2 corner = max(abs(pos) - (scaled_size / 2.0 - corner_radius), 0.0);
                float dist = length(corner) - corner_radius;

                float alpha = smoothstep(0.0, 1.0, dist);

                COLOR = vec4(color.rgb, color.a * (1.0 - alpha));
            }
        ";

        let shader = self.get_or_create_shader("black_rounded_panel", shader_code);
        let shader_material =
            self.get_or_create_shader_material("black_rounded_panel_material", &shader);

        let mut panel = Panel::new_alloc();
        panel.set_material(&shader_material);
        panel.set_custom_minimum_size(Vector2::new(400.0, 200.0));

        panel
    }
}

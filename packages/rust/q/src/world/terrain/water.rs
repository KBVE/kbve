use godot::classes::rendering_device::{
    DataFormat, ShaderLanguage, ShaderStage, TextureUsageBits, UniformType,
};
use godot::classes::{
    RdShaderSource, RdTextureFormat, RdTextureView, RdUniform, RenderingServer, Texture2Drd,
};
use godot::prelude::*;

use super::QTerrain;

pub(super) const PATTERN_RES: u32 = 256;
pub(super) const PATTERN_CELLS: f32 = 12.0;

const PATTERN_GLSL: &str = r#"
#version 450
layout(local_size_x = 8, local_size_y = 8) in;
layout(set = 0, binding = 0, r8) restrict writeonly uniform image2D pattern_img;
layout(push_constant, std430) uniform P {
    float zc;
    float smoothness;
    float contrast;
    float brightness;
} pc;

const float N = 12.0;

vec3 cellpt(vec3 c) {
    c.xy = mod(c.xy, N);
    return fract(sin(vec3(
        dot(c, vec3(127.1, 311.7,  74.7)),
        dot(c, vec3(269.5, 183.3, 246.1)),
        dot(c, vec3(113.5, 271.9, 124.6))
    )) * 43758.5453);
}

void main() {
    ivec2 px = ivec2(gl_GlobalInvocationID.xy);
    if (px.x >= 256 || px.y >= 256) {
        return;
    }
    vec3 p = vec3((vec2(px) / 256.0) * N, pc.zc);
    vec3 i = floor(p);
    vec3 f = fract(p);
    float f1 = 1.0;
    float res = 0.0;
    for (int z = -1; z <= 1; z++)
    for (int y = -1; y <= 1; y++)
    for (int x = -1; x <= 1; x++) {
        vec3 nb = vec3(float(x), float(y), float(z));
        vec3 pt = cellpt(i + nb);
        float d = length(nb + pt - f);
        f1 = min(f1, d);
        res += exp(-pc.smoothness * d);
    }
    float sf1 = -(1.0 / pc.smoothness) * log(res);
    float v = clamp((f1 - sf1) * pc.contrast + pc.brightness, -1.0, 1.0) * 0.5 + 0.5;
    imageStore(pattern_img, px, vec4(v));
}
"#;

fn mat_f32(m: &Gd<godot::classes::ShaderMaterial>, name: &str, fallback: f32) -> f32 {
    let v = m.get_shader_parameter(name);
    v.try_to::<f32>().unwrap_or(fallback)
}

impl QTerrain {
    pub(super) fn setup_water_fx(&mut self) {
        let Some(mut rd) = RenderingServer::singleton().get_rendering_device() else {
            return;
        };
        let mut source = RdShaderSource::new_gd();
        source.set_language(ShaderLanguage::GLSL);
        source.set_stage_source(ShaderStage::COMPUTE, PATTERN_GLSL);
        let Some(spirv) = rd.shader_compile_spirv_from_source(&source) else {
            return;
        };
        let err = spirv.get_stage_compile_error(ShaderStage::COMPUTE);
        if !err.is_empty() {
            godot_error!("[QTerrain] water pattern compute failed: {err}");
            return;
        }
        let shader = rd.shader_create_from_spirv(&spirv);
        if !shader.is_valid() {
            return;
        }
        let mut fmt = RdTextureFormat::new_gd();
        fmt.set_width(PATTERN_RES);
        fmt.set_height(PATTERN_RES);
        fmt.set_format(DataFormat::R8_UNORM);
        fmt.set_usage_bits(
            TextureUsageBits::SAMPLING_BIT
                | TextureUsageBits::STORAGE_BIT
                | TextureUsageBits::CAN_UPDATE_BIT,
        );
        let tex = rd.texture_create(&fmt, &RdTextureView::new_gd());
        if !tex.is_valid() {
            rd.free_rid(shader);
            return;
        }
        let mut u = RdUniform::new_gd();
        u.set_uniform_type(UniformType::IMAGE);
        u.set_binding(0);
        u.add_id(tex);
        let uniforms: Array<Gd<RdUniform>> = [u].into_iter().collect();
        let set = rd.uniform_set_create(&uniforms, shader, 0);
        let pipeline = rd.compute_pipeline_create(shader);
        let mut wrap = Texture2Drd::new_gd();
        wrap.set_texture_rd_rid(tex);
        if let Some(m) = self.water_material.as_mut() {
            m.set_shader_parameter("pattern_tex", &wrap.to_variant());
        }
        self.water_rd = Some(rd);
        self.pattern_tex = tex;
        self.pattern_shader = shader;
        self.pattern_pipeline = pipeline;
        self.pattern_set = set;
        self.pattern_wrap = Some(wrap);
    }

    pub(super) fn dispatch_water_fx(&mut self) {
        if !self.pattern_set.is_valid() {
            return;
        }
        let (scale1, smoothness, contrast, brightness, z_flow, stepped, fps) =
            if let Some(m) = self.water_material.as_ref() {
                (
                    mat_f32(m, "scale1", 30.0),
                    mat_f32(m, "smoothness", 11.0),
                    mat_f32(m, "contrast", 6.415),
                    mat_f32(m, "brightness", 0.097),
                    mat_f32(m, "z_flow_speed", 0.01),
                    m.get_shader_parameter("enable_stepped_animation")
                        .try_to::<bool>()
                        .unwrap_or(false),
                    mat_f32(m, "animation_fps", 8.0),
                )
            } else {
                (30.0, 11.0, 6.415, 0.097, 0.01, false, 8.0)
            };
        let t = if stepped {
            (self.water_time * fps).floor() / fps
        } else {
            self.water_time
        };
        let zc = t * z_flow * scale1;
        if (zc - self.pattern_zc).abs() < 1e-6 {
            return;
        }
        self.pattern_zc = zc;
        let Some(rd) = self.water_rd.as_mut() else {
            return;
        };
        let pc = [zc, smoothness, contrast, brightness];
        let pc_bytes = PackedFloat32Array::from(&pc[..]).to_byte_array();
        let cl = rd.compute_list_begin();
        rd.compute_list_bind_compute_pipeline(cl, self.pattern_pipeline);
        rd.compute_list_bind_uniform_set(cl, self.pattern_set, 0);
        rd.compute_list_set_push_constant(cl, &pc_bytes, pc_bytes.len() as u32);
        rd.compute_list_dispatch(cl, PATTERN_RES / 8, PATTERN_RES / 8, 1);
        rd.compute_list_end();
    }

    pub(super) fn free_water_fx(&mut self) {
        let Some(rd) = self.water_rd.as_mut() else {
            return;
        };
        for rid in [self.pattern_pipeline, self.pattern_shader, self.pattern_tex] {
            if rid.is_valid() {
                rd.free_rid(rid);
            }
        }
        self.pattern_tex = Rid::Invalid;
        self.pattern_shader = Rid::Invalid;
        self.pattern_pipeline = Rid::Invalid;
        self.pattern_set = Rid::Invalid;
        self.water_rd = None;
        self.pattern_wrap = None;
    }
}

use godot::classes::rendering_device::{
    DataFormat, SamplerFilter, SamplerRepeatMode, ShaderLanguage, ShaderStage, TextureUsageBits,
    UniformType,
};
use godot::classes::{
    RdSamplerState, RdShaderSource, RdTextureFormat, RdTextureView, RdUniform, RenderingServer,
    Texture2Drd,
};
use godot::prelude::*;

use super::QTerrain;

pub(super) const PATTERN_RES: u32 = 256;
pub(super) const PATTERN_CELLS: f32 = 12.0;
pub(super) const WAKE_RES: u32 = 128;
/// How often the wake is stepped. It is advected and decayed by however much time it
/// banked, so a lower rate moves it exactly as far -- it just does so in fewer, larger
/// steps. At 120 fps this is a quarter of the dispatches.
/// Higher than the 30 the first pass settled on: a quarter of the grid costs little
/// enough per step that the wake can be stepped more often, and stepping it more often is
/// what stops it reading as a decal that appears and sits there.
const WAKE_HZ: f32 = 48.0;
pub(super) const WAKE_WINDOW: f32 = 32.0;

const WAKE_GLSL: &str = r#"
#version 450
layout(local_size_x = 8, local_size_y = 8) in;
layout(set = 0, binding = 0) uniform sampler2D wake_prev;
layout(set = 0, binding = 1, r8) restrict writeonly uniform image2D wake_next;
layout(push_constant, std430) uniform P {
    vec2 player;
    vec2 flow;
    vec2 org_new;
    vec2 org_old;
    float window;
    float delta;
    float strength;
    float radius;
} pc;

const int RES = 256;

void main() {
    ivec2 px = ivec2(gl_GlobalInvocationID.xy);
    if (any(greaterThanEqual(px, ivec2(RES)))) {
        return;
    }
    vec2 uv = (vec2(px) + 0.5) / float(RES);
    vec2 w = pc.org_new + (uv - 0.5) * pc.window;
    vec2 prev_uv = (w - pc.flow * pc.delta - pc.org_old) / pc.window + 0.5;
    float v = 0.0;
    if (all(greaterThan(prev_uv, vec2(0.0))) && all(lessThan(prev_uv, vec2(1.0)))) {
        v = texture(wake_prev, prev_uv).r;
    }
    v *= exp(-pc.delta * 2.4);
    float d = length(w - pc.player);
    v += pc.strength * (1.0 - smoothstep(pc.radius * 0.25, pc.radius, d)) * pc.delta * 12.0;
    imageStore(wake_next, px, vec4(clamp(v, 0.0, 1.0)));
}
"#;

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

vec3 hash33(vec3 p) {
    p = fract(p * vec3(0.1031, 0.1030, 0.0973));
    p += dot(p, p.yxz + 33.33);
    return fract((p.xxy + p.yxx) * p.zyx);
}

vec3 cellpt(vec3 c) {
    c.xy = mod(c.xy, N);
    return hash33(c);
}

void main() {
    ivec2 px = ivec2(gl_GlobalInvocationID.xy);
    if (any(greaterThanEqual(px, ivec2(256)))) {
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

pub(super) fn mat_f32(m: &Gd<godot::classes::ShaderMaterial>, name: &str, fallback: f32) -> f32 {
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
        self.setup_wake();
    }

    fn setup_wake(&mut self) {
        let Some(rd) = self.water_rd.as_mut() else {
            return;
        };
        let mut source = RdShaderSource::new_gd();
        source.set_language(ShaderLanguage::GLSL);
        source.set_stage_source(ShaderStage::COMPUTE, WAKE_GLSL);
        let Some(spirv) = rd.shader_compile_spirv_from_source(&source) else {
            return;
        };
        let err = spirv.get_stage_compile_error(ShaderStage::COMPUTE);
        if !err.is_empty() {
            godot_error!("[QTerrain] wake compute failed: {err}");
            return;
        }
        let shader = rd.shader_create_from_spirv(&spirv);
        if !shader.is_valid() {
            return;
        }
        let mut sampler_state = RdSamplerState::new_gd();
        sampler_state.set_min_filter(SamplerFilter::LINEAR);
        sampler_state.set_mag_filter(SamplerFilter::LINEAR);
        sampler_state.set_repeat_u(SamplerRepeatMode::CLAMP_TO_EDGE);
        sampler_state.set_repeat_v(SamplerRepeatMode::CLAMP_TO_EDGE);
        let sampler = rd.sampler_create(&sampler_state);

        let mut texs = [Rid::Invalid; 2];
        for t in texs.iter_mut() {
            let mut fmt = RdTextureFormat::new_gd();
            fmt.set_width(WAKE_RES);
            fmt.set_height(WAKE_RES);
            fmt.set_format(DataFormat::R8_UNORM);
            fmt.set_usage_bits(
                TextureUsageBits::SAMPLING_BIT
                    | TextureUsageBits::STORAGE_BIT
                    | TextureUsageBits::CAN_UPDATE_BIT
                    | TextureUsageBits::CAN_COPY_TO_BIT,
            );
            *t = rd.texture_create(&fmt, &RdTextureView::new_gd());
        }
        if !texs[0].is_valid() || !texs[1].is_valid() {
            return;
        }
        for t in texs {
            rd.texture_clear(t, Color::from_rgba(0.0, 0.0, 0.0, 0.0), 0, 1, 0, 1);
        }

        let mut sets = [Rid::Invalid; 2];
        for (i, set) in sets.iter_mut().enumerate() {
            let prev = texs[i];
            let next = texs[1 - i];
            let mut su = RdUniform::new_gd();
            su.set_uniform_type(UniformType::SAMPLER_WITH_TEXTURE);
            su.set_binding(0);
            su.add_id(sampler);
            su.add_id(prev);
            let mut iu = RdUniform::new_gd();
            iu.set_uniform_type(UniformType::IMAGE);
            iu.set_binding(1);
            iu.add_id(next);
            let uniforms: Array<Gd<RdUniform>> = [su, iu].into_iter().collect();
            *set = rd.uniform_set_create(&uniforms, shader, 0);
        }
        let pipeline = rd.compute_pipeline_create(shader);

        let mut wraps = Vec::new();
        for t in texs {
            let mut w = Texture2Drd::new_gd();
            w.set_texture_rd_rid(t);
            wraps.push(w);
        }
        self.wake_tex = texs;
        self.wake_sets = sets;
        self.wake_shader = shader;
        self.wake_pipeline = pipeline;
        self.wake_sampler = sampler;
        self.wake_wraps = wraps;
        self.wake_idx = 0;
    }

    pub(super) fn dispatch_wake(&mut self, delta: f32, p: Vector3) {
        if !self.wake_sets[0].is_valid() || !self.wake_sets[1].is_valid() {
            return;
        }
        self.wake_accum += delta;
        if self.wake_accum < 1.0 / WAKE_HZ {
            return;
        }
        let delta = self.wake_accum;
        self.wake_accum = 0.0;

        // Measured against the last dispatch rather than the last frame, so the speed the
        // wake is drawn from is the speed actually travelled over the step.
        let dp = p - self.wake_last_pos;
        self.wake_last_pos = p;
        let speed_h = (Vector2::new(dp.x, dp.z) / delta.max(0.001)).length();
        let in_water = ((self.water_level + 0.15 - p.y) / 0.5).clamp(0.0, 1.0);
        let strength = in_water * (speed_h * 0.22).clamp(0.06, 0.65);

        // Standing in the river counted as active, because idle only meant "out of the
        // water" -- so a player who stopped moving kept paying for a wake that had nothing
        // left to draw.
        let idle = in_water <= 0.0 || (speed_h < 0.05 && self.wake_energy < 0.02);
        self.wake_energy = self.wake_energy * (-delta * 2.4).exp()
            + if idle { 0.0 } else { strength * delta * 12.0 };
        if idle && self.wake_energy < 0.004 {
            self.wake_active = false;
            return;
        }

        let (flow_dir, flow_speed) = if let Some(m) = self.water_material.as_ref() {
            let d = m
                .get_shader_parameter("flow_direction")
                .try_to::<Vector2>()
                .unwrap_or(Vector2::new(0.0, 1.0));
            (d, mat_f32(m, "flow_speed", 0.02))
        } else {
            (Vector2::new(0.0, 1.0), 0.02)
        };
        let flow = flow_dir.normalized() * flow_speed * 80.0;

        let texel = WAKE_WINDOW / WAKE_RES as f32;
        let org_new = Vector2::new((p.x / texel).floor() * texel, (p.z / texel).floor() * texel);
        let org_old = if self.wake_active {
            self.wake_origin
        } else {
            org_new
        };
        self.wake_origin = org_new;
        self.wake_active = true;

        let set = self.wake_sets[self.wake_idx];
        let written = self.wake_tex[1 - self.wake_idx];
        self.wake_idx = 1 - self.wake_idx;

        let pc = [
            p.x,
            p.z,
            flow.x,
            flow.y,
            org_new.x,
            org_new.y,
            org_old.x,
            org_old.y,
            WAKE_WINDOW,
            delta,
            strength,
            0.9f32,
        ];
        let Some(rd) = self.water_rd.as_mut() else {
            return;
        };
        let pc_bytes = PackedFloat32Array::from(&pc[..]).to_byte_array();
        let cl = rd.compute_list_begin();
        rd.compute_list_bind_compute_pipeline(cl, self.wake_pipeline);
        rd.compute_list_bind_uniform_set(cl, set, 0);
        rd.compute_list_set_push_constant(cl, &pc_bytes, pc_bytes.len() as u32);
        rd.compute_list_dispatch(cl, WAKE_RES / 8, WAKE_RES / 8, 1);
        rd.compute_list_end();

        let widx = if self.wake_tex[0] == written { 0 } else { 1 };
        if let Some(w) = self.wake_wraps.get(widx).cloned()
            && let Some(m) = self.water_material.as_mut()
        {
            m.set_shader_parameter("wake_tex", &w.to_variant());
            m.set_shader_parameter("wake_origin", &org_new.to_variant());
            m.set_shader_parameter("wake_window", &WAKE_WINDOW.to_variant());
        }
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
        if let Some(m) = self.water_material.as_mut() {
            m.set_shader_parameter("pattern_tex", &Variant::nil());
            m.set_shader_parameter("wake_tex", &Variant::nil());
        }
        if let Some(w) = self.pattern_wrap.as_mut() {
            w.set_texture_rd_rid(Rid::Invalid);
        }
        for w in self.wake_wraps.iter_mut() {
            w.set_texture_rd_rid(Rid::Invalid);
        }
        let Some(rd) = self.water_rd.as_mut() else {
            return;
        };
        for rid in [
            self.pattern_pipeline,
            self.pattern_shader,
            self.pattern_tex,
            self.wake_pipeline,
            self.wake_shader,
            self.wake_sampler,
            self.wake_tex[0],
            self.wake_tex[1],
        ] {
            if rid.is_valid() {
                rd.free_rid(rid);
            }
        }
        self.pattern_tex = Rid::Invalid;
        self.pattern_shader = Rid::Invalid;
        self.pattern_pipeline = Rid::Invalid;
        self.pattern_set = Rid::Invalid;
        self.wake_tex = [Rid::Invalid; 2];
        self.wake_sets = [Rid::Invalid; 2];
        self.wake_shader = Rid::Invalid;
        self.wake_pipeline = Rid::Invalid;
        self.wake_sampler = Rid::Invalid;
        self.wake_wraps.clear();
        self.water_rd = None;
        self.pattern_wrap = None;
    }
}

use godot::classes::rendering_device::{
    SamplerFilter, SamplerRepeatMode, ShaderLanguage, ShaderStage, UniformType,
};
use godot::classes::rendering_server::{MultimeshTransformFormat, ShadowCastingSetting};
use godot::classes::{RdSamplerState, RdShaderSource, RdUniform, RenderingDevice, RenderingServer};
use godot::prelude::*;

const OCCLUSION_START: f32 = 15.0;
const OCCLUSION_MARGIN: f32 = 1.0;

pub fn occlusion_enabled() -> bool {
    static V: std::sync::OnceLock<bool> = std::sync::OnceLock::new();
    *V.get_or_init(|| {
        std::env::var("GRASS_OCCL")
            .map(|v| v == "1")
            .unwrap_or(false)
    })
}

const CULL_GLSL: &str = r#"
#version 450
layout(local_size_x = 64) in;
layout(set = 0, binding = 0, std430) restrict readonly buffer Layouts { float data[]; } layouts;
layout(set = 0, binding = 1, std430) restrict readonly buffer Cells { vec4 data[]; } cells;
layout(set = 0, binding = 2, std430) restrict writeonly buffer OutNear { float data[]; } out_near;
layout(set = 0, binding = 3, std430) restrict writeonly buffer OutFar { float data[]; } out_far;
layout(set = 0, binding = 4, std430) restrict buffer Counter { uint data[]; } counter;
layout(set = 0, binding = 5) uniform sampler2D heightmap;
layout(set = 0, binding = 6) uniform sampler2D clearance;
layout(push_constant, std430) uniform Params {
    vec4 cam;
    vec4 p0;
    vec4 p1;
    vec4 p2;
    vec4 p3;
    vec4 fade;
    vec4 caps;
    vec4 terra;
} pc;

shared uint local_near;
shared uint local_far;
shared uint base_near;
shared uint base_far;

float terrain_h(vec2 xz) {
    vec2 uv = clamp((xz + pc.terra.x) / (pc.terra.x * 2.0), 0.001, 0.999);
    return textureLod(heightmap, uv, 0.0).r;
}

float clearance_at(vec2 xz) {
    vec2 uv = clamp((xz + pc.terra.x) / (pc.terra.x * 2.0), 0.001, 0.999);
    return textureLod(clearance, uv, 0.0).r;
}

bool outside(vec4 plane, vec3 pos) {
    return dot(plane.xyz, pos) - plane.w > 3.0;
}

mat3 axis_rot(vec3 ax, float a) {
    float c = cos(a);
    float s = sin(a);
    float t = 1.0 - c;
    return mat3(
        vec3(t * ax.x * ax.x + c, t * ax.x * ax.y + s * ax.z, t * ax.x * ax.z - s * ax.y),
        vec3(t * ax.x * ax.y - s * ax.z, t * ax.y * ax.y + c, t * ax.y * ax.z + s * ax.x),
        vec3(t * ax.x * ax.z + s * ax.y, t * ax.y * ax.z - s * ax.x, t * ax.z * ax.z + c));
}

void main() {
    if (gl_LocalInvocationIndex == 0u) {
        local_near = 0u;
        local_far = 0u;
    }
    barrier();
    uint blade_count = uint(pc.fade.w);
    uint id = gl_GlobalInvocationID.x;
    uint cell = id / blade_count;
    uint blade = id - cell * blade_count;
    bool alive = cell < uint(pc.cam.w);
    bool near = false;
    float wx = 0.0;
    float wz = 0.0;
    float rank = 0.0;
    float h = 0.0;
    uint src = 0u;
    if (alive) {
        vec4 cinfo = cells.data[cell];
        src = uint(cinfo.z) + blade * 6u;
        wx = layouts.data[src] + cinfo.x;
        wz = layouts.data[src + 1u] + cinfo.y;
        float d = distance(vec2(wx, wz), pc.cam.xz);
        float t = smoothstep(pc.fade.x, pc.fade.y, d);
        float density = 1.0 - t * t;
        rank = float(blade) / float(blade_count) * 0.95;
        alive = rank < density;
        if (alive) {
            h = terrain_h(vec2(wx, wz));
            vec3 pos = vec3(wx, h + 0.7, wz);
            alive = h >= pc.terra.y + 0.25
                && rank < 1.0 - clearance_at(vec2(wx, wz))
                && !(outside(pc.p0, pos) || outside(pc.p1, pos) || outside(pc.p2, pos)
                    || outside(pc.p3, pos));
            if (alive && d > pc.terra.z) {
                vec3 tip = vec3(wx, h + 1.4, wz);
                for (int i = 1; i <= 5; i++) {
                    vec3 p = mix(tip, pc.cam.xyz, float(i) / 6.0);
                    if (terrain_h(p.xz) > p.y + pc.terra.w) {
                        alive = false;
                        break;
                    }
                }
            }
            near = d < pc.fade.z;
        }
    }
    uint lslot = 0u;
    if (alive) {
        if (near) {
            lslot = atomicAdd(local_near, 1u);
        } else {
            lslot = atomicAdd(local_far, 1u);
        }
    }
    barrier();
    if (gl_LocalInvocationIndex == 0u) {
        base_near = atomicAdd(counter.data[0], local_near);
        base_far = atomicAdd(counter.data[1], local_far);
    }
    barrier();
    if (!alive) {
        return;
    }
    uint slot = (near ? base_near : base_far) + lslot;
    if (slot >= uint(near ? pc.caps.x : pc.caps.y)) {
        return;
    }
    float yaw = layouts.data[src + 2u];
    float td = layouts.data[src + 3u];
    float tilt = layouts.data[src + 4u];
    float s = layouts.data[src + 5u];
    mat3 b = axis_rot(vec3(cos(td), 0.0, sin(td)), tilt) * axis_rot(vec3(0.0, 1.0, 0.0), yaw);
    b[0] *= s;
    b[1] *= s;
    b[2] *= s;
    float shape = fract(float(blade) * 0.75487766 + cells.data[cell].w * 0.618034);
    uint o = slot * 16u;
    if (near) {
        out_near.data[o] = b[0].x;
        out_near.data[o + 1u] = b[1].x;
        out_near.data[o + 2u] = b[2].x;
        out_near.data[o + 3u] = wx;
        out_near.data[o + 4u] = b[0].y;
        out_near.data[o + 5u] = b[1].y;
        out_near.data[o + 6u] = b[2].y;
        out_near.data[o + 7u] = 0.0;
        out_near.data[o + 8u] = b[0].z;
        out_near.data[o + 9u] = b[1].z;
        out_near.data[o + 10u] = b[2].z;
        out_near.data[o + 11u] = wz;
        out_near.data[o + 12u] = rank;
        out_near.data[o + 13u] = shape;
        out_near.data[o + 14u] = h;
        out_near.data[o + 15u] = 0.0;
    } else {
        out_far.data[o] = b[0].x;
        out_far.data[o + 1u] = b[1].x;
        out_far.data[o + 2u] = b[2].x;
        out_far.data[o + 3u] = wx;
        out_far.data[o + 4u] = b[0].y;
        out_far.data[o + 5u] = b[1].y;
        out_far.data[o + 6u] = b[2].y;
        out_far.data[o + 7u] = 0.0;
        out_far.data[o + 8u] = b[0].z;
        out_far.data[o + 9u] = b[1].z;
        out_far.data[o + 10u] = b[2].z;
        out_far.data[o + 11u] = wz;
        out_far.data[o + 12u] = rank;
        out_far.data[o + 13u] = shape;
        out_far.data[o + 14u] = h;
        out_far.data[o + 15u] = 0.0;
    }
}
"#;

const RESOLVE_GLSL: &str = r#"
#version 450
layout(local_size_x = 1) in;
layout(set = 0, binding = 0, std430) restrict readonly buffer Counter { uint data[]; } counter;
layout(set = 0, binding = 1, std430) restrict buffer CmdNear { uint data[]; } cmd_near;
layout(set = 0, binding = 2, std430) restrict buffer CmdFar { uint data[]; } cmd_far;
layout(push_constant, std430) uniform Params {
    vec4 caps;
} pc;

void main() {
    cmd_near.data[1] = min(counter.data[0], uint(pc.caps.x));
    cmd_far.data[1] = min(counter.data[1], uint(pc.caps.y));
}
"#;

const CARD_CULL_GLSL: &str = r#"
#version 450
layout(local_size_x = 64) in;
layout(set = 0, binding = 0, std430) restrict readonly buffer Layouts { float data[]; } layouts;
layout(set = 0, binding = 1, std430) restrict readonly buffer Cells { vec4 data[]; } cells;
layout(set = 0, binding = 2, std430) restrict writeonly buffer OutB { float data[]; } outb;
layout(set = 0, binding = 3, std430) restrict buffer Counter { uint data[]; } counter;
layout(set = 0, binding = 4) uniform sampler2D heightmap;
layout(set = 0, binding = 5) uniform sampler2D clearance;
layout(push_constant, std430) uniform Params {
    vec4 cam;
    vec4 p0;
    vec4 p1;
    vec4 p2;
    vec4 p3;
} pc;

const float BLADE_RANGE = %BLADE_RANGE%;
const float CARD_TAIL = %CARD_TAIL%;
const float CARD_FLOOR = %CARD_FLOOR%;
const float FADE_END = %FADE_END%;
const float BAND_START = %BAND_START%;
const float BAND_END = %BAND_END%;
const float EXTENT = %EXTENT%;
const float WATER = %WATER%;
const float OCCL_START = %OCCL_START%;
const float OCCL_MARGIN = %OCCL_MARGIN%;
const uint COUNT = %COUNT%u;
const uint CAP = %CAP%u;

shared uint local_cnt;
shared uint base_slot;

float terrain_h(vec2 xz) {
    vec2 uv = clamp((xz + EXTENT) / (EXTENT * 2.0), 0.001, 0.999);
    return textureLod(heightmap, uv, 0.0).r;
}

float clearance_at(vec2 xz) {
    vec2 uv = clamp((xz + EXTENT) / (EXTENT * 2.0), 0.001, 0.999);
    return textureLod(clearance, uv, 0.0).r;
}

bool outside(vec4 plane, vec3 pos) {
    return dot(plane.xyz, pos) - plane.w > 6.0;
}

mat3 axis_rot(vec3 ax, float a) {
    float c = cos(a);
    float s = sin(a);
    float t = 1.0 - c;
    return mat3(
        vec3(t * ax.x * ax.x + c, t * ax.x * ax.y + s * ax.z, t * ax.x * ax.z - s * ax.y),
        vec3(t * ax.x * ax.y - s * ax.z, t * ax.y * ax.y + c, t * ax.y * ax.z + s * ax.x),
        vec3(t * ax.x * ax.z + s * ax.y, t * ax.y * ax.z - s * ax.x, t * ax.z * ax.z + c));
}

void main() {
    if (gl_LocalInvocationIndex == 0u) {
        local_cnt = 0u;
    }
    barrier();
    uint id = gl_GlobalInvocationID.x;
    uint cell = id / COUNT;
    uint card = id - cell * COUNT;
    bool alive = cell < uint(pc.cam.w);
    float wx = 0.0;
    float wz = 0.0;
    float rank = 0.0;
    float h = 0.0;
    uint src = 0u;
    if (alive) {
        vec4 cinfo = cells.data[cell];
        src = uint(cinfo.z) + card * 6u;
        wx = layouts.data[src] + cinfo.x;
        wz = layouts.data[src + 1u] + cinfo.y;
        float d = distance(vec2(wx, wz), pc.cam.xz);
        rank = min(float(card) / float(COUNT), 0.999);
        float keep = max(exp(-max(d - BLADE_RANGE, 0.0) / CARD_TAIL), CARD_FLOOR);
        float appear = BLADE_RANGE * (0.55 + rank * 0.35);
        alive = d < FADE_END && rank < keep && d > appear - 5.0;
        if (alive && BAND_END > BAND_START) {
            float band_keep = 1.0 - smoothstep(BAND_START, BAND_END, d);
            alive = rank < band_keep * 1.001;
        }
        if (alive) {
            h = terrain_h(vec2(wx, wz));
            vec3 pos = vec3(wx, h + 1.0, wz);
            alive = h >= WATER + 0.25
                && rank < 1.0 - clearance_at(vec2(wx, wz))
                && !(outside(pc.p0, pos) || outside(pc.p1, pos) || outside(pc.p2, pos)
                    || outside(pc.p3, pos));
            if (alive && d > OCCL_START) {
                vec3 tip = vec3(wx, h + 2.2, wz);
                for (int i = 1; i <= 8; i++) {
                    vec3 p = mix(tip, pc.cam.xyz, float(i) / 9.0);
                    if (terrain_h(p.xz) > p.y + OCCL_MARGIN) {
                        alive = false;
                        break;
                    }
                }
            }
        }
    }
    uint lslot = 0u;
    if (alive) {
        lslot = atomicAdd(local_cnt, 1u);
    }
    barrier();
    if (gl_LocalInvocationIndex == 0u) {
        base_slot = atomicAdd(counter.data[0], local_cnt);
    }
    barrier();
    if (!alive) {
        return;
    }
    uint slot = base_slot + lslot;
    if (slot >= CAP) {
        return;
    }
    float yaw = layouts.data[src + 2u];
    float td = layouts.data[src + 3u];
    float tilt = layouts.data[src + 4u];
    float s = layouts.data[src + 5u];
    mat3 b = axis_rot(vec3(cos(td), 0.0, sin(td)), tilt) * axis_rot(vec3(0.0, 1.0, 0.0), yaw);
    b[0] *= s;
    b[1] *= s;
    b[2] *= s;
    uint o = slot * 16u;
    outb.data[o] = b[0].x;
    outb.data[o + 1u] = b[1].x;
    outb.data[o + 2u] = b[2].x;
    outb.data[o + 3u] = wx;
    outb.data[o + 4u] = b[0].y;
    outb.data[o + 5u] = b[1].y;
    outb.data[o + 6u] = b[2].y;
    outb.data[o + 7u] = 0.0;
    outb.data[o + 8u] = b[0].z;
    outb.data[o + 9u] = b[1].z;
    outb.data[o + 10u] = b[2].z;
    outb.data[o + 11u] = wz;
    outb.data[o + 12u] = rank;
    outb.data[o + 13u] = h;
    outb.data[o + 14u] = 0.0;
    outb.data[o + 15u] = 0.0;
}
"#;

const CARD_RESOLVE_GLSL: &str = r#"
#version 450
layout(local_size_x = 1) in;
layout(set = 0, binding = 0, std430) restrict readonly buffer Counter { uint data[]; } counter;
layout(set = 0, binding = 1, std430) restrict buffer Cmd { uint data[]; } cmd;

void main() {
    cmd.data[1] = min(counter.data[0], %CAP%u);
}
"#;

pub struct CardParams {
    pub blade_range: f32,
    pub card_tail: f32,
    pub card_floor: f32,
    pub fade_end: f32,
    pub band_out_start: f32,
    pub band_out_end: f32,
    pub terrain_extent: f32,
    pub water_level: f32,
    pub occl_start: f32,
    pub occl_margin: f32,
}

fn bake(src: &str, subs: &[(&str, String)]) -> String {
    let mut out = src.to_string();
    for (key, val) in subs {
        out = out.replace(key, val);
    }
    out
}

fn glsl_f(v: f32) -> String {
    format!("{v:.6}")
}

pub struct BladeCompute {
    rd: Gd<RenderingDevice>,
    cull_shader: Rid,
    cull_pipeline: Rid,
    resolve_shader: Rid,
    resolve_pipeline: Rid,
    cull_set: Rid,
    resolve_set: Rid,
    layouts_buf: Rid,
    cells_buf: Rid,
    counter_buf: Rid,
    mm_near: Rid,
    mm_far: Rid,
    inst_near: Rid,
    inst_far: Rid,
    blade_count: u32,
    cell_capacity: u32,
    cell_count: u32,
    cap_near: u32,
    cap_far: u32,
    zero_counter: PackedByteArray,
    heightmap_tex: Rid,
    clearance_tex: Rid,
    sampler: Rid,
    terrain_extent: f32,
    water_level: f32,
}

fn compile(rd: &mut Gd<RenderingDevice>, src: &str) -> Option<Rid> {
    let mut source = RdShaderSource::new_gd();
    source.set_language(ShaderLanguage::GLSL);
    source.set_stage_source(ShaderStage::COMPUTE, src);
    let spirv = rd.shader_compile_spirv_from_source(&source)?;
    let err = spirv.get_stage_compile_error(ShaderStage::COMPUTE);
    if !err.is_empty() {
        godot_error!("[QGrassField] compute compile failed: {err}");
        return None;
    }
    let shader = rd.shader_create_from_spirv(&spirv);
    if !shader.is_valid() {
        return None;
    }
    Some(shader)
}

fn storage_uniform(binding: i32, buffer: Rid) -> Gd<RdUniform> {
    let mut u = RdUniform::new_gd();
    u.set_uniform_type(UniformType::STORAGE_BUFFER);
    u.set_binding(binding);
    u.add_id(buffer);
    u
}

impl BladeCompute {
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        scenario: Rid,
        world_aabb: Aabb,
        detailed_mesh: Rid,
        simple_mesh: Rid,
        material: Rid,
        layouts: &[f32],
        blade_count: u32,
        cell_capacity: u32,
        cap_near: u32,
        cap_far: u32,
        heightmap_tex: Rid,
        clearance_tex: Rid,
        terrain_extent: f32,
        water_level: f32,
    ) -> Option<Self> {
        if !heightmap_tex.is_valid() || !clearance_tex.is_valid() {
            return None;
        }
        let mut rd = RenderingServer::singleton().get_rendering_device()?;
        let mut sampler_state = RdSamplerState::new_gd();
        sampler_state.set_min_filter(SamplerFilter::LINEAR);
        sampler_state.set_mag_filter(SamplerFilter::LINEAR);
        sampler_state.set_repeat_u(SamplerRepeatMode::CLAMP_TO_EDGE);
        sampler_state.set_repeat_v(SamplerRepeatMode::CLAMP_TO_EDGE);
        let sampler = rd.sampler_create(&sampler_state);
        let cull_shader = compile(&mut rd, CULL_GLSL)?;
        let resolve_shader = compile(&mut rd, RESOLVE_GLSL)?;
        let cull_pipeline = rd.compute_pipeline_create(cull_shader);
        let resolve_pipeline = rd.compute_pipeline_create(resolve_shader);

        let layout_bytes = PackedFloat32Array::from(layouts).to_byte_array();
        let layouts_buf = rd
            .storage_buffer_create_ex(layout_bytes.len() as u32)
            .data(&layout_bytes)
            .done();
        let cells_buf = rd.storage_buffer_create((cell_capacity * 16) as u32);
        let counter_buf = rd.storage_buffer_create(8);

        let mut rs = RenderingServer::singleton();
        let mut make_mm = |cap: u32, mesh: Rid| {
            let mm = rs.multimesh_create();
            rs.multimesh_allocate_data_ex(mm, cap as i32, MultimeshTransformFormat::TRANSFORM_3D)
                .custom_data_format(true)
                .use_indirect(true)
                .done();
            rs.multimesh_set_mesh(mm, mesh);
            mm
        };
        let mm_near = make_mm(cap_near, detailed_mesh);
        let mm_far = make_mm(cap_far, simple_mesh);

        let mut make_inst = |mm: Rid| {
            let inst = rs.instance_create();
            rs.instance_set_scenario(inst, scenario);
            rs.instance_set_base(inst, mm);
            rs.instance_geometry_set_material_override(inst, material);
            rs.instance_geometry_set_cast_shadows_setting(inst, ShadowCastingSetting::OFF);
            rs.instance_set_custom_aabb(inst, world_aabb);
            rs.instance_set_transform(inst, Transform3D::IDENTITY);
            inst
        };
        let inst_near = make_inst(mm_near);
        let inst_far = make_inst(mm_far);

        let mut zero_counter = PackedByteArray::new();
        zero_counter.resize(8);

        Some(Self {
            rd,
            cull_shader,
            cull_pipeline,
            resolve_shader,
            resolve_pipeline,
            cull_set: Rid::Invalid,
            resolve_set: Rid::Invalid,
            layouts_buf,
            cells_buf,
            counter_buf,
            mm_near,
            mm_far,
            inst_near,
            inst_far,
            blade_count,
            cell_capacity,
            cell_count: 0,
            cap_near,
            cap_far,
            zero_counter,
            heightmap_tex,
            clearance_tex,
            sampler,
            terrain_extent,
            water_level,
        })
    }

    pub fn online(&self) -> bool {
        self.cull_set.is_valid()
    }

    pub fn try_finalize(&mut self) -> bool {
        if self.online() {
            return true;
        }
        let rs = RenderingServer::singleton();
        let near_buf = rs.multimesh_get_buffer_rd_rid(self.mm_near);
        let far_buf = rs.multimesh_get_buffer_rd_rid(self.mm_far);
        let cmd_near = rs.multimesh_get_command_buffer_rd_rid(self.mm_near);
        let cmd_far = rs.multimesh_get_command_buffer_rd_rid(self.mm_far);
        let hm_rd = rs.texture_get_rd_texture(self.heightmap_tex);
        let clr_rd = rs.texture_get_rd_texture(self.clearance_tex);
        if !near_buf.is_valid()
            || !far_buf.is_valid()
            || !cmd_near.is_valid()
            || !cmd_far.is_valid()
            || !hm_rd.is_valid()
            || !clr_rd.is_valid()
        {
            return false;
        }
        let mut hm_uniform = RdUniform::new_gd();
        hm_uniform.set_uniform_type(UniformType::SAMPLER_WITH_TEXTURE);
        hm_uniform.set_binding(5);
        hm_uniform.add_id(self.sampler);
        hm_uniform.add_id(hm_rd);
        let mut clr_uniform = RdUniform::new_gd();
        clr_uniform.set_uniform_type(UniformType::SAMPLER_WITH_TEXTURE);
        clr_uniform.set_binding(6);
        clr_uniform.add_id(self.sampler);
        clr_uniform.add_id(clr_rd);
        let cull_uniforms: Array<Gd<RdUniform>> = [
            storage_uniform(0, self.layouts_buf),
            storage_uniform(1, self.cells_buf),
            storage_uniform(2, near_buf),
            storage_uniform(3, far_buf),
            storage_uniform(4, self.counter_buf),
            hm_uniform,
            clr_uniform,
        ]
        .into_iter()
        .collect();
        self.cull_set = self
            .rd
            .uniform_set_create(&cull_uniforms, self.cull_shader, 0);
        let resolve_uniforms: Array<Gd<RdUniform>> = [
            storage_uniform(0, self.counter_buf),
            storage_uniform(1, cmd_near),
            storage_uniform(2, cmd_far),
        ]
        .into_iter()
        .collect();
        self.resolve_set = self
            .rd
            .uniform_set_create(&resolve_uniforms, self.resolve_shader, 0);
        self.cull_set.is_valid() && self.resolve_set.is_valid()
    }

    pub fn update_cells(&mut self, entries: &[f32]) {
        let count = (entries.len() / 4) as u32;
        self.cell_count = count.min(self.cell_capacity);
        if self.cell_count == 0 {
            return;
        }
        let bytes =
            PackedFloat32Array::from(&entries[..(self.cell_count * 4) as usize]).to_byte_array();
        self.rd
            .buffer_update(self.cells_buf, 0, bytes.len() as u32, &bytes);
    }

    pub fn dispatch(
        &mut self,
        cam_pos: Vector3,
        planes: &[Plane; 4],
        thin_start: f32,
        blade_range: f32,
        lod_near: f32,
    ) {
        if !self.online() {
            return;
        }
        self.rd
            .buffer_update(self.counter_buf, 0, 8, &self.zero_counter);
        let mut pc = [0.0f32; 32];
        pc[0] = cam_pos.x;
        pc[1] = cam_pos.y;
        pc[2] = cam_pos.z;
        pc[3] = self.cell_count as f32;
        for (i, p) in planes.iter().enumerate() {
            let o = 4 + i * 4;
            pc[o] = p.normal.x;
            pc[o + 1] = p.normal.y;
            pc[o + 2] = p.normal.z;
            pc[o + 3] = p.d;
        }
        pc[20] = thin_start;
        pc[21] = blade_range;
        pc[22] = lod_near;
        pc[23] = self.blade_count as f32;
        pc[24] = self.cap_near as f32;
        pc[25] = self.cap_far as f32;
        pc[28] = self.terrain_extent;
        pc[29] = self.water_level;
        pc[30] = if occlusion_enabled() {
            OCCLUSION_START
        } else {
            1.0e9
        };
        pc[31] = OCCLUSION_MARGIN;
        let pc_bytes = PackedFloat32Array::from(&pc[..]).to_byte_array();
        let caps_bytes = PackedFloat32Array::from(&pc[24..28]).to_byte_array();
        let cl = self.rd.compute_list_begin();
        if self.cell_count > 0 {
            let total = self.cell_count * self.blade_count;
            let groups = total.div_ceil(64);
            self.rd
                .compute_list_bind_compute_pipeline(cl, self.cull_pipeline);
            self.rd.compute_list_bind_uniform_set(cl, self.cull_set, 0);
            self.rd
                .compute_list_set_push_constant(cl, &pc_bytes, pc_bytes.len() as u32);
            self.rd.compute_list_dispatch(cl, groups, 1, 1);
        }
        self.rd
            .compute_list_bind_compute_pipeline(cl, self.resolve_pipeline);
        self.rd
            .compute_list_bind_uniform_set(cl, self.resolve_set, 0);
        self.rd
            .compute_list_set_push_constant(cl, &caps_bytes, caps_bytes.len() as u32);
        self.rd.compute_list_dispatch(cl, 1, 1, 1);
        self.rd.compute_list_end();
    }

    pub fn set_visible(&mut self, visible: bool) {
        let mut rs = RenderingServer::singleton();
        rs.instance_set_visible(self.inst_near, visible);
        rs.instance_set_visible(self.inst_far, visible);
    }

    pub fn free(&mut self) {
        let mut rs = RenderingServer::singleton();
        for rid in [self.inst_near, self.inst_far, self.mm_near, self.mm_far] {
            if rid.is_valid() {
                rs.free_rid(rid);
            }
        }
        for rid in [
            self.layouts_buf,
            self.cells_buf,
            self.counter_buf,
            self.sampler,
            self.cull_pipeline,
            self.cull_shader,
            self.resolve_pipeline,
            self.resolve_shader,
        ] {
            if rid.is_valid() {
                self.rd.free_rid(rid);
            }
        }
        self.cull_set = Rid::Invalid;
        self.resolve_set = Rid::Invalid;
    }
}

pub struct CardCompute {
    rd: Gd<RenderingDevice>,
    cull_shader: Rid,
    cull_pipeline: Rid,
    resolve_shader: Rid,
    resolve_pipeline: Rid,
    cull_set: Rid,
    resolve_set: Rid,
    layouts_buf: Rid,
    cells_buf: Rid,
    counter_buf: Rid,
    mm: Rid,
    inst: Rid,
    count_per_cell: u32,
    cell_capacity: u32,
    cell_count: u32,
    cap: u32,
    heightmap_tex: Rid,
    clearance_tex: Rid,
    sampler: Rid,
    zero_counter: PackedByteArray,
}

impl CardCompute {
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        scenario: Rid,
        world_aabb: Aabb,
        mesh: Rid,
        material: Rid,
        layouts: &[f32],
        count_per_cell: u32,
        cell_capacity: u32,
        cap: u32,
        heightmap_tex: Rid,
        clearance_tex: Rid,
        params: &CardParams,
    ) -> Option<Self> {
        if !heightmap_tex.is_valid() || !clearance_tex.is_valid() {
            return None;
        }
        let mut rd = RenderingServer::singleton().get_rendering_device()?;
        let subs = [
            ("%BLADE_RANGE%", glsl_f(params.blade_range)),
            ("%CARD_TAIL%", glsl_f(params.card_tail)),
            ("%CARD_FLOOR%", glsl_f(params.card_floor)),
            ("%FADE_END%", glsl_f(params.fade_end)),
            ("%BAND_START%", glsl_f(params.band_out_start)),
            ("%BAND_END%", glsl_f(params.band_out_end)),
            ("%EXTENT%", glsl_f(params.terrain_extent)),
            ("%WATER%", glsl_f(params.water_level)),
            ("%OCCL_START%", glsl_f(params.occl_start)),
            ("%OCCL_MARGIN%", glsl_f(params.occl_margin)),
            ("%COUNT%", count_per_cell.to_string()),
            ("%CAP%", cap.to_string()),
        ];
        let cull_src = bake(CARD_CULL_GLSL, &subs);
        let resolve_src = bake(CARD_RESOLVE_GLSL, &[("%CAP%", cap.to_string())]);
        let cull_shader = compile(&mut rd, &cull_src)?;
        let resolve_shader = compile(&mut rd, &resolve_src)?;
        let cull_pipeline = rd.compute_pipeline_create(cull_shader);
        let resolve_pipeline = rd.compute_pipeline_create(resolve_shader);

        let mut sampler_state = RdSamplerState::new_gd();
        sampler_state.set_min_filter(SamplerFilter::LINEAR);
        sampler_state.set_mag_filter(SamplerFilter::LINEAR);
        sampler_state.set_repeat_u(SamplerRepeatMode::CLAMP_TO_EDGE);
        sampler_state.set_repeat_v(SamplerRepeatMode::CLAMP_TO_EDGE);
        let sampler = rd.sampler_create(&sampler_state);

        let layout_bytes = PackedFloat32Array::from(layouts).to_byte_array();
        let layouts_buf = rd
            .storage_buffer_create_ex(layout_bytes.len() as u32)
            .data(&layout_bytes)
            .done();
        let cells_buf = rd.storage_buffer_create(cell_capacity * 16);
        let counter_buf = rd.storage_buffer_create(4);

        let mut rs = RenderingServer::singleton();
        let mm = rs.multimesh_create();
        rs.multimesh_allocate_data_ex(mm, cap as i32, MultimeshTransformFormat::TRANSFORM_3D)
            .custom_data_format(true)
            .use_indirect(true)
            .done();
        rs.multimesh_set_mesh(mm, mesh);

        let inst = rs.instance_create();
        rs.instance_set_scenario(inst, scenario);
        rs.instance_set_base(inst, mm);
        rs.instance_geometry_set_material_override(inst, material);
        rs.instance_geometry_set_cast_shadows_setting(inst, ShadowCastingSetting::OFF);
        rs.instance_set_custom_aabb(inst, world_aabb);
        rs.instance_set_transform(inst, Transform3D::IDENTITY);

        let mut zero_counter = PackedByteArray::new();
        zero_counter.resize(4);

        Some(Self {
            rd,
            cull_shader,
            cull_pipeline,
            resolve_shader,
            resolve_pipeline,
            cull_set: Rid::Invalid,
            resolve_set: Rid::Invalid,
            layouts_buf,
            cells_buf,
            counter_buf,
            mm,
            inst,
            count_per_cell,
            cell_capacity,
            cell_count: 0,
            cap,
            heightmap_tex,
            clearance_tex,
            sampler,
            zero_counter,
        })
    }

    pub fn online(&self) -> bool {
        self.cull_set.is_valid()
    }

    pub fn try_finalize(&mut self) -> bool {
        if self.online() {
            return true;
        }
        let rs = RenderingServer::singleton();
        let out_buf = rs.multimesh_get_buffer_rd_rid(self.mm);
        let cmd_buf = rs.multimesh_get_command_buffer_rd_rid(self.mm);
        let hm_rd = rs.texture_get_rd_texture(self.heightmap_tex);
        let clr_rd = rs.texture_get_rd_texture(self.clearance_tex);
        if !out_buf.is_valid() || !cmd_buf.is_valid() || !hm_rd.is_valid() || !clr_rd.is_valid() {
            return false;
        }
        let mut hm_uniform = RdUniform::new_gd();
        hm_uniform.set_uniform_type(UniformType::SAMPLER_WITH_TEXTURE);
        hm_uniform.set_binding(4);
        hm_uniform.add_id(self.sampler);
        hm_uniform.add_id(hm_rd);
        let mut clr_uniform = RdUniform::new_gd();
        clr_uniform.set_uniform_type(UniformType::SAMPLER_WITH_TEXTURE);
        clr_uniform.set_binding(5);
        clr_uniform.add_id(self.sampler);
        clr_uniform.add_id(clr_rd);
        let cull_uniforms: Array<Gd<RdUniform>> = [
            storage_uniform(0, self.layouts_buf),
            storage_uniform(1, self.cells_buf),
            storage_uniform(2, out_buf),
            storage_uniform(3, self.counter_buf),
            hm_uniform,
            clr_uniform,
        ]
        .into_iter()
        .collect();
        self.cull_set = self
            .rd
            .uniform_set_create(&cull_uniforms, self.cull_shader, 0);
        let resolve_uniforms: Array<Gd<RdUniform>> = [
            storage_uniform(0, self.counter_buf),
            storage_uniform(1, cmd_buf),
        ]
        .into_iter()
        .collect();
        self.resolve_set = self
            .rd
            .uniform_set_create(&resolve_uniforms, self.resolve_shader, 0);
        self.cull_set.is_valid() && self.resolve_set.is_valid()
    }

    pub fn update_cells(&mut self, entries: &[f32]) {
        let count = (entries.len() / 4) as u32;
        self.cell_count = count.min(self.cell_capacity);
        if self.cell_count == 0 {
            return;
        }
        let bytes =
            PackedFloat32Array::from(&entries[..(self.cell_count * 4) as usize]).to_byte_array();
        self.rd
            .buffer_update(self.cells_buf, 0, bytes.len() as u32, &bytes);
    }

    pub fn dispatch(&mut self, cam_pos: Vector3, planes: &[Plane; 4]) {
        if !self.online() {
            return;
        }
        self.rd
            .buffer_update(self.counter_buf, 0, 4, &self.zero_counter);
        let mut pc = [0.0f32; 20];
        pc[0] = cam_pos.x;
        pc[1] = cam_pos.y;
        pc[2] = cam_pos.z;
        pc[3] = self.cell_count as f32;
        for (i, p) in planes.iter().enumerate() {
            let o = 4 + i * 4;
            pc[o] = p.normal.x;
            pc[o + 1] = p.normal.y;
            pc[o + 2] = p.normal.z;
            pc[o + 3] = p.d;
        }
        let pc_bytes = PackedFloat32Array::from(&pc[..]).to_byte_array();
        let cl = self.rd.compute_list_begin();
        if self.cell_count > 0 {
            let total = self.cell_count * self.count_per_cell;
            let groups = total.div_ceil(64);
            self.rd
                .compute_list_bind_compute_pipeline(cl, self.cull_pipeline);
            self.rd.compute_list_bind_uniform_set(cl, self.cull_set, 0);
            self.rd
                .compute_list_set_push_constant(cl, &pc_bytes, pc_bytes.len() as u32);
            self.rd.compute_list_dispatch(cl, groups, 1, 1);
        }
        self.rd
            .compute_list_bind_compute_pipeline(cl, self.resolve_pipeline);
        self.rd
            .compute_list_bind_uniform_set(cl, self.resolve_set, 0);
        self.rd.compute_list_dispatch(cl, 1, 1, 1);
        self.rd.compute_list_end();
    }

    pub fn set_visible(&mut self, visible: bool) {
        let mut rs = RenderingServer::singleton();
        rs.instance_set_visible(self.inst, visible);
    }

    pub fn free(&mut self) {
        let mut rs = RenderingServer::singleton();
        for rid in [self.inst, self.mm] {
            if rid.is_valid() {
                rs.free_rid(rid);
            }
        }
        for rid in [
            self.layouts_buf,
            self.cells_buf,
            self.counter_buf,
            self.sampler,
            self.cull_pipeline,
            self.cull_shader,
            self.resolve_pipeline,
            self.resolve_shader,
        ] {
            if rid.is_valid() {
                self.rd.free_rid(rid);
            }
        }
        self.cull_set = Rid::Invalid;
        self.resolve_set = Rid::Invalid;
    }
}

impl BladeCompute {
    pub fn survivor_counts(&mut self) -> (u32, u32) {
        if !self.online() {
            return (0, 0);
        }
        let data = self.rd.buffer_get_data(self.counter_buf);
        let bytes = data.as_slice();
        if bytes.len() < 8 {
            return (0, 0);
        }
        let near = u32::from_le_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]);
        let far = u32::from_le_bytes([bytes[4], bytes[5], bytes[6], bytes[7]]);
        (near, far)
    }
}

impl CardCompute {
    pub fn survivor_count(&mut self) -> u32 {
        if !self.online() {
            return 0;
        }
        let data = self.rd.buffer_get_data(self.counter_buf);
        let bytes = data.as_slice();
        if bytes.len() < 4 {
            return 0;
        }
        u32::from_le_bytes([bytes[0], bytes[1], bytes[2], bytes[3]])
    }
}

impl BladeCompute {
    pub fn caps(&self) -> (u32, u32) {
        (self.cap_near, self.cap_far)
    }
}

impl CardCompute {
    pub fn cap(&self) -> u32 {
        self.cap
    }
}

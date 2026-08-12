use godot::classes::rendering_device::{ShaderLanguage, ShaderStage, UniformType};
use godot::classes::rendering_server::{MultimeshTransformFormat, ShadowCastingSetting};
use godot::classes::{RdShaderSource, RdUniform, RenderingDevice, RenderingServer};
use godot::prelude::*;

const FLORA_CULL_GLSL: &str = r#"
#version 450
layout(local_size_x = 64) in;
layout(set = 0, binding = 0, std430) restrict readonly buffer Cand { float data[]; } cand;
layout(set = 0, binding = 1, std430) restrict writeonly buffer OutB { float data[]; } outb;
layout(set = 0, binding = 2, std430) restrict buffer Counter { uint data[]; } counter;
layout(set = 0, binding = 3, std430) restrict readonly buffer Heights { float data[]; } hmap;
layout(push_constant, std430) uniform Params {
    vec4 cam;
    vec4 p0;
    vec4 p1;
    vec4 p2;
    vec4 p3;
} pc;

const float FADE_END = %FADE_END%;
const float DIST_MIN = %DIST_MIN%;
const float RANK_FADE = %RANK_FADE%;
const float GROWTH_ON = %GROWTH_ON%;
const float BAND0 = %BAND0%;
const float BAND1 = %BAND1%;
const float BAND_OUT = %BAND_OUT%;
const uint COUNT = %COUNT%u;
const uint CAP = %CAP%u;
const float EXTENT = %EXTENT%;
const int HRES = %HRES%;
const float OCCL_START = %OCCL_START%;
const int OCCL_STEPS = %OCCL_STEPS%;
const float OCCL_BIAS = %OCCL_BIAS%;

shared uint local_cnt;
shared uint base_slot;

bool outside(vec4 plane, vec3 pos, float m) {
    return dot(plane.xyz, pos) - plane.w > m;
}

float terrain_at(vec2 p) {
    vec2 uv = clamp((p + EXTENT) / (EXTENT * 2.0), 0.0, 1.0) * float(HRES - 1);
    ivec2 i0 = ivec2(uv);
    ivec2 i1 = min(i0 + 1, ivec2(HRES - 1));
    vec2 f = fract(uv);
    float h00 = hmap.data[i0.y * HRES + i0.x];
    float h10 = hmap.data[i0.y * HRES + i1.x];
    float h01 = hmap.data[i1.y * HRES + i0.x];
    float h11 = hmap.data[i1.y * HRES + i1.x];
    return mix(mix(h00, h10, f.x), mix(h01, h11, f.x), f.y);
}

// Frustum culling keeps whatever is in front of the camera, including the far
// side of a hill. Walking the terrain between the instance and the eye is what
// drops those: if the ground stands above the sight line anywhere along the
// way, nothing at that spot can be seen. Tested against the top of the
// instance, so the whole thing is hidden before it is dropped.
bool occluded(vec3 top, vec3 eye) {
    if (OCCL_STEPS <= 0 || distance(top.xz, eye.xz) < OCCL_START) {
        return false;
    }
    vec3 d = eye - top;
    for (int i = 1; i < OCCL_STEPS; i++) {
        vec3 sp = top + d * (float(i) / float(OCCL_STEPS));
        if (terrain_at(sp.xz) > sp.y + OCCL_BIAS) {
            return true;
        }
    }
    return false;
}

void main() {
    if (gl_LocalInvocationIndex == 0u) {
        local_cnt = 0u;
    }
    barrier();
    uint id = gl_GlobalInvocationID.x;
    bool alive = id < COUNT;
    float x = 0.0;
    float y = 0.0;
    float z = 0.0;
    float s = 1.0;
    float rank = 0.0;
    float fade = 1.0;
    uint src = id * 8u;
    if (alive) {
        x = cand.data[src];
        y = cand.data[src + 1u];
        z = cand.data[src + 2u];
        s = cand.data[src + 3u];
        rank = cand.data[src + 4u];
        if (GROWTH_ON > 0.5) {
            s *= mix(0.7, 1.25, clamp(pc.cam.w + rank * 0.3 - 0.15, 0.0, 1.0));
        }
        float d = distance(vec2(x, z), pc.cam.xz);
        float keep = RANK_FADE > 0.5 ? 1.0 - smoothstep(FADE_END * 0.7, FADE_END, d) : 1.0;
        alive = d >= DIST_MIN && d < FADE_END && rank <= keep;
        if (BAND1 > BAND0) {
            float bf = smoothstep(BAND0, BAND1, d);
            fade = mix(bf, 1.0 - bf, BAND_OUT);
        }
        if (alive) {
            vec3 pos = vec3(x, y + s * 0.5, z);
            float m = s + 1.5;
            alive = !(outside(pc.p0, pos, m) || outside(pc.p1, pos, m)
                || outside(pc.p2, pos, m) || outside(pc.p3, pos, m));
        }
        if (alive) {
            alive = !occluded(vec3(x, y + s, z), pc.cam.xyz);
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
    float kind = cand.data[src + 5u];
    float phase = cand.data[src + 6u];
    uint o = slot * 16u;
    outb.data[o] = s;
    outb.data[o + 1u] = 0.0;
    outb.data[o + 2u] = 0.0;
    outb.data[o + 3u] = x;
    outb.data[o + 4u] = 0.0;
    outb.data[o + 5u] = s;
    outb.data[o + 6u] = 0.0;
    outb.data[o + 7u] = y;
    outb.data[o + 8u] = 0.0;
    outb.data[o + 9u] = 0.0;
    outb.data[o + 10u] = s;
    outb.data[o + 11u] = z;
    outb.data[o + 12u] = rank;
    outb.data[o + 13u] = kind;
    outb.data[o + 14u] = phase;
    outb.data[o + 15u] = fade;
}
"#;

const FLORA_RESOLVE_GLSL: &str = r#"
#version 450
layout(local_size_x = 1) in;
layout(set = 0, binding = 0, std430) restrict readonly buffer Counter { uint data[]; } counter;
layout(set = 0, binding = 1, std430) restrict buffer Cmd { uint data[]; } cmd;

void main() {
    uint n = min(counter.data[0], %CAP%u);
    for (uint i = 0u; i < %SURF%u; i++) {
        cmd.data[i * 5u + 1u] = n;
    }
}
"#;

fn bake(src: &str, subs: &[(&str, String)]) -> String {
    let mut out = src.to_string();
    for (key, val) in subs {
        out = out.replace(key, val);
    }
    out
}

fn compile(rd: &mut Gd<RenderingDevice>, src: &str) -> Option<Rid> {
    let mut source = RdShaderSource::new_gd();
    source.set_language(ShaderLanguage::GLSL);
    source.set_stage_source(ShaderStage::COMPUTE, src);
    let spirv = rd.shader_compile_spirv_from_source(&source)?;
    let err = spirv.get_stage_compile_error(ShaderStage::COMPUTE);
    if !err.is_empty() {
        godot_error!("[QFloraField] compute compile failed: {err}");
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

/// Terrain the cull pass tests sight lines against. Carries its own dummy so a
/// field that readies before the terrain still builds a valid uniform set, just
/// with the occlusion step switched off.
pub struct TerrainOcclusion {
    pub heights: Vec<f32>,
    pub res: i32,
    pub extent: f32,
    pub start: f32,
    pub steps: i32,
    pub bias: f32,
}

impl TerrainOcclusion {
    pub fn new(heights: &[f32], res: i32, extent: f32, start: f32) -> Self {
        Self {
            heights: heights.to_vec(),
            res,
            extent,
            start,
            steps: 12,
            bias: 0.75,
        }
    }

    pub fn disabled() -> Self {
        Self {
            heights: Vec::new(),
            res: 0,
            extent: 1.0,
            start: 0.0,
            steps: 0,
            bias: 0.0,
        }
    }

    fn usable(&self) -> bool {
        self.steps > 0 && self.res >= 2 && self.heights.len() >= (self.res * self.res) as usize
    }

    fn res(&self) -> i32 {
        if self.usable() { self.res } else { 2 }
    }

    fn steps(&self) -> i32 {
        if self.usable() { self.steps } else { 0 }
    }

    fn sample_data(&self) -> &[f32] {
        if self.usable() {
            &self.heights
        } else {
            &[0.0, 0.0, 0.0, 0.0]
        }
    }
}

pub struct FloraCompute {
    rd: Gd<RenderingDevice>,
    cull_shader: Rid,
    cull_pipeline: Rid,
    resolve_shader: Rid,
    resolve_pipeline: Rid,
    cull_set: Rid,
    resolve_set: Rid,
    cand_buf: Rid,
    counter_buf: Rid,
    height_buf: Rid,
    mm: Rid,
    inst: Rid,
    count: u32,
    cap: u32,
    zero_counter: PackedByteArray,
    pub growth: f32,
}

impl FloraCompute {
    pub fn new(
        scenario: Rid,
        world_aabb: Aabb,
        mesh: Rid,
        material: Rid,
        candidates: &[f32],
        cap: u32,
        fade_end: f32,
        dist_min: f32,
        band: (f32, f32, bool),
        rank_fade: bool,
        growth_on: bool,
        shadows: bool,
        surfaces: u32,
        terrain: TerrainOcclusion,
    ) -> Option<Self> {
        let count = (candidates.len() / 8) as u32;
        if count == 0 || cap == 0 {
            return None;
        }
        let mut rd = RenderingServer::singleton().get_rendering_device()?;
        let subs = [
            ("%FADE_END%", format!("{fade_end:.6}")),
            ("%DIST_MIN%", format!("{dist_min:.6}")),
            ("%BAND0%", format!("{:.6}", band.0)),
            ("%BAND1%", format!("{:.6}", band.1)),
            ("%BAND_OUT%", if band.2 { "1.0" } else { "0.0" }.to_string()),
            (
                "%RANK_FADE%",
                if rank_fade { "1.0" } else { "0.0" }.to_string(),
            ),
            (
                "%GROWTH_ON%",
                if growth_on { "1.0" } else { "0.0" }.to_string(),
            ),
            ("%COUNT%", count.to_string()),
            ("%CAP%", cap.to_string()),
            ("%EXTENT%", format!("{:.6}", terrain.extent.max(1.0))),
            ("%HRES%", terrain.res().to_string()),
            ("%OCCL_START%", format!("{:.6}", terrain.start)),
            ("%OCCL_STEPS%", terrain.steps().to_string()),
            ("%OCCL_BIAS%", format!("{:.6}", terrain.bias)),
        ];
        let cull_src = bake(FLORA_CULL_GLSL, &subs);
        let resolve_src = bake(
            FLORA_RESOLVE_GLSL,
            &[
                ("%CAP%", cap.to_string()),
                ("%SURF%", surfaces.max(1).to_string()),
            ],
        );
        let cull_shader = compile(&mut rd, &cull_src)?;
        let resolve_shader = compile(&mut rd, &resolve_src)?;
        let cull_pipeline = rd.compute_pipeline_create(cull_shader);
        let resolve_pipeline = rd.compute_pipeline_create(resolve_shader);

        let cand_bytes = PackedFloat32Array::from(candidates).to_byte_array();
        let cand_buf = rd
            .storage_buffer_create_ex(cand_bytes.len() as u32)
            .data(&cand_bytes)
            .done();
        let counter_buf = rd.storage_buffer_create(4);
        // Always allocated, even with occlusion off: the binding has to exist for
        // the uniform set to validate, and a one-float dummy is cheaper than a
        // second shader variant.
        let height_bytes = PackedFloat32Array::from(terrain.sample_data()).to_byte_array();
        let height_buf = rd
            .storage_buffer_create_ex(height_bytes.len() as u32)
            .data(&height_bytes)
            .done();

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
        if material.is_valid() {
            rs.instance_geometry_set_material_override(inst, material);
        }
        rs.instance_geometry_set_cast_shadows_setting(
            inst,
            if shadows {
                ShadowCastingSetting::ON
            } else {
                ShadowCastingSetting::OFF
            },
        );
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
            cand_buf,
            counter_buf,
            height_buf,
            mm,
            inst,
            count,
            cap,
            zero_counter,
            growth: 0.5,
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
        if !out_buf.is_valid() || !cmd_buf.is_valid() {
            return false;
        }
        let cull_uniforms: Array<Gd<RdUniform>> = [
            storage_uniform(0, self.cand_buf),
            storage_uniform(1, out_buf),
            storage_uniform(2, self.counter_buf),
            storage_uniform(3, self.height_buf),
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
        pc[3] = self.growth;
        for (i, p) in planes.iter().enumerate() {
            let o = 4 + i * 4;
            pc[o] = p.normal.x;
            pc[o + 1] = p.normal.y;
            pc[o + 2] = p.normal.z;
            pc[o + 3] = p.d;
        }
        let pc_bytes = PackedFloat32Array::from(&pc[..]).to_byte_array();
        let cl = self.rd.compute_list_begin();
        let groups = self.count.div_ceil(64);
        self.rd
            .compute_list_bind_compute_pipeline(cl, self.cull_pipeline);
        self.rd.compute_list_bind_uniform_set(cl, self.cull_set, 0);
        self.rd
            .compute_list_set_push_constant(cl, &pc_bytes, pc_bytes.len() as u32);
        self.rd.compute_list_dispatch(cl, groups, 1, 1);
        self.rd
            .compute_list_bind_compute_pipeline(cl, self.resolve_pipeline);
        self.rd
            .compute_list_bind_uniform_set(cl, self.resolve_set, 0);
        self.rd.compute_list_dispatch(cl, 1, 1, 1);
        self.rd.compute_list_end();
    }

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

    pub fn cap(&self) -> u32 {
        self.cap
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
            self.cand_buf,
            self.counter_buf,
            self.height_buf,
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

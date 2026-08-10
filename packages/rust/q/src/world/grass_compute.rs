use godot::classes::rendering_device::{ShaderLanguage, ShaderStage, UniformType};
use godot::classes::rendering_server::{MultimeshTransformFormat, ShadowCastingSetting};
use godot::classes::{RdShaderSource, RdUniform, RenderingDevice, RenderingServer};
use godot::prelude::*;

const CULL_GLSL: &str = r#"
#version 450
layout(local_size_x = 64) in;
layout(set = 0, binding = 0, std430) restrict readonly buffer Layouts { float data[]; } layouts;
layout(set = 0, binding = 1, std430) restrict readonly buffer Cells { vec4 data[]; } cells;
layout(set = 0, binding = 2, std430) restrict writeonly buffer OutNear { float data[]; } out_near;
layout(set = 0, binding = 3, std430) restrict writeonly buffer OutFar { float data[]; } out_far;
layout(set = 0, binding = 4, std430) restrict buffer Counter { uint data[]; } counter;
layout(push_constant, std430) uniform Params {
    vec4 cam;
    vec4 p0;
    vec4 p1;
    vec4 p2;
    vec4 p3;
    vec4 fade;
    vec4 caps;
} pc;

bool outside(vec4 plane, vec3 pos) {
    return dot(plane.xyz, pos) - plane.w > 2.0 + abs(plane.y) * 30.0;
}

void main() {
    uint blade_count = uint(pc.fade.w);
    uint id = gl_GlobalInvocationID.x;
    uint cell = id / blade_count;
    if (cell >= uint(pc.cam.w)) {
        return;
    }
    uint blade = id - cell * blade_count;
    vec4 cinfo = cells.data[cell];
    uint src = uint(cinfo.z) + blade * 12u;
    float wx = layouts.data[src + 3u] + cinfo.x;
    float wz = layouts.data[src + 11u] + cinfo.y;
    float d = distance(vec2(wx, wz), pc.cam.xz);
    float t = smoothstep(pc.fade.x, pc.fade.y, d);
    float density = 1.0 - t * t;
    float rank = float(blade) / float(blade_count) * 0.95;
    if (rank >= density) {
        return;
    }
    vec3 pos = vec3(wx, pc.cam.y, wz);
    if (outside(pc.p0, pos) || outside(pc.p1, pos) || outside(pc.p2, pos) || outside(pc.p3, pos)) {
        return;
    }
    bool near = d < pc.fade.z;
    uint slot = atomicAdd(counter.data[near ? 0u : 1u], 1u);
    if (slot >= uint(near ? pc.caps.x : pc.caps.y)) {
        return;
    }
    uint o = slot * 16u;
    float shape = fract(float(blade) * 0.75487766 + cinfo.w * 0.618034);
    if (near) {
        for (uint k = 0u; k < 12u; k++) {
            out_near.data[o + k] = layouts.data[src + k];
        }
        out_near.data[o + 3u] = wx;
        out_near.data[o + 11u] = wz;
        out_near.data[o + 12u] = rank;
        out_near.data[o + 13u] = shape;
        out_near.data[o + 14u] = 0.0;
        out_near.data[o + 15u] = 0.0;
    } else {
        for (uint k = 0u; k < 12u; k++) {
            out_far.data[o + k] = layouts.data[src + k];
        }
        out_far.data[o + 3u] = wx;
        out_far.data[o + 11u] = wz;
        out_far.data[o + 12u] = rank;
        out_far.data[o + 13u] = shape;
        out_far.data[o + 14u] = 0.0;
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
    ) -> Option<Self> {
        let mut rd = RenderingServer::singleton().get_rendering_device()?;
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
            let mut zeros = PackedFloat32Array::new();
            zeros.resize((cap * 16) as usize);
            rs.multimesh_set_buffer(mm, &zeros);
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
        if !near_buf.is_valid()
            || !far_buf.is_valid()
            || !cmd_near.is_valid()
            || !cmd_far.is_valid()
        {
            return false;
        }
        let cull_uniforms: Array<Gd<RdUniform>> = [
            storage_uniform(0, self.layouts_buf),
            storage_uniform(1, self.cells_buf),
            storage_uniform(2, near_buf),
            storage_uniform(3, far_buf),
            storage_uniform(4, self.counter_buf),
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
        if !self.online() || self.cell_count == 0 {
            return;
        }
        self.rd
            .buffer_update(self.counter_buf, 0, 8, &self.zero_counter);
        let mut pc = [0.0f32; 28];
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
        let pc_bytes = PackedFloat32Array::from(&pc[..]).to_byte_array();
        let caps_bytes = PackedFloat32Array::from(&pc[24..28]).to_byte_array();
        let total = self.cell_count * self.blade_count;
        let groups = total.div_ceil(64);
        let cl = self.rd.compute_list_begin();
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

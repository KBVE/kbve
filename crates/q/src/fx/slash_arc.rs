use godot::classes::mesh::{ArrayType, PrimitiveType};
use godot::classes::{ArrayMesh, Engine, INode3D, MeshInstance3D, Shader, ShaderMaterial};
use godot::prelude::*;

const SLASH_SHADER: &str = r#"
shader_type spatial;
render_mode unshaded, blend_mix, depth_draw_never, cull_disabled, specular_disabled;

uniform vec3 tint : source_color = vec3(1.0, 0.8, 0.3);
uniform float progress = 0.0;
uniform float trail = 0.45;

float hash2(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}

float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    float a = hash2(i);
    float b = hash2(i + vec2(1.0, 0.0));
    float c = hash2(i + vec2(0.0, 1.0));
    float d = hash2(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

void fragment() {
    float head = progress * (1.0 + trail);
    float lead = step(UV.x, head);
    float taper = step(abs(UV.y - 0.5), 0.5 * (1.0 - 0.45 * UV.x));
    float t_local = clamp((head - UV.x) / trail, 0.0, 1.0);
    float n = vnoise(UV * vec2(16.0, 3.0));
    float alive = step(t_local * 1.08, n);
    float a = lead * taper * alive;
    if (a < 0.5) {
        discard;
    }
    ALBEDO = mix(vec3(1.0), tint, clamp(t_local * 3.0, 0.0, 1.0));
    ALPHA = 1.0;
}
"#;

#[derive(GodotClass)]
#[class(init, base = Node3D)]
pub struct QSlashArc {
    base: Base<Node3D>,

    #[export]
    #[init(val = 0.26)]
    duration: f32,
    #[export]
    #[init(val = 0.55)]
    inner_radius: f32,
    #[export]
    #[init(val = 1.5)]
    outer_radius: f32,
    #[export]
    #[init(val = 140.0)]
    arc_degrees: f32,
    #[export]
    #[init(val = Color::from_rgb(1.0, 0.8, 0.3))]
    default_color: Color,

    mesh: Option<Gd<MeshInstance3D>>,
    material: Option<Gd<ShaderMaterial>>,
    time: f32,
    flip: bool,
}

#[godot_api]
impl INode3D for QSlashArc {
    fn ready(&mut self) {
        if Engine::singleton().is_editor_hint() {
            return;
        }
        let mut shader = Shader::new_gd();
        shader.set_code(SLASH_SHADER);
        let mut material = ShaderMaterial::new_gd();
        material.set_shader(&shader);

        let segs = 28;
        let half = self.arc_degrees.to_radians() * 0.5;
        let mut verts: Vec<Vector3> = Vec::with_capacity((segs + 1) * 2);
        let mut uvs: Vec<Vector2> = Vec::with_capacity((segs + 1) * 2);
        let mut idx: Vec<i32> = Vec::with_capacity(segs * 6);
        for i in 0..=segs {
            let t = i as f32 / segs as f32;
            let ang = -half + t * half * 2.0;
            let (s, c) = ang.sin_cos();
            verts.push(Vector3::new(
                s * self.inner_radius,
                c * self.inner_radius,
                0.0,
            ));
            uvs.push(Vector2::new(t, 0.0));
            verts.push(Vector3::new(
                s * self.outer_radius,
                c * self.outer_radius,
                0.0,
            ));
            uvs.push(Vector2::new(t, 1.0));
        }
        for i in 0..segs as i32 {
            let b = i * 2;
            idx.extend_from_slice(&[b, b + 1, b + 2, b + 1, b + 3, b + 2]);
        }

        let mut arrays = VarArray::new();
        arrays.resize(ArrayType::MAX.ord() as usize, &Variant::nil());
        arrays.set(
            ArrayType::VERTEX.ord() as usize,
            &PackedVector3Array::from(verts.as_slice()).to_variant(),
        );
        arrays.set(
            ArrayType::TEX_UV.ord() as usize,
            &PackedVector2Array::from(uvs.as_slice()).to_variant(),
        );
        arrays.set(
            ArrayType::INDEX.ord() as usize,
            &PackedInt32Array::from(idx.as_slice()).to_variant(),
        );
        let mut am = ArrayMesh::new_gd();
        am.add_surface_from_arrays(PrimitiveType::TRIANGLES, &arrays);

        let mut mi = MeshInstance3D::new_alloc();
        mi.set_mesh(&am);
        mi.set_material_override(&material);
        mi.set_cast_shadows_setting(
            godot::classes::geometry_instance_3d::ShadowCastingSetting::OFF,
        );
        mi.hide();
        self.base_mut().add_child(&mi);

        self.mesh = Some(mi);
        self.material = Some(material);
        self.base_mut().set_process(false);
    }

    fn process(&mut self, delta: f64) {
        self.time += delta as f32;
        let progress = self.time / self.duration.max(0.05);
        if progress >= 1.0 {
            if let Some(m) = self.mesh.as_mut() {
                m.hide();
            }
            self.base_mut().set_process(false);
            return;
        }
        if let Some(material) = self.material.as_mut() {
            material.set_shader_parameter("progress", &progress.to_variant());
        }
    }
}

#[godot_api]
impl QSlashArc {
    #[func]
    fn slash(&mut self) {
        let color = self.default_color;
        self.play(color);
    }

    #[func]
    fn slash_colored(&mut self, color: Color) {
        self.play(color);
    }
}

impl QSlashArc {
    fn play(&mut self, color: Color) {
        let Some(material) = self.material.as_mut() else {
            return;
        };
        let tint = Vector3::new(color.r, color.g, color.b);
        material.set_shader_parameter("tint", &tint.to_variant());
        material.set_shader_parameter("progress", &0.0f32.to_variant());
        self.time = 0.0;
        self.flip = !self.flip;
        let sy = if self.flip { -1.0 } else { 1.0 };
        if let Some(m) = self.mesh.as_mut() {
            m.set_scale(Vector3::new(1.0, sy, 1.0));
            m.show();
        }
        self.base_mut().set_process(true);
    }
}

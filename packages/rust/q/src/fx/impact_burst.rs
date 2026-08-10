use godot::classes::particle_process_material::{EmissionShape, Parameter};
use godot::classes::{
    Engine, GpuParticles3D, Gradient, GradientTexture1D, INode3D, ParticleProcessMaterial,
    QuadMesh, Shader, ShaderMaterial,
};
use godot::prelude::*;

const BURST_SHADER: &str = r#"
shader_type spatial;
render_mode unshaded, blend_mix, depth_draw_never, cull_disabled, specular_disabled;

uniform vec3 tint : source_color = vec3(1.0, 0.85, 0.4);
uniform float noise_chunk = 5.0;

varying float v_hash;

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

void vertex() {
    v_hash = hash2(vec2(float(INSTANCE_ID) * 0.617, 0.37));
    mat4 bb = mat4(INV_VIEW_MATRIX[0], INV_VIEW_MATRIX[1], INV_VIEW_MATRIX[2], MODEL_MATRIX[3]);
    float sc = length(MODEL_MATRIX[0].xyz);
    MODELVIEW_MATRIX = VIEW_MATRIX * bb;
    MODELVIEW_MATRIX[0] *= sc;
    MODELVIEW_MATRIX[1] *= sc;
    MODELVIEW_MATRIX[2] *= sc;
}

void fragment() {
    float h = v_hash;
    float ang = h * 6.2831;
    vec2 p = UV * 2.0 - 1.0;
    p.y = -p.y;
    float ca = cos(ang);
    float sa = sin(ang);
    p = vec2(p.x * ca - p.y * sa, p.x * sa + p.y * ca);

    float shape;
    float pick = fract(h * 3.7);
    if (pick < 0.4) {
        shape = step(abs(p.x) + abs(p.y), 0.85);
    } else if (pick < 0.7) {
        shape = step(abs(p.x) * 2.6 + abs(p.y) * 0.7, 0.85);
    } else {
        float outer = step(length(p), 0.9);
        float inner = step(length(p - vec2(0.38, 0.0)), 0.72);
        shape = outer * (1.0 - inner);
    }

    float t = 1.0 - COLOR.a;
    float n = vnoise(p * noise_chunk + vec2(h * 91.7, h * 47.3));
    float alive = step(t * 1.12, n);
    float a = shape * alive;
    if (a < 0.5) {
        discard;
    }
    ALBEDO = mix(vec3(1.0), tint, clamp(t * 2.4, 0.0, 1.0));
    ALPHA = 1.0;
}
"#;

#[derive(GodotClass)]
#[class(init, base = Node3D)]
pub struct QImpactBurst {
    base: Base<Node3D>,

    #[export]
    #[init(val = 22)]
    amount: i32,
    #[export]
    #[init(val = 0.55)]
    lifetime: f32,
    #[export]
    #[init(val = 5.0)]
    speed_min: f32,
    #[export]
    #[init(val = 9.5)]
    speed_max: f32,
    #[export]
    #[init(val = 7.0)]
    damping: f32,
    #[export]
    #[init(val = Color::from_rgb(1.0, 0.85, 0.4))]
    default_color: Color,

    particles: Option<Gd<GpuParticles3D>>,
    material: Option<Gd<ShaderMaterial>>,
}

#[godot_api]
impl INode3D for QImpactBurst {
    fn ready(&mut self) {
        if Engine::singleton().is_editor_hint() {
            return;
        }
        let mut shader = Shader::new_gd();
        shader.set_code(BURST_SHADER);
        let mut material = ShaderMaterial::new_gd();
        material.set_shader(&shader);

        let mut quad = QuadMesh::new_gd();
        quad.set_size(Vector2::new(1.0, 1.0));
        quad.set_material(&material);

        let mut ramp = Gradient::new_gd();
        ramp.set_offsets(&PackedFloat32Array::from(&[0.0, 1.0][..]));
        ramp.set_colors(&PackedColorArray::from(
            &[
                Color::from_rgba(1.0, 1.0, 1.0, 1.0),
                Color::from_rgba(1.0, 1.0, 1.0, 0.0),
            ][..],
        ));
        let mut ramp_tex = GradientTexture1D::new_gd();
        ramp_tex.set_gradient(&ramp);

        let mut pm = ParticleProcessMaterial::new_gd();
        pm.set_emission_shape(EmissionShape::SPHERE);
        pm.set_emission_sphere_radius(0.15);
        pm.set_direction(Vector3::new(0.0, 0.0, 0.0));
        pm.set_spread(180.0);
        pm.set_param_min(Parameter::INITIAL_LINEAR_VELOCITY, self.speed_min);
        pm.set_param_max(Parameter::INITIAL_LINEAR_VELOCITY, self.speed_max);
        pm.set_param_min(Parameter::DAMPING, self.damping);
        pm.set_param_max(Parameter::DAMPING, self.damping * 1.4);
        pm.set_param_min(Parameter::SCALE, 0.16);
        pm.set_param_max(Parameter::SCALE, 0.42);
        pm.set_gravity(Vector3::ZERO);
        pm.set_color_ramp(&ramp_tex);

        let mut particles = GpuParticles3D::new_alloc();
        particles.set_amount(self.amount.max(1));
        particles.set_lifetime(self.lifetime.max(0.1) as f64);
        particles.set_one_shot(true);
        particles.set_explosiveness_ratio(1.0);
        particles.set_use_local_coordinates(false);
        particles.set_process_material(&pm);
        particles.set_draw_pass_mesh(0, &quad);
        particles.set_emitting(false);
        self.base_mut().add_child(&particles);

        self.particles = Some(particles);
        self.material = Some(material);
    }
}

#[godot_api]
impl QImpactBurst {
    #[func]
    fn burst(&mut self) {
        let color = self.default_color;
        let pos = self.base().get_global_position();
        self.fire(pos, color);
    }

    #[func]
    fn burst_at(&mut self, world_pos: Vector3, color: Color) {
        self.fire(world_pos, color);
    }
}

impl QImpactBurst {
    fn fire(&mut self, world_pos: Vector3, color: Color) {
        let Some(material) = self.material.as_mut() else {
            return;
        };
        let tint = Vector3::new(color.r, color.g, color.b);
        material.set_shader_parameter("tint", &tint.to_variant());
        self.base_mut().set_global_position(world_pos);
        if let Some(p) = self.particles.as_mut() {
            p.restart();
            p.set_emitting(true);
        }
    }
}

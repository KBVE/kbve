use godot::classes::fast_noise_lite::{FractalType, NoiseType};
use godot::classes::particle_process_material::{EmissionShape, Parameter};
use godot::classes::{
    Curve, CurveTexture, Engine, FastNoiseLite, GpuParticles3D, Gradient, GradientTexture1D,
    INode3D, NoiseTexture2D, ParticleProcessMaterial, QuadMesh, Shader, ShaderMaterial,
};
use godot::prelude::*;

const SMOKE_SHADER: &str = r#"
shader_type spatial;
render_mode blend_mix, depth_draw_never, cull_disabled, specular_disabled;

uniform vec3 col_core : source_color = vec3(0.6, 0.25, 0.85);
uniform vec3 col_edge : source_color = vec3(0.24, 0.08, 0.38);
uniform float density : hint_range(0.0, 1.0) = 0.75;
uniform float noise_scale = 1.7;
uniform float scroll_speed = 0.22;
uniform float normal_strength : hint_range(0.0, 1.0) = 0.55;
uniform float shadow_threshold : hint_range(0.0, 1.0) = 0.45;
uniform float shadow_softness : hint_range(0.0, 0.5) = 0.16;
uniform float shadow_darken : hint_range(0.0, 1.0) = 0.5;
uniform float edge_softness : hint_range(0.01, 0.8) = 0.3;
uniform sampler2D noise_tex : hint_default_white, repeat_enable, filter_linear_mipmap;
uniform sampler2D normal_tex : hint_normal, repeat_enable, filter_linear_mipmap;

void vertex() {
    mat4 bb = mat4(INV_VIEW_MATRIX[0], INV_VIEW_MATRIX[1], INV_VIEW_MATRIX[2], MODEL_MATRIX[3]);
    float sc = length(MODEL_MATRIX[0].xyz);
    MODELVIEW_MATRIX = VIEW_MATRIX * bb;
    MODELVIEW_MATRIX[0] *= sc;
    MODELVIEW_MATRIX[1] *= sc;
    MODELVIEW_MATRIX[2] *= sc;
    MODELVIEW_NORMAL_MATRIX = mat3(MODELVIEW_MATRIX);
}

void fragment() {
    vec2 p = UV * 2.0 - 1.0;
    p.y = -p.y;
    float r2 = dot(p, p);
    vec2 seed = MODEL_MATRIX[3].xz * 0.173 + vec2(MODEL_MATRIX[3].y * 0.311);
    vec2 suv = UV * noise_scale + seed + TIME * scroll_speed * vec2(1.0, 0.63);
    float n = texture(noise_tex, suv).r;
    float body = 1.0 - r2;
    float a = smoothstep(0.0, edge_softness, body * mix(0.3, 1.4, n) - (1.0 - density)) * COLOR.a;
    if (a < 0.004) {
        discard;
    }
    vec3 sn = vec3(p, sqrt(max(1.0 - r2, 0.0)));
    vec3 nm = texture(normal_tex, suv).xyz * 2.0 - 1.0;
    NORMAL = normalize(mix(sn, normalize(vec3(sn.xy + nm.xy, sn.z)), normal_strength));
    ALBEDO = mix(col_edge, col_core, clamp(n * 0.55 + body * 0.5, 0.0, 1.0)) * COLOR.rgb;
    ALPHA = a;
}

void light() {
    float m = smoothstep(shadow_threshold - shadow_softness, shadow_threshold + shadow_softness, dot(NORMAL, LIGHT) * ATTENUATION);
    DIFFUSE_LIGHT += mix(1.0 - shadow_darken, 1.0, m) * ALBEDO * LIGHT_COLOR / PI;
}
"#;

#[derive(GodotClass)]
#[class(init, base = Node3D)]
pub struct QStatusSmoke {
    base: Base<Node3D>,

    #[export]
    #[init(val = 14)]
    amount: i32,
    #[export]
    #[init(val = 0.35)]
    emit_radius: f32,
    #[export]
    #[init(val = 2.2)]
    lifetime: f32,
    #[export]
    #[init(val = 0.55)]
    rise: f32,
    #[export]
    #[init(val = 0.75)]
    default_density: f32,
    #[export]
    #[init(val = Color::from_rgb(0.35, 0.78, 0.22))]
    poison_color: Color,
    #[export]
    #[init(val = Color::from_rgb(0.62, 0.24, 0.9))]
    curse_color: Color,

    particles: Option<Gd<GpuParticles3D>>,
    material: Option<Gd<ShaderMaterial>>,
    time_left: f32,
}

#[godot_api]
impl INode3D for QStatusSmoke {
    fn ready(&mut self) {
        if Engine::singleton().is_editor_hint() {
            return;
        }
        let mut noise = FastNoiseLite::new_gd();
        noise.set_seed(1337);
        noise.set_noise_type(NoiseType::SIMPLEX_SMOOTH);
        noise.set_fractal_type(FractalType::FBM);
        noise.set_fractal_octaves(4);
        noise.set_frequency(0.012);

        let mut noise_tex = NoiseTexture2D::new_gd();
        noise_tex.set_width(128);
        noise_tex.set_height(128);
        noise_tex.set_seamless(true);
        noise_tex.set_noise(&noise);

        let mut normal_tex = NoiseTexture2D::new_gd();
        normal_tex.set_width(128);
        normal_tex.set_height(128);
        normal_tex.set_seamless(true);
        normal_tex.set_as_normal_map(true);
        normal_tex.set_bump_strength(8.0);
        normal_tex.set_noise(&noise);

        let mut shader = Shader::new_gd();
        shader.set_code(SMOKE_SHADER);
        let mut material = ShaderMaterial::new_gd();
        material.set_shader(&shader);
        material.set_shader_parameter("noise_tex", &noise_tex.to_variant());
        material.set_shader_parameter("normal_tex", &normal_tex.to_variant());

        let mut quad = QuadMesh::new_gd();
        quad.set_size(Vector2::new(1.0, 1.0));
        quad.set_material(&material);

        let mut scale_curve = Curve::new_gd();
        scale_curve.add_point(Vector2::new(0.0, 0.35));
        scale_curve.add_point(Vector2::new(0.35, 1.0));
        scale_curve.add_point(Vector2::new(1.0, 1.75));
        let mut scale_tex = CurveTexture::new_gd();
        scale_tex.set_curve(&scale_curve);

        let mut ramp = Gradient::new_gd();
        ramp.set_offsets(&PackedFloat32Array::from(&[0.0, 0.22, 0.75, 1.0][..]));
        ramp.set_colors(&PackedColorArray::from(
            &[
                Color::from_rgba(1.0, 1.0, 1.0, 0.0),
                Color::from_rgba(1.0, 1.0, 1.0, 1.0),
                Color::from_rgba(1.0, 1.0, 1.0, 0.85),
                Color::from_rgba(1.0, 1.0, 1.0, 0.0),
            ][..],
        ));
        let mut ramp_tex = GradientTexture1D::new_gd();
        ramp_tex.set_gradient(&ramp);

        let mut pm = ParticleProcessMaterial::new_gd();
        pm.set_emission_shape(EmissionShape::SPHERE);
        pm.set_emission_sphere_radius(self.emit_radius);
        pm.set_direction(Vector3::new(0.0, 1.0, 0.0));
        pm.set_spread(28.0);
        pm.set_param_min(Parameter::INITIAL_LINEAR_VELOCITY, 0.25);
        pm.set_param_max(Parameter::INITIAL_LINEAR_VELOCITY, 0.6);
        pm.set_gravity(Vector3::new(0.0, self.rise, 0.0));
        pm.set_param_min(Parameter::SCALE, 0.55);
        pm.set_param_max(Parameter::SCALE, 1.0);
        pm.set_param_texture(Parameter::SCALE, &scale_tex);
        pm.set_color_ramp(&ramp_tex);

        let mut particles = GpuParticles3D::new_alloc();
        particles.set_amount(self.amount.max(1));
        particles.set_lifetime(self.lifetime.max(0.2) as f64);
        particles.set_use_local_coordinates(false);
        particles.set_process_material(&pm);
        particles.set_draw_pass_mesh(0, &quad);
        particles.set_emitting(false);
        self.base_mut().add_child(&particles);

        self.particles = Some(particles);
        self.material = Some(material);
        self.base_mut().set_process(false);
    }

    fn process(&mut self, delta: f64) {
        if self.time_left <= 0.0 {
            self.base_mut().set_process(false);
            return;
        }
        self.time_left -= delta as f32;
        if self.time_left <= 0.0 {
            self.stop();
        }
    }
}

#[godot_api]
impl QStatusSmoke {
    #[func]
    fn smoke(&mut self, color: Color, duration: f32, density: f32) {
        let Some(material) = self.material.as_mut() else {
            return;
        };
        let core = Vector3::new(color.r, color.g, color.b);
        let edge = core * 0.38;
        material.set_shader_parameter("col_core", &core.to_variant());
        material.set_shader_parameter("col_edge", &edge.to_variant());
        material.set_shader_parameter("density", &density.clamp(0.05, 1.0).to_variant());
        if let Some(p) = self.particles.as_mut() {
            p.set_emitting(true);
        }
        self.time_left = duration;
        let timed = duration > 0.0;
        self.base_mut().set_process(timed);
    }

    #[func]
    fn set_status(&mut self, status: GString) {
        let (color, density) = match status.to_string().as_str() {
            "poison" => (self.poison_color, self.default_density),
            "curse" => (self.curse_color, self.default_density),
            _ => {
                self.stop();
                return;
            }
        };
        self.smoke(color, 0.0, density);
    }

    #[func]
    fn stop(&mut self) {
        if let Some(p) = self.particles.as_mut() {
            p.set_emitting(false);
        }
        self.time_left = 0.0;
        self.base_mut().set_process(false);
    }

    #[func]
    fn is_active(&self) -> bool {
        self.particles
            .as_ref()
            .map(|p| p.is_emitting())
            .unwrap_or(false)
    }
}

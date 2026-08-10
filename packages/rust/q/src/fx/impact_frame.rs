use godot::classes::control::{LayoutPreset, MouseFilter};
use godot::classes::{CanvasLayer, ColorRect, Engine, ICanvasLayer, Shader, ShaderMaterial};
use godot::prelude::*;

const IMPACT_SHADER: &str = r#"
shader_type canvas_item;

uniform sampler2D screen_tex : hint_screen_texture, filter_nearest;
uniform vec2 edges = vec2(0.45, 0.55);
uniform vec3 col_lo = vec3(0.0);
uniform vec3 col_hi = vec3(1.0);
uniform float keep = 1.0;

void fragment() {
    vec3 c = texture(screen_tex, SCREEN_UV).rgb;
    float v = smoothstep(edges.x, edges.y, dot(c, vec3(0.299, 0.587, 0.114)));
    COLOR = vec4(c * keep + mix(col_lo, col_hi, v), 1.0);
}
"#;

#[derive(GodotClass)]
#[class(init, base = CanvasLayer)]
pub struct QImpactFrame {
    base: Base<CanvasLayer>,

    #[export]
    #[init(val = 0.5)]
    threshold: f32,
    #[export]
    #[init(val = 0.05)]
    smoothness: f32,
    #[export]
    #[init(val = Color::from_rgb(0.0, 0.0, 0.0))]
    bg_color: Color,
    #[export]
    #[init(val = Color::from_rgb(1.0, 1.0, 1.0))]
    fg_color: Color,
    #[export]
    invert: bool,
    #[export]
    #[init(val = 0.0)]
    attack: f32,
    #[export]
    #[init(val = 0.1)]
    hold: f32,
    #[export]
    #[init(val = 0.12)]
    release: f32,
    #[export]
    #[init(val = 0.0)]
    strobe_interval: f32,

    rect: Option<Gd<ColorRect>>,
    material: Option<Gd<ShaderMaterial>>,
    time: f32,
    run_hold: f32,
    last_flip: i32,
    last_intensity: f32,
}

#[godot_api]
impl ICanvasLayer for QImpactFrame {
    fn ready(&mut self) {
        if Engine::singleton().is_editor_hint() {
            return;
        }
        let mut shader = Shader::new_gd();
        shader.set_code(IMPACT_SHADER);
        let mut material = ShaderMaterial::new_gd();
        material.set_shader(&shader);

        let mut rect = ColorRect::new_alloc();
        rect.set_anchors_preset(LayoutPreset::FULL_RECT);
        rect.set_mouse_filter(MouseFilter::IGNORE);
        rect.set_material(&material);
        rect.hide();
        self.base_mut().add_child(&rect);

        self.rect = Some(rect);
        self.material = Some(material);
        self.base_mut().set_process(false);
    }

    fn process(&mut self, delta: f64) {
        self.time += delta as f32;
        let total = self.attack + self.run_hold + self.release;
        if self.time >= total {
            self.stop();
            return;
        }
        let t = self.time;
        let intensity = if t < self.attack {
            t / self.attack.max(1e-4)
        } else if t < self.attack + self.run_hold {
            1.0
        } else {
            1.0 - (t - self.attack - self.run_hold) / self.release.max(1e-4)
        }
        .clamp(0.0, 1.0);

        let flip = if self.strobe_interval > 0.0 {
            (t / self.strobe_interval) as i32 & 1
        } else {
            0
        };
        if flip != self.last_flip || (intensity - self.last_intensity).abs() > 1e-4 {
            self.last_flip = flip;
            self.last_intensity = intensity;
            self.push_uniforms(intensity, flip == 1);
        }
    }
}

#[godot_api]
impl QImpactFrame {
    #[func]
    fn trigger(&mut self) {
        self.start(self.hold);
    }

    #[func]
    fn trigger_for(&mut self, hold_seconds: f32) {
        self.start(hold_seconds.max(0.0));
    }

    #[func]
    fn cancel(&mut self) {
        self.stop();
    }

    #[func]
    fn is_running(&self) -> bool {
        self.base().is_processing()
    }
}

impl QImpactFrame {
    fn start(&mut self, hold: f32) {
        if self.rect.is_none() {
            return;
        }
        self.time = 0.0;
        self.run_hold = hold;
        self.last_flip = -1;
        self.last_intensity = -1.0;
        let initial = if self.attack <= 0.0 { 1.0 } else { 0.0 };
        self.push_uniforms(initial, false);
        if let Some(rect) = self.rect.as_mut() {
            rect.show();
        }
        self.base_mut().set_process(true);
    }

    fn stop(&mut self) {
        if let Some(rect) = self.rect.as_mut() {
            rect.hide();
        }
        self.base_mut().set_process(false);
    }

    fn push_uniforms(&mut self, intensity: f32, flipped: bool) {
        let Some(material) = self.material.as_mut() else {
            return;
        };
        let s = self.smoothness.max(1e-4);
        let edges = Vector2::new(self.threshold - s, self.threshold + s);
        let (lo, hi) = if self.invert != flipped {
            (self.fg_color, self.bg_color)
        } else {
            (self.bg_color, self.fg_color)
        };
        let lo = Vector3::new(lo.r, lo.g, lo.b) * intensity;
        let hi = Vector3::new(hi.r, hi.g, hi.b) * intensity;
        material.set_shader_parameter("edges", &edges.to_variant());
        material.set_shader_parameter("col_lo", &lo.to_variant());
        material.set_shader_parameter("col_hi", &hi.to_variant());
        material.set_shader_parameter("keep", &(1.0 - intensity).to_variant());
    }
}

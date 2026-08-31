use godot::classes::control::{LayoutPreset, MouseFilter};
use godot::classes::{
    CanvasLayer, ColorRect, Engine, FileAccess, ICanvasLayer, Image, ImageTexture, Shader,
    ShaderMaterial,
};
use godot::prelude::*;

const IMPACT_SHADER: &str = r#"
shader_type canvas_item;

uniform sampler2D screen_tex : hint_screen_texture, filter_linear;
uniform vec2 edges = vec2(0.45, 0.55);
uniform vec3 col_lo = vec3(0.0);
uniform vec3 col_hi = vec3(1.0);
uniform float keep = 1.0;
uniform vec2 center = vec2(0.5);
uniform float aberration = 0.0;
uniform float radial_blur = 0.0;

uniform int bg_mode = 0;
uniform float flash_i = 0.0;
uniform vec3 burst_a = vec3(0.95, 0.25, 0.12);
uniform vec3 burst_b = vec3(1.0, 0.88, 0.35);
uniform vec3 burst_fg = vec3(0.04);
uniform float ray_count = 26.0;
uniform float spin = 0.7;

uniform float band_amount = 0.0;
uniform float band_angle = 0.0;
uniform float band_roll = 0.0;
uniform vec4 band_fill = vec4(0.0, 0.0, 0.0, 1.0);

uniform float stamp_amount = 0.0;
uniform vec2 stamp_center = vec2(0.5);
uniform float stamp_scale = 0.4;
uniform float stamp_rot = 0.0;
uniform vec3 stamp_tint = vec3(0.0);
uniform sampler2D stamp_tex : filter_linear, hint_default_transparent;

vec2 rot2(vec2 p, float a) {
    float c = cos(a);
    float s = sin(a);
    return vec2(p.x * c - p.y * s, p.x * s + p.y * c);
}

float hh(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}

float vn(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hh(i), hh(i + vec2(1.0, 0.0)), f.x), mix(hh(i + vec2(0.0, 1.0)), hh(i + vec2(1.0, 1.0)), f.x), f.y);
}

float fbm3(vec2 p) {
    return vn(p) * 0.55 + vn(p * 2.13) * 0.28 + vn(p * 4.41) * 0.17;
}

vec3 blackhole(vec2 d, float r, float i, float aspect) {
    float rs = 0.11 * i;
    float bend = rs * rs * 1.9 / max(r, 1e-3);
    float ang = atan(d.y, d.x);
    float drag = 3.2 * i * rs / max(r, 8e-3);
    float ang2 = ang - drag;
    vec2 nd = vec2(cos(ang2), sin(ang2));
    vec2 suv = center + (nd * max(r - bend, 0.0)) / vec2(aspect, 1.0);
    vec2 cav = nd * bend * 0.22 / vec2(aspect, 1.0);
    vec3 lensed;
    lensed.r = texture(screen_tex, suv + cav).r;
    lensed.g = texture(screen_tex, suv).g;
    lensed.b = texture(screen_tex, suv - cav).b;

    vec2 vuv = d * 2.4;
    float neb = fbm3(vuv * 2.0 + vec2(TIME * 0.04, -TIME * 0.02));
    vec3 voidc = mix(vec3(0.008, 0.004, 0.025), vec3(0.16, 0.05, 0.32), neb * neb);
    voidc += vec3(0.35, 0.45, 0.85) * pow(fbm3(vuv * 1.3 - TIME * 0.03), 3.0) * 0.6;
    float st = hh(floor(vuv * 110.0));
    voidc += vec3(step(0.996, st)) * (0.6 + 0.4 * sin(TIME * 4.0 + st * 60.0));

    vec3 col = mix(lensed, voidc, i * smoothstep(rs * 1.4, 0.85, r));

    float swirln = vn(vec2(ang * 3.0 + TIME * 2.4 - r * 30.0, r * 55.0));
    float disk = exp(-pow((r - rs * 2.0) / max(rs * 0.95, 1e-3), 2.0));
    vec3 hot = mix(vec3(1.0, 0.42, 0.08), vec3(0.45, 0.65, 1.0), 0.5 + 0.5 * sin(ang * 2.0 + TIME * 0.8));
    float doppler = 0.55 + 0.65 * sin(ang + 2.1);
    col += hot * disk * (0.4 + swirln) * doppler * i * 1.5;

    col += vec3(1.0, 0.88, 0.62) * exp(-pow((r - rs * 1.28) / max(rs * 0.1, 1e-4), 2.0)) * i * 2.4;

    float fil = pow(vn(vec2(ang2 * 5.0 - TIME * 1.8, r * 12.0)), 9.0);
    col += vec3(0.7, 0.82, 1.0) * fil * smoothstep(rs, rs * 5.0, r) * i * 1.8;

    col *= smoothstep(rs, rs * 1.14, r);
    return col;
}

void fragment() {
    vec3 c;
    if (aberration + radial_blur < 1e-5) {
        c = texture(screen_tex, SCREEN_UV).rgb;
    } else {
        vec2 dir = SCREEN_UV - center;
        float dist = length(dir);
        vec2 nd = dir / max(dist, 1e-4);
        vec2 ab = nd * aberration * dist;
        vec3 acc = vec3(0.0);
        for (int i = 0; i < 5; i++) {
            vec2 uv = SCREEN_UV - dir * radial_blur * (float(i) / 4.0);
            acc.r += texture(screen_tex, uv + ab).r;
            acc.g += texture(screen_tex, uv).g;
            acc.b += texture(screen_tex, uv - ab).b;
        }
        c = acc * 0.2;
    }

    float aspect = SCREEN_PIXEL_SIZE.y / SCREEN_PIXEL_SIZE.x;
    float v = smoothstep(edges.x, edges.y, dot(c, vec3(0.299, 0.587, 0.114)));
    vec3 outc;
    if (bg_mode == 2) {
        vec2 d = (SCREEN_UV - center) * vec2(aspect, 1.0);
        outc = blackhole(d, length(d), flash_i, aspect);
    } else if (bg_mode == 1) {
        vec2 d = (SCREEN_UV - center) * vec2(aspect, 1.0);
        float r = length(d);
        float ang = atan(d.y, d.x);
        float lines = step(0.55, fract(ang * ray_count / 6.2831 + TIME * spin + r * 0.6));
        vec3 bgc = mix(burst_b, burst_a, clamp(r * 1.7, 0.0, 1.0));
        bgc *= mix(1.0, 0.55, lines);
        outc = mix(c, mix(burst_fg, bgc, v), flash_i);
    } else {
        outc = c * keep + mix(col_lo, col_hi, v);
    }

    if (band_amount > 0.0) {
        vec2 p = rot2((SCREEN_UV - 0.5) * vec2(aspect, 1.0), band_angle);
        float inside = step(abs(p.y + p.x * band_roll), band_amount);
        outc = mix(mix(outc, band_fill.rgb, band_fill.a), outc, inside);
    }

    if (stamp_amount > 0.0) {
        vec2 sp = rot2((SCREEN_UV - stamp_center) * vec2(aspect, 1.0), stamp_rot) / max(stamp_scale, 1e-3) + 0.5;
        if (sp.x > 0.0 && sp.x < 1.0 && sp.y > 0.0 && sp.y < 1.0) {
            float sa = texture(stamp_tex, sp).a * stamp_amount;
            outc = mix(outc, stamp_tint, sa);
        }
    }

    COLOR = vec4(outc, 1.0);
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
    #[export]
    #[init(val = 0.035)]
    ca_strength: f32,
    #[export]
    #[init(val = 0.22)]
    blur_strength: f32,
    #[export]
    day_night_path: NodePath,
    #[export]
    #[init(val = 0.14)]
    night_threshold: f32,
    #[export]
    #[init(val = Color::from_rgb(0.95, 0.25, 0.12))]
    burst_day_a: Color,
    #[export]
    #[init(val = Color::from_rgb(1.0, 0.88, 0.35))]
    burst_day_b: Color,
    #[export]
    #[init(val = Color::from_rgb(0.25, 0.1, 0.55))]
    burst_night_a: Color,
    #[export]
    #[init(val = Color::from_rgb(0.55, 0.3, 0.95))]
    burst_night_b: Color,
    #[export]
    #[init(val = GString::from("res://assets/fx/textures/punch_blast.svg"))]
    stamp_path: GString,
    #[export]
    #[init(val = Color::from_rgb(0.0, 0.0, 0.0))]
    stamp_color: Color,
    #[export]
    #[init(val = 0.5)]
    stamp_size: f32,

    rect: Option<Gd<ColorRect>>,
    material: Option<Gd<ShaderMaterial>>,
    time: f32,
    run_hold: f32,
    last_flip: i32,
    last_intensity: f32,
    impact_world: Option<Vector3>,
    use_flash: bool,
    fx_mode: i32,
    stamp_on: bool,
    band_on: bool,
    eff_threshold: f32,
    night: bool,
    run_attack: f32,
    run_release: f32,
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
        let svg = FileAccess::get_file_as_string(&self.stamp_path);
        if !svg.is_empty() {
            let mut img = Image::new_gd();
            let err = img
                .load_svg_from_buffer_ex(&PackedByteArray::from(svg.to_string().as_bytes()))
                .scale(0.75)
                .done();
            if err == godot::global::Error::OK {
                if let Some(tex) = ImageTexture::create_from_image(&img) {
                    material.set_shader_parameter("stamp_tex", &tex.to_variant());
                }
            } else {
                godot_warn!("QImpactFrame: stamp svg load failed: {:?}", err);
            }
        }

        let mut rect = ColorRect::new_alloc();
        rect.set_anchors_preset(LayoutPreset::FULL_RECT);
        rect.set_mouse_filter(MouseFilter::IGNORE);
        rect.set_material(&material);
        rect.hide();
        self.base_mut().add_child(&rect);

        self.rect = Some(rect);
        self.material = Some(material);
        self.eff_threshold = self.threshold;
        self.base_mut().set_process(false);
    }

    fn process(&mut self, delta: f64) {
        self.time += delta as f32;
        let total = self.run_attack + self.run_hold + self.run_release;
        if self.time >= total {
            self.stop();
            return;
        }
        let t = self.time;
        let intensity = if t < self.run_attack {
            t / self.run_attack.max(1e-4)
        } else if t < self.run_attack + self.run_hold {
            1.0
        } else {
            1.0 - (t - self.run_attack - self.run_hold) / self.run_release.max(1e-4)
        }
        .clamp(0.0, 1.0);

        self.push_radial(intensity);
        self.push_dynamic(intensity, t);
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
        self.reset_modes();
        self.start(self.hold, None, true);
    }

    #[func]
    fn trigger_for(&mut self, hold_seconds: f32) {
        self.reset_modes();
        self.start(hold_seconds.max(0.0), None, true);
    }

    #[func]
    fn trigger_at(&mut self, world_pos: Vector3) {
        self.reset_modes();
        self.start(self.hold, Some(world_pos), true);
    }

    #[func]
    fn shock_at(&mut self, world_pos: Vector3) {
        self.reset_modes();
        self.start(self.hold, Some(world_pos), false);
    }

    #[func]
    fn burst_at(&mut self, world_pos: Vector3) {
        self.reset_modes();
        self.fx_mode = 1;
        self.start(self.hold.max(0.22), Some(world_pos), true);
    }

    #[func]
    fn blackhole_at(&mut self, world_pos: Vector3) {
        self.reset_modes();
        self.fx_mode = 2;
        self.run_attack = 0.4;
        self.run_release = 0.8;
        self.start(self.hold.max(1.1), Some(world_pos), false);
    }

    #[func]
    fn blackhole_for(&mut self, world_pos: Vector3, hold_seconds: f32) {
        self.reset_modes();
        self.fx_mode = 2;
        self.run_attack = 0.4;
        self.run_release = 0.8;
        self.start(hold_seconds.max(0.1), Some(world_pos), false);
    }

    #[func]
    fn burst_colored(&mut self, world_pos: Vector3, inner: Color, outer: Color) {
        self.reset_modes();
        self.fx_mode = 1;
        self.start(self.hold.max(0.22), Some(world_pos), true);
        if let Some(m) = self.material.as_mut() {
            m.set_shader_parameter(
                "burst_b",
                &Vector3::new(inner.r, inner.g, inner.b).to_variant(),
            );
            m.set_shader_parameter(
                "burst_a",
                &Vector3::new(outer.r, outer.g, outer.b).to_variant(),
            );
        }
    }

    #[func]
    fn punch_at(&mut self, world_pos: Vector3) {
        self.reset_modes();
        self.stamp_on = true;
        self.start(self.hold.max(0.16), Some(world_pos), true);
    }

    #[func]
    fn combo_at(&mut self, world_pos: Vector3) {
        self.reset_modes();
        self.fx_mode = 1;
        self.stamp_on = true;
        self.start(self.hold.max(0.28), Some(world_pos), true);
    }

    #[func]
    fn nuke(&mut self, angle_degrees: f32, offset: f32, fill: Color, duration: f32) {
        self.reset_modes();
        self.band_on = true;
        if let Some(m) = self.material.as_mut() {
            m.set_shader_parameter("band_angle", &angle_degrees.to_radians().to_variant());
            m.set_shader_parameter("band_amount", &offset.max(0.001).to_variant());
            m.set_shader_parameter(
                "band_fill",
                &Color::from_rgba(fill.r, fill.g, fill.b, fill.a).to_variant(),
            );
        }
        self.start(duration.max(0.05), None, false);
    }

    #[func]
    fn set_param(&mut self, name: GString, value: Variant) {
        if let Some(m) = self.material.as_mut() {
            m.set_shader_parameter(&StringName::from(name.to_string().as_str()), &value);
        }
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
    fn reset_modes(&mut self) {
        self.fx_mode = 0;
        self.stamp_on = false;
        self.band_on = false;
        self.run_attack = self.attack;
        self.run_release = self.release;
    }

    fn apply_day_night(&mut self) {
        self.night = false;
        self.eff_threshold = self.threshold;
        if self.day_night_path.is_empty() {
            return;
        }
        let Some(node) = self.base().get_node_or_null(&self.day_night_path) else {
            return;
        };
        let hour = node.get("hour").try_to::<f64>().unwrap_or(12.0) as f32;
        self.night = !(5.5..=18.5).contains(&hour);
        if self.night {
            self.eff_threshold = self.night_threshold;
        }
    }

    fn start(&mut self, hold: f32, world: Option<Vector3>, flash: bool) {
        if self.rect.is_none() {
            return;
        }
        self.apply_day_night();
        self.time = 0.0;
        self.run_hold = hold;
        self.last_flip = -1;
        self.last_intensity = -1.0;
        self.impact_world = world;
        self.use_flash = flash;
        let (ba, bb) = if self.night {
            (self.burst_night_a, self.burst_night_b)
        } else {
            (self.burst_day_a, self.burst_day_b)
        };
        let stamp_tint = if self.night {
            Color::from_rgb(
                1.0 - self.stamp_color.r,
                1.0 - self.stamp_color.g,
                1.0 - self.stamp_color.b,
            )
        } else {
            self.stamp_color
        };
        if let Some(m) = self.material.as_mut() {
            m.set_shader_parameter("bg_mode", &self.fx_mode.to_variant());
            m.set_shader_parameter("burst_a", &Vector3::new(ba.r, ba.g, ba.b).to_variant());
            m.set_shader_parameter("burst_b", &Vector3::new(bb.r, bb.g, bb.b).to_variant());
            m.set_shader_parameter(
                "stamp_tint",
                &Vector3::new(stamp_tint.r, stamp_tint.g, stamp_tint.b).to_variant(),
            );
            if !self.band_on {
                m.set_shader_parameter("band_amount", &0.0f32.to_variant());
            }
        }
        let initial = if self.run_attack <= 0.0 { 1.0 } else { 0.0 };
        self.push_uniforms(initial, false);
        self.push_radial(initial);
        self.push_dynamic(initial, 0.0);
        if let Some(rect) = self.rect.as_mut() {
            rect.show();
        }
        self.base_mut().set_process(true);
    }

    fn stop(&mut self) {
        if let Some(m) = self.material.as_mut() {
            m.set_shader_parameter("band_amount", &0.0f32.to_variant());
            m.set_shader_parameter("stamp_amount", &0.0f32.to_variant());
            m.set_shader_parameter("bg_mode", &0i32.to_variant());
        }
        if let Some(rect) = self.rect.as_mut() {
            rect.hide();
        }
        self.base_mut().set_process(false);
    }

    fn push_radial(&mut self, intensity: f32) {
        let (center, strength) = match self.impact_world {
            Some(w) => (
                self.project(w),
                if self.fx_mode == 2 { 0.0 } else { intensity },
            ),
            None => (Vector2::new(0.5, 0.5), 0.0),
        };
        let Some(material) = self.material.as_mut() else {
            return;
        };
        material.set_shader_parameter("center", &center.to_variant());
        material.set_shader_parameter("aberration", &(self.ca_strength * strength).to_variant());
        material.set_shader_parameter("radial_blur", &(self.blur_strength * strength).to_variant());
    }

    fn push_dynamic(&mut self, intensity: f32, t: f32) {
        let stamp = if self.stamp_on {
            let center = match self.impact_world {
                Some(w) => self.project(w),
                None => Vector2::new(0.5, 0.5),
            };
            let pop = self.stamp_size * (1.0 + 0.9 * (-t * 16.0).exp());
            Some((center, pop, (intensity * 1.6).min(1.0)))
        } else {
            None
        };
        let flash = if self.use_flash || self.fx_mode != 0 {
            intensity
        } else {
            0.0
        };
        let Some(material) = self.material.as_mut() else {
            return;
        };
        material.set_shader_parameter("flash_i", &flash.to_variant());
        match stamp {
            Some((center, pop, amount)) => {
                material.set_shader_parameter("stamp_center", &center.to_variant());
                material.set_shader_parameter("stamp_scale", &pop.to_variant());
                material.set_shader_parameter("stamp_amount", &amount.to_variant());
            }
            None => {
                material.set_shader_parameter("stamp_amount", &0.0f32.to_variant());
            }
        }
    }

    fn project(&self, world: Vector3) -> Vector2 {
        let fallback = Vector2::new(0.5, 0.5);
        let Some(vp) = self.base().get_viewport() else {
            return fallback;
        };
        let Some(cam) = vp.get_camera_3d() else {
            return fallback;
        };
        if cam.is_position_behind(world) {
            return fallback;
        }
        let px = cam.unproject_position(world);
        let size = vp.get_visible_rect().size;
        if size.x <= 0.0 || size.y <= 0.0 {
            return fallback;
        }
        Vector2::new(px.x / size.x, px.y / size.y)
    }

    fn push_uniforms(&mut self, intensity: f32, flipped: bool) {
        let intensity = if self.use_flash && self.fx_mode == 0 {
            intensity
        } else {
            0.0
        };
        let Some(material) = self.material.as_mut() else {
            return;
        };
        let s = self.smoothness.max(1e-4);
        let edges = Vector2::new(self.eff_threshold - s, self.eff_threshold + s);
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

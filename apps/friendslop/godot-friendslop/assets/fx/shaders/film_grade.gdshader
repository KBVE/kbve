shader_type canvas_item;

uniform sampler2D screen_tex: hint_screen_texture, filter_linear;
uniform vec3 black_lift: source_color = vec3(0.02, 0.02, 0.045);
uniform vec3 highlight_warmth: source_color = vec3(1.05, 1.0, 0.92);
uniform vec3 film_tint: source_color = vec3(1.04, 1.0, 0.93);
uniform float posterize_levels: hint_range(4.0, 64.0) = 14.0;
uniform float posterize_mix: hint_range(0.0, 1.0) = 0.45;
uniform float grain_amount: hint_range(0.0, 0.2) = 0.025;
uniform float vignette_strength: hint_range(0.0, 1.0) = 0.22;
uniform float vignette_softness: hint_range(0.1, 1.0) = 0.55;

float hash(vec2 p) {
	vec3 p3 = fract(vec3(p.xyx) * 0.1031);
	p3 += dot(p3, p3.yzx + 33.33);
	return fract((p3.x + p3.y) * p3.z);
}

void fragment() {
	vec3 c = texture(screen_tex, SCREEN_UV).rgb;

	c = black_lift + c * (vec3(1.0) - black_lift);
	c *= film_tint;

	float lum = dot(c, vec3(0.299, 0.587, 0.114));
	c *= mix(vec3(1.0), highlight_warmth, smoothstep(0.55, 1.0, lum));

	c = mix(c, floor(c * posterize_levels + 0.5) / posterize_levels, posterize_mix);

	c += (hash(SCREEN_UV * (1000.0 + fract(TIME) * 100.0)) - 0.5) * grain_amount;

	vec2 v_uv = SCREEN_UV * (1.0 - SCREEN_UV.yx);
	float vig = pow(v_uv.x * v_uv.y * 15.0, vignette_softness);
	c *= mix(1.0 - vignette_strength, 1.0, clamp(vig, 0.0, 1.0));

	COLOR = vec4(c, 1.0);
}

shader_type spatial;
render_mode cull_disabled;

uniform sampler2D albedo_tex: source_color, hint_default_white, filter_linear_mipmap;
uniform vec3 albedo_tint: source_color = vec3(1.0);
uniform float alpha_scissor: hint_range(0.0, 1.0) = 0.5;
uniform float band_offset: hint_range(0.0, 1.0) = 0.35;
uniform float band_softness: hint_range(0.001, 0.3) = 0.03;
uniform vec3 shadow_tint: source_color = vec3(0.58, 0.62, 0.95);
uniform float shadow_level: hint_range(0.0, 1.0) = 0.55;
uniform vec3 backlight_tint: source_color = vec3(0.3, 0.35, 0.2);

void fragment() {
	vec4 tex = texture(albedo_tex, UV);
	if (tex.a < alpha_scissor) {
		discard;
	}
	if (!FRONT_FACING) {
		NORMAL = -NORMAL;
	}
	ALBEDO = tex.rgb * albedo_tint;
	SPECULAR = 0.0;
	ROUGHNESS = 1.0;
	BACKLIGHT = backlight_tint;
}

void light() {
	float band = smoothstep(band_offset - band_softness, band_offset + band_softness,
			dot(NORMAL, LIGHT) * ATTENUATION);
	vec3 lit = LIGHT_COLOR / PI;
	vec3 shadowed = lit * shadow_tint * shadow_level;
	DIFFUSE_LIGHT += mix(shadowed, lit, band) * ALBEDO;
}

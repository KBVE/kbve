shader_type spatial;

uniform sampler2D albedo_tex: source_color, hint_default_white, filter_linear_mipmap;
uniform vec3 albedo_tint: source_color = vec3(1.0);
uniform float band_offset: hint_range(0.0, 1.0) = 0.35;
uniform float band_softness: hint_range(0.001, 0.3) = 0.03;
uniform vec3 shadow_tint: source_color = vec3(0.58, 0.62, 0.95);
uniform float shadow_level: hint_range(0.0, 1.0) = 0.55;
uniform float rim_strength: hint_range(0.0, 1.0) = 0.15;
uniform float rim_power: hint_range(1.0, 8.0) = 3.0;

void fragment() {
	ALBEDO = texture(albedo_tex, UV).rgb * albedo_tint;
	SPECULAR = 0.0;
	ROUGHNESS = 1.0;
}

void light() {
	float band = smoothstep(band_offset - band_softness, band_offset + band_softness,
			dot(NORMAL, LIGHT) * ATTENUATION);
	vec3 lit = LIGHT_COLOR / PI;
	vec3 shadowed = lit * shadow_tint * shadow_level;
	DIFFUSE_LIGHT += mix(shadowed, lit, band) * ALBEDO;
	float rim = pow(1.0 - clamp(dot(NORMAL, VIEW), 0.0, 1.0), rim_power);
	DIFFUSE_LIGHT += rim * rim_strength * band * lit;
}

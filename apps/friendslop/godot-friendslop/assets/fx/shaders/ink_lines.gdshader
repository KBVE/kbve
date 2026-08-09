shader_type spatial;
render_mode unshaded, blend_mix, depth_draw_never, depth_test_disabled, fog_disabled, cull_disabled;

uniform sampler2D depth_tex: hint_depth_texture, filter_nearest;
uniform sampler2D normal_tex: hint_normal_roughness_texture, filter_nearest;
uniform vec3 line_color: source_color = vec3(0.08, 0.06, 0.11);
uniform float depth_threshold: hint_range(0.001, 0.3) = 0.04;
uniform float normal_threshold: hint_range(0.0, 2.0) = 0.65;
uniform float line_alpha: hint_range(0.0, 1.0) = 0.85;
uniform float crease_alpha: hint_range(0.0, 1.0) = 0.55;
uniform float soft_material_scale: hint_range(0.0, 1.0) = 0.18;
uniform float max_distance = 70.0;

void vertex() {
	POSITION = vec4(VERTEX.xy, 1.0, 1.0);
}

float linear_depth(vec2 uv, mat4 inv_proj) {
	float d = texture(depth_tex, uv).r;
	vec4 v = inv_proj * vec4(uv * 2.0 - 1.0, d, 1.0);
	return -v.z / v.w;
}

void fragment() {
	vec2 px = 1.0 / VIEWPORT_SIZE;
	float dc = linear_depth(SCREEN_UV, INV_PROJECTION_MATRIX);
	float dl = linear_depth(SCREEN_UV - vec2(px.x, 0.0), INV_PROJECTION_MATRIX);
	float dr = linear_depth(SCREEN_UV + vec2(px.x, 0.0), INV_PROJECTION_MATRIX);
	float dd = linear_depth(SCREEN_UV - vec2(0.0, px.y), INV_PROJECTION_MATRIX);
	float du = linear_depth(SCREEN_UV + vec2(0.0, px.y), INV_PROJECTION_MATRIX);
	float depth_edge = (abs(dr - dc) + abs(du - dc) + abs(dl - dc) + abs(dd - dc)) / max(dc, 0.001);

	vec4 nrough = texture(normal_tex, SCREEN_UV);
	vec3 nc = nrough.xyz * 2.0 - 1.0;
	vec3 nr = texture(normal_tex, SCREEN_UV + vec2(px.x, 0.0)).xyz * 2.0 - 1.0;
	vec3 nu = texture(normal_tex, SCREEN_UV + vec2(0.0, px.y)).xyz * 2.0 - 1.0;
	float normal_edge = max(1.0 - dot(nc, nr), 1.0 - dot(nc, nu));

	float mat_mask = smoothstep(0.6, 0.9, nrough.a);
	float edge = 0.0;
	if (depth_edge > depth_threshold) {
		edge = line_alpha * mix(soft_material_scale, 1.0, mat_mask);
	} else if (normal_edge > normal_threshold) {
		edge = crease_alpha * mat_mask;
	}
	edge *= 1.0 - smoothstep(max_distance * 0.5, max_distance, dc);

	ALBEDO = line_color;
	ALPHA = edge;
}

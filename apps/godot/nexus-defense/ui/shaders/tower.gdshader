shader_type canvas_item;

uniform int tower_type : hint_range(0, 3) = 0;
uniform vec4 base_color : source_color = vec4(0.32, 0.36, 0.46, 1.0);
uniform vec4 accent_color : source_color = vec4(0.32, 0.78, 0.95, 1.0);
uniform vec4 outline_color : source_color = vec4(0.04, 0.06, 0.10, 1.0);
uniform float level : hint_range(0.5, 3.0) = 1.0;
uniform float outline_width : hint_range(0.0, 4.0) = 1.5;
uniform vec2 rect_size = vec2(48.0, 48.0);

float sdf_rect(vec2 p, vec2 b) {
	vec2 d = abs(p) - b;
	return length(max(d, vec2(0.0))) + min(max(d.x, d.y), 0.0);
}

float sdf_circle(vec2 p, float r) {
	return length(p) - r;
}

float sdf_triangle_iso(vec2 p, float halfw, float h) {
	p.x = abs(p.x);
	float k = halfw / max(h, 0.001);
	float d1 = p.x * h / sqrt(h * h + halfw * halfw) + p.y * halfw / sqrt(h * h + halfw * halfw) - halfw * h / sqrt(h * h + halfw * halfw);
	float d2 = -p.y - h * 0.5;
	return max(d1, d2);
}

float sdf_hex(vec2 p, float s) {
	const vec3 k = vec3(-0.866025404, 0.5, 0.577350269);
	p = abs(p);
	p -= 2.0 * min(dot(k.xy, p), 0.0) * k.xy;
	p -= vec2(clamp(p.x, -k.z * s, k.z * s), s);
	return length(p) * sign(p.y);
}

float sdf_diamond(vec2 p, vec2 b) {
	p = abs(p);
	return (p.x * b.y + p.y * b.x - b.x * b.y) / length(b);
}

float merge(float a, float b) { return min(a, b); }

float arrow_sdf(vec2 p, float s) {
	float base = sdf_rect(p - vec2(0.0, s * 0.42), vec2(s * 0.32, s * 0.32));
	float spire = sdf_triangle_iso(p - vec2(0.0, -s * 0.15), s * 0.36, s * 0.65);
	return merge(base, spire);
}

float cannon_sdf(vec2 p, float s) {
	float base = sdf_rect(p - vec2(0.0, s * 0.25), vec2(s * 0.48, s * 0.42));
	float barrel = sdf_circle(p - vec2(0.0, -s * 0.18), s * 0.32);
	return merge(base, barrel);
}

float frost_sdf(vec2 p, float s) {
	float outer = sdf_hex(p, s * 0.62);
	return outer;
}

float magic_sdf(vec2 p, float s) {
	float orb = sdf_circle(p, s * 0.46);
	return orb;
}

float silhouette(vec2 p, int t, float s) {
	if (t == 0) return arrow_sdf(p, s);
	if (t == 1) return cannon_sdf(p, s);
	if (t == 2) return frost_sdf(p, s);
	return magic_sdf(p, s);
}

float accent_mask(vec2 p, int t, float s) {
	if (t == 0) return sdf_triangle_iso(p - vec2(0.0, -s * 0.30), s * 0.20, s * 0.34);
	if (t == 1) return sdf_circle(p - vec2(0.0, -s * 0.18), s * 0.16);
	if (t == 2) return sdf_hex(p, s * 0.28);
	return abs(sdf_circle(p, s * 0.30)) - s * 0.05;
}

void fragment() {
	vec2 px = (UV - vec2(0.5)) * rect_size;
	float s = min(rect_size.x, rect_size.y) * 0.5 * clamp(level, 0.5, 3.0);

	float body = silhouette(px, tower_type, s);
	float acc = accent_mask(px, tower_type, s);

	float body_alpha = 1.0 - smoothstep(-1.0, 1.0, body);
	float outline = smoothstep(-outline_width, 0.0, body) - smoothstep(0.0, 1.0, body);
	float acc_alpha = (1.0 - smoothstep(-1.0, 1.0, acc)) * body_alpha;

	vec4 col = base_color;
	col.rgb = mix(col.rgb, accent_color.rgb, acc_alpha);
	col.rgb = mix(col.rgb, outline_color.rgb, outline);
	col.a *= max(body_alpha, outline);

	COLOR = col;
}

shader_type canvas_item;

uniform vec4 bg_top : source_color = vec4(0.10, 0.13, 0.18, 0.96);
uniform vec4 bg_bottom : source_color = vec4(0.04, 0.05, 0.08, 0.96);
uniform vec4 accent_color : source_color = vec4(0.32, 0.78, 0.95, 1.0);
uniform float corner_radius : hint_range(0.0, 48.0) = 16.0;
uniform float border_width : hint_range(0.5, 4.0) = 1.5;
uniform float grid_strength : hint_range(0.0, 0.2) = 0.04;
uniform float grid_size : hint_range(8.0, 64.0) = 28.0;
uniform float corner_highlight : hint_range(0.0, 1.0) = 0.55;
uniform float vignette_strength : hint_range(0.0, 1.0) = 0.45;
uniform float top_glow_strength : hint_range(0.0, 1.0) = 0.35;
uniform vec2 rect_size = vec2(420.0, 360.0);

float rounded_box_sdf(vec2 p, vec2 b, float r) {
	vec2 q = abs(p) - b + vec2(r);
	return min(max(q.x, q.y), 0.0) + length(max(q, vec2(0.0))) - r;
}

float hex_grid(vec2 p, float size) {
	p /= size;
	p.x *= 1.1547;
	vec2 a = mod(p, vec2(1.0)) - 0.5;
	vec2 b = mod(p - vec2(0.5, 0.5), vec2(1.0)) - 0.5;
	vec2 q = length(a) < length(b) ? a : b;
	return length(q);
}

void fragment() {
	vec2 px = UV * rect_size;
	vec2 half_size = rect_size * 0.5;
	float d = rounded_box_sdf(px - half_size, half_size, corner_radius);

	float mask = clamp(0.5 - d, 0.0, 1.0);

	vec4 bg = mix(bg_top, bg_bottom, UV.y);

	float hex = hex_grid(px, grid_size);
	float grid = smoothstep(0.42, 0.46, hex) * grid_strength;

	float border = clamp(1.0 - abs(d + border_width * 0.5) / (border_width * 0.5), 0.0, 1.0);

	float tl = exp(-distance(px, vec2(0.0)) / (rect_size.x * 0.35));
	float tr = exp(-distance(px, vec2(rect_size.x, 0.0)) / (rect_size.x * 0.35));
	float corners = (tl + tr) * corner_highlight;

	vec2 center_uv = UV - vec2(0.5);
	float vignette = 1.0 - dot(center_uv, center_uv) * vignette_strength * 2.0;

	float top_glow = (1.0 - smoothstep(0.0, 0.45, UV.y)) * top_glow_strength;

	vec4 col = bg;
	col.rgb *= vignette;
	col.rgb += accent_color.rgb * grid;
	col.rgb = mix(col.rgb, accent_color.rgb * 0.9, border * 0.7);
	col.rgb += accent_color.rgb * corners * 0.18;
	col.rgb += accent_color.rgb * top_glow * 0.08;
	col.a *= mask;

	COLOR = col;
}

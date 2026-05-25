shader_type canvas_item;

uniform vec4 bg_color : source_color = vec4(0.09, 0.11, 0.15, 0.94);
uniform vec4 accent_color : source_color = vec4(0.32, 0.78, 0.95, 1.0);
uniform vec4 glow_color : source_color = vec4(0.32, 0.78, 0.95, 0.55);
uniform float border_width : hint_range(0.5, 6.0) = 1.5;
uniform float corner_radius : hint_range(0.0, 32.0) = 10.0;
uniform float glow_strength : hint_range(0.0, 1.0) = 0.0;
uniform float scanline_strength : hint_range(0.0, 0.3) = 0.04;
uniform vec2 rect_size = vec2(120.0, 48.0);

float rounded_box_sdf(vec2 p, vec2 b, float r) {
	vec2 q = abs(p) - b + vec2(r);
	return min(max(q.x, q.y), 0.0) + length(max(q, vec2(0.0))) - r;
}

void fragment() {
	vec2 px = UV * rect_size;
	vec2 half_size = rect_size * 0.5;
	float d = rounded_box_sdf(px - half_size, half_size, corner_radius);

	float mask = clamp(0.5 - d, 0.0, 1.0);
	float border = clamp(1.0 - abs(d + border_width * 0.5) / (border_width * 0.5), 0.0, 1.0);
	float inner_glow = exp(-max(-d, 0.0) * (4.0 - glow_strength * 3.0)) * glow_strength;

	float scan = scanline_strength * sin(px.y * 1.7) * 0.5;

	vec4 col = bg_color;
	col.rgb = mix(col.rgb, accent_color.rgb, border * (0.35 + glow_strength * 0.65));
	col.rgb += glow_color.rgb * inner_glow * 0.55;
	col.rgb -= vec3(scan);
	col.a = (bg_color.a + glow_color.a * inner_glow * 0.4) * mask;

	COLOR = col;
}

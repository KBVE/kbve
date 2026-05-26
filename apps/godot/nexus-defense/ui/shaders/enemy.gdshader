shader_type canvas_item;

uniform vec4 body_color : source_color = vec4(0.95, 0.42, 0.46, 1.0);
uniform vec4 highlight_color : source_color = vec4(1.0, 0.85, 0.55, 1.0);
uniform vec4 outline_color : source_color = vec4(0.06, 0.05, 0.08, 1.0);
uniform float radius : hint_range(4.0, 32.0) = 10.0;
uniform float jitter_phase = 0.0;
uniform float jitter_strength : hint_range(0.0, 0.3) = 0.08;
uniform float outline_width : hint_range(0.0, 4.0) = 1.5;
uniform vec2 rect_size = vec2(32.0, 32.0);

void fragment() {
	vec2 px = (UV - vec2(0.5)) * rect_size;
	float wobble = sin(jitter_phase) * jitter_strength;
	float r = radius * (1.0 + wobble);

	float d = length(px) - r;
	float body_alpha = 1.0 - smoothstep(-1.0, 1.0, d);
	float outline = smoothstep(-outline_width, 0.0, d) - smoothstep(0.0, 1.0, d);

	vec2 hl = px - vec2(-r * 0.35, -r * 0.35);
	float hl_d = length(hl) - r * 0.32;
	float highlight = (1.0 - smoothstep(-1.0, 1.5, hl_d)) * body_alpha * 0.65;

	vec4 col = body_color;
	col.rgb = mix(col.rgb, highlight_color.rgb, highlight);
	col.rgb = mix(col.rgb, outline_color.rgb, outline);
	col.a *= max(body_alpha, outline);

	COLOR = col;
}

shader_type spatial;
render_mode unshaded, cull_front;

uniform vec3 line_color: source_color = vec3(0.07, 0.05, 0.1);
uniform float thickness: hint_range(0.0, 0.1) = 0.02;

void vertex() {
	VERTEX += NORMAL * thickness;
}

void fragment() {
	ALBEDO = line_color;
}

import { createEffect } from './createEffect';
import type { EffectDefinition } from './types';

export const starfield: EffectDefinition = {
	id: 'starfield',
	label: 'Starfield',
	init: createEffect({
		helpers: /* wgsl */ `
fn hash(p: vec2f) -> f32 {
  return fract(sin(dot(p, vec2f(127.1, 311.7))) * 43758.5453);
}
`,
		fragment: /* wgsl */ `
  let aspect = u.res.x / max(u.res.y, 1.0);
  var uv = in.uv;
  uv.x *= aspect;
  let scale = 18.0;
  let cell = floor(uv * scale);
  let f = fract(uv * scale);
  let star = hash(cell);
  let center = vec2f(hash(cell + 1.3), hash(cell + 2.7));
  let d = length(f - center);
  let twinkle = 0.5 + 0.5 * sin(u.time * 3.0 + star * 6.2831);
  let bright = step(0.92, star) * smoothstep(0.12, 0.0, d) * twinkle;
  let col = mix(vec3f(0.6, 0.75, 1.0), vec3f(1.0), star) * bright;
  return vec4f(col, bright);
`,
	}),
};

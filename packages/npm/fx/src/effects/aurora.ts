import { createEffect } from './createEffect';
import type { EffectDefinition } from './types';

export const aurora: EffectDefinition = {
	id: 'aurora',
	label: 'Aurora',
	init: createEffect({
		helpers: /* wgsl */ `
fn band(uv: vec2f, t: f32, off: f32, speed: f32) -> f32 {
  let y = uv.y
    + 0.12 * sin(uv.x * 6.0 + t * speed + off)
    + 0.06 * sin(uv.x * 13.0 - t * speed * 0.7 + off);
  let center = 0.45 + 0.18 * sin(t * 0.3 + off);
  return smoothstep(0.22, 0.0, abs(y - center));
}
`,
		fragment: /* wgsl */ `
  let t = u.time;
  let a1 = band(in.uv, t, 0.0, 0.8);
  let a2 = band(in.uv, t, 2.1, 1.1);
  let a3 = band(in.uv, t, 4.2, 0.6);
  let col =
      a1 * vec3f(0.10, 0.85, 0.65)
    + a2 * vec3f(0.30, 0.45, 0.95)
    + a3 * vec3f(0.65, 0.25, 0.85);
  let alpha = clamp(a1 + a2 + a3, 0.0, 0.85);
  return vec4f(col, alpha);
`,
	}),
};

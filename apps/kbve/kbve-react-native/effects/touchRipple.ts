import { createEffect } from './createEffect';
import type { EffectDefinition } from './types';

export const touchRipple: EffectDefinition = {
	id: 'touchRipple',
	label: 'Touch',
	init: createEffect({
		fragment: /* wgsl */ `
  let aspect = u.res.x / max(u.res.y, 1.0);
  var p = in.uv;
  var c = u.pointer;
  p.x *= aspect;
  c.x *= aspect;
  let dist = length(p - c);
  let speed = 1.6;
  let wave = sin(dist * 38.0 - u.time * 6.0);
  let falloff = smoothstep(0.6, 0.0, dist);
  let ring = smoothstep(0.4, 1.0, wave) * falloff;
  let glow = falloff * (0.25 + 0.75 * u.down);
  let base = 0.5 + 0.5 * cos(u.time + dist * 8.0 + vec3f(0.0, 2.0, 4.0));
  let col = base * (ring + glow);
  let alpha = clamp(ring + glow * 0.6, 0.0, 0.9);
  return vec4f(col * alpha, alpha);
`,
	}),
};

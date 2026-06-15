import { createEffect } from './createEffect';
import type { EffectDefinition } from './types';

export const ripple: EffectDefinition = {
	id: 'ripple',
	label: 'Ripple',
	init: createEffect({
		fragment: /* wgsl */ `
  let aspect = u.res.x / max(u.res.y, 1.0);
  var p = in.uv - vec2f(0.5);
  p.x *= aspect;
  let dist = length(p);
  let wave = sin(dist * 42.0 - u.time * 5.0);
  let ring = smoothstep(0.35, 1.0, wave) * smoothstep(0.75, 0.2, dist);
  let col = mix(vec3f(0.05, 0.45, 0.95), vec3f(0.55, 0.85, 1.0), ring);
  let alpha = ring * 0.9;
  return vec4f(col * alpha, alpha);
`,
	}),
};

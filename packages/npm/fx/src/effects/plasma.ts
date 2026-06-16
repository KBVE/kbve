import { createEffect } from './createEffect';
import type { EffectDefinition } from './types';

export const plasma: EffectDefinition = {
	id: 'plasma',
	label: 'Plasma',
	init: createEffect({
		fragment: /* wgsl */ `
  let t = u.time;
  let p = in.uv * 10.0;
  var v = sin(p.x + t);
  v += sin((p.y + t) * 0.5);
  v += sin((p.x + p.y + t) * 0.5);
  let cx = p.x + 0.5 * sin(t * 0.33);
  let cy = p.y + 0.5 * cos(t * 0.42);
  v += sin(sqrt(cx * cx + cy * cy) + t);
  let col = 0.5 + 0.5 * cos(vec3f(v, v + 2.094, v + 4.188) * 3.14159);
  return vec4f(col, 1.0);
`,
	}),
};

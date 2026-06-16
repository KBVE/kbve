import { createEffect } from './createEffect';
import type { EffectDefinition } from './types';

export const themed: EffectDefinition = {
	id: 'themed',
	label: 'Themed',
	init: createEffect({
		fragment: /* wgsl */ `
  let t = u.time;
  var v = sin(in.uv.x * 8.0 + t);
  v += sin(in.uv.y * 8.0 - t * 0.7);
  v += sin((in.uv.x + in.uv.y) * 6.0 + t * 0.4);
  let glow = 0.5 + 0.5 * sin(v * 1.5);
  let col = u.accent * glow;
  return vec4f(col, glow);
`,
	}),
};

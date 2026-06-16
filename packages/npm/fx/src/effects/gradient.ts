import { createEffect } from './createEffect';
import type { EffectDefinition } from './types';

export const gradient: EffectDefinition = {
	id: 'gradient',
	label: 'Gradient',
	init: createEffect({
		fragment: /* wgsl */ `
  let c = 0.5 + 0.5 * cos(u.time + in.uv.xyx * 3.0 + vec3f(0.0, 2.0, 4.0));
  return vec4f(c, 1.0);
`,
	}),
};

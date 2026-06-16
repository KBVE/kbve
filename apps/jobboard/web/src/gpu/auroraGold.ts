import { createEffect } from '@kbve/fx';

// Gold/amber aurora tuned to the @kbve dark theme — slow, low-contrast bands
// meant to sit behind the dashboard at low opacity.
export const auroraGold = createEffect({
	helpers: /* wgsl */ `
fn band(uv: vec2f, t: f32, off: f32, speed: f32) -> f32 {
  let y = uv.y
    + 0.10 * sin(uv.x * 5.0 + t * speed + off)
    + 0.05 * sin(uv.x * 11.0 - t * speed * 0.7 + off);
  let center = 0.5 + 0.16 * sin(t * 0.25 + off);
  return smoothstep(0.26, 0.0, abs(y - center));
}
`,
	fragment: /* wgsl */ `
  let t = u.time;
  let a1 = band(in.uv, t, 0.0, 0.5);
  let a2 = band(in.uv, t, 2.1, 0.7);
  let a3 = band(in.uv, t, 4.2, 0.4);
  let col =
      a1 * vec3f(0.79, 0.65, 0.42)
    + a2 * vec3f(0.65, 0.49, 0.26)
    + a3 * vec3f(0.45, 0.30, 0.55);
  let alpha = clamp(a1 + a2 + a3, 0.0, 0.6);
  return vec4f(col, alpha);
`,
});

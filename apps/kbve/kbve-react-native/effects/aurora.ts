import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import type { EffectInit } from './types';

const SHADER = /* wgsl */ `
struct VsOut { @builtin(position) pos: vec4f, @location(0) uv: vec2f };

@vertex
fn vs(@builtin(vertex_index) i: u32) -> VsOut {
  var p = array<vec2f, 3>(vec2f(-1.0, -3.0), vec2f(-1.0, 1.0), vec2f(3.0, 1.0));
  var out: VsOut;
  out.pos = vec4f(p[i], 0.0, 1.0);
  out.uv = (p[i] + vec2f(1.0)) * 0.5;
  return out;
}

struct Uniforms { time: f32 };
@group(0) @binding(0) var<uniform> u: Uniforms;

fn band(uv: vec2f, t: f32, off: f32, speed: f32) -> f32 {
  let y = uv.y
    + 0.12 * sin(uv.x * 6.0 + t * speed + off)
    + 0.06 * sin(uv.x * 13.0 - t * speed * 0.7 + off);
  let center = 0.45 + 0.18 * sin(t * 0.3 + off);
  let d = abs(y - center);
  return smoothstep(0.22, 0.0, d);
}

@fragment
fn fs(in: VsOut) -> @location(0) vec4f {
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
}
`;

const Uniforms = d.struct({ time: d.f32 });

export const auroraEffect: EffectInit = ({ device, format }) => {
	const root = tgpu.initFromDevice({ device });
	const uniforms = root.createBuffer(Uniforms).$usage('uniform');
	const uniformBuffer = root.unwrap(uniforms);

	const module = device.createShaderModule({ code: SHADER });
	const pipeline = device.createRenderPipeline({
		layout: 'auto',
		vertex: { module, entryPoint: 'vs' },
		fragment: { module, entryPoint: 'fs', targets: [{ format }] },
		primitive: { topology: 'triangle-list' },
	});
	const bindGroup = device.createBindGroup({
		layout: pipeline.getBindGroupLayout(0),
		entries: [{ binding: 0, resource: { buffer: uniformBuffer } }],
	});

	return {
		frame(view, timeMs) {
			uniforms.write({ time: timeMs / 1000 });
			const encoder = device.createCommandEncoder();
			const pass = encoder.beginRenderPass({
				colorAttachments: [
					{
						view,
						clearValue: { r: 0, g: 0, b: 0, a: 0 },
						loadOp: 'clear',
						storeOp: 'store',
					},
				],
			});
			pass.setPipeline(pipeline);
			pass.setBindGroup(0, bindGroup);
			pass.draw(3);
			pass.end();
			device.queue.submit([encoder.finish()]);
		},
		dispose() {
			root.destroy();
		},
	};
};

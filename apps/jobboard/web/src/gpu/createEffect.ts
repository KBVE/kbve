// Web port of the @kbve mobile TypeGPU effect core (apps/kbve/kbve-react-native/
// effects/createEffect.ts). Identical pipeline; the host loop differs (browser
// auto-presents on submit, no context.present). Shaders are reusable as-is.
import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import type { EffectInit } from './types';

const PRELUDE = /* wgsl */ `
struct VsOut { @builtin(position) pos: vec4f, @location(0) uv: vec2f };

@vertex
fn vs(@builtin(vertex_index) i: u32) -> VsOut {
  var p = array<vec2f, 3>(vec2f(-1.0, -3.0), vec2f(-1.0, 1.0), vec2f(3.0, 1.0));
  var out: VsOut;
  out.pos = vec4f(p[i], 0.0, 1.0);
  out.uv = (p[i] + vec2f(1.0)) * 0.5;
  return out;
}

struct Globals {
  time: f32,
  intensity: f32,
  res: vec2f,
  pointer: vec2f,
  down: f32,
  accent: vec3f,
};
@group(0) @binding(0) var<uniform> u: Globals;
`;

const Globals = d.struct({
	time: d.f32,
	intensity: d.f32,
	res: d.vec2f,
	pointer: d.vec2f,
	down: d.f32,
	accent: d.vec3f,
});

export interface EffectSpec {
	fragment: string;
	helpers?: string;
}

export function createEffect(spec: EffectSpec): EffectInit {
	const code = `${PRELUDE}\n${spec.helpers ?? ''}\nfn effect(in: VsOut) -> vec4f {\n${spec.fragment}\n}\n\n@fragment\nfn fs(in: VsOut) -> @location(0) vec4f {\n  return effect(in) * u.intensity;\n}`;

	return ({ device, format }) => {
		const root = tgpu.initFromDevice({ device });
		const globals = root.createBuffer(Globals).$usage('uniform');
		const globalsBuffer = root.unwrap(globals);

		const module = device.createShaderModule({ code });
		const pipeline = device.createRenderPipeline({
			layout: 'auto',
			vertex: { module, entryPoint: 'vs' },
			fragment: { module, entryPoint: 'fs', targets: [{ format }] },
			primitive: { topology: 'triangle-list' },
		});
		const bindGroup = device.createBindGroup({
			layout: pipeline.getBindGroupLayout(0),
			entries: [{ binding: 0, resource: { buffer: globalsBuffer } }],
		});

		return {
			frame(state) {
				globals.write({
					time: state.timeMs / 1000,
					intensity: state.intensity,
					res: d.vec2f(state.width, state.height),
					pointer: d.vec2f(state.pointerX, state.pointerY),
					down: state.pointerDown,
					accent: d.vec3f(
						state.accent[0],
						state.accent[1],
						state.accent[2],
					),
				});
				const encoder = device.createCommandEncoder();
				const pass = encoder.beginRenderPass({
					colorAttachments: [
						{
							view: state.view,
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
}

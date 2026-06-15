import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import type { EffectInit } from './types';

/// Shared WGSL prelude: a fullscreen-triangle vertex stage that hands the
/// fragment an `in.uv` in [0,1], plus the standard `u` globals (time seconds,
/// res in pixels). Effect authors only write the fragment body + any helpers.
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

struct Globals { time: f32, res: vec2f, pointer: vec2f, down: f32 };
@group(0) @binding(0) var<uniform> u: Globals;
`;

const Globals = d.struct({
	time: d.f32,
	res: d.vec2f,
	pointer: d.vec2f,
	down: d.f32,
});

export interface EffectSpec {
	/// Body of `fn fs(in: VsOut) -> @location(0) vec4f { ... }`. May read
	/// `u.time`, `u.res`, `u.pointer` (normalized [0,1]), `u.down` (0/1), and
	/// `in.uv`. Return a premultiplied color (rgb already multiplied by alpha)
	/// so it composites correctly on transparent canvases.
	fragment: string;
	/// Optional top-level WGSL (helper fns / consts) injected before `fs`.
	helpers?: string;
}

/// Build an EffectInit from a fragment shader. Handles tgpu root init, the
/// fullscreen pipeline, the globals uniform, the per-frame uniform write/draw,
/// and teardown — so a new effect is just WGSL.
export function createEffect(spec: EffectSpec): EffectInit {
	const code = `${PRELUDE}\n${spec.helpers ?? ''}\n@fragment\nfn fs(in: VsOut) -> @location(0) vec4f {\n${spec.fragment}\n}`;

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
					res: d.vec2f(state.width, state.height),
					pointer: d.vec2f(state.pointerX, state.pointerY),
					down: state.pointerDown,
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

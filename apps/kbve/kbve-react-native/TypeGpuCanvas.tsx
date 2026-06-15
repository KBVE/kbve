/// <reference types="@webgpu/types" />
import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { Canvas, useCanvasRef, useDevice } from 'react-native-webgpu';

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

@fragment
fn fs(in: VsOut) -> @location(0) vec4f {
  let t = u.time;
  let c = 0.5 + 0.5 * cos(t + in.uv.xyx * 3.0 + vec3f(0.0, 2.0, 4.0));
  return vec4f(c, 1.0);
}
`;

export interface TypeGpuCanvasProps {
	style?: StyleProp<ViewStyle>;
	transparent?: boolean;
}

/// VS1: prove react-native-webgpu renders an animated WGSL shader in-app.
export function TypeGpuCanvas({
	style,
	transparent = false,
}: TypeGpuCanvasProps) {
	const ref = useCanvasRef();
	const { device } = useDevice();

	useEffect(() => {
		if (!device || !ref.current) return;
		const context = ref.current.getContext('webgpu');
		if (!context) return;

		const format = navigator.gpu.getPreferredCanvasFormat();
		context.configure({
			device,
			format,
			alphaMode: transparent ? 'premultiplied' : 'opaque',
		});

		const module = device.createShaderModule({ code: SHADER });
		const uniform = device.createBuffer({
			size: 16,
			usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
		});
		const pipeline = device.createRenderPipeline({
			layout: 'auto',
			vertex: { module, entryPoint: 'vs' },
			fragment: { module, entryPoint: 'fs', targets: [{ format }] },
			primitive: { topology: 'triangle-list' },
		});
		const bindGroup = device.createBindGroup({
			layout: pipeline.getBindGroupLayout(0),
			entries: [{ binding: 0, resource: { buffer: uniform } }],
		});

		let raf = 0;
		const start = Date.now();
		const frame = () => {
			device.queue.writeBuffer(
				uniform,
				0,
				new Float32Array([(Date.now() - start) / 1000]),
			);
			const encoder = device.createCommandEncoder();
			const pass = encoder.beginRenderPass({
				colorAttachments: [
					{
						view: context.getCurrentTexture().createView(),
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
			context.present();
			raf = requestAnimationFrame(frame);
		};
		frame();
		return () => cancelAnimationFrame(raf);
	}, [device, transparent]);

	return (
		<Canvas
			ref={ref}
			transparent={transparent}
			style={[styles.fill, style]}
		/>
	);
}

const styles = StyleSheet.create({
	fill: { flex: 1, width: '100%' },
});

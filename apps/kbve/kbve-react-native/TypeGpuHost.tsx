/// <reference types="@webgpu/types" />
import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import { Canvas, useCanvasRef, useDevice } from 'react-native-webgpu';
import { registerNativeComponent, TYPEGPU_COMPONENT_ID } from '@kbve/rn';
import type { NativeComponentProps } from '@kbve/rn';
import { getEffect } from './effects';

/// Plugin-routed TypeGPU effect host. `effectId` (from the `typegpu` manifest
/// entry) selects a JS-authored effect from the registry; the bridge is held
/// for capability-gated host calls effects may need later.
function TypeGpuHost({ effectId, fullBleed, style }: NativeComponentProps) {
	const ref = useCanvasRef();
	const { device } = useDevice();

	useEffect(() => {
		if (!device || !ref.current || !effectId) return;
		const init = getEffect(effectId);
		if (!init) return;
		const context = ref.current.getContext('webgpu');
		if (!context) return;

		const format = navigator.gpu.getPreferredCanvasFormat();
		context.configure({
			device,
			format,
			alphaMode: fullBleed ? 'premultiplied' : 'opaque',
		});

		const runner = init({ device, format });
		let raf = 0;
		const start = Date.now();
		const loop = () => {
			runner.frame(
				context.getCurrentTexture().createView(),
				Date.now() - start,
			);
			context.present();
			raf = requestAnimationFrame(loop);
		};
		loop();
		return () => {
			cancelAnimationFrame(raf);
			runner.dispose();
		};
	}, [device, effectId, fullBleed]);

	return (
		<Canvas
			ref={ref}
			transparent={fullBleed}
			style={[styles.fill, style]}
		/>
	);
}

registerNativeComponent(TYPEGPU_COMPONENT_ID, TypeGpuHost);

export { TypeGpuHost };

const styles = StyleSheet.create({
	fill: { flex: 1, width: '100%' },
});

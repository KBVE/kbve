/// <reference types="@webgpu/types" />
import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import type { GestureResponderEvent, LayoutChangeEvent } from 'react-native';
import { Canvas, useCanvasRef, useDevice } from 'react-native-webgpu';
import { registerNativeComponent, TYPEGPU_COMPONENT_ID } from '@kbve/rn';
import type { NativeComponentProps } from '@kbve/rn';
import { getEffect } from './effects';

/// Plugin-routed TypeGPU effect host. `effectId` (from the `typegpu` manifest
/// entry) selects a JS-authored effect from the registry. Pointer touches are
/// captured here and fed to the shader as normalized [0,1] coords.
function TypeGpuHost({ effectId, fullBleed, style }: NativeComponentProps) {
	const ref = useCanvasRef();
	const { device } = useDevice();
	const pointer = useRef({ x: 0.5, y: 0.5, down: 0 });
	const layout = useRef({ w: 1, h: 1 });

	const onLayout = (e: LayoutChangeEvent) => {
		const { width, height } = e.nativeEvent.layout;
		layout.current = { w: width || 1, h: height || 1 };
	};

	const track = (down: number) => (e: GestureResponderEvent) => {
		const { locationX, locationY } = e.nativeEvent;
		pointer.current = {
			x: Math.min(Math.max(locationX / layout.current.w, 0), 1),
			y: Math.min(Math.max(locationY / layout.current.h, 0), 1),
			down,
		};
	};

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
			try {
				const texture = context.getCurrentTexture();
				runner.frame({
					view: texture.createView(),
					timeMs: Date.now() - start,
					width: texture.width,
					height: texture.height,
					pointerX: pointer.current.x,
					pointerY: pointer.current.y,
					pointerDown: pointer.current.down,
				});
				context.present();
				raf = requestAnimationFrame(loop);
			} catch {
				// Surface lost (rotation/resize/teardown): stop cleanly; the
				// effect re-inits when the canvas remounts.
			}
		};
		loop();
		return () => {
			cancelAnimationFrame(raf);
			runner.dispose();
		};
	}, [device, effectId, fullBleed]);

	return (
		<View
			style={[styles.fill, style]}
			onLayout={onLayout}
			onStartShouldSetResponder={() => true}
			onMoveShouldSetResponder={() => true}
			onResponderGrant={track(1)}
			onResponderMove={track(1)}
			onResponderRelease={track(0)}
			onResponderTerminate={track(0)}>
			<Canvas ref={ref} transparent={fullBleed} style={styles.fill} />
		</View>
	);
}

registerNativeComponent(TYPEGPU_COMPONENT_ID, TypeGpuHost);

export { TypeGpuHost };

const styles = StyleSheet.create({
	fill: { flex: 1, width: '100%' },
});

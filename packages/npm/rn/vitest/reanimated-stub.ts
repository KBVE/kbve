import { View } from 'react-native-web';

const passthrough = (v?: unknown) => v;
const chain = (): unknown => {
	const p: unknown = new Proxy(() => p, { get: () => p });
	return p;
};

export const useSharedValue = (initial: unknown) => ({ value: initial });
export const useAnimatedStyle = (factory: () => unknown) =>
	typeof factory === 'function' ? factory() : {};
export const useAnimatedProps = (factory: () => unknown) =>
	typeof factory === 'function' ? factory() : {};
export const withTiming = passthrough;
export const withSpring = passthrough;
export const withRepeat = passthrough;
export const withSequence = (...steps: unknown[]) => steps[steps.length - 1];
export const runOnJS =
	(fn: (...a: unknown[]) => unknown) =>
	(...a: unknown[]) =>
		fn(...a);
export const Easing = new Proxy({}, { get: () => () => 0 });
export const LinearTransition = chain();

const Animated = {
	View,
	createAnimatedComponent: (c: unknown) => c,
};

export default Animated;

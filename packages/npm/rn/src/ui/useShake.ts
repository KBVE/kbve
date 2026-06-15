import {
	useAnimatedStyle,
	useSharedValue,
	withSequence,
	withTiming,
} from 'react-native-reanimated';
import type { ViewStyle } from 'react-native';

export interface ShakeControl {
	style: ViewStyle;
	shake: () => void;
}

export function useShake(): ShakeControl {
	const tx = useSharedValue(0);
	const style = useAnimatedStyle(() => ({
		transform: [{ translateX: tx.value }],
	}));
	const shake = () => {
		tx.value = withSequence(
			withTiming(-8, { duration: 45 }),
			withTiming(8, { duration: 45 }),
			withTiming(-6, { duration: 45 }),
			withTiming(6, { duration: 45 }),
			withTiming(0, { duration: 45 }),
		);
	};
	return { style: style as ViewStyle, shake };
}

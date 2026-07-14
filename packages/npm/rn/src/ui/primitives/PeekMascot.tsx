import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import type { ViewStyle } from 'react-native';
import Animated, {
	Easing,
	useAnimatedProps,
	useSharedValue,
	withRepeat,
	withSequence,
	withTiming,
} from 'react-native-reanimated';
import Svg, {
	Circle,
	Defs,
	Ellipse,
	G,
	LinearGradient,
	Path,
	Stop,
} from 'react-native-svg';

const AnimatedG = Animated.createAnimatedComponent(G);

export interface PeekMascotProps {
	peeking: boolean;
	size?: number;
	style?: ViewStyle;
}

export function PeekMascot({ peeking, size = 96, style }: PeekMascotProps) {
	const bob = useSharedValue(0);
	const peek = useSharedValue(0);
	const lift = useSharedValue(0);

	useEffect(() => {
		bob.value = withRepeat(
			withSequence(
				withTiming(-5, {
					duration: 1600,
					easing: Easing.inOut(Easing.ease),
				}),
				withTiming(0, {
					duration: 1600,
					easing: Easing.inOut(Easing.ease),
				}),
			),
			-1,
			false,
		);
	}, []);

	useEffect(() => {
		peek.value = withTiming(peeking ? 1 : 0, { duration: 180 });
		lift.value = withTiming(peeking ? 1 : 0, { duration: 300 });
	}, [peeking]);

	const bodyFloat = useAnimatedProps(() => ({
		transform: [{ translateY: bob.value }],
	}));
	const openEyes = useAnimatedProps(() => ({ opacity: 1 - peek.value }));
	const closedEyes = useAnimatedProps(() => ({ opacity: peek.value }));
	const leftHand = useAnimatedProps(() => ({
		transform: [
			{ translateX: lift.value * 16 },
			{ translateY: lift.value * -26 },
		],
	}));
	const rightHand = useAnimatedProps(() => ({
		transform: [
			{ translateX: lift.value * -16 },
			{ translateY: lift.value * -26 },
		],
	}));

	return (
		<View style={[styles.container, style]}>
			<Svg width={size} height={size} viewBox="0 0 140 140">
				<Defs>
					<LinearGradient id="ghost-body" x1="0" y1="0" x2="0" y2="1">
						<Stop offset="0%" stopColor="#ab98f7" />
						<Stop offset="100%" stopColor="#6a35eb" />
					</LinearGradient>
				</Defs>

				<Ellipse
					cx="70"
					cy="132"
					rx="26"
					ry="5"
					fill="#000"
					opacity={0.25}
				/>

				<AnimatedG animatedProps={bodyFloat}>
					<Path
						d="M28 70 C28 42 47 24 70 24 C93 24 112 42 112 70 L112 104 q-11 12 -22 0 q-11 -12 -22 0 q-11 12 -22 0 q-11 -12 -22 0 Z"
						fill="url(#ghost-body)"
					/>
					<Path
						d="M44 44 C52 33 70 31 78 34 C66 34 54 42 50 56 C47 52 45 48 44 44 Z"
						fill="#fff"
						opacity={0.18}
					/>

					<Ellipse
						cx="48"
						cy="74"
						rx="6"
						ry="4"
						fill="#fb7185"
						opacity={0.45}
					/>
					<Ellipse
						cx="92"
						cy="74"
						rx="6"
						ry="4"
						fill="#fb7185"
						opacity={0.45}
					/>

					<AnimatedG animatedProps={openEyes}>
						<Ellipse
							cx="57"
							cy="62"
							rx="5.5"
							ry="7.5"
							fill="#1b1814"
						/>
						<Ellipse
							cx="83"
							cy="62"
							rx="5.5"
							ry="7.5"
							fill="#1b1814"
						/>
						<Circle cx="59" cy="59" r="2" fill="#f5ecd8" />
						<Circle cx="85" cy="59" r="2" fill="#f5ecd8" />
					</AnimatedG>
					<AnimatedG
						animatedProps={closedEyes}
						stroke="#1b1814"
						strokeWidth={3}
						strokeLinecap="round"
						fill="none">
						<Path d="M50 63 q7 6 14 0" />
						<Path d="M76 63 q7 6 14 0" />
					</AnimatedG>

					<Ellipse
						cx="70"
						cy="80"
						rx="4"
						ry="5"
						fill="#1b1814"
						opacity={0.85}
					/>

					<AnimatedG animatedProps={leftHand}>
						<Circle cx="34" cy="92" r="11" fill="#5827c4" />
						<Circle
							cx="31"
							cy="89"
							r="3.5"
							fill="#ab98f7"
							opacity={0.6}
						/>
					</AnimatedG>
					<AnimatedG animatedProps={rightHand}>
						<Circle cx="106" cy="92" r="11" fill="#5827c4" />
						<Circle
							cx="103"
							cy="89"
							r="3.5"
							fill="#ab98f7"
							opacity={0.6}
						/>
					</AnimatedG>
				</AnimatedG>
			</Svg>
		</View>
	);
}

const styles = StyleSheet.create({
	container: { alignItems: 'center', justifyContent: 'center' },
});

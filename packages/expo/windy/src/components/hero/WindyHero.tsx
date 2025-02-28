import { View, Text } from 'react-native';
import Animated, {
	useSharedValue,
	useAnimatedStyle,
	withSpring,
} from 'react-native-reanimated';
import { Image as ExpoImage } from 'expo-image';
import { cn } from '../../utils/cn';
import React from 'react';

const AnimatedImage = Animated.createAnimatedComponent(ExpoImage);

interface WindyHeroProps {
	title: string;
	subtitle?: string;
	imageUrl: string;
}

export default function WindyHero({
	title,
	subtitle,
	imageUrl,
}: WindyHeroProps) {
	const opacity = React.useRef(useSharedValue(0)).current;
	const imageOpacity = React.useRef(useSharedValue(0)).current;

	const animatedTextStyle = useAnimatedStyle(() => ({
		opacity: withSpring(opacity.value, { damping: 10, stiffness: 100 }),
	}));

  const animatedImageStyle = useAnimatedStyle(() => ({
    opacity: withSpring(imageOpacity.value, { damping: 10, stiffness: 100 }),
  }));

	React.useEffect(() => {
		opacity.value = 1;
	}, [opacity, imageOpacity]);

	return (
		<View
			className={cn(
				'relative w-full h-[300px] md:h-[400px] lg:h-[500px] overflow-hidden border-2 border-white',
			)}>
			<AnimatedImage
				source={{ uri: imageUrl, width: 400, height: 400 }}
        style={animatedImageStyle}
				className={cn(
					'absolute top-0 left-0 w-full h-full object-cover z-0  bg-red-500',
				)}
				contentFit="cover"
			/>

			<View
				className={cn(
					'absolute inset-0 flex items-center justify-center px-4 z-10',
				)}>
				<Animated.View style={animatedTextStyle}>
					<Text
						className={cn(
							'text-white text-2xl md:text-4xl font-bold text-center',
						)}>
						{title}
					</Text>
					{subtitle && (
						<Text
							className={cn(
								'text-white text-lg md:text-2xl mt-2 text-center ml-2',
							)}>
							{subtitle}
						</Text>
					)}
				</Animated.View>
			</View>
		</View>
	);
}

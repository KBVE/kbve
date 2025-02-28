import { View, Text } from 'react-native';
import Animated, {
	useSharedValue,
	useAnimatedStyle,
	withSpring,
} from 'react-native-reanimated';
import { Image as ExpoImage } from 'expo-image';
import { cn } from '../../utils/cn';
import React from 'react';


const blurhash =
  '|rF?hV%2WCj[ayj[a|j[az_NaeWBj@ayfRayfQfQM{M|azj[azf6fQfQfQIpWXofj[ayj[j[fQayWCoeoeaya}j[ayfQa{oLj?j[WVj[ayayj[fQoff7azayj[ayj[j[ayofayayayj[fQj[ayayj[ayfjj[j[ayjuayj[';


const AnimatedImage = Animated.createAnimatedComponent(ExpoImage);

interface WindyHeroProps {
	title: string;
	subtitle?: string;
	imageUrl: string;
	minWidth?: number;
	minHeight?: number;
	overlayColor?: string;
	className?: string;
}

export default function WindyHero({
	title,
	subtitle,
	imageUrl,
	minHeight = 400,
	minWidth = 500,
	overlayColor = 'rgba(0, 0, 0, 0.5)',
	className = ''
}: WindyHeroProps) {
	const opacity = React.useRef(useSharedValue(0)).current;
	const imageOpacity = React.useRef(useSharedValue(0)).current;

	const animatedTextStyle = useAnimatedStyle(() => ({
    flex: 1,
	opacity: withSpring(opacity.value, { damping: 10, stiffness: 100 }),
	}));

  const animatedImageStyle = useAnimatedStyle(() => ({
    flex: 1,
    backgroundColor: overlayColor,
    opacity: withSpring(imageOpacity.value, { damping: 10, stiffness: 100 }),
  }));

	React.useEffect(() => {
		opacity.value = 1;
    imageOpacity.value = 1;
	}, [opacity, imageOpacity]);

	return (
		<View
		className={cn(
			`flex-1 relative overflow-hidden border-2 border-white`,
			`min-w-[${minWidth}px] min-h-[${minHeight}px]`,
			className,
		)}>
			<AnimatedImage
				source={{ uri: imageUrl, width: minWidth, height: minHeight }}
        style={[animatedImageStyle, { width: "100%", height: "100%" }]}

        placeholder={{ blurhash }}
				className={cn(
					'absolute top-0 left-0 w-full h-full object-cover',
				)}
				contentFit="cover"
        transition={1000}
			/>

			<View
				className={cn(
					'absolute inset-0 flex items-center justify-center px-4',
				)}>
				<Animated.View style={animatedTextStyle}>
					<Text
						className={cn(
							'text-white mt-4 text-2xl md:text-4xl font-bold text-center',
						)}>
						{title}
					</Text>
					{subtitle && (
						<Text
							className={cn(
								'text-white mt-4 text-lg md:text-2xl mt-2 text-center ml-2',
							)}>
							{subtitle}
						</Text>
					)}
				</Animated.View>
			</View>
		</View>
	);
  
}


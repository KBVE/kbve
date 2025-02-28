import { View, Text, TouchableOpacity } from 'react-native';
import Animated, {
	useSharedValue,
	useAnimatedStyle,
	withSpring,
	withTiming,
} from 'react-native-reanimated';
import { Image as ExpoImage } from 'expo-image';
import { cn } from '../../utils/cn';
import React, { useEffect, useState } from 'react';

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
	onPress?: () => void;
}

export default function WindyHero({
	title,
	subtitle,
	imageUrl,
	minHeight = 400,
	minWidth = 500,
	overlayColor = 'rgba(0, 0, 0, 0.5)',
	className = '',
	onPress,
}: WindyHeroProps) {
	const opacity = React.useRef(useSharedValue(0)).current;
	const imageOpacity = React.useRef(useSharedValue(0)).current;
	const skeletonOpacity = React.useRef(useSharedValue(1)).current;

	const [isLoading, setIsLoading] = useState(true);

	const animatedTextStyle = useAnimatedStyle(() => ({
		flex: 1,
		opacity: withSpring(opacity.value, { damping: 10, stiffness: 100 }),
	}));

	const animatedImageStyle = useAnimatedStyle(() => ({
		flex: 1,
		backgroundColor: overlayColor,
		opacity: withTiming(imageOpacity.value, { duration: 500 }),
	}));

	const animatedSkeletonStyle = useAnimatedStyle(() => ({
		opacity: withTiming(skeletonOpacity.value, { duration: 500 }),
	}));

	useEffect(() => {
		ExpoImage.prefetch(imageUrl, { cachePolicy: 'disk' })
			.then((success) => {
				if (!success)
					console.warn('Failed to prefetch image:', imageUrl);
			})
			.catch((error) => console.error('Prefetch error:', error))
			.finally(() => {
				skeletonOpacity.value = 0;
				imageOpacity.value = 1;
				setTimeout(() => {
					opacity.value = 1;
					setIsLoading(false);
				}, 500);
			});
	}, [imageOpacity, imageUrl, opacity, skeletonOpacity]);

	return (
		<TouchableOpacity
			onPress={onPress}
			activeOpacity={0.7}
			disabled={!onPress}>
			<View
				className={cn(
					'flex-1 relative overflow-hidden border-2 border-white',
					`min-w-[${minWidth}px] min-h-[${minHeight}px]`,
					className,
				)}>
				{isLoading && (
					<Animated.View
						style={[animatedSkeletonStyle, { minWidth, minHeight }]}
						className={cn(
							'absolute top-0 left-0 animate-pulse',
							className,
						)}
					/>
				)}

				<AnimatedImage
					source={{
						uri: imageUrl,
						width: minWidth,
						height: minHeight,
					}}
					style={[
						animatedImageStyle,
						{ width: '100%', height: '100%' },
					]}
					placeholder={{ blurhash }}
					priority="high"
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
									'text-white mt-4 text-lg md:text-2xl text-center',
								)}>
								{subtitle}
							</Text>
						)}
					</Animated.View>
				</View>
			</View>
		</TouchableOpacity>
	);
}

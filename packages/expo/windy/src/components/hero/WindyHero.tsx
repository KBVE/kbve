import { View, Text, TouchableOpacity } from 'react-native';
import Animated, {
	useSharedValue,
	useAnimatedStyle,
	withSpring,
	withTiming,
	useDerivedValue,
} from 'react-native-reanimated';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import { Image as ExpoImage } from 'expo-image';
import { cn } from '../../utils/cn';
import React, { useEffect, useState } from 'react';

import { ExpoVectorIcon } from '../icon/ExpoVectorIcon';

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

	const derivedImageOpacity = useDerivedValue(() => {
		return skeletonOpacity.value === 0 ? withTiming(1, { duration: 500 }) : 0;
	}, [skeletonOpacity]);

	const derivedTextOpacity = useDerivedValue(() => {
		return imageOpacity.value === 1 ? withSpring(1, { damping: 10, stiffness: 100 }) : 0;
	}, [imageOpacity]);

	const animatedTextStyle = useAnimatedStyle(() => ({
		flex: 1,
		opacity: derivedTextOpacity.value,
	}));

	const animatedImageStyle = useAnimatedStyle(() => ({
		flex: 1,
		backgroundColor: overlayColor,
		opacity: derivedImageOpacity.value,
	}));

	const animatedSkeletonStyle = useAnimatedStyle(() => ({
		opacity: withTiming(skeletonOpacity.value, { duration: 500 }),
	}));

	// Prefetch Image on Mount
	useEffect(() => {
		ExpoImage.prefetch(imageUrl, { cachePolicy: 'disk' })
			.then((success) => {
				if (!success) console.warn('Failed to prefetch image:', imageUrl);
			})
			.catch((error) => console.error('Prefetch error:', error))
			.finally(() => {
				skeletonOpacity.value = 0;
				setTimeout(() => {
					imageOpacity.value = 1;
				}, 500);
				setTimeout(() => {
					opacity.value = 1;
					setIsLoading(false);
				}, 1000);
			});
	}, [imageOpacity, imageUrl, opacity, skeletonOpacity]);

	// **Gesture for Icons**
	const CreateIconGesture = () => {
		const scale = useSharedValue(1);
		const animatedStyle = useAnimatedStyle(() => ({
			transform: [{ scale: withTiming(scale.value, { duration: 150 }) }],
		}));

		const tapGesture = Gesture.Tap()
			.onBegin(() => {
				scale.value = 1.2;
			})
			.onFinalize(() => {
				scale.value = 1;
			});

		return { scale, animatedStyle, tapGesture };
	};

	// **Gestures for Like, Comment, Share**
	const likeGesture = CreateIconGesture();
	const commentGesture = CreateIconGesture();
	const shareGesture = CreateIconGesture();

	return (
		<GestureHandlerRootView>
			<TouchableOpacity onPress={onPress} activeOpacity={0.95} disabled={!onPress}>
				<View
					className={cn(
						'flex-1 relative overflow-hidden border-2 border-white p-4 rounded-lg shadow-md',
						className,
					)}>
					
					{/* Skeleton Loader */}
					{isLoading && (
						<Animated.View
							style={[animatedSkeletonStyle, { minWidth, minHeight }]}
							className={cn(
								'absolute top-0 left-0 animate-pulse bg-gradient-to-r from-gray-300 via-gray-200 to-gray-300',
								className,
							)}
						/>
					)}

					{/* Image */}
					<AnimatedImage
						source={{
							uri: imageUrl,
							width: minWidth,
							height: minHeight,
						}}
						style={[
							animatedImageStyle,
							{ width: '100%', height: '100%', borderRadius: 12 },
						]}
						placeholder={{ blurhash }}
						priority="high"
						className={cn('absolute top-0 left-0 w-full h-full object-cover')}
						contentFit="cover"
						transition={1000}
					/>

					{/* Overlay with Text */}
					<View className={cn('absolute inset-0 flex items-center justify-center px-4')}>
						<Animated.View style={animatedTextStyle}>
							<Text className="text-white mt-4 text-2xl md:text-4xl font-bold text-center">
								{title}
							</Text>
							{subtitle && (
								<Text className="text-white mt-2 text-lg md:text-2xl text-center">
									{subtitle}
								</Text>
							)}
						</Animated.View>
					</View>

					{/* **Icons Row (Like, Comment, Share) with Gesture Effects** */}
					<View className="flex flex-row justify-between items-center mt-4 px-4">
						<GestureDetector gesture={likeGesture.tapGesture}>
							<Animated.View style={likeGesture.animatedStyle}>
								<ExpoVectorIcon name="heart" color="red" />
							</Animated.View>
						</GestureDetector>

						<GestureDetector gesture={commentGesture.tapGesture}>
							<Animated.View style={commentGesture.animatedStyle}>
								<ExpoVectorIcon name="chatbubble" color="blue" />
							</Animated.View>
						</GestureDetector>

						<GestureDetector gesture={shareGesture.tapGesture}>
							<Animated.View style={shareGesture.animatedStyle}>
								<ExpoVectorIcon name="share-social" color="green" />
							</Animated.View>
						</GestureDetector>
					</View>

				</View>
			</TouchableOpacity>
		</GestureHandlerRootView>
	);
}

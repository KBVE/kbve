import React from 'react';
import { Image, YStack, View, styled, H1 as TamaguiH1, H4 as TamaguiH4 } from 'tamagui';
import { LottieAnimation } from './LottieAnimation';

const StyledH1 = styled(TamaguiH1, {
  textAlign: 'center',
  color: 'white',
  textShadowColor: 'black',
  textShadowOffset: { width: -1, height: -1 },
  textShadowRadius: 2,
  shadowOpacity: 1,
});


const StyledH4 = styled(TamaguiH4, {
  textAlign: 'center',
  color: 'white',
  textShadowColor: 'black',
  textShadowOffset: { width: -1, height: -1 },
  textShadowRadius: 2,
  shadowOpacity: 1,
});

interface LottieHeroProps {
	backgroundImage: any;
	lottieJSON: any;
	title: string;
	description: string;
	opacity?: number; // Optional opacity for the animation and image
	children?: React.ReactNode; // Content (buttons or any elements) to be passed as children
}

export function LottieHero({
	backgroundImage,
	lottieJSON,
	title,
	description,
	opacity = 1.0,
	children,
}: LottieHeroProps) {
	return (
		<YStack
			style={{
				width: '100%',
				height: 750,
				overflow: 'hidden',
				position: 'relative',
			}}>
			{/* Background Image */}
			<Image
				source={backgroundImage}
				style={{
					width: '100%',
					height: '100%',
					position: 'absolute',
					opacity,
				}}
				objectFit="cover"
			/>

			{/* Lottie Animation */}
			<View
				style={{
					position: 'absolute',
					width: '100%',
					height: '100%',
					opacity,
				}}>
				<LottieAnimation
					lottieJSON={lottieJSON}
					style={{ width: '100%', height: '100%' }}
				/>
			</View>

			{/* Content Overlay */}
			<YStack
				gap={1}
				style={{
					flex: 1,
					justifyContent: 'center',
					alignItems: 'center',
					padding: 20,
					backgroundColor: 'rgba(0, 0, 0, 0.5)',
				}}>
				<StyledH1
					color="white"
					style={{
						textAlign: 'center',
						textShadowColor: 'black',
						textShadowOffset: { width: -1, height: -1 },
						textShadowRadius: 2,
						shadowOpacity: 1,
					}}>
					{title}
				</StyledH1>
				<StyledH4
					style={{
						color: 'white',
						textAlign: 'center',
						margin: '10px 0',
            textShadowColor: 'black',
						textShadowOffset: { width: -1, height: -1 },
						textShadowRadius: 2,
						shadowOpacity: 1,
					}}>
					{description}
				</StyledH4>
				{/* Render any children passed into the component */}
				{children}
			</YStack>
		</YStack>
	);
}

import React from 'react';
import { Platform, View, StyleSheet } from 'react-native';
import LottieView from 'lottie-react-native';
import { styled } from 'tamagui';

const AnimationContainer = styled(View, {
	justifyContent: 'center',
	alignItems: 'center',
});

type LottieAnimationProps = {
	lottieJSON: any; // Local JSON file (static path via `require()`)
	style?: object; // Custom style prop for the animation
};

const LottieAnimation: React.FC<LottieAnimationProps> = ({
	lottieJSON,
	style,
}) => {
	let LottiePlayerWeb: any = null;
	if (Platform.OS === 'web') {
		// eslint-disable-next-line @typescript-eslint/no-var-requires
		LottiePlayerWeb = require('@lottiefiles/react-lottie-player').Player;
	}

	return (
		<AnimationContainer>
			{Platform.OS === 'web' && LottiePlayerWeb ? (
				<LottiePlayerWeb
					src={lottieJSON} // Web uses `src` for the Lottie file
					autoplay
					loop
					style={style} // Apply custom styles here
				/>
			) : (
				<LottieView
					source={lottieJSON} // Local file loaded via `require()`
					autoPlay
					loop
					style={[styles.defaultStyle, style]} // Merge default and custom styles
				/>
			)}
		</AnimationContainer>
	);
};

// Default styling can be kept here if needed, or you can remove it
const styles = StyleSheet.create({
	defaultStyle: {
		width: 200,
		height: 200,
	},
});

export default LottieAnimation;
export { LottieAnimation };
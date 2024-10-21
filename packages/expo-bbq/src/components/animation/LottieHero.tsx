import React from 'react';
import { Platform } from 'react-native';
import { styled, YStack, Text } from 'tamagui';
import { LottieAnimation } from './LottieAnimation'; // Import your LottieAnimation component

// Hero container that fills the screen or desired space
const HeroContainer = styled(YStack, {
  width: '100%',
  height: 400, // Adjust height as needed for your hero
  justifyContent: 'center',
  alignItems: 'center',
  position: 'relative',
  overflow: 'hidden',
});

// Text overlay on top of the animation (optional)
const HeroText = styled(Text, {
  position: 'absolute',
  color: 'white',
  fontSize: 36,
  fontWeight: 'bold',
  zIndex: 1,
  textAlign: 'center',
});

type LottieHeroProps = {
  lottieJSON: any; // Local JSON file for the animation
  heroText?: string; // Optional text to overlay on the hero
  animationStyle?: object; // Style for the animation itself
};

export const LottieHero: React.FC<LottieHeroProps> = ({
  lottieJSON,
  heroText,
  animationStyle,
}) => {
  return (
    <HeroContainer>
      {/* Text content on top of the animation */}
      {heroText && <HeroText>{heroText}</HeroText>}

      {/* Lottie animation as the background */}
      <LottieAnimation
        lottieJSON={lottieJSON}
        style={[{ width: '100%', height: '100%' }, animationStyle]}
      />
    </HeroContainer>
  );
};

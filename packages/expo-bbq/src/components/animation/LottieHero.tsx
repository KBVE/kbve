import React from 'react';
import { styled, YStack, Text, View } from 'tamagui';
import { LottieAnimation } from './LottieAnimation';

const HeroContainer = styled(YStack, {
  width: '100%',
  height: 400,
  justifyContent: 'center',
  alignItems: 'center',
  position: 'relative',
  overflow: 'hidden',
});

const HeroText = styled(Text, {
  position: 'absolute',
  color: 'white',
  fontSize: 36,
  fontWeight: 'bold',
  zIndex: 1,
  textAlign: 'center',
  textShadowColor: 'black',
  textShadowOffset: { width: -1, height: -1 },
  textShadowRadius: 2,
  shadowOpacity: 1
});

type LottieHeroProps = {
  lottieJSON: any; // Local JSON file for the animation
  heroText?: string; // Optional text to overlay on the hero
  style?: object; // Style for the hero container
  opacity?: number; // Opacity for the container (passed through the View's opacity prop)
};

export const LottieHero: React.FC<LottieHeroProps> = ({
  lottieJSON,
  heroText = "", 
  style,
  opacity = 1.0,
}) => {
  return (
    <HeroContainer style={style}>
      {heroText ? <HeroText>{heroText}</HeroText> : null}
      <View style={{ width: '100%', height: '100%' }}  opacity={opacity}>
      <LottieAnimation
        lottieJSON={lottieJSON}
        style={{ width: '100%', height: '100%' }}
      />
      </View>
    </HeroContainer>
  );
};

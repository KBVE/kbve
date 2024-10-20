import React from 'react';
import { Platform, View } from 'react-native';
import LottieView from 'lottie-react-native';
import { styled } from 'tamagui';

const AnimationContainer = styled(View, {
  width: 300,
  height: 300,
  justifyContent: 'center',
  alignItems: 'center',
});

type LottieAnimationProps = {
  lottieJSON: any; // Local JSON file (static path via `require()`)
};

export const LottieAnimation: React.FC<LottieAnimationProps> = ({ lottieJSON }) => {
  let LottiePlayerWeb = null;

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
          style={{ width: '100%', height: '100%' }}
        />
      ) : (
        <LottieView
          source={lottieJSON} // Local file loaded via `require()`
          autoPlay
          loop
        />
      )}
    </AnimationContainer>
  );
};

import React from 'react';
import { Platform, View, StyleSheet, ImageSourcePropType, Text, ImageBackground } from 'react-native';
import MaskedViewNative from '@react-native-masked-view/masked-view';

type MaskedViewProps = {
  maskElement: React.ReactNode;  // Mask element for mobile and web (text in this case)
  children?: React.ReactNode;    // Optional background content (for mobile)
  style?: object;                // Custom style for MaskedView
  imageSource?: ImageSourcePropType | any; // Image to use for masking (e.g., background image)
};

export const MaskedView: React.FC<MaskedViewProps> = ({ maskElement, children, style, imageSource }) => {
  // Handle imageSource for web, convert to URL or fallback to an empty string
  const getImageUrl = () => {
    if (Platform.OS === 'web' && imageSource) {
      // For Web: If the imageSource is a require() call that returns an object, extract the URL
      if (typeof imageSource === 'object' && imageSource.src) {
        return imageSource.src;  // Webpack may return an object with 'src' key
      }
      // Check if it's a number, which happens when the image bundling isn't configured correctly
      if (typeof imageSource === 'number') {
        console.warn('Image source returned a number. Check Webpack or bundler configuration.');
        return '';  // Invalid image; handle fallback
      }
      return imageSource;
    }
    return imageSource || '';  // Fallback to empty string if no imageSource is provided
  };

  return Platform.OS === 'web' ? (
    <View style={StyleSheet.flatten([style, { position: 'relative', overflow: 'hidden' }])}>
      {/* Web-specific handling */}
      <div
        style={{
          backgroundImage: `url(${getImageUrl()})`, // Apply the image dynamically for web
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundClip: 'text',
          WebkitBackgroundClip: 'text',
          color: 'transparent',  // Transparent text to reveal background
          fontSize: 'inherit',  // Ensure font size matches maskElement
          width: '100%',
          height: '100%',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          WebkitTextStroke: '1px black',  // Add a black outline to the text
        }}
      >
        {maskElement}
      </div>
    </View>
  ) : (
    <MaskedViewNative style={style} maskElement={maskElement}>
      {/* Native platforms handling */}
      <ImageBackground source={imageSource} style={{ flex: 1 }}>
        {children}
      </ImageBackground>
    </MaskedViewNative>
  );
};

export default MaskedView;

import React from 'react';
import { Platform, View, StyleSheet } from 'react-native';
import MaskedViewNative from '@react-native-masked-view/masked-view';

type MaskedViewProps = {
  maskElement: React.ReactNode;  // Mask element for mobile and web
  children: React.ReactNode;     // Content to be masked
  style?: object;                // Custom style for MaskedView
};

export const MaskedView: React.FC<MaskedViewProps> = ({ maskElement, children, style }) => {
  // Web-specific logic: use `clip-path` for the masking effect
  const clipPathStyle = StyleSheet.flatten([
    style,  // Apply the custom styles passed in
    { position: 'relative' }  // Ensure relative positioning for the mask
  ]);

  const maskedContentStyle = {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    clipPath: 'circle(50% at 50% 50%)', // Example circular mask; modify as needed
  };

  // Ternary operation to handle web and native platforms
  return Platform.OS === 'web' ? (
    <View style={clipPathStyle}>
      {/* Mask element using clip-path */}
      <View style={maskedContentStyle}>
        {maskElement}
      </View>
      {/* Masked content */}
      {children}
    </View>
  ) : (
    <MaskedViewNative style={style} maskElement={maskElement}>
      {children}
    </MaskedViewNative>
  );
};

export default MaskedView;

import React from 'react';
import { Platform, View as RNView  } from 'react-native';
import { styled } from '@tamagui/core';
import WebView from 'react-native-webview'; // Import WebView from react-native-webview



interface IframeOrWebViewProps {
    src: string;
  }

export interface BBQEmbedProps extends IframeOrWebViewProps {
    title?: string; // Optional title
    width?: number | string;
    height?: number | string; // Height can be a number (for pixels) or a string (for percentages, em, etc.)
    padding?: number | string; // Same as height
    borderRadius?: number; // Assuming borderRadius is a number for simplicity
  }

// Create a styled view for the container
const StyledView = styled(RNView, {
    // Your styles here
    backgroundColor: 'transparent',
  });
  

// Conditional component based on the platform, now using the IframeOrWebViewProps interface
const IframeOrWebView: React.FC<IframeOrWebViewProps> = ({ src }) => {
    if (Platform.OS === 'web') {
      // Web platform: Use an iframe
      return (
        // eslint-disable-next-line jsx-a11y/iframe-has-title
        <iframe src={src} style={{ width: '100%', height: '100%', border: 'none' }} />
      );
    } else {
      // React Native: Use WebView
      return (
        <WebView source={{ uri: src }} style={{ flex: 1 }} />
      );
    }
  };
   
  // Wrap the conditional component in a Container for consistent styling
  const BBQEmbed: React.FC<BBQEmbedProps> = ({ src }) => {
    return (
      <StyledView>
        <IframeOrWebView src={src} />
      </StyledView>
    );
  };
  
  export default BBQEmbed;
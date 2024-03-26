import React from 'react';
import { Platform, View as RNView, ViewStyle } from 'react-native';
import { styled } from '@tamagui/core';
import WebView from 'react-native-webview';

interface IframeOrWebViewProps {
  src: string;
}

export interface BBQEmbedProps extends IframeOrWebViewProps {
  title?: string;
  width?: number | string;
  height?: number | string;
  padding?: number | string;
  borderRadius?: number;
}

const StyledView = styled(RNView, {
  backgroundColor: 'transparent',
});

const IframeOrWebView: React.FC<IframeOrWebViewProps> = ({ src }) => {
  if (Platform.OS === 'web') {
    // eslint-disable-next-line jsx-a11y/iframe-has-title
    return <iframe frameBorder="0" scrolling="no" src={src} style={{ width: '100%', height: '100%', border: 'none', overflow: 'hidden'}} />;
  } else {
    return <WebView source={{ uri: src }} style={{ flex: 1 }} />;
  }
};

// const isPercentageValue = (value: any): value is string => {
//   return typeof value === 'string' && value.endsWith('%');
// };

const BBQEmbedable: React.FC<BBQEmbedProps> = ({ src, width, height, padding, borderRadius }) => {
  const style: ViewStyle = {
    width: typeof width === 'number' ? width : '100%',
    height: typeof height === 'number' ? height : '100%',
    padding: typeof padding === 'number' ? padding : undefined,
    borderRadius,
  };

  return (
    <StyledView style={style}>
      <IframeOrWebView src={src} />
    </StyledView>
  );
};

export const BBQEmbed: React.FC<BBQEmbedProps> = (props) => {
  return <BBQEmbedable {...props} />;
};
// declarations.d.ts
declare module 'react-native-ios-modal' {
    import { ComponentType } from 'react';
    import { ViewProps } from 'react-native';
  
    interface ModalViewProps extends ViewProps {
      visible?: boolean;
      animated?: boolean;
      transparent?: boolean;
      animationType?: 'none' | 'slide' | 'fade';
      onRequestClose?: () => void;
    }
  
    export const ModalView: ComponentType<ModalViewProps>;
  }
  
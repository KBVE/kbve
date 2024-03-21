import React from 'react';
import * as Font from 'expo-font';
import { createIconSetFromIcoMoon } from '@expo/vector-icons';
import { Icon } from 'galio-framework';

import argonConfig from '../../../assets/config/argon.json';
import ArgonExtra from '../../../assets/font/argon.ttf';
const IconArgonExtra = createIconSetFromIcoMoon(argonConfig, 'ArgonExtra', ArgonExtra);

// Props interface
interface IconExtraProps {
  name?: string;
  family?: 'ArgonExtra' | 'Galio' | 'Entypo' | 'Ionicon' | any; // Adjust this type based on your available icon families
  size?: number;
  color?: string;
  [key: string]: any; // For any other props that might be passed to the icon component
}

// State interface
interface IconExtraState {
  fontLoaded: boolean;
}


class IconExtra extends React.Component<IconExtraProps, IconExtraState> {
  state: IconExtraState = {
    fontLoaded: false,
  };

  async componentDidMount() {
    try {
      await Font.loadAsync({ 'ArgonExtra': ArgonExtra });
      this.setState({ fontLoaded: true });
    } catch (error) {
      console.error("Error loading fonts", error);
    }
  }

  render() {
    const { name, family, ...rest } = this.props;
    
    if (!this.state.fontLoaded || !name) {
      return null; // Handle the case where name is undefined
    }

    if (name && family && this.state.fontLoaded) {
      if (family === 'ArgonExtra') {
        return <IconArgonExtra name={name} family={family} {...rest} />;
      }
      return <Icon name={name} family={family} {...rest} />;
    }

    return null;
  }
}

export default IconExtra;

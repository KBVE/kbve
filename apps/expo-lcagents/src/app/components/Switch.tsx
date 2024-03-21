import React from 'react';
import { Switch, Platform, SwitchProps } from 'react-native';

import argonTheme from '../constants/Theme';

interface MkSwitchProps extends SwitchProps {
  value: boolean; // Example of explicitly used prop
}


class MkSwitch extends React.Component<MkSwitchProps> {
  render() {
    const { value, ...props } = this.props;
    const thumbColor = Platform.OS === 'ios' ? undefined  :
      Platform.OS === 'android' && value ? argonTheme.COLORS.SWITCH_ON : argonTheme.COLORS.SWITCH_OFF;

    return (
      <Switch
        value={value}
        thumbColor={thumbColor}
        ios_backgroundColor={argonTheme.COLORS.SWITCH_OFF}
        trackColor={{ false: argonTheme.COLORS.SWITCH_ON, true: argonTheme.COLORS.SWITCH_ON }}
        {...props}
      />
    );
  }
}

export default MkSwitch;
import React from "react";
import { StyleSheet, StyleProp, ViewStyle } from "react-native";
import PropTypes from 'prop-types';

import { Input, InputProps  } from "galio-framework";

import Icon from './Icon';
import { argonTheme } from "../constants";


interface ArInputProps extends InputProps {
  shadowless?: boolean;
  success?: boolean;
  error?: boolean;
  style?: StyleProp<ViewStyle>;
}


class ArInput extends React.Component<ArInputProps> {

  static propTypes = {
    shadowless: PropTypes.bool,
    success: PropTypes.bool,
    error: PropTypes.bool,
    style: PropTypes.oneOfType([
      PropTypes.object,
      PropTypes.arrayOf(PropTypes.object),
      PropTypes.number, // StyleSheet.create() returns a number
    ]),
  };

  static defaultProps: Partial<ArInputProps> = {
    shadowless: false,
    success: false,
    error: false,
  };
  
  render() {
    const { shadowless, success, error, style, ...props } = this.props;

    const inputStyles = StyleSheet.flatten([
      styles.input,
      !shadowless && styles.shadow,
      success && styles.success,
      error && styles.error,
      style,
    ]);

    return (
      <Input
        placeholder="write something here"
        placeholderTextColor={argonTheme.COLORS.MUTED}
        style={inputStyles}
        color={argonTheme.COLORS.HEADER}
        iconContent={
          <Icon
            size={14}
            color={argonTheme.COLORS.ICON}
            name="link"
            family="ArgonExtra"
          />
        }
        {...props}
      />
    );
  }
}

const styles = StyleSheet.create({
  input: {
    borderRadius: 4,
    borderColor: argonTheme.COLORS.BORDER,
    height: 44,
    backgroundColor: '#FFFFFF'
  },
  success: {
    borderColor: argonTheme.COLORS.INPUT_SUCCESS,
  },
  error: {
    borderColor: argonTheme.COLORS.INPUT_ERROR,
  },
  shadow: {
    shadowColor: argonTheme.COLORS.BLACK,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 2,
    shadowOpacity: 0.05,
    elevation: 2,
  }
});

export default ArInput;

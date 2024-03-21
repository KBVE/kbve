import React from "react";
import { StyleSheet, ViewStyle, StyleProp, TextStyle } from "react-native";
import PropTypes from 'prop-types';
import { Button } from "galio-framework";
import { COLORS } from "../constants/Theme";

interface ArButtonProps {
  small?: boolean;
  shadowless?: boolean;
  color?: string;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
  fontWeight?: number;
  textStyle?: StyleProp<TextStyle>;
  center?: boolean;
}

function getColor(colorKey: string): string | undefined {
  const key = colorKey.toUpperCase() as keyof typeof COLORS;
  return COLORS[key];
}

class ArButton extends React.Component<ArButtonProps> {
  static propTypes = {
    small: PropTypes.bool,
    shadowless: PropTypes.bool,
    color: PropTypes.oneOfType([
      PropTypes.string,
      PropTypes.oneOf(['default', 'primary', 'secondary', 'info', 'error', 'success', 'warning']),
    ]),
    style: PropTypes.oneOfType([
      PropTypes.object,
      PropTypes.array,
      PropTypes.number,
    ]),
  };

  render() {
    const { small, shadowless, children, color, style, textStyle, center, ...props } = this.props;
    const colorStyle = color ? getColor(color) : undefined;

    // Explicitly include only those styles that are not undefined.
    const buttonStyles = StyleSheet.flatten([
      small ? styles.smallButton : undefined,
      color ? { backgroundColor: colorStyle } : undefined,
      !shadowless ? styles.shadow : undefined,
      center ? styles.centerButton : undefined, // Apply center style if center prop is true

      style
    ]);

    // Might have to make adjustments to the center of the text!

    const _textStyle = textStyle || { fontSize: 12, fontWeight: '700' }

    return (
      <Button
        style={buttonStyles}
        shadowless={typeof shadowless === 'boolean' ? shadowless : true}
        textStyle={_textStyle}
        {...props}
      >
        {children}
      </Button>
    );
  }
}

const styles = StyleSheet.create({
  smallButton: {
    width: 75,
    height: 28
  },
  shadow: {
    shadowColor: 'black',
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 4,
    shadowOpacity: 0.1,
    elevation: 2,
  },
  centerButton: {
    justifyContent: 'center', // Center the button content
  },
});

export default ArButton;

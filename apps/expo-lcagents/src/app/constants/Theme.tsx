export const COLORS = {
  DEFAULT: '#172B4D',
  PRIMARY: '#5E72E4',
  SECONDARY: '#F7FAFC',
  LABEL: '#FE2472',
  INFO: '#11CDEF',
  ERROR: '#F5365C',
  TEXT: '#11CDEF',
  SUCCESS: '#2DCE89',
  WARNING: '#FB6340',
  MUTED: '#ADB5BD',
  INPUT: '#DCDCDC',
  INPUT_SUCCESS: '#7BDEB2',
  INPUT_ERROR: '#FCB3A4',
  ACTIVE: '#5E72E4',
  BUTTON_COLOR: '#9C26B0',
  PLACEHOLDER: '#9FA5AA',
  SWITCH_ON: '#5E72E4',
  SWITCH_OFF: '#D4D9DD',
  GRADIENT_START: '#6B24AA',
  GRADIENT_END: '#AC2688',
  PRICE_COLOR: '#EAD5FB',
  BORDER_COLOR: '#E7E7E7',
  BLOCK: '#E7E7E7',
  ICON: '#172B4D',
  HEADER: '#525F7F',
  BORDER: '#CAD1D7',
  WHITE: '#FFFFFF',
  BLACK: '#000000',
  TRANSPARENT: 'transparent',
  // TODO Colors
  TWITTER: '#333333',
  FACEBOOK: '#333333',
  DRIBBBLE: '#333333',
};

export const SIZES = {
  BASE: 10,
  // other size values...
};

export type ColorKeys = keyof typeof COLORS;

export type SizeKeys = keyof typeof SIZES;


export default {
  COLORS,
  SIZES,
};
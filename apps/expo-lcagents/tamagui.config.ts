import { config } from '@tamagui/config/v3' // Import config as in the example

import { createTamagui } from 'tamagui'
import { createInterFont } from '@tamagui/font-inter'
import { shorthands } from '@tamagui/shorthands'
import { tokens, themes } from '@tamagui/themes'
import { createMedia } from '@tamagui/react-native-media-driver'

// Define your fonts
const headingFont = createInterFont({
  size: {
    6: 15,
  },
  transform: {
    6: 'uppercase',
    7: 'none',
  },
  weight: {
    6: '400',
    7: '700',
  },
  color: {
    6: '$colorFocus',
    7: '$color',
  },
  letterSpacing: {
    5: 2,
    6: 1,
    7: 0,
    8: -1,
    9: -2,
    10: -3,
    12: -4,
    14: -5,
    15: -6,
  },
  face: {
    700: { normal: 'InterBold' },
  },
})

const bodyFont = createInterFont(
  {
    face: {
      700: { normal: 'InterBold' },
    },
  },
  {
    sizeSize: (size: number) => Math.round(size * 1.1),
    sizeLineHeight: (size: number) => Math.round(size * 1.1 + (size > 20 ? 10 : 10)),
  }
)

// Define animations
const animations = {
  fast: {
    damping: 20,
    mass: 1.2,
    stiffness: 250,
  },
  medium: {
    damping: 10,
    mass: 0.9,
    stiffness: 100,
  },
  slow: {
    damping: 20,
    stiffness: 60,
  },
}

// Combine imported config with your custom configuration
const tamaguiConfig = createTamagui({
  ...config, // Spread the imported config to include it

  // Add your custom configurations
  //animations,
  defaultFont: 'body',
  shouldAddPrefersColorThemes: true,
  themeClassNameOnRoot: true,
  onlyAllowShorthands: false, // optional, allows shorthand styles like 'p' for padding
  shorthands,
  fonts: {
    body: bodyFont,
    heading: headingFont,
  },
  settings: {
    allowedStyleValues: 'somewhat-strict',
  },
  themes,
  tokens,
  media: createMedia({
    xs: { maxWidth: 660 },
    sm: { maxWidth: 800 },
    md: { maxWidth: 1020 },
    lg: { maxWidth: 1280 },
    xl: { maxWidth: 1420 },
    xxl: { maxWidth: 1600 },
    gtXs: { minWidth: 660 + 1 },
    gtSm: { minWidth: 800 + 1 },
    gtMd: { minWidth: 1020 + 1 },
    gtLg: { minWidth: 1280 + 1 },
    short: { maxHeight: 820 },
    tall: { minHeight: 820 },
    hoverNone: { hover: 'none' },
    pointerCoarse: { pointer: 'coarse' },
  }),
})

// TypeScript type inference for the Tamagui config
type Conf = typeof tamaguiConfig

// Extend Tamagui's global config type with your custom config
declare module 'tamagui' {
  interface TamaguiCustomConfig extends Conf {}
}

// Export the combined config
export default tamaguiConfig

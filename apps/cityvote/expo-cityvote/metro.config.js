// Documentation: https://kbve.com/application/javascript/#rn

const { withNxMetro } = require('@nx/expo');
const { getDefaultConfig } = require('@expo/metro-config');
const { mergeConfig } = require('metro-config');
const { withTamagui } = require('@tamagui/metro-plugin');

// Constants for repeated values
const TAMAGUI_CONFIG_PATH = './tamagui.config.ts';
const TAMAGUI_OUTPUT_CSS_PATH = './tamagui-web.css';

function getCustomResolverConfig(defaultConfig) {
  const { assetExts, sourceExts } = defaultConfig.resolver;
  return {
    resolver: {
      assetExts: assetExts.filter((ext) => ext !== 'svg'),
      sourceExts: [...sourceExts, 'cjs', 'mjs', 'svg'],
    },
  };
}

function getCustomTransformerConfig() {
  return {
    transformer: {
      babelTransformerPath: require.resolve('react-native-svg-transformer'),
    },
  };
}

function getTamaguiConfig() {
  return getDefaultConfig(__dirname, {
    isCSSEnabled: true,
  });
}

const defaultConfig = getDefaultConfig(__dirname);
let mergedConfig = mergeConfig(defaultConfig, getCustomResolverConfig(defaultConfig));
mergedConfig = mergeConfig(mergedConfig, getCustomTransformerConfig());
mergedConfig = mergeConfig(mergedConfig, getTamaguiConfig());

module.exports = withNxMetro(
  withTamagui(mergedConfig, {
    components: ['tamagui'],
    config: TAMAGUI_CONFIG_PATH,
    outputCSS: TAMAGUI_OUTPUT_CSS_PATH,
  }),
  {
    debug: false,
    extensions: [],
    watchFolders: [],
  }
);

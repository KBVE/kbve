const { withNxMetro } = require('@nx/expo');
const { getDefaultConfig } = require('@expo/metro-config');
const { mergeConfig } = require('metro-config');
const { withTamagui } = require('@tamagui/metro-plugin');
const {
  wrapWithReanimatedMetroConfig,
} = require('react-native-reanimated/metro-config');

// Get the default config from Expo
const defaultConfig = getDefaultConfig(__dirname);

// Extract relevant properties for easier manipulation
const { assetExts, sourceExts } = defaultConfig.resolver;

// Custom configuration for handling SVGs and adding new file extensions
const svgAndExtensionConfig = {
  transformer: {
    babelTransformerPath: require.resolve('react-native-svg-transformer'),
  },
  resolver: {
    assetExts: [
      ...assetExts.filter((ext) => ext !== 'svg'),
      'json',
      'png',
    ],
    sourceExts: [...sourceExts, 'cjs', 'mjs', 'svg', 'jsx', 'js', 'ts', 'tsx'],
  },
};

// Merge the SVG and extension customization into the default config
let mergedConfig = mergeConfig(defaultConfig, svgAndExtensionConfig);

// Enable CSS support and configure for Tamagui (only if needed for web)
const tamaguiBaseConfig = getDefaultConfig(__dirname, {
  isCSSEnabled: true, // Enable CSS only for web
});
mergedConfig = mergeConfig(mergedConfig, tamaguiBaseConfig);

// Apply Tamagui plugin with native-aware settings
const tamaguiConfig = withTamagui(mergedConfig, {
  components: ['tamagui'],
  config: './tamagui.config.ts',
  outputCSS: './tamagui-web.css',
});

// Export with Reanimated wrapper
module.exports = withNxMetro(wrapWithReanimatedMetroConfig(tamaguiConfig), {
  debug: true, // Change this to true to see debugging info.
  extensions: [], // All the file extensions used for imports other than 'ts', 'tsx', 'js', 'jsx', 'json'
  watchFolders: [], // Specify folders to watch, in addition to Nx defaults (workspace libraries and node_modules)
});
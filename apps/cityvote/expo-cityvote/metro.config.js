const { withNxMetro } = require('@nx/expo');
const { getDefaultConfig } = require('@expo/metro-config');
const { mergeConfig } = require('metro-config');
const { withTamagui } = require('@tamagui/metro-plugin');
const {
  wrapWithReanimatedMetroConfig,
} = require('react-native-reanimated/metro-config');

// Get Expo's default Metro config
const defaultConfig = getDefaultConfig(__dirname);

// Extract properties for modification
const { assetExts, sourceExts, resolveRequest } = defaultConfig.resolver;

// 🔹 Step 1: Customize SVG and File Extensions
const fileConfig = {
  transformer: {
    babelTransformerPath: require.resolve('react-native-svg-transformer'),
  },
  resolver: {
    assetExts: [...assetExts.filter((ext) => ext !== 'svg'), 'json', 'png'],
    sourceExts: [...sourceExts, 'cjs', 'mjs', 'svg', 'jsx', 'js', 'ts', 'tsx'],
    resolveRequest: resolveRequest ?? require('metro-resolver').resolve, // Preserve Metro's resolver
  },
};

// 🔹 Step 2: Merge File Config with Default Metro Config
let mergedConfig = mergeConfig(defaultConfig, fileConfig);

// 🔹 Step 3: Apply Tamagui Plugin (Now Includes `isCSSEnabled`)
mergedConfig = withTamagui(mergedConfig, {
  components: ['tamagui'],
  config: './tamagui.config.ts',
  outputCSS: './tamagui-web.css',
  isCSSEnabled: true, // Enable CSS support directly inside Tamagui
});

// 🔹 Step 4: Apply Nx & Reanimated Enhancements
const finalConfig = withNxMetro(
  wrapWithReanimatedMetroConfig(mergedConfig),
  {
    debug: false, // Change to true for more logging
    extensions: [],
    watchFolders: [], // Keep empty unless additional folders are needed
  }
);

module.exports = finalConfig;

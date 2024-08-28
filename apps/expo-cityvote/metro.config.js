const { withNxMetro } = require('@nx/expo');
const { getDefaultConfig } = require('@expo/metro-config');
const { mergeConfig } = require('metro-config');
const { withTamagui } = require('@tamagui/metro-plugin');


// Get the default config from Expo
const defaultConfig = getDefaultConfig(__dirname);

// Extract relevant properties for easier manipulation
const { assetExts, sourceExts } = defaultConfig.resolver;

/**
 * Metro configuration
 * https://facebook.github.io/metro/docs/configuration
 *
 * @type {import('metro-config').MetroConfig}
 */
const customConfig = {
  transformer: {
    babelTransformerPath: require.resolve('react-native-svg-transformer'),
  },
  resolver: {
    assetExts: assetExts.filter((ext) => ext !== 'svg'),
    sourceExts: [...sourceExts, 'cjs', 'mjs', 'svg'],
  },
};

let mergedConfig = mergeConfig(defaultConfig, customConfig);


// Enable CSS support and configure for Tamagui
const tamaguiConfig = getDefaultConfig(__dirname, {
  isCSSEnabled: false, // [Web-only]: Enables CSS support in Metro.
});


mergedConfig = mergeConfig(mergedConfig, tamaguiConfig);



module.exports = withNxMetro(withTamagui(mergedConfig, {
  components: ['tamagui'],
  config: './tamagui.config.ts',
  outputCSS: './tamagui-web.css',
}), {
  debug: false, // Change this to true to see debugging info.
  extensions: [], // All the file extensions used for imports other than 'ts', 'tsx', 'js', 'jsx', 'json'
  watchFolders: [], // Specify folders to watch, in addition to Nx defaults (workspace libraries and node_modules)
});
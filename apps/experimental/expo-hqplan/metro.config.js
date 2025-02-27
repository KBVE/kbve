const { withNxMetro } = require('@nx/expo');
const { getDefaultConfig } = require('@expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

<<<<<<< Updated upstream
const defaultConfig = getDefaultConfig(__dirname);
const { assetExts, sourceExts, resolveRequest } = defaultConfig.resolver;

/**
 * Metro configuration
 * https://facebook.github.io/metro/docs/configuration
 *
 * @type {import('metro-config').MetroConfig}
 */
const customConfig = withNativeWind({
  transformer: {
    babelTransformerPath: require.resolve('react-native-svg-transformer'),
  },
  resolver: {
    assetExts: assetExts.filter((ext) => ext !== 'svg'),
    sourceExts: [...sourceExts, 'cjs', 'mjs', 'svg'],
    resolveRequest: resolveRequest ?? require('metro-resolver').resolve, // Preserve Metro's resolver if it exists
  },
});
=======
// Default Metro configuration
const defaultConfig = getDefaultConfig(__dirname);

// Apply Nx modifications first
// const nxConfig = withNxMetro(defaultConfig, {
//   debug: false,
//   extensions: [],
//   watchFolders: ['./src'],
//   maxWorkers: 2,
// });
>>>>>>> Stashed changes

// Apply NativeWind Plugin last
module.exports = withNativeWind(defaultConfig, {
  input: './src/global.css',
  configPath: './tailwind.config.js',
});

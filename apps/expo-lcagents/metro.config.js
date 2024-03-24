const { withNxMetro } = require('@nx/expo');
const { getDefaultConfig } = require('@expo/metro-config');
const { mergeConfig } = require('metro-config');
const { withTamagui } = require('@tamagui/metro-plugin');

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
		assetExts: assetExts.filter((ext) => ext !== 'svg'), // Exclude 'svg' from asset extensions
		sourceExts: [...sourceExts, 'cjs', 'mjs', 'svg'], // Add 'cjs', 'mjs', and re-add 'svg' as a source extension
	},
};

// Merge the SVG and extension customization into the default config
let mergedConfig = mergeConfig(defaultConfig, svgAndExtensionConfig);

// Enable CSS support and configure for Tamagui
const tamaguiConfig = getDefaultConfig(__dirname, {
  isCSSEnabled: true, // [Web-only]: Enables CSS support in Metro.
});

// Merge the Tamagui configuration into the previously merged configuration
mergedConfig = mergeConfig(mergedConfig, tamaguiConfig);

// Apply the Tamagui plugin, along with its specific configurations
module.exports = withNxMetro(withTamagui(mergedConfig, {
  components: ['tamagui'],
  config: './tamagui.config.ts',
  outputCSS: './tamagui-web.css',
}), {
  debug: false, // Change this to true to see debugging info.
  extensions: [], // All the file extensions used for imports other than 'ts', 'tsx', 'js', 'jsx', 'json'
  watchFolders: [], // Specify folders to watch, in addition to Nx defaults (workspace libraries and node_modules)
});
module.exports = function (api) {
  api.cache(true);

  return {
    presets: [
      [
        '@nx/react/babel',
        {
          runtime: 'automatic',
          useBuiltIns: 'usage',
        },
      ],
    ],
    plugins: [
      'nativewind/babel',
      'react-native-reanimated/plugin',
    ],
    env: {
      test: {
        presets: ['babel-preset-expo'],
      },
    },
  };
};

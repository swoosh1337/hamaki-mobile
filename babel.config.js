module.exports = function(api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      // expo-router/babel is now included in babel-preset-expo for SDK 50+
      // Reanimated plugin (if you're using reanimated)
      'react-native-reanimated/plugin',
      // Allow importing from @/
      [
        'module-resolver',
        {
          root: ['.'],
          alias: {
            '@': './',
          },
        },
      ],
    ],
  };
};

const { withAppBuildGradle } = require('expo/config-plugins');

/**
 * Remove unsupported enableBundleCompression from react block
 * This is needed for React Native 0.77.x which doesn't support this property
 */
module.exports = function withFixReactGradle(config) {
  return withAppBuildGradle(config, (config) => {
    // Remove enableBundleCompression line regardless of language
    config.modResults.contents = config.modResults.contents.replace(
      /^\s*enableBundleCompression\s*=.*$/gm,
      '    // enableBundleCompression removed - not supported in RN 0.77.x'
    );
    return config;
  });
};

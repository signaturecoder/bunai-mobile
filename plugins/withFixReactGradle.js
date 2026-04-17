const { withAppBuildGradle } = require('expo/config-plugins');

/**
 * Remove unsupported enableBundleCompression from react block
 */
module.exports = function withFixReactGradle(config) {
  return withAppBuildGradle(config, (config) => {
    if (config.modResults.language === 'groovy') {
      // Remove enableBundleCompression line if it exists
      config.modResults.contents = config.modResults.contents.replace(
        /\s*enableBundleCompression\s*=\s*(true|false)\s*\n?/g,
        '\n'
      );
    }
    return config;
  });
};

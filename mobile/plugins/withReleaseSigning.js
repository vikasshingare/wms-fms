const { withAppBuildGradle } = require('expo/config-plugins');

module.exports = function withReleaseSigning(config) {
  if (process.env.SERVICE360_RELEASE_BUILD !== 'true') return config;
  return withAppBuildGradle(config, result => {
    let source = result.modResults.contents;
    const marker = 'signingConfigs {';
    if (!source.includes('SERVICE360_KEYSTORE')) {
      if (!source.includes(marker)) throw new Error('Android signing configuration not found');
      // Change only release signing; retain the generated debug signing config.
      source = source.replace(/(release\s*\{[\s\S]*?signingConfig )signingConfigs\.debug/, '$1signingConfigs.service360');
      source = source.replace(marker, `${marker}
        service360 {
            storeFile file(System.getenv('SERVICE360_KEYSTORE'))
            storePassword System.getenv('SERVICE360_STORE_PASSWORD')
            keyAlias 'service360'
            keyPassword System.getenv('SERVICE360_KEY_PASSWORD')
        }`);
    }
    result.modResults.contents = source;
    return result;
  });
};

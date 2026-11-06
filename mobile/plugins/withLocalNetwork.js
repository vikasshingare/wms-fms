// The local development API uses HTTP on the user's LAN.
// Remove this plugin and require HTTPS for a production deployment.
const { withAndroidManifest } = require('expo/config-plugins');

module.exports = function withLocalNetwork(config) {
  return withAndroidManifest(config, (result) => {
    const application = result.modResults.manifest.application?.[0];
    if (application) {
      application.$ = application.$ || {};
      application.$['android:usesCleartextTraffic'] = process.env.SERVICE360_RELEASE_BUILD === 'true' ? 'false' : 'true';
    }
    return result;
  });
};

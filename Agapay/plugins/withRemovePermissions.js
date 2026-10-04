const { withAndroidManifest } = require('@expo/config-plugins');

module.exports = function withRemovePermissions(config, permissionsToRemove) {
  return withAndroidManifest(config, async (config) => {
    const androidManifest = config.modResults;
    const manifest = androidManifest.manifest;

    // Ensure the tools namespace is added to the manifest root tag
    if (!manifest.$['xmlns:tools']) {
      manifest.$['xmlns:tools'] = 'http://schemas.android.com/tools';
    }

    // Initialize the uses-permission array if not already present
    manifest['uses-permission'] = manifest['uses-permission'] || [];

    permissionsToRemove.forEach((permission) => {
      // Find if this permission is already defined in the manifest
      const existingPermIndex = manifest['uses-permission'].findIndex(
        (p) => p.$['android:name'] === permission
      );

      if (existingPermIndex > -1) {
        // Add tools:node="remove" to prevent manifest merger from including it
        manifest['uses-permission'][existingPermIndex].$['tools:node'] = 'remove';
      } else {
        // If not present, append a new tag with tools:node="remove"
        manifest['uses-permission'].push({
          $: {
            'android:name': permission,
            'tools:node': 'remove',
          },
        });
      }
    });

    return config;
  });
};

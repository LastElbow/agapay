const fs = require('fs');
const path = require('path');

module.exports = ({ config }) => {
  // Prefer the gitignored local overlay (real Mapbox download token etc.);
  // fall back to the tracked, placeholder version for plug-and-play evaluation.
  const localConfigPath = path.resolve(__dirname, 'app.development.local.json');
  const devConfigPath = fs.existsSync(localConfigPath)
    ? localConfigPath
    : path.resolve(__dirname, 'app.development.json');

  if (fs.existsSync(devConfigPath)) {
    try {
      const devConfig = JSON.parse(fs.readFileSync(devConfigPath, 'utf8'));
      const devExpo = devConfig.expo || devConfig;

      return {
        ...config,
        ...devExpo,
        extra: {
          ...(config.extra || {}),
          ...(devExpo.extra || {}),
        },
        plugins: devExpo.plugins || config.plugins,
      };
    } catch (error) {
      console.warn('Warning: Could not parse app.development.json:', error.message);
    }
  }

  return config;
};

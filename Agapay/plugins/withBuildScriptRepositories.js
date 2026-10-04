/* eslint-disable @typescript-eslint/no-var-requires */
const { withProjectBuildGradle } = require('@expo/config-plugins');

module.exports = function withBuildScriptRepositories(config) {
  return withProjectBuildGradle(config, (config) => {
    if (config.modResults.language === 'groovy') {
      config.modResults.contents = addRepositories(config.modResults.contents);
    }
    return config;
  });
};

function addRepositories(buildGradle) {
  // Matches "buildscript { ... repositories {"
  const pattern = /buildscript\s*\{[\s\S]*?repositories\s*\{/;
  
  if (buildGradle.match(pattern)) {
    // Inject google() and mavenCentral() at the start of the repositories block
    return buildGradle.replace(
      pattern,
      (match) => `${match}\n        google()\n        mavenCentral()`
    );
  }
  
  return buildGradle;
}

// Custom Metro config to stub out CSS imports from rnmapbox on web.
// Metro doesn't handle CSS files; we redirect the specific CSS import
// to a no-op JS module and inject the real stylesheet via <Head> in app/_layout.tsx.
const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");
const { resolve } = require("metro-resolver");
const { withNativeWind } = require("nativewind/metro");

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

config.resolver = config.resolver || {};

const originalResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === "mapbox-gl/dist/mapbox-gl.css") {
    return {
      type: "sourceFile",
      filePath: path.resolve(__dirname, "shims", "emptyCss.js"),
    };
  }
  if (originalResolveRequest) {
    return originalResolveRequest(context, moduleName, platform);
  }
  // Fallback to Metro's default resolver for all other modules
  return resolve(context, moduleName, platform);
};
module.exports = config;
module.exports = withNativeWind(config, { input: "./app/global.css" });

module.exports = function (api) {
  api.cache(true);
  return {
    // Using nativewind as a preset here to avoid the plugin shape error encountered.
    presets: [
      ["babel-preset-expo", { jsxImportSource: "nativewind" }],
      "nativewind/babel",
    ],
    plugins: [
      ["module-resolver", {
        "root": ["./"],
        "alias": {
          "@": "./"
        }
      }],
      // Required for react-native-reanimated (must be the last plugin)
      "react-native-reanimated/plugin",
    ],
  };
};

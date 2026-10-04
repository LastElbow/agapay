// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*"],
    settings: {
      "import/resolver": {
        typescript: {
          project: "./tsconfig.json",
          alwaysTryTypes: true,
        },
        node: {
          extensions: [
            ".js",
            ".jsx",
            ".ts",
            ".tsx",
            ".d.ts",
            ".native.js",
            ".native.jsx",
            ".native.ts",
            ".native.tsx",
            ".ios.js",
            ".ios.jsx",
            ".ios.ts",
            ".ios.tsx",
            ".android.js",
            ".android.jsx",
            ".android.ts",
            ".android.tsx",
          ],
        },
      },
    },
  },
]);

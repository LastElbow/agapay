// Jest global setup for CLI-friendly unit tests (Node environment).

const { Buffer } = require("buffer");

// Base64 helpers used by JWT decoding.
if (typeof global.atob === "undefined") {
  global.atob = (b64) => Buffer.from(b64, "base64").toString("binary");
}

if (typeof global.btoa === "undefined") {
  global.btoa = (bin) => Buffer.from(bin, "binary").toString("base64");
}

// TextEncoder/TextDecoder are sometimes missing depending on the Jest environment.
try {
  const util = require("util");
  if (typeof global.TextEncoder === "undefined")
    global.TextEncoder = util.TextEncoder;
  if (typeof global.TextDecoder === "undefined")
    global.TextDecoder = util.TextDecoder;
} catch {
  // ignore
}

// Optional: extend expect for React Native tests (harmless for pure unit tests).
try {
  require("@testing-library/jest-native/extend-expect");
} catch {
  // ignore
}

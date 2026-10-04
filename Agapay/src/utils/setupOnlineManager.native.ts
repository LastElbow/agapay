import { onlineManager } from "@tanstack/react-query";

export function setupOnlineManager() {
    // Use require() inside the function body instead of a top-level import.
    // A top-level import of @react-native-community/netinfo gets pulled into
    // the module graph during bundling and causes a "Maximum call stack size
    // exceeded" error because of a circular reference introduced in
    // netinfo v11 + Expo SDK 54 / React Native 0.81.
    // Deferring to require() here means the module is only resolved when
    // setupOnlineManager() is actually called (after the bundle has fully
    // initialised), breaking the cycle.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const NetInfo = require("@react-native-community/netinfo").default;

    onlineManager.setEventListener((setOnline) => {
        return NetInfo.addEventListener((state: any) => {
            setOnline(!!state.isConnected);
        });
    });
}

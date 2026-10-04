import { onlineManager } from "@tanstack/react-query";
import { Platform } from "react-native";

export function setupOnlineManager() {
    if (Platform.OS === "web" && typeof window !== "undefined") {
        onlineManager.setEventListener((setOnline) => {
            const handleOnline = () => setOnline(true);
            const handleOffline = () => setOnline(false);

            // Set initial state from navigator
            setOnline(navigator.onLine);

            window.addEventListener("online", handleOnline);
            window.addEventListener("offline", handleOffline);

            return () => {
                window.removeEventListener("online", handleOnline);
                window.removeEventListener("offline", handleOffline);
            };
        });
    }
}

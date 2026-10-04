import * as Location from "expo-location";
import { Alert, Platform } from "react-native";

/**
 * Requests foreground location permissions with a prominent in-app disclosure.
 * Under Google Play Store policies, apps collecting location data must present 
 * an in-app warning explaining why location is required BEFORE showing the native prompt.
 * 
 * @returns A promise resolving to the standard Expo Location.PermissionResponse
 */
export async function requestLocationPermissionWithDisclosure(): Promise<Location.PermissionResponse> {
  try {
    // 1. Check current permissions first
    const current = await Location.getForegroundPermissionsAsync();
    if (current.granted) {
      return current;
    }

    // 2. Browser geolocation on Web is self-contained and handles permission prompts natively.
    // Bypassing Alert.alert on Web prevents rendering incompatibilities.
    if (Platform.OS === "web") {
      return await Location.requestForegroundPermissionsAsync();
    }

    // 3. Show prominent disclosure on Android & iOS
    return new Promise((resolve) => {
      Alert.alert(
        "Location Access Required",
        "Agapay requests access to your device location to display the real-time distance, route, and estimated arrival times between therapists and patients on the map during active sessions. This coordinate tracking is only active during active sessions while using the application.",
        [
          {
            text: "Cancel",
            style: "cancel",
            onPress: () => resolve(current), // Resolve with ungranted status
          },
          {
            text: "Agree & Continue",
            onPress: async () => {
              try {
                const result = await Location.requestForegroundPermissionsAsync();
                resolve(result);
              } catch (err) {
                console.error("[locationPermission] Failed to request permission:", err);
                resolve(current);
              }
            },
          },
        ],
        { cancelable: false }
      );
    });
  } catch (err) {
    console.error("[locationPermission] Error checking location permissions:", err);
    // Return a default rejected status object if checking permissions throws
    return {
      status: Location.PermissionStatus.UNDETERMINED,
      granted: false,
      canAskAgain: true,
      expires: "never",
    };
  }
}

import { useEffect, useRef, useState, useCallback } from "react";
import { Platform } from "react-native";
import * as Location from "expo-location";
import { getTokens } from "@/src/auth/session";
import { requestLocationPermissionWithDisclosure } from "@/src/utils/locationPermission";
import signalrManager from "@/src/services/signalrManager";
import { HubConnection } from "@microsoft/signalr";

type LocationCoords = {
  latitude: number;
  longitude: number;
};

type LocationTrackingOptions = {
  sessionId: number;
  role: "therapist" | "patient";
  onTherapistLocationUpdate?: (coords: LocationCoords) => void;
  onOwnLocationUpdate?: (coords: LocationCoords) => void;
  onTrackingStarted?: () => void;
  onTrackingStopped?: () => void;
  onError?: (error: string) => void;
};

/**
 * Hook for real-time location tracking between therapist and patient.
 * - Therapist: Shares their GPS location via SignalR
 * - Patient: Receives therapist's location updates via SignalR
 */
export function useLocationTracking({
  sessionId,
  role,
  onTherapistLocationUpdate,
  onOwnLocationUpdate,
  onTrackingStarted,
  onTrackingStopped,
  onError,
}: LocationTrackingOptions) {
  const [isSharing, setIsSharing] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [therapistLocation, setTherapistLocation] = useState<LocationCoords | null>(null);
  const connectionRef = useRef<HubConnection | null>(null);
  const locationSubscriptionRef = useRef<Location.LocationSubscription | null>(null);
  const updateIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const currentLocationRef = useRef<LocationCoords | null>(null);
  const lastSentLocationRef = useRef<LocationCoords | null>(null); // Track last sent to avoid redundant updates
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const isSharingRef = useRef(false);

  // Keep refs of callback props to prevent infinite reconnection loop when parent renders inline functions
  const onTherapistLocationUpdateRef = useRef(onTherapistLocationUpdate);
  const onOwnLocationUpdateRef = useRef(onOwnLocationUpdate);
  const onTrackingStartedRef = useRef(onTrackingStarted);
  const onTrackingStoppedRef = useRef(onTrackingStopped);
  const onErrorRef = useRef(onError);

  // Keep refs in sync with incoming props
  useEffect(() => {
    onTherapistLocationUpdateRef.current = onTherapistLocationUpdate;
    onOwnLocationUpdateRef.current = onOwnLocationUpdate;
    onTrackingStartedRef.current = onTrackingStarted;
    onTrackingStoppedRef.current = onTrackingStopped;
    onErrorRef.current = onError;
  });

  // Sync ref with state for event listeners
  useEffect(() => {
    isSharingRef.current = isSharing;
  }, [isSharing]);

  // Connect to SignalR hub
  const connect = useCallback(async () => {
    if (connectionRef.current) return;

    try {
      const accessToken = getTokens().accessToken;

      if (!accessToken) {
        onErrorRef.current?.("No access token available");
        return;
      }

      console.log("[LocationTracking] Connecting to location hub via Manager");

      // Use the shared connection manager
      const connection = await signalrManager.getSharedConnection('location', accessToken);
      connectionRef.current = connection;
      setIsConnected(true);

      // Handle automatic reconnection: Restore session state
      connection.onreconnected(async (connectionId) => {
        console.log(`♻️ [LocationTracking] SignalR reconnected with ID: ${connectionId}`);
        try {
          if (role === 'patient') {
            await connection.invoke("SubscribeToLocation", sessionId);
            console.log(`✅ [LocationTracking] Patient re-subscribed to session ${sessionId}`);
          } else if (role === 'therapist' && isSharingRef.current) {
            await connection.invoke("StartTracking", sessionId);
            console.log(`✅ [LocationTracking] Therapist re-joined tracking group for session ${sessionId}`);
          }
        } catch (err) {
          console.error("❌ [LocationTracking] Failed to restore session state after reconnect:", err);
        }
      });

      connection.onclose((error) => {
        console.log("❌ [LocationTracking] Connection closed:", error);
        setIsConnected(false);
      });

      // Listen for location updates
      // Patients: receive therapist location
      // Therapists (in map view): receive their own broadcasted location
      // Ensure we unsubscribe previous listener if exists
      if (unsubscribeRef.current) unsubscribeRef.current();

      unsubscribeRef.current = signalrManager.subscribeToEvent('location', "ReceiveLocationUpdate", (payload: { latitude: number; longitude: number }) => {
        console.log("🔔🔔🔔 [LocationTracking] ReceiveLocationUpdate event fired!");
        console.log("  - Payload:", payload);
        console.log("  - Role:", role);
        const coords = { latitude: payload.latitude, longitude: payload.longitude };
        setTherapistLocation(coords);
        onTherapistLocationUpdateRef.current?.(coords);

        // For therapists: also call onOwnLocationUpdate since this is their own location being broadcast
        if (role === "therapist") {
          onOwnLocationUpdateRef.current?.(coords);
        }
      });

      // Listen for tracking stopped event to clear location on patient side
      const unsubscribeStop = signalrManager.subscribeToEvent('location', "TrackingStopped", () => {
        console.log("🛑🛑🛑 [LocationTracking] TrackingStopped event received - clearing therapist location");
        setTherapistLocation(null);
        if (role === "patient") {
          onTrackingStoppedRef.current?.();
        }
      });

      // Listen for RequestLocation event to send location immediately
      const unsubscribeRequest = signalrManager.subscribeToEvent('location', "RequestLocation", async () => {
        console.log("❓ [LocationTracking] RequestLocation received from patient");
        if (role === "therapist" && isSharingRef.current && currentLocationRef.current) {
          try {
            if (connectionRef.current) {
              await connectionRef.current.invoke(
                "UpdateLocation",
                sessionId,
                currentLocationRef.current.latitude,
                currentLocationRef.current.longitude
              );
              lastSentLocationRef.current = currentLocationRef.current;
              console.log("[LocationTracking] Sent location update in response to request:", currentLocationRef.current);
            }
          } catch (err) {
            console.error("[LocationTracking] Failed to respond to RequestLocation:", err);
          }
        }
      });

      // Combine unsubscribe functions
      const previousUnsubscribe = unsubscribeRef.current;
      unsubscribeRef.current = () => {
        previousUnsubscribe?.();
        unsubscribeStop();
        unsubscribeRequest();
      };

      // Subscribe to specific session's location updates
      // Only patients need to subscribe to receive therapist updates
      // Therapists join the group when they call StartTracking
      if (role === "patient") {
        await connection.invoke("SubscribeToLocation", sessionId);
        console.log(`✅✅✅ [LocationTracking] Patient subscribed to session ${sessionId} location updates`);
      } else {
        console.log(`[LocationTracking] Therapist connected, will join group when StartTracking is called`);
      }

      console.log("[LocationTracking] Connected successfully");

    } catch (err: any) {
      console.error("[LocationTracking] Connection error:", err);
      onErrorRef.current?.(err.message || "Failed to connect to location hub");
      // If connection failed, ensure we clean up
      if (connectionRef.current) {
        signalrManager.releaseConnection('location');
        connectionRef.current = null;
      }
    }
  }, [sessionId, role]);

  // Cleanup function
  const cleanup = useCallback(() => {
    if (updateIntervalRef.current) {
      clearInterval(updateIntervalRef.current);
      updateIntervalRef.current = null;
    }

    if (locationSubscriptionRef.current) {
      locationSubscriptionRef.current.remove();
      locationSubscriptionRef.current = null;
    }

    if (unsubscribeRef.current) {
      unsubscribeRef.current();
      unsubscribeRef.current = null;
    }

    if (connectionRef.current) {
      // We only release the reference, the manager handles actual disconnection
      signalrManager.releaseConnection('location');
      connectionRef.current = null;
      setIsConnected(false);
    }

    setIsSharing(false);
  }, []);

  // Start sharing location (therapist only)
  const startSharing = useCallback(async () => {
    if (role !== "therapist") return;

    try {
      // Request location permissions
      const { status } = await requestLocationPermissionWithDisclosure();
      if (status !== "granted") {
        onErrorRef.current?.("Location permission denied");
        return;
      }

      // Connect if not already connected
      if (!connectionRef.current) {
        await connect();
      }

      if (!connectionRef.current) {
        onErrorRef.current?.("Failed to connect to location hub");
        return;
      }

      // Tell the hub we're starting to track
      await connectionRef.current.invoke("StartTracking", sessionId);
      console.log("[LocationTracking] Started tracking for session:", sessionId);

      console.log("🟢🟢🟢 [LocationTracking] Setting isSharing to TRUE");
      setIsSharing(true);
      onTrackingStartedRef.current?.();

      console.log("🟢🟢🟢 [LocationTracking] isSharing should now be true");

      // Start watching location
      if (Platform.OS !== "web") {
        locationSubscriptionRef.current = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.High, // High accuracy for sharing, not BestForNavigation (saves battery)
            distanceInterval: 10, // Update every 10 meters
            timeInterval: 3000, // Update every 3 seconds for responsive tracking
          },
          (location) => {
            currentLocationRef.current = {
              latitude: location.coords.latitude,
              longitude: location.coords.longitude,
            };
            onOwnLocationUpdateRef.current?.(currentLocationRef.current);
          }
        );
      } else {
        // Web: Use browser's geolocation API with watchPosition
        if (navigator.geolocation) {
          const watchId = navigator.geolocation.watchPosition(
            (position) => {
              currentLocationRef.current = {
                latitude: position.coords.latitude,
                longitude: position.coords.longitude,
              };
              onOwnLocationUpdateRef.current?.(currentLocationRef.current);
            },
            (error) => {
              console.error("[LocationTracking] Web geolocation error:", error);
            },
            {
              enableHighAccuracy: true,
              maximumAge: 3000, // Accept positions up to 3 seconds old
              timeout: 10000   // 10 second timeout
            }
          );
          // Store watchId for cleanup
          (locationSubscriptionRef.current as any) = { remove: () => navigator.geolocation.clearWatch(watchId) };
        }
      }

      // Helper to check if location changed significantly (>10 meters)
      const hasMoved = (prev: LocationCoords | null, curr: LocationCoords): boolean => {
        if (!prev) return true;
        const R = 6371000; // Earth radius in meters
        const dLat = (curr.latitude - prev.latitude) * Math.PI / 180;
        const dLng = (curr.longitude - prev.longitude) * Math.PI / 180;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
          Math.cos(prev.latitude * Math.PI / 180) * Math.cos(curr.latitude * Math.PI / 180) *
          Math.sin(dLng / 2) * Math.sin(dLng / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        const distance = R * c;
        return distance > 10; // More than 10 meters
      };

      // Send immediate location update (don't wait 5s)
      const sendImmediateUpdate = async () => {
        if (Platform.OS !== "web") {
          const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
          const coords = { latitude: current.coords.latitude, longitude: current.coords.longitude };
          currentLocationRef.current = coords;
          onOwnLocationUpdateRef.current?.(coords);
          if (connectionRef.current) {
            await connectionRef.current.invoke("UpdateLocation", sessionId, coords.latitude, coords.longitude);
            lastSentLocationRef.current = coords;
            console.log("[LocationTracking] Sent IMMEDIATE location update:", coords);
          }
        } else if (navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(
            async (position) => {
              const coords = { latitude: position.coords.latitude, longitude: position.coords.longitude };
              currentLocationRef.current = coords;
              onOwnLocationUpdateRef.current?.(coords);
              if (connectionRef.current) {
                await connectionRef.current.invoke("UpdateLocation", sessionId, coords.latitude, coords.longitude);
                lastSentLocationRef.current = coords;
                console.log("[LocationTracking] Sent IMMEDIATE location update:", coords);
              }
            },
            (err) => console.error("[LocationTracking] Failed to get immediate location:", err)
          );
        }
      };
      await sendImmediateUpdate();

      // Send location updates every 5 seconds (with smart throttling)
      updateIntervalRef.current = setInterval(async () => {
        if (currentLocationRef.current && connectionRef.current) {
          // Skip if location hasn't changed significantly
          if (!hasMoved(lastSentLocationRef.current, currentLocationRef.current)) {
            console.log("[LocationTracking] Skipping update - no significant movement");
            return;
          }
          try {
            await connectionRef.current.invoke(
              "UpdateLocation",
              sessionId,
              currentLocationRef.current.latitude,
              currentLocationRef.current.longitude
            );
            lastSentLocationRef.current = currentLocationRef.current;
            console.log("[LocationTracking] Sent location update:", currentLocationRef.current);
          } catch (err) {
            console.error("[LocationTracking] Failed to send location update:", err);
          }
        }
      }, 5000); // Update every 5 seconds
    } catch (err: any) {
      console.error("[LocationTracking] Error starting sharing:", err);
      onErrorRef.current?.(err.message || "Failed to start location sharing");
    }
  }, [role, sessionId, connect]);

  // Stop sharing location (therapist only)
  const stopSharing = useCallback(async () => {
    if (role !== "therapist") return;

    console.log("🔴🔴🔴 [LocationTracking] Setting isSharing to FALSE");
    // Set state first (synchronous) to ensure UI updates immediately
    setIsSharing(false);

    // Clear the update interval
    if (updateIntervalRef.current) {
      clearInterval(updateIntervalRef.current);
      updateIntervalRef.current = null;
    }

    // Stop watching location
    if (locationSubscriptionRef.current) {
      locationSubscriptionRef.current.remove();
      locationSubscriptionRef.current = null;
    }

    // Clear location refs
    currentLocationRef.current = null;
    lastSentLocationRef.current = null;

    // Tell the hub we're stopping (async - don't block UI)
    if (connectionRef.current) {
      try {
        await connectionRef.current.invoke("StopTracking", sessionId);
        console.log("[LocationTracking] Stopped tracking for session:", sessionId);
      } catch (err) {
        console.error("[LocationTracking] Error stopping tracking:", err);
        // Don't fail silently - still ensure state is cleared
      }
    }

    onTrackingStoppedRef.current?.();
    console.log("🔴🔴🔴 [LocationTracking] Stop complete, isSharing should be false");
  }, [role, sessionId]);

  // Toggle sharing
  const toggleSharing = useCallback(async () => {
    if (isSharing) {
      await stopSharing();
    } else {
      await startSharing();
    }
  }, [isSharing, startSharing, stopSharing]);

  // Connect on mount for both patients (to receive updates) and therapists (to receive their own broadcasts)
  useEffect(() => {
    if (sessionId) {
      connect();
    }

    return () => {
      cleanup();
    };
  }, [sessionId, connect, cleanup]);

  return {
    isSharing: role === "therapist" ? isSharing : therapistLocation !== null,
    isConnected,
    therapistLocation,
    startSharing,
    stopSharing,
    toggleSharing,
  };
}


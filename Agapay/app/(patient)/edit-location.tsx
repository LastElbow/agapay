import WebMapNative from "@/src/components/WebMap.native";
import WebMapWeb from "@/src/components/WebMap.web";
import { Feather, Ionicons } from "@expo/vector-icons";
import Mapbox from "@rnmapbox/maps";
import Constants from "expo-constants";
import * as Location from "expo-location";
import { useLocalSearchParams, useRouter } from "expo-router";
import { requestLocationPermissionWithDisclosure } from "@/src/utils/locationPermission";
import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  Modal,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import {
  GestureHandlerRootView,
  PanGestureHandler,
} from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import BarangaySelector from "@/src/features/onboarding/screens/BarangaySelector";
import { formStore } from "@/src/stores/formStore";
import apiClient from "@/api/client";
import { useQueryClient } from "@tanstack/react-query";
import { useRole } from "@/src/providers/RoleProvider";

// Initialize Mapbox
Mapbox.setAccessToken(Constants.expoConfig?.extra?.mapboxAccessToken || "");

const WebMap = Platform.OS === "web" ? WebMapWeb : WebMapNative;

const SPRING_CONFIG = {
  damping: 18,
  stiffness: 150,
  mass: 1,
  overshootClamping: false,
  restDisplacementThreshold: 0.5,
  restSpeedThreshold: 0.5,
} as const;

export default function EditLocation() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams();
  const isWeb = Platform.OS === "web";
  const queryClient = useQueryClient();
  const { selectedRole } = useRole();

  // Web-wide layout switch (left details card + right map)
  const [isWideWeb, setIsWideWeb] = useState(
    isWeb && typeof window !== "undefined" ? window.innerWidth >= 1024 : false,
  );
  useEffect(() => {
    if (!isWeb || typeof window === "undefined") return;
    const onResize = () => setIsWideWeb(window.innerWidth >= 1024);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [isWeb]);
  const useSideLayout = isWeb && isWideWeb;

  const [detailedAddress, setDetailedAddress] = useState<string>(
    (Array.isArray((params as any).address)
      ? (params as any).address[0]
      : (params as any).address) || "",
  );
  const [isLocationLoading, setIsLocationLoading] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);

  // Initialize with params or defaults
  const latParam = Array.isArray((params as any).latitude)
    ? (params as any).latitude[0]
    : (params as any).latitude;
  const lngParam = Array.isArray((params as any).longitude)
    ? (params as any).longitude[0]
    : (params as any).longitude;
  const parsedLat =
    latParam != null && String(latParam).trim() !== "" ? Number(latParam) : NaN;
  const parsedLng =
    lngParam != null && String(lngParam).trim() !== "" ? Number(lngParam) : NaN;
  const initialLat = Number.isFinite(parsedLat) ? parsedLat : 7.1907;
  const initialLng = Number.isFinite(parsedLng) ? parsedLng : 125.4553;

  const [markerCoordinate, setMarkerCoordinate] = useState<[number, number]>([
    initialLng,
    initialLat,
  ]);

  // Initialize barangay from params
  // Note: Profile pages pass 'barangay' but some screens might pass 'barangayName'
  // Accept both for backward compatibility
  useEffect(() => {
    if (params.barangayId) {
      formStore.setBarangayId(Number(params.barangayId));
    }
    // Accept both 'barangayName' and 'barangay' param names
    const barangayParam = (params.barangayName || params.barangay) as
      | string
      | undefined;
    if (barangayParam) {
      formStore.setBarangayName(barangayParam);
    }
  }, [params.barangayId, params.barangayName, params.barangay]);

  const scrollViewRef = useRef<ScrollView>(null);
  const safeBottom = Math.max(insets.bottom, 16);

  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const isExpandedRef = useRef(false);

  useEffect(() => {
    if (Platform.OS === "web") return;

    const showEvent =
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent =
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const onShow = (e: any) => {
      const rawHeight = Number(e?.endCoordinates?.height ?? 0);
      // Avoid double-counting the safe-area inset on iOS.
      const adjusted = Math.max(0, rawHeight - (insets.bottom ?? 0));
      setKeyboardHeight(adjusted);

      if (isExpandedRef.current) {
        setTimeout(() => {
          scrollViewRef.current?.scrollToEnd({ animated: true });
        }, 50);
      }
    };

    const onHide = () => {
      setKeyboardHeight(0);
    };

    const subShow = Keyboard.addListener(showEvent as any, onShow);
    const subHide = Keyboard.addListener(hideEvent as any, onHide);
    return () => {
      subShow.remove();
      subHide.remove();
    };
  }, [insets.bottom]);

  // Draggable bottom sheet logic
  const SHEET_HEIGHT = 400;
  const MIN_SHEET_HEIGHT = 120;
  const translateY = useSharedValue(SHEET_HEIGHT - MIN_SHEET_HEIGHT);
  const [isExpanded, setIsExpanded] = useState(false);
  useEffect(() => {
    isExpandedRef.current = isExpanded;
  }, [isExpanded]);

  const animatedSheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const lastOffset = useRef(translateY.value);

  const onGestureEvent = (event: any) => {
    let newTranslateY = lastOffset.current + event.nativeEvent.translationY;
    newTranslateY = Math.max(
      0,
      Math.min(newTranslateY, SHEET_HEIGHT - MIN_SHEET_HEIGHT),
    );
    translateY.value = newTranslateY;
  };

  const onGestureEnd = (event?: any) => {
    const velocityY = event?.nativeEvent?.velocityY ?? 0;
    const midpoint = (SHEET_HEIGHT - MIN_SHEET_HEIGHT) / 2;

    const shouldExpand = translateY.value < midpoint || velocityY < -600;
    const target = shouldExpand ? 0 : SHEET_HEIGHT - MIN_SHEET_HEIGHT;

    translateY.value = withSpring(target, SPRING_CONFIG, (finished) => {
      if (finished) {
        lastOffset.current = target;
        runOnJS(setIsExpanded)(shouldExpand);
      }
    });
  };

  const expandSheet = useCallback(() => {
    lastOffset.current = 0;
    translateY.value = withSpring(0, SPRING_CONFIG);
    setIsExpanded(true);
  }, [translateY]);

  const keyboardAvoidingBottom = Math.max(safeBottom, keyboardHeight);

  // Fallback: if opened without route params, try to prefill from backend
  useEffect(() => {
    const hasLatParam = Number.isFinite(parsedLat);
    const hasLngParam = Number.isFinite(parsedLng);
    const hasAddressParam = Boolean(params.address);
    const hasBarangayParam = Boolean(params.barangay || params.barangayName);

    if (hasLatParam || hasLngParam || hasAddressParam || hasBarangayParam) {
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const endpoint =
          selectedRole === "PhysicalTherapist"
            ? "/api/Therapist/me"
            : "/api/patient/me";
        const res = await apiClient.get(endpoint);
        const data = res?.data ?? {};

        const latRaw = (data as any).latitude ?? (data as any).Latitude;
        const lngRaw = (data as any).longitude ?? (data as any).Longitude;
        const addressRaw = (data as any).address ?? (data as any).Address;
        const barangayRaw = (data as any).barangay ?? (data as any).Barangay;

        const lat = Number(latRaw);
        const lng = Number(lngRaw);

        if (!cancelled && Number.isFinite(lat) && Number.isFinite(lng)) {
          setMarkerCoordinate([lng, lat]);
        }

        if (!cancelled && !detailedAddress.trim() && addressRaw) {
          setDetailedAddress(String(addressRaw));
        }

        if (!cancelled && !formStore.getBarangayName() && barangayRaw) {
          formStore.setBarangayName(String(barangayRaw));
        }
      } catch (e) {
        console.warn(
          "[EditLocation] Failed to prefill location from backend",
          e,
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    detailedAddress,
    parsedLat,
    parsedLng,
    params.address,
    params.barangay,
    params.barangayName,
    params.latitude,
    params.longitude,
    selectedRole,
  ]);

  // Callback when barangay is selected - geocode and move marker to that location
  const handleBarangaySelect = useCallback(
    async (barangay: { id: number; name: string }) => {
      try {
        // Use Mapbox Geocoding API to get coordinates for the barangay
        // Search for "Barangay [name], Davao City, Philippines" for better accuracy
        const searchQuery = encodeURIComponent(
          `Barangay ${barangay.name}, Davao City, Davao del Sur, Philippines`,
        );
        const accessToken = Constants.expoConfig?.extra?.mapboxAccessToken;

        if (!accessToken) {
          console.warn(
            "[EditLocation] No Mapbox access token available for geocoding",
          );
          return;
        }

        console.log("[EditLocation] Geocoding barangay:", barangay.name);

        const response = await fetch(
          `https://api.mapbox.com/geocoding/v5/mapbox.places/${searchQuery}.json?access_token=${accessToken}&limit=1&types=neighborhood,locality,place`,
        );

        if (!response.ok) {
          console.warn(
            "[EditLocation] Geocoding request failed:",
            response.status,
          );
          return;
        }

        const data = await response.json();

        if (data.features && data.features.length > 0) {
          const [longitude, latitude] = data.features[0].center;
          console.log("[EditLocation] Found coordinates for barangay:", {
            latitude,
            longitude,
          });
          setMarkerCoordinate([longitude, latitude]);
        } else {
          console.log(
            "[EditLocation] No geocoding results found for barangay:",
            barangay.name,
          );
        }
      } catch (error) {
        console.error("[EditLocation] Failed to geocode barangay:", error);
      }
    },
    [],
  );

  const getCurrentLocation = useCallback(
    async (retryCount = 0) => {
      try {
        setIsLocationLoading(true);
        setLocationError(null);

        console.log(
          "[EditLocation] Getting current location, attempt:",
          retryCount + 1,
        );

        // On web, try the native browser Geolocation API first for better accuracy
        if (Platform.OS === "web" && navigator?.geolocation) {
          console.log("[EditLocation] Using browser Geolocation API");

          const position = await new Promise<GeolocationPosition>(
            (resolve, reject) => {
              navigator.geolocation.getCurrentPosition(resolve, reject, {
                enableHighAccuracy: true,
                timeout: 15000,
                maximumAge: 0, // Don't use cached position
              });
            },
          );

          const { latitude, longitude, accuracy } = position.coords;
          console.log("[EditLocation] Browser location obtained:", {
            latitude,
            longitude,
            accuracy,
          });

          setMarkerCoordinate([longitude, latitude]);

          // Try reverse geocode using Mapbox for better results on web
          try {
            const accessToken = Constants.expoConfig?.extra?.mapboxAccessToken;
            if (accessToken && !detailedAddress) {
              const response = await fetch(
                `https://api.mapbox.com/geocoding/v5/mapbox.places/${longitude},${latitude}.json?access_token=${accessToken}&types=address,poi`,
              );
              if (response.ok) {
                const data = await response.json();
                if (data.features && data.features.length > 0) {
                  setDetailedAddress(data.features[0].place_name || "");
                }
              }
            }
          } catch (e) {
            console.debug("Reverse geocode failed:", e);
          }

          setIsLocationLoading(false);
          return;
        }

        // For mobile, use expo-location
        const locationServicesEnabled =
          await Location.hasServicesEnabledAsync();

        if (!locationServicesEnabled) {
          setLocationError(
            "Location services are disabled. Please enable location services in your device settings and try again.",
          );
          setIsLocationLoading(false);
          return;
        }

        const { status } = await requestLocationPermissionWithDisclosure();

        if (status !== "granted") {
          setLocationError(
            "Location permission denied. Please allow location access to use this feature.",
          );
          setIsLocationLoading(false);
          return;
        }

        // Use high accuracy for better precision
        let timeoutId: ReturnType<typeof setTimeout> | undefined;
        const locationResult = await Promise.race<
          Location.LocationObject | "timeout"
        >([
          Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.High, // Changed from Balanced to High
          }),
          new Promise<"timeout">((resolve) => {
            timeoutId = setTimeout(
              () => resolve("timeout"),
              15000, // Increased timeout to 15 seconds
            );
          }),
        ]);

        if (timeoutId) {
          clearTimeout(timeoutId);
        }

        if (locationResult === "timeout") {
          // Try with lower accuracy as fallback
          console.log(
            "[EditLocation] High accuracy timed out, trying balanced...",
          );
          const fallbackResult = await Promise.race<
            Location.LocationObject | "timeout"
          >([
            Location.getCurrentPositionAsync({
              accuracy: Location.Accuracy.Balanced,
            }),
            new Promise<"timeout">((resolve) => {
              setTimeout(() => resolve("timeout"), 10000);
            }),
          ]);

          if (fallbackResult === "timeout") {
            throw new Error("Location request timed out");
          }

          const { latitude, longitude } = fallbackResult.coords;
          console.log("[EditLocation] Fallback location obtained:", {
            latitude,
            longitude,
          });
          setMarkerCoordinate([longitude, latitude]);
          setIsLocationLoading(false);
          return;
        }

        const location = locationResult;
        const { latitude, longitude, accuracy } = location.coords;
        console.log("[EditLocation] Location obtained:", {
          latitude,
          longitude,
          accuracy,
        });

        setMarkerCoordinate([longitude, latitude]);

        // Try reverse geocode
        try {
          const rev = await Location.reverseGeocodeAsync({
            latitude,
            longitude,
          });
          if (rev && rev.length > 0) {
            const place = rev[0];
            const composed = [
              place.name,
              place.street,
              place.city,
              place.region,
            ]
              .filter(Boolean)
              .join(", ");
            if (composed && !detailedAddress) {
              setDetailedAddress(composed);
            }
          }
        } catch (e) {
          console.debug("Reverse geocode failed:", e);
        }
      } catch (error: any) {
        console.error("Error getting location:", error);

        // Handle specific error types
        if (error.code === 1 || error.message?.includes("permission")) {
          setLocationError(
            "Location permission denied. Please allow location access in your browser settings.",
          );
        } else if (error.code === 2 || error.message?.includes("unavailable")) {
          if (retryCount < 2) {
            console.log("[EditLocation] Location unavailable, retrying...");
            setTimeout(() => getCurrentLocation(retryCount + 1), 2000);
            return;
          } else {
            setLocationError(
              "Unable to determine your location. Please check that location services are enabled.",
            );
          }
        } else if (error.code === 3 || error.message?.includes("timeout")) {
          setLocationError(
            "Location request timed out. Please try again or move to an area with better signal.",
          );
        } else {
          setLocationError(
            "Unable to get your current location. Please try again.",
          );
        }
      } finally {
        setIsLocationLoading(false);
      }
    },
    [detailedAddress],
  );

  const handleMapPress = (feature: any) => {
    const { geometry } = feature;
    if (geometry && geometry.coordinates) {
      const [longitude, latitude] = geometry.coordinates;
      setMarkerCoordinate([longitude, latitude]);
    }
  };

  const handleSaveLocation = async () => {
    const finalAddress = detailedAddress.trim();

    if (!finalAddress) {
      Alert.alert("Error", "Please enter your address details.");
      return;
    }

    setIsSaving(true);

    try {
      const payload = {
        address: finalAddress,
        barangay: formStore.getBarangayName() || null,
        latitude: markerCoordinate[1],
        longitude: markerCoordinate[0],
      };

      // Use correct API endpoint based on user role
      const endpoint =
        selectedRole === "PhysicalTherapist"
          ? "/api/Therapist/me"
          : "/api/patient/me";

      console.log("[EditLocation] Saving location with payload:", payload);
      console.log(
        "[EditLocation] Using endpoint:",
        endpoint,
        "for role:",
        selectedRole,
      );

      await apiClient.put(endpoint, payload);

      // Invalidate queries to refresh profile data
      if (selectedRole === "PhysicalTherapist") {
        queryClient.invalidateQueries({ queryKey: ["therapistProfile"] });
        queryClient.invalidateQueries({
          queryKey: ["therapistProfileDetails"],
        });
      } else {
        queryClient.invalidateQueries({ queryKey: ["patientProfile"] });
        queryClient.invalidateQueries({ queryKey: ["patientProfileDetails"] });
      }

      // Show success modal
      setShowSuccessModal(true);
    } catch (error: any) {
      console.error("Failed to save location:", error);
      Alert.alert(
        "Error",
        error?.response?.data?.message || "Failed to save location",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleGetMyLocation = () => {
    getCurrentLocation();
  };

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaView style={[styles.container, { paddingTop: insets.top }]}>
        {/* Success Confirmation Modal */}
        <Modal
          visible={showSuccessModal}
          transparent
          animationType="fade"
          onRequestClose={() => {
            setShowSuccessModal(false);
            router.back();
          }}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.successModalContainer}>
              {/* Success Icon */}
              <View style={styles.successIconContainer}>
                <Ionicons name="checkmark-circle" size={64} color="#0D9488" />
              </View>

              {/* Success Message */}
              <Text style={styles.successModalTitle}>Location Saved!</Text>
              <Text style={styles.successModalMessage}>
                Your location has been updated successfully.
              </Text>

              {/* OK Button */}
              <TouchableOpacity
                style={styles.successModalButton}
                onPress={() => {
                  setShowSuccessModal(false);
                  router.back();
                }}
                activeOpacity={0.8}
              >
                <Text style={styles.successModalButtonText}>OK</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
        {/* Floating Back Button (only for non-side layout) */}
        {!useSideLayout && (
          <TouchableOpacity
            style={styles.floatingBackButton}
            onPress={() => router.back()}
          >
            <Ionicons name="arrow-back" size={24} color="#0D9488" />
            <Text style={styles.backButtonText}>Back</Text>
          </TouchableOpacity>
        )}

        {useSideLayout ? (
          // Web wide layout: left panel with details, right side map
          <View style={styles.webLayout}>
            <View style={styles.webLeftPanel}>
              <View style={styles.webLeftCard}>
                <TouchableOpacity
                  style={styles.inlineBackButton}
                  onPress={() => router.back()}
                >
                  <Ionicons name="arrow-back" size={20} color="#0D9488" />
                  <Text style={styles.backButtonText}>Back</Text>
                </TouchableOpacity>

                <Text style={styles.addressDetailsTitle}>Edit Location</Text>
                <Text style={styles.addressDetailsSubtitle}>
                  Update your address and pin location on the map
                </Text>
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Your Complete Address</Text>
                  <TextInput
                    value={detailedAddress}
                    onChangeText={setDetailedAddress}
                    style={styles.addressInput}
                    placeholder="Enter your complete address"
                    placeholderTextColor="#9CA3AF"
                    returnKeyType="done"
                    blurOnSubmit={true}
                    multiline
                  />
                  <BarangaySelector onSelect={handleBarangaySelect} />
                  <TouchableOpacity
                    style={[
                      styles.confirmButton,
                      (!detailedAddress.trim() || isSaving) &&
                        styles.confirmButtonDisabled,
                    ]}
                    onPress={handleSaveLocation}
                    disabled={!detailedAddress.trim() || isSaving}
                    activeOpacity={0.8}
                  >
                    {isSaving ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={styles.confirmButtonText}>
                        Save Location
                      </Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            </View>
            <View style={styles.webMapRight}>
              <View style={styles.mapContainer}>
                {Platform.OS !== "web" ? (
                  <Mapbox.MapView
                    style={styles.map}
                    onPress={handleMapPress}
                    logoEnabled={false}
                    compassEnabled={true}
                    zoomEnabled={true}
                    scrollEnabled={true}
                  >
                    <Mapbox.Camera
                      zoomLevel={15}
                      centerCoordinate={markerCoordinate}
                      animationMode="flyTo"
                      animationDuration={1000}
                    />
                    <Mapbox.PointAnnotation
                      id="marker"
                      coordinate={markerCoordinate}
                      draggable={true}
                      onDragEnd={(feature) => {
                        const { geometry } = feature;
                        if (geometry && geometry.coordinates) {
                          const [longitude, latitude] = geometry.coordinates;
                          setMarkerCoordinate([longitude, latitude]);
                        }
                      }}
                    >
                      <View style={styles.markerContainer}>
                        <Feather name="map-pin" size={30} color="#0D9488" />
                      </View>
                    </Mapbox.PointAnnotation>
                  </Mapbox.MapView>
                ) : (
                  <WebMap
                    style={styles.map}
                    center={markerCoordinate}
                    onChange={(lng: number, lat: number) => {
                      setMarkerCoordinate([lng, lat]);
                    }}
                    zoom={15}
                  />
                )}

                {/* Location Button */}
                <TouchableOpacity
                  style={[
                    styles.locationButton,
                    isLocationLoading && styles.locationButtonDisabled,
                  ]}
                  onPress={handleGetMyLocation}
                  disabled={isLocationLoading}
                  accessibilityLabel="Use my current location"
                  {...(Platform.OS === "web"
                    ? { title: "Use my current location" }
                    : {})}
                >
                  {isLocationLoading ? (
                    <ActivityIndicator size="small" color="#0D9488" />
                  ) : (
                    <Feather name="crosshair" size={24} color="#0D9488" />
                  )}
                </TouchableOpacity>

                {/* Error */}
                {locationError && (
                  <View style={styles.errorContainer}>
                    <View style={styles.errorBox}>
                      <Ionicons name="warning" size={24} color="#DC3545" />
                      <Text style={styles.errorText}>{locationError}</Text>
                      <TouchableOpacity
                        style={styles.retryButton}
                        onPress={handleGetMyLocation}
                      >
                        <Text style={styles.retryButtonText}>Retry</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}

                {/* Loading */}
                {isLocationLoading && (
                  <View style={styles.loadingOverlay}>
                    <ActivityIndicator size="large" color="#0D9488" />
                    <Text style={styles.loadingText}>
                      Getting your location...
                    </Text>
                  </View>
                )}
              </View>
            </View>
          </View>
        ) : (
          <>
            {/* Map */}
            <View style={styles.mapContainer}>
              {Platform.OS !== "web" ? (
                <Mapbox.MapView
                  style={styles.map}
                  onPress={handleMapPress}
                  logoEnabled={false}
                  compassEnabled={true}
                  zoomEnabled={true}
                  scrollEnabled={true}
                >
                  <Mapbox.Camera
                    zoomLevel={15}
                    centerCoordinate={markerCoordinate}
                    animationMode="flyTo"
                    animationDuration={1000}
                  />
                  <Mapbox.PointAnnotation
                    id="marker"
                    coordinate={markerCoordinate}
                    draggable={true}
                    onDragEnd={(feature) => {
                      const { geometry } = feature;
                      if (geometry && geometry.coordinates) {
                        const [longitude, latitude] = geometry.coordinates;
                        setMarkerCoordinate([longitude, latitude]);
                      }
                    }}
                  >
                    <View style={styles.markerContainer}>
                      <Feather name="map-pin" size={30} color="#0D9488" />
                    </View>
                  </Mapbox.PointAnnotation>
                </Mapbox.MapView>
              ) : (
                <WebMap
                  style={styles.map}
                  center={markerCoordinate}
                  onChange={(lng: number, lat: number) => {
                    setMarkerCoordinate([lng, lat]);
                  }}
                  zoom={15}
                />
              )}

              {/* Location Button */}
              <TouchableOpacity
                style={[
                  styles.locationButton,
                  isLocationLoading && styles.locationButtonDisabled,
                ]}
                onPress={handleGetMyLocation}
                disabled={isLocationLoading}
                accessibilityLabel="Use my current location"
                {...(Platform.OS === "web"
                  ? { title: "Use my current location" }
                  : {})}
              >
                {isLocationLoading ? (
                  <ActivityIndicator size="small" color="#0D9488" />
                ) : (
                  <Feather name="crosshair" size={24} color="#0D9488" />
                )}
              </TouchableOpacity>

              {/* Error */}
              {locationError && (
                <View style={styles.errorContainer}>
                  <View style={styles.errorBox}>
                    <Ionicons name="warning" size={24} color="#DC3545" />
                    <Text style={styles.errorText}>{locationError}</Text>
                    <TouchableOpacity
                      style={styles.retryButton}
                      onPress={handleGetMyLocation}
                    >
                      <Text style={styles.retryButtonText}>Retry</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {/* Loading */}
              {isLocationLoading && (
                <View style={styles.loadingOverlay}>
                  <ActivityIndicator size="large" color="#0D9488" />
                  <Text style={styles.loadingText}>
                    Getting your location...
                  </Text>
                </View>
              )}
            </View>

            {/* Draggable Address Details Bottom Sheet */}
            <Animated.View
              style={[
                styles.bottomSheet,
                animatedSheetStyle,
                {
                  bottom:
                    isExpanded && keyboardHeight > 0
                      ? keyboardAvoidingBottom
                      : isExpanded
                        ? 0
                        : safeBottom,
                  paddingBottom: 8,
                  left: 0,
                  right: 0,
                },
              ]}
            >
              <PanGestureHandler
                onGestureEvent={onGestureEvent}
                onEnded={onGestureEnd}
              >
                <View style={styles.dragHandleArea}>
                  <View style={styles.sheetHandle} />
                </View>
              </PanGestureHandler>
              <ScrollView
                ref={scrollViewRef}
                style={styles.addressDetailsScroll}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                contentContainerStyle={
                  isExpanded
                    ? [
                        styles.expandedScroll,
                        { paddingBottom: Math.max(120, keyboardHeight + 40) },
                      ]
                    : styles.collapsedScroll
                }
              >
                <Text style={styles.addressDetailsTitle}>Edit Location</Text>
                <Text style={styles.addressDetailsSubtitle}>
                  {isExpanded
                    ? "Update your address and move the pin to adjust location"
                    : "Tap on the map to pin your location and enter address details"}
                </Text>

                {isExpanded && (
                  <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>Your Complete Address</Text>
                    <TextInput
                      value={detailedAddress}
                      onChangeText={setDetailedAddress}
                      style={styles.addressInput}
                      placeholder="Enter your complete address"
                      placeholderTextColor="#9CA3AF"
                      returnKeyType="done"
                      blurOnSubmit={true}
                      multiline
                      onFocus={() => {
                        if (!isExpandedRef.current) {
                          expandSheet();
                        }
                        setTimeout(() => {
                          scrollViewRef.current?.scrollToEnd({
                            animated: true,
                          });
                        }, 100);
                      }}
                    />
                    <BarangaySelector onSelect={handleBarangaySelect} />

                    <TouchableOpacity
                      style={[
                        styles.confirmButton,
                        (!detailedAddress.trim() || isSaving) &&
                          styles.confirmButtonDisabled,
                      ]}
                      onPress={handleSaveLocation}
                      disabled={!detailedAddress.trim() || isSaving}
                      activeOpacity={0.8}
                    >
                      {isSaving ? (
                        <ActivityIndicator color="#fff" />
                      ) : (
                        <Text style={styles.confirmButtonText}>
                          Save Location
                        </Text>
                      )}
                    </TouchableOpacity>
                  </View>
                )}
              </ScrollView>
            </Animated.View>
          </>
        )}
      </SafeAreaView>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  floatingBackButton: {
    position: "absolute",
    top: 60,
    left: 20,
    zIndex: 1000,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  backButtonText: {
    color: "#0D9488",
    fontSize: 16,
    fontWeight: "500",
    marginLeft: 8,
  },
  mapContainer: {
    flex: 1,
    position: "relative",
  },
  map: {
    flex: 1,
  },
  locationButton: {
    position: "absolute",
    bottom: 20,
    right: 20,
    backgroundColor: "#FFFFFF",
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: "center",
    justifyContent: "center",
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    borderWidth: 1,
    borderColor: "#E0E0E0",
  },
  locationButtonDisabled: {
    opacity: 0.7,
    backgroundColor: "#F5F5F5",
  },
  markerContainer: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "white",
    borderRadius: 20,
    width: 40,
    height: 40,
    borderWidth: 2,
    borderColor: "#0D9488",
  },
  errorContainer: {
    position: "absolute",
    top: 20,
    left: 20,
    right: 20,
    alignItems: "center",
  },
  errorBox: {
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    borderWidth: 1,
    borderColor: "#FEE2E2",
  },
  errorText: {
    fontSize: 14,
    color: "#DC3545",
    textAlign: "center",
    marginTop: 8,
    marginBottom: 12,
    lineHeight: 20,
  },
  retryButton: {
    backgroundColor: "#0D9488",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  retryButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "500",
  },
  loadingOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(255, 255, 255, 0.8)",
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: 8,
    fontSize: 16,
    color: "#0D9488",
    fontWeight: "500",
  },
  bottomSheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 400,
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    elevation: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    zIndex: 100,
  },
  webLayout: {
    flex: 1,
    flexDirection: "row",
    position: "relative",
  },
  webLeftPanel: {
    position: "absolute",
    top: 16,
    left: 16,
    width: 420,
    backgroundColor: "transparent",
    alignItems: "stretch",
    zIndex: 10,
  },
  webMapRight: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  webLeftCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E0E0E0",
    padding: 16,
    alignSelf: "flex-start",
    width: "100%",
    maxWidth: 420,
    elevation: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
  },
  inlineBackButton: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    alignSelf: "flex-start",
    marginBottom: 8,
    flexDirection: "row",
  },
  sheetHandle: {
    width: 64,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#E0E0E0",
    alignSelf: "center",
    marginVertical: 8,
  },
  dragHandleArea: {
    paddingTop: 4,
    paddingBottom: 8,
  },
  addressDetailsScroll: {
    flex: 1,
    paddingHorizontal: 20,
  },
  addressDetailsTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#000",
    textAlign: "center",
    marginTop: 20,
    marginBottom: 8,
  },
  addressDetailsSubtitle: {
    fontSize: 14,
    color: "#666",
    textAlign: "center",
    marginBottom: 20,
  },
  inputGroup: {
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 16,
    fontWeight: "500",
    color: "#000",
    marginBottom: 8,
  },
  addressInput: {
    backgroundColor: "#F8F9FA",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12,
    fontSize: 16,
    color: "#000",
    borderWidth: 1,
    borderColor: "#E9ECEF",
    marginBottom: 16,
  },
  confirmButton: {
    backgroundColor: "#0D9488",
    paddingVertical: 18,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 20,
  },
  confirmButtonDisabled: {
    backgroundColor: "#9CA3AF",
  },
  confirmButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  collapsedScroll: {
    paddingBottom: 20,
  },
  expandedScroll: {
    paddingBottom: 100,
  },
  // Success Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  successModalContainer: {
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    padding: 32,
    alignItems: "center",
    maxWidth: 340,
    width: "100%",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  successIconContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: "#E6F7F5",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
  },
  successModalTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 8,
    textAlign: "center",
  },
  successModalMessage: {
    fontSize: 15,
    color: "#6B7280",
    textAlign: "center",
    marginBottom: 24,
    lineHeight: 22,
  },
  successModalButton: {
    backgroundColor: "#0D9488",
    paddingVertical: 14,
    paddingHorizontal: 48,
    borderRadius: 14,
    width: "100%",
    alignItems: "center",
  },
  successModalButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
});

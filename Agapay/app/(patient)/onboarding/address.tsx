import WebMapNative from "@/src/components/WebMap.native";
import WebMapWeb from "@/src/components/WebMap.web";
import { Feather, Ionicons, FontAwesome5 } from "@expo/vector-icons";
import { ArrowLeft } from "lucide-react-native";
import Mapbox from "@rnmapbox/maps";
import Constants from "expo-constants";
import * as Location from "expo-location";
import { useLocalSearchParams, useRouter, Redirect } from "expo-router";
import { requestLocationPermissionWithDisclosure } from "@/src/utils/locationPermission";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Keyboard,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
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
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { formStore } from "@/src/stores/formStore";
import BarangaySelector from "@/src/features/onboarding/screens/BarangaySelector";
import { useRole } from "@/src/providers/RoleProvider";

const LOCATION_TIMEOUT_MS = 10000;

const SPRING_CONFIG = {
  damping: 18,
  stiffness: 150,
  mass: 1,
  overshootClamping: false,
  restDisplacementThreshold: 0.5,
  restSpeedThreshold: 0.5,
} as const;

// Initialize Mapbox
Mapbox.setAccessToken(Constants.expoConfig?.extra?.mapboxAccessToken || "");

const WebMap = Platform.OS === "web" ? WebMapWeb : WebMapNative;

export default function PatientAddress() {
  const { selectedRole, isBootstrapping: roleBootstrapping } = useRole();

  // Redirect therapists to their proper home page
  // This prevents accidental navigation to patient onboarding
  if (!roleBootstrapping && selectedRole === "PhysicalTherapist") {
    return <Redirect href="/(therapist)/(tabs)" />;
  }

  return <PatientAddressInner />;
}

function PatientAddressInner() {
  const router = useRouter();

  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams();
  const { width } = useWindowDimensions();
  const isWeb = Platform.OS === "web";
  const isLargeWeb = isWeb && width >= 768;

  // Determine the return destination
  const returnTo = (params.returnTo as string) || "tell-us-about";

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

  const [detailedAddress, setDetailedAddress] = useState<string>("");
  const [isLocationLoading, setIsLocationLoading] = useState(true);
  const [showAddressInput, setShowAddressInput] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [markerCoordinate, setMarkerCoordinate] = useState<[number, number]>([
    125.4553, // Default to Davao City
    7.1907,
  ]);

  // Error modal state
  const [errorModal, setErrorModal] = useState<{
    visible: boolean;
    title: string;
    message: string;
  }>({ visible: false, title: "", message: "" });

  const scrollViewRef = useRef<ScrollView>(null);
  const safeBottom = Math.max(insets.bottom, 16);
  const safeFloatingBottom = Math.max(safeBottom + 4, 20);

  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const isExpandedRef = useRef(false);

  // Draggable bottom sheet logic
  const SHEET_HEIGHT = 400;
  const MIN_SHEET_HEIGHT = 120; // Taller collapsed height to match design
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
    // Velocity-aware snapping for smoother, more natural transitions
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

  const expandSheet = React.useCallback(() => {
    lastOffset.current = 0;
    translateY.value = withSpring(0, SPRING_CONFIG);
    setIsExpanded(true);
  }, [translateY]);

  const keyboardAvoidingBottom = Math.max(safeBottom, keyboardHeight);

  useEffect(() => {
    if (Platform.OS === "web") return;

    const showEvent =
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent =
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const onShow = (e: any) => {
      const rawHeight = Number(e?.endCoordinates?.height ?? 0);
      const adjusted = Math.max(0, rawHeight - (insets.bottom ?? 0));
      setKeyboardHeight(adjusted);

      if (isExpandedRef.current) {
        setTimeout(() => {
          scrollViewRef.current?.scrollToEnd({ animated: true });
        }, 50);
      }
    };

    const onHide = () => setKeyboardHeight(0);

    const subShow = Keyboard.addListener(showEvent as any, onShow);
    const subHide = Keyboard.addListener(hideEvent as any, onHide);

    return () => {
      subShow.remove();
      subHide.remove();
    };
  }, [insets.bottom]);

  // getCurrentLocation wrapped in useCallback so it can be used safely in
  // useEffect dependency arrays without causing ESLint warnings.
  const getCurrentLocation = React.useCallback(async (retryCount = 0) => {
    try {
      setIsLocationLoading(true);
      setLocationError(null);

      // First check if location services are enabled
      const locationServicesEnabled = await Location.hasServicesEnabledAsync();

      if (!locationServicesEnabled) {
        setLocationError(
          "Location services are disabled. Please enable location services and try again.",
        );
        // Allow manual address entry even if services are disabled
        setShowAddressInput(true);
        setIsLocationLoading(false);
        return;
      }

      // Request location permissions
      const { status } = await requestLocationPermissionWithDisclosure();

      if (status !== "granted") {
        setLocationError(
          "Location permission denied. Using default location (Manila).",
        );
        // Allow manual address entry if permission is denied
        setShowAddressInput(true);
        setIsLocationLoading(false);
        return;
      }

      // Get current position with timeout so browsers that stall still fall back
      let timeoutId: ReturnType<typeof setTimeout> | undefined;
      const locationResult = await Promise.race<
        Location.LocationObject | "timeout"
      >([
        Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        }),
        new Promise<"timeout">((resolve) => {
          timeoutId = setTimeout(() => resolve("timeout"), LOCATION_TIMEOUT_MS);
        }),
      ]);

      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      if (locationResult === "timeout") {
        throw new Error("Location request timed out");
      }

      const location = locationResult;

      const { latitude, longitude } = location.coords;

      // Update marker coordinate with current location
      setMarkerCoordinate([longitude, latitude]);
      // Persist to formStore so parent screens (and web) can read values even if
      // route params are lost or not applied immediately.
      formStore.setLatitude(String(latitude));
      formStore.setLongitude(String(longitude));
      // Ensure the address input is visible after determining a location
      setShowAddressInput(true);

      // Try a lightweight reverse geocode to give the user a friendly address
      // on platforms that support it. Fail silently if unavailable.
      try {
        const rev = await Location.reverseGeocodeAsync({
          latitude,
          longitude,
        });
        if (rev && rev.length > 0) {
          const place = rev[0];
          const composed = [place.name, place.street, place.city, place.region]
            .filter(Boolean)
            .join(", ");
          if (composed) {
            setDetailedAddress((prev) => prev || composed);
            formStore.setAddress(composed);
            formStore.setLocationDisplayName(composed);
          }
        }
      } catch (e) {
        // ignore reverse geocode failures
        console.debug("Reverse geocode failed:", e);
      }

      console.log("Current location:", { latitude, longitude });
    } catch (error: any) {
      console.error("Error getting location:", error);

      // Handle specific error types
      if (error.message?.includes("Current location is unavailable")) {
        if (retryCount < 2) {
          // Retry after a short delay
          console.log(`Retrying location request (attempt ${retryCount + 1})`);
          setTimeout(() => getCurrentLocation(retryCount + 1), 2000);
          return;
        } else {
          setLocationError(
            "Unable to get your current location. Location services may still be initializing. Please try again.",
          );
        }
      } else if (error.message?.includes("Location request timed out")) {
        setLocationError(
          "Location request timed out. Please check your GPS signal and try again.",
        );
      } else {
        setLocationError(
          "Unable to get your current location. Using default location (Manila).",
        );
      }
    } finally {
      // Even if location fails, allow the user to type the address
      setShowAddressInput(true);
      setIsLocationLoading(false);
    }
  }, []);

  // Initialize from params or formStore; else fetch location
  useEffect(() => {
    // If coming from create-profile, still use formStore but only for address data
    const isFromCreateProfile = returnTo === "create-profile";

    // If the caller explicitly asked to suppress store fallback (fresh signup with no address),
    // do not hydrate from formStore.
    const suppressStoreFallback =
      (params.suppressStoreFallback as string) === "1" ||
      (params.suppressStoreFallback as string) === "true";

    // Clear any persisted barangay selection ONLY for brand-new users (not from create-profile)
    // selector starts empty and does not show stale values.
    if (suppressStoreFallback && !isFromCreateProfile) {
      if (formStore.getBarangayId() !== null || formStore.getBarangayName()) {
        formStore.setBarangayId(null);
        formStore.setBarangayName("");
      }
    }

    const hasParams = !!(
      params.address ||
      (params.latitude && params.longitude)
    );
    const hasStore = suppressStoreFallback
      ? false
      : !!(
          formStore.getAddress() ||
          (formStore.getLatitude() && formStore.getLongitude())
        );

    // If params are present, prefer them but try to fill any missing
    // coordinates from the formStore so the previously-set pin is preserved
    // when navigating back-and-forth (common on web).
    if (hasParams) {
      setIsLocationLoading(false);

      // If params include coords, use them. Otherwise fall back to formStore or get current location.
      if (params.latitude && params.longitude) {
        const lat = parseFloat(params.latitude as string);
        const lng = parseFloat(params.longitude as string);
        if (!isNaN(lat) && !isNaN(lng)) {
          setMarkerCoordinate([lng, lat]);
          setShowAddressInput(true);
        }
      } else {
        const lat = parseFloat(formStore.getLatitude());
        const lng = parseFloat(formStore.getLongitude());
        if (!isNaN(lat) && !isNaN(lng)) {
          setMarkerCoordinate([lng, lat]);
          setShowAddressInput(true);
        } else {
          // No coordinates available, get current location
          getCurrentLocation();
          // Don't return early, getCurrentLocation will handle the rest
          if (params.address) {
            const addr = params.address as string;
            setDetailedAddress(addr);
            formStore.setAddress(addr);
          }
          return;
        }
      }

      // Populate detailedAddress from params if available, otherwise from store
      if (params.address) {
        const addr = params.address as string;
        setDetailedAddress(addr);
        formStore.setAddress(addr);
      } else {
        const addr = formStore.getAddress();
        if (addr) setDetailedAddress(addr);
      }

      return;
    }

    if (hasStore) {
      const lat = parseFloat(formStore.getLatitude());
      const lng = parseFloat(formStore.getLongitude());
      if (!isNaN(lat) && !isNaN(lng)) {
        setMarkerCoordinate([lng, lat]);
        setShowAddressInput(true);
      }
      const addr = formStore.getAddress();
      if (addr) setDetailedAddress(addr);
      setIsLocationLoading(false);
    } else {
      getCurrentLocation();
    }
  }, [
    getCurrentLocation,
    params.address,
    params.latitude,
    params.longitude,
    params.suppressStoreFallback,
    returnTo,
  ]);

  // Pre-fill address and pin if data exists from params
  useEffect(() => {
    if (params.address) {
      const addr = params.address as string;
      setDetailedAddress(addr);
      formStore.setAddress(addr);
    }
    if (params.latitude && params.longitude) {
      const lat = parseFloat(params.latitude as string);
      const lng = parseFloat(params.longitude as string);
      if (!isNaN(lat) && !isNaN(lng)) {
        setMarkerCoordinate([lng, lat]);
        formStore.setLatitude(String(lat));
        formStore.setLongitude(String(lng));
      }
    }
    if (params.address || (params.latitude && params.longitude)) {
      setShowAddressInput(true);
      setIsLocationLoading(false); // Stop loading since we're not fetching current location
    }
  }, [params.address, params.latitude, params.longitude]);

  const handleMapPress = (feature: any) => {
    const { geometry } = feature;
    if (geometry && geometry.coordinates) {
      const [longitude, latitude] = geometry.coordinates;
      setMarkerCoordinate([longitude, latitude]);
      formStore.setLatitude(String(latitude));
      formStore.setLongitude(String(longitude));
      setShowAddressInput(true);
    }
  };

  const handleConfirmAddress = () => {
    const finalAddress = detailedAddress.trim();

    if (!finalAddress) {
      setErrorModal({
        visible: true,
        title: "Missing Address",
        message: "Please enter your address details.",
      });
      return;
    }

    // Persist to formStore before navigating so web parent pages that read the
    // store will see the latest values even if params are noisy or not applied.
    formStore.setAddress(finalAddress);
    formStore.setLatitude(markerCoordinate[1].toString());
    formStore.setLongitude(markerCoordinate[0].toString());
    formStore.setLocationDisplayName(finalAddress);
    console.debug("Confirming address, persisted to formStore:", {
      finalAddress,
      lat: markerCoordinate[1],
      lng: markerCoordinate[0],
    });

    // Return to tell-us-about onboarding screen
    router.replace({
      pathname: "./tell-us-about",
      params: {
        ...params,
        address: finalAddress,
        latitude: markerCoordinate[1].toString(),
        longitude: markerCoordinate[0].toString(),
        locationDisplayName: finalAddress,
        barangayId: formStore.getBarangayId() ?? undefined,
        barangayName: formStore.getBarangayName() || undefined,
      },
    });
  };

  const handleGetMyLocation = () => {
    getCurrentLocation();
  };

  const handleRetryLocation = () => {
    getCurrentLocation();
  };

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <View className="flex-1 bg-physio-light">
        {/* Error Modal */}
        <Modal
          visible={errorModal.visible}
          transparent
          animationType="fade"
          onRequestClose={() =>
            setErrorModal({ visible: false, title: "", message: "" })
          }
        >
          <View className="flex-1 justify-center items-center bg-black/50 px-6">
            <View className="bg-white rounded-3xl p-6 w-full max-w-sm">
              <View className="items-center mb-4">
                <View className="w-14 h-14 rounded-full bg-red-100 items-center justify-center mb-3">
                  <Ionicons name="alert-circle" size={32} color="#EF4444" />
                </View>
                <Text className="text-xl font-bold text-gray-900 text-center">
                  {errorModal.title}
                </Text>
              </View>
              <Text className="text-base text-gray-600 text-center mb-6">
                {errorModal.message}
              </Text>
              <TouchableOpacity
                onPress={() =>
                  setErrorModal({ visible: false, title: "", message: "" })
                }
                className="bg-physio-primary py-3.5 rounded-xl"
                activeOpacity={0.8}
              >
                <Text className="text-white text-center font-semibold text-base">
                  OK
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* Top Safe-Area Back Button (only for non-side layout) */}
        {!useSideLayout && (
          <SafeAreaView
            edges={["top"]}
            className="absolute top-0 left-0 right-0 z-50 px-5 pt-2"
          >
            <TouchableOpacity
              className="self-start bg-white/90 px-3 py-2.5 rounded-xl flex-row items-center"
              style={{
                elevation: 4,
                shadowColor: "#000",
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.1,
                shadowRadius: 4,
              }}
              onPress={() => router.back()}
            >
              <ArrowLeft size={20} color="#0e7468" />
              <Text className="text-physio-dark font-semibold ml-2">Back</Text>
            </TouchableOpacity>
          </SafeAreaView>
        )}

        {useSideLayout ? (
          // Web wide layout: left panel with details, right side map
          <View style={styles.webLayout}>
            <View style={styles.webLeftPanel}>
              <View
                className="bg-white/90 rounded-2xl border border-white/50 p-5 w-full max-w-md"
                style={{
                  elevation: 6,
                  shadowColor: "#000",
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.15,
                  shadowRadius: 6,
                }}
              >
                <TouchableOpacity
                  className="flex-row items-center mb-4"
                  onPress={() => router.back()}
                >
                  <ArrowLeft size={20} color="#0e7468" />
                  <Text className="text-physio-dark font-semibold ml-2">
                    Back
                  </Text>
                </TouchableOpacity>

                {/* Logo */}
                <View className="flex-row justify-center mb-6">
                  <View className="flex-row items-center gap-2">
                    <View
                      className="bg-physio-primary p-2 rounded-lg items-center justify-center"
                      style={{ width: 36, height: 36 }}
                    >
                      <FontAwesome5
                        name="hand-holding-heart"
                        size={18}
                        color="white"
                      />
                    </View>
                    <Text className="text-xl font-bold text-gray-800 tracking-tight">
                      Agapay
                    </Text>
                  </View>
                </View>

                <Text className="text-xl font-bold text-gray-900 text-center mb-2">
                  Address Details
                </Text>
                <Text className="text-gray-500 text-sm text-center mb-5">
                  Enter your address and move the pin to the location
                </Text>
                <View>
                  <Text className="text-xs font-semibold text-gray-700 mb-2 uppercase tracking-wide">
                    Your Complete Address
                  </Text>
                  <TextInput
                    value={detailedAddress}
                    onChangeText={(text) => {
                      setDetailedAddress(text);
                      formStore.setAddress(text);
                    }}
                    className="bg-white border border-gray-200 rounded-xl p-3.5 text-gray-900 text-base mb-4"
                    returnKeyType="done"
                    blurOnSubmit={true}
                  />
                  <BarangaySelector />
                  <TouchableOpacity
                    className={`w-full py-3.5 rounded-xl items-center mt-5 ${
                      detailedAddress.trim()
                        ? "bg-physio-primary"
                        : "bg-gray-300"
                    }`}
                    onPress={handleConfirmAddress}
                    disabled={!detailedAddress.trim()}
                    activeOpacity={0.8}
                  >
                    <Text className="text-white font-bold text-base">
                      Confirm Address
                    </Text>
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
                          formStore.setLatitude(String(latitude));
                          formStore.setLongitude(String(longitude));
                          setShowAddressInput(true);
                        }
                      }}
                    >
                      <View style={styles.markerContainer}>
                        <Feather name="map-pin" size={30} color="#089769" />
                      </View>
                    </Mapbox.PointAnnotation>
                  </Mapbox.MapView>
                ) : (
                  <WebMap
                    style={styles.map}
                    center={markerCoordinate}
                    onChange={(lng: number, lat: number) => {
                      setMarkerCoordinate([lng, lat]);
                      formStore.setLatitude(String(lat));
                      formStore.setLongitude(String(lng));
                      setShowAddressInput(true);
                    }}
                    zoom={15}
                  />
                )}

                {/* Location Button */}
                <TouchableOpacity
                  className="absolute bottom-5 right-5 bg-white w-12 h-12 rounded-full items-center justify-center border border-gray-200"
                  style={{
                    bottom: safeFloatingBottom,
                    elevation: 4,
                    shadowColor: "#000",
                    shadowOffset: { width: 0, height: 2 },
                    shadowOpacity: 0.2,
                    shadowRadius: 4,
                  }}
                  onPress={handleGetMyLocation}
                >
                  <Feather name="crosshair" size={24} color="#089769" />
                </TouchableOpacity>

                {/* Error */}
                {locationError && (
                  <View
                    style={[styles.errorContainer, { top: insets.top + 16 }]}
                  >
                    <View style={styles.errorBox}>
                      <Ionicons name="warning" size={24} color="#DC3545" />
                      <Text style={styles.errorText}>{locationError}</Text>
                      <TouchableOpacity
                        className="bg-physio-primary px-4 py-2 rounded-lg"
                        onPress={handleRetryLocation}
                      >
                        <Text className="text-white font-medium text-sm">
                          Retry
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}

                {/* Loading */}
                {isLocationLoading && (
                  <View style={styles.loadingOverlay}>
                    <ActivityIndicator size="large" color="#089769" />
                    <Text className="mt-2 text-physio-primary font-medium text-base">
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
                        formStore.setLatitude(String(latitude));
                        formStore.setLongitude(String(longitude));
                        setShowAddressInput(true);
                      }
                    }}
                  >
                    <View style={styles.markerContainer}>
                      <Feather name="map-pin" size={30} color="#089769" />
                    </View>
                  </Mapbox.PointAnnotation>
                </Mapbox.MapView>
              ) : (
                <WebMap
                  style={styles.map}
                  center={markerCoordinate}
                  onChange={(lng: number, lat: number) => {
                    setMarkerCoordinate([lng, lat]);
                    formStore.setLatitude(String(lat));
                    formStore.setLongitude(String(lng));
                    setShowAddressInput(true);
                  }}
                  zoom={15}
                />
              )}

              {/* Location Button */}
              <TouchableOpacity
                className="absolute bottom-5 right-5 bg-white w-12 h-12 rounded-full items-center justify-center border border-gray-200"
                style={{
                  bottom: safeFloatingBottom,
                  elevation: 4,
                  shadowColor: "#000",
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.2,
                  shadowRadius: 4,
                }}
                onPress={handleGetMyLocation}
              >
                <Feather name="crosshair" size={24} color="#089769" />
              </TouchableOpacity>

              {/* Instructions */}
              {!useSideLayout && !showAddressInput && !locationError && (
                <View
                  style={[
                    styles.instructionsContainer,
                    { top: insets.top + 16 },
                  ]}
                >
                  <View
                    className="bg-white px-5 py-4 rounded-xl flex-row items-center"
                    style={{
                      elevation: 4,
                      shadowColor: "#000",
                      shadowOffset: { width: 0, height: 2 },
                      shadowOpacity: 0.1,
                      shadowRadius: 4,
                    }}
                  >
                    <Feather name="info" size={20} color="#089769" />
                    <Text className="text-gray-700 ml-3 font-medium text-base">
                      Tap on the map to pin your location.
                    </Text>
                  </View>
                </View>
              )}

              {/* Error */}
              {locationError && (
                <View style={[styles.errorContainer, { top: insets.top + 16 }]}>
                  <View style={styles.errorBox}>
                    <Ionicons name="warning" size={24} color="#DC3545" />
                    <Text style={styles.errorText}>{locationError}</Text>
                    <TouchableOpacity
                      className="bg-physio-primary px-4 py-2 rounded-lg"
                      onPress={handleRetryLocation}
                    >
                      <Text className="text-white font-medium text-sm">
                        Retry
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {/* Loading */}
              {isLocationLoading && (
                <View style={styles.loadingOverlay}>
                  <ActivityIndicator size="large" color="#089769" />
                  <Text className="mt-2 text-physio-primary font-medium text-base">
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
              className="bg-white/95 rounded-t-3xl border-t border-white/50"
            >
              <PanGestureHandler
                onGestureEvent={onGestureEvent}
                onEnded={onGestureEnd}
              >
                <View style={styles.dragHandleArea}>
                  <View className="w-16 h-1.5 rounded-full bg-gray-300 self-center my-2" />
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
                <Text className="text-xl font-bold text-gray-900 text-center mt-5 mb-2">
                  Address Details
                </Text>
                <Text className="text-gray-500 text-sm text-center mb-5">
                  {isExpanded
                    ? "Enter your address and move the pin to the location"
                    : "Tap on the map to pin your location and enter address details"}
                </Text>

                {/* Show input only after pinning */}
                {isExpanded && (
                  <View style={styles.inputGroup}>
                    <Text className="text-xs font-semibold text-gray-700 mb-2 uppercase tracking-wide">
                      Your Complete Address
                    </Text>
                    <TextInput
                      value={detailedAddress}
                      onChangeText={(text) => {
                        setDetailedAddress(text);
                        formStore.setAddress(text);
                      }}
                      className="bg-white border border-gray-200 rounded-xl p-3.5 text-gray-900 text-base mb-4"
                      returnKeyType="done"
                      blurOnSubmit={true}
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
                    {/* Barangay Selector */}
                    <BarangaySelector />

                    {/* Confirm Button - Inline with form */}
                    <TouchableOpacity
                      className={`w-full py-3.5 rounded-xl items-center mt-5 ${
                        detailedAddress.trim()
                          ? "bg-physio-primary"
                          : "bg-gray-300"
                      }`}
                      onPress={handleConfirmAddress}
                      disabled={!detailedAddress.trim()}
                      activeOpacity={0.8}
                    >
                      <Text className="text-white font-bold text-base">
                        Confirm Address
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
              </ScrollView>
            </Animated.View>
          </>
        )}
      </View>
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
    // Removed shadow/border for cleaner look
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#F0F0F0",
    backgroundColor: "#FFFFFF",
    zIndex: 1000,
  },
  backButton: {
    padding: 4,
  },
  title: {
    flex: 1,
    fontSize: 18,
    fontWeight: "600",
    color: "#000",
    textAlign: "center",
    marginHorizontal: 16,
  },
  resetButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  resetButtonText: {
    fontSize: 16,
    color: "#0D9488",
    fontWeight: "500",
  },
  headerSpacer: {
    width: 32,
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
  instructionsContainer: {
    position: "absolute",
    top: 20,
    left: 20,
    right: 20,
    alignItems: "center",
  },
  instructionsBox: {
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  instructionsText: {
    fontSize: 16,
    color: "#333",
    marginLeft: 12,
    fontWeight: "500",
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
  keyboardAvoidingContainer: {
    flex: 1,
  },
  addressDetailsContainer: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    elevation: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
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
  // Web-wide layout styles
  webLayout: {
    flex: 1,
    flexDirection: "row",
    position: "relative",
  },
  webLeftPanel: {
    // Make the left panel an overlay instead of occupying layout width
    position: "absolute",
    top: 16,
    left: 16,
    width: 420,
    backgroundColor: "transparent",
    alignItems: "stretch",
    zIndex: 10,
  },
  webMapRight: {
    // Make the map fill the entire layout area to avoid any right-side gap
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
    // Removed shadow/border to match requested style
  },
  backButtonText: {
    color: "#0D9488",
    fontSize: 16,
    fontWeight: "500",
    marginLeft: 8,
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
  buttonContainer: {
    paddingHorizontal: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "#F0F0F0",
  },
  confirmButton: {
    backgroundColor: "#0D9488",
    paddingVertical: 18,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 20,
  },
  confirmButtonDisabled: {
    backgroundColor: "#B0B0B0",
  },
  confirmButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  expandedContainer: {
    maxHeight: "60%",
  },
  collapsedScroll: {
    paddingBottom: 20,
  },
  expandedScroll: {
    paddingBottom: 100,
  },
});

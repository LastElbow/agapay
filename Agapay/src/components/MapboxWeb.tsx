import React, { useEffect, useMemo } from "react";
import { Platform, StyleProp, StyleSheet, View, ViewStyle } from "react-native";
import Constants from "expo-constants";

type Props = {
  latitude: number;
  longitude: number;
  zoom?: number;
  styleURL?: string;
  style?: StyleProp<ViewStyle>;
};

// Lightweight web-only Mapbox GL JS wrapper.
// Renders nothing on native platforms.
export default function MapboxWeb({
  latitude,
  longitude,
  zoom = 15,
  styleURL = "mapbox://styles/mapbox/streets-v12",
  style,
}: Props) {
  const containerId = useMemo(
    () => `mapbox-web-${Math.random().toString(36).slice(2)}`,
    []
  );

  useEffect(() => {
    if (Platform.OS !== "web") return;
    let map: any;
    let marker: any;
    let disposed = false;

    (async () => {
      try {
        const mapboxgl = await import("mapbox-gl");
        // Access token from app config extras
        const token = (Constants.expoConfig as any)?.extra?.mapboxAccessToken;
        mapboxgl.accessToken = token || "";
        if (!mapboxgl.accessToken) {
          console.warn("Mapbox access token missing for web map.");
        }

        if (disposed) return;

        map = new mapboxgl.Map({
          container: containerId,
          style: styleURL,
          center: [longitude, latitude],
          zoom,
          attributionControl: false,
        });

        map.on("load", () => {
          marker = new mapboxgl.Marker().setLngLat([longitude, latitude]).addTo(map);
        });
      } catch (err) {
        console.error("Failed to initialize Mapbox web map", err);
      }
    })();

    return () => {
      disposed = true;
      try {
        if (marker && typeof marker.remove === "function") marker.remove();
      } catch {}
      try {
        if (map && typeof map.remove === "function") map.remove();
      } catch {}
    };
  }, [containerId, latitude, longitude, zoom, styleURL]);

  if (Platform.OS !== "web") {
    return null;
  }

  return <View nativeID={containerId} style={[styles.container, style]} />;
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
    height: 140,
    overflow: "hidden",
    borderRadius: 12,
  },
});


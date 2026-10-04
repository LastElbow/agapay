import React, { useEffect, useRef } from "react";
import { View, ViewStyle } from "react-native";
import Constants from "expo-constants";

type Props = {
  center: [number, number];
  onChange?: (lng: number, lat: number) => void;
  style?: ViewStyle | ViewStyle[];
  zoom?: number;
};

export default function WebMap({ center, onChange, style, zoom = 15 }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const loadedRef = useRef<boolean>(false);
  const pendingCenterRef = useRef<[number, number] | null>(null);

  useEffect(() => {
    let cleanup: (() => void) | undefined;
    
    (async () => {
      const mapboxgl = (await import("mapbox-gl")).default;

      const token =
        (typeof process !== "undefined" &&
          (process.env as any)?.EXPO_PUBLIC_MAPBOX_TOKEN) ||
        (Constants.expoConfig as any)?.extra?.mapboxAccessToken;

      if (!token) {
        console.warn(
          "Mapbox token missing. Set EXPO_PUBLIC_MAPBOX_TOKEN or extra.mapboxAccessToken."
        );
      }

      mapboxgl.accessToken = token || "";
      // Optional: set worker URL for CSP/Metro environments
      try {
        // @ts-ignore
        if (!mapboxgl.workerUrl) {
          // Matches CSS in app/_layout.tsx
          // Falls back gracefully if not needed
          // @ts-ignore
          mapboxgl.workerUrl =
            "https://api.mapbox.com/mapbox-gl-js/v2.15.0/mapbox-gl-csp-worker.js";
        }
      } catch {}

      if (!containerRef.current) return;

      const map = new mapboxgl.Map({
        container: containerRef.current,
        style: "mapbox://styles/mapbox/streets-v12",
        center,
        zoom,
      });
      mapRef.current = map;

      const marker = new mapboxgl.Marker({ draggable: true })
        .setLngLat(center)
        .addTo(map);
      markerRef.current = marker;

      map.on("load", () => {
        loadedRef.current = true;
        if (pendingCenterRef.current) {
          const [lng, lat] = pendingCenterRef.current;
          marker.setLngLat([lng, lat]);
          map.flyTo({ center: [lng, lat], zoom, essential: true });
          pendingCenterRef.current = null;
        }
      });

      const handleClick = (e: any) => {
        const { lng, lat } = e.lngLat;
        marker.setLngLat([lng, lat]);
        onChange?.(lng, lat);
      };

      const handleDragEnd = () => {
        const pos = marker.getLngLat();
        onChange?.(pos.lng, pos.lat);
      };

      map.on("click", handleClick);
      marker.on("dragend", handleDragEnd);

      cleanup = () => {
        try {
          marker.off("dragend", handleDragEnd);
          map.off("click", handleClick);
          marker.remove();
          map.remove();
        } catch {}
      };
    })();

    return () => {
      cleanup?.();
    };
  }, []);

  // Sync external center updates
  useEffect(() => {
    const map = mapRef.current;
    const marker = markerRef.current;
    if (map && marker) {
      if (!loadedRef.current) {
        pendingCenterRef.current = center;
      } else {
        marker.setLngLat(center);
        map.flyTo({ center, zoom, essential: true });
      }
    } else {
      pendingCenterRef.current = center;
    }
  }, [center, zoom]);

  return (
    <View style={[{ flex: 1 }, style] as any}>
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />
    </View>
  );
}

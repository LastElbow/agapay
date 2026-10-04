import Mapbox from "@rnmapbox/maps";
import Constants from "expo-constants";
import { Platform } from "react-native";

if (
  Platform.OS !== "web" &&
  Mapbox &&
  typeof (Mapbox as any).setAccessToken === "function"
) {
  Mapbox.setAccessToken(
    (Constants.expoConfig as any)?.extra?.mapboxAccessToken || "",
  );
}

export const getMapboxToken = (): string | undefined => {
  const envToken =
    (typeof process !== "undefined" &&
      (process.env as any)?.EXPO_PUBLIC_MAPBOX_TOKEN) ||
    undefined;
  const extraToken = (Constants.expoConfig as any)?.extra?.mapboxAccessToken;
  return envToken || extraToken;
};

export type GeoLineString = {
  type: "Feature";
  geometry: { type: "LineString"; coordinates: [number, number][] };
  properties?: Record<string, any>;
};

export async function fetchDirections(
  from: [number, number],
  to: [number, number],
): Promise<GeoLineString | null> {
  const token = getMapboxToken();
  if (!token) return null;
  try {
    const url = `https://api.mapbox.com/directions/v5/mapbox/driving-traffic/${
      from[0]
    },${from[1]};${to[0]},${
      to[1]
    }?geometries=geojson&overview=full&access_token=${encodeURIComponent(
      token,
    )}`;
    const res = await fetch(url);
    const data = await res.json();
    const coords: [number, number][] =
      data?.routes?.[0]?.geometry?.coordinates || [];
    if (coords.length) {
      return {
        type: "Feature",
        geometry: { type: "LineString", coordinates: coords },
        properties: {},
      };
    }
  } catch (e) {
    console.warn("Failed to fetch directions", e);
  }
  return null;
}

export async function geocodeAddress(
  address: string,
): Promise<[number, number] | null> {
  const token = getMapboxToken();
  if (!token) return null;
  try {
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
      address,
    )}.json?access_token=${encodeURIComponent(token)}&limit=1`;
    const res = await fetch(url);
    const data = await res.json();
    const center = data?.features?.[0]?.center;
    if (Array.isArray(center) && center.length >= 2) {
      return center as [number, number];
    }
  } catch (e) {
    console.warn("Failed to geocode address", e);
  }
  return null;
}

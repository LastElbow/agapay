import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Mapbox from "@rnmapbox/maps";
import * as Location from "expo-location";
import { ChevronRight, MapPin } from "lucide-react-native";
import { requestLocationPermissionWithDisclosure } from "@/src/utils/locationPermission";
import {
  fetchDirections,
  geocodeAddress,
  getMapboxToken,
  type GeoLineString,
} from "./mapboxDirections";

export default function EmbeddedLocationMap(props: {
  dest: [number, number] | null;
  address?: string;
  onOpenFullMap: () => void;
  /** When true, hides route toggle (patient viewing their own location) */
  isPatient?: boolean;
  /** Optional: passed by the session screen; not used by this embedded map implementation */
  therapistSavedLocation?: [number, number] | null;
  /** Optional: passed by the session screen; not used by this embedded map implementation */
  patientSavedLocation?: [number, number] | null;
}) {
  const {
    dest,
    address,
    onOpenFullMap,
    isPatient = false,
    therapistSavedLocation,
  } = props;
  const [me, setMe] = useState<[number, number] | null>(null);
  const [route, setRoute] = useState<GeoLineString | null>(null);
  const [showRoute, setShowRoute] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isFetchingRoute, setIsFetchingRoute] = useState(false);
  const [geocodedDest, setGeocodedDest] = useState<[number, number] | null>(
    null,
  );

  // Use either provided dest or geocoded dest
  const finalDest = dest || geocodedDest;

  // Geocode address if dest is missing
  useEffect(() => {
    if (dest || !address) return;
    let cancelled = false;
    (async () => {
      // Don't set global loading true here to avoid flickering entire map component if we want
      // but we do want to show loading state if we are waiting for location
      const coords = await geocodeAddress(address);
      if (!cancelled && coords) {
        setGeocodedDest(coords);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dest, address]);

  // Get current location
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const hasServices = await Location.hasServicesEnabledAsync();
        if (hasServices) {
          const { status } = await requestLocationPermissionWithDisclosure();
          if (status === "granted") {
            const current = await Location.getCurrentPositionAsync({
              accuracy: Location.Accuracy.Balanced,
            });
            if (!cancelled) {
              setMe([current.coords.longitude, current.coords.latitude]);
            }
          }
        }
      } catch (e) {
        console.warn("Failed to get location", e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  // For routing: prioritize GPS (me) over saved location as fallback
  const routeFromLocation = me ?? therapistSavedLocation;

  // Fetch route when showRoute is toggled - use GPS or saved therapist location
  useEffect(() => {
    if (isPatient || !showRoute || !routeFromLocation || !finalDest) {
      setRoute(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setIsFetchingRoute(true);
      const r = await fetchDirections(routeFromLocation, finalDest);
      if (!cancelled) {
        setRoute(r);
        setIsFetchingRoute(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    showRoute,
    routeFromLocation?.[0],
    routeFromLocation?.[1],
    finalDest?.[0],
    finalDest?.[1],
  ]);

  if (Platform.OS === "web") {
    return (
      <EmbeddedLocationMapWeb
        dest={dest}
        address={address}
        onOpenFullMap={onOpenFullMap}
        isPatient={isPatient}
        therapistSavedLocation={therapistSavedLocation}
      />
    );
  }

  if (!finalDest) {
    return (
      <View style={mapStyles.container}>
        <View style={mapStyles.noLocation}>
          <MapPin color="#9CA3AF" size={24} />
          <Text style={mapStyles.noLocationText}>
            {address ? "Loading location..." : "No location available"}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={mapStyles.container}>
      <View style={mapStyles.mapWrap}>
        <Mapbox.MapView
          style={StyleSheet.absoluteFill}
          logoEnabled={false}
          scrollEnabled={false}
          zoomEnabled={false}
        >
          <Mapbox.Camera
            {...(() => {
              if (finalDest && me && showRoute) {
                const minLng = Math.min(me[0], finalDest[0]);
                const minLat = Math.min(me[1], finalDest[1]);
                const maxLng = Math.max(me[0], finalDest[0]);
                const maxLat = Math.max(me[1], finalDest[1]);
                return {
                  bounds: {
                    ne: [maxLng, maxLat] as [number, number],
                    sw: [minLng, minLat] as [number, number],
                    paddingLeft: 30,
                    paddingRight: 30,
                    paddingTop: 30,
                    paddingBottom: 30,
                  },
                  animationMode: "flyTo" as const,
                  animationDuration: 600,
                };
              }
              return {
                centerCoordinate: finalDest as [number, number],
                zoomLevel: 14,
                animationMode: "moveTo" as const,
              };
            })()}
          />

          {/* Location pin - green (matching full map) */}
          {finalDest ? (
            <Mapbox.PointAnnotation id="dest" coordinate={finalDest}>
              <View style={mapStyles.pinWrap}>
                <MapPin
                  color="#089769"
                  size={36}
                  fill="#10B981"
                  strokeWidth={3}
                />
              </View>
            </Mapbox.PointAnnotation>
          ) : null}

          {/* Current location marker - only show for therapists */}
          {!isPatient && me ? (
            <Mapbox.PointAnnotation id="me" coordinate={me}>
              <View style={mapStyles.meDot} />
            </Mapbox.PointAnnotation>
          ) : null}

          {/* Route line */}
          {showRoute && route ? (
            <Mapbox.ShapeSource id="route" shape={route as any}>
              <Mapbox.LineLayer
                id="route-line"
                style={{
                  lineColor: "#089769",
                  lineWidth: 4,
                  lineCap: "round",
                  lineJoin: "round",
                }}
              />
            </Mapbox.ShapeSource>
          ) : showRoute && me && finalDest ? (
            <Mapbox.ShapeSource
              id="straight"
              shape={
                {
                  type: "Feature",
                  geometry: {
                    type: "LineString",
                    coordinates: [me, finalDest],
                  },
                  properties: {},
                } as any
              }
            >
              <Mapbox.LineLayer
                id="straight-line"
                style={{
                  lineColor: "#6B7280",
                  lineWidth: 3,
                }}
              />
            </Mapbox.ShapeSource>
          ) : null}
        </Mapbox.MapView>

        {loading ? (
          <View style={mapStyles.loadingOverlay}>
            <ActivityIndicator size="small" color="#089769" />
          </View>
        ) : null}

        {/* Route toggle button - only show for therapists */}
        {!isPatient && me && (
          <View style={mapStyles.routeToggleWrap}>
            <TouchableOpacity
              style={[
                mapStyles.routeBtn,
                showRoute && mapStyles.routeBtnActive,
              ]}
              onPress={() => setShowRoute((s) => !s)}
            >
              <Text
                style={[
                  mapStyles.routeBtnText,
                  showRoute && mapStyles.routeBtnTextActive,
                ]}
              >
                {isFetchingRoute
                  ? "Loading..."
                  : showRoute
                    ? "Hide Route"
                    : "Show Route"}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Open full map button */}
      <TouchableOpacity style={mapStyles.openMapBtn} onPress={onOpenFullMap}>
        <MapPin color="#089769" size={16} />
        <Text style={mapStyles.openMapBtnText}>Open Full Map</Text>
        <ChevronRight color="#089769" size={16} />
      </TouchableOpacity>
    </View>
  );
}

// Web version of embedded map
function EmbeddedLocationMapWeb({
  dest,
  address,
  onOpenFullMap,
  isPatient = false,
  therapistSavedLocation,
}: {
  dest: [number, number] | null;
  address?: string;
  onOpenFullMap: () => void;
  /** When true, hides route toggle (patient viewing their own location) */
  isPatient?: boolean;
  therapistSavedLocation?: [number, number] | null;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const destMarkerRef = useRef<any>(null);
  const meMarkerRef = useRef<any>(null);
  const [me, setMe] = useState<[number, number] | null>(null);
  const [showRoute, setShowRoute] = useState(false);
  const [isFetchingRoute, setIsFetchingRoute] = useState(false);
  const routeLayerId = useRef<string>(
    `route-${Math.random().toString(36).slice(2)}`,
  );
  const [geocodedDest, setGeocodedDest] = useState<[number, number] | null>(
    null,
  );
  const [loading, setLoading] = useState(false);

  // Safety: never allow routes in patient view
  useEffect(() => {
    if (isPatient) setShowRoute(false);
  }, [isPatient]);

  // Use either provided dest or geocoded dest
  const finalDest = dest || geocodedDest;

  // Route source: prioritize GPS (me), fall back to therapistSavedLocation
  const routeFromLocation = me || therapistSavedLocation;

  // Geocode address if dest is missing
  useEffect(() => {
    if (dest || !address) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const coords = await geocodeAddress(address);
      if (!cancelled && coords) {
        setGeocodedDest(coords);
      }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [dest, address]);

  useEffect(() => {
    let cleanup: (() => void) | undefined;
    let cancelled = false;
    (async () => {
      if (!finalDest) return; // Don't init map without dest

      const mapboxgl = (await import("mapbox-gl")).default;
      const token = getMapboxToken();
      if (!token) console.warn("Mapbox token missing for web map");
      mapboxgl.accessToken = token || "";

      if (!containerRef.current || cancelled) return;

      const center = finalDest;
      const map = new mapboxgl.Map({
        container: containerRef.current,
        style: "mapbox://styles/mapbox/streets-v12",
        center,
        zoom: 14,
        interactive: false,
      });

      // Wait for map to load before setting ref
      map.on("load", () => {
        if (!cancelled) {
          mapRef.current = map;
        }
      });

      // Add destination marker - larger and more visible green pin (matching full map)
      if (finalDest) {
        const el = document.createElement("div");
        el.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#089769" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" fill="#10B981" fill-opacity="0.3"/><circle cx="12" cy="10" r="3" fill="#089769"/></svg>`;
        const marker = new mapboxgl.Marker({ element: el })
          .setLngLat(finalDest)
          .addTo(map);
        destMarkerRef.current = marker;
      }

      // Add therapist saved location marker (blue dot) if available
      if (!isPatient && therapistSavedLocation) {
        const el = document.createElement("div");
        el.style.width = "12px";
        el.style.height = "12px";
        el.style.borderRadius = "50%";
        el.style.backgroundColor = "#2563EB";
        el.style.border = "2px solid white";
        const marker = new mapboxgl.Marker({ element: el })
          .setLngLat(therapistSavedLocation)
          .addTo(map);
        // We don't save refs to static markers unless we need to update them
      }

      // Get current location - only show for therapists
      if (!isPatient && navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            if (cancelled || !mapRef.current) return;
            const coords: [number, number] = [
              pos.coords.longitude,
              pos.coords.latitude,
            ];
            setMe(coords);
            const el = document.createElement("div");
            el.style.width = "12px";
            el.style.height = "12px";
            el.style.borderRadius = "50%";
            el.style.backgroundColor = "#089769";
            el.style.border = "2px solid white";
            // Replace static saved marker with live marker if we wanted,
            // but here we just add current location marker separately or overlay it
            const marker = new mapboxgl.Marker({ element: el })
              .setLngLat(coords)
              .addTo(mapRef.current);
            meMarkerRef.current = marker;
          },
          () => {},
        );
      }

      cleanup = () => {
        destMarkerRef.current?.remove();
        meMarkerRef.current?.remove();
        map.remove();
      };
    })();

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [
    finalDest?.[0],
    finalDest?.[1],
    isPatient,
    therapistSavedLocation?.[0],
    therapistSavedLocation?.[1],
  ]);

  // Handle route display
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.loaded()) return;

    // If showRoute is false or we don't have required data, remove the route
    if (!showRoute || !routeFromLocation || !finalDest) {
      if (map.getLayer(routeLayerId.current)) {
        map.removeLayer(routeLayerId.current);
      }
      if (map.getSource(routeLayerId.current)) {
        map.removeSource(routeLayerId.current);
      }
      setIsFetchingRoute(false);
      return;
    }

    let cancelled = false;
    (async () => {
      setIsFetchingRoute(true);
      const route = await fetchDirections(routeFromLocation, finalDest);
      if (cancelled || !map) return;
      setIsFetchingRoute(false);

      if (route) {
        // Remove existing route layer/source if it exists
        if (map.getLayer(routeLayerId.current)) {
          map.removeLayer(routeLayerId.current);
        }
        if (map.getSource(routeLayerId.current)) {
          map.removeSource(routeLayerId.current);
        }

        // Add new route
        map.addSource(routeLayerId.current, { type: "geojson", data: route });
        map.addLayer({
          id: routeLayerId.current,
          type: "line",
          source: routeLayerId.current,
          paint: {
            "line-color": "#089769",
            "line-width": 4,
          },
        });

        // Fit bounds
        const coords = route.geometry.coordinates;
        const lngs = coords.map((c) => c[0]);
        const lats = coords.map((c) => c[1]);
        map.fitBounds(
          [
            [Math.min(...lngs), Math.min(...lats)],
            [Math.max(...lngs), Math.max(...lats)],
          ],
          { padding: 40 },
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    showRoute,
    routeFromLocation?.[0],
    routeFromLocation?.[1],
    finalDest?.[0],
    finalDest?.[1],
  ]);

  if (!finalDest) {
    if (loading) {
      return (
        <View style={mapStyles.container}>
          <View style={mapStyles.noLocation}>
            <ActivityIndicator size="small" color="#089769" />
            <Text style={mapStyles.noLocationText}>Loading location...</Text>
          </View>
        </View>
      );
    }
    return (
      <View style={mapStyles.container}>
        <View style={mapStyles.noLocation}>
          <MapPin color="#9CA3AF" size={24} />
          <Text style={mapStyles.noLocationText}>No location available</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={mapStyles.container}>
      <View style={mapStyles.mapWrap}>
        <div
          ref={containerRef as any}
          style={{ width: "100%", height: "100%" }}
        />

        {/* Route toggle button - only show for therapists if we have a FROM location */}
        {!isPatient && routeFromLocation && (
          <View style={mapStyles.routeToggleWrap}>
            <TouchableOpacity
              style={[
                mapStyles.routeBtn,
                showRoute && mapStyles.routeBtnActive,
              ]}
              onPress={() => setShowRoute((s) => !s)}
            >
              <Text
                style={[
                  mapStyles.routeBtnText,
                  showRoute && mapStyles.routeBtnTextActive,
                ]}
              >
                {isFetchingRoute
                  ? "Loading..."
                  : showRoute
                    ? "Hide Route"
                    : "Show Route"}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Open full map button */}
      <TouchableOpacity style={mapStyles.openMapBtn} onPress={onOpenFullMap}>
        <MapPin color="#089769" size={16} />
        <Text style={mapStyles.openMapBtnText}>Open Full Map</Text>
        <ChevronRight color="#089769" size={16} />
      </TouchableOpacity>
    </View>
  );
}

const mapStyles = StyleSheet.create({
  container: {
    // Used as inner wrapper - no borders as parent has them
  },
  mapWrap: {
    height: 180,
    position: "relative",
  },
  pinWrap: {
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "flex-start",
  },
  meDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#089769",
    borderWidth: 2,
    borderColor: "#fff",
  },
  loadingOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.7)",
  },
  noLocation: {
    height: 120,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F9FAFB",
  },
  noLocationText: {
    marginTop: 8,
    color: "#6B7280",
    fontSize: 14,
  },
  routeToggleWrap: {
    position: "absolute",
    right: 8,
    top: 8,
    zIndex: 10,
  },
  routeBtn: {
    backgroundColor: "#FFFFFF",
    borderColor: "#D1D5DB",
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  routeBtnActive: {
    backgroundColor: "#089769",
    borderColor: "#089769",
  },
  routeBtnText: {
    color: "#111827",
    fontWeight: "600",
    fontSize: 12,
  },
  routeBtnTextActive: {
    color: "#FFFFFF",
    fontWeight: "600",
  },
  openMapBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
    gap: 6,
  },
  openMapBtnText: {
    color: "#089769",
    fontWeight: "600",
    fontSize: 14,
  },
});


import React, { useEffect, useMemo, useRef, useState } from "react";
import {
    ActivityIndicator,
    Platform,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import Mapbox from "@rnmapbox/maps";
import Constants from "expo-constants";
import * as Location from "expo-location";
import { ChevronRight, MapPin } from "lucide-react-native";
import { TherapistLocationMarker } from "@/src/components/TherapistLocationMarker";

/**
 * Validate and sanitize coordinates to prevent NaN values from causing infinite re-renders.
 * NaN !== NaN is always true in JavaScript, which breaks React's dependency comparison.
 */
function sanitizeCoordinates(dest: [number, number] | null): [number, number] | null {
    if (!dest) return null;
    const [lng, lat] = dest;
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
        console.warn("[EmbeddedLocationMap] Invalid coordinates received:", dest);
        return null;
    }
    return dest;
}

// Initialize Mapbox access token on native
if (
    Platform.OS !== "web" &&
    Mapbox &&
    typeof (Mapbox as any).setAccessToken === "function"
) {
    Mapbox.setAccessToken(
        (Constants.expoConfig as any)?.extra?.mapboxAccessToken || ""
    );
}

const getMapboxToken = (): string | undefined => {
    const envToken =
        (typeof process !== "undefined" &&
            (process.env as any)?.EXPO_PUBLIC_MAPBOX_TOKEN) ||
        undefined;
    const extraToken = (Constants.expoConfig as any)?.extra?.mapboxAccessToken;
    return envToken || extraToken;
};

type GeoLineString = {
    type: "Feature";
    geometry: { type: "LineString"; coordinates: [number, number][] };
    properties?: Record<string, any>;
};

async function fetchDirections(
    from: [number, number],
    to: [number, number]
): Promise<GeoLineString | null> {
    const token = getMapboxToken();
    if (!token) return null;
    try {
        const url = `https://api.mapbox.com/directions/v5/mapbox/driving-traffic/${from[0]},${from[1]};${to[0]},${to[1]}?geometries=geojson&overview=full&access_token=${encodeURIComponent(token)}`;
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

// Web version of embedded map
function EmbeddedLocationMapWeb({
    dest,
    address,
    onOpenFullMap,
    isPatient = false,
    therapistSavedLocation,
    patientSavedLocation,
}: {
    dest: [number, number] | null;
    address?: string;
    onOpenFullMap: () => void;
    /** When true, hides route toggle (patient viewing their own location) - UNLESS opted in */
    isPatient?: boolean;
    /** Therapist's saved profile location [lng, lat] */
    therapistSavedLocation?: [number, number] | null;
    /** Patient's saved profile location [lng, lat] */
    patientSavedLocation?: [number, number] | null;
}) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const mapRef = useRef<any>(null);
    const destMarkerRef = useRef<any>(null);
    const therapistMarkerRef = useRef<any>(null);
    const [showRoute, setShowRoute] = useState(false);
    const [isFetchingRoute, setIsFetchingRoute] = useState(false);
    const routeLayerId = useRef<string>(`route-${Math.random().toString(36).slice(2)}`);

    // Safety: never allow routes in patient view
    useEffect(() => {
        if (isPatient) setShowRoute(false);
    }, [isPatient]);

    // Sanitize and stabilize coordinates to prevent NaN-induced infinite loops
    const validDest = useMemo(() => sanitizeCoordinates(dest), [dest?.[0], dest?.[1]]);
    const validTherapistLocation = useMemo(() => sanitizeCoordinates(therapistSavedLocation ?? null), [therapistSavedLocation?.[0], therapistSavedLocation?.[1]]);
    const validPatientLocation = useMemo(() => sanitizeCoordinates(patientSavedLocation ?? null), [patientSavedLocation?.[0], patientSavedLocation?.[1]]);
    // Use stable primitive values for dependencies (undefined instead of NaN)
    const destLng = validDest?.[0];
    const destLat = validDest?.[1];

    // Determine the primary focus location based on role
    // - For patients: focus on their own saved location
    // - For therapists: focus on therapist's saved location
    const focusLocation = isPatient
        ? (validPatientLocation ?? validDest)
        : (validTherapistLocation ?? validDest);

    // Debug logging for location data
    if (__DEV__) {
        console.log("[EmbeddedLocationMapWeb] Props received:", {
            isPatient,
            dest,
            validDest,
            therapistSavedLocation,
            patientSavedLocation,
            focusLocation,
            address,
        });
    }

    useEffect(() => {
        let cleanup: (() => void) | undefined;
        let cancelled = false;
        (async () => {
            const mapboxgl = (await import("mapbox-gl")).default;
            const token = getMapboxToken();
            if (!token) console.warn("Mapbox token missing for web map");
            mapboxgl.accessToken = token || "";

            if (!containerRef.current || cancelled) return;

            // Use calculated focus location, fallback to default if all else fails
            const center = focusLocation ?? [120.9842, 14.5995];

            const map = new mapboxgl.Map({
                container: containerRef.current,
                style: "mapbox://styles/mapbox/streets-v12",
                center,
                zoom: focusLocation ? 14 : 10,
                interactive: false,
            });

            // Wait for map to load before setting ref
            map.on('load', () => {
                if (!cancelled) {
                    mapRef.current = map;
                }
            });

            // Add patient location marker (Destination) - always green
            if (validDest) {
                const el = document.createElement("div");
                el.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#089769" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>`;
                const marker = new mapboxgl.Marker({ element: el })
                    .setLngLat(validDest)
                    .addTo(map);
                destMarkerRef.current = marker;
            }

            // Add therapist saved location marker
            // Show only for therapists
            const shouldShowTherapistMarker = !isPatient && validTherapistLocation;

            if (shouldShowTherapistMarker && validTherapistLocation) {
                const el = document.createElement("div");
                el.style.width = "12px";
                el.style.height = "12px";
                el.style.borderRadius = "50%";
                el.style.backgroundColor = "#2563EB";
                el.style.border = "2px solid white";
                const marker = new mapboxgl.Marker({ element: el })
                    .setLngLat(validTherapistLocation)
                    .addTo(map);
                therapistMarkerRef.current = marker;
            }

            cleanup = () => {
                destMarkerRef.current?.remove();
                therapistMarkerRef.current?.remove();
                map.remove();
            };
        })();

        return () => {
            cancelled = true;
            cleanup?.();
        };
    }, [destLng, destLat, isPatient, validDest, validTherapistLocation, showRoute, focusLocation]);

    // Handle route display - use therapist's saved location
    useEffect(() => {
        const map = mapRef.current;
        if (isPatient || !map || !map.loaded() || !showRoute || !validTherapistLocation || !validDest) return;

        let cancelled = false;

        const addRoute = async () => {
            setIsFetchingRoute(true);
            const route = await fetchDirections(validTherapistLocation, validDest);
            if (cancelled || !map) return;
            setIsFetchingRoute(false);

            if (route) {
                // Wait for map to be fully loaded before manipulating layers
                const updateRoute = () => {
                    if (map.getSource(routeLayerId.current)) {
                        (map.getSource(routeLayerId.current) as any).setData(route);
                    } else {
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
                    }

                    // Fit bounds
                    const coords = route.geometry.coordinates;
                    const lngs = coords.map((c) => c[0]);
                    const lats = coords.map((c) => c[1]);
                    map.fitBounds(
                        [
                            [Math.min(...lngs), Math.min(...lats)],
                            [Math.max(...lngs), Math.max(...lats)],
                        ],
                        { padding: 40 }
                    );
                };

                if (map.loaded()) {
                    updateRoute();
                } else {
                    map.once('load', updateRoute);
                }
            }
        };

        addRoute();

        return () => {
            cancelled = true;
        };
    }, [showRoute, validTherapistLocation?.[0], validTherapistLocation?.[1], destLng, destLat, validDest]);

    if (!validDest) {
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
                <div ref={containerRef as any} style={{ width: "100%", height: "100%" }} />
                {/* Route toggle button - only show for therapists */}
                {!isPatient && validTherapistLocation && (
                    <View style={mapStyles.routeToggleWrap}>
                        <TouchableOpacity
                            style={[mapStyles.routeBtn, showRoute && mapStyles.routeBtnActive]}
                            onPress={() => setShowRoute((s) => !s)}
                        >
                            <Text
                                style={[
                                    mapStyles.routeBtnText,
                                    showRoute && mapStyles.routeBtnTextActive,
                                ]}
                            >
                                {isFetchingRoute ? "Loading..." : showRoute ? "Hide Route" : "Show Route"}
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

// Embedded location map component for the location card
export default function EmbeddedLocationMap({
    dest,
    address,
    onOpenFullMap,
    isPatient = false,
    /** Therapist's saved profile location [lng, lat] - used for routing from therapist's saved location */
    therapistSavedLocation,
    /** Patient's saved profile location [lng, lat] - used as the session destination */
    patientSavedLocation,
}: {
    dest: [number, number] | null;
    address?: string;
    onOpenFullMap: () => void;
    /** When true, hides route toggle and focuses only on the destination (patient's own location) */
    isPatient?: boolean;
    /** Therapist's saved profile location [lng, lat] */
    therapistSavedLocation?: [number, number] | null;
    /** Patient's saved profile location [lng, lat] */
    patientSavedLocation?: [number, number] | null;
}) {
    const [route, setRoute] = useState<GeoLineString | null>(null);
    const [showRoute, setShowRoute] = useState(false);
    const [isFetchingRoute, setIsFetchingRoute] = useState(false);

    // Safety: never allow routes in patient view
    useEffect(() => {
        if (isPatient) setShowRoute(false);
    }, [isPatient]);

    // Sanitize and stabilize coordinates to prevent NaN-induced infinite loops
    const validDest = useMemo(() => sanitizeCoordinates(dest), [dest?.[0], dest?.[1]]);
    const validTherapistLocation = useMemo(() => sanitizeCoordinates(therapistSavedLocation ?? null), [therapistSavedLocation?.[0], therapistSavedLocation?.[1]]);
    const validPatientLocation = useMemo(() => sanitizeCoordinates(patientSavedLocation ?? null), [patientSavedLocation?.[0], patientSavedLocation?.[1]]);

    // Use stable primitive values for dependencies (undefined instead of NaN)
    const destLng = validDest?.[0];
    const destLat = validDest?.[1];

    // Determine the primary focus location based on role:
    // - For patients: focus on their own saved location
    // - For therapists: focus on therapist's saved location
    // Fallback to validDest (session location)
    const focusLocation = isPatient
        ? (validPatientLocation ?? validDest)
        : (validTherapistLocation ?? validDest);

    // For routing: use therapist's saved location as the "from" point instead of GPS
    const routeFromLocation = validTherapistLocation;

    // Fetch route when showRoute is toggled - use saved therapist location, not GPS
    useEffect(() => {
        if (isPatient || !showRoute || !routeFromLocation || !validDest) {
            setRoute(null);
            return;
        }
        let cancelled = false;
        (async () => {
            setIsFetchingRoute(true);
            const r = await fetchDirections(routeFromLocation, validDest);
            if (!cancelled) {
                setRoute(r);
                setIsFetchingRoute(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [showRoute, routeFromLocation?.[0], routeFromLocation?.[1], destLng, destLat, validDest]);

    if (Platform.OS === "web") {
        return (
            <EmbeddedLocationMapWeb
                dest={validDest}
                address={address}
                onOpenFullMap={onOpenFullMap}
                isPatient={isPatient}
                therapistSavedLocation={validTherapistLocation}
                patientSavedLocation={validPatientLocation}
            />
        );
    }

    if (!focusLocation) {
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
                <Mapbox.MapView style={StyleSheet.absoluteFill} logoEnabled={false} scrollEnabled={false} zoomEnabled={false}>
                    <Mapbox.Camera
                        {...(() => {
                            // When showing route, fit bounds to include both therapist and patient locations
                            if (validDest && routeFromLocation && showRoute) {
                                const minLng = Math.min(routeFromLocation[0], validDest[0]);
                                const minLat = Math.min(routeFromLocation[1], validDest[1]);
                                const maxLng = Math.max(routeFromLocation[0], validDest[0]);
                                const maxLat = Math.max(routeFromLocation[1], validDest[1]);
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
                            // Default focus based on user role
                            return {
                                centerCoordinate: focusLocation as [number, number],
                                zoomLevel: 14,
                                animationMode: "moveTo" as const,
                            };
                        })()}
                    />

                    {/* Patient location pin - always show in green */}
                    {validDest ? (
                        <Mapbox.PointAnnotation id="patient-location" coordinate={validDest}>
                            <View style={mapStyles.pinWrap}>
                                <MapPin color="#089769" size={24} />
                            </View>
                        </Mapbox.PointAnnotation>
                    ) : null}

                    {/* Therapist saved location marker - show as blue dot.
                        Show only for therapists */}
                    {!isPatient && routeFromLocation ? (
                        <Mapbox.PointAnnotation id="therapist-location" coordinate={routeFromLocation}>
                            <View style={mapStyles.meDot} />
                        </Mapbox.PointAnnotation>
                    ) : null}

                    {/* Route line - from therapist's saved location to patient's location */}
                    {!isPatient && showRoute && route ? (
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
                    ) : !isPatient && showRoute && routeFromLocation && validDest ? (
                        <Mapbox.ShapeSource
                            id="straight"
                            shape={{
                                type: "Feature",
                                geometry: { type: "LineString", coordinates: [routeFromLocation, validDest] },
                                properties: {},
                            } as any}
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

                {/* Route toggle button - only show for therapists */}
                {!isPatient && routeFromLocation && (
                    <View style={mapStyles.routeToggleWrap}>
                        <TouchableOpacity
                            style={[mapStyles.routeBtn, showRoute && mapStyles.routeBtnActive]}
                            onPress={() => setShowRoute((s) => !s)}
                        >
                            <Text
                                style={[
                                    mapStyles.routeBtnText,
                                    showRoute && mapStyles.routeBtnTextActive,
                                ]}
                            >
                                {isFetchingRoute ? "Loading..." : showRoute ? "Hide Route" : "Show Route"}
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

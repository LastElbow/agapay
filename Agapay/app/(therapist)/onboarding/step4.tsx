import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Alert,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowLeft } from "lucide-react-native";
import apiClient from "@/api/client";
import { therapistOnboardingStore } from "@/src/stores/therapistOnboardingStore";
import {
  buildTherapistOnboardingMultipartParts,
  joinBaseUrl,
  validateTherapistServiceAreasStep,
} from "@/src/features/onboarding/core/therapistSubmission";
import { useAuth } from "@/src/providers/AuthProvider";

type ServiceArea = { id: number; name: string };

export default function TherapistOnboarding4() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === "web" && width >= 768;
  const { accessToken, user, updateUser } = useAuth();
  const [serviceAreas, setServiceAreas] = useState<ServiceArea[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<number[]>(
    therapistOnboardingStore.serviceAreaIds ?? [],
  );
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false); // Control showing all items
  const INITIAL_DISPLAY_COUNT = 8; // Show 8 items initially

  // Animation for sticky button
  const [buttonOpacity] = useState(new Animated.Value(0));

  // Animate button appearance when service areas are selected
  useEffect(() => {
    const hasSelections = selectedIds.length > 0;

    Animated.timing(buttonOpacity, {
      toValue: hasSelections ? 1 : 0,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [selectedIds.length, buttonOpacity]);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    apiClient
      .get("/api/Onboarding/service-areas")
      .then((res) => {
        if (!mounted) return;
        const data = res.data ?? [];
        if (Array.isArray(data)) {
          data.sort((a: ServiceArea, b: ServiceArea) => {
            const nameA = String(a?.name ?? "").trim();
            const nameB = String(b?.name ?? "").trim();

            const startsWithDigit = (s: string) => /^\d/.test(s);
            const startsWithLetter = (s: string) => /^[A-Za-z]/.test(s);

            const aIsLetter = startsWithLetter(nameA);
            const bIsLetter = startsWithLetter(nameB);
            const aIsDigit = startsWithDigit(nameA);
            const bIsDigit = startsWithDigit(nameB);

            if (aIsLetter && bIsDigit) return -1;
            if (bIsLetter && aIsDigit) return 1;

            return nameA.localeCompare(nameB, undefined, {
              sensitivity: "base",
              numeric: false,
            });
          });
        }
        setServiceAreas(data);
      })
      .catch(() => {
        console.warn("failed to fetch service areas");
        setError("Failed to load service areas.");
      })
      .finally(() => mounted && setLoading(false));

    return () => {
      mounted = false;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return serviceAreas;
    return serviceAreas.filter((s) => s.name.toLowerCase().includes(q));
  }, [serviceAreas, query]);

  // Display only a limited number of items when not searching and showAll is false
  const displayedItems = useMemo(() => {
    const isSearching = query.trim().length > 0;
    if (isSearching || showAll) {
      return filtered; // Show all when searching or showAll is true
    }
    return filtered.slice(0, INITIAL_DISPLAY_COUNT); // Show only first 8 items
  }, [filtered, query, showAll, INITIAL_DISPLAY_COUNT]);

  const hasMore = useMemo(() => {
    const isSearching = query.trim().length > 0;
    return !isSearching && filtered.length > INITIAL_DISPLAY_COUNT;
  }, [filtered, query, INITIAL_DISPLAY_COUNT]);

  const toggle = (id: number) => {
    setError(null);
    setSelectedIds((s) =>
      s.includes(id) ? s.filter((x) => x !== id) : [...s, id],
    );
  };

  const onContinue = async () => {
    const validation = validateTherapistServiceAreasStep(selectedIds);
    if (!validation.ok) {
      setError(validation.error);
      return;
    }

    therapistOnboardingStore.setServiceAreaIds(validation.serviceAreaIds);

    // Build multipart/form-data and submit
    setSubmitting(true);
    try {
      const formData = new FormData();

      console.log("=== ONBOARDING SUBMISSION DEBUG ===");
      console.log("Store state:", therapistOnboardingStore.getAll());

      const { fields, file } = buildTherapistOnboardingMultipartParts(
        therapistOnboardingStore.getAll(),
      );

      for (const f of fields) {
        formData.append(f.name, f.value);
      }

      const base =
        (apiClient &&
          (apiClient as any).defaults &&
          (apiClient as any).defaults.baseURL) ||
        "";
      const url = joinBaseUrl(base, "/api/Onboarding/therapist");

      if (file) {
        try {
          formData.append("profilePicture", file as any);
        } catch (e) {
          console.warn("Failed to append profile picture as file object", e);
        }
      }

      const headers: any = {
        Accept: "application/json",
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      };

      const resp = await (async () => {
        try {
          return await fetch(url, {
            method: "POST",
            body: formData,
            headers,
          });
        } catch (fetchErr) {
          console.warn(
            "Fetch upload failed, will attempt axios as fallback",
            fetchErr,
          );
          try {
            const axiosRes = await apiClient.post(
              "/api/Onboarding/therapist",
              formData,
              {
                headers: {
                  Accept: "application/json",
                  ...(headers.Authorization
                    ? { Authorization: headers.Authorization }
                    : {}),
                },
              },
            );
            return {
              ok: true,
              status: axiosRes.status,
              json: async () => axiosRes.data,
              text: async () => JSON.stringify(axiosRes.data),
            } as any;
          } catch (axErr) {
            console.warn("Axios fallback also failed", axErr);
            throw fetchErr;
          }
        }
      })();

      if (!resp.ok) {
        let bodyText = "";
        try {
          bodyText = await resp.text();
        } catch {
          /* ignore */
        }
        throw new Error(`Server responded with ${resp.status}: ${bodyText}`);
      }

      const data = await resp.json();
      console.log("Onboarding submit response:", data);

      // Update the user object in auth context to reflect onboarding completion
      if (user) {
        await updateUser({
          ...user,
          isTherapistOnboardingComplete: true,
          IsTherapistOnboardingComplete: true,
        });
      }

      // Clear the onboarding store after successful submission
      therapistOnboardingStore.clear();

      router.replace("/(therapist)/(tabs)" as any);
    } catch (err: any) {
      console.warn("Onboarding submit failed", err);
      Alert.alert(
        "Submission failed",
        err?.response?.data?.message ||
          err?.message ||
          "Failed to submit onboarding",
      );
    } finally {
      setSubmitting(false);
    }
  };

  // Content component to avoid duplication
  const renderContent = () => (
    <>
      <View
        className={`flex-1 px-6 ${isDesktop ? "pt-6" : ""}`}
        style={!isDesktop ? { paddingTop: insets.top + 24 } : undefined}
      >
        {/* Back Button */}
        <TouchableOpacity
          onPress={() => router.back()}
          className="mb-6 flex-row items-center"
        >
          <ArrowLeft size={24} color="#089769" />
          <Text className="text-[#089769] font-semibold text-base ml-1">
            Back
          </Text>
        </TouchableOpacity>

        {/* Header Section */}
        <View className="mb-8">
          <Text className="text-3xl font-bold text-gray-900 mb-2">
            Service Area
          </Text>
          <Text className="text-base text-gray-500">
            Pick the service areas you cover (searchable)
          </Text>
        </View>

        {/* Search Input */}
        <TextInput
          placeholder="Search service areas..."
          value={query}
          onChangeText={setQuery}
          className="border border-gray-200 rounded-2xl px-4 py-4 text-base text-gray-900 mb-6"
          placeholderTextColor="#9CA3AF"
        />

        {loading ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator size="large" color="#089769" />
          </View>
        ) : error ? (
          <View className="bg-red-50 rounded-2xl px-4 py-3 mb-4">
            <Text className="text-sm text-red-600">{error}</Text>
          </View>
        ) : filtered.length === 0 ? (
          <View className="flex-1 items-center justify-center">
            <Text className="text-center text-gray-500">
              No service areas found.
            </Text>
          </View>
        ) : (
          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {displayedItems.map((item) => {
              const selected = selectedIds.includes(item.id);
              return (
                <TouchableOpacity
                  key={String(item.id)}
                  activeOpacity={0.7}
                  onPress={() => toggle(item.id)}
                  className={`mb-3 px-5 py-4 rounded-xl ${
                    selected
                      ? "bg-[#E6F4F0] border-2 border-[#089769]"
                      : "bg-white border-2 border-gray-200"
                  }`}
                >
                  <Text
                    className={`text-base ${
                      selected
                        ? "text-[#089769] font-semibold"
                        : "text-gray-700 font-medium"
                    }`}
                  >
                    {item.name}
                  </Text>
                </TouchableOpacity>
              );
            })}

            {/* Show More / Show Less Button */}
            {hasMore && (
              <TouchableOpacity
                onPress={() => setShowAll(!showAll)}
                className="mb-3 px-5 py-3 rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 items-center"
                activeOpacity={0.7}
              >
                <Text className="text-sm font-semibold text-gray-600">
                  {showAll
                    ? `Show Less (${filtered.length - INITIAL_DISPLAY_COUNT} hidden)`
                    : `Show ${filtered.length - INITIAL_DISPLAY_COUNT} More`}
                </Text>
              </TouchableOpacity>
            )}

            <View className="h-4" />
          </ScrollView>
        )}
      </View>
    </>
  );

  // Desktop layout
  return (
    <View className="flex-1">
      {isDesktop ? (
        <View className="flex-1 bg-[#e6f5f0]">
          <ScrollView
            contentContainerStyle={{
              flexGrow: 1,
              justifyContent: "center",
              alignItems: "center",
              paddingVertical: 40,
            }}
          >
            <View
              className="bg-white rounded-2xl w-full max-w-xl"
              style={{
                shadowColor: "#000",
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.08,
                shadowRadius: 8,
                elevation: 3,
                minHeight: 600,
              }}
            >
              {renderContent()}
            </View>
          </ScrollView>
        </View>
      ) : (
        <View className="flex-1 bg-gray-50">{renderContent()}</View>
      )}

      {/* Sticky Bottom Button - Fixed to bottom of screen */}
      {selectedIds.length > 0 && (
        <Animated.View
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            backgroundColor: "white",
            borderTopWidth: 1,
            borderTopColor: "#E5E7EB",
            paddingBottom: insets.bottom || 16,
            paddingTop: 16,
            paddingHorizontal: 24,
            zIndex: 1000,
            opacity: buttonOpacity,
            shadowColor: "#000",
            shadowOffset: { width: 0, height: -2 },
            shadowOpacity: 0.1,
            shadowRadius: 8,
            elevation: 8,
            alignItems: "center",
          }}
        >
          <TouchableOpacity
            onPress={onContinue}
            activeOpacity={submitting ? 1 : 0.85}
            disabled={submitting}
            style={{
              backgroundColor: submitting ? "#a8d5c8" : "#089769",
              borderRadius: 12,
              paddingVertical: 16,
              paddingHorizontal: 24,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              width: "100%",
              maxWidth: 576,
            }}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text className="text-white font-bold text-lg">Finish</Text>
            )}
          </TouchableOpacity>
        </Animated.View>
      )}
    </View>
  );
}

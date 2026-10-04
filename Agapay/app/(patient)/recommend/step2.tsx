import RecommendHeader from "@/src/components/RecommendHeader";
import PrimaryButton from "@/src/components/PrimaryButton";
import { COLORS } from "@/src/theme";
import apiClient from "@/api/client";
import useConditionsGrouped from "@/src/hooks/useConditionsGrouped";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQueryClient } from "@tanstack/react-query";
import {
  clearRecommendationsCache,
  RECOMMENDATIONS_QUERY_KEY,
} from "@/src/services/recommendations";
import {
  buildPreferencesSubmitPayload,
  filterCategoriesByServiceQuery,
  getMatchedCategoryIdsByServiceQuery,
  getPreferredSpecializationsFromIncoming,
  mapSpecializationsToCategoryIds,
  reorderCategoriesBySelectedIds,
  safeParseIncomingPreferencesData,
} from "@/src/features/recommendations/core/preferencesStep2";

// Map specializations to category keys (matching backend Enum names)
const SPECIALIZATION_TO_CATEGORY_MAP: Record<string, string> = {
  Neurologic: "Neurological",
  Musculoskeletal: "Musculoskeletal",
  Pediatric: "Pediatric",
  Geriatric: "Geriatric",
  Cardiopulmonary: "Cardiopulmonary",
  Orthopedic: "Orthopedic",
  Sports: "Sports",
  Vestibular: "Vestibular",
};

type ServiceCategory = {
  id: string;
  category: string;
  services: { id: string; name: string }[];
};

export default function RecommendStep2() {
  const params = useLocalSearchParams() as { data?: string };
  const router = useRouter();
  const queryClient = useQueryClient();
  const incoming = useMemo(() => {
    return safeParseIncomingPreferencesData(params?.data);
  }, [params?.data]);

  const { groups } = useConditionsGrouped();

  // Get selected category IDs from specializations
  const selectedCategoryIds = useMemo(() => {
    const specs = getPreferredSpecializationsFromIncoming(incoming);
    return mapSpecializationsToCategoryIds(
      specs,
      SPECIALIZATION_TO_CATEGORY_MAP,
    );
  }, [incoming]);

  // Reorder groups to put the selected specializations' categories at the top
  const orderedServiceData: ServiceCategory[] = useMemo(() => {
    if (!groups || groups.length === 0) return [];

    // Convert groups to compatible structure
    const mappedGroups: ServiceCategory[] = groups.map((g) => ({
      id: String(g.key),
      category: String(g.label),
      services: (g.items ?? []).map((svc: any) => ({
        id: String(svc?.id ?? svc?.name),
        name: String(svc.name),
      })),
    }));

    if (selectedCategoryIds.length === 0) return mappedGroups;

    return reorderCategoriesBySelectedIds(mappedGroups, selectedCategoryIds);
  }, [selectedCategoryIds, groups]);

  const [expandedIds, setExpandedIds] = useState<string[]>([]);
  const expandedIdsSet = useMemo(() => new Set(expandedIds), [expandedIds]);
  const [selectedServices, setSelectedServices] = useState<string[]>(
    incoming?.desiredServices ??
      (incoming?.desiredService ? [incoming.desiredService] : []),
  );
  const selectedServicesSet = useMemo(
    () => new Set(selectedServices),
    [selectedServices],
  );
  const listExtraData = useMemo(
    () => ({ expandedIds, selectedServices }),
    [expandedIds, selectedServices],
  );
  const [serviceQuery, setServiceQuery] = useState("");
  const [appliedServiceQuery, setAppliedServiceQuery] = useState("");
  const serviceInputRef = useRef<TextInput | null>(null);
  const [showSearch, setShowSearch] = useState(true);

  // Auto-expand selected specialization categories on mount
  useEffect(() => {
    if (selectedCategoryIds.length > 0 && expandedIds.length === 0) {
      setExpandedIds(selectedCategoryIds);
    } else if (
      selectedCategoryIds.length === 0 &&
      orderedServiceData[0]?.id &&
      expandedIds.length === 0
    ) {
      // Fallback: expand first category if no specializations selected
      setExpandedIds([orderedServiceData[0].id]);
    }
  }, [selectedCategoryIds, orderedServiceData, expandedIds.length]);

  // Filter services by applied query (case-insensitive). When a query is applied, expand matching categories.
  const filteredServiceData = useMemo(() => {
    return filterCategoriesByServiceQuery(
      orderedServiceData,
      appliedServiceQuery,
    );
  }, [appliedServiceQuery, orderedServiceData]);

  useEffect(() => {
    const matchedIds = getMatchedCategoryIdsByServiceQuery(
      orderedServiceData,
      appliedServiceQuery,
    );
    if (matchedIds.length > 0) setExpandedIds(matchedIds);
  }, [appliedServiceQuery, orderedServiceData]);

  useEffect(() => {
    if (showSearch) {
      // focus after render
      const t = setTimeout(() => {
        try {
          serviceInputRef.current?.focus();
        } catch {}
      }, 50);
      return () => clearTimeout(t);
    }
  }, [showSearch]);

  const handlePressCategory = useCallback((id: string) => {
    setExpandedIds((prev) =>
      prev.includes(id) ? prev.filter((eid) => eid !== id) : [...prev, id],
    );
  }, []);

  const toggleServiceByName = useCallback((serviceName: string) => {
    setSelectedServices((prev) =>
      prev.includes(serviceName)
        ? prev.filter((s) => s !== serviceName)
        : [...prev, serviceName],
    );
  }, []);

  // Fetch patient profile to get the barangay
  const [patientProfile, setPatientProfile] = useState<any>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiClient.get("/api/patient/me");
        if (res.data) {
          if (cancelled) return;
          setPatientProfile(res.data);
          console.log("[Recommend][Step2] Fetched patient profile:", res.data);
        }
      } catch (err) {
        console.warn("Failed to fetch patient profile for preferences", err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const keyExtractor = useCallback((item: ServiceCategory) => item.id, []);

  const renderCategoryItem = useCallback(
    ({ item }: { item: ServiceCategory }) => {
      const isExpanded = expandedIdsSet.has(item.id);

      return (
        <View style={styles.categoryContainer}>
          <TouchableOpacity
            style={styles.categoryHeader}
            onPress={() => handlePressCategory(item.id)}
          >
            <Text style={styles.categoryTitle}>{item.category}</Text>
          </TouchableOpacity>

          {isExpanded && (
            <View style={styles.servicesList}>
              {item.services.map((svc) => {
                const isSelected = selectedServicesSet.has(svc.name);
                return (
                  <TouchableOpacity
                    key={svc.id}
                    style={[
                      styles.serviceButton,
                      isSelected && styles.selectedService,
                    ]}
                    onPress={() => toggleServiceByName(svc.name)}
                  >
                    <Text
                      style={[
                        styles.serviceText,
                        isSelected && styles.selectedServiceText,
                      ]}
                    >
                      {svc.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </View>
      );
    },
    [
      expandedIdsSet,
      handlePressCategory,
      selectedServicesSet,
      toggleServiceByName,
    ],
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <RecommendHeader
        title="Services"
        currentStep={1}
        totalSteps={2}
        rightElement={
          <TouchableOpacity
            onPress={() => {
              // toggle visibility; focusing happens in effect when shown
              setShowSearch((s) => !s);
            }}
            style={{ padding: 8 }}
            accessibilityLabel="Toggle search"
          >
            <Ionicons
              name={showSearch ? "search" : "search"}
              size={20}
              color="#111827"
            />
          </TouchableOpacity>
        }
      />

      {showSearch && (
        <View
          style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 6 }}
        >
          <View style={{ flexDirection: "row", gap: 8 }}>
            <TextInput
              ref={serviceInputRef}
              value={serviceQuery}
              onChangeText={setServiceQuery}
              placeholder="Search physical therapy cases (e.g. COPD, Stroke, ACL tear)"
              style={{
                flex: 1,
                borderWidth: 1,
                borderColor: "#E5E7EB",
                borderRadius: 8,
                padding: 10,
                backgroundColor: "#fff",
              }}
            />
            <TouchableOpacity
              onPress={() => setAppliedServiceQuery(serviceQuery)}
              activeOpacity={0.85}
              style={{
                backgroundColor: "#2D8CFF",
                paddingHorizontal: 12,
                justifyContent: "center",
                borderRadius: 8,
              }}
            >
              <Text style={{ color: "#fff", fontWeight: "700" }}>Search</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                setServiceQuery("");
                setAppliedServiceQuery("");
              }}
              activeOpacity={0.85}
              style={{
                backgroundColor: "#E5E7EB",
                paddingHorizontal: 12,
                justifyContent: "center",
                borderRadius: 8,
              }}
            >
              <Text style={{ color: "#111827", fontWeight: "700" }}>Clear</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      <FlatList
        style={styles.list}
        contentContainerStyle={{ paddingTop: 16, paddingBottom: 16 }}
        data={filteredServiceData}
        extraData={listExtraData}
        keyExtractor={keyExtractor}
        renderItem={renderCategoryItem}
      />

      {incoming?.preferredSpecializations?.length > 0 ||
      incoming?.preferredSpecialization ? (
        <View style={styles.selectedSpecializationRow}>
          <Text style={styles.selectedSpecializationLabel}>
            Selected specialization
            {incoming?.preferredSpecializations?.length > 1 ? "s" : ""}:
          </Text>
          <Text style={styles.selectedSpecializationValue}>
            {incoming?.preferredSpecializations?.length > 0
              ? incoming.preferredSpecializations.join(", ")
              : incoming.preferredSpecialization}
          </Text>
        </View>
      ) : null}

      {/* Show selected services count */}
      {selectedServices.length > 0 && (
        <View style={styles.selectionSummary}>
          <Text style={styles.selectionSummaryText}>
            {selectedServices.length} condition
            {selectedServices.length !== 1 ? "s" : ""} selected
          </Text>
        </View>
      )}

      <View style={styles.footer}>
        <PrimaryButton
          title="Submit"
          disabled={selectedServices.length === 0}
          onPress={async () => {
            const payload = buildPreferencesSubmitPayload({
              incoming,
              desiredServices: selectedServices,
              patientProfile,
            });
            console.log("[Recommend][Step2] final payload ->", payload);
            try {
              await apiClient.post("/api/Preferences/me", payload);
              // Clear recommendations cache since preferences changed
              await clearRecommendationsCache();
              // Reset recommendations cache to force hard loading state (cleans error/stale data)
              queryClient.removeQueries({
                queryKey: RECOMMENDATIONS_QUERY_KEY,
              });
              // Navigate to transitional loading screen
              router.replace("/(patient)/recommend/loading");
            } catch (err) {
              console.error("Failed to submit preferences", err);
            }
          }}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.BG,
  },
  list: {
    flex: 1,
  },
  footer: {
    padding: 20,
    backgroundColor: COLORS.BG,
  },
  categoryContainer: {
    backgroundColor: "#FFFFFF",
    marginBottom: 10,
    borderRadius: 12,
    overflow: "hidden",
    marginHorizontal: 16,
  },
  categoryHeader: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#F0F0F0",
  },
  categoryTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111",
  },
  servicesList: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  serviceButton: {
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: "#F5F5F5",
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "transparent",
  },
  selectedService: {
    backgroundColor: "#E8F1FF",
    borderWidth: 2,
    borderColor: COLORS.PRIMARY,
  },
  serviceText: {
    color: "#111",
    fontSize: 15,
  },
  selectedServiceText: {
    fontWeight: "600",
    color: COLORS.PRIMARY,
  },
  selectedSpecializationRow: {
    padding: 12,
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 12,
  },
  selectedSpecializationLabel: {
    color: "#666",
    fontSize: 12,
  },
  selectedSpecializationValue: {
    fontSize: 14,
    fontWeight: "600",
    color: "#111",
  },
  selectionSummary: {
    padding: 12,
    marginHorizontal: 16,
    backgroundColor: "#E8F1FF",
    borderRadius: 8,
    alignItems: "center",
  },
  selectionSummaryText: {
    color: COLORS.PRIMARY,
    fontWeight: "600",
    fontSize: 14,
  },
});

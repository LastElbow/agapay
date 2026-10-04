import useConditionsGrouped from "@/src/hooks/useConditionsGrouped";
import { useOtherConditionSearch } from "@/src/hooks/useOtherConditionSearch";
import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowLeft, ChevronDown, ChevronUp } from "lucide-react-native";
import { therapistOnboardingStore } from "@/src/stores/therapistOnboardingStore";
import apiClient from "@/api/client";
import InAppModal from "@/src/components/InAppModal";
import { validateTherapistConditionsStep } from "@/src/features/onboarding/core/therapistConditions";

type Condition = { id: number; name: string };
type ConditionSection = { title: string; key: string; data: Condition[] };

// Mapping of specialization names to condition category keys (matches backend)
const SPECIALIZATION_TO_CATEGORY_MAP: Record<string, string> = {
  Orthopedic: "Orthopedic",
  "Orthopedic/Musculoskeletal": "Orthopedic",
  Pediatric: "Pediatric",
  Geriatric: "Geriatric",
  Neurological: "Neurological",
  Sports: "Sports",
  Cardiopulmonary: "Cardiopulmonary",
  Vestibular: "Vestibular",
};

export default function TherapistOnboarding3() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === "web" && width >= 768;
  // Get selected specialization IDs from the store to order conditions
  // Convert MobX observable array to plain array to ensure proper serialization and dependency tracking
  const specializationIds = [
    ...(therapistOnboardingStore.specializationIds ?? []),
  ];
  const specializationIdsKey = specializationIds.join(",");
  console.log("[Step3] specializationIds from store:", specializationIds);
  console.log("[Step3] Full store state:", therapistOnboardingStore.getAll());
  const { groups, loading, error } = useConditionsGrouped(specializationIds);
  const [selectedIds, setSelectedIds] = useState<number[]>(
    therapistOnboardingStore.conditionIds ?? [],
  );

  // State to hold specialization names fetched from API
  const [specializationNames, setSpecializationNames] = useState<string[]>([]);

  // Fetch specialization names based on selected IDs
  useEffect(() => {
    const ids = specializationIdsKey
      ? specializationIdsKey
          .split(",")
          .map((x) => Number(x))
          .filter((n) => Number.isFinite(n))
      : [];

    if (ids.length === 0) {
      setSpecializationNames([]);
      return;
    }

    apiClient
      .get<{ id: number; name: string }[]>("/api/Onboarding/specializations")
      .then((res) => {
        const names = (res.data ?? [])
          .filter((s) => ids.includes(s.id))
          .map((s) => s.name);
        setSpecializationNames(names);
      })
      .catch(() => {
        setSpecializationNames([]);
      });
  }, [specializationIdsKey]);

  // Determine which category keys should be expanded based on selected specializations
  const chosenCategoryKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const name of specializationNames) {
      const categoryKey = SPECIALIZATION_TO_CATEGORY_MAP[name];
      if (categoryKey) {
        keys.add(categoryKey);
      }
    }
    // Also add Musculoskeletal for Orthopedic/Musculoskeletal
    if (specializationNames.some((n) => n.includes("Musculoskeletal"))) {
      keys.add("Musculoskeletal");
    }
    return keys;
  }, [specializationNames]);

  // State for collapsed sections - tracks which sections are collapsed
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(
    new Set(),
  );

  // Initialize collapsed state based on chosen specializations when groups load
  useEffect(() => {
    if (groups && groups.length > 0 && specializationNames.length > 0) {
      const initialCollapsed = new Set<string>();
      for (const group of groups) {
        const key = String(group.key);
        // Collapse if NOT a chosen category
        if (!chosenCategoryKeys.has(key)) {
          initialCollapsed.add(key);
        }
      }
      setCollapsedSections(initialCollapsed);
    }
  }, [groups, chosenCategoryKeys, specializationNames]);

  const toggleSectionCollapse = (key: string) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  // State for other conditions per category
  const [otherConditionsByCategory, setOtherConditionsByCategory] = useState<
    Record<string, string[]>
  >(() => {
    // Initialize from store - try to restore per-category structure or convert flat list
    // For now, start with empty categories - stored conditions will be in a flat list
    return {};
  });

  // Flat list of all other conditions for backward compatibility
  const otherConditions = useMemo(() => {
    return Object.values(otherConditionsByCategory).flat();
  }, [otherConditionsByCategory]);

  // Per-category input values
  const [categoryInputValues, setCategoryInputValues] = useState<
    Record<string, string>
  >({});
  const [activeCategoryForSuggestions, setActiveCategoryForSuggestions] =
    useState<string | null>(null);

  // Get the current active input value for suggestions
  const activeInputValue = activeCategoryForSuggestions
    ? categoryInputValues[activeCategoryForSuggestions] || ""
    : "";
  const { suggestions, loading: suggestionsLoading } =
    useOtherConditionSearch(activeInputValue);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const [validationError, setValidationError] = useState<string | null>(null);

  // Search functionality for conditions
  const [searchQuery, setSearchQuery] = useState("");
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  // Animation for floating button
  const [buttonOpacity] = useState(new Animated.Value(0));

  // Animate button appearance when conditions are selected
  useEffect(() => {
    const hasSelections = selectedIds.length > 0 || otherConditions.length > 0;

    Animated.timing(buttonOpacity, {
      toValue: hasSelections ? 1 : 0,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [selectedIds.length, otherConditions.length, buttonOpacity]);

  // fetching is handled by useConditionsGrouped

  const groupedConditions = useMemo<ConditionSection[]>(() => {
    if (!groups || groups.length === 0) return [];

    // Exclude any 'Other'/'Others' group (by key or label) from the rendered grouped list;
    // the free-text input below will handle 'Other' entries.
    // Keep the order from the backend API (which sorts based on selected specializations)
    const sections = groups
      .filter((g) => {
        const key = String(g.key ?? "").toLowerCase();
        const label = String(g.label ?? g.key ?? "").toLowerCase();
        return (
          key !== "other" &&
          key !== "others" &&
          label !== "other" &&
          label !== "others"
        );
      })
      .map((g) => ({
        key: String(g.key),
        title: g.label || String(g.key),
        data: [...g.items].sort((a, b) => a.name.localeCompare(b.name)),
      }));

    // Don't re-sort! The backend already sorted based on selected specializations.
    // Return sections with key, title, and data
    return sections;
  }, [groups]);

  // Helper to get names of all selected conditions (both standard and other)
  const selectedConditionNames = useMemo(() => {
    const names: string[] = [];
    groupedConditions.forEach((section) => {
      section.data.forEach((item) => {
        if (selectedIds.includes(item.id)) {
          names.push(item.name);
        }
      });
    });
    // Add other conditions
    names.push(...otherConditions);
    return names;
  }, [groupedConditions, selectedIds, otherConditions]);

  // Reorder sections: chosen categories first, then non-chosen categories
  const orderedConditions = useMemo<ConditionSection[]>(() => {
    if (groupedConditions.length === 0) return [];
    if (chosenCategoryKeys.size === 0) return groupedConditions;

    // Separate into chosen and non-chosen
    const chosen: ConditionSection[] = [];
    const nonChosen: ConditionSection[] = [];

    for (const section of groupedConditions) {
      if (chosenCategoryKeys.has(section.key)) {
        chosen.push(section);
      } else {
        nonChosen.push(section);
      }
    }

    // Return chosen categories first, then non-chosen
    return [...chosen, ...nonChosen];
  }, [groupedConditions, chosenCategoryKeys]);

  // Filter conditions based on search query
  const filteredConditions = useMemo<ConditionSection[]>(() => {
    if (!searchQuery.trim()) return orderedConditions;

    const query = searchQuery.toLowerCase().trim();
    return orderedConditions
      .map((section) => ({
        ...section,
        data: section.data.filter((item) =>
          item.name.toLowerCase().includes(query),
        ),
      }))
      .filter((section) => section.data.length > 0);
  }, [orderedConditions, searchQuery]);

  const toggle = (id: number) => {
    setValidationError(null);
    setSelectedIds((s) =>
      s.includes(id) ? s.filter((x) => x !== id) : [...s, id],
    );
  };

  const addOtherConditionToCategory = (
    categoryKey: string,
    conditionName: string,
  ) => {
    const trimmed = conditionName.trim();
    if (!trimmed) return;

    // Avoid duplicates across all categories (case-insensitive)
    const allConditions = Object.values(otherConditionsByCategory).flat();
    const exists = allConditions.some(
      (c) => c.toLowerCase() === trimmed.toLowerCase(),
    );
    if (exists) {
      setCategoryInputValues((prev) => ({ ...prev, [categoryKey]: "" }));
      setShowSuggestions(false);
      setActiveCategoryForSuggestions(null);
      return;
    }

    setOtherConditionsByCategory((prev) => ({
      ...prev,
      [categoryKey]: [...(prev[categoryKey] || []), trimmed],
    }));
    setCategoryInputValues((prev) => ({ ...prev, [categoryKey]: "" }));
    setShowSuggestions(false);
    setActiveCategoryForSuggestions(null);
    setValidationError(null);
  };

  const removeOtherConditionFromCategory = (
    categoryKey: string,
    index: number,
  ) => {
    setOtherConditionsByCategory((prev) => ({
      ...prev,
      [categoryKey]: (prev[categoryKey] || []).filter((_, i) => i !== index),
    }));
  };

  const handleCategoryInputSubmit = (categoryKey: string) => {
    const inputValue = categoryInputValues[categoryKey] || "";
    if (inputValue.trim()) {
      addOtherConditionToCategory(categoryKey, inputValue);
    }
  };

  const onContinue = () => {
    const out = validateTherapistConditionsStep({
      conditionIds: selectedIds,
      otherConditions,
    });
    if (!out.ok) {
      setValidationError(out.error);
      return;
    }

    setValidationError(null);
    setShowConfirmModal(true);
  };

  const handleConfirmProceed = () => {
    setShowConfirmModal(false);
    const out = validateTherapistConditionsStep({
      conditionIds: selectedIds,
      otherConditions,
    });
    therapistOnboardingStore.setConditionIds(
      out.ok ? out.conditionIds : selectedIds,
    );
    therapistOnboardingStore.setOtherConditions(
      out.ok ? out.otherConditions : otherConditions,
    );

    // Log preview and route to step 4
    const previewPayload = {
      profilePictureUri: therapistOnboardingStore.profilePicture,
      specializationIds: therapistOnboardingStore.specializationIds,
      conditionIds: selectedIds,
      otherConditions: otherConditions,
    };
    console.log("[Onboarding preview] from step3:", previewPayload);
    console.log(
      "[Onboarding store] current state:",
      therapistOnboardingStore.getAll(),
    );

    router.push("/(therapist)/onboarding/step4");
  };

  // We render items inline using groupedConditions.map so dedicated renderItem/renderSectionHeader
  // helpers are no longer needed.

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
            Conditions Treated
          </Text>
          <Text className="text-base text-gray-500">
            Select the conditions you commonly treat
          </Text>
        </View>

        {/* Search Bar */}
        {!loading && !error && groupedConditions.length > 0 && (
          <View className="mb-6">
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search conditions..."
              className="border border-gray-300 rounded-2xl px-4 py-4 text-base text-gray-900 bg-white"
              placeholderTextColor="#9CA3AF"
              returnKeyType="search"
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity
                onPress={() => setSearchQuery("")}
                className="absolute right-4 top-1/2 -translate-y-1/2"
                style={{ transform: [{ translateY: -12 }] }}
              >
                <Text className="text-gray-400 text-xl font-bold">×</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {loading ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator size="large" color="#089769" />
          </View>
        ) : error ? (
          <View className="bg-red-50 rounded-2xl px-4 py-3 mb-4">
            <Text className="text-sm text-red-600">{error}</Text>
          </View>
        ) : groupedConditions.length === 0 ? (
          <View className="flex-1 items-center justify-center">
            <Text className="text-center text-gray-500">
              No conditions available.
            </Text>
          </View>
        ) : filteredConditions.length === 0 && searchQuery.length > 0 ? (
          <View className="flex-1 items-center justify-center py-12">
            <Text className="text-center text-gray-500 text-base">
              No conditions found matching &quot;{searchQuery}&quot;
            </Text>
            <TouchableOpacity
              onPress={() => setSearchQuery("")}
              className="mt-4 bg-[#089769] py-3 px-6 rounded-xl"
            >
              <Text className="text-white font-semibold">Clear Search</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: 120 }}
          >
            {filteredConditions.map((section) => {
              const isCollapsed = collapsedSections.has(section.key);
              const isChosenCategory = chosenCategoryKeys.has(section.key);

              return (
                <View key={section.key} className="mb-8">
                  {/* Collapsible Header */}
                  <TouchableOpacity
                    onPress={() => toggleSectionCollapse(section.key)}
                    activeOpacity={0.7}
                    className={`mb-4 pb-2 border-b-2 flex-row items-center justify-between ${
                      isChosenCategory ? "border-[#089769]" : "border-gray-200"
                    }`}
                  >
                    <View className="flex-1">
                      <Text
                        className={`text-xl font-bold uppercase tracking-wide ${
                          isChosenCategory ? "text-[#089769]" : "text-gray-900"
                        }`}
                      >
                        {section.title}
                      </Text>
                      {isChosenCategory && (
                        <Text className="text-xs text-[#089769] mt-1">
                          Your specialization
                        </Text>
                      )}
                    </View>
                    <View className="ml-2">
                      {isCollapsed ? (
                        <ChevronDown
                          size={24}
                          color={isChosenCategory ? "#089769" : "#6B7280"}
                        />
                      ) : (
                        <ChevronUp
                          size={24}
                          color={isChosenCategory ? "#089769" : "#6B7280"}
                        />
                      )}
                    </View>
                  </TouchableOpacity>

                  {/* Collapsible Content */}
                  {!isCollapsed && (
                    <>
                      {section.data.map((item) => (
                        <TouchableOpacity
                          key={String(item.id)}
                          activeOpacity={0.7}
                          onPress={() => toggle(item.id)}
                          className={`mb-3 px-5 py-4 rounded-xl transition-all ${
                            selectedIds.includes(item.id)
                              ? "bg-[#E6F4F0] border-2 border-[#089769]"
                              : "bg-white border-2 border-gray-200"
                          }`}
                        >
                          <Text
                            className={`text-base ${
                              selectedIds.includes(item.id)
                                ? "text-[#089769] font-semibold"
                                : "text-gray-700 font-medium"
                            }`}
                          >
                            {item.name}
                          </Text>
                        </TouchableOpacity>
                      ))}

                      {/* Custom "Other" conditions for this category */}
                      {(otherConditionsByCategory[section.key] || []).map(
                        (condition, index) => (
                          <View
                            key={`other-${index}`}
                            className="mb-3 px-5 py-4 rounded-xl border-2 border-dashed border-[#089769] bg-[#E6F4F0] flex-row items-center justify-between"
                          >
                            <View className="flex-1">
                              <Text className="text-base text-[#089769] font-semibold">
                                {condition}
                              </Text>
                              <Text className="text-xs text-gray-500 mt-1">
                                Custom condition (pending review)
                              </Text>
                            </View>
                            <TouchableOpacity
                              onPress={() =>
                                removeOtherConditionFromCategory(
                                  section.key,
                                  index,
                                )
                              }
                              className="py-1.5 px-3 rounded-lg bg-red-500 ml-3"
                            >
                              <Text className="text-xs text-white font-semibold">
                                Remove
                              </Text>
                            </TouchableOpacity>
                          </View>
                        ),
                      )}

                      {/* "Other" input for this category */}
                      <View className="mt-2 mb-3">
                        <View className="flex-row items-center gap-3">
                          <TextInput
                            value={categoryInputValues[section.key] || ""}
                            onChangeText={(text) => {
                              setCategoryInputValues((prev) => ({
                                ...prev,
                                [section.key]: text,
                              }));
                              setActiveCategoryForSuggestions(
                                text.length >= 2 ? section.key : null,
                              );
                              setShowSuggestions(text.length >= 2);
                            }}
                            onSubmitEditing={() =>
                              handleCategoryInputSubmit(section.key)
                            }
                            placeholder="Other (type to add)..."
                            className="flex-1 border border-dashed border-gray-300 rounded-xl px-4 py-3 text-base text-gray-900 bg-gray-50"
                            placeholderTextColor="#9CA3AF"
                            returnKeyType="done"
                            blurOnSubmit={false}
                          />
                          {(categoryInputValues[section.key] || "").length >=
                            2 && (
                            <TouchableOpacity
                              onPress={() =>
                                handleCategoryInputSubmit(section.key)
                              }
                              className="bg-[#089769] py-3 px-5 rounded-xl"
                            >
                              <Text className="text-white font-semibold text-sm">
                                Add
                              </Text>
                            </TouchableOpacity>
                          )}
                        </View>

                        {/* Autocomplete suggestions for this category */}
                        {showSuggestions &&
                          activeCategoryForSuggestions === section.key &&
                          suggestions.length > 0 && (
                            <View className="border border-gray-200 rounded-xl bg-white mt-2 max-h-40 overflow-hidden">
                              {suggestionsLoading && (
                                <View className="p-3">
                                  <ActivityIndicator
                                    size="small"
                                    color="#089769"
                                  />
                                </View>
                              )}
                              {suggestions
                                .slice(0, 5)
                                .map((suggestion, index) => (
                                  <TouchableOpacity
                                    key={index}
                                    className="p-3 border-b border-gray-100"
                                    onPress={() =>
                                      addOtherConditionToCategory(
                                        section.key,
                                        suggestion,
                                      )
                                    }
                                  >
                                    <Text className="text-sm text-gray-700">
                                      {suggestion}
                                    </Text>
                                  </TouchableOpacity>
                                ))}
                            </View>
                          )}
                      </View>
                    </>
                  )}

                  {/* Collapsed indicator showing count */}
                  {isCollapsed && section.data.length > 0 && (
                    <Text className="text-sm text-gray-400 italic">
                      {section.data.length} condition
                      {section.data.length !== 1 ? "s" : ""} available • Tap to
                      expand
                    </Text>
                  )}
                </View>
              );
            })}

            {/* Validation Error */}
            {validationError ? (
              <View className="bg-red-50 rounded-2xl px-4 py-3 mb-4">
                <Text className="text-sm text-red-600">{validationError}</Text>
              </View>
            ) : null}
          </ScrollView>
        )}
      </View>
    </>
  );

  // Wrap in a parent to share the modal
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
      {(selectedIds.length > 0 || otherConditions.length > 0) && (
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
            activeOpacity={0.85}
            style={{
              backgroundColor: "#089769",
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
            <Text className="text-white font-bold text-lg mr-2">Continue</Text>
            <View
              style={{
                backgroundColor: "rgba(255, 255, 255, 0.25)",
                borderRadius: 12,
                minWidth: 28,
                height: 28,
                paddingHorizontal: 8,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text
                style={{ color: "white", fontSize: 14, fontWeight: "bold" }}
              >
                {selectedIds.length + otherConditions.length}
              </Text>
            </View>
          </TouchableOpacity>
        </Animated.View>
      )}

      <InAppModal
        visible={showConfirmModal}
        title="Confirm Selections"
        message="Are these correct, proceed?"
        confirmText="Confirm"
        cancelText="Review Again"
        showCancel
        onConfirm={handleConfirmProceed}
        onCancel={() => setShowConfirmModal(false)}
      >
        <View className="mt-2 bg-gray-50 p-4 rounded-xl border border-gray-100">
          <Text className="text-xs font-bold text-gray-400 uppercase mb-3 tracking-widest">
            Selected Conditions ({selectedConditionNames.length})
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {/* Standard conditions */}
            {groupedConditions.flatMap((section) =>
              section.data
                .filter((item) => selectedIds.includes(item.id))
                .map((item) => (
                  <View
                    key={`standard-${item.id}`}
                    className="bg-white border border-emerald-100 px-3 py-1.5 rounded-lg shadow-sm flex-shrink"
                    style={{ maxWidth: "100%" }}
                  >
                    <Text
                      className="text-sm font-semibold text-emerald-800"
                      numberOfLines={2}
                      style={{ flexShrink: 1 }}
                    >
                      {item.name}
                    </Text>
                  </View>
                )),
            )}
            {/* Custom "Other" conditions - with distinction */}
            {otherConditions.map((name, index) => (
              <View
                key={`other-${index}`}
                className="bg-amber-50 border-2 border-dashed border-amber-300 px-3 py-1.5 rounded-lg shadow-sm flex-shrink"
                style={{ maxWidth: "100%" }}
              >
                <Text
                  className="text-sm font-semibold text-amber-900"
                  numberOfLines={2}
                  style={{ flexShrink: 1 }}
                >
                  {name}
                </Text>
                <Text className="text-xs text-amber-600 mt-0.5">Custom</Text>
              </View>
            ))}
          </View>
        </View>
      </InAppModal>
    </View>
  );
}

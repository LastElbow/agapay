import { useAuth } from "@/src/providers/AuthProvider";
import { useLocalSearchParams, useRouter } from "expo-router";
import { DraftStore } from "@/src/stores/therapistDraftStore";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import apiClient from "@/api/client";

type ConditionGroup = {
  key: string;
  label: string;
  items: { id: number; name: string }[];
};

export default function SelectConditions() {
  const router = useRouter();
  const { accessToken } = useAuth();
  const { width } = useWindowDimensions();
  const params = useLocalSearchParams<{
    selected?: string;
    specializationIds?: string;
  }>();

  const [conditions, setConditions] = useState<ConditionGroup[]>([]);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(
    {},
  );
  const [loading, setLoading] = useState(true);

  const headers = useMemo(
    () => ({
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    }),
    [accessToken],
  );

  // Parse initial selection from params
  useEffect(() => {
    if (params.selected) {
      try {
        const parsed = JSON.parse(params.selected);
        if (Array.isArray(parsed)) {
          setSelectedIds(parsed);
        }
      } catch (e) {
        console.warn("Failed to parse selected conditions", e);
      }
    }
  }, [params.selected]);

  // Load conditions grouped by specialization
  useEffect(() => {
    let mounted = true;
    setLoading(true);

    let url = "/api/Onboarding/conditions-grouped";
    if (params.specializationIds) {
      try {
        const specIds = JSON.parse(params.specializationIds);
        if (Array.isArray(specIds) && specIds.length > 0) {
          const queryParams = specIds
            .map((id: number) => `specializationIds=${id}`)
            .join("&");
          url = `${url}?${queryParams}`;
        }
      } catch (e) {
        console.warn("Failed to parse specializationIds", e);
      }
    }

    apiClient
      .get(url, { headers })
      .then((res) => {
        if (!mounted) return;
        const data = Array.isArray(res.data) ? res.data : [];
        setConditions(data);
        // Expand all groups by default
        const expanded: Record<string, boolean> = {};
        data.forEach((g: ConditionGroup) => {
          expanded[g.key] = true;
        });
        setExpandedGroups(expanded);
      })
      .catch((e) => {
        console.warn("Failed to load conditions", e);
      })
      .finally(() => mounted && setLoading(false));

    return () => {
      mounted = false;
    };
  }, [headers, params.specializationIds]);

  const toggleCondition = useCallback((id: number) => {
    setSelectedIds((prev) => {
      if (prev.includes(id)) {
        return prev.filter((x) => x !== id);
      }
      return [...prev, id];
    });
  }, []);

  const toggleGroup = useCallback((key: string) => {
    setExpandedGroups((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  }, []);

  const handleBack = useCallback(() => {
    // Save to store and go back
    DraftStore.updatedConditions = selectedIds;
    router.back();
  }, [router, selectedIds]);

  if (loading) {
    return (
      <SafeAreaView
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#FFFFFF",
        }}
      >
        <ActivityIndicator size="large" color="#089769" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#FFFFFF" }}>
      {/* Header */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 16,
          paddingVertical: 14,
          backgroundColor: "#FFFFFF",
          borderBottomWidth: 1,
          borderBottomColor: "#E5E7EB",
        }}
      >
        <TouchableOpacity
          onPress={handleBack}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={{ padding: 6, marginRight: 8 }}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="chevron-back" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={{ fontSize: 20, fontWeight: "700", color: "#111827" }}>
          Conditions Treated
        </Text>
      </View>

      {/* Selection count */}
      <View
        style={{
          paddingHorizontal: 16,
          paddingVertical: 12,
          backgroundColor: "#FFFFFF",
          borderBottomWidth: 1,
          borderBottomColor: "#E5E7EB",
        }}
      >
        <Text style={{ fontSize: 14, color: "#6B7280" }}>
          {selectedIds.length === 0
            ? "Select conditions you treat"
            : `${selectedIds.length} condition${selectedIds.length !== 1 ? "s" : ""} selected`}
        </Text>
      </View>

      {/* Empty state */}
      {conditions.length === 0 && (
        <View
          style={{
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
          }}
        >
          <Ionicons
            name="information-circle-outline"
            size={48}
            color="#9CA3AF"
          />
          <Text
            style={{
              fontSize: 16,
              color: "#6B7280",
              textAlign: "center",
              marginTop: 12,
            }}
          >
            Select specializations first to see related conditions
          </Text>
        </View>
      )}

      {/* Grouped List */}
      <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
        {conditions.map((group) => (
          <View key={group.key}>
            {/* Group Header */}
            <TouchableOpacity
              onPress={() => toggleGroup(group.key)}
              activeOpacity={0.7}
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                paddingHorizontal: 16,
                paddingVertical: 14,
                backgroundColor: "#F3F4F6",
                borderBottomWidth: 1,
                borderBottomColor: "#E5E7EB",
              }}
            >
              <Text
                style={{ fontSize: 15, fontWeight: "600", color: "#374151" }}
              >
                {group.label}
              </Text>
              <Ionicons
                name={expandedGroups[group.key] ? "chevron-up" : "chevron-down"}
                size={20}
                color="#6B7280"
              />
            </TouchableOpacity>

            {/* Group Items */}
            {expandedGroups[group.key] &&
              (group.items ?? []).map((item, index) => {
                const isSelected = selectedIds.includes(item.id);
                return (
                  <TouchableOpacity
                    key={item.id}
                    onPress={() => toggleCondition(item.id)}
                    activeOpacity={0.7}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                      paddingHorizontal: 16,
                      paddingLeft: 28,
                      paddingVertical: 14,
                      backgroundColor: "#FFFFFF",
                      borderBottomWidth:
                        index < (group.items?.length ?? 0) - 1 ? 1 : 0,
                      borderBottomColor: "#F3F4F6",
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 15,
                        color: isSelected ? "#089769" : "#374151",
                        fontWeight: isSelected ? "600" : "400",
                        flex: 1,
                      }}
                    >
                      {item.name}
                    </Text>
                    {isSelected && (
                      <Ionicons
                        name="checkmark-circle"
                        size={22}
                        color="#089769"
                      />
                    )}
                  </TouchableOpacity>
                );
              })}
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

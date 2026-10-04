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

type Spec = { id: number; name: string };

export default function SelectSpecializations() {
  const router = useRouter();
  const { accessToken } = useAuth();
  const { width } = useWindowDimensions();
  const isMobile = Platform.OS !== "web" || width < 768;
  const params = useLocalSearchParams<{ selected?: string }>();

  const [specializations, setSpecializations] = useState<Spec[]>([]);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
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
        console.warn("Failed to parse selected specializations", e);
      }
    }
  }, [params.selected]);

  // Load specializations
  useEffect(() => {
    let mounted = true;
    setLoading(true);
    apiClient
      .get("/api/Onboarding/specializations", { headers })
      .then((res) => {
        if (!mounted) return;
        const data = Array.isArray(res.data) ? res.data : [];
        setSpecializations(data);
      })
      .catch((e) => {
        console.warn("Failed to load specializations", e);
      })
      .finally(() => mounted && setLoading(false));

    return () => {
      mounted = false;
    };
  }, [headers]);

  const toggleSpec = useCallback((id: number) => {
    setSelectedIds((prev) => {
      if (prev.includes(id)) {
        return prev.filter((x) => x !== id);
      }
      return [...prev, id];
    });
  }, []);

  const handleBack = useCallback(() => {
    // Save to store and go back
    DraftStore.updatedSpecializations = selectedIds;
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
          Specializations
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
            ? "Select your specializations"
            : `${selectedIds.length} specialization${selectedIds.length !== 1 ? "s" : ""} selected`}
        </Text>
      </View>

      {/* List */}
      <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
        {specializations.map((spec, index) => {
          const isSelected = selectedIds.includes(spec.id);
          return (
            <TouchableOpacity
              key={spec.id}
              onPress={() => toggleSpec(spec.id)}
              activeOpacity={0.7}
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                paddingHorizontal: 16,
                paddingVertical: 16,
                backgroundColor: "#FFFFFF",
                borderBottomWidth: index < specializations.length - 1 ? 1 : 0,
                borderBottomColor: "#F3F4F6",
              }}
            >
              <Text
                style={{
                  fontSize: 16,
                  color: isSelected ? "#089769" : "#374151",
                  fontWeight: isSelected ? "600" : "400",
                  flex: 1,
                }}
              >
                {spec.name}
              </Text>
              {isSelected && (
                <Ionicons name="checkmark-circle" size={24} color="#089769" />
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

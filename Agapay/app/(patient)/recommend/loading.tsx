import RecommendHeader from "@/src/components/RecommendHeader";
import { COLORS } from "@/src/theme";
import { useRouter } from "expo-router";
import React, { useEffect } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAuth } from "@/src/providers/AuthProvider";
import { useQueryClient } from "@tanstack/react-query";
import {
  fetchRecommendations,
  RECOMMENDATIONS_QUERY_KEY,
} from "@/src/services/recommendations";

/** Transitional screen shown after preferences submission while recommendations are being generated/fetched */
export default function RecommendLoading() {
  const router = useRouter();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  useEffect(() => {
    let cancelled = false;

    const loadData = async () => {
      // 1.5s minimum "generating" time for UX
      const timerPromise = new Promise((resolve) => setTimeout(resolve, 1500));

      // Prefetch data in background
      const dataPromise = (async () => {
        try {
          const userId = user?.id || user?._id || user?.userId;
          if (userId) {
            // We just cleared cache in step2, so this will fetch fresh data from API
            await queryClient.prefetchQuery({
              queryKey: RECOMMENDATIONS_QUERY_KEY,
              queryFn: () => fetchRecommendations(String(userId)),
            });
          }
        } catch (err) {
          console.warn("[RecommendLoading] Prefetch failed", err);
        }
      })();

      await Promise.all([timerPromise, dataPromise]);

      if (cancelled) return;

      // Navigate to results (no need for fresh=1 as we just populated cache)
      router.replace("/(patient)/recommend/results");
    };

    loadData();

    return () => {
      cancelled = true;
    };
  }, [router, user, queryClient]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <RecommendHeader
        title="Generating"
        currentStep={1}
        totalSteps={2}
        hideSteps
        backToHome
      />
      <View style={styles.center}>
        <ActivityIndicator size="large" color={COLORS.PRIMARY} />
        <Text style={styles.heading}>Generating Recommendations</Text>
        <Text style={styles.sub}>
          We are matching you with the best therapists based on your
          preferences.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.BG },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  heading: {
    marginTop: 28,
    fontSize: 20,
    fontWeight: "700",
    color: "#111",
  },
  sub: {
    marginTop: 12,
    fontSize: 14,
    lineHeight: 20,
    color: "#555",
    textAlign: "center",
  },
});

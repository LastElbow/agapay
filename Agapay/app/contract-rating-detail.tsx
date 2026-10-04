import React, { useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ArrowLeft, Star } from "lucide-react-native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { unreviewedContractsQueryKey } from "@/src/services/sessions";
import apiClient from "@/api/client";
import WebHeader from "@/src/components/WebHeader";

function getInitials(name?: string) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function ContractRatingDetailScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === "web" && width >= 768;

  const params = useLocalSearchParams<{
    contractId?: string;
    therapistId?: string;
    therapistName?: string;
    caseTitle?: string;
    endDate?: string;
  }>();

  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");

  const submitRatingMutation = useMutation({
    mutationFn: async () => {
      if (!params.contractId) throw new Error("Contract ID is missing");
      if (!params.therapistId) throw new Error("Therapist ID is missing");
      if (rating === 0) throw new Error("Please select a rating");

      const therapistId = Number.parseInt(params.therapistId, 10);
      const contractId = Number.parseInt(params.contractId, 10);

      if (!Number.isInteger(therapistId) || therapistId <= 0) {
        throw new Error("Invalid therapist ID");
      }

      if (!Number.isInteger(contractId) || contractId <= 0) {
        throw new Error("Invalid contract ID");
      }

      const payload = {
        therapistId,
        contractId,
        score: rating,
        comment: comment.trim().length > 0 ? comment.trim() : null,
      };

      console.log("Submitting rating with payload:", payload);

      const response = await apiClient.post(`/api/ratings`, payload);
      return response.data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: unreviewedContractsQueryKey });
      router.replace({ pathname: "/rating", params: { submitted: "1" } } as any);
    },
    onError: (error: any) => {
      const message =
        error?.response?.data?.message ||
        error?.message ||
        "Failed to submit rating. Please try again.";
      console.warn("Failed to submit rating", error);
      Alert.alert("Error", message);
    },
  });

  const handleSubmitRating = () => {
    if (rating === 0) {
      Alert.alert(
        "Rating Required",
        "Please select a star rating before submitting."
      );
      return;
    }
    submitRatingMutation.mutate();
  };

  // Desktop View
  if (isDesktop) {
    return (
      <View style={{ backgroundColor: "#e6f5f0" }} className="flex-1">
        <WebHeader />
        <SafeAreaView
          style={{ backgroundColor: "#e6f5f0" }}
          className="flex-1 w-full"
        >
          <ScrollView
            className="flex-1 w-full"
            showsVerticalScrollIndicator={false}
          >
            <View className="w-full max-w-screen-md mx-auto px-6 pt-8 pb-10">
              {/* Page Header - Matching rating.tsx design */}
              <View className="flex-row items-center mb-8">
                <TouchableOpacity
                  className="flex-row items-center px-4 py-2 rounded-xl bg-white border border-emerald-100 mr-4 hover:bg-emerald-50 transition-colors"
                  onPress={() => router.back()}
                >
                  <ArrowLeft size={18} color="#089769" />
                  <Text
                    style={{ color: "#089769" }}
                    className="font-semibold ml-2"
                  >
                    Back
                  </Text>
                </TouchableOpacity>
                <View className="flex-1">
                  <Text
                    style={{ color: "#089769" }}
                    className="text-xs font-semibold uppercase tracking-wide mb-1"
                  >
                    Feedback
                  </Text>
                  <Text className="text-3xl font-bold text-gray-900">
                    Rate Your Therapist
                  </Text>
                  <Text className="text-gray-500 mt-1">
                    Share your experience with your physical therapist
                  </Text>
                </View>
              </View>

              {/* Therapist Info Card - Matching rating.tsx DesktopContractCard style */}
              <View className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-4">
                <View className="p-5">
                  <View className="flex-row items-start">
                    {/* Avatar with initials */}
                    <View
                      className="w-16 h-16 rounded-full items-center justify-center"
                      style={{ backgroundColor: "#E0E7FF" }}
                    >
                      <Text
                        className="text-lg font-bold"
                        style={{ color: "#4F46E5" }}
                      >
                        {getInitials(params.therapistName)}
                      </Text>
                    </View>

                    {/* Therapist Details */}
                    <View className="flex-1 ml-4">
                      <Text className="text-lg font-bold text-gray-900 mb-1">
                        {params.therapistName || "Physical Therapist"}
                      </Text>
                      <Text className="text-sm text-gray-600 mb-2">
                        {params.caseTitle || "Therapy"}
                      </Text>
                      {params.endDate && (
                        <Text className="text-xs text-gray-500">
                          Contract ended on {params.endDate}
                        </Text>
                      )}
                    </View>
                  </View>
                </View>
              </View>

              {/* Rating Section */}
              <View className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
                <Text className="text-base font-semibold text-gray-900 mb-1">
                  How was your experience?
                </Text>
                <Text className="text-sm text-gray-500 mb-6">
                  Your feedback helps us improve our service
                </Text>

                {/* Star Rating */}
                <View className="items-center mb-2">
                  <View className="flex-row justify-center gap-3">
                    {[1, 2, 3, 4, 5].map((star) => {
                      const selected = rating >= star;
                      return (
                        <TouchableOpacity
                          key={star}
                          onPress={() => setRating(star)}
                          activeOpacity={0.7}
                          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        >
                          <Star
                            size={36}
                            strokeWidth={1.5}
                            color={selected ? "#F59E0B" : "#D1D5DB"}
                            fill={selected ? "#F59E0B" : "none"}
                          />
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  <View className="flex-row justify-between w-full mt-2 px-1">
                    <Text className="text-xs text-gray-400">Poor</Text>
                    <Text className="text-xs text-gray-400">Excellent</Text>
                  </View>
                </View>

                {/* Additional Comments */}
                <View className="mt-6">
                  <Text className="text-sm font-medium text-gray-700 mb-2">
                    Additional Comments (Optional)
                  </Text>
                  <TextInput
                    value={comment}
                    onChangeText={setComment}
                    placeholder="Share your experience with this therapist..."
                    placeholderTextColor="#9CA3AF"
                    multiline
                    numberOfLines={4}
                    textAlignVertical="top"
                    className="border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 bg-white"
                    style={{ minHeight: 100 }}
                  />
                </View>
              </View>

              {/* Submit Button */}
              <TouchableOpacity
                onPress={handleSubmitRating}
                disabled={submitRatingMutation.isPending || rating === 0}
                style={{
                  backgroundColor: rating > 0 ? "#089769" : "#9CA3AF",
                  opacity: submitRatingMutation.isPending ? 0.7 : 1,
                }}
                className="py-4 rounded-xl items-center justify-center"
              >
                {submitRatingMutation.isPending ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text className="text-white font-semibold text-base">
                    Submit Rating
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </SafeAreaView>
      </View>
    );
  }

  // Mobile View
  return (
    <SafeAreaView className="flex-1 bg-gray-50" edges={["top"]}>
      {/* Header */}
      <View className="bg-white border-b border-gray-200 px-4 py-3">
        <View className="flex-row items-center">
          <TouchableOpacity
            onPress={() => router.back()}
            className="mr-3 p-1"
            activeOpacity={0.7}
          >
            <ArrowLeft size={24} color="#000" />
          </TouchableOpacity>
          <Text className="text-xl font-bold text-gray-900 flex-1">
            Rate Your Therapist
          </Text>
        </View>
      </View>

      <ScrollView className="flex-1">
        <View className="p-4">
          {/* Therapist Card */}
          <View className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-4 shadow-sm">
            <View className="p-5">
              <View className="flex-row items-start">
                <View
                  className="w-16 h-16 rounded-full items-center justify-center"
                  style={{ backgroundColor: "#E0E7FF" }}
                >
                  <Text
                    className="text-lg font-bold"
                    style={{ color: "#4F46E5" }}
                  >
                    {getInitials(params.therapistName)}
                  </Text>
                </View>
                <View className="flex-1 ml-4">
                  <Text className="text-lg font-bold text-gray-900 mb-1">
                    {params.therapistName || "Physical Therapist"}
                  </Text>
                  <Text className="text-sm text-gray-600 mb-2">
                    {params.caseTitle || "Therapy"}
                  </Text>
                  {params.endDate && (
                    <Text className="text-xs text-gray-500">
                      Contract ended on {params.endDate}
                    </Text>
                  )}
                </View>
              </View>
            </View>
          </View>

          {/* Rating Section */}
          <View className="bg-white rounded-xl border border-gray-200 p-5 mb-4 shadow-sm">
            <Text className="text-base font-semibold text-gray-900 mb-1">
              How was your experience?
            </Text>
            <Text className="text-sm text-gray-500 mb-6">
              Your feedback helps us improve our service
            </Text>

            {/* Star Rating */}
            <View className="items-center mb-2">
              <View className="flex-row justify-center gap-3">
                {[1, 2, 3, 4, 5].map((star) => {
                  const selected = rating >= star;
                  return (
                    <TouchableOpacity
                      key={star}
                      onPress={() => setRating(star)}
                      activeOpacity={0.7}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                      <Star
                        size={36}
                        strokeWidth={1.5}
                        color={selected ? "#F59E0B" : "#D1D5DB"}
                        fill={selected ? "#F59E0B" : "none"}
                      />
                    </TouchableOpacity>
                  );
                })}
              </View>
              <View className="flex-row justify-between w-full mt-2 px-1">
                <Text className="text-xs text-gray-400">Poor</Text>
                <Text className="text-xs text-gray-400">Excellent</Text>
              </View>
            </View>

            {/* Additional Comments */}
            <View className="mt-6">
              <Text className="text-sm font-medium text-gray-700 mb-2">
                Additional Comments (Optional)
              </Text>
              <TextInput
                value={comment}
                onChangeText={setComment}
                placeholder="Share your experience with this therapist..."
                placeholderTextColor="#9CA3AF"
                multiline
                numberOfLines={4}
                textAlignVertical="top"
                className="border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 bg-white"
                style={{ minHeight: 100 }}
              />
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Fixed Submit Button at bottom */}
      <SafeAreaView edges={["bottom"]} className="bg-white border-t border-gray-100">
        <View className="px-4 py-4">
          <TouchableOpacity
            onPress={handleSubmitRating}
            disabled={submitRatingMutation.isPending || rating === 0}
            style={{
              backgroundColor: rating > 0 ? "#089769" : "#9CA3AF",
              opacity: submitRatingMutation.isPending ? 0.7 : 1,
            }}
            className="py-4 rounded-xl items-center justify-center"
          >
            {submitRatingMutation.isPending ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text className="text-white font-semibold text-base">
                Submit Rating
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </SafeAreaView>
  );
}

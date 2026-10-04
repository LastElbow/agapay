import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
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
import { validateTherapistProfessionalDetailsStep } from "@/src/features/onboarding/core/therapistProfessionalDetails";

type Specialization = {
  id: number;
  name: string;
};

export default function TherapistOnboarding2() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === "web" && width >= 768;
  const [specializations, setSpecializations] = useState<Specialization[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<number[]>(
    therapistOnboardingStore.specializationIds ?? [],
  );
  const [fee, setFee] = useState<string>(
    therapistOnboardingStore.feePerSession != null
      ? String(therapistOnboardingStore.feePerSession)
      : "",
  );
  const [error, setError] = useState<string | null>(null);
  // Gender selection has been moved to sign-up; remove from onboarding.

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    apiClient
      .get("/api/Onboarding/specializations")
      .then((res) => {
        if (!mounted) return;
        setSpecializations(res.data ?? []);
      })
      .catch((e) => {
        console.warn("failed to fetch specializations", e);
        setError("Failed to load specializations.");
      })
      .finally(() => mounted && setLoading(false));

    return () => {
      mounted = false;
    };
  }, []);

  const onContinue = () => {
    const out = validateTherapistProfessionalDetailsStep({
      specializationIds: selectedIds,
      feeText: fee,
    });

    if (!out.ok) {
      setError(out.error);
      return;
    }

    therapistOnboardingStore.setSpecializationIds(out.specializationIds);
    therapistOnboardingStore.setFeePerSession(out.feePerSession);

    // Log preview payload that will be sent in final onboarding
    const previewPayload = {
      profilePictureUri: therapistOnboardingStore.profilePicture,
      specializationIds: out.specializationIds,
      feePerSession: out.feePerSession,
      // placeholders for other arrays/fields
      conditionIds: therapistOnboardingStore.conditionIds || [],
    };
    console.log("[Onboarding preview] from step2:", previewPayload);
    console.log(
      "[Onboarding store] current state:",
      therapistOnboardingStore.getAll(),
    );

    // navigate to step 3
    router.push("/(therapist)/onboarding/step3");
  };

  const renderSpec = ({ item }: { item: Specialization }) => {
    const selected = selectedIds.includes(item.id);
    const toggle = () => {
      setError(null);
      if (selected) setSelectedIds((s) => s.filter((id) => id !== item.id));
      else setSelectedIds((s) => [...s, item.id]);
    };

    return (
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={toggle}
        className="mb-3 px-5 py-4 rounded-xl transition-all"
        style={{
          backgroundColor: selected ? "#E6F4F0" : "#FFFFFF",
          borderWidth: 2,
          borderColor: selected ? "#089769" : "#E5E7EB",
        }}
      >
        <Text
          style={{ color: selected ? "#089769" : "#374151" }}
          className={`text-base ${selected ? "font-semibold" : "font-medium"}`}
        >
          {item.name}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <View
      className="flex-1"
      style={{ backgroundColor: isDesktop ? "#e6f5f0" : "#F9FAFB" }}
    >
      {isDesktop ? (
        // Desktop Layout
        <ScrollView
          contentContainerStyle={{
            flexGrow: 1,
            justifyContent: "center",
            alignItems: "center",
            padding: 40,
          }}
          showsVerticalScrollIndicator={false}
        >
          <View
            style={{
              width: "100%",
              maxWidth: 500,
              backgroundColor: "#FFFFFF",
              borderRadius: 20,
              padding: 32,
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.1,
              shadowRadius: 16,
              elevation: 4,
            }}
          >
            {/* Back Button */}
            <TouchableOpacity
              onPress={() => router.back()}
              className="mb-6 flex-row items-center"
            >
              <ArrowLeft size={20} color="#089769" />
              <Text
                style={{ color: "#089769" }}
                className="font-semibold text-base ml-1"
              >
                Back
              </Text>
            </TouchableOpacity>

            {/* Header Section */}
            <View className="mb-6">
              <Text className="text-2xl font-bold text-gray-900 mb-2">
                Professional Details
              </Text>
              <Text className="text-sm text-gray-500">
                Share your expertise and fee
              </Text>
            </View>

            {/* Professional Fee */}
            <View className="mb-6">
              <Text className="text-sm font-medium text-gray-700 mb-2">
                Professional Fee per Session
              </Text>
              <TextInput
                className="bg-white border border-gray-200 rounded-xl px-4 py-3 text-base text-gray-900 w-40"
                value={fee}
                onChangeText={(text) => {
                  setError(null);
                  const filtered = text.replace(/[^0-9.]/g, "");
                  setFee(filtered);
                }}
                keyboardType="numeric"
                placeholder="e.g. 1500"
                placeholderTextColor="#9CA3AF"
              />
            </View>

            {/* Specializations */}
            <View className="mb-6">
              <Text className="text-sm font-medium text-gray-700 mb-3">
                Specializations
              </Text>

              {error && (
                <View className="bg-red-50 rounded-xl px-4 py-3 mb-4">
                  <Text className="text-sm text-red-600">{error}</Text>
                </View>
              )}

              {loading ? (
                <View className="items-center justify-center py-8">
                  <ActivityIndicator size="large" color="#089769" />
                </View>
              ) : (
                <View>
                  {specializations.map((item) => (
                    <TouchableOpacity
                      key={item.id}
                      activeOpacity={0.7}
                      onPress={() => {
                        setError(null);
                        if (selectedIds.includes(item.id)) {
                          setSelectedIds((s) =>
                            s.filter((id) => id !== item.id),
                          );
                        } else {
                          setSelectedIds((s) => [...s, item.id]);
                        }
                      }}
                      className="mb-3 px-4 py-3 rounded-xl"
                      style={{
                        backgroundColor: selectedIds.includes(item.id)
                          ? "#E6F4F0"
                          : "#FFFFFF",
                        borderWidth: 2,
                        borderColor: selectedIds.includes(item.id)
                          ? "#089769"
                          : "#E5E7EB",
                      }}
                    >
                      <Text
                        style={{
                          color: selectedIds.includes(item.id)
                            ? "#089769"
                            : "#374151",
                        }}
                        className={`text-base ${
                          selectedIds.includes(item.id)
                            ? "font-semibold"
                            : "font-medium"
                        }`}
                      >
                        {item.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>

            {/* Continue Button */}
            <TouchableOpacity
              className="py-4 rounded-xl items-center"
              style={{
                backgroundColor:
                  selectedIds.length > 0 && fee.trim() !== ""
                    ? "#089769"
                    : "#a8d5c8",
              }}
              onPress={onContinue}
              activeOpacity={
                selectedIds.length > 0 && fee.trim() !== "" ? 0.9 : 1
              }
              disabled={selectedIds.length === 0 || fee.trim() === ""}
            >
              <Text className="text-white font-semibold text-base tracking-wide">
                Continue
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      ) : (
        // Mobile Layout
        <>
          <View className="flex-1 px-6" style={{ paddingTop: insets.top + 24 }}>
            {/* Back Button */}
            <TouchableOpacity
              onPress={() => router.back()}
              className="mb-6 flex-row items-center"
            >
              <ArrowLeft size={24} color="#089769" />
              <Text
                style={{ color: "#089769" }}
                className="font-semibold text-base ml-1"
              >
                Back
              </Text>
            </TouchableOpacity>

            {/* Header Section */}
            <View className="mb-8">
              <Text className="text-3xl font-bold text-gray-900 mb-2">
                Professional Details
              </Text>
              <Text className="text-base text-gray-500">
                Share your expertise and fee
              </Text>
            </View>

            {/* Professional Fee */}
            <View className="mb-8">
              <Text className="text-sm font-medium text-gray-700 mb-3">
                Professional Fee per Session
              </Text>
              <TextInput
                className="bg-white border border-gray-200 rounded-2xl px-4 py-4 text-base text-gray-900 w-40"
                value={fee}
                onChangeText={(text) => {
                  setError(null);
                  const filtered = text.replace(/[^0-9.]/g, "");
                  setFee(filtered);
                }}
                keyboardType="numeric"
                placeholder="e.g. 1500"
                placeholderTextColor="#9CA3AF"
              />
            </View>

            {/* Specializations */}
            <View className="flex-1">
              <Text className="text-sm font-medium text-gray-700 mb-3">
                Specializations
              </Text>

              {error && (
                <View className="bg-red-50 rounded-2xl px-4 py-3 mb-4">
                  <Text className="text-sm text-red-600">{error}</Text>
                </View>
              )}

              {loading ? (
                <View className="flex-1 items-center justify-center">
                  <ActivityIndicator size="large" color="#089769" />
                </View>
              ) : (
                <FlatList
                  data={specializations}
                  keyExtractor={(i) => String(i.id)}
                  renderItem={renderSpec}
                  showsVerticalScrollIndicator={false}
                  contentContainerClassName="pb-4"
                />
              )}
            </View>
          </View>

          <View className="px-6 pb-8" style={{ backgroundColor: "#F9FAFB" }}>
            <TouchableOpacity
              className="py-4 rounded-2xl items-center shadow-sm"
              style={{
                backgroundColor:
                  selectedIds.length > 0 && fee.trim() !== ""
                    ? "#089769"
                    : "#a8d5c8",
              }}
              onPress={onContinue}
              activeOpacity={
                selectedIds.length > 0 && fee.trim() !== "" ? 0.9 : 1
              }
              disabled={selectedIds.length === 0 || fee.trim() === ""}
            >
              <Text className="text-white font-semibold text-base tracking-wide">
                Continue
              </Text>
            </TouchableOpacity>
          </View>
        </>
      )}
    </View>
  );
}

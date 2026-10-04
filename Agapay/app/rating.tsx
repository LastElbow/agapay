import React from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useFocusEffect } from "@react-navigation/native";
import {
  ActivityIndicator,
  Image,
  Platform,
  ScrollView,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ArrowLeft, Star, ChevronRight } from "lucide-react-native";
import {
  fetchUnreviewedContracts,
  unreviewedContractsQueryKey,
  type ContractSummary,
} from "@/src/services/sessions";
import WebHeader from "@/src/components/WebHeader";

function getInitials(name?: string) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function formatContractDate(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export default function RatingScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ submitted?: string }>();
  const submittedFlag = Array.isArray(params.submitted)
    ? params.submitted[0]
    : params.submitted;
  const [showSubmittedBanner, setShowSubmittedBanner] = React.useState(false);

  const {
    data: unreviewedContracts = [],
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: unreviewedContractsQueryKey,
    queryFn: fetchUnreviewedContracts,
    staleTime: 2 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });

  // Refetch when screen comes into focus to show updated list after rating
  useFocusEffect(
    React.useCallback(() => {
      refetch();
    }, [refetch]),
  );

  // When navigated to with submitted=1, show confirmation banner and refresh list
  React.useEffect(() => {
    if (submittedFlag === "1") {
      setShowSubmittedBanner(true);
      // Force a refresh to ensure the just-reviewed contract disappears immediately
      refetch();
      const t = setTimeout(() => setShowSubmittedBanner(false), 3500);
      return () => clearTimeout(t);
    }
  }, [submittedFlag, refetch]);

  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === "web" && width >= 768;

  // Desktop Contract Card
  const DesktopContractCard = ({ contract }: { contract: ContractSummary }) => {
    return (
      <TouchableOpacity
        className="bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-md transition-shadow"
        activeOpacity={0.7}
        onPress={() => {
          const params: Record<string, string> = {
            therapistName: contract.therapistName || "Physical Therapist",
            caseTitle: contract.caseToTreat || "Therapy",
            endDate: formatContractDate(contract.endDate),
            contractId: String(contract.id),
            therapistId: String(contract.physicalTherapistId),
          };
          router.push({ pathname: "/contract-rating-detail", params } as any);
        }}
      >
        <View className="p-5">
          <View className="flex-row items-start">
            {/* Therapist Avatar */}
            {contract.therapistProfilePictureUrl ? (
              <Image
                source={{ uri: contract.therapistProfilePictureUrl }}
                className="w-16 h-16 rounded-full"
              />
            ) : (
              <View className="w-16 h-16 rounded-full bg-gray-100 items-center justify-center">
                <Text className="text-gray-600 font-bold text-lg">
                  {getInitials(contract.therapistName || undefined)}
                </Text>
              </View>
            )}

            {/* Contract Details */}
            <View className="flex-1 ml-4">
              <View className="flex-row items-start justify-between">
                <View className="flex-1">
                  <Text className="text-lg font-bold text-gray-900 mb-1">
                    {contract.therapistName || "Physical Therapist"}
                  </Text>
                  <Text className="text-sm text-gray-600 mb-2">
                    {contract.caseToTreat || "Therapy"}
                  </Text>
                  <Text className="text-xs text-gray-500">
                    Contract ended on {formatContractDate(contract.endDate)}
                  </Text>
                </View>
                <ChevronRight size={20} color="#9CA3AF" />
              </View>

              {/* Call to Action */}
              <View className="flex-row items-center mt-3 pt-3 border-t border-gray-100">
                <Star size={16} color="#6B7280" />
                <Text className="text-sm text-gray-600 font-medium ml-1.5">
                  Click to rate this therapist
                </Text>
              </View>
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
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
            <View className="w-full max-w-screen-lg mx-auto px-6 pt-8 pb-10">
              {/* Page Header */}
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
                    Rate Your Therapists
                  </Text>
                  <Text className="text-gray-500 mt-1">
                    Share your experience with your physical therapists
                  </Text>
                </View>
                <View
                  style={{ backgroundColor: "#089769" }}
                  className="px-4 py-2 rounded-xl"
                >
                  <Text className="text-white font-bold text-lg">
                    {unreviewedContracts.length}
                  </Text>
                  <Text
                    style={{ color: "rgba(255,255,255,0.8)" }}
                    className="text-xs"
                  >
                    Pending
                  </Text>
                </View>
              </View>

              {/* Success Banner */}
              {showSubmittedBanner && (
                <View className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 mb-6">
                  <Text className="text-emerald-800 font-medium">
                    Your review was sent successfully.
                  </Text>
                </View>
              )}

              {/* Content */}
              {isLoading ? (
                <View className="bg-white rounded-2xl border border-gray-200 p-16 items-center justify-center">
                  <ActivityIndicator size="large" color="#089769" />
                  <Text className="text-gray-500 mt-4">
                    Loading contracts...
                  </Text>
                </View>
              ) : isError ? (
                <View className="bg-white rounded-2xl border border-gray-200 p-16 items-center justify-center">
                  <Text className="text-red-600 text-center mb-4">
                    Unable to load contracts
                  </Text>
                  <TouchableOpacity
                    onPress={() => refetch()}
                    style={{ backgroundColor: "#089769" }}
                    className="py-2.5 px-6 rounded-xl"
                    activeOpacity={0.8}
                  >
                    <Text className="text-white font-semibold">Try Again</Text>
                  </TouchableOpacity>
                </View>
              ) : unreviewedContracts.length === 0 ? (
                <View className="bg-white rounded-2xl border border-gray-200 p-16 items-center justify-center">
                  <View className="w-20 h-20 bg-gray-100 rounded-full items-center justify-center mb-4">
                    <Star size={40} color="#9CA3AF" />
                  </View>
                  <Text className="text-xl font-bold text-gray-900 mb-2">
                    All Caught Up!
                  </Text>
                  <Text className="text-gray-500 text-center max-w-md">
                    You don&apos;t have any completed contracts waiting for your
                    review.
                  </Text>
                </View>
              ) : (
                <View className="grid grid-cols-2 gap-4">
                  {unreviewedContracts.map((contract) => (
                    <DesktopContractCard
                      key={contract.id}
                      contract={contract}
                    />
                  ))}
                </View>
              )}
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
          <View className="flex-1">
            <Text className="text-xl font-bold text-gray-900">
              Rate Your Therapists
            </Text>
            <Text className="text-sm text-gray-500 mt-0.5">
              {unreviewedContracts.length === 0
                ? "No contracts to review"
                : `${unreviewedContracts.length} contract${
                    unreviewedContracts.length === 1 ? "" : "s"
                  } waiting for your review`}
            </Text>
          </View>

          <TouchableOpacity
            onPress={() => router.push("/rated-therapists")}
            className="p-2 bg-gray-100 rounded-full"
            activeOpacity={0.7}
          >
            <Text className="text-xs font-semibold text-gray-700 px-2">
              History
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView className="flex-1">
        <View className="p-4">
          {showSubmittedBanner ? (
            <View className="bg-green-50 border border-green-200 rounded-lg px-3 py-2 mb-3">
              <Text className="text-green-800 text-sm font-medium">
                Your review was sent successfully.
              </Text>
            </View>
          ) : null}
          {isLoading ? (
            <View className="items-center justify-center py-20">
              <ActivityIndicator size="large" color="#2563EB" />
              <Text className="text-gray-500 mt-3">Loading contracts...</Text>
            </View>
          ) : isError ? (
            <View className="items-center justify-center py-20">
              <Text className="text-red-600 text-center mb-3">
                Unable to load contracts
              </Text>
              <TouchableOpacity
                onPress={() => refetch()}
                className="bg-blue-600 py-2.5 px-5 rounded-lg"
                activeOpacity={0.8}
              >
                <Text className="text-white font-semibold">Try Again</Text>
              </TouchableOpacity>
            </View>
          ) : unreviewedContracts.length === 0 ? (
            <View className="items-center justify-center py-20">
              <View className="w-20 h-20 bg-gray-100 rounded-full items-center justify-center mb-4">
                <Star size={40} color="#9CA3AF" />
              </View>
              <Text className="text-lg font-semibold text-gray-900 mb-2">
                All Caught Up!
              </Text>
              <Text className="text-sm text-gray-500 text-center px-8">
                You don&apos;t have any completed contracts waiting for your
                review.
              </Text>
            </View>
          ) : (
            <View className="space-y-3">
              {unreviewedContracts.map((contract) => (
                <TouchableOpacity
                  key={contract.id}
                  activeOpacity={0.7}
                  onPress={() => {
                    const params: Record<string, string> = {
                      therapistName:
                        contract.therapistName || "Physical Therapist",
                      caseTitle: contract.caseToTreat || "Therapy",
                      endDate: formatContractDate(contract.endDate),
                      contractId: String(contract.id),
                      therapistId: String(contract.physicalTherapistId),
                    };
                    router.push({
                      pathname: "/contract-rating-detail",
                      params,
                    } as any);
                  }}
                  className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm mb-3"
                >
                  <View className="flex-row items-start">
                    {/* Therapist Avatar */}
                    {contract.therapistProfilePictureUrl ? (
                      <Image
                        source={{ uri: contract.therapistProfilePictureUrl }}
                        className="w-16 h-16 rounded-full"
                      />
                    ) : (
                      <View className="w-16 h-16 rounded-full bg-blue-100 items-center justify-center">
                        <Text className="text-blue-600 font-bold text-lg">
                          {getInitials(contract.therapistName || undefined)}
                        </Text>
                      </View>
                    )}

                    {/* Contract Details */}
                    <View className="flex-1 ml-4">
                      <Text className="text-base font-bold text-gray-900 mb-1">
                        {contract.therapistName || "Physical Therapist"}
                      </Text>
                      <Text className="text-sm text-gray-600 mb-2">
                        {contract.caseToTreat || "Therapy"}
                      </Text>

                      <View className="flex-row items-center mb-1">
                        <Text className="text-xs text-gray-500">
                          Contract ended on{" "}
                          {formatContractDate(contract.endDate)}
                        </Text>
                      </View>

                      {/* Call to Action */}
                      <View className="flex-row items-center mt-2">
                        <Star size={16} color="#2563EB" fill="#2563EB" />
                        <Text className="text-sm text-blue-600 font-semibold ml-1.5">
                          Tap to rate this therapist
                        </Text>
                      </View>
                    </View>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

import React, { useMemo } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
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
import { ArrowLeft, Star, ChevronRight, History } from "lucide-react-native";
import {
  fetchAllSessions,
  fetchUnreviewedContracts,
  allSessionsQueryKey,
  unreviewedContractsQueryKey,
  type SessionSummary,
  type ContractSummary,
} from "@/src/services/sessions";
import {
  fetchMyRatings,
  fetchTherapistRatingsById, // Added import
  patientRatingsQueryKey,
  type PatientRating,
} from "@/src/services/ratings";
import WebHeader from "@/src/components/WebHeader";

function getInitials(name?: string) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function formatContractDate(isoString: string): string {
  if (!isoString) return "";
  const date = new Date(isoString);
  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

// Helper to render star rating
const StarRating = ({ score }: { score: number }) => {
  return (
    <View className="flex-row">
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          size={14}
          color={star <= score ? "#F59E0B" : "#D1D5DB"}
          fill={star <= score ? "#F59E0B" : "none"}
          style={{ marginRight: 2 }}
        />
      ))}
    </View>
  );
};

export default function RatedTherapistsScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === "web" && width >= 768;

  // 1. Fetch ALL sessions to discover all contracts
  const { data: sessions = [], isLoading: isLoadingSessions } = useQuery({
    queryKey: allSessionsQueryKey,
    queryFn: fetchAllSessions,
    staleTime: 5 * 60 * 1000,
  });

  // 2. Fetch unreviewed contracts (mainly to exclude pending ones if needed, but ratings are source of truth now)
  const { data: unreviewedContracts = [], isLoading: isLoadingUnreviewed } =
    useQuery({
      queryKey: unreviewedContractsQueryKey,
      queryFn: fetchUnreviewedContracts,
      staleTime: 2 * 60 * 1000,
    });

  // 3. Derive Patient ID from sessions (all sessions belong to this patient)
  const patientId = useMemo(() => {
    if (sessions.length > 0) return sessions[0].patientId;
    return undefined;
  }, [sessions]);

  // (Removed fetchMyRatings usage)

  // 4. Derive "Rated Contracts" from sessions info first
  const derivedContracts = useMemo(() => {
    if (isLoadingSessions || isLoadingUnreviewed) return [];

    const contractMap = new Map<number, ContractSummary>();
    const sessionToContract = (s: SessionSummary): ContractSummary => ({
      id: s.contractId,
      patientId: s.patientId,
      physicalTherapistId: s.physicalTherapistId,
      therapistName: s.therapistName,
      therapistProfilePictureUrl: s.therapistProfilePictureUrl,
      startDate: s.startAt,
      endDate: s.endAt,
      status: s.contractStatus || "Unknown",
      caseToTreat: s.conditionCase,
    });

    sessions.forEach((session) => {
      if (!session.contractId) return;
      if (!contractMap.has(session.contractId)) {
        contractMap.set(session.contractId, sessionToContract(session));
      }
    });

    const allContracts = Array.from(contractMap.values());
    const endedContracts = allContracts.filter((c) => {
      const status = (c.status || "").toLowerCase();
      return status === "completed" || status === "terminated";
    });
    const unreviewedIds = new Set(unreviewedContracts.map((u) => u.id));

    // Contracts we believe are "Rated"
    return endedContracts.filter((c) => !unreviewedIds.has(c.id));
  }, [sessions, unreviewedContracts, isLoadingSessions, isLoadingUnreviewed]);

  // 5. Fetch Ratings for these specific therapists
  // We get unique therapist IDs from the derived contracts
  const therapistIds = useMemo(() => {
    const ids = new Set<number>();
    derivedContracts.forEach((c) => {
      if (c.physicalTherapistId) ids.add(c.physicalTherapistId);
    });
    return Array.from(ids);
  }, [derivedContracts]);

  // Use useQueries (or manual Promies.all in a generic useQuery) to fetch all their ratings
  // Since useQueries might not be available or syntax varies, we'll use a single useQuery that fetches all.
  const {
    data: therapistRatingsMap = new Map<number, PatientRating>(), // Map<ContractId, Rating>
    isLoading: isLoadingRatings,
    isFetching: isFetchingRatings,
  } = useQuery({
    queryKey: ["ratings", "history", "therapists", therapistIds],
    queryFn: async () => {
      if (therapistIds.length === 0) return new Map<number, PatientRating>();

      console.log("Fetching ratings for therapists:", therapistIds);

      // Fetch ratings for each therapist in parallel
      const promises = therapistIds.map((id) =>
        fetchTherapistRatingsById(id.toString()),
      );
      const results = await Promise.all(promises);

      const ratingMap = new Map<number, PatientRating>();

      results.flat().forEach((r: any) => {
        // We only care about ratings for *this* patient (implied by filtering later, or checking patientId)
        // Note: r is TherapistRating. We treat it as PatientRating for display.
        // Ensure we match the contractId
        ratingMap.set(r.contractId, {
          id: r.id,
          contractId: r.contractId,
          patientId: r.patientId,
          therapistId: 0, // Not in TherapistRating but we have key
          score: r.score,
          comment: r.comment,
          createdAt: r.createdAt,
          caseToTreat: r.caseToTreat,
          therapistName: undefined, // Already in contract
          therapistProfilePictureUrl: undefined, // Already in contract
        });
      });

      return ratingMap;
    },
    enabled: therapistIds.length > 0,
    staleTime: 5 * 60 * 1000,
  });

  const isLoading =
    isLoadingSessions ||
    isLoadingUnreviewed ||
    (derivedContracts.length > 0 && isLoadingRatings);

  // 6. Merge Contracts with Ratings
  const ratedItems = useMemo(() => {
    if (isLoading) return [];

    return derivedContracts.map((c) => {
      const rating = therapistRatingsMap.get(c.id);
      return {
        id: c.id,
        ratingId: rating?.id || 0,
        therapistName: c.therapistName || "Physical Therapist",
        therapistProfilePictureUrl: c.therapistProfilePictureUrl,
        caseToTreat: c.caseToTreat || "Therapy",
        // Use fetched rating score/comment, or fallback to 0/null
        score: rating?.score || 0,
        comment: rating?.comment || null,
        ratedAt: rating?.createdAt || c.endDate,
        contractId: c.id,
      };
    });
  }, [derivedContracts, therapistRatingsMap, isLoading]);

  const RatingCard = ({ item }: { item: any }) => (
    <View className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm mb-3">
      <View className="flex-row items-start">
        {/* Therapist Avatar */}
        {item.therapistProfilePictureUrl ? (
          <Image
            source={{ uri: item.therapistProfilePictureUrl }}
            className="w-14 h-14 rounded-full"
          />
        ) : (
          <View className="w-14 h-14 rounded-full bg-emerald-100 items-center justify-center">
            <Text className="text-emerald-700 font-bold text-lg">
              {getInitials(item.therapistName || undefined)}
            </Text>
          </View>
        )}

        {/* Details */}
        <View className="flex-1 ml-4">
          <View className="flex-row justify-between items-start">
            <View className="flex-1 mr-2">
              <Text className="text-base font-bold text-gray-900">
                {item.therapistName}
              </Text>
              <Text className="text-xs text-gray-500 mb-1">
                {item.caseToTreat}
              </Text>
            </View>
            {item.score > 0 && <StarRating score={item.score} />}
          </View>

          {item.comment ? (
            <View className="bg-gray-50 p-2 rounded-lg mt-2">
              <Text className="text-sm text-gray-700 italic">
                &quot;{item.comment}&quot;
              </Text>
            </View>
          ) : item.score > 0 ? (
            <Text className="text-xs text-gray-400 mt-1 italic">
              No text review provided.
            </Text>
          ) : (
            <Text className="text-xs text-gray-400 mt-1">
              Rating details unavailable
            </Text>
          )}

          <View className="flex-row items-center mt-3 justify-between">
            <Text className="text-[10px] text-gray-400">
              Contract #{item.id} • {item.score > 0 ? "Rated on " : "Ended on "}
              {formatContractDate(item.ratedAt)}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );

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
            <ArrowLeft size={24} color="#1F2937" />
          </TouchableOpacity>
          <View className="flex-1">
            <Text className="text-xl font-bold text-gray-900">
              Rated Therapists
            </Text>
            <Text className="text-sm text-gray-500 mt-0.5">
              History of your reviews
            </Text>
          </View>
        </View>
      </View>

      {/* Content */}
      <ScrollView className="flex-1 px-4 py-4">
        {isLoading ? (
          <View className="mt-10 items-center">
            <ActivityIndicator size="large" color="#10B981" />
            <Text className="text-gray-500 mt-3">Loading history...</Text>
          </View>
        ) : ratedItems.length === 0 ? (
          <View className="mt-20 items-center px-8">
            <View className="w-20 h-20 bg-gray-100 rounded-full items-center justify-center mb-4">
              <History size={40} color="#9CA3AF" />
            </View>
            <Text className="text-lg font-semibold text-gray-900 mb-2">
              No Rating History
            </Text>
            <Text className="text-gray-500 text-center">
              You haven&apos;t rated any therapists yet.
            </Text>
          </View>
        ) : (
          <View className="pb-10">
            {ratedItems.map((item) => (
              <RatingCard key={`${item.id}-${item.ratingId}`} item={item} />
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

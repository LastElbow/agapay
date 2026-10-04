import React, { useState, useMemo } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  Platform,
  useWindowDimensions,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  ArrowLeft,
  Search,
  UserPlus,
  X,
  Star,
  Users,
  Calendar,
  CheckCircle,
  XCircle,
} from "lucide-react-native";
import WebHeader from "@/src/components/WebHeader";
import InAppModal from "@/src/components/InAppModal";
import { useAuth } from "@/src/providers/AuthProvider";
import useColleaguesRealtime from "@/src/hooks/useColleaguesRealtime";
import useRelieverRealtime from "@/src/hooks/useRelieverRealtime";
import {
  fetchTherapists,
  fetchMyColleagues,
  fetchColleagueRequests,
  addColleague,
  removeColleague,
  acceptColleagueRequest,
  declineColleagueRequest,
  type TherapistListItem,
  type TherapistColleague,
  type ColleagueRequestsResponse,
  type IncomingRequest,
  THERAPISTS_QUERY_KEY,
  MY_COLLEAGUES_QUERY_KEY,
  COLLEAGUE_REQUESTS_QUERY_KEY,
} from "@/src/services/therapists";
import {
  fetchRelieverProposals,
  type RelieverProposal,
  acceptRelieverProposal,
  declineRelieverProposal,
} from "@/src/services/sessions";

export default function ColleagueNetworkScreen() {
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === "web" && width >= 768;
  const { user: authUser } = useAuth();

  // Show loading state while auth is initializing
  if (!authUser) {
    return (
      <SafeAreaView
        className={`flex-1 ${isDesktop ? "bg-[#e6f5f0]" : "bg-white"}`}
      >
        {isDesktop && <WebHeader />}
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#089769" />
          <Text className="text-gray-500 mt-4">Loading...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <ColleagueNetworkScreenInner isDesktop={isDesktop} authUser={authUser} />
  );
}

type AuthUser = NonNullable<ReturnType<typeof useAuth>["user"]>;

function ColleagueNetworkScreenInner({
  isDesktop,
  authUser,
}: {
  isDesktop: boolean;
  authUser: AuthUser;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<
    "my-network" | "add-new" | "colleague-requests" | "reliever-requests"
  >("my-network");
  const [selectedSpecializations, setSelectedSpecializations] = useState<
    string[]
  >([]);

  const [modalConfig, setModalConfig] = useState<{
    visible: boolean;
    title: string;
    message: string;
    confirmText: string;
    cancelText: string;
    isDestructive: boolean;
    onConfirm: () => void;
  }>({
    visible: false,
    title: "",
    message: "",
    confirmText: "OK",
    cancelText: "Cancel",
    isDestructive: false,
    onConfirm: () => {},
  });

  const [relieverModalConfig, setRelieverModalConfig] = useState<{
    visible: boolean;
    sessionId: number | null;
  }>({
    visible: false,
    sessionId: null,
  });

  // Fetch requests
  const { data: requests, isLoading: isLoadingRequests } =
    useQuery<ColleagueRequestsResponse>({
      queryKey: COLLEAGUE_REQUESTS_QUERY_KEY,
      queryFn: fetchColleagueRequests,
    });

  // Fetch my trusted colleagues
  const { data: myColleagues, isLoading: isLoadingColleagues } = useQuery<
    TherapistColleague[]
  >({
    queryKey: MY_COLLEAGUES_QUERY_KEY,
    queryFn: fetchMyColleagues,
  });

  // Fetch all available therapists for adding
  const { data: therapistsData, isLoading: isLoadingTherapists } = useQuery({
    queryKey: THERAPISTS_QUERY_KEY,
    queryFn: () => fetchTherapists(1, 100), // Fetch more therapists for colleague network
    // Remove enabled condition to allow real-time updates even when not on this tab
  });

  const allTherapists = therapistsData?.items || [];

  // Fetch reliever proposals
  const {
    data: relieverProposals = [],
    isLoading: isLoadingRelieverProposals,
    refetch: refetchRelieverProposals,
  } = useQuery<RelieverProposal[]>({
    queryKey: ["reliever-proposals"],
    queryFn: fetchRelieverProposals,
    staleTime: 0, // Always fetch fresh data
    gcTime: 5 * 60 * 1000, // Keep in cache for 5 minutes
    retry: 1,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  });

  // Setup real-time colleague updates
  useColleaguesRealtime();
  useRelieverRealtime();

  const incomingRequests = requests?.incoming || [];
  const outgoingRequests = requests?.outgoing || [];

  // Add colleague mutation with optimistic updates
  const addMutation = useMutation({
    mutationFn: ({
      colleagueId,
      notes,
    }: {
      colleagueId: number;
      notes?: string;
    }) => addColleague(colleagueId, notes),
    onMutate: async ({ colleagueId }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({
        queryKey: COLLEAGUE_REQUESTS_QUERY_KEY,
      });

      // Snapshot
      const previousRequests =
        queryClient.getQueryData<ColleagueRequestsResponse>(
          COLLEAGUE_REQUESTS_QUERY_KEY,
        );

      // Optimistically update
      if (previousRequests) {
        const therapistToAdd = allTherapists?.find((t) => t.id === colleagueId);
        if (therapistToAdd) {
          const optimisticRequest = {
            id: therapistToAdd.id,
            name: therapistToAdd.name || "Unknown",
            requestedAt: new Date().toISOString(),
          };

          queryClient.setQueryData<ColleagueRequestsResponse>(
            COLLEAGUE_REQUESTS_QUERY_KEY,
            {
              ...previousRequests,
              outgoing: [...previousRequests.outgoing, optimisticRequest],
            },
          );
        }
      }

      return { previousRequests };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: COLLEAGUE_REQUESTS_QUERY_KEY });
      Alert.alert("Success", "Request sent successfully!");
    },
    onError: (error: any, _variables, context) => {
      if (context?.previousRequests) {
        queryClient.setQueryData(
          COLLEAGUE_REQUESTS_QUERY_KEY,
          context.previousRequests,
        );
      }
      Alert.alert(
        "Error",
        error?.response?.data?.message || "Failed to send request",
      );
    },
  });

  const acceptMutation = useMutation({
    mutationFn: (senderId: number) => acceptColleagueRequest(senderId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: COLLEAGUE_REQUESTS_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: MY_COLLEAGUES_QUERY_KEY });
      Alert.alert("Accepted", "Colleague added to your network");
    },
    onError: (error: any) => {
      Alert.alert(
        "Error",
        error?.response?.data?.message || "Failed to accept request",
      );
    },
  });

  const declineMutation = useMutation({
    mutationFn: (senderId: number) => declineColleagueRequest(senderId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: COLLEAGUE_REQUESTS_QUERY_KEY });
      Alert.alert("Declined", "Request declined");
    },
    onError: (error: any) => {
      Alert.alert(
        "Error",
        error?.response?.data?.message || "Failed to decline request",
      );
    },
  });

  const removeMutation = useMutation({
    mutationFn: (colleagueId: number) => removeColleague(colleagueId),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: MY_COLLEAGUES_QUERY_KEY });
      Alert.alert("Success", "Colleague removed from your network");
    },
    onError: (error: any) => {
      Alert.alert(
        "Error",
        error?.response?.data?.message || "Failed to remove colleague",
      );
    },
  });

  const acceptRelieverMutation = useMutation({
    mutationFn: (sessionId: number) => acceptRelieverProposal(sessionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reliever-proposals"] });
      queryClient.invalidateQueries({
        queryKey: ["sessions", "therapist", "all"],
      });
      Alert.alert(
        "Success",
        "Reliever request accepted! The session has been added to your schedule.",
      );
    },
    onError: (error: any) => {
      Alert.alert(
        "Error",
        error?.response?.data?.message || "Failed to accept reliever request",
      );
    },
  });

  const declineRelieverMutation = useMutation({
    mutationFn: (sessionId: number) => declineRelieverProposal(sessionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reliever-proposals"] });
      Alert.alert("Declined", "Reliever request declined");
    },
    onError: (error: any) => {
      Alert.alert(
        "Error",
        error?.response?.data?.message || "Failed to decline reliever request",
      );
    },
  });

  const handleAddColleague = (therapist: TherapistListItem) => {
    setModalConfig({
      visible: true,
      title: "Add to Network",
      message: `Add ${therapist.name} to your trusted colleague network?`,
      confirmText: "Add",
      cancelText: "Cancel",
      isDestructive: false,
      onConfirm: () => {
        addMutation.mutate({ colleagueId: therapist.id });
        setModalConfig((prev) => ({ ...prev, visible: false }));
      },
    });
  };

  const handleRemoveColleague = (colleague: TherapistColleague) => {
    setModalConfig({
      visible: true,
      title: "Remove Colleague",
      message: `Remove ${colleague.name} from your network?`,
      confirmText: "Remove",
      cancelText: "Cancel",
      isDestructive: true,
      onConfirm: () => {
        removeMutation.mutate(colleague.id);
        setModalConfig((prev) => ({ ...prev, visible: false }));
      },
    });
  };

  // Filter therapists for search and specialization
  const filteredTherapists = allTherapists?.filter((therapist) => {
    const inMyNetwork = myColleagues?.some((c) => c.id === therapist.id);
    const isRequested = outgoingRequests.some((r) => r.id === therapist.id);

    // If it's in my network, we hide it.
    // If it's requested, we show it (to display "Requested" badge)
    if (inMyNetwork) return false;

    // Filter by specialization (multiple selection)
    if (selectedSpecializations.length > 0) {
      const hasMatchingSpecialization = therapist.specializations?.some(
        (spec) => selectedSpecializations.includes(spec),
      );
      if (!hasMatchingSpecialization) return false;
    }

    // Filter by search query
    if (!searchQuery) return true;

    const query = searchQuery.toLowerCase();
    const nameMatch = therapist.name?.toLowerCase().includes(query);
    const specMatch = therapist.specializations?.some((spec) =>
      spec.toLowerCase().includes(query),
    );

    return nameMatch || specMatch;
  });

  // Get unique specializations for filter
  const availableSpecializations = useMemo(() => {
    const specs = new Set<string>();
    allTherapists?.forEach((t) => {
      t.specializations?.forEach((s) => specs.add(s));
    });
    return Array.from(specs).sort();
  }, [allTherapists]);

  const renderMyNetwork = () => (
    <ScrollView className="flex-1 px-4 pt-4">
      <View className="mb-4">
        <Text className="text-lg font-bold text-gray-900 mb-1">
          My Trusted Colleagues
        </Text>
        <Text className="text-sm text-gray-600">
          {myColleagues?.length || 0} colleagues in your network
        </Text>
      </View>

      {isLoadingColleagues ? (
        <View className="py-8 items-center">
          <ActivityIndicator size="large" color="#089769" />
          <Text className="text-gray-500 mt-2">Loading colleagues...</Text>
        </View>
      ) : myColleagues && myColleagues.length > 0 ? (
        myColleagues.map((colleague) => (
          <View
            key={colleague.id}
            className="bg-white rounded-xl p-4 mb-3 border border-gray-200"
          >
            <View className="flex-row items-start">
              <View className="w-12 h-12 rounded-full bg-[#089769] items-center justify-center mr-3">
                <Text className="text-white font-bold text-lg">
                  {colleague.name?.charAt(0) || "?"}
                </Text>
              </View>
              <View className="flex-1">
                <Text className="text-base font-bold text-gray-900 mb-1">
                  {colleague.name}
                </Text>
                <Text className="text-sm text-gray-600 mb-2">
                  {colleague.specializations?.join(", ") ||
                    "Physical Therapist"}
                </Text>
                {colleague.averageRating != null && (
                  <View className="flex-row items-center">
                    <Star color="#F59E0B" size={14} fill="#F59E0B" />
                    <Text className="text-sm text-gray-700 ml-1">
                      {colleague.averageRating?.toFixed(1) || "0.0"} (
                      {colleague.ratingCount || 0} reviews)
                    </Text>
                  </View>
                )}
                {colleague.notes && (
                  <Text className="text-xs text-gray-500 mt-2 italic">
                    Note: {colleague.notes}
                  </Text>
                )}
              </View>
              <TouchableOpacity
                onPress={() => handleRemoveColleague(colleague)}
                className="ml-2 p-2"
                disabled={removeMutation.isPending}
              >
                <X color="#EF4444" size={20} />
              </TouchableOpacity>
            </View>
          </View>
        ))
      ) : (
        <View className="bg-gray-50 rounded-xl p-8 items-center">
          <Users color="#9CA3AF" size={48} />
          <Text className="text-gray-600 text-center mt-4 text-base font-semibold">
            No colleagues in your network yet
          </Text>
          <Text className="text-gray-500 text-center mt-2 text-sm">
            Add trusted colleagues to quickly select them as relievers when
            needed
          </Text>
          <TouchableOpacity
            onPress={() => setActiveTab("add-new")}
            className="mt-4 bg-[#089769] px-6 py-3 rounded-lg"
          >
            <Text className="text-white font-semibold">Add Colleagues</Text>
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );

  const renderAddNew = () => (
    <View className="flex-1">
      {/* Search Bar */}
      <View className="px-4 pt-4 pb-2">
        <View className="flex-row items-center bg-gray-100 rounded-lg px-3 py-2">
          <Search color="#6B7280" size={20} />
          <TextInput
            placeholder="Search by name or specialization..."
            value={searchQuery}
            onChangeText={setSearchQuery}
            className="flex-1 ml-2 text-sm text-gray-900"
            placeholderTextColor="#9CA3AF"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery("")}>
              <X color="#6B7280" size={20} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Specialization Filter */}
      <View className="px-4 pb-3">
        <View className="flex-row items-center justify-between mb-2">
          <Text className="text-xs text-gray-600">
            Filter by specialization (tap to toggle)
          </Text>
          {selectedSpecializations.length > 0 && (
            <TouchableOpacity onPress={() => setSelectedSpecializations([])}>
              <Text
                className="text-xs font-semibold"
                style={{ color: "#089769" }}
              >
                Clear All
              </Text>
            </TouchableOpacity>
          )}
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {availableSpecializations.map((spec) => {
            const isSelected = selectedSpecializations.includes(spec);
            return (
              <TouchableOpacity
                key={spec}
                onPress={() => {
                  if (isSelected) {
                    setSelectedSpecializations(
                      selectedSpecializations.filter((s) => s !== spec),
                    );
                  } else {
                    setSelectedSpecializations([
                      ...selectedSpecializations,
                      spec,
                    ]);
                  }
                }}
                className={`mr-2 px-4 py-2 rounded-full ${
                  isSelected ? "bg-[#089769]" : "bg-gray-100"
                }`}
              >
                <Text
                  className={`text-sm font-semibold ${
                    isSelected ? "text-white" : "text-gray-700"
                  }`}
                >
                  {spec}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      <ScrollView className="flex-1 px-4">
        {isLoadingTherapists ? (
          <View className="py-8 items-center">
            <ActivityIndicator size="large" color="#089769" />
            <Text className="text-gray-500 mt-2">Loading therapists...</Text>
          </View>
        ) : filteredTherapists && filteredTherapists.length > 0 ? (
          filteredTherapists.map((therapist) => (
            <View
              key={therapist.id}
              className="bg-white rounded-xl p-4 mb-3 border border-gray-200"
            >
              <View className="flex-row items-start">
                <View className="w-12 h-12 rounded-full bg-[#089769] items-center justify-center mr-3">
                  <Text className="text-white font-bold text-lg">
                    {therapist.name?.charAt(0) || "?"}
                  </Text>
                </View>
                <View className="flex-1">
                  <Text className="text-base font-bold text-gray-900 mb-1">
                    {therapist.name}
                  </Text>
                  <Text className="text-sm text-gray-600 mb-2">
                    {therapist.specializations?.join(", ") ||
                      "Physical Therapist"}
                  </Text>
                  {therapist.averageRating !== undefined &&
                    therapist.averageRating !== null && (
                      <View className="flex-row items-center">
                        <Star color="#F59E0B" size={14} fill="#F59E0B" />
                        <Text className="text-sm text-gray-700 ml-1">
                          {therapist.averageRating.toFixed(1)} (
                          {therapist.ratingCount || 0} reviews)
                        </Text>
                      </View>
                    )}
                </View>
                {myColleagues?.some((c) => c.id === therapist.id) ? (
                  <View className="ml-2 bg-gray-100 px-4 py-2 rounded-lg flex-row items-center border border-gray-200">
                    <Users color="gray" size={16} />
                    <Text className="text-gray-500 font-semibold ml-1 text-sm">
                      Connected
                    </Text>
                  </View>
                ) : outgoingRequests.some((r) => r.id === therapist.id) ? (
                  <View className="ml-2 bg-gray-300 px-4 py-2 rounded-lg flex-row items-center">
                    <UserPlus color="white" size={16} />
                    <Text className="text-white font-semibold ml-1 text-sm">
                      Requested
                    </Text>
                  </View>
                ) : (
                  <TouchableOpacity
                    onPress={() => handleAddColleague(therapist)}
                    className="ml-2 bg-[#089769] px-4 py-2 rounded-lg flex-row items-center"
                    disabled={addMutation.isPending}
                  >
                    <UserPlus color="white" size={16} />
                    <Text className="text-white font-semibold ml-1 text-sm">
                      Add
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          ))
        ) : (
          <View className="bg-gray-50 rounded-xl p-8 items-center mt-4">
            <Search color="#9CA3AF" size={48} />
            <Text className="text-gray-600 text-center mt-4">
              {searchQuery
                ? "No therapists found"
                : "Start searching to find colleagues"}
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );

  const renderRequests = () => (
    <ScrollView className="flex-1 px-4 pt-4">
      <View className="mb-4">
        <Text className="text-lg font-bold text-gray-900 mb-1">
          Incoming Requests
        </Text>
        <Text className="text-sm text-gray-600">
          Colleagues who want to add you to their network
        </Text>
      </View>

      {isLoadingRequests ? (
        <View className="py-8 items-center">
          <ActivityIndicator size="large" color="#089769" />
          <Text className="text-gray-500 mt-2">Loading requests...</Text>
        </View>
      ) : incomingRequests.length > 0 ? (
        incomingRequests.map((req) => (
          <View
            key={req.id}
            className="bg-white rounded-xl p-4 mb-3 border border-gray-200"
          >
            <View className="flex-row items-start">
              <View className="w-12 h-12 rounded-full bg-[#089769] items-center justify-center mr-3">
                <Text className="text-white font-bold text-lg">
                  {req.name?.charAt(0) || "?"}
                </Text>
              </View>
              <View className="flex-1">
                <Text className="text-base font-bold text-gray-900 mb-1">
                  {req.name}
                </Text>
                <Text className="text-sm text-gray-600 mb-2">
                  {req.specializations?.join(", ") || "Physical Therapist"}
                </Text>
                <Text className="text-xs text-gray-500 mb-2">
                  Requested: {new Date(req.requestedAt).toLocaleDateString()}
                </Text>
                {req.notes && (
                  <Text className="text-xs text-gray-500 italic mb-2">
                    &quot;{req.notes}&quot;
                  </Text>
                )}
                <View className="flex-row mt-2 space-x-2">
                  <TouchableOpacity
                    onPress={() => acceptMutation.mutate(req.id)}
                    className="bg-[#089769] px-4 py-2 rounded-lg flex-1 items-center"
                    disabled={acceptMutation.isPending}
                  >
                    <Text className="text-white font-semibold text-sm">
                      Accept
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => declineMutation.mutate(req.id)}
                    className="bg-gray-200 px-4 py-2 rounded-lg flex-1 items-center"
                    disabled={declineMutation.isPending}
                  >
                    <Text className="text-gray-700 font-semibold text-sm">
                      Decline
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </View>
        ))
      ) : (
        <View className="bg-gray-50 rounded-xl p-8 items-center">
          <Users color="#9CA3AF" size={48} />
          <Text className="text-gray-600 text-center mt-4 text-base font-semibold">
            No pending requests
          </Text>
          <Text className="text-gray-500 text-center mt-2 text-sm">
            You&apos;re all caught up!
          </Text>
        </View>
      )}
    </ScrollView>
  );

  const renderRelieverRequests = () => (
    <ScrollView className="flex-1 px-4 pt-4">
      <View className="mb-4">
        <Text className="text-lg font-bold text-gray-900 mb-1">
          Reliever Requests
        </Text>
        <Text className="text-sm text-gray-600">
          Sessions where you&apos;ve been proposed as a substitute therapist
        </Text>
      </View>

      {isLoadingRelieverProposals ? (
        <View className="py-8 items-center">
          <ActivityIndicator size="large" color="#089769" />
          <Text className="text-gray-500 mt-2">Loading requests...</Text>
        </View>
      ) : relieverProposals.length > 0 ? (
        relieverProposals.map((proposal) => (
          <View
            key={proposal.id}
            className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-3"
          >
            <View className="flex-row items-start justify-between mb-2">
              <View className="flex-1">
                <Text className="text-sm font-bold text-amber-900">
                  {proposal.patientName || "Patient"}
                </Text>
                <Text className="text-xs text-amber-700 mt-0.5">
                  Suggested by {proposal.originalTherapistName || "Therapist"}
                </Text>
              </View>
            </View>

            {proposal.relieverSubstitutionReason && (
              <View className="bg-white/50 rounded-lg p-2 mb-2">
                <Text className="text-xs text-amber-800 italic">
                  &quot;{proposal.relieverSubstitutionReason}&quot;
                </Text>
              </View>
            )}

            {proposal.proposedRescheduleStartAt && (
              <View className="flex-row items-center mt-2">
                <Calendar size={14} color="#92400E" />
                <Text className="text-xs text-amber-900 ml-2 font-medium">
                  {new Date(proposal.proposedRescheduleStartAt).toLocaleString(
                    undefined,
                    {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                      hour12: true,
                    },
                  )}
                </Text>
              </View>
            )}

            {proposal.conditionCase && (
              <View className="flex-row items-center mt-1">
                <Text className="text-xs text-amber-700">
                  Case: {proposal.conditionCase}
                </Text>
              </View>
            )}

            {proposal.locationAddress && (
              <View className="flex-row items-center mt-1">
                <Text className="text-xs text-amber-700">
                  📍 {proposal.locationAddress}
                </Text>
              </View>
            )}

            <View className="flex-row mt-3 space-x-2">
              <TouchableOpacity
                onPress={() => {
                  setRelieverModalConfig({
                    visible: true,
                    sessionId: proposal.id,
                  });
                }}
                className="bg-[#089769] px-4 py-2 rounded-lg flex-1 items-center flex-row justify-center"
                disabled={
                  acceptRelieverMutation.isPending ||
                  declineRelieverMutation.isPending
                }
              >
                <CheckCircle color="white" size={16} />
                <Text className="text-white font-semibold text-sm ml-2">
                  Accept
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => declineRelieverMutation.mutate(proposal.id)}
                className="bg-gray-200 px-4 py-2 rounded-lg flex-1 items-center flex-row justify-center"
                disabled={
                  acceptRelieverMutation.isPending ||
                  declineRelieverMutation.isPending
                }
              >
                <XCircle color="#374151" size={16} />
                <Text className="text-gray-700 font-semibold text-sm ml-2">
                  Decline
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        ))
      ) : (
        <View className="bg-gray-50 rounded-xl p-8 items-center">
          <Users color="#9CA3AF" size={48} />
          <Text className="text-gray-600 text-center mt-4 text-base font-semibold">
            No reliever requests
          </Text>
          <Text className="text-gray-500 text-center mt-2 text-sm">
            You&apos;ll see requests here when colleagues propose you as a
            substitute therapist
          </Text>
        </View>
      )}
    </ScrollView>
  );

  return (
    <SafeAreaView
      className={`flex-1 ${isDesktop ? "bg-[#e6f5f0]" : "bg-white"}`}
    >
      {isDesktop ? (
        <WebHeader />
      ) : (
        <View className="flex-row items-center px-4 py-3 bg-white border-b border-gray-200">
          <TouchableOpacity onPress={() => router.back()} className="mr-3">
            <ArrowLeft color="#111827" size={24} />
          </TouchableOpacity>
          <Text className="text-xl font-bold text-gray-900">
            Colleague Network
          </Text>
        </View>
      )}

      {/* Desktop Container */}
      {isDesktop ? (
        <View className="flex-1 items-center py-6">
          <View className="w-full max-w-4xl bg-white rounded-2xl shadow-sm overflow-hidden">
            {/* Tabs */}
            <View className="flex-row border-b border-gray-200">
              <TouchableOpacity
                onPress={() => setActiveTab("my-network")}
                className={`flex-1 py-4 items-center ${
                  activeTab === "my-network"
                    ? "border-b-2 border-[#089769]"
                    : ""
                }`}
              >
                <Text
                  className={`font-semibold ${
                    activeTab === "my-network"
                      ? "text-[#089769]"
                      : "text-gray-600"
                  }`}
                >
                  My Network ({myColleagues?.length || 0})
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setActiveTab("add-new")}
                className={`flex-1 py-4 items-center ${
                  activeTab === "add-new" ? "border-b-2 border-[#089769]" : ""
                }`}
              >
                <Text
                  className={`font-semibold ${
                    activeTab === "add-new" ? "text-[#089769]" : "text-gray-600"
                  }`}
                >
                  Add Colleagues
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setActiveTab("colleague-requests")}
                className={`flex-1 py-4 items-center ${
                  activeTab === "colleague-requests"
                    ? "border-b-2 border-[#089769]"
                    : ""
                }`}
              >
                <View className="flex-row items-center">
                  <Text
                    className={`font-semibold ${
                      activeTab === "colleague-requests"
                        ? "text-[#089769]"
                        : "text-gray-600"
                    }`}
                  >
                    Colleague Requests
                  </Text>
                  {incomingRequests.length > 0 && (
                    <View className="ml-2 bg-red-500 px-2 py-0.5 rounded-full min-w-[20px] items-center justify-center">
                      <Text className="text-white text-xs font-bold">
                        {incomingRequests.length}
                      </Text>
                    </View>
                  )}
                </View>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setActiveTab("reliever-requests")}
                className={`flex-1 py-4 items-center ${
                  activeTab === "reliever-requests"
                    ? "border-b-2 border-[#089769]"
                    : ""
                }`}
              >
                <View className="flex-row items-center">
                  <Text
                    className={`font-semibold ${
                      activeTab === "reliever-requests"
                        ? "text-[#089769]"
                        : "text-gray-600"
                    }`}
                  >
                    Reliever Requests
                  </Text>
                  {relieverProposals.length > 0 && (
                    <View className="ml-2 bg-amber-500 px-2 py-0.5 rounded-full min-w-[20px] items-center justify-center">
                      <Text className="text-white text-xs font-bold">
                        {relieverProposals.length}
                      </Text>
                    </View>
                  )}
                </View>
              </TouchableOpacity>
            </View>

            {/* Content */}
            <View className="h-[600px]">
              {activeTab === "my-network"
                ? renderMyNetwork()
                : activeTab === "add-new"
                  ? renderAddNew()
                  : activeTab === "colleague-requests"
                    ? renderRequests()
                    : renderRelieverRequests()}
            </View>
          </View>
        </View>
      ) : (
        <>
          {/* Mobile Tabs */}
          <View className="flex-row border-b border-gray-200 bg-white">
            <TouchableOpacity
              onPress={() => setActiveTab("my-network")}
              className={`flex-1 py-3 items-center ${
                activeTab === "my-network" ? "border-b-2 border-[#089769]" : ""
              }`}
            >
              <Text
                className={`font-semibold text-sm ${
                  activeTab === "my-network"
                    ? "text-[#089769]"
                    : "text-gray-600"
                }`}
              >
                My Network ({myColleagues?.length || 0})
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setActiveTab("add-new")}
              className={`flex-1 py-3 items-center ${
                activeTab === "add-new" ? "border-b-2 border-[#089769]" : ""
              }`}
            >
              <Text
                className={`font-semibold text-sm ${
                  activeTab === "add-new" ? "text-[#089769]" : "text-gray-600"
                }`}
              >
                Add
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setActiveTab("colleague-requests")}
              className={`flex-1 py-3 items-center ${
                activeTab === "colleague-requests"
                  ? "border-b-2 border-[#089769]"
                  : ""
              }`}
            >
              <View className="flex-row items-center">
                <Text
                  className={`font-semibold text-sm ${
                    activeTab === "colleague-requests"
                      ? "text-[#089769]"
                      : "text-gray-600"
                  }`}
                >
                  Colleague
                </Text>
                {incomingRequests.length > 0 && (
                  <View className="ml-1.5 bg-red-500 px-1.5 py-0.5 rounded-full min-w-[18px] items-center justify-center">
                    <Text className="text-white text-xs font-bold">
                      {incomingRequests.length}
                    </Text>
                  </View>
                )}
              </View>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setActiveTab("reliever-requests")}
              className={`flex-1 py-3 items-center ${
                activeTab === "reliever-requests"
                  ? "border-b-2 border-[#089769]"
                  : ""
              }`}
            >
              <View className="flex-row items-center">
                <Text
                  className={`font-semibold text-sm ${
                    activeTab === "reliever-requests"
                      ? "text-[#089769]"
                      : "text-gray-600"
                  }`}
                >
                  Reliever
                </Text>
                {relieverProposals.length > 0 && (
                  <View className="ml-1.5 bg-amber-500 px-1.5 py-0.5 rounded-full min-w-[18px] items-center justify-center">
                    <Text className="text-white text-xs font-bold">
                      {relieverProposals.length}
                    </Text>
                  </View>
                )}
              </View>
            </TouchableOpacity>
          </View>

          {/* Content */}
          {activeTab === "my-network"
            ? renderMyNetwork()
            : activeTab === "add-new"
              ? renderAddNew()
              : activeTab === "colleague-requests"
                ? renderRequests()
                : renderRelieverRequests()}
        </>
      )}

      <InAppModal
        visible={modalConfig.visible}
        title={modalConfig.title}
        message={modalConfig.message}
        confirmText={modalConfig.confirmText}
        cancelText={modalConfig.cancelText}
        showCancel={true}
        onConfirm={modalConfig.onConfirm}
        onCancel={() => setModalConfig((prev) => ({ ...prev, visible: false }))}
        isDestructive={modalConfig.isDestructive}
      />

      <InAppModal
        visible={relieverModalConfig.visible}
        title="Accept Reliever Request"
        message="Are you sure you want to accept this reliever request? You will be assigned as the substitute therapist for this session."
        confirmText="Accept"
        cancelText="Cancel"
        showCancel={true}
        onConfirm={() => {
          if (relieverModalConfig.sessionId) {
            acceptRelieverMutation.mutate(relieverModalConfig.sessionId);
          }
          setRelieverModalConfig({ visible: false, sessionId: null });
        }}
        onCancel={() =>
          setRelieverModalConfig({ visible: false, sessionId: null })
        }
        isDestructive={false}
        variant="confirm"
      />
    </SafeAreaView>
  );
}

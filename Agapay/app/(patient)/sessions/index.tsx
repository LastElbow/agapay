import React, { useCallback, useMemo, useState, useEffect } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Platform,
  useWindowDimensions,
} from "react-native";
import { useQuery } from "@tanstack/react-query";
import {
  fetchAllSessions,
  fetchUpcomingSessions,
} from "@/src/services/sessions";
import { useRouter } from "expo-router";
import RecommendHeader from "@/src/components/RecommendHeader";
import WebHeader from "@/src/components/WebHeader";
import {
  Calendar,
  Clock,
  MapPin,
  ArrowLeft,
  CalendarDays,
  History,
  ChevronRight,
} from "lucide-react-native";
import {
  deriveContractStatusKey,
  toDisplayStatus,
} from "@/src/utils/statusLabels";

const formatSessionDateLabel = (isoString: string) => {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return "Upcoming Session";
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

const getSessionStatusColor = (badgeLabel: string) => {
  const normalized = String(badgeLabel ?? "").toLowerCase();
  if (normalized === "cancelled") return "#DC2626";
  if (normalized === "contract completed") return "#059669";
  if (normalized === "discontinued") return "#6B7280";
  if (normalized === "done for today") return "#6B7280";
  if (normalized.includes("pending")) return "#F97316";
  return "#6B7280";
};

export default function AccountSessions() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === "web" && width >= 768;

  const query = useQuery({
    queryKey: ["sessions", "all"],
    queryFn: fetchAllSessions,
    staleTime: 60_000,
  });
  const upcomingQuery = useQuery({
    queryKey: ["sessions", "upcoming"],
    queryFn: () => fetchUpcomingSessions(50),
    staleTime: 60_000,
  });
  const sessions = Array.isArray(query.data) ? query.data : [];
  const allUpcomingSessions = Array.isArray(upcomingQuery.data)
    ? upcomingQuery.data
    : [];

  // Filter upcoming vs history based on contract status and date
  const upcomingSessions = allUpcomingSessions.filter((s) => {
    const contractStatus = (s.contractStatus ?? "").toLowerCase();
    // Exclude completed or terminated contracts from upcoming
    if (contractStatus === "completed" || contractStatus === "terminated") {
      return false;
    }
    return true;
  });

  // Create a set of session IDs that are already in upcoming to avoid duplicates
  const upcomingSessionIds = new Set(upcomingSessions.map((s) => s.id));

  // Show all other sessions (future or past) that aren't in the upcoming list
  const historySessions = sessions.filter((s) => {
    // Don't show sessions that are already in the upcoming list
    if (upcomingSessionIds.has(s.id)) {
      return false;
    }
    return true;
  });

  const [statusFilter, setStatusFilter] = useState<string>("all");

  const timeFormatter = useMemo(() => {
    return new Intl.DateTimeFormat(undefined, {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  }, []);

  const formatSessionTimeRangeLabel = useCallback(
    (startIso: string, endIso: string) => {
      const start = new Date(startIso);
      const end = new Date(endIso);
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
        return "Time TBD";
      }
      try {
        return `${timeFormatter.format(start)} - ${timeFormatter.format(end)}`;
      } catch {
        return "Time TBD";
      }
    },
    [timeFormatter],
  );

  const allSessionsForFilter = useMemo(
    () => [...upcomingSessions, ...historySessions],
    [upcomingSessions, historySessions],
  );

  const contractStatusOptions = useMemo(() => {
    const available = new Set<string>();
    allSessionsForFilter.forEach((session) => {
      available.add(
        deriveContractStatusKey(session.contractStatus, session.status),
      );
    });
    const preferredOrder = [
      "active",
      "pendingconfirmation",
      "completed",
      "terminated",
      "cancelled",
      "expired",
      "declined",
    ];
    const ordered = preferredOrder.filter((status) => available.has(status));
    const extras = Array.from(available)
      .filter((status) => !preferredOrder.includes(status))
      .sort();
    return ["all", ...ordered, ...extras];
  }, [allSessionsForFilter]);

  useEffect(() => {
    if (!contractStatusOptions.includes(statusFilter)) {
      setStatusFilter("all");
    }
  }, [contractStatusOptions, statusFilter]);

  const filteredUpcomingSessions = useMemo(
    () =>
      statusFilter === "all"
        ? upcomingSessions
        : upcomingSessions.filter(
            (session) =>
              deriveContractStatusKey(
                session.contractStatus,
                session.status,
              ) === statusFilter,
          ),
    [upcomingSessions, statusFilter],
  );

  const filteredHistorySessions = useMemo(
    () =>
      statusFilter === "all"
        ? historySessions
        : historySessions.filter(
            (session) =>
              deriveContractStatusKey(
                session.contractStatus,
                session.status,
              ) === statusFilter,
          ),
    [historySessions, statusFilter],
  );

  const formatFilterLabel = (value: string) =>
    value === "all"
      ? "All"
      : toDisplayStatus(value) ||
        value.charAt(0).toUpperCase() + value.slice(1);

  const sessionKeyExtractor = useCallback(
    (session: any) => String(session.id),
    [],
  );

  const renderItem = useCallback(
    ({ item }: any) => {
      // Determine display status based on contract status if available
      let displayStatus = item.status;
      const contractStatus = (item.contractStatus ?? "").toLowerCase();
      const sessionStatus = (item.status ?? "").toLowerCase();
      const isSessionCancelled =
        sessionStatus === "cancelled" || sessionStatus === "canceled";
      const isDoneForToday =
        sessionStatus === "donefortoday" || sessionStatus === "done for today";

      // Priority order for display status:
      // 1. Show contract status if it's completed or terminated
      // 2. Show "Cancelled" for cancelled sessions
      // 3. Show other statuses as appropriate
      if (contractStatus === "completed") {
        displayStatus = "Contract Completed";
      } else if (contractStatus === "terminated") {
        displayStatus = "Discontinued";
      } else if (isSessionCancelled) {
        displayStatus = "Cancelled";
      } else if (isDoneForToday) {
        displayStatus = "Done for today";
      } else if (contractStatus === "pendingconfirmation") {
        displayStatus = "Pending Confirmation";
      }

      if ((displayStatus ?? "").toLowerCase() === "terminated") {
        displayStatus = "Discontinued";
      }

      // Determine status color
      const badgeLabel = toDisplayStatus(displayStatus) || displayStatus;
      const statusColor = getSessionStatusColor(badgeLabel);

      return (
        <TouchableOpacity
          className="bg-white p-4 mb-3 rounded-xl border border-gray-200"
          onPress={() =>
            router.push({
              pathname: "/create-session",
              params: { sessionId: String(item.id) },
            } as any)
          }
        >
          <View className="flex-row items-start justify-between mb-3">
            <Text className="font-bold text-base text-gray-900 flex-1">
              {item.therapistName ?? "Therapist"}
            </Text>
            <View
              className="px-3 py-1 rounded-full"
              style={{ backgroundColor: `${statusColor}1A` }}
            >
              <Text
                className="text-xs font-semibold"
                style={{ color: statusColor }}
              >
                {badgeLabel}
              </Text>
            </View>
          </View>

          <View className="gap-2">
            <View className="flex-row items-center">
              <Calendar color="#111827" size={16} />
              <Text className="text-sm text-gray-600 ml-2">
                {formatSessionDateLabel(String(item.startAt ?? ""))}
              </Text>
            </View>

            <View className="flex-row items-center">
              <Clock color="#111827" size={16} />
              <Text className="text-sm text-gray-600 ml-2">
                {formatSessionTimeRangeLabel(
                  String(item.startAt ?? ""),
                  String(item.endAt ?? ""),
                )}
              </Text>
            </View>

            {item.locationAddress ? (
              <View className="flex-row items-center">
                <MapPin color="#111827" size={16} />
                <Text
                  className="text-sm text-gray-600 ml-2 flex-1"
                  numberOfLines={1}
                >
                  {item.locationAddress}
                </Text>
              </View>
            ) : null}
          </View>
        </TouchableOpacity>
      );
    },
    [formatSessionTimeRangeLabel, router],
  );

  if (query.isLoading || upcomingQuery.isLoading) {
    return (
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator />
      </View>
    );
  }

  // Desktop Session Card Component
  const DesktopSessionCard = ({ item }: { item: any }) => {
    // Determine display status
    let displayStatus = item.status;
    const contractStatus = (item.contractStatus ?? "").toLowerCase();
    const sessionStatus = (item.status ?? "").toLowerCase();
    const isSessionCancelled =
      sessionStatus === "cancelled" || sessionStatus === "canceled";
    const isDoneForToday =
      sessionStatus === "donefortoday" || sessionStatus === "done for today";

    if (contractStatus === "completed") {
      displayStatus = "Contract Completed";
    } else if (contractStatus === "terminated") {
      displayStatus = "Discontinued";
    } else if (isSessionCancelled) {
      displayStatus = "Cancelled";
    } else if (isDoneForToday) {
      displayStatus = "Done for Today";
    } else if (contractStatus === "pendingconfirmation") {
      displayStatus = "Pending Confirmation";
    }

    if ((displayStatus ?? "").toLowerCase() === "terminated") {
      displayStatus = "Discontinued";
    }

    const badgeLabel = toDisplayStatus(displayStatus) || displayStatus;
    const statusColor = getSessionStatusColor(badgeLabel);

    return (
      <TouchableOpacity
        className="bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-md transition-shadow"
        onPress={() =>
          router.push({
            pathname: "/create-session",
            params: { sessionId: String(item.id) },
          } as any)
        }
        activeOpacity={0.7}
      >
        <View className="p-5">
          <View className="flex-row items-start justify-between mb-4">
            <View className="flex-1">
              <Text className="font-bold text-lg text-gray-900 mb-1">
                {item.therapistName ?? "Therapist"}
              </Text>
              <View
                className="px-3 py-1 rounded-full self-start"
                style={{ backgroundColor: `${statusColor}15` }}
              >
                <Text
                  className="text-xs font-semibold"
                  style={{ color: statusColor }}
                >
                  {badgeLabel}
                </Text>
              </View>
            </View>
            <ChevronRight size={20} color="#9CA3AF" />
          </View>

          <View className="flex-row flex-wrap gap-4">
            <View className="flex-row items-center">
              <Calendar color="#6B7280" size={16} />
              <Text className="text-sm text-gray-600 ml-2">
                {formatSessionDateLabel(String(item.startAt ?? ""))}
              </Text>
            </View>

            <View className="flex-row items-center">
              <Clock color="#6B7280" size={16} />
              <Text className="text-sm text-gray-600 ml-2">
                {formatSessionTimeRangeLabel(
                  String(item.startAt ?? ""),
                  String(item.endAt ?? ""),
                )}
              </Text>
            </View>

            {item.locationAddress ? (
              <View className="flex-row items-center flex-1">
                <MapPin color="#6B7280" size={16} />
                <Text className="text-sm text-gray-600 ml-2" numberOfLines={1}>
                  {item.locationAddress}
                </Text>
              </View>
            ) : null}
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
                  onPress={() => router.replace("/(patient)/(tabs)")}
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
                    Manage Sessions
                  </Text>
                  <Text className="text-3xl font-bold text-gray-900">
                    My Sessions
                  </Text>
                  <Text className="text-gray-500 mt-1">
                    View and manage your therapy sessions
                  </Text>
                </View>
                <View
                  style={{ backgroundColor: "#089769" }}
                  className="px-4 py-2 rounded-xl"
                >
                  <Text className="text-white font-bold text-lg">
                    {filteredUpcomingSessions.length +
                      filteredHistorySessions.length}
                  </Text>
                  <Text
                    style={{ color: "rgba(255,255,255,0.8)" }}
                    className="text-xs"
                  >
                    Total Sessions
                  </Text>
                </View>
              </View>

              {/* Filter Bar */}
              {contractStatusOptions.length > 1 && (
                <View className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4 mb-6">
                  <View className="flex-row items-center">
                    <Text className="font-semibold text-gray-700 mr-4">
                      Filter by status:
                    </Text>
                    <View className="flex-row flex-wrap gap-2 flex-1">
                      {contractStatusOptions.map((option) => {
                        const isActive = statusFilter === option;
                        return (
                          <TouchableOpacity
                            key={option}
                            style={
                              isActive
                                ? { backgroundColor: "#089769" }
                                : undefined
                            }
                            className={`px-4 py-2 rounded-xl border-2 transition-colors ${
                              isActive
                                ? "border-transparent"
                                : "border-gray-200 bg-white hover:border-gray-300"
                            }`}
                            onPress={() => setStatusFilter(option)}
                          >
                            <Text
                              className={`text-sm font-medium ${
                                isActive ? "text-white" : "text-gray-600"
                              }`}
                            >
                              {formatFilterLabel(option)}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                </View>
              )}

              {/* Two Column Layout */}
              <View className="flex-row gap-6">
                {/* Upcoming Sessions Column */}
                <View className="flex-1">
                  <View className="flex-row items-center mb-4">
                    <View className="w-10 h-10 rounded-full bg-emerald-100 items-center justify-center mr-3">
                      <CalendarDays size={20} color="#089769" />
                    </View>
                    <View>
                      <Text className="text-lg font-bold text-gray-900">
                        Upcoming Sessions
                      </Text>
                      <Text className="text-sm text-gray-500">
                        {filteredUpcomingSessions.length} session
                        {filteredUpcomingSessions.length !== 1 ? "s" : ""}
                      </Text>
                    </View>
                  </View>

                  <View className="gap-3">
                    {filteredUpcomingSessions.length === 0 ? (
                      <View className="bg-white rounded-xl border border-gray-200 p-8 items-center">
                        <View className="w-16 h-16 rounded-full bg-gray-100 items-center justify-center mb-4">
                          <CalendarDays size={32} color="#9CA3AF" />
                        </View>
                        <Text className="text-gray-500 text-center">
                          {statusFilter === "all"
                            ? "No upcoming sessions"
                            : "No sessions for this status"}
                        </Text>
                        {statusFilter !== "all" && (
                          <TouchableOpacity
                            onPress={() => setStatusFilter("all")}
                            className="mt-3"
                          >
                            <Text
                              style={{ color: "#089769" }}
                              className="font-semibold text-sm"
                            >
                              Clear filter
                            </Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    ) : (
                      filteredUpcomingSessions.map((session: any) => (
                        <DesktopSessionCard key={session.id} item={session} />
                      ))
                    )}
                  </View>
                </View>

                {/* Session History Column */}
                <View className="flex-1">
                  <View className="flex-row items-center mb-4">
                    <View className="w-10 h-10 rounded-full bg-gray-100 items-center justify-center mr-3">
                      <History size={20} color="#6B7280" />
                    </View>
                    <View>
                      <Text className="text-lg font-bold text-gray-900">
                        Session History
                      </Text>
                      <Text className="text-sm text-gray-500">
                        {filteredHistorySessions.length} session
                        {filteredHistorySessions.length !== 1 ? "s" : ""}
                      </Text>
                    </View>
                  </View>

                  <View className="gap-3">
                    {filteredHistorySessions.length === 0 ? (
                      <View className="bg-white rounded-xl border border-gray-200 p-8 items-center">
                        <View className="w-16 h-16 rounded-full bg-gray-100 items-center justify-center mb-4">
                          <History size={32} color="#9CA3AF" />
                        </View>
                        <Text className="text-gray-500 text-center">
                          {statusFilter === "all"
                            ? "No session history"
                            : "No sessions for this status"}
                        </Text>
                        {statusFilter !== "all" && (
                          <TouchableOpacity
                            onPress={() => setStatusFilter("all")}
                            className="mt-3"
                          >
                            <Text
                              style={{ color: "#089769" }}
                              className="font-semibold text-sm"
                            >
                              Clear filter
                            </Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    ) : (
                      filteredHistorySessions.map((session: any) => (
                        <DesktopSessionCard key={session.id} item={session} />
                      ))
                    )}
                  </View>
                </View>
              </View>
            </View>
          </ScrollView>
        </SafeAreaView>
      </View>
    );
  }

  // Mobile View
  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: "#e6f5f0" }}>
      <RecommendHeader
        title="Sessions"
        currentStep={1}
        totalSteps={1}
        backToHome
        hideSteps
      />
      <ScrollView className="p-4 flex-1">
        {contractStatusOptions.length > 1 ? (
          <View className="flex-row flex-wrap items-center -mx-1 mb-3">
            {contractStatusOptions.map((option) => {
              const isActive = statusFilter === option;
              return (
                <TouchableOpacity
                  key={option}
                  className={`px-3 py-1.5 mx-1 mb-2 border rounded-full ${
                    isActive
                      ? "bg-[#0D9488] border-[#0D9488]"
                      : "border-gray-300"
                  }`}
                  onPress={() => setStatusFilter(option)}
                >
                  <Text
                    className={`text-sm font-medium ${
                      isActive ? "text-white" : "text-gray-700"
                    }`}
                  >
                    {formatFilterLabel(option)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        ) : null}
        <Text className="text-lg font-medium text-black mb-2">
          Upcoming Sessions
        </Text>
        {filteredUpcomingSessions.length === 0 ? (
          <View className="mb-4">
            <Text className="text-[#666]">
              {statusFilter === "all"
                ? "No upcoming sessions."
                : "No upcoming sessions for this status."}
            </Text>
            {statusFilter !== "all" ? (
              <TouchableOpacity
                onPress={() => setStatusFilter("all")}
                className="mt-2"
              >
                <Text className="text-[#089769] font-semibold text-sm">
                  Clear filter
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : (
          <FlatList
            data={filteredUpcomingSessions}
            renderItem={renderItem}
            keyExtractor={sessionKeyExtractor}
            scrollEnabled={false}
          />
        )}

        <Text className="text-lg font-medium text-black mb-2 mt-4">
          Session History
        </Text>
        {filteredHistorySessions.length === 0 ? (
          <View className="mb-6">
            <Text className="text-[#666]">
              {statusFilter === "all"
                ? "No session history."
                : "No sessions found for this status."}
            </Text>
            {statusFilter !== "all" ? (
              <TouchableOpacity
                onPress={() => setStatusFilter("all")}
                className="mt-2"
              >
                <Text className="text-[#089769] font-semibold text-sm">
                  Clear filter
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : (
          <FlatList
            data={filteredHistorySessions}
            renderItem={renderItem}
            keyExtractor={sessionKeyExtractor}
            scrollEnabled={false}
          />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

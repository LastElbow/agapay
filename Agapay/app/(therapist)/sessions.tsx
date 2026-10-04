import TherapistVerificationBanner from "@/src/components/TherapistVerificationBanner";
import {
  fetchAllSessions,
  SessionSummary,
  fetchSessionDetail,
  sessionDetailQueryKey,
  fetchUpcomingSessions,
} from "@/src/services/sessions";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import {
  ArrowLeft,
  Calendar,
  Clock,
  MapPin,
  CalendarDays,
  History,
  ChevronRight,
  RefreshCw,
} from "lucide-react-native";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Platform,
  useWindowDimensions,
  ActivityIndicator,
  SectionList,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Skeleton from "@/src/components/Skeleton";
import WebHeader from "@/src/components/WebHeader";
import { useTherapistStatus } from "@/src/hooks/useTherapistStatus";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  deriveContractStatusKey,
  toDisplayStatus,
} from "@/src/utils/statusLabels";
import {
  computeTherapistSessionBuckets,
  isTherapistSessionEditable,
  resolveTherapistSessionStatusDisplay,
} from "@/src/features/sessions/core/therapistSessionsModel";
import { getUserFacingSessionsErrorMessage } from "@/src/features/sessions/core/userFacingErrors";

type MobileSessionSectionKey = "upcoming" | "rescheduled" | "history";

type MobileSessionSection = {
  key: MobileSessionSectionKey;
  title: string;
  data: SessionSummary[];
};

function SessionCard({ session }: { session: SessionSummary }) {
  const router = useRouter();
  // If the summary lacks contractStatus, fetch detail to get an accurate status
  const needsDetail =
    !session.contractStatus || String(session.contractStatus).trim() === "";
  const { data: detail } = useQuery({
    queryKey: sessionDetailQueryKey(session.id),
    queryFn: () => fetchSessionDetail(session.id),
    enabled: needsDetail,
    staleTime: 30_000,
  });

  const formatSessionDate = (startIso: string) => {
    const date = new Date(startIso);
    if (Number.isNaN(date.getTime())) return "Upcoming Session";
    return new Intl.DateTimeFormat(undefined, {
      weekday: "long",
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(date);
  };

  const formatSessionTimeRange = (startIso: string, endIso: string) => {
    const start = new Date(startIso);
    const end = new Date(endIso);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return "";
    const formatter = new Intl.DateTimeFormat(undefined, {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
    return `${formatter.format(start)} - ${formatter.format(end)}`;
  };

  const resolveStatusDisplay = () => {
    const contractStatusRaw =
      detail?.contractStatus ?? session.contractStatus ?? "";
    return resolveTherapistSessionStatusDisplay({
      contractStatus: contractStatusRaw,
      sessionStatus: session.status,
      startAtIso: session.startAt,
    });
  };

  const { label: statusLabel, badgeClass: statusBadgeClass } =
    resolveStatusDisplay();

  const effectiveContractStatus =
    detail?.contractStatus ?? session.contractStatus ?? "";
  const isEditable = isTherapistSessionEditable({
    contractStatus: effectiveContractStatus,
    sessionStatus: session.status,
  });

  return (
    <TouchableOpacity
      className="bg-white p-4 rounded-xl mb-4 border border-gray-200"
      onPress={() =>
        router.push({
          pathname: "/session-view",
          params: {
            sessionId: String(session.id),
            profileId: String(session.patientId),
            therapistName: session.therapistName ?? undefined,
            patientName: session.patientName ?? undefined,
            startAt: session.startAt,
            endAt: session.endAt,
          },
        })
      }
    >
      <View className="flex-row justify-between items-center mb-3">
        <Text className="text-lg font-bold text-gray-800">
          {session.patientName || "Patient"}
        </Text>
        <View className="flex-row items-center gap-2">
          {session.isRescheduled && (
            <Text className="text-[9px] font-bold px-2 py-1 rounded-full bg-amber-100 text-amber-800">
              RESCHEDULED
            </Text>
          )}
          {session.isRelieverProposed && (
            <Text className="text-[9px] font-bold px-2 py-1 rounded-full bg-teal-100 text-teal-800">
              RELIEVER
            </Text>
          )}
          <Text
            className={`text-xs font-bold px-2 py-1 rounded-full ${statusBadgeClass}`}
          >
            {statusLabel}
          </Text>
        </View>
      </View>
      <View className="flex-row items-center mb-2">
        <Calendar size={16} color="#6B7280" />
        <Text className="text-gray-600 ml-2">
          {formatSessionDate(session.startAt)}
        </Text>
      </View>
      <View className="flex-row items-center mb-2">
        <Clock size={16} color="#6B7280" />
        <Text className="text-gray-600 ml-2">
          {formatSessionTimeRange(session.startAt, session.endAt)}
        </Text>
      </View>
      {session.locationAddress && (
        <View className="flex-row items-center">
          <MapPin size={16} color="#6B7280" />
          <Text className="text-gray-600 ml-2">{session.locationAddress}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

function SessionSkeleton() {
  return (
    <View className="bg-white p-4 rounded-xl mb-4 border border-gray-200">
      <View className="flex-row justify-between items-center mb-3">
        <Skeleton style={{ width: 128, height: 24 }} />
        <Skeleton style={{ width: 80, height: 24 }} />
      </View>
      <Skeleton style={{ width: 160, height: 20, marginBottom: 8 }} />
      <Skeleton style={{ width: 192, height: 20, marginBottom: 8 }} />
      <Skeleton style={{ width: "100%", height: 20 }} />
    </View>
  );
}

export default function TherapistSessionsScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === "web" && width >= 768;
  const therapistStatus = useTherapistStatus();
  const { isRestricted } = therapistStatus;
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["sessions", "all"],
    queryFn: fetchAllSessions,
    enabled: !isRestricted,
  });

  const upcomingQuery = useQuery({
    queryKey: ["sessions", "upcoming"],
    queryFn: () => fetchUpcomingSessions(50),
    staleTime: 60_000,
    enabled: !isRestricted,
  });

  const sessions = useMemo<SessionSummary[]>(
    () => (Array.isArray(data) ? data : []),
    [data],
  );

  const allUpcomingSessions = useMemo<SessionSummary[]>(
    () => (Array.isArray(upcomingQuery.data) ? upcomingQuery.data : []),
    [upcomingQuery.data],
  );

  const { upcomingSessions, rescheduledSessions, historySessions } = useMemo(
    () =>
      computeTherapistSessionBuckets({
        sessions,
        upcomingSessions: allUpcomingSessions,
      }),
    [sessions, allUpcomingSessions],
  );

  const [statusFilter, setStatusFilter] = useState<string>("all");

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

  const filteredUpcomingSessions = useMemo(() => {
    if (statusFilter === "all") return upcomingSessions;
    return upcomingSessions.filter(
      (session) =>
        deriveContractStatusKey(session.contractStatus, session.status) ===
        statusFilter,
    );
  }, [upcomingSessions, statusFilter]);

  const filteredHistorySessions = useMemo(() => {
    if (statusFilter === "all") return historySessions;
    return historySessions.filter(
      (session) =>
        deriveContractStatusKey(session.contractStatus, session.status) ===
        statusFilter,
    );
  }, [historySessions, statusFilter]);

  const filteredRescheduledSessions = useMemo(() => {
    if (statusFilter === "all") return rescheduledSessions;
    return rescheduledSessions.filter(
      (session) =>
        deriveContractStatusKey(session.contractStatus, session.status) ===
        statusFilter,
    );
  }, [rescheduledSessions, statusFilter]);

  const formatFilterLabel = (value: string) =>
    value === "all"
      ? "All"
      : toDisplayStatus(value) ||
        value.charAt(0).toUpperCase() + value.slice(1);

  const renderFilterChips = () => {
    if (contractStatusOptions.length <= 1) return null;
    return (
      <View className="flex-row flex-wrap items-center -mx-1 mb-3">
        {contractStatusOptions.map((option) => {
          const isSelected = statusFilter === option;
          const label =
            option === "all"
              ? "All"
              : toDisplayStatus(option) ||
                option.charAt(0).toUpperCase() + option.slice(1);
          return (
            <TouchableOpacity
              key={option}
              onPress={() => setStatusFilter(option)}
              className={`px-3 py-1.5 rounded-full border mx-1 mb-2 ${
                isSelected
                  ? "bg-[#089769] border-[#089769]"
                  : "border-gray-300 bg-white"
              }`}
              accessibilityRole="button"
            >
              <Text
                className={`text-xs font-semibold ${
                  isSelected ? "text-white" : "text-gray-600"
                }`}
              >
                {label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    );
  };

  const clearFilter = useCallback(() => setStatusFilter("all"), []);

  const mobileSections = useMemo<MobileSessionSection[]>(
    () => [
      {
        key: "upcoming",
        title: "Upcoming Sessions",
        data: filteredUpcomingSessions,
      },
      {
        key: "rescheduled",
        title: "Rescheduled Sessions",
        data: filteredRescheduledSessions,
      },
      {
        key: "history",
        title: "Session History",
        data: filteredHistorySessions,
      },
    ],
    [
      filteredHistorySessions,
      filteredRescheduledSessions,
      filteredUpcomingSessions,
    ],
  );

  const mobileKeyExtractor = useCallback(
    (item: SessionSummary) => String(item.id),
    [],
  );

  const renderMobileItem = useCallback(
    ({ item }: { item: SessionSummary }) => <SessionCard session={item} />,
    [],
  );

  const renderMobileSectionHeader = useCallback(
    ({ section }: { section: MobileSessionSection }) => (
      <Text
        className={`text-lg font-medium text-black mb-2 ${
          section.key === "upcoming" ? "" : "mt-4"
        }`}
      >
        {section.title}
      </Text>
    ),
    [],
  );

  const renderMobileSectionFooter = useCallback(
    ({ section }: { section: MobileSessionSection }) => {
      if (section.data.length > 0) return null;

      const needsClear = statusFilter !== "all";
      const emptyText =
        section.key === "upcoming"
          ? needsClear
            ? "No upcoming sessions for this status."
            : "No upcoming sessions."
          : section.key === "rescheduled"
            ? needsClear
              ? "No rescheduled sessions for this status."
              : "No rescheduled sessions."
            : needsClear
              ? "No sessions found for this status."
              : "No session history.";

      return (
        <View className="mb-4">
          <Text className="text-gray-500">{emptyText}</Text>
          {needsClear ? (
            <TouchableOpacity onPress={clearFilter} className="mt-2">
              <Text className="text-[#089769] font-semibold text-sm">
                Clear filter
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
      );
    },
    [clearFilter, statusFilter],
  );

  // Desktop Session Card Component
  const DesktopSessionCard = ({ session }: { session: SessionSummary }) => {
    const formatDate = (isoString: string) => {
      const date = new Date(isoString);
      if (Number.isNaN(date.getTime())) return "Upcoming Session";
      return date.toLocaleDateString("en-US", {
        weekday: "long",
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    };

    const formatTimeRange = (startIso: string, endIso: string) => {
      const start = new Date(startIso);
      const end = new Date(endIso);
      const formatter = new Intl.DateTimeFormat(undefined, {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      });
      return `${formatter.format(start)} - ${formatter.format(end)}`;
    };

    let displayStatus = session.status;
    const contractStatus = (session.contractStatus ?? "").toLowerCase();
    const sessionStatus = (session.status ?? "").toLowerCase();
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

    const getStatusColor = () => {
      const normalized = badgeLabel.toLowerCase();
      if (normalized === "cancelled") return "#DC2626";
      if (normalized === "contract completed") return "#059669";
      if (normalized === "discontinued") return "#6B7280";
      if (normalized === "done for today") return "#6B7280";
      if (normalized.includes("pending")) return "#F97316";
      return "#089769";
    };

    return (
      <TouchableOpacity
        className="bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-md transition-shadow"
        onPress={() =>
          router.push({
            pathname: "/session-view",
            params: {
              sessionId: String(session.id),
              profileId: String(session.patientId),
              therapistName: session.therapistName ?? undefined,
              patientName: session.patientName ?? undefined,
              startAt: session.startAt,
              endAt: session.endAt,
            },
          })
        }
        activeOpacity={0.7}
      >
        <View className="p-5">
          <View className="flex-row items-start justify-between mb-4">
            <View className="flex-1">
              <Text className="font-bold text-lg text-900 mb-1">
                {session.patientName ?? "Patient"}
              </Text>
              <View className="flex-row items-center gap-2 mb-2">
                {session.isRescheduled && (
                  <View className="px-2 py-0.5 rounded-full bg-amber-100">
                    <Text className="text-[10px] font-bold text-amber-800">
                      RESCHEDULED
                    </Text>
                  </View>
                )}
                {session.isRelieverProposed && (
                  <View className="px-2 py-0.5 rounded-full bg-teal-100">
                    <Text className="text-[10px] font-bold text-teal-800">
                      WITH RELIEVER
                    </Text>
                  </View>
                )}
              </View>
              <View
                className="px-3 py-1 rounded-full self-start"
                style={{ backgroundColor: `${getStatusColor()}15` }}
              >
                <Text
                  className="text-xs font-semibold"
                  style={{ color: getStatusColor() }}
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
                {formatDate(session.startAt)}
              </Text>
            </View>

            <View className="flex-row items-center">
              <Clock color="#6B7280" size={16} />
              <Text className="text-sm text-gray-600 ml-2">
                {formatTimeRange(session.startAt, session.endAt)}
              </Text>
            </View>

            {session.locationAddress ? (
              <View className="flex-row items-center flex-1">
                <MapPin color="#6B7280" size={16} />
                <Text className="text-sm text-gray-600 ml-2" numberOfLines={1}>
                  {session.locationAddress}
                </Text>
              </View>
            ) : null}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  if (isLoading || upcomingQuery.isLoading) {
    return (
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator color="#089769" />
      </View>
    );
  }

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
                  onPress={() => router.replace("/(therapist)/(tabs)")}
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
                      filteredRescheduledSessions.length +
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

              <TherapistVerificationBanner style={{ marginBottom: 24 }} />

              {isRestricted ? (
                <View className="flex-1 items-center justify-center px-4 py-16">
                  <Text className="text-base font-semibold text-gray-900 text-center mb-2">
                    Session list locked
                  </Text>
                  <Text className="text-sm text-gray-600 text-center">
                    You&apos;ll see your session history once your therapist
                    profile is approved.
                  </Text>
                </View>
              ) : (
                <>
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
                          filteredUpcomingSessions.map((session) => (
                            <DesktopSessionCard
                              key={session.id}
                              session={session}
                            />
                          ))
                        )}
                      </View>
                    </View>

                    {/* Rescheduled Sessions Column */}
                    <View className="flex-1">
                      <View className="flex-row items-center mb-4">
                        <View className="w-10 h-10 rounded-full bg-amber-100 items-center justify-center mr-3">
                          <RefreshCw size={20} color="#D97706" />
                        </View>
                        <View>
                          <Text className="text-lg font-bold text-gray-900">
                            Rescheduled Sessions
                          </Text>
                          <Text className="text-sm text-gray-500">
                            {filteredRescheduledSessions.length} session
                            {filteredRescheduledSessions.length !== 1
                              ? "s"
                              : ""}
                          </Text>
                        </View>
                      </View>

                      <View className="gap-3">
                        {filteredRescheduledSessions.length === 0 ? (
                          <View className="bg-white rounded-xl border border-gray-200 p-8 items-center">
                            <View className="w-16 h-16 rounded-full bg-gray-100 items-center justify-center mb-4">
                              <RefreshCw size={32} color="#9CA3AF" />
                            </View>
                            <Text className="text-gray-500 text-center">
                              {statusFilter === "all"
                                ? "No rescheduled sessions"
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
                          filteredRescheduledSessions.map((session) => (
                            <DesktopSessionCard
                              key={session.id}
                              session={session}
                            />
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
                          filteredHistorySessions.map((session) => (
                            <DesktopSessionCard
                              key={session.id}
                              session={session}
                            />
                          ))
                        )}
                      </View>
                    </View>
                  </View>
                </>
              )}
            </View>
          </ScrollView>
        </SafeAreaView>
      </View>
    );
  }

  // Mobile View
  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <View className="flex-row items-center p-4 border-b border-gray-200 bg-white">
        <TouchableOpacity onPress={() => router.back()} className="mr-4">
          <ArrowLeft size={24} color="#1F2937" />
        </TouchableOpacity>
        <Text className="text-xl font-bold text-gray-800">Sessions</Text>
      </View>

      <View className="flex-1 p-4">
        <TherapistVerificationBanner style={{ marginBottom: 16 }} />

        {isRestricted ? (
          <View className="flex-1 items-center justify-center px-4">
            <Text className="text-base font-semibold text-gray-900 text-center mb-2">
              Session list locked
            </Text>
            <Text className="text-sm text-gray-600 text-center">
              You&apos;ll see your session history once your therapist profile
              is approved.
            </Text>
          </View>
        ) : isError ? (
          <View className="flex-1 items-center justify-center">
            <Text className="text-red-500 mb-4">
              {getUserFacingSessionsErrorMessage(error)}
            </Text>
            <TouchableOpacity
              onPress={() => refetch()}
              className="bg-[#089769] p-3 rounded-lg"
            >
              <Text className="text-white">Retry</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <SectionList
            sections={mobileSections}
            keyExtractor={mobileKeyExtractor}
            renderItem={renderMobileItem}
            renderSectionHeader={renderMobileSectionHeader}
            renderSectionFooter={renderMobileSectionFooter}
            stickySectionHeadersEnabled={false}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            ListHeaderComponent={renderFilterChips}
            contentContainerStyle={{ paddingBottom: 24 }}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

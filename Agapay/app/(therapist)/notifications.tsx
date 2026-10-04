import React, { useCallback, useMemo } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { ArrowLeft, Bell } from "lucide-react-native";
import { useAuth } from "@/src/providers/AuthProvider";
import WebHeader from "@/src/components/WebHeader";
import {
  fetchAllSessions,
  allSessionsQueryKey,
  type SessionSummary,
} from "@/src/services/sessions";

export default function TherapistNotificationsScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === "web" && width >= 768;
  const { user } = useAuth();
  const { data, isLoading, isRefetching, isError, refetch } = useQuery({
    queryKey: allSessionsQueryKey,
    queryFn: () => fetchAllSessions(),
    staleTime: 60_000,
    gcTime: 10 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    enabled: !!user,
  });

  const sessions: SessionSummary[] = useMemo(
    () => (Array.isArray(data) ? data : []),
    [data]
  );

  const formatSessionDate = useCallback((startIso: string) => {
    const date = new Date(startIso);
    if (Number.isNaN(date.getTime())) return "Upcoming Session";
    return new Intl.DateTimeFormat(undefined, {
      weekday: "long",
      month: "short",
      day: "numeric",
    }).format(date);
  }, []);

  const formatSessionTimeRange = useCallback(
    (startIso: string, endIso: string) => {
      const start = new Date(startIso);
      const end = new Date(endIso);
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()))
        return "";
      const fmt = new Intl.DateTimeFormat(undefined, {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      });
      return `${fmt.format(start)} - ${fmt.format(end)}`;
    },
    []
  );

  const getStatusColor = (status: string) => {
    const statusLower = status?.toLowerCase() || "";
    if (statusLower === "pendingconfirmation") return "text-orange-600";
    if (statusLower === "scheduled" || statusLower === "accepted")
      return "text-[#089769]";
    if (statusLower === "cancelled" || statusLower === "declined")
      return "text-red-600";
    if (statusLower === "completed") return "text-blue-600";
    return "text-gray-600";
  };

  const getStatusBgColor = (status: string) => {
    const statusLower = status?.toLowerCase() || "";
    if (statusLower === "pendingconfirmation") return "bg-orange-50";
    if (statusLower === "scheduled" || statusLower === "accepted")
      return "bg-[#E6F4F0]";
    if (statusLower === "cancelled" || statusLower === "declined")
      return "bg-red-50";
    if (statusLower === "completed") return "bg-blue-50";
    return "bg-gray-50";
  };

  const formatStatus = (status: string) => {
    if (status === "PendingConfirmation")
      return "AWAITING CONFIRMATION";
    if (status === "Scheduled") return "CONFIRMED";
    if (status === "Accepted") return "CONFIRMED";
    if (status === "DoneForToday") return "DONE FOR TODAY";
    if (status === "Completed") return "COMPLETED";
    if (status === "Cancelled") return "CANCELLED";
    return status.toUpperCase();
  };

  return (
    <View className={`flex-1 ${isDesktop ? "bg-[#e6f5f0]" : "bg-gray-50"}`}>
      {isDesktop && <WebHeader />}
      <SafeAreaView className={`flex-1 ${isDesktop ? "bg-transparent" : "bg-gray-50"}`}>
        {isDesktop ? (
          <View className="px-8 py-6 bg-transparent">
            <View className="max-w-4xl mx-auto w-full">
              <TouchableOpacity
                onPress={() => router.back()}
                className="flex-row items-center self-start px-4 py-2 rounded-full bg-white border border-gray-200 mb-4"
              >
                <ArrowLeft size={16} color="#089769" />
                <Text className="ml-2 text-[#089769] font-medium">Back</Text>
              </TouchableOpacity>
              <Text className="text-xs font-semibold text-[#089769] uppercase tracking-widest mb-1">
                UPDATES
              </Text>
              <Text className="text-3xl font-bold text-gray-900 mb-1">
                Notifications
              </Text>
              <Text className="text-gray-500 text-base">
                Session updates and patient responses
              </Text>
            </View>
          </View>
        ) : (
          <View className="px-5 pt-6 pb-3 border-b border-gray-200 bg-white">
            <View className="flex-row items-center mb-2">
              <TouchableOpacity
                onPress={() => router.back()}
                className="mr-3 p-1"
                activeOpacity={0.7}
              >
                <ArrowLeft color="#089769" size={24} />
              </TouchableOpacity>
              <Text className="text-2xl font-bold text-black flex-1">
                Notifications
              </Text>
            </View>
            <Text className="text-xs text-gray-500 mt-1">
              Session updates and patient responses
            </Text>
          </View>
        )}

        {isLoading || isRefetching ? (
          <View className="flex-1 items-center justify-center p-8">
            <ActivityIndicator color="#089769" />
            <Text className="text-sm text-gray-500 mt-2">
              Loading notifications…
            </Text>
          </View>
        ) : isError ? (
          <View className="flex-1 items-center justify-center p-8">
            <Text className="text-sm text-red-600 mb-2">
              We couldn&apos;t load your notifications.
            </Text>
            <TouchableOpacity
              className="px-4 py-2 bg-[#089769] rounded-lg"
              onPress={() => refetch()}
            >
              <Text className="text-white font-semibold">Try again</Text>
            </TouchableOpacity>
          </View>
        ) : sessions.length === 0 ? (
          <View className="flex-1 items-center justify-center p-8">
            <View className={`w-20 h-20 rounded-full items-center justify-center mb-4 ${isDesktop ? "bg-[#E6F4F0]" : "bg-gray-100"}`}>
              <Bell size={40} color={isDesktop ? "#089769" : "#9CA3AF"} />
            </View>
            <Text className="text-base font-semibold text-black mb-1.5">
              No notifications yet
            </Text>
            <Text className="text-sm text-gray-500 text-center">
              You&apos;ll see session updates and patient responses here.
            </Text>
          </View>
        ) : (
          <FlatList
            data={sessions}
            contentContainerClassName={isDesktop ? "p-5 max-w-4xl mx-auto w-full" : "p-5"}
            keyExtractor={(s) => String(s.id)}
            renderItem={({ item }) => {
              const patientName = item.patientName || "Patient";
              const date = formatSessionDate(item.startAt);
              const time = formatSessionTimeRange(item.startAt, item.endAt);
              const subtitle = `${date} • ${time}`;
              const addr = item.locationAddress
                ? ` at ${item.locationAddress}`
                : "";
              const statusColor = getStatusColor(item.status);
              const statusBgColor = getStatusBgColor(item.status);
              const statusText = formatStatus(item.status);

              return (
                <TouchableOpacity
                  className={`bg-white p-4 mb-3 rounded-xl border border-gray-200 active:opacity-80 ${isDesktop ? "border-l-4 border-l-[#089769]" : ""}`}
                  onPress={() =>
                    router.push({
                      pathname: "/session-view",
                      params: {
                        sessionId: String(item.id),
                        profileId: String(item.patientId),
                        therapistName: item.therapistName ?? undefined,
                        patientName: item.patientName ?? undefined,
                        startAt: item.startAt,
                        endAt: item.endAt,
                      },
                    } as any)
                  }
                >
                  <Text className="text-base font-semibold text-black">
                    Session with {patientName}
                  </Text>
                  <Text className="text-sm text-gray-600 mt-1">
                    {subtitle}
                    {addr}
                  </Text>
                  {item.status ? (
                    <View className={`mt-2 px-2 py-1 ${statusBgColor} rounded-md self-start`}>
                      <Text className={`text-xs font-semibold ${statusColor}`}>
                        {statusText}
                      </Text>
                    </View>
                  ) : null}
                </TouchableOpacity>
              );
            }}
          />
        )}
      </SafeAreaView>
    </View>
  );
}

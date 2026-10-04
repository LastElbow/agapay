import React, { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  useWindowDimensions,
  Modal,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { ArrowLeft, FileText, Bell, AlertTriangle, Ban, Clock, X } from "lucide-react-native";
import WebHeader from "@/src/components/WebHeader";
import {
  fetchUpcomingSessions,
  upcomingSessionsQueryKey,
  type SessionSummary,
} from "@/src/services/sessions";
import { getContractsForPatient } from "@/src/services/contracts";
import { useAdminNotifications } from "@/src/providers/AdminNotificationContext";
import apiClient from "@/api/client";

type AdminNotification = {
  id: string;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
};

type NotificationItem = {
  id: string;
  type: "session" | "proposal" | "warning" | "suspension" | "ban" | "admin";
  data: any;
  timestamp: string;
};

export default function NotificationsScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === "web" && width >= 768;
  const { refreshNotifications: refreshAdminNotifications } = useAdminNotifications();
  const [selectedNotification, setSelectedNotification] = useState<AdminNotification | null>(null);

  const {
    data: sessionsData,
    isLoading: sessionsLoading,
    isRefetching: sessionsRefetching,
    isError: sessionsError,
    refetch: refetchSessions,
  } = useQuery({
    queryKey: upcomingSessionsQueryKey,
    queryFn: () => fetchUpcomingSessions(20),
    staleTime: 60_000,
    gcTime: 10 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const sessions: SessionSummary[] = useMemo(
    () => (Array.isArray(sessionsData) ? sessionsData : []),
    [sessionsData]
  );

  // Fetch patient ID from the onboarding status endpoint
  const { data: patientData } = useQuery({
    queryKey: ["patient", "onboarding-status"],
    queryFn: async () => {
      const res = await apiClient.get("/api/Onboarding/patient/status");
      return res.data;
    },
    staleTime: 5 * 60 * 1000,
  });

  const currentPatientId = patientData?.selfPatientId ?? null;

  // Fetch admin notifications (warnings, suspensions, etc.)
  const {
    data: adminNotificationsData = [],
    isLoading: adminNotificationsLoading,
    isError: adminNotificationsError,
    refetch: refetchAdminNotifications,
  } = useQuery<AdminNotification[]>({
    queryKey: ["notifications", "admin"],
    queryFn: async () => {
      const res = await apiClient.get("/api/Notifications");
      return res.data;
    },
    staleTime: 60_000,
  });

  // Fetch contracts to get pending proposals
  const {
    data: contractsData = [],
    isLoading: contractsLoading,
    isError: contractsError,
    refetch: refetchContracts,
  } = useQuery({
    queryKey: ["contracts", "patient", currentPatientId],
    queryFn: () => getContractsForPatient(currentPatientId!),
    enabled: currentPatientId != null,
    staleTime: 2 * 60 * 1000,
  });

  // Filter pending proposals
  const pendingProposals = useMemo(() => {
    return contractsData.filter((c) => c.status === "PendingConfirmation");
  }, [contractsData]);

  // Combine sessions, proposals, and admin notifications into a single list
  const notifications: NotificationItem[] = useMemo(() => {
    const items: NotificationItem[] = [];

    // Add admin notifications (warnings, suspensions, bans)
    adminNotificationsData.forEach((notification) => {
      items.push({
        id: `admin-${notification.id}`,
        type: notification.type as "warning" | "suspension" | "ban" | "admin",
        data: notification,
        timestamp: notification.createdAt,
      });
    });

    // Add pending proposals (use startDate or current time for sorting)
    pendingProposals.forEach((proposal) => {
      items.push({
        id: `proposal-${proposal.id}`,
        type: "proposal",
        data: proposal,
        timestamp: proposal.startDate || new Date().toISOString(),
      });
    });

    // Add upcoming sessions (next 24 hours)
    const now = Date.now();
    const in24h = now + 24 * 60 * 60 * 1000;
    sessions.forEach((session) => {
      const start = new Date(session.startAt).getTime();
      if (!Number.isNaN(start) && start >= now && start <= in24h) {
        items.push({
          id: `session-${session.id}`,
          type: "session",
          data: session,
          timestamp: session.startAt,
        });
      }
    });

    // Sort by timestamp (most recent first)
    return items.sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }, [sessions, pendingProposals, adminNotificationsData]);

  const isLoading = sessionsLoading || contractsLoading || adminNotificationsLoading;
  const isRefetching = sessionsRefetching;
  const isError = sessionsError || contractsError || adminNotificationsError;

  const refetch = useCallback(() => {
    refetchSessions();
    refetchContracts();
    refetchAdminNotifications();
  }, [refetchSessions, refetchContracts, refetchAdminNotifications]);

  // Mark admin notification as read
  const markAsRead = useCallback(async (notificationId: string) => {
    try {
      await apiClient.put(`/api/Notifications/${notificationId}/read`);
      refetchAdminNotifications();
      refreshAdminNotifications(); // Also refresh the global context
    } catch (error) {
      console.error("Failed to mark notification as read:", error);
    }
  }, [refetchAdminNotifications, refreshAdminNotifications]);

  // Refetch data when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch])
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
                Your latest updates and alerts
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
              Your latest updates and alerts
            </Text>
          </View>
        )}

        {isLoading || isRefetching ? (
          <View className="flex-1 items-center justify-center p-8">
            <ActivityIndicator color="#089769" />
            <Text className="text-sm text-gray-500 mt-2">
              Loading session notifications…
            </Text>
          </View>
        ) : isError ? (
          <View className="flex-1 items-center justify-center p-8">
            <Text className="text-sm text-red-600 mb-2">
              We couldn&apos;t load your session notifications.
            </Text>
            <TouchableOpacity
              className="px-4 py-2 bg-[#089769] rounded-lg"
              onPress={() => refetch()}
            >
              <Text className="text-white font-semibold">Try again</Text>
            </TouchableOpacity>
          </View>
        ) : notifications.length === 0 ? (
          <View className="flex-1 items-center justify-center p-8">
            <View className={`w-20 h-20 rounded-full items-center justify-center mb-4 ${isDesktop ? "bg-[#E6F4F0]" : "bg-gray-100"}`}>
              <Bell size={40} color={isDesktop ? "#089769" : "#9CA3AF"} />
            </View>
            <Text className="text-base font-semibold text-black mb-1.5">
              No notifications yet
            </Text>
            <Text className="text-sm text-gray-500 text-center">
              You&apos;ll see session proposals and upcoming sessions here.
            </Text>
          </View>
        ) : (
          <FlatList
            data={notifications}
            contentContainerClassName={isDesktop ? "p-5 max-w-4xl mx-auto w-full" : "p-5"}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => {
              // Admin notifications (warnings, suspensions, bans)
              if (item.type === "warning" || item.type === "suspension" || item.type === "ban") {
                const notification = item.data as AdminNotification;
                const isWarning = item.type === "warning";
                const isSuspension = item.type === "suspension";
                const isBan = item.type === "ban";

                const bgColor = isBan ? "bg-red-50" : isSuspension ? "bg-orange-50" : "bg-yellow-50";
                const borderColor = isBan ? "border-red-300" : isSuspension ? "border-orange-300" : "border-yellow-300";
                const iconBgColor = isBan ? "bg-red-100" : isSuspension ? "bg-orange-100" : "bg-yellow-100";
                const iconColor = isBan ? "#DC2626" : isSuspension ? "#EA580C" : "#CA8A04";
                const leftBorderColor = isBan ? "border-l-red-500" : isSuspension ? "border-l-orange-500" : "border-l-yellow-500";

                const Icon = isBan ? Ban : isSuspension ? Clock : AlertTriangle;

                const formattedDate = new Date(notification.createdAt).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                });

                return (
                  <TouchableOpacity
                    className={`${bgColor} p-4 mb-3 rounded-xl border-2 ${borderColor} active:opacity-80 ${isDesktop ? `border-l-4 ${leftBorderColor}` : ""}`}
                    onPress={() => {
                      if (!notification.isRead) {
                        markAsRead(notification.id);
                      }
                      setSelectedNotification(notification);
                    }}
                  >
                    <View className="flex-row items-start">
                      <View className={`w-10 h-10 rounded-full ${iconBgColor} items-center justify-center mr-3`}>
                        <Icon color={iconColor} size={20} />
                      </View>
                      <View className="flex-1">
                        <View className="flex-row items-center justify-between">
                          <Text className="text-base font-semibold text-black flex-1">
                            {notification.title}
                          </Text>
                          {!notification.isRead && (
                            <View className="w-2 h-2 rounded-full bg-red-500 ml-2" />
                          )}
                        </View>
                        <Text className="text-sm text-gray-600 mt-1" numberOfLines={2}>
                          {notification.message}
                        </Text>
                        <View className="flex-row items-center justify-between mt-2">
                          <Text className="text-xs text-gray-400">
                            {formattedDate}
                          </Text>
                          <Text className="text-xs text-gray-500 font-medium">
                            Tap to view details →
                          </Text>
                        </View>
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              } else if (item.type === "proposal") {
                const proposal = item.data;
                return (
                  <TouchableOpacity
                    className={`bg-white p-4 mb-3 rounded-xl border-2 border-orange-300 active:opacity-80 ${isDesktop ? "border-l-4 border-l-orange-500" : ""}`}
                    onPress={() => router.push("/(patient)/(tabs)/messages")}
                  >
                    <View className="flex-row items-start">
                      <View className="w-10 h-10 rounded-full bg-orange-100 items-center justify-center mr-3">
                        <FileText color="#EA580C" size={20} />
                      </View>
                      <View className="flex-1">
                        <Text className="text-base font-semibold text-black">
                          New Session Proposal
                        </Text>
                        <Text className="text-sm text-gray-600 mt-1">
                          A therapist has sent you a session proposal. Check
                          your messages to review and respond.
                        </Text>
                        <View className="mt-2 px-2 py-1 bg-orange-50 rounded-md self-start">
                          <Text className="text-xs font-semibold text-orange-700">
                            PENDING REVIEW
                          </Text>
                        </View>
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              } else {
                const session = item.data;
                const who =
                  session.therapistName ||
                  session.patientName ||
                  "Therapy Session";
                const date = formatSessionDate(session.startAt);
                const time = formatSessionTimeRange(
                  session.startAt,
                  session.endAt
                );
                const subtitle = `${date} • ${time}`;
                const addr = session.locationAddress
                  ? ` at ${session.locationAddress}`
                  : "";
                return (
                  <TouchableOpacity
                    className={`bg-white p-4 mb-3 rounded-xl border border-gray-200 active:opacity-80 ${isDesktop ? "border-l-4 border-l-[#089769]" : ""}`}
                    onPress={() =>
                      router.push({
                        pathname: "/create-session",
                        params: { sessionId: String(session.id) },
                      } as any)
                    }
                  >
                    <Text className="text-base font-semibold text-black">
                      Upcoming session with {who}
                    </Text>
                    <Text className="text-sm text-gray-600 mt-1">
                      {subtitle}
                      {addr}
                    </Text>
                  </TouchableOpacity>
                );
              }
            }}
          />
        )}

        {/* Notification Detail Modal */}
        <Modal
          visible={!!selectedNotification}
          transparent
          animationType="fade"
          onRequestClose={() => setSelectedNotification(null)}
        >
          <View className="flex-1 bg-black/50 items-center justify-center p-4">
            {selectedNotification && (() => {
              const isWarning = selectedNotification.type === "warning";
              const isSuspension = selectedNotification.type === "suspension";
              const isBan = selectedNotification.type === "ban";

              const bgColor = isBan ? "bg-red-50" : isSuspension ? "bg-orange-50" : "bg-yellow-50";
              const borderColor = isBan ? "border-red-500" : isSuspension ? "border-orange-500" : "border-yellow-500";
              const iconBgColor = isBan ? "bg-red-100" : isSuspension ? "bg-orange-100" : "bg-yellow-100";
              const iconColor = isBan ? "#DC2626" : isSuspension ? "#EA580C" : "#CA8A04";
              const buttonColor = isBan ? "bg-red-600" : isSuspension ? "bg-orange-600" : "bg-yellow-600";

              const Icon = isBan ? Ban : isSuspension ? Clock : AlertTriangle;

              const formattedDate = new Date(selectedNotification.createdAt).toLocaleString(undefined, {
                dateStyle: "full",
                timeStyle: "short",
              });

              return (
                <View className={`${bgColor} rounded-2xl max-w-md w-full border-2 ${borderColor} ${Platform.OS === 'web' ? 'shadow-xl' : ''}`}>
                  {/* Header */}
                  <View className="flex-row items-center justify-between p-4 border-b border-gray-200">
                    <View className="flex-row items-center flex-1">
                      <View className={`w-12 h-12 rounded-full ${iconBgColor} items-center justify-center mr-3`}>
                        <Icon color={iconColor} size={24} />
                      </View>
                      <Text className="text-lg font-bold text-gray-900 flex-1">
                        {selectedNotification.title}
                      </Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => setSelectedNotification(null)}
                      className="p-2"
                    >
                      <X color="#6B7280" size={24} />
                    </TouchableOpacity>
                  </View>

                  {/* Content */}
                  <View className="p-4">
                    <View className="bg-white/80 rounded-xl p-4 mb-4">
                      <Text className="text-base text-gray-700 leading-6">
                        {selectedNotification.message}
                      </Text>
                    </View>

                    {/* Info Section */}
                    <View className="bg-white/60 rounded-lg p-3 mb-4">
                      <Text className="text-xs text-gray-500 font-medium mb-1">
                        RECEIVED ON
                      </Text>
                      <Text className="text-sm text-gray-700">
                        {formattedDate}
                      </Text>
                    </View>

                    {/* Warning Info */}
                    {isWarning && (
                      <View className="bg-yellow-100 rounded-lg p-3 mb-4">
                        <Text className="text-xs text-yellow-800 font-semibold mb-1">
                          ⚠️ IMPORTANT NOTICE
                        </Text>
                        <Text className="text-sm text-yellow-700">
                          Repeated warnings may result in account suspension or permanent ban. Please review our{" "}
                          <Text
                            className="text-yellow-800 font-semibold underline"
                            onPress={() => {
                              setSelectedNotification(null);
                              router.push("/community-guidelines" as any);
                            }}
                          >
                            community guidelines
                          </Text>.
                        </Text>
                      </View>
                    )}

                    {/* Suspension Info */}
                    {isSuspension && (
                      <View className="bg-orange-100 rounded-lg p-3 mb-4">
                        <Text className="text-xs text-orange-800 font-semibold mb-1">
                          🚫 ACCOUNT RESTRICTED
                        </Text>
                        <Text className="text-sm text-orange-700">
                          Your account access has been temporarily limited. Please review our{" "}
                          <Text
                            className="text-orange-800 font-semibold underline"
                            onPress={() => {
                              setSelectedNotification(null);
                              router.push("/community-guidelines" as any);
                            }}
                          >
                            community guidelines
                          </Text>{" "}
                          to avoid further action.
                        </Text>
                      </View>
                    )}

                    {/* Ban Info */}
                    {isBan && (
                      <View className="bg-red-100 rounded-lg p-3 mb-4">
                        <Text className="text-xs text-red-800 font-semibold mb-1">
                          ⛔ ACCOUNT BANNED
                        </Text>
                        <Text className="text-sm text-red-700">
                          Your account has been permanently banned. If you believe this is a mistake, please contact support.
                        </Text>
                      </View>
                    )}
                  </View>

                  {/* Footer */}
                  <View className="p-4 border-t border-gray-200">
                    <TouchableOpacity
                      style={{ backgroundColor: iconColor }}
                      className="rounded-xl py-4 items-center"
                      onPress={() => setSelectedNotification(null)}
                      activeOpacity={0.8}
                    >
                      <Text className="text-white font-semibold text-base">
                        I Understood
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })()}
          </View>
        </Modal>
      </SafeAreaView>
    </View>
  );
}

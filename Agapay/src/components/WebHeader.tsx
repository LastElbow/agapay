import React, { useMemo, useState, useEffect, useRef } from "react";
import { View, Text, TouchableOpacity, Image, Modal } from "react-native";
import { useRouter, usePathname } from "expo-router";
import { useAuth } from "@/src/providers/AuthProvider";
import { useRole } from "@/src/providers/RoleProvider";
import { Bell, Home, MessageSquare, LogOut } from "lucide-react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  getItem as ssGet,
  deleteItem as ssDel,
  setItem as ssSet,
} from "@/src/utils/safeSecureStore";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getContractsForPatient } from "@/src/services/contracts";
import {
  fetchUpcomingSessions,
  upcomingSessionsQueryKey,
  allSessionsQueryKey,
} from "@/src/services/sessions";
import {
  CHAT_CONVERSATIONS_QUERY_KEY,
  fetchChatConversations,
} from "@/src/services/chat";
import signalrManager from "@/src/services/signalrManager";

function getInitials(name?: string) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function WebHeader() {
  const router = useRouter();
  const pathname = usePathname();
  const { user: authUser, signOut, accessToken } = useAuth();
  const { clearRole } = useRole();
  const queryClient = useQueryClient();
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [hasViewedNotifications, setHasViewedNotifications] = useState(false);
  const [realtimeNotificationCount, setRealtimeNotificationCount] = useState(0);

  // Determine user type for proper routing
  const userType = useMemo(() => {
    if (!authUser) return "Patient";
    const asAny = authUser as Record<string, any>;
    const type = asAny.userType ?? asAny.UserType ?? asAny.role ?? asAny.Role ?? "Patient";
    return type;
  }, [authUser]);

  const isTherapist = userType === "Therapist" || userType === "PhysicalTherapist";


  // Fetch unread messages count with frequent refetch for real-time feel
  const { data: conversationsData } = useQuery({
    queryKey: CHAT_CONVERSATIONS_QUERY_KEY,
    queryFn: fetchChatConversations,
    staleTime: 60_000,
    refetchInterval: 120_000, // Backup polling every 2 minutes
    retry: false,
  });

  // Real-time updates for message badge via SignalR
  useEffect(() => {
    if (!accessToken) return;

    let active = true;
    let unsubscribeFn: (() => void) | undefined;

    const setupConnection = async () => {
      try {
        await signalrManager.getSharedConnection('chat', accessToken);

        if (!active) {
          signalrManager.releaseConnection('chat');
          return;
        }

        unsubscribeFn = signalrManager.subscribeToEvent('chat', "ReceiveMessage", () => {
          if (!active) return;
          // Immediately refetch conversations when new message received
          queryClient.invalidateQueries({
            queryKey: CHAT_CONVERSATIONS_QUERY_KEY,
          });
        });
      } catch (error) {
        console.warn("WebHeader chat hub connection failed", error);
      }
    };

    setupConnection();

    return () => {
      active = false;
      if (unsubscribeFn) unsubscribeFn();
      signalrManager.releaseConnection('chat');
    };
  }, [accessToken, queryClient]);

  const totalUnreadCount = useMemo(() => {
    if (!conversationsData) return 0;
    return conversationsData.reduce(
      (sum, conv) => sum + (conv.unreadCount ?? 0),
      0
    );
  }, [conversationsData]);

  const unreadMessagesBadge = totalUnreadCount > 0 ? Math.min(99, totalUnreadCount) : undefined;

  // Replicate notification logic (simplified for header)
  const { data: upcomingSessions = [] } = useQuery({
    queryKey: upcomingSessionsQueryKey,
    queryFn: () => fetchUpcomingSessions(5),
    staleTime: 5 * 60 * 1000,
  });

  const currentPatientId = useMemo(
    () => (upcomingSessions.length > 0 ? upcomingSessions[0].patientId : null),
    [upcomingSessions]
  );

  const { data: patientContracts = [] } = useQuery({
    queryKey: ["contracts", "patient", currentPatientId],
    queryFn: () => getContractsForPatient(currentPatientId!),
    enabled: currentPatientId != null,
    staleTime: 2 * 60 * 1000,
  });

  useEffect(() => {
    const loadViewedState = async () => {
      try {
        const viewed = await ssGet("notificationsViewed");
        setHasViewedNotifications(viewed === "true");
      } catch (err) {
        console.warn("Failed to load notification viewed state", err);
      }
    };
    loadViewedState();
  }, []);

  // Real-time notification updates via SignalR
  useEffect(() => {
    if (!accessToken) return;

    let active = true;
    const unsubscribeFns: Array<() => void> = [];

    const setupRealtimeNotifications = async () => {
      try {
        // Connect to sessions hub for session-related notifications
        await signalrManager.getSharedConnection('sessions', accessToken);

        if (!active) {
          signalrManager.releaseConnection('sessions');
          return;
        }

        // Listen for session events that should trigger notification updates
        const sessionEvents = [
          'SessionScheduled',
          'SessionCancelled',
          'RescheduleProposed',
          'RescheduleApproved',
          'RescheduleDeclined',
          'CancellationRequested',
          'SessionStarted',
          'SessionCompleted',
          'SessionMarkedDone',
        ];

        sessionEvents.forEach(eventName => {
          unsubscribeFns.push(
            signalrManager.subscribeToEvent('sessions', eventName, () => {
              if (!active) return;

              // Invalidate queries to refresh notification counts
              queryClient.invalidateQueries({ queryKey: upcomingSessionsQueryKey });
              queryClient.invalidateQueries({ queryKey: allSessionsQueryKey });

              // Increment realtime notification counter to show new activity
              setRealtimeNotificationCount(prev => prev + 1);

              // Clear viewed state to show badge
              setHasViewedNotifications(false);
              ssDel("notificationsViewed").catch(() => { });
            })
          );
        });

        // Connect to contracts hub for contract-related notifications
        await signalrManager.getSharedConnection('contracts', accessToken);

        if (!active) {
          signalrManager.releaseConnection('contracts');
          return;
        }

        const contractEvents = [
          'ContractActivated',
          'ContractDeclined',
          'ContractEnded',
          'ProposalCreated',
          'ProposalAccepted',
          'ProposalRejected',
        ];

        contractEvents.forEach(eventName => {
          unsubscribeFns.push(
            signalrManager.subscribeToEvent('contracts', eventName, () => {
              if (!active) return;

              // Invalidate contract queries
              queryClient.invalidateQueries({ queryKey: ["contracts"] });

              // Increment realtime notification counter
              setRealtimeNotificationCount(prev => prev + 1);

              // Clear viewed state to show badge
              setHasViewedNotifications(false);
              ssDel("notificationsViewed").catch(() => { });
            })
          );
        });

      } catch (error) {
        console.warn("WebHeader realtime notifications setup failed", error);
      }
    };

    setupRealtimeNotifications();

    return () => {
      active = false;
      unsubscribeFns.forEach(unsub => unsub());
      signalrManager.releaseConnection('sessions');
      signalrManager.releaseConnection('contracts');
    };
  }, [accessToken, queryClient]);

  const sessionsSoonCount = useMemo(() => {
    const now = Date.now();
    const in24h = now + 24 * 60 * 60 * 1000;
    return upcomingSessions.filter((s) => {
      const start = new Date(s.startAt).getTime();
      return !Number.isNaN(start) && start >= now && start <= in24h;
    }).length;
  }, [upcomingSessions]);

  const pendingProposalsCount = useMemo(() => {
    return patientContracts.filter((c) => c.status === "PendingConfirmation")
      .length;
  }, [patientContracts]);

  const totalNotifications = sessionsSoonCount + pendingProposalsCount + realtimeNotificationCount;
  const notificationCount =
    hasViewedNotifications && totalNotifications > 0
      ? 0
      : Math.min(99, Math.max(0, totalNotifications));

  const confirmLogout = async () => {
    try {
      setShowLogoutModal(false);
      // Clear role and query cache first to prevent AuthGate from redirecting
      clearRole();
      queryClient.clear();
      await ssDel("notificationsViewed");
      // Sign out and then navigate
      await signOut();
      router.replace("/(auth)/signin");
    } catch (err) {
      console.error("Logout failed", err);
      // Even if something fails, try to navigate to signin
      router.replace("/(auth)/signin");
    }
  };

  const displayUser = useMemo(() => {
    if (!authUser) return null;
    const asAny = authUser as Record<string, any>;
    const first =
      asAny.firstName ??
      asAny.FirstName ??
      asAny.givenName ??
      asAny.GivenName ??
      "";
    const last =
      asAny.lastName ??
      asAny.LastName ??
      asAny.familyName ??
      asAny.FamilyName ??
      "";
    return { ...authUser, firstName: first, lastName: last };
  }, [authUser]);

  const greetingName = displayUser
    ? [displayUser.firstName, displayUser.lastName]
      .filter(Boolean)
      .map((n) => n?.trim())
      .filter(Boolean)
      .join(" ")
    : "";

  const isActive = (path: string) => pathname.includes(path);

  return (
    <>
      <Modal
        visible={showLogoutModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowLogoutModal(false)}
      >
        <View className="flex-1 justify-center items-center bg-black/50 px-6">
          <View className="bg-white rounded-3xl p-6 w-full max-w-sm">
            <View className="items-center mb-4">
              <View className="w-14 h-14 rounded-full bg-blue-100 items-center justify-center mb-3">
                <Ionicons name="help-circle" size={32} color="#2F80ED" />
              </View>
              <Text className="text-xl font-bold text-gray-900 text-center">
                Confirm Logout
              </Text>
            </View>
            <Text className="text-base text-gray-600 text-center mb-6">
              Are you sure you want to log out?
            </Text>
            <View className="flex-row justify-around">
              <TouchableOpacity
                onPress={() => setShowLogoutModal(false)}
                className="bg-gray-200 py-3.5 rounded-xl flex-1 mx-2"
                activeOpacity={0.8}
              >
                <Text className="text-gray-800 text-center font-semibold text-base">
                  Cancel
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={confirmLogout}
                className="bg-red-500 py-3.5 rounded-xl flex-1 mx-2"
                activeOpacity={0.8}
              >
                <Text className="text-white text-center font-semibold text-base">
                  Logout
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <View className="hidden md:flex w-full bg-white border-b border-teal-100">
        <View className="w-full flex-row justify-between items-center py-4 px-6">
          {/* Logo */}
          <View className="flex-row items-center">
            <View className="w-10 h-10 mr-2">
              <Image
                source={require("@/assets/images/gi_logo_new.png")}
                style={{ width: "100%", height: "100%" }}
                resizeMode="contain"
              />
            </View>
            <Text className="text-xl font-bold text-teal-900">Agapay</Text>
          </View>

          {/* Navigation */}
          <View className="flex-row items-center">
            <TouchableOpacity
              className={`flex-row items-center px-4 py-2 rounded-full mr-2 ${pathname === "/(patient)" || pathname === "/(therapist)" || pathname === "/"
                ? "bg-teal-50"
                : ""
                }`}
              onPress={() => router.push(isTherapist ? "/(therapist)/" as any : "/(patient)/" as any)}
            >
              <Home
                size={20}
                color={
                  pathname === "/(patient)" || pathname === "/(therapist)" || pathname === "/"
                    ? "#0D9488"
                    : "#6B7280"
                }
                className="mr-2"
              />
              <Text
                className={`${pathname === "/(patient)" || pathname === "/(therapist)" || pathname === "/"
                  ? "text-teal-700 font-semibold"
                  : "text-gray-500 font-medium"
                  }`}
              >
                Home
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              className={`flex-row items-center px-4 py-2 rounded-full mr-2 ${isActive("messages") ? "bg-teal-50" : ""
                }`}
              onPress={() => router.push(isTherapist ? "/(therapist)/messages" as any : "/(patient)/messages" as any)}
            >
              <View className="relative">
                <MessageSquare
                  size={20}
                  color={isActive("messages") ? "#0D9488" : "#6B7280"}
                />
                {unreadMessagesBadge !== undefined && (
                  <View className="absolute -top-2 -right-2 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 items-center justify-center">
                    <Text className="text-[10px] text-white font-bold">
                      {unreadMessagesBadge}
                    </Text>
                  </View>
                )}
              </View>
              <Text
                className={`ml-2 ${isActive("messages")
                  ? "text-teal-700 font-semibold"
                  : "text-gray-500 font-medium"
                  }`}
              >
                Messages
              </Text>
            </TouchableOpacity>
          </View>

          {/* User Profile */}
          <View className="flex-row items-center">
            <TouchableOpacity
              className="mr-4 relative"
              onPress={async () => {
                // Mark notifications as viewed and reset counters
                setHasViewedNotifications(true);
                setRealtimeNotificationCount(0);
                try {
                  await ssSet("notificationsViewed", "true");
                } catch (err) {
                  console.warn("Failed to save notification viewed state", err);
                }
                router.push(isTherapist ? "/(therapist)/notifications" as any : "/notifications" as any);
              }}
            >
              <Bell size={20} color="#6B7280" />
              {notificationCount > 0 && (
                <View className="absolute -top-2 -right-2 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 items-center justify-center">
                  <Text className="text-[10px] text-white font-bold">
                    {notificationCount}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
            <View className="h-8 w-[1px] bg-gray-200 mx-2" />
            <TouchableOpacity
              className="flex-row items-center mr-4"
              onPress={() => router.push(isTherapist ? "/(therapist)/profile" as any : "/(patient)/profile" as any)}
            >
              {displayUser ? (
                <>
                  <View className="items-end mr-3">
                    <Text className="text-sm font-bold text-gray-900">
                      {greetingName}
                    </Text>
                    <Text className="text-xs text-teal-600 font-medium">
                      {authUser?.userType ||
                        (authUser as any)?.UserType ||
                        "Patient"}
                    </Text>
                  </View>
                  <View className="w-10 h-10 rounded-full bg-teal-100 items-center justify-center">
                    <Text className="text-teal-700 font-bold">
                      {getInitials(greetingName)}
                    </Text>
                  </View>
                </>
              ) : (
                <View className="flex-row items-center gap-3">
                  <View className="w-24 h-8 bg-gray-100 rounded opacity-50" />
                  <View className="w-10 h-10 bg-gray-100 rounded-full opacity-50" />
                </View>
              )}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowLogoutModal(true)}>
              <LogOut size={20} color="#6B7280" />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </>
  );
}

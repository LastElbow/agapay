import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import React from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BottomTabBar } from "@react-navigation/bottom-tabs";
import { View, Platform } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CHAT_CONVERSATIONS_QUERY_KEY,
  fetchChatConversations,
} from "@/src/services/chat";
import { useAuth } from "@/src/providers/AuthProvider";
import signalrManager from "@/src/services/signalrManager";

export default function PatientTabLayout() {
  const insets = useSafeAreaInsets();
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();

  const { data: conversationsData } = useQuery({
    queryKey: CHAT_CONVERSATIONS_QUERY_KEY,
    queryFn: fetchChatConversations,
    staleTime: 60_000,
    refetchInterval: 60_000, // Backup polling every 60 seconds
    retry: false,
  });

  // Real-time updates for message badge
  React.useEffect(() => {
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
        console.warn("Patient tab chat hub connection failed", error);
      }
    };

    setupConnection();

    return () => {
      active = false;
      if (unsubscribeFn) unsubscribeFn();
      signalrManager.releaseConnection('chat');
    };
  }, [accessToken, queryClient]);

  // Real-time updates for notifications badge
  React.useEffect(() => {
    if (!accessToken) return;

    let active = true;
    const unsubscribeFns: (() => void)[] = [];

    const setupSessionsConnection = async () => {
      try {
        await signalrManager.getSharedConnection('sessions', accessToken);

        if (!active) {
          signalrManager.releaseConnection('sessions');
          return;
        }

        // Listen to session events that affect notifications
        const invalidateNotifications = () => {
          if (!active) return;
          // Invalidate both sessions and contracts for notification count
          queryClient.invalidateQueries({ queryKey: ["sessions", "patient", "upcoming"] });
          queryClient.invalidateQueries({ queryKey: ["contracts", "patient"] });
        };

        unsubscribeFns.push(
          signalrManager.subscribeToEvent('sessions', "SessionStarted", invalidateNotifications),
          signalrManager.subscribeToEvent('sessions', "SessionCompleted", invalidateNotifications),
          signalrManager.subscribeToEvent('sessions', "SessionMarkedDone", invalidateNotifications),
          signalrManager.subscribeToEvent('sessions', "SessionCancelled", invalidateNotifications),
          signalrManager.subscribeToEvent('sessions', "RescheduleProposed", invalidateNotifications),
          signalrManager.subscribeToEvent('sessions', "RescheduleApproved", invalidateNotifications),
          signalrManager.subscribeToEvent('sessions', "RescheduleDeclined", invalidateNotifications),
          signalrManager.subscribeToEvent('sessions', "CancellationRequested", invalidateNotifications)
        );
      } catch (error) {
        console.warn("Patient tab sessions hub connection failed", error);
      }
    };

    setupSessionsConnection();

    return () => {
      active = false;
      unsubscribeFns.forEach(unsub => unsub());
      signalrManager.releaseConnection('sessions');
    };
  }, [accessToken, queryClient]);

  // Real-time updates for contract notifications
  React.useEffect(() => {
    if (!accessToken) return;

    let active = true;
    const unsubscribeFns: (() => void)[] = [];

    const setupContractsConnection = async () => {
      try {
        await signalrManager.getSharedConnection('contracts', accessToken);

        if (!active) {
          signalrManager.releaseConnection('contracts');
          return;
        }

        // Listen to contract events that affect notifications
        const invalidateNotifications = () => {
          if (!active) return;
          queryClient.invalidateQueries({ queryKey: ["contracts", "patient"] });
          // Also invalidate unreviewed contracts for the Reviews badge
          queryClient.invalidateQueries({ queryKey: ["contracts", "unreviewed"] });
        };

        unsubscribeFns.push(
          signalrManager.subscribeToEvent('contracts', "ContractActivated", invalidateNotifications),
          signalrManager.subscribeToEvent('contracts', "ContractDeclined", invalidateNotifications),
          signalrManager.subscribeToEvent('contracts', "ContractEnded", invalidateNotifications),
          signalrManager.subscribeToEvent('contracts', "ProposalCreated", invalidateNotifications),
          signalrManager.subscribeToEvent('contracts', "ProposalAccepted", invalidateNotifications),
          signalrManager.subscribeToEvent('contracts', "ProposalRejected", invalidateNotifications)
        );
      } catch (error) {
        console.warn("Patient tab contracts hub connection failed", error);
      }
    };

    setupContractsConnection();

    return () => {
      active = false;
      unsubscribeFns.forEach(unsub => unsub());
      signalrManager.releaseConnection('contracts');
    };
  }, [accessToken, queryClient]);

  const totalUnreadCount = React.useMemo(() => {
    if (!conversationsData) return 0;
    return conversationsData.reduce(
      (sum, conv) => sum + (conv.unreadCount ?? 0),
      0
    );
  }, [conversationsData]);

  const unreadBadge =
    totalUnreadCount > 0 ? Math.min(99, totalUnreadCount) : undefined;

  // Fetch notification data for badge
  const { data: upcomingSessions = [] } = useQuery({
    queryKey: ["sessions", "upcoming"],
    queryFn: async () => {
      try {
        const { fetchUpcomingSessions } = await import("@/src/services/sessions");
        return fetchUpcomingSessions(5);
      } catch {
        return [];
      }
    },
    staleTime: 2 * 60 * 1000,
    refetchInterval: 120_000, // Backup polling every 2 minutes
    retry: false,
  });

  const currentPatientId = React.useMemo(
    () => (upcomingSessions.length > 0 ? upcomingSessions[0].patientId : null),
    [upcomingSessions]
  );

  const { data: patientContracts = [] } = useQuery({
    queryKey: ["contracts", "patient", currentPatientId],
    queryFn: async () => {
      if (!currentPatientId) return [];
      try {
        const { getContractsForPatient } = await import("@/src/services/contracts");
        return getContractsForPatient(currentPatientId);
      } catch {
        return [];
      }
    },
    enabled: currentPatientId != null,
    staleTime: 2 * 60 * 1000,
    refetchInterval: 120_000, // Backup polling every 2 minutes
    retry: false,
  });

  const notificationBadge = React.useMemo(() => {
    const now = Date.now();
    const in24h = now + 24 * 60 * 60 * 1000;

    const sessionsSoonCount = upcomingSessions.filter((s: any) => {
      const start = new Date(s.startAt).getTime();
      return !Number.isNaN(start) && start >= now && start <= in24h;
    }).length;

    const pendingProposalsCount = patientContracts.filter(
      (c: any) => c.status === "PendingConfirmation"
    ).length;

    const total = sessionsSoonCount + pendingProposalsCount;
    return total > 0 ? Math.min(99, total) : undefined;
  }, [upcomingSessions, patientContracts]);

  // A custom tab bar that is centered on web
  const CenteredTabBar = (props: React.ComponentProps<typeof BottomTabBar>) => {
    // Return the default tab bar on native
    if (Platform.OS !== "web") {
      // The original tabBarStyle from screenOptions will be applied automatically
      return <BottomTabBar {...props} />;
    }

    // On web, wrap the tab bar in a centered container
    return (
      <View
        className="w-full items-center bg-white md:hidden"
        style={{
          paddingBottom: insets.bottom,
          borderTopWidth: 1,
          borderTopColor: "#E5E5EA",
        }}
      >
        <View className="w-full max-w-screen-lg">
          <BottomTabBar
            {...props}
            style={[
              props.style,
              {
                borderTopWidth: 0, // Remove original border as the wrapper has it now
                height: 60, // Set a fixed height for the inner bar
              },
            ]}
          />
        </View>
      </View>
    );
  };

  return (
    <Tabs
      tabBar={CenteredTabBar}
      screenOptions={{
        tabBarActiveTintColor: "#0D9488",
        tabBarInactiveTintColor: "#8E8E93",
        // The default style for the native tab bar
        tabBarStyle: {
          backgroundColor: "#FFFFFF",
          borderTopWidth: 1,
          borderTopColor: "#E5E5EA",
          height: 85 + insets.bottom,
          paddingBottom: 10 + insets.bottom,
          paddingTop: 10,
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: "500",
        },
        headerShown: false,
        headerTitle: "",
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          headerShown: false,
          tabBarBadge: notificationBadge,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          title: "Messages",
          headerShown: false,
          tabBarBadge: unreadBadge,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="chatbubble" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          headerShown: false,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}

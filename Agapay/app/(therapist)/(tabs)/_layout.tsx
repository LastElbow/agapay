import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import React from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BottomTabBar } from "@react-navigation/bottom-tabs";
import { View, Platform, useWindowDimensions } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CHAT_CONVERSATIONS_QUERY_KEY,
  fetchChatConversations,
} from "@/src/services/chat";
import { useAuth } from "@/src/providers/AuthProvider";
import signalrManager from "@/src/services/signalrManager";

export default function TherapistTabLayout() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 768;
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
        console.warn("Therapist tab chat hub connection failed", error);
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
          // Invalidate sessions for notification count
          queryClient.invalidateQueries({ queryKey: ["sessions", "therapist"] });
          queryClient.invalidateQueries({ queryKey: ["sessions", "upcoming"] });
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
        console.warn("Therapist tab sessions hub connection failed", error);
      }
    };

    setupSessionsConnection();

    return () => {
      active = false;
      unsubscribeFns.forEach(unsub => unsub());
      signalrManager.releaseConnection('sessions');
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
    queryKey: ["sessions", "therapist"],
    queryFn: async () => {
      try {
        const { fetchAllSessions } = await import("@/src/services/sessions");
        return fetchAllSessions();
      } catch {
        return [];
      }
    },
    staleTime: 2 * 60 * 1000,
    refetchInterval: 120_000, // Backup polling every 2 minutes
    retry: false,
  });

  const notificationBadge = React.useMemo(() => {
    const now = Date.now();
    const in24h = now + 24 * 60 * 60 * 1000;

    const ENDED_CONTRACT_STATUSES = new Set(["completed", "terminated", "cancelled"]);
    const FINAL_SESSION_STATUSES = new Set(["completed", "cancelled"]);

    const sessionsSoonCount = upcomingSessions.filter((s: any) => {
      const start = new Date(s.startAt).getTime();
      const sessionStatus = String(s.status ?? "").trim().toLowerCase();
      const contractStatus = String(s.contractStatus ?? "").trim().toLowerCase();
      const isContractEnded = ENDED_CONTRACT_STATUSES.has(contractStatus);
      const isSessionFinal = FINAL_SESSION_STATUSES.has(sessionStatus);
      return (
        !isContractEnded &&
        !isSessionFinal &&
        !Number.isNaN(start) &&
        start >= now &&
        start <= in24h &&
        sessionStatus !== "donefortoday"
      );
    }).length;

    return sessionsSoonCount > 0 ? Math.min(99, sessionsSoonCount) : undefined;
  }, [upcomingSessions]);

  // A custom tab bar that is centered on web
  const CenteredTabBar = (props: React.ComponentProps<typeof BottomTabBar>) => {
    // Return the default tab bar on native
    if (Platform.OS !== "web") {
      // The original tabBarStyle from screenOptions will be applied automatically
      return <BottomTabBar {...props} />;
    }

    if (isDesktop) {
      return null;
    }

    // On web, wrap the tab bar in a centered container
    return (
      <View
        className="w-full items-center bg-white"
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

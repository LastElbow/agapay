import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
  useMemo,
} from "react";
import { Modal, View, Text, TouchableOpacity, Platform } from "react-native";
import { AlertTriangle, Ban, Clock } from "lucide-react-native";
import { useAuth } from "@/src/providers/AuthProvider";
import { useRouter } from "expo-router";
import signalrManager from "@/src/services/signalrManager";
import apiClient from "@/api/client";

type AdminNotification = {
  id: string;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
};

type AdminNotificationContextType = {
  unreadCount: number;
  refreshNotifications: () => void;
};

const AdminNotificationContext = createContext<AdminNotificationContextType>({
  unreadCount: 0,
  refreshNotifications: () => {},
});

export const useAdminNotifications = () => useContext(AdminNotificationContext);

export function AdminNotificationProvider({
  children,
}: {
  children: ReactNode;
}) {
  const { accessToken, signOut } = useAuth();
  const router = useRouter();
  const isLoggedIn = !!accessToken;
  const [currentNotification, setCurrentNotification] =
    useState<AdminNotification | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notificationQueue, setNotificationQueue] = useState<
    AdminNotification[]
  >([]);
  const [forceLogoutReason, setForceLogoutReason] = useState<string | null>(
    null,
  );

  // Fetch unread notifications on login (for offline notifications)
  const fetchUnreadNotifications = useCallback(async () => {
    if (!isLoggedIn) return;

    try {
      const res = await apiClient.get("/api/Notifications?unreadOnly=true");
      const unread: AdminNotification[] = res.data;

      // Filter only admin notifications (warnings, suspensions, bans)
      const adminNotifications = unread.filter(
        (n) =>
          n.type === "warning" || n.type === "suspension" || n.type === "ban",
      );

      setUnreadCount(adminNotifications.length);

      // Queue unread admin notifications to show as popups
      if (adminNotifications.length > 0) {
        setNotificationQueue((prev) => {
          // Avoid duplicates
          const existingIds = new Set(prev.map((n) => n.id));
          const newNotifications = adminNotifications.filter(
            (n) => !existingIds.has(n.id),
          );
          return [...prev, ...newNotifications];
        });
      }
    } catch (error) {
      console.error("Failed to fetch unread notifications:", error);
    }
  }, [isLoggedIn]);

  // Show next notification from queue
  useEffect(() => {
    if (!currentNotification && notificationQueue.length > 0) {
      const [next, ...rest] = notificationQueue;
      setCurrentNotification(next);
      setNotificationQueue(rest);
    }
  }, [currentNotification, notificationQueue]);

  // Connect to SignalR for real-time notifications
  useEffect(() => {
    if (!isLoggedIn || !accessToken) return;

    let unsubscribeNotification: (() => void) | null = null;
    let unsubscribeForceLogout: (() => void) | null = null;

    const setupConnection = async () => {
      try {
        await signalrManager.getSharedConnection("notifications", accessToken);

        // Subscribe to regular notifications
        unsubscribeNotification = signalrManager.subscribeToEvent(
          "notifications",
          "NewNotification",
          (notification: AdminNotification) => {
            console.log("Received real-time notification:", notification);

            // Only handle admin notifications
            if (
              notification.type === "warning" ||
              notification.type === "suspension" ||
              notification.type === "ban"
            ) {
              // Add to queue for popup
              setNotificationQueue((prev) => [...prev, notification]);
              setUnreadCount((prev) => prev + 1);
            }
          },
        );

        // Subscribe to force logout events (when user is suspended/banned while online)
        unsubscribeForceLogout = signalrManager.subscribeToEvent(
          "notifications",
          "ForceLogout",
          (data: { reason: string }) => {
            console.log("Received ForceLogout event:", data);
            setForceLogoutReason(data.reason);
          },
        );
      } catch (error) {
        console.error("Failed to connect to notifications hub:", error);
      }
    };

    setupConnection();

    return () => {
      if (unsubscribeNotification) unsubscribeNotification();
      if (unsubscribeForceLogout) unsubscribeForceLogout();
      signalrManager.releaseConnection("notifications");
    };
  }, [isLoggedIn, accessToken]);

  // Handle force logout confirmation
  const handleForceLogoutConfirm = useCallback(async () => {
    setForceLogoutReason(null);
    await signOut();
    router.replace("/login" as any);
  }, [signOut, router]);

  // Fetch unread notifications on login
  useEffect(() => {
    if (isLoggedIn) {
      fetchUnreadNotifications();
    }
  }, [isLoggedIn, fetchUnreadNotifications]);

  // Mark notification as read and dismiss
  const handleUnderstood = useCallback(async () => {
    if (!currentNotification) return;

    try {
      await apiClient.put(`/api/Notifications/${currentNotification.id}/read`);
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch (error) {
      console.error("Failed to mark notification as read:", error);
    }

    setCurrentNotification(null);
  }, [currentNotification]);

  const refreshNotifications = useCallback(() => {
    fetchUnreadNotifications();
  }, [fetchUnreadNotifications]);

  // Get notification styling based on type
  const getNotificationStyle = (type: string) => {
    switch (type) {
      case "ban":
        return {
          bgColor: "bg-red-50",
          borderColor: "border-red-500",
          iconBgColor: "bg-red-100",
          iconColor: "#DC2626",
          buttonColor: "bg-red-600",
          Icon: Ban,
        };
      case "suspension":
        return {
          bgColor: "bg-orange-50",
          borderColor: "border-orange-500",
          iconBgColor: "bg-orange-100",
          iconColor: "#EA580C",
          buttonColor: "bg-orange-600",
          Icon: Clock,
        };
      case "warning":
      default:
        return {
          bgColor: "bg-yellow-50",
          borderColor: "border-yellow-500",
          iconBgColor: "bg-yellow-100",
          iconColor: "#CA8A04",
          buttonColor: "bg-yellow-600",
          Icon: AlertTriangle,
        };
    }
  };

  const value = useMemo(
    () => ({ unreadCount, refreshNotifications }),
    [unreadCount, refreshNotifications],
  );

  return (
    <AdminNotificationContext.Provider value={value}>
      {children}

      {/* Notification Modal */}
      <Modal
        visible={!!currentNotification}
        transparent
        animationType="fade"
        onRequestClose={handleUnderstood}
      >
        <View className="flex-1 bg-black/50 items-center justify-center p-4">
          {currentNotification &&
            (() => {
              const style = getNotificationStyle(currentNotification.type);
              const Icon = style.Icon;
              const isWarning = currentNotification.type === "warning";
              const isSuspension = currentNotification.type === "suspension";

              return (
                <View
                  className={`${style.bgColor} rounded-2xl p-6 max-w-md w-full border-2 ${style.borderColor} ${Platform.OS === "web" ? "shadow-xl" : ""}`}
                >
                  {/* Header */}
                  <View className="items-center mb-4">
                    <View
                      className={`w-16 h-16 rounded-full ${style.iconBgColor} items-center justify-center mb-3`}
                    >
                      <Icon color={style.iconColor} size={32} />
                    </View>
                    <Text className="text-xl font-bold text-gray-900 text-center">
                      {currentNotification.title}
                    </Text>
                  </View>

                  {/* Message */}
                  <View className="bg-white/80 rounded-xl p-4 mb-4">
                    <Text className="text-base text-gray-700 text-center leading-6">
                      {currentNotification.message}
                    </Text>
                  </View>

                  {/* Guidelines Link for warnings/suspensions */}
                  {(isWarning || isSuspension) && (
                    <TouchableOpacity
                      className="bg-white/60 rounded-lg p-3 mb-4"
                      onPress={() => {
                        handleUnderstood();
                        router.push("/community-guidelines" as any);
                      }}
                      activeOpacity={0.7}
                    >
                      <Text className="text-sm text-gray-600 text-center">
                        📖 Tap here to review our{" "}
                        <Text className="text-blue-600 font-semibold underline">
                          Community Guidelines
                        </Text>
                      </Text>
                    </TouchableOpacity>
                  )}

                  {/* Timestamp */}
                  <Text className="text-xs text-gray-500 text-center mb-4">
                    {new Date(currentNotification.createdAt).toLocaleString(
                      undefined,
                      {
                        dateStyle: "medium",
                        timeStyle: "short",
                      },
                    )}
                  </Text>

                  {/* Understood Button */}
                  <TouchableOpacity
                    style={{ backgroundColor: style.iconColor }}
                    className="rounded-xl py-4 px-6 items-center"
                    onPress={handleUnderstood}
                    activeOpacity={0.8}
                  >
                    <Text className="text-white font-semibold text-base">
                      I Understood
                    </Text>
                  </TouchableOpacity>

                  {/* Remaining notifications indicator */}
                  {notificationQueue.length > 0 && (
                    <Text className="text-xs text-gray-400 text-center mt-3">
                      {notificationQueue.length} more notification
                      {notificationQueue.length > 1 ? "s" : ""} pending
                    </Text>
                  )}
                </View>
              );
            })()}
        </View>
      </Modal>

      {/* Force Logout Modal - Shown when user is suspended/banned while online */}
      <Modal
        visible={!!forceLogoutReason}
        transparent
        animationType="fade"
        onRequestClose={() => {}} // Prevent dismissing with back button
      >
        <View className="flex-1 bg-black/70 items-center justify-center p-4">
          <View
            className={`bg-red-50 rounded-2xl p-6 max-w-md w-full border-2 border-red-500 ${Platform.OS === "web" ? "shadow-xl" : ""}`}
          >
            {/* Header */}
            <View className="items-center mb-4">
              <View className="w-16 h-16 rounded-full bg-red-100 items-center justify-center mb-3">
                <Ban color="#DC2626" size={32} />
              </View>
              <Text className="text-xl font-bold text-gray-900 text-center">
                Account Action Required
              </Text>
            </View>

            {/* Message */}
            <View className="bg-white/80 rounded-xl p-4 mb-4">
              <Text className="text-base text-gray-700 text-center leading-6">
                {forceLogoutReason}
              </Text>
            </View>

            {/* Info text */}
            <Text className="text-sm text-gray-500 text-center mb-4">
              You will be logged out of your account. You can log back in after
              reviewing the action taken on your account.
            </Text>

            {/* Logout Button */}
            <TouchableOpacity
              className="bg-red-600 rounded-xl py-4 px-6 items-center"
              onPress={handleForceLogoutConfirm}
              activeOpacity={0.8}
            >
              <Text className="text-white font-semibold text-base">
                I Understand, Log Me Out
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </AdminNotificationContext.Provider>
  );
}

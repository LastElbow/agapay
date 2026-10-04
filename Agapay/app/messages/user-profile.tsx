import { useRole } from "@/src/providers/RoleProvider";
import { COLORS } from "@/src/theme";
import { Avatar } from "@/src/components/Avatar";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  AlertCircle,
  ArrowLeft,
  Ban,
  Flag,
  XCircle,
  Calendar,
} from "lucide-react-native";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StatusBar,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import apiClient from "@/api/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchSessionsByPatientUser,
  patientSessionsQueryKey,
  SessionSummary,
} from "@/src/services/sessions";
import {
  CHAT_CONVERSATIONS_QUERY_KEY,
  blockUser,
  chatHistoryQueryKey,
  endConversation,
  fetchChatConversations,
  fetchChatHistory,
  reportUser,
  reopenConversation,
  unblockUser,
  type ChatConversationStatus,
  type ChatHistoryResponse,
} from "@/src/services/chat";

const REPORT_CATEGORIES = [
  "Harassment",
  "Spam",
  "Inappropriate",
  "Privacy",
  "Other",
] as const;

type ReportCategoryOption = (typeof REPORT_CATEGORIES)[number];

export default function UserProfileScreen() {
  const router = useRouter();
  const { selectedRole } = useRole();
  const {
    userId,
    name,
    role,
    avatar,
    status,
    isBlockedByMe: isBlockedByMeParam,
    isBlockedByOther: isBlockedByOtherParam,
  } = useLocalSearchParams<{
    userId?: string;
    name?: string;
    role?: string;
    avatar?: string;
    status?: string;
    isBlockedByMe?: string;
    isBlockedByOther?: string;
  }>();

  const normalizeParam = (value?: string | string[]) =>
    Array.isArray(value) ? value[0] : value;
  const parseBooleanParam = (value?: string | string[]) => {
    const normalized = normalizeParam(value);
    return normalized === "true";
  };

  const normalizedNameParam = normalizeParam(name);
  const rawOtherUserId = normalizeParam(userId) ?? null;
  const initialStatusParam = normalizeParam(status);
  const initialConversationStatus: ChatConversationStatus =
    initialStatusParam && initialStatusParam.toLowerCase() === "closed"
      ? "Closed"
      : "Active";
  const initialBlockedByMe = parseBooleanParam(isBlockedByMeParam);
  const initialBlockedByOther = parseBooleanParam(isBlockedByOtherParam);

  const [resolvedUserId, setResolvedUserId] = useState<string | null>(
    rawOtherUserId
  );
  const [isResolvingUserId, setIsResolvingUserId] = useState(false);
  const [resolveUserIdError, setResolveUserIdError] = useState<string | null>(
    null
  );

  const queryClient = useQueryClient();

  const [conversationStatus, setConversationStatus] =
    useState<ChatConversationStatus>(initialConversationStatus);
  const [isBlockedByMeState, setIsBlockedByMeState] =
    useState<boolean>(initialBlockedByMe);
  const [isBlockedByOtherState, setIsBlockedByOtherState] = useState<boolean>(
    initialBlockedByOther
  );
  const [reportModalVisible, setReportModalVisible] = useState(false);
  const [reportCategory, setReportCategory] =
    useState<ReportCategoryOption>("Harassment");
  const [reportNotes, setReportNotes] = useState("");
  const [isSubmittingReport, setIsSubmittingReport] = useState(false);
  const [isBlockBusy, setIsBlockBusy] = useState(false);
  const [isConversationBusy, setIsConversationBusy] = useState(false);

  const [userInfo, setUserInfo] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const otherUserId = resolvedUserId;

  const getErrorMessage = useCallback((err: any, fallback: string) => {
    const message =
      err?.response?.data?.message ??
      err?.response?.data?.Message ??
      err?.message ??
      (typeof err === "string" ? err : null);
    if (typeof message === "string" && message.trim()) {
      return message;
    }
    return fallback;
  }, []);

  useEffect(() => {
    setResolvedUserId(rawOtherUserId);
    setResolveUserIdError(null);
  }, [rawOtherUserId]);

  useEffect(() => {
    if (otherUserId || isResolvingUserId || resolveUserIdError) return;

    const candidateName = normalizedNameParam?.trim();
    if (!candidateName) {
      setResolveUserIdError(
        "We couldn't determine which user this profile belongs to."
      );
      return;
    }

    let mounted = true;
    const targetNameLower = candidateName.toLowerCase();
    const resolve = async () => {
      setIsResolvingUserId(true);
      try {
        const conversations = await fetchChatConversations();
        const target = conversations.find((item) => {
          const otherName = (item.otherUserName ?? "").trim().toLowerCase();
          return otherName === targetNameLower;
        });
        if (mounted) {
          if (target?.otherUserId) {
            setResolvedUserId(String(target.otherUserId));
            setResolveUserIdError(null);
          } else {
            setResolveUserIdError(
              "We couldn't automatically identify this user."
            );
          }
        }
      } catch (err: any) {
        if (mounted) {
          setResolveUserIdError(
            getErrorMessage(
              err,
              "We couldn't look up this conversation right now."
            )
          );
        }
      } finally {
        if (mounted) {
          setIsResolvingUserId(false);
        }
      }
    };

    resolve();
    return () => {
      mounted = false;
    };
  }, [
    otherUserId,
    isResolvingUserId,
    resolveUserIdError,
    normalizedNameParam,
    getErrorMessage,
  ]);

  const profileChatHistoryQueryKey = useMemo(() => {
    return otherUserId
      ? [...chatHistoryQueryKey(otherUserId), "profile"]
      : ["chat", "history", "profile", "noop"];
  }, [otherUserId]);

  const refreshChatQueries = useCallback(async () => {
    if (!otherUserId) return;
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: CHAT_CONVERSATIONS_QUERY_KEY,
        exact: false,
      }),
      queryClient.invalidateQueries({
        queryKey: chatHistoryQueryKey(otherUserId),
        exact: true,
      }),
      queryClient.invalidateQueries({
        queryKey: profileChatHistoryQueryKey,
        exact: true,
      }),
    ]);
  }, [otherUserId, queryClient, profileChatHistoryQueryKey]);

  const openReportModal = useCallback(() => {
    if (!otherUserId) {
      Alert.alert(
        "Unavailable",
        "We couldn't determine which user to report. Please try again later."
      );
      return;
    }
    setReportModalVisible(true);
  }, [otherUserId]);

  const closeReportModal = useCallback(() => {
    setReportModalVisible(false);
    setReportNotes("");
    setReportCategory("Harassment");
  }, []);

  const handleReportSubmit = useCallback(async () => {
    if (!otherUserId) return;
    setIsSubmittingReport(true);
    try {
      await reportUser({
        otherUserId,
        category: reportCategory,
        notes: reportNotes.trim() || undefined,
      });
      closeReportModal();
      Alert.alert(
        "Report submitted",
        "Thanks for helping us keep Agapay safe. Our team will review it shortly."
      );
    } catch (err: any) {
      Alert.alert(
        "Unable to submit report",
        getErrorMessage(
          err,
          "We couldn't submit your report. Please try again."
        )
      );
    } finally {
      setIsSubmittingReport(false);
    }
  }, [
    otherUserId,
    reportCategory,
    reportNotes,
    closeReportModal,
    getErrorMessage,
  ]);

  const handleBlock = useCallback(() => {
    if (!otherUserId) {
      Alert.alert(
        "Unavailable",
        "We couldn't determine whose conversation this is. Please try again later."
      );
      return;
    }

    const currentlyBlocked = isBlockedByMeState;
    Alert.alert(
      currentlyBlocked ? "Unblock user" : "Block user",
      currentlyBlocked
        ? "Allow this user to send you messages again?"
        : "You will no longer receive new messages from this user.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: currentlyBlocked ? "Unblock" : "Block",
          style: currentlyBlocked ? "default" : "destructive",
          onPress: async () => {
            setIsBlockBusy(true);
            try {
              if (currentlyBlocked) {
                await unblockUser(otherUserId);
                setIsBlockedByMeState(false);
                Alert.alert(
                  "Unblocked",
                  "You can now exchange messages again."
                );
              } else {
                await blockUser(otherUserId);
                setIsBlockedByMeState(true);
                setIsBlockedByOtherState(false);
                Alert.alert(
                  "User blocked",
                  "You won't receive new messages from this user until you unblock them."
                );
              }
              await refreshChatQueries();
            } catch (err: any) {
              Alert.alert(
                "Unable to update block",
                getErrorMessage(
                  err,
                  "We couldn't update your block settings. Please try again."
                )
              );
            } finally {
              setIsBlockBusy(false);
            }
          },
        },
      ]
    );
  }, [otherUserId, isBlockedByMeState, refreshChatQueries, getErrorMessage]);

  const handleConversationAction = useCallback(() => {
    if (!otherUserId) {
      Alert.alert(
        "Unavailable",
        "We couldn't determine which conversation this is. Please try again later."
      );
      return;
    }

    const closing = conversationStatus !== "Closed";
    Alert.alert(
      closing ? "Close conversation" : "Reopen conversation",
      closing
        ? "Neither participant will be able to send new messages until the chat is reopened."
        : "Resume messaging with this user?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: closing ? "Close" : "Reopen",
          style: closing ? "destructive" : "default",
          onPress: async () => {
            setIsConversationBusy(true);
            try {
              if (closing) {
                await endConversation(otherUserId);
                setConversationStatus("Closed");
                Alert.alert(
                  "Conversation closed",
                  "You can reopen it from this screen whenever you're ready."
                );
              } else {
                await reopenConversation(otherUserId);
                setConversationStatus("Active");
                Alert.alert(
                  "Conversation reopened",
                  "You can now resume messaging with this user."
                );
              }
              await refreshChatQueries();
            } catch (err: any) {
              Alert.alert(
                "Unable to update chat",
                getErrorMessage(
                  err,
                  closing
                    ? "We couldn't close this chat. Please try again."
                    : "We couldn't reopen this chat. Please try again."
                )
              );
            } finally {
              setIsConversationBusy(false);
            }
          },
        },
      ]
    );
  }, [otherUserId, conversationStatus, refreshChatQueries, getErrorMessage]);

  const displayName = useMemo(() => {
    return (
      (typeof name === "string" && name) ||
      (userInfo?.name as string) ||
      ([userInfo?.firstName, userInfo?.lastName]
        .filter(Boolean)
        .join(" ") as string) ||
      "User"
    );
  }, [name, userInfo]);

  const userRoleLabel = useMemo(() => {
    if (typeof role === "string" && role) return role;
    return (userInfo?.role as string) || "Unknown";
  }, [role, userInfo]);

  const blockActionLabel = isBlockedByMeState ? "Unblock User" : "Block User";
  const blockIconColor = isBlockedByMeState ? "#16A34A" : "#EF4444";
  const blockButtonDisabled = isBlockBusy || !otherUserId || isResolvingUserId;

  const conversationStatusBadge =
    conversationStatus === "Closed" ? "Chat Closed" : "Chat Active";
  const conversationActionLabel =
    conversationStatus === "Closed" ? "Reopen Chat" : "Close Chat";
  const conversationActionColor =
    conversationStatus === "Closed" ? COLORS.PRIMARY : "#DC2626";
  const conversationActionContainer =
    conversationStatus === "Closed"
      ? "bg-blue-50 border border-blue-200"
      : "bg-red-50 border border-red-200";
  const conversationTextColorClass =
    conversationStatus === "Closed" ? "text-blue-700" : "text-red-600";
  const conversationButtonDisabled =
    isConversationBusy || !otherUserId || isResolvingUserId;
  const actionsDisabled = !otherUserId || isResolvingUserId;
  const avatarUri = normalizeParam(avatar);

  const { data: chatHistory } = useQuery<ChatHistoryResponse>({
    queryKey: profileChatHistoryQueryKey,
    queryFn: () => fetchChatHistory(otherUserId!),
    enabled: Boolean(otherUserId),
    refetchOnMount: true,
    initialData: () => ({
      status: "Active",
      isBlockedByMe: false,
      isBlockedByOther: false,
      messages: [],
      patientContext: null,
      nextCursor: null,
      hasMore: false,
    }),
  });

  useEffect(() => {
    if (!chatHistory) {
      return;
    }
    setConversationStatus(chatHistory.status);
    setIsBlockedByMeState(chatHistory.isBlockedByMe);
    setIsBlockedByOtherState(chatHistory.isBlockedByOther);
  }, [chatHistory]);

  const isViewingAsTherapist = selectedRole === "PhysicalTherapist";

  // Fetch sessions for this patient (only if viewing as therapist)
  const { data: sessions = [], isLoading: sessionsLoading } = useQuery({
    queryKey: otherUserId
      ? patientSessionsQueryKey(otherUserId)
      : ["sessions", "none"],
    queryFn: () =>
      otherUserId
        ? fetchSessionsByPatientUser(otherUserId)
        : Promise.resolve([]),
    enabled: isViewingAsTherapist && Boolean(otherUserId),
  });

  const dynamicHeaderTitle = useMemo(() => {
    const myRole = (selectedRole || "").toLowerCase();
    if (myRole === "physicaltherapist" || myRole === "therapist") {
      return "Patient Profile";
    }
    if (myRole === "patient" || myRole === "client") {
      return "Therapist Profile";
    }
    return "User Profile";
  }, [selectedRole]);

  // Filter cancelled sessions
  const cancelledSessions = sessions.filter(
    (s: SessionSummary) => s.status.toLowerCase() === "cancelled"
  );

  useEffect(() => {
    const fetchUserInfo = async () => {
      if (!otherUserId) {
        if (isResolvingUserId) {
          return;
        }
        setError(
          resolveUserIdError ??
          "We couldn't determine the user for this profile."
        );
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        const userRoleValue = (role ?? "").toLowerCase();

        if (
          userRoleValue === "physicaltherapist" ||
          userRoleValue === "therapist"
        ) {
          try {
            const byUser = await apiClient.get(
              `/api/Therapist/by-user/${otherUserId}`
            );
            const therapistId = byUser?.data?.id ?? byUser?.data?.Id;
            if (therapistId == null) {
              throw new Error("Therapist not found for this user");
            }
            const details = await apiClient.get(
              `/api/Therapist/${therapistId}`
            );
            setUserInfo(details.data);
            setError(null);
          } catch (e: any) {
            setUserInfo(null);
            setError(e?.message || "Unable to load therapist details");
          }
        } else if (userRoleValue === "patient" || userRoleValue === "client") {
          try {
            const res = await apiClient.get(
              `/api/Patient/by-user/${otherUserId}`
            );
            setUserInfo(res.data);
            setError(null);
          } catch (e: any) {
            setUserInfo(null);
            setError(e?.message || "Unable to load patient details");
          }
        } else {
          setUserInfo(null);
          setError(null);
        }
      } catch (err: any) {
        console.error("Failed to fetch user info:", err);
        setError(err?.message || "Failed to load user information");
      } finally {
        setIsLoading(false);
      }
    };

    fetchUserInfo();
  }, [otherUserId, role, isResolvingUserId, resolveUserIdError]);

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <StatusBar
        backgroundColor="#FFFFFF"
        barStyle="dark-content"
        translucent={false}
      />

      {/* Header */}
      <View className="flex-row items-center px-4 py-3 bg-white border-b border-gray-200">
        <TouchableOpacity
          accessibilityLabel="Go back"
          onPress={() => router.back()}
          className="p-2 -ml-2"
        >
          <ArrowLeft color="#111" size={24} />
        </TouchableOpacity>
        <Text className="text-lg font-bold text-gray-800 ml-2">
          {dynamicHeaderTitle}
        </Text>
      </View>

      <ScrollView className="flex-1">
        {isLoading ? (
          <View className="flex-1 items-center justify-center py-20">
            <ActivityIndicator size="large" color={COLORS.PRIMARY} />
            <Text className="text-sm text-gray-500 mt-4">
              Loading user information...
            </Text>
          </View>
        ) : error ? (
          <View className="flex-1 items-center justify-center py-20 px-6">
            <AlertCircle color="#EF4444" size={48} />
            <Text className="text-base font-semibold text-red-600 mt-4 text-center">
              Failed to load user information
            </Text>
            <Text className="text-sm text-gray-600 mt-2 text-center">
              {error}
            </Text>
          </View>
        ) : (
          <>
            {/* User Info Section */}
            <View className="bg-white p-6 items-center border-b border-gray-200">
              <Avatar
                uri={
                  (avatarUri as any) ||
                  userInfo?.profilePicture ||
                  userInfo?.profilePictureUrl
                }
                name={displayName}
                size={100}
              />
              <Text className="text-2xl font-bold text-gray-800 mt-4">
                {displayName}
              </Text>
              <Text className="text-sm text-gray-500 mt-1 capitalize">
                {userRoleLabel}
              </Text>

              {/* Email Hidden as per request */}
              {/* {userInfo?.email && (
                <Text className="text-sm text-gray-600 mt-2">
                  {userInfo.email}
                </Text>
              )} */}

              {userInfo?.phoneNumber && (
                <Text className="text-sm text-gray-600 mt-1">
                  {userInfo.phoneNumber}
                </Text>
              )}
            </View>

            {/* Additional Info Section */}
            {userInfo && (
              <View className="bg-white mt-2 p-4 border-b border-gray-200">
                <Text className="text-base font-semibold text-gray-800 mb-3 pl-3">
                  Additional Information
                </Text>

                {/* Patient-specific fields */}
                {userInfo.activeProfile && (
                  <View className="mb-3 pl-3">
                    <Text className="text-sm font-medium text-gray-500 mb-1">
                      Current Complaints
                    </Text>
                    <Text className="text-sm text-gray-800">
                      {userInfo.activeProfile.currentComplaints || userInfo.activeProfile?.complaint || "Not specified"}
                    </Text>
                  </View>
                )}

                {userInfo.activeProfile?.occupation && (
                  <View className="mb-3 pl-3">
                    <Text className="text-sm font-medium text-gray-500 mb-1">
                      Occupation
                    </Text>
                    <Text className="text-sm text-gray-800">
                      {userInfo.activeProfile.occupation}
                    </Text>
                  </View>
                )}

                {userInfo.activeProfile?.activityLevel && (
                  <View className="mb-3 pl-3">
                    <Text className="text-sm font-medium text-gray-500 mb-1">
                      Activity Level
                    </Text>
                    <Text className="text-sm text-gray-800">
                      {userInfo.activeProfile.activityLevel}
                    </Text>
                  </View>
                )}

                {/* Address - HIDDEN as per final request */}

                {/* Therapist-specific fields */}
                {userInfo.specialization && (
                  <View className="mb-2">
                    <Text className="text-sm text-gray-500">
                      Specialization
                    </Text>
                    <Text className="text-sm text-gray-800">
                      {userInfo.specialization}
                    </Text>
                  </View>
                )}

                {userInfo.experience && (
                  <View className="mb-2">
                    <Text className="text-sm text-gray-500">Experience</Text>
                    <Text className="text-sm text-gray-800">
                      {userInfo.experience}
                    </Text>
                  </View>
                )}

                {userInfo.bio && (
                  <View className="mb-2">
                    <Text className="text-sm text-gray-500">Bio</Text>
                    <Text className="text-sm text-gray-800">
                      {userInfo.bio}
                    </Text>
                  </View>
                )}
              </View>
            )}

            {/* Cancelled Sessions Section (Therapist View Only) */}
            {isViewingAsTherapist && (
              <View className="bg-white mt-2 p-4 border-b border-gray-200">
                <Text className="text-base font-semibold text-gray-800 mb-3">
                  Cancelled Sessions
                </Text>

                {sessionsLoading ? (
                  <View className="py-4">
                    <ActivityIndicator size="small" color={COLORS.PRIMARY} />
                  </View>
                ) : cancelledSessions.length === 0 ? (
                  <Text className="text-sm text-gray-500 py-2">
                    No cancelled sessions
                  </Text>
                ) : (
                  <View>
                    {cancelledSessions.map((session: SessionSummary) => (
                      <View
                        key={session.id}
                        className="mb-3 p-3 bg-gray-50 rounded-lg border border-gray-200"
                      >
                        <View className="flex-row items-start justify-between mb-2">
                          <View className="flex-1">
                            <Text className="text-sm font-semibold text-gray-800">
                              {session.conditionCase || "Session"}
                            </Text>
                            {session.patientName && (
                              <Text className="text-xs text-gray-600 mt-1">
                                Patient: {session.patientName}
                              </Text>
                            )}
                          </View>
                          <View className="bg-red-100 px-2 py-1 rounded">
                            <Text className="text-xs font-medium text-red-700">
                              Cancelled
                            </Text>
                          </View>
                        </View>

                        <View className="flex-row items-center mt-1">
                          <Calendar color="#6B7280" size={14} />
                          <Text className="text-xs text-gray-600 ml-1">
                            {new Date(session.startAt).toLocaleDateString(
                              "en-US",
                              {
                                month: "short",
                                day: "numeric",
                                year: "numeric",
                              }
                            )}{" "}
                            at{" "}
                            {new Date(session.startAt).toLocaleTimeString(
                              "en-US",
                              {
                                hour: "numeric",
                                minute: "2-digit",
                                hour12: true,
                              }
                            )}
                          </Text>
                        </View>

                        {session.locationAddress && (
                          <Text className="text-xs text-gray-500 mt-1">
                            📍 {session.locationAddress}
                          </Text>
                        )}
                      </View>
                    ))}
                  </View>
                )}
              </View>
            )}

            {/* Actions Section */}
            <View className="bg-white mt-2 p-4">
              <Text className="text-base font-semibold text-gray-800 mb-3">
                Conversation
              </Text>

              <View className="flex-row flex-wrap gap-2 mb-3">
                <View className="px-2 py-1 rounded-full bg-blue-100 border border-blue-200">
                  <Text className="text-xs font-medium text-blue-800">
                    {conversationStatusBadge}
                  </Text>
                </View>
                {isBlockedByMeState ? (
                  <View className="px-2 py-1 rounded-full bg-red-100 border border-red-200">
                    <Text className="text-xs font-medium text-red-700">
                      You blocked this user
                    </Text>
                  </View>
                ) : null}
                {isBlockedByOtherState ? (
                  <View className="px-2 py-1 rounded-full bg-amber-100 border border-amber-200">
                    <Text className="text-xs font-medium text-amber-700">
                      Blocked by other user
                    </Text>
                  </View>
                ) : null}
              </View>

              {isBlockedByOtherState ? (
                <View className="flex-row items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">
                  <AlertCircle color="#B45309" size={18} />
                  <Text className="text-xs text-amber-800 flex-1">
                    This user has blocked you. You can still read past messages
                    but cannot send new ones unless they unblock you.
                  </Text>
                </View>
              ) : null}

              {actionsDisabled ? (
                <Text className="text-xs text-gray-500 mb-3">
                  {isResolvingUserId
                    ? "Looking up conversation details..."
                    : resolveUserIdError ??
                    "Conversation actions are unavailable because the user identifier is missing."}
                </Text>
              ) : null}

              {/* Report User */}
              <TouchableOpacity
                className={`flex-row items-center p-4 mb-2 bg-gray-50 rounded-lg border border-gray-200 ${actionsDisabled ? "opacity-60" : ""
                  }`}
                onPress={openReportModal}
                activeOpacity={0.7}
                disabled={actionsDisabled}
              >
                <Flag color="#F59E0B" size={20} />
                <Text className="text-sm font-medium text-gray-800 ml-3 flex-1">
                  Report User
                </Text>
              </TouchableOpacity>

              {/* Block / Unblock */}
              <TouchableOpacity
                className={`flex-row items-center p-4 mb-2 bg-gray-50 rounded-lg border border-gray-200 ${blockButtonDisabled ? "opacity-60" : ""
                  }`}
                onPress={handleBlock}
                activeOpacity={0.7}
                disabled={blockButtonDisabled}
              >
                <Ban color={blockIconColor} size={20} />
                <Text className="text-sm font-medium text-gray-800 ml-3 flex-1">
                  {blockActionLabel}
                </Text>
                {isBlockBusy ? (
                  <ActivityIndicator size="small" color={blockIconColor} />
                ) : null}
              </TouchableOpacity>

              {/* Close / Reopen conversation */}
              <TouchableOpacity
                className={`flex-row items-center p-4 rounded-lg ${conversationActionContainer} ${conversationButtonDisabled ? "opacity-60" : ""
                  }`}
                onPress={handleConversationAction}
                activeOpacity={0.7}
                disabled={conversationButtonDisabled}
              >
                <XCircle color={conversationActionColor} size={20} />
                <Text
                  className={`text-sm font-medium ml-3 flex-1 ${conversationTextColorClass}`}
                >
                  {conversationActionLabel}
                </Text>
                {isConversationBusy ? (
                  <ActivityIndicator
                    size="small"
                    color={conversationActionColor}
                  />
                ) : null}
              </TouchableOpacity>
            </View>
          </>
        )}
      </ScrollView>

      <Modal
        visible={reportModalVisible}
        transparent
        animationType="fade"
        onRequestClose={closeReportModal}
      >
        <Pressable className="flex-1 bg-black/40" onPress={closeReportModal}>
          <View
            className="mx-4 mt-auto mb-8 rounded-3xl bg-white px-5 py-6"
            onStartShouldSetResponder={() => true}
          >
            <Text className="text-lg font-semibold text-gray-900 mb-1">
              Report {displayName}
            </Text>
            <Text className="text-sm text-gray-600 mb-4">
              Choose a reason and tell us what happened. Reports are reviewed by
              our safety team.
            </Text>
            <View className="flex-row flex-wrap gap-2 mb-4">
              {REPORT_CATEGORIES.map((option) => {
                const isSelected = reportCategory === option;
                return (
                  <TouchableOpacity
                    key={option}
                    className={`px-3 py-1.5 rounded-full border ${isSelected
                      ? "border-primary bg-primary/10"
                      : "border-gray-200"
                      }`}
                    onPress={() => setReportCategory(option)}
                  >
                    <Text
                      className={`text-sm ${isSelected
                        ? "text-primary font-semibold"
                        : "text-gray-700"
                        }`}
                    >
                      {option}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <TextInput
              className="min-h-[96px] rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-800"
              multiline
              value={reportNotes}
              onChangeText={setReportNotes}
              placeholder="Share any details that might help (optional)"
              placeholderTextColor="#9A9A9A"
            />
            <View className="flex-row justify-end gap-3 mt-5">
              <TouchableOpacity
                className="px-4 py-2 rounded-full border border-gray-200"
                onPress={closeReportModal}
                disabled={isSubmittingReport}
              >
                <Text className="text-sm text-gray-700">Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                className={`px-4 py-2 rounded-full bg-primary ${isSubmittingReport ? "opacity-70" : ""
                  }`}
                onPress={handleReportSubmit}
                disabled={isSubmittingReport}
              >
                {isSubmittingReport ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text className="text-sm font-semibold text-white">
                    Submit
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

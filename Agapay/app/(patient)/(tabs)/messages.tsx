import {
  CHAT_CONVERSATIONS_QUERY_KEY,
  ChatConversationDto,
  fetchChatConversations,
} from "@/src/services/chat";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/src/providers/AuthProvider";
import { Avatar } from "@/src/components/Avatar";
import { useLocalSearchParams, useRouter } from "expo-router";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import {
  FlatList,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
  TextInput,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Skeleton from "@/src/components/Skeleton";
import ConversationView from "@/src/components/ConversationView";
import WebHeader from "@/src/components/WebHeader";
import { Search } from "lucide-react-native";

const formatTimestamp = (value?: string | null) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  try {
    return date.toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return date.toISOString();
  }
};

const extractUserFriendlyMessage = (message?: string | null) => {
  if (!message) return "No messages yet";

  // Check if this is a session proposal message
  if (message.includes("[SESSION_PROPOSAL]")) {
    const parts = message.split("\n");
    // Remove the first line (contains [SESSION_PROPOSAL] and JSON)
    const userFriendlyParts = parts
      .slice(1)
      .filter(
        (line) =>
          !line.trim().startsWith("{") &&
          !line.trim().startsWith("}") &&
          !line.includes("contractId") &&
          !line.includes("caseTitle") &&
          line.trim().length > 0,
      );
    const extracted = userFriendlyParts.join("\n").trim();

    // If we extracted a user-friendly message, return it
    if (extracted) {
      return extracted;
    }

    // Fallback for session proposals
    return "📅 Session Proposal";
  }

  return message;
};

function MessageCardSkeleton() {
  return (
    <View className="flex-row items-center bg-white p-3 rounded-xl mb-3 border border-gray-100">
      <Skeleton
        style={{
          width: 48,
          height: 48,
          borderRadius: 24,
          marginRight: 12,
        }}
      />
      <View className="flex-1">
        <View className="flex-row justify-between items-start mb-1">
          <Skeleton
            style={{
              height: 16,
              width: "60%",
              borderRadius: 4,
            }}
          />
          <Skeleton
            style={{
              height: 12,
              width: "20%",
              borderRadius: 4,
            }}
          />
        </View>
        <Skeleton
          style={{
            height: 14,
            width: "80%",
            borderRadius: 4,
            marginBottom: 4,
          }}
        />
        <Skeleton
          style={{
            height: 12,
            width: "40%",
            borderRadius: 4,
          }}
        />
      </View>
    </View>
  );
}

type ConversationRowProps = {
  item: ChatConversationDto & { otherUserId: string | number };
  isDesktop: boolean;
  isSelected: boolean;
  onSelectDesktop: (otherUserId: string) => void;
  onOpenMobile: (payload: {
    conversationId: string;
    name?: string;
    role?: string;
    avatar?: string;
  }) => void;
};

const ConversationRow = memo(
  ({
    item,
    isDesktop,
    isSelected,
    onSelectDesktop,
    onOpenMobile,
  }: ConversationRowProps) => {
    const avatarUrl =
      typeof item.otherUserAvatar === "string"
        ? item.otherUserAvatar
        : undefined;
    const unreadCount = item.unreadCount ?? 0;
    const hasUnread = unreadCount > 0;
    const statusTags: string[] = [];
    if ((item.status ?? "Active") === "Closed") {
      statusTags.push("Closed");
    }
    if (item.isBlockedByMe) {
      statusTags.push("You blocked");
    } else if (item.isBlockedByOther) {
      statusTags.push("Blocked");
    }

    return (
      <TouchableOpacity
        className={`flex-row items-center p-3 rounded-xl mb-3 border ${
          isSelected && isDesktop
            ? "bg-teal-50 border-teal-100"
            : "bg-white border-teal-100"
        }`}
        activeOpacity={0.8}
        onPress={() => {
          const otherUserId = String(item.otherUserId);
          if (isDesktop) {
            onSelectDesktop(otherUserId);
            return;
          }
          onOpenMobile({
            conversationId: otherUserId,
            name: item.otherUserName ?? undefined,
            role: item.otherUserRole ?? undefined,
            avatar: avatarUrl,
          });
        }}
      >
        {isSelected && isDesktop && (
          <View className="absolute left-0 top-0 bottom-0 w-1 bg-teal-500 rounded-l-xl" />
        )}

        <Avatar uri={avatarUrl} name={item.otherUserName} size={52} />

        <View className="flex-1 ml-3">
          <View className="flex-row justify-between items-center">
            <Text className="text-base font-bold text-gray-800">
              {item.otherUserName ?? "Unknown"}
            </Text>
            <Text className="text-xs text-gray-500">
              {formatTimestamp(item.latestMessageTimestamp)}
            </Text>
          </View>

          {item.otherUserRole ? (
            <Text className="text-sm text-gray-600 mt-1">
              {item.otherUserRole}
            </Text>
          ) : null}

          <Text
            className={`text-sm mt-1 ${
              hasUnread ? "text-gray-800 font-bold" : "text-gray-500"
            }`}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {item.latestMessageIsMine ? "You: " : ""}
            {extractUserFriendlyMessage(item.latestMessage)}
          </Text>

          {statusTags.length ? (
            <View className="flex-row flex-wrap gap-1 mt-2">
              {statusTags.map((tag) => (
                <View
                  key={tag}
                  className="px-2 py-0.5 rounded-full border border-teal-100 bg-teal-50"
                >
                  <Text className="text-xs font-medium text-gray-600">
                    {tag}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>

        {hasUnread ? (
          <View className="w-6 h-6 rounded-full bg-primary items-center justify-center ml-2">
            <Text className="text-white text-xs font-bold">{unreadCount}</Text>
          </View>
        ) : null}
      </TouchableOpacity>
    );
  },
);

ConversationRow.displayName = "ConversationRow";

export default function PatientMessagesTab() {
  const router = useRouter();
  const { accessToken } = useAuth();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 768;

  // Read conversationId from URL params (when coming from "Inquire" button)
  const params = useLocalSearchParams<{ conversationId?: string }>();
  const initialConversationId = params.conversationId ?? null;

  const [selectedConversationId, setSelectedConversationId] = useState<
    string | null
  >(initialConversationId);

  // Sync selected conversation when URL params change (e.g., navigating from Inquire button)
  useEffect(() => {
    if (
      initialConversationId &&
      initialConversationId !== selectedConversationId
    ) {
      setSelectedConversationId(initialConversationId);
    }
  }, [initialConversationId]);
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: CHAT_CONVERSATIONS_QUERY_KEY,
    queryFn: fetchChatConversations,
    staleTime: 60_000,
    enabled: !!accessToken,
  });

  const conversations = (data ?? []).filter(
    (item): item is ChatConversationDto & { otherUserId: string | number } =>
      item?.otherUserId !== undefined && item?.otherUserId !== null,
  );

  const selectedConversation = selectedConversationId
    ? conversations.find(
        (c) => String(c.otherUserId) === selectedConversationId,
      )
    : null;

  const onSelectDesktop = useCallback((otherUserId: string) => {
    setSelectedConversationId(otherUserId);
  }, []);

  const onOpenMobile = useCallback(
    (payload: {
      conversationId: string;
      name?: string;
      role?: string;
      avatar?: string;
    }) => {
      router.push({
        pathname: "/messages/[conversationId]",
        params: {
          conversationId: payload.conversationId,
          name: payload.name,
          role: payload.role,
          avatar: payload.avatar,
        },
      });
    },
    [router],
  );

  const keyExtractor = useCallback(
    (item: ChatConversationDto & { otherUserId: string | number }) =>
      String(item.otherUserId),
    [],
  );

  const renderConversationItem = useCallback(
    ({
      item,
    }: {
      item: ChatConversationDto & { otherUserId: string | number };
    }) => (
      <ConversationRow
        item={item}
        isDesktop={isDesktop}
        isSelected={selectedConversationId === String(item.otherUserId)}
        onSelectDesktop={onSelectDesktop}
        onOpenMobile={onOpenMobile}
      />
    ),
    [isDesktop, onOpenMobile, onSelectDesktop, selectedConversationId],
  );

  const listExtraData = useMemo(
    () => ({ selectedConversationId, isDesktop }),
    [selectedConversationId, isDesktop],
  );

  return (
    <View className="flex-1 bg-teal-50">
      <WebHeader />
      <SafeAreaView
        className="flex-1 bg-teal-50 w-full max-w-screen-2xl mx-auto"
        edges={["top", "left", "right"]}
      >
        <View className="flex-1 flex-row bg-teal-50 md:m-6 md:rounded-2xl md:border md:border-teal-100 md:shadow-sm md:overflow-hidden">
          {/* Left Side: Conversation List */}
          <View
            className={`flex-1 p-4 ${
              isDesktop ? "md:w-1/3 md:max-w-sm border-r border-gray-200" : ""
            }`}
          >
            {/* Search Bar */}
            <View className="mb-4 bg-white border border-teal-100 rounded-lg flex-row items-center px-3 py-2">
              <Search size={20} color="#9CA3AF" />
              <TextInput
                placeholder="Search messages..."
                className="flex-1 ml-2 text-base text-gray-800"
                placeholderTextColor="#9CA3AF"
              />
            </View>

            {isLoading ? (
              <View>
                <MessageCardSkeleton />
                <MessageCardSkeleton />
                <MessageCardSkeleton />
              </View>
            ) : isError ? (
              <TouchableOpacity
                className="bg-red-100 border border-red-200 rounded-lg p-4 mb-4"
                activeOpacity={0.8}
                onPress={() => refetch()}
              >
                <Text className="text-red-800 font-bold text-base mb-1">
                  Unable to load conversations
                </Text>
                {error instanceof Error ? (
                  <Text className="text-red-700 mb-2">{error.message}</Text>
                ) : null}
                <Text className="text-red-800 font-bold">Tap to retry</Text>
              </TouchableOpacity>
            ) : !conversations.length ? (
              <View className="flex-1 items-center justify-center">
                <Text className="text-lg font-bold text-gray-800 mb-1">
                  No conversations yet
                </Text>
                <Text className="text-gray-600 text-center">
                  Start a chat with your therapist to see it here.
                </Text>
              </View>
            ) : (
              <FlatList
                data={conversations}
                keyExtractor={keyExtractor}
                renderItem={renderConversationItem}
                extraData={listExtraData}
                keyboardShouldPersistTaps="handled"
                initialNumToRender={12}
                windowSize={10}
                showsVerticalScrollIndicator={false}
              />
            )}
          </View>

          {/* Right Side: Chat View (Desktop Only) */}
          <View className="hidden md:flex flex-[2] bg-white border-l border-gray-100">
            {selectedConversationId ? (
              <ConversationView
                conversationId={selectedConversationId}
                name={selectedConversation?.otherUserName ?? undefined}
                role={selectedConversation?.otherUserRole ?? undefined}
                avatar={
                  typeof selectedConversation?.otherUserAvatar === "string"
                    ? selectedConversation.otherUserAvatar
                    : undefined
                }
                showBackButton={false}
              />
            ) : (
              <View className="flex-1 items-center justify-center p-8">
                <View className="w-24 h-24 bg-gray-100 rounded-full items-center justify-center mb-4">
                  <Text className="text-4xl">💬</Text>
                </View>
                <Text className="text-xl font-bold text-gray-800 mb-2">
                  Select a conversation
                </Text>
                <Text className="text-gray-500 text-center">
                  Choose a chat from the list to start messaging with your
                  therapist.
                </Text>
              </View>
            )}
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}

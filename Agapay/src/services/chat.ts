import apiClient from "@/api/client";
import type { QueryClient } from "@tanstack/react-query";

export const CHAT_CONVERSATIONS_QUERY_KEY = ["chat", "conversations"] as const;
export const chatHistoryQueryKey = (otherUserId: string | number) =>
  ["chat", "history", String(otherUserId)] as const;

export type ChatConversationStatus = "Active" | "Closed";

export type ChatConversationDto = {
  otherUserId: string | number;
  otherUserName?: string | null;
  otherUserRole?: string | null;
  // Absolute (preferred) or relative URL to the other user's avatar image.
  // Null when the user has not uploaded a profile picture.
  otherUserAvatar?: string | null;
  latestMessage?: string | null;
  latestMessageTimestamp?: string | null;
  unreadCount?: number | null;
  status?: ChatConversationStatus;
  closedAt?: string | null;
  closedByUserId?: string | null;
  isBlockedByMe?: boolean;
  isBlockedByOther?: boolean;
  latestMessageIsMine?: boolean;
};

export type ChatMessageType = "TEXT" | "IMAGE" | string;

export type ChatMessageDto = {
  id: string | number;
  senderId: string | number;
  receiverId: string | number;
  content: string;
  timestamp: string;
  messageType?: ChatMessageType;
  imagePath?: string | null;
  signedUrl?: string | null;
  isRead?: boolean;
  isMine?: boolean;
  patientContext?: PatientContext | null;
};

export type ChatHistoryResponse = {
  status: ChatConversationStatus;
  isBlockedByMe: boolean;
  isBlockedByOther: boolean;
  messages: ChatMessageDto[];
  patientContext?: PatientContext | null;
  closedAt?: string | null;
  closedByUserId?: string | null;
  nextCursor?: number | null;
  hasMore?: boolean;
};

export type BlockEntry = {
  blockedUserId: string;
  blockedAt: string;
  expiresAt?: string | null;
  reason?: string | null;
};

export type ReportPayload = {
  otherUserId: string | number;
  conversationId?: number;
  messageId?: number;
  category: string;
  notes?: string;
};

export type PatientContext = {
  id: number;
  firstName?: string | null;
  lastName?: string | null;
  dateOfBirth?: string | null;
  relationshipToUser?: string | null;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  locationDisplayName?: string | null;
  occupation?: string | null;
  activityLevel?: string | null;
  medicalCondition?: string | null;
  surgicalHistory?: string | null;
  medicationBeingTaken?: string | null;
  currentComplaints?: string | null;
};

const asArray = <T>(value: unknown): T[] => {
  if (Array.isArray(value)) return value as T[];
  return [];
};

export async function fetchChatConversations(): Promise<ChatConversationDto[]> {
  const res = await apiClient.get("/api/chat/conversations");
  const list = asArray<unknown>(res?.data);

  const normalizeAvatar = (value: any): string | null => {
    if (!value || typeof value !== "string") return null;
    const trimmed = value.trim();
    if (!trimmed) return null;
    // If already absolute (http/https/data/base64), return as-is
    if (/^(https?:)?\/\//i.test(trimmed) || /^(data|blob):/i.test(trimmed)) return trimmed;
    // Otherwise treat as relative path served by API host
    try {
      // apiClient defaults baseURL; rely on it when constructing absolute path
      const base: string | undefined = (apiClient.defaults as any)?.baseURL;
      if (base) {
        return `${base.replace(/\/$/, "")}/${trimmed.replace(/^\//, "")}`;
      }
    } catch { }
    return trimmed; // fallback
  };

  return list.map((item) => {
    const raw = item as any;
    const avatar = normalizeAvatar(raw?.otherUserAvatar ?? raw?.avatar ?? raw?.profilePictureUrl);
    return {
      otherUserId: raw?.otherUserId ?? raw?.id ?? "",
      otherUserName: raw?.otherUserName ?? raw?.name ?? null,
      otherUserRole: raw?.otherUserRole ?? raw?.role ?? null,
      otherUserAvatar: avatar,
      latestMessage: raw?.latestMessage ?? raw?.preview ?? null,
      latestMessageTimestamp: raw?.latestMessageTimestamp ?? raw?.timestamp ?? null,
      unreadCount: raw?.unreadCount ?? null,
      status: (raw?.status ?? "Active") as ChatConversationStatus,
      closedAt: raw?.closedAt ?? null,
      closedByUserId: raw?.closedByUserId ?? null,
      isBlockedByMe: Boolean(raw?.isBlockedByMe),
      isBlockedByOther: Boolean(raw?.isBlockedByOther),
      latestMessageIsMine: Boolean(raw?.latestMessageIsMine),
    } as ChatConversationDto;
  });
}

export async function fetchChatHistory(
  otherUserId: string | number,
  pageParam?: { cursor?: number | null }
): Promise<ChatHistoryResponse> {
  const empty: ChatHistoryResponse = {
    status: "Active",
    isBlockedByMe: false,
    isBlockedByOther: false,
    messages: [],
    patientContext: null,
    nextCursor: null,
    hasMore: false,
    closedAt: null,
    closedByUserId: null,
  } as any;

  if (otherUserId === null || otherUserId === undefined || otherUserId === "") {
    return empty;
  }

  // Build URL with cursor parameter if provided
  let url = `/api/chat/history/${otherUserId}`;
  const cursor = pageParam?.cursor;
  if (cursor != null) {
    url += `?beforeId=${cursor}`;
  }

  const res = await apiClient.get(url);
  const data = res?.data;
  const normalizeMessage = (item: any): ChatMessageDto => ({
    ...item,
    id: item?.id ?? `${item?.timestamp ?? Date.now()}-${Math.random()}`,
    senderId: item?.senderId ?? "",
    receiverId: item?.receiverId ?? "",
    content: item?.content ?? "",
    timestamp: item?.timestamp ?? new Date().toISOString(),
    messageType: (item?.messageType ?? item?.MessageType ?? "TEXT") as ChatMessageType,
    imagePath: item?.imagePath ?? item?.ImagePath ?? null,
    signedUrl: item?.signedUrl ?? item?.SignedUrl ?? null,
    isRead: item?.isRead ?? false,
    isMine: item?.isMine ?? false,
    patientContext: item?.patientContext ?? item?.PatientContext ?? null,
  });

  if (Array.isArray(data)) {
    const messages = (data as ChatMessageDto[]).map(normalizeMessage);
    return {
      status: "Active",
      isBlockedByMe: false,
      isBlockedByOther: false,
      messages,
      patientContext: null,
      closedAt: null,
      closedByUserId: null,
      nextCursor: null,
      hasMore: false,
    };
  }

  const messages = asArray<ChatMessageDto>(data?.messages).map(normalizeMessage);
  return {
    status: (data?.status ?? "Active") as ChatConversationStatus,
    isBlockedByMe: Boolean(data?.isBlockedByMe),
    isBlockedByOther: Boolean(data?.isBlockedByOther),
    messages,
    patientContext: data?.patientContext ?? null,
    closedAt: data?.closedAt ?? null,
    closedByUserId: data?.closedByUserId ?? null,
    nextCursor: data?.nextCursor ?? null,
    hasMore: data?.hasMore ?? false,
  };
}

export async function markChatHistoryRead(otherUserId: string | number) {
  if (otherUserId === null || otherUserId === undefined || otherUserId === "") {
    return;
  }

  try {
    await apiClient.post(`/api/chat/history/${otherUserId}/read`);
  } catch (err) {
    console.warn("Failed to mark chat history as read", err);
  }
}

export async function blockUser(
  otherUserId: string | number,
  input?: { reason?: string; expiresAt?: string }
) {
  if (!otherUserId) return;
  await apiClient.post(`/api/chat/block/${otherUserId}`, input ?? {});
}

export async function unblockUser(otherUserId: string | number) {
  if (!otherUserId) return;
  await apiClient.delete(`/api/chat/block/${otherUserId}`);
}

export async function getBlockedUsers(): Promise<BlockEntry[]> {
  const res = await apiClient.get("/api/chat/blocks");
  const list = asArray<any>(res?.data);
  return list.map((item) => ({
    blockedUserId: String(item?.blockedUserId ?? ""),
    blockedAt: item?.createdAt ?? item?.blockedAt ?? new Date().toISOString(),
    expiresAt: item?.expiresAt ?? null,
    reason: item?.reason ?? null,
  }));
}

export async function reportUser(payload: ReportPayload) {
  const body = {
    otherUserId: payload.otherUserId,
    conversationId: payload.conversationId,
    messageId: payload.messageId,
    category: payload.category,
    notes: payload.notes,
  };
  await apiClient.post("/api/chat/report", body);
}

export async function endConversation(otherUserId: string | number) {
  if (!otherUserId) return;
  await apiClient.post(`/api/chat/conversations/${otherUserId}/end`);
}

export async function reopenConversation(otherUserId: string | number) {
  if (!otherUserId) return;
  await apiClient.post(`/api/chat/conversations/${otherUserId}/reopen`);
}

/**
 * Permanently deletes a conversation and all its messages.
 * This is a destructive action that cannot be undone.
 */
export async function deleteConversation(otherUserId: string | number): Promise<{ messagesDeleted: number } | null> {
  if (!otherUserId) return null;
  try {
    const res = await apiClient.delete(`/api/chat/conversations/${otherUserId}`);
    return {
      messagesDeleted: res?.data?.messagesDeleted ?? 0,
    };
  } catch (err) {
    console.error("Failed to delete conversation", err);
    throw err;
  }
}

// Optimistically upsert a conversation into the cache so it shows in tabs
export function upsertConversationCache(
  queryClient: QueryClient,
  input: Partial<ChatConversationDto> & { otherUserId: string | number }
) {
  const normalized: ChatConversationDto = {
    otherUserId: input.otherUserId,
    otherUserName: input.otherUserName ?? null,
    otherUserRole: input.otherUserRole ?? null,
    otherUserAvatar: ((): string | null => {
      const v: any = input.otherUserAvatar;
      if (!v || typeof v !== "string") return null;
      return v;
    })(),
    latestMessage: input.latestMessage ?? null,
    latestMessageTimestamp: input.latestMessageTimestamp ?? null,
    unreadCount: input.unreadCount ?? 0,
    status: (input.status as ChatConversationStatus) ?? "Active",
    closedAt: input.closedAt ?? null,
    closedByUserId: input.closedByUserId ?? null,
    isBlockedByMe: input.isBlockedByMe ?? false,
    isBlockedByOther: input.isBlockedByOther ?? false,
    latestMessageIsMine: input.latestMessageIsMine,
  };

  queryClient.setQueryData<ChatConversationDto[] | undefined>(
    CHAT_CONVERSATIONS_QUERY_KEY,
    (prev) => {
      const list = Array.isArray(prev) ? [...prev] : [];
      const idx = list.findIndex(
        (c) => String(c.otherUserId) === String(normalized.otherUserId)
      );
      if (idx >= 0) {
        list[idx] = { ...list[idx], ...normalized };
      } else {
        list.unshift(normalized);
      }
      return list;
    }
  );
}

// Create or get a conversation for the given other user id by calling the backend.
// Returns a normalized ChatConversationDto or null on failure.
export async function createConversation(
  otherUserId: string | number
): Promise<ChatConversationDto | null> {
  if (otherUserId === null || otherUserId === undefined || otherUserId === "") {
    return null;
  }

  try {
    const res = await apiClient.post(`/api/chat/conversations/${otherUserId}`);
    const data = res?.data ?? {};
    const normalized: ChatConversationDto = {
      otherUserId: data?.otherUserId ?? data?.id ?? otherUserId,
      otherUserName: data?.otherUserName ?? data?.name ?? null,
      otherUserRole: data?.otherUserRole ?? data?.role ?? null,
      otherUserAvatar: typeof data?.otherUserAvatar === "string" ? data.otherUserAvatar : (typeof data?.avatar === "string" ? data.avatar : null),
      latestMessage: data?.latestMessage ?? data?.preview ?? null,
      latestMessageTimestamp: data?.latestMessageTimestamp ?? data?.timestamp ?? null,
      unreadCount: data?.unreadCount ?? 0,
    };
    return normalized;
  } catch (err) {
    console.warn("Failed to create conversation", err);
    return null;
  }
}

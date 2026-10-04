import apiClient from "@/api/client";
import { useAuth } from "@/src/providers/AuthProvider";
import {
  CHAT_CONVERSATIONS_QUERY_KEY,
  ChatHistoryResponse,
  ChatMessageDto,
  chatHistoryQueryKey,
  fetchChatHistory,
  markChatHistoryRead,
  upsertConversationCache,
  deleteConversation,
  type PatientContext,
} from "@/src/services/chat";
import {
  patientUpcomingSessionsQueryKey,
  allSessionsQueryKey,
  upcomingSessionsQueryKey,
} from "@/src/services/sessions";
import {
  HttpTransportType,
  HubConnection,
  HubConnectionBuilder,
  HubConnectionState,
  LogLevel,
} from "@microsoft/signalr";
import { getTokens } from "@/src/auth/session";
import { useQueryClient, useInfiniteQuery } from "@tanstack/react-query";

import { useRole } from "@/src/providers/RoleProvider";
import { Avatar } from "@/src/components/Avatar";
import ChatItem from "@/src/components/ChatItem";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  ArrowLeft,
  Check,
  Clipboard,
  X,
  Calendar,
  Clock,
  AlertCircle,
  MoreVertical,
  Trash2,
  Flag,
} from "lucide-react-native";
import { formatPeso } from "@/src/utils/money";
import { useCallback, useEffect, useMemo, useRef, useState, memo } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import MessageComposer from "@/src/components/MessageComposer";
import * as ImagePicker from "expo-image-picker";
import {
  uploadChatImageAsync,
  getChatImageUrl,
} from "@/src/services/chatMedia";
import ImageViewerModal from "@/src/components/ImageViewerModal";
import {
  normalizeContractStatus,
  parseSessionProposalFromContent,
} from "@/src/features/chat/core/sessionProposal";

const resolveImagePickerMediaTypes = () => {
  const mediaTypeEnum = (ImagePicker as any)?.MediaType;
  if (mediaTypeEnum?.Image) {
    return [mediaTypeEnum.Image];
  }
  return ImagePicker.MediaTypeOptions.Images;
};

type MessageBubbleProps = {
  message: ChatMessageDto;
  isMine: boolean;
  onPressImage?: (uri: string) => void;
};

const formatTimestamp = (value: string) => {
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

const sortMessages = (messages: ChatMessageDto[]) =>
  [...messages].sort((a, b) => {
    const timeA = new Date(a.timestamp).getTime();
    const timeB = new Date(b.timestamp).getTime();
    if (Number.isNaN(timeA) || Number.isNaN(timeB)) {
      return String(b.id).localeCompare(String(a.id));
    }
    // Sort descending (newest first) for inverted FlatList
    return timeB - timeA;
  });

const ProposalMessageCard = memo(({ message }: { message: ChatMessageDto }) => {
  const content = message.content || "";
  const [contractStatus, setContractStatus] = useState<string | null>(null);
  const { selectedRole } = useRole();

  const isPatient = String(selectedRole ?? "").toLowerCase() === "patient";

  const details = useMemo(
    () => parseSessionProposalFromContent(content),
    [content],
  );

  const contractId = details?.contractId;

  // Fetch contract status
  useEffect(() => {
    if (!contractId) {
      // No contractId means this is likely an old/malformed proposal - hide it
      setContractStatus("not_found");
      return;
    }

    const fetchStatus = async () => {
      try {
        const { data } = await apiClient.get(`/api/contracts/${contractId}`);
        const status = (data?.status ?? "").toLowerCase();
        setContractStatus(status);
      } catch {
        // If contract not found or any error, mark as invalid to hide the card
        setContractStatus("not_found");
      }
    };

    fetchStatus();
  }, [contractId]);

  if (!details) return null; // Hide malformed proposals

  const isPending =
    !contractStatus ||
    contractStatus === "pendingconfirmation" ||
    contractStatus === "pending";
  const isNotFound = contractStatus === "not_found";

  // Hide the proposal card completely if contract not found or invalid
  if (isNotFound) return null;

  // Determine status display
  const getStatusDisplay = () => {
    if (isPending) {
      return {
        text: isPatient ? "" : "Waiting for patient response...",
        color: "text-gray-500",
        bgColor: "bg-gray-50",
        headerColor: "text-gray-700",
        borderColor: "border-gray-200",
      };
    }
    if (contractStatus === "active" || contractStatus === "confirmed") {
      return {
        text: "✓ Proposal accepted",
        color: "text-green-600",
        bgColor: "bg-green-50",
        headerColor: "text-green-700",
        borderColor: "border-green-200",
      };
    }
    if (
      contractStatus === "declined" ||
      contractStatus === "cancelled" ||
      contractStatus === "canceled"
    ) {
      return {
        text: "✗ Proposal declined",
        color: "text-red-600",
        bgColor: "bg-red-50",
        headerColor: "text-red-700",
        borderColor: "border-red-200",
      };
    }
    if (contractStatus === "completed") {
      return {
        text: "✓ Session completed",
        color: "text-blue-600",
        bgColor: "bg-blue-50",
        headerColor: "text-blue-700",
        borderColor: "border-blue-200",
      };
    }
    if (contractStatus === "expired") {
      return {
        text: "Proposal expired",
        color: "text-gray-500",
        bgColor: "bg-gray-100",
        headerColor: "text-gray-700",
        borderColor: "border-gray-200",
      };
    }
    if (contractStatus === "not_found") {
      return {
        text: "⚠ Proposal no longer available",
        color: "text-orange-600",
        bgColor: "bg-orange-50",
        headerColor: "text-orange-700",
        borderColor: "border-orange-200",
      };
    }
    return {
      text: "",
      color: "text-gray-500",
      bgColor: "bg-gray-50",
      headerColor: "text-gray-700",
      borderColor: "border-gray-200",
    };
  };

  const statusDisplay = getStatusDisplay();

  return (
    <View
      className={`${statusDisplay.bgColor} rounded-xl border ${statusDisplay.borderColor} overflow-hidden w-72`}
    >
      <View
        className={`${statusDisplay.bgColor} px-4 py-3 border-b ${statusDisplay.borderColor} flex-row items-center`}
      >
        <Calendar size={16} color="#4B5563" className="mr-2" />
        <Text className={`font-bold ${statusDisplay.headerColor}`}>
          {contractStatus === "active" || contractStatus === "confirmed"
            ? "Session Proposal Accepted"
            : contractStatus === "declined" ||
                contractStatus === "cancelled" ||
                contractStatus === "canceled"
              ? "Session Proposal Declined"
              : "New Session Proposal"}
        </Text>
      </View>
      <View className="p-4">
        <Text className="font-bold text-gray-900 text-base mb-3">
          {details.caseTitle || "Therapy Session"}
        </Text>

        <View className="flex-row items-center mb-2">
          <Calendar size={14} color="#6B7280" className="mr-2" />
          <Text className="text-gray-600 text-sm">
            {details.day || "Date TBD"}
          </Text>
        </View>

        <View className="flex-row items-center mb-2">
          <Clock size={14} color="#6B7280" className="mr-2" />
          <Text className="text-gray-600 text-sm">
            {details.timeRange || "Time TBD"}
          </Text>
        </View>

        <View className="flex-row items-center mt-1">
          <Text className="font-bold text-gray-900 mr-1">Total:</Text>
          <Text className="font-bold text-gray-900">
            {details.total || "₱0.00"}
          </Text>
        </View>

        {statusDisplay.text ? (
          <Text className={`text-xs ${statusDisplay.color} italic mt-4`}>
            {statusDisplay.text}
          </Text>
        ) : null}
      </View>
    </View>
  );
});

ProposalMessageCard.displayName = "ProposalMessageCard";

const MessageBubble = memo(
  ({ message, isMine, onPressImage }: MessageBubbleProps) => {
    const hasImage = Boolean(message.signedUrl);
    const isProposal = message.content?.includes("[SESSION_PROPOSAL]");

    if (isProposal) {
      return (
        <View
          className={`flex-row ${isMine ? "justify-end" : "justify-start"}`}
        >
          <ProposalMessageCard message={message} />
        </View>
      );
    }

    return (
      <View className={`flex-row ${isMine ? "justify-end" : "justify-start"}`}>
        <View
          className={`max-w-[80%] rounded-2xl ${hasImage ? "" : "px-4 py-2.5"} ${
            hasImage ? "" : isMine ? "bg-teal-600" : "bg-gray-200"
          }`}
        >
          <ChatItem
            message={message}
            isMine={isMine}
            onPressImage={onPressImage}
          />
        </View>
      </View>
    );
  },
);

MessageBubble.displayName = "MessageBubble";

const formatDateLabel = (iso?: string) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString();
};

const DateSeparator = memo(({ iso }: { iso?: string }) => {
  return (
    <View className="items-center my-2">
      <Text className="text-xs text-gray-500 bg-gray-100 px-3 py-1 rounded-full">
        {formatDateLabel(iso)}
      </Text>
    </View>
  );
});

DateSeparator.displayName = "DateSeparator";

const isServerUserId = (id: string | null) => {
  if (!id) return false;
  const s = String(id);
  // Heuristic: GUID-like (has dash) or long id
  return /[a-fA-F0-9]{8}-/.test(s) || s.length >= 16;
};

const useChatMessages = (otherUserId: string | null) => {
  const [messages, setMessages] = useState<ChatMessageDto[]>([]);
  const [status, setStatus] = useState<"Active" | "Closed">("Active");
  const [isBlockedByMe, setIsBlockedByMe] = useState(false);
  const [isBlockedByOther, setIsBlockedByOther] = useState(false);
  const [closedAt, setClosedAt] = useState<string | null>(null);
  const [closedByUserId, setClosedByUserId] = useState<string | null>(null);
  const [initialPatientContext, setInitialPatientContext] =
    useState<PatientContext | null>(null);

  const normalizedOtherUserId =
    otherUserId && isServerUserId(otherUserId) ? otherUserId : null;

  const {
    data,
    isLoading,
    isError,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery<ChatHistoryResponse>({
    queryKey: normalizedOtherUserId
      ? chatHistoryQueryKey(normalizedOtherUserId)
      : ["chat", "history", "noop"],
    queryFn: async ({ pageParam }) => {
      if (!normalizedOtherUserId) {
        // Return a safe empty structure instead of throwing to avoid undefined access downstream
        return {
          status: "Active",
          isBlockedByMe: false,
          isBlockedByOther: false,
          messages: [],
          patientContext: null,
          nextCursor: null,
          hasMore: false,
        } as ChatHistoryResponse;
      }
      try {
        return await fetchChatHistory(normalizedOtherUserId, pageParam as any);
      } catch (e) {
        console.warn("fetchChatHistory failed", e);
        return {
          status: "Active",
          isBlockedByMe: false,
          isBlockedByOther: false,
          messages: [],
          patientContext: null,
          nextCursor: null,
          hasMore: false,
        } as ChatHistoryResponse;
      }
    },
    enabled: Boolean(normalizedOtherUserId),
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    staleTime: 5_000,
    initialPageParam: undefined,
    refetchOnMount: true,
    getNextPageParam: (lastPage) => {
      if (lastPage && lastPage.hasMore && lastPage.nextCursor != null) {
        return { cursor: lastPage.nextCursor };
      }
      return undefined;
    },
    initialData: normalizedOtherUserId
      ? undefined
      : () => ({
          pages: [
            {
              status: "Active",
              isBlockedByMe: false,
              isBlockedByOther: false,
              messages: [],
              patientContext: null,
              nextCursor: null,
              hasMore: false,
            },
          ],
          pageParams: [undefined],
        }),
    // Ensure consumers always see a defined pages array during mount/refocus
    placeholderData: (prev) =>
      prev ?? {
        pages: [],
        pageParams: [],
      },
  });

  useEffect(() => {
    if (!data?.pages?.length) return;

    // Get the first page for metadata
    const firstPage = data.pages[0];
    setStatus(firstPage.status);
    setIsBlockedByMe(firstPage.isBlockedByMe);
    setIsBlockedByOther(firstPage.isBlockedByOther);
    setClosedAt(firstPage.closedAt ?? null);
    setClosedByUserId(
      firstPage.closedByUserId != null
        ? String(firstPage.closedByUserId)
        : null,
    );
    if (firstPage.patientContext) {
      setInitialPatientContext(firstPage.patientContext);
    }

    // Flatten all pages into a single message array
    const allMessages = data.pages.flatMap((page) => page.messages ?? []);
    setMessages(sortMessages(allMessages));
  }, [data]);

  const appendMessage = useCallback((incoming: ChatMessageDto) => {
    setMessages((prev) => {
      const incomingId = String(incoming.id);

      // Update existing message in-place without resorting when timestamp is unchanged.
      const existingIndex = prev.findIndex(
        (item) => String(item.id) === incomingId,
      );
      if (existingIndex !== -1) {
        const updated = { ...prev[existingIndex], ...incoming };
        const next = prev.slice();
        next[existingIndex] = updated;

        const prevTs = Date.parse(String(prev[existingIndex]?.timestamp ?? ""));
        const nextTs = Date.parse(String(updated?.timestamp ?? ""));
        if (
          !Number.isNaN(prevTs) &&
          !Number.isNaN(nextTs) &&
          prevTs === nextTs
        ) {
          return next;
        }
        return sortMessages(next);
      }

      // New message: fast-path if it's the newest (common realtime case).
      const incomingTs = Date.parse(String(incoming.timestamp ?? ""));
      const currentNewestTs = Date.parse(String(prev[0]?.timestamp ?? ""));
      if (
        !Number.isNaN(incomingTs) &&
        !Number.isNaN(currentNewestTs) &&
        incomingTs >= currentNewestTs
      ) {
        return [incoming, ...prev];
      }

      // Fallback: keep ordering correct for older/paginated inserts.
      return sortMessages([...prev, incoming]);
    });
    // Don't invalidate conversations on every message - causes rate limiting
    // The conversations list will be updated when the user navigates back to it
  }, []);

  return {
    messages,
    appendMessage,
    isLoading,
    isError,
    error,
    status,
    isBlockedByMe,
    isBlockedByOther,
    initialPatientContext,
    setIsBlockedByMe,
    setIsBlockedByOther,
    setStatus,
    closedAt,
    closedByUserId,
    setClosedAt,
    setClosedByUserId,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  };
};

export interface ConversationViewProps {
  conversationId?: string;
  name?: string;
  role?: string;
  avatar?: string;
  compose?: string;
  showBackButton?: boolean;
}

export default function ConversationView(props: ConversationViewProps) {
  const router = useRouter();
  const { user, accessToken } = useAuth();
  const { selectedRole } = useRole();
  const params = useLocalSearchParams<{
    conversationId?: string;
    name?: string;
    role?: string;
    avatar?: string;
    compose?: string; // encoded proposal JSON
  }>();

  const conversationId = props.conversationId ?? params.conversationId;
  const name = props.name ?? params.name;
  const role = props.role ?? params.role;
  const avatar = props.avatar ?? params.avatar;
  const compose = props.compose ?? params.compose;
  const showBackButton = props.showBackButton ?? true;

  const otherUserId = useMemo(() => {
    if (!conversationId) return null;
    return String(conversationId);
  }, [conversationId]);

  const currentUserId = useMemo(() => {
    if (!user) return null;
    if (user.id !== undefined && user.id !== null) return String(user.id);
    if (user.userId !== undefined && user.userId !== null)
      return String(user.userId);
    if (user.accountId !== undefined && user.accountId !== null) {
      return String(user.accountId);
    }
    return null;
  }, [user]);

  // Determine if current viewer is a patient using our selectedRole, not the other user's role
  const isPatientSide = useMemo(() => {
    const r = (selectedRole ?? "").toString().toLowerCase();
    return r === "patient" || r === "client";
  }, [selectedRole]);

  const isCurrentUserPatient = isPatientSide;
  const isCurrentUserTherapist = !isPatientSide;

  const myDisplayName = useMemo(() => {
    if (!user) return "You";
    const first = String(
      user.firstName ?? user.given_name ?? "",
    ).trim();
    const last = String(
      user.lastName ?? user.family_name ?? "",
    ).trim();
    const full = `${first} ${last}`.trim();
    return (
      full ||
      String(
        user.fullName ??
          user.name ??
          user.email ??
          "You",
      )
    );
  }, [user]);

  const otherDisplayName = name ?? (isPatientSide ? "Therapist" : "Patient");
  const headerTitle = otherDisplayName;

  const [isSending, setIsSending] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [pendingImageUri, setPendingImageUri] = useState<string | null>(null);
  const [proposalActionPending, setProposalActionPending] = useState<
    "accept" | "decline" | null
  >(null);
  const [isProposalResolved, setIsProposalResolved] = useState(false);
  const [dismissedProposalIds, setDismissedProposalIds] = useState<Set<number>>(
    new Set(),
  );
  const [showProposalModal, setShowProposalModal] = useState(false);
  const [activePatientContext, setActivePatientContext] = useState<any | null>(
    null,
  );
  const [proposalDetails, setProposalDetails] = useState<any | null>(null);
  const [proposalContractStatus, setProposalContractStatus] = useState<
    string | null
  >(null);
  const listRef = useRef<FlatList<ChatMessageDto>>(null);
  const queryClient = useQueryClient();
  const connectionRef = useRef<HubConnection | null>(null);
  const connectionStartPromiseRef = useRef<Promise<void> | null>(null);
  const pendingSystemMessageRef = useRef<string | null>(null);
  const proposalContractIdRef = useRef<number | null | undefined>(undefined);
  const contractStatusCacheRef = useRef<
    Map<number, { status: string; timestamp: number }>
  >(new Map());
  const lastProposalCheckRef = useRef<number>(0);
  const [connectionReady, setConnectionReady] = useState(false);
  const [showOptionsMenu, setShowOptionsMenu] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [isSubmittingReport, setIsSubmittingReport] = useState(false);
  const [viewerImageUri, setViewerImageUri] = useState<string | null>(null);

  const {
    messages,
    appendMessage,
    isLoading,
    isError,
    error,
    status: conversationStatus,
    isBlockedByMe,
    isBlockedByOther,
    initialPatientContext,
    setIsBlockedByMe,
    setIsBlockedByOther,
    setStatus: setConversationStatus,
    closedByUserId,
    setClosedAt,
    setClosedByUserId,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useChatMessages(otherUserId);

  // Parse proposal from messages (get the most recent one) and validate its status
  useEffect(() => {
    if (!messages.length) {
      return;
    }

    // Debounce: don't check more than once every 5 seconds
    const now = Date.now();
    const timeSinceLastCheck = now - lastProposalCheckRef.current;
    if (timeSinceLastCheck < 5000 && lastProposalCheckRef.current > 0) {
      return;
    }
    lastProposalCheckRef.current = now;

    // Track if we found a valid proposal
    let foundValidProposal = false;

    const checkProposalStatus = async () => {
      // Messages are sorted newest first due to inverted FlatList
      for (const msg of messages) {
        const content = String((msg as any).content ?? "");
        if (content.includes("[SESSION_PROPOSAL]")) {
          try {
            const parsed = parseSessionProposalFromContent(content);
            const contractIdRaw = parsed?.contractId ?? null;
            const contractId =
              typeof contractIdRaw === "string"
                ? Number.parseInt(contractIdRaw, 10)
                : typeof contractIdRaw === "number"
                  ? contractIdRaw
                  : null;

            if (
              typeof contractId === "number" &&
              Number.isFinite(contractId) &&
              contractId > 0
            ) {
              // Skip if this proposal was manually dismissed by the user
              if (dismissedProposalIds.has(contractId)) {
                continue;
              }

              // Check cache first (valid for 30 seconds)
              const cached = contractStatusCacheRef.current.get(contractId);
              const cacheAge = cached
                ? Date.now() - cached.timestamp
                : Infinity;

              let status: string;
              if (cached && cacheAge < 30000) {
                status = cached.status;
              } else {
                // Check if this contract is still awaiting confirmation
                try {
                  const { data } = await apiClient.get(
                    `/api/contracts/${contractId}`,
                  );
                  status = (data?.status ?? "").toLowerCase();
                  // Cache the result
                  contractStatusCacheRef.current.set(contractId, {
                    status,
                    timestamp: Date.now(),
                  });
                } catch (err: any) {
                  const statusCode = err?.response?.status;
                  if (statusCode === 404) {
                    // Contract no longer exists - cache as 'deleted'
                    contractStatusCacheRef.current.set(contractId, {
                      status: "deleted",
                      timestamp: Date.now(),
                    });
                    continue;
                  } else if (statusCode === 429) {
                    // Rate limited - use stale cache if available, otherwise skip
                    if (cached) {
                      status = cached.status;
                    } else {
                      continue;
                    }
                  } else {
                    continue;
                  }
                }
              }

              const normalizedStatus = normalizeContractStatus(status);

              // Only show banner for pending proposals (patient needs to act)
              // Hide confirmed/declined proposals as they've already been acted upon
              if (normalizedStatus === "pending") {
                setProposalDetails(parsed);
                proposalContractIdRef.current = contractId;
                setProposalContractStatus(normalizedStatus);
                setIsProposalResolved(false);
                foundValidProposal = true;
                break; // Found valid proposal, stop searching
              } else {
                // Confirmed or declined - don't show banner, mark as resolved
                continue;
              }
            } else {
              // No contract ID in parsed data - skip this invalid proposal
              continue;
            }
          } catch {
            // Continue to next message
          }
        }
      }

      // If no valid proposal found after checking all messages, clear the banner
      if (!foundValidProposal) {
        setProposalDetails(null);
        proposalContractIdRef.current = null;
        setProposalContractStatus(null);
        setIsProposalResolved(true);
      }
    };

    checkProposalStatus();
  }, [messages, dismissedProposalIds]);

  // Parse compose param if present
  useEffect(() => {
    if (!compose) return;
    try {
      const decoded = decodeURIComponent(compose);
      const parsed = JSON.parse(decoded);
      setProposalDetails(parsed);
      const cidRaw = parsed?.contractId ?? null;
      const numericCid =
        typeof cidRaw === "string"
          ? Number.parseInt(cidRaw, 10)
          : typeof cidRaw === "number"
            ? cidRaw
            : null;
      proposalContractIdRef.current =
        typeof numericCid === "number" && Number.isFinite(numericCid)
          ? numericCid
          : null;
    } catch {
      // ignore
    }
  }, [compose]);

  useEffect(() => {
    if (initialPatientContext) {
      setActivePatientContext(initialPatientContext);
    }
  }, [initialPatientContext]);

  // Proposal handlers
  const isProcessingAccept = proposalActionPending === "accept";
  const isProcessingDecline = proposalActionPending === "decline";
  const isProposalBusy = proposalActionPending !== null;

  const handleProposalAccept = useCallback(async () => {
    // Try ref first, then proposalDetails as fallback
    const cid = proposalContractIdRef.current ?? proposalDetails?.contractId;
    if (!cid) {
      Alert.alert("Error", "No contract ID found for this proposal.");
      return;
    }
    setProposalActionPending("accept");
    try {
      // Ensure contractId is a number
      const numericCid = typeof cid === "string" ? parseInt(cid, 10) : cid;
      if (isNaN(numericCid)) {
        Alert.alert("Error", "Invalid contract ID format.");
        setProposalActionPending(null);
        return;
      }
      await apiClient.post(`/api/contracts/${numericCid}/confirm`);
      setProposalContractStatus("confirmed");
      setIsProposalResolved(true); // Hide the banner
      setProposalActionPending(null);

      // Invalidate queries to refresh sessions on homepage
      queryClient.invalidateQueries({ queryKey: CHAT_CONVERSATIONS_QUERY_KEY });
      // Also invalidate sessions queries - using correct query keys
      queryClient.invalidateQueries({ queryKey: ["sessions"] });
      queryClient.invalidateQueries({ queryKey: upcomingSessionsQueryKey });
      queryClient.invalidateQueries({
        queryKey: patientUpcomingSessionsQueryKey,
      });
      queryClient.invalidateQueries({ queryKey: allSessionsQueryKey });

      // Show custom confirmation dialog
      Alert.alert(
        "Session Accepted!",
        "Your session has been confirmed. Go to the home page to see your upcoming session.",
        [
          {
            text: "Later",
            style: "cancel",
          },
          {
            text: "Go",
            onPress: () => {
              // Navigate to patient home page
              router.push("/(patient)/(tabs)/" as any);
            },
          },
        ],
      );
    } catch (err: any) {
      setProposalActionPending(null);

      const statusCode = err?.response?.status;
      const apiMessage = err?.response?.data?.message ?? "";

      if (statusCode === 404) {
        // Contract no longer exists - hide the banner
        setIsProposalResolved(true);
        Alert.alert(
          "Proposal Expired",
          "This session proposal is no longer available. The therapist may need to send a new proposal.",
        );
      } else if (
        apiMessage.toLowerCase().includes("not awaiting confirmation")
      ) {
        setProposalContractStatus("confirmed");
        setIsProposalResolved(true); // Hide the banner even if already processed
        Alert.alert(
          "Already Processed",
          "This session proposal has already been accepted or declined.",
        );
      } else {
        const message =
          apiMessage || err?.message || "Failed to accept session.";
        Alert.alert("Error", message);
      }
    }
  }, [queryClient, router, proposalDetails]);

  const handleProposalDecline = useCallback(async () => {
    // Try ref first, then proposalDetails as fallback
    const cid = proposalContractIdRef.current ?? proposalDetails?.contractId;
    if (!cid) {
      Alert.alert("Error", "No contract ID found for this proposal.");
      return;
    }
    setProposalActionPending("decline");
    try {
      // Ensure contractId is a number
      const numericCid = typeof cid === "string" ? parseInt(cid, 10) : cid;
      if (isNaN(numericCid)) {
        Alert.alert("Error", "Invalid contract ID format.");
        setProposalActionPending(null);
        return;
      }
      await apiClient.post(`/api/contracts/${numericCid}/decline`);
      setProposalContractStatus("declined");
      setIsProposalResolved(true);
      setProposalActionPending(null);
      Alert.alert("Declined", "Session proposal declined.");
      queryClient.invalidateQueries({ queryKey: CHAT_CONVERSATIONS_QUERY_KEY });
      // Also invalidate sessions queries for consistency
      queryClient.invalidateQueries({ queryKey: ["sessions"] });
      queryClient.invalidateQueries({ queryKey: upcomingSessionsQueryKey });
      queryClient.invalidateQueries({
        queryKey: patientUpcomingSessionsQueryKey,
      });
      queryClient.invalidateQueries({ queryKey: allSessionsQueryKey });
    } catch (err: any) {
      setProposalActionPending(null);

      const statusCode = err?.response?.status;
      const apiMessage = err?.response?.data?.message ?? "";

      if (statusCode === 404) {
        // Contract no longer exists - hide the banner
        setIsProposalResolved(true);
        Alert.alert(
          "Proposal Expired",
          "This session proposal is no longer available. The therapist may need to send a new proposal.",
        );
      } else if (
        apiMessage.toLowerCase().includes("not awaiting confirmation")
      ) {
        setProposalContractStatus("declined");
        setIsProposalResolved(true);
        Alert.alert(
          "Already Processed",
          "This session proposal has already been accepted or declined.",
        );
      } else {
        const message =
          apiMessage || err?.message || "Failed to decline session.";
        Alert.alert("Error", message);
      }
    }
  }, [queryClient, proposalDetails]);

  const openUserProfile = useCallback(() => {
    if (!otherUserId) return;
    router.push({
      pathname: "/messages/user-profile",
      params: {
        userId: otherUserId,
        name: otherDisplayName,
        role: role ?? undefined,
      },
    });
  }, [otherUserId, otherDisplayName, role, router]);

  const updateConversationCache = useCallback(
    (updates: Record<string, unknown>) => {
      if (!otherUserId) return;
      upsertConversationCache(queryClient, {
        otherUserId,
        otherUserName: otherDisplayName,
        otherUserRole: role ?? null,
        ...updates,
      });
    },
    [otherUserId, queryClient, otherDisplayName, role],
  );

  const isConversationClosed = conversationStatus === "Closed";
  const isClosedByMe =
    isConversationClosed &&
    currentUserId != null &&
    closedByUserId != null &&
    String(closedByUserId).toLowerCase() ===
      String(currentUserId).toLowerCase();
  const composerPlaceholder = isBlockedByMe
    ? "Unblock to send messages"
    : isBlockedByOther
      ? "You can't send messages to this user"
      : isConversationClosed
        ? "This chat is closed"
        : "Message";

  const restrictionBanner = useMemo(() => {
    if (isBlockedByMe) {
      return {
        text: `You blocked ${otherDisplayName}. Unblock to send messages.`,
        actionLabel: "Unblock",
        onPress: async () => {
          try {
            await apiClient.post("/api/chat/unblock", {
              blockedUserId: otherUserId,
            });
            setIsBlockedByMe(false);
            updateConversationCache({ isBlockedByMe: false });
          } catch (err: any) {
            Alert.alert("Error", err?.message ?? "Failed to unblock user.");
          }
        },
      };
    }
    if (isBlockedByOther) {
      return {
        text: `${otherDisplayName} blocked you. You can't send messages.`,
        actionLabel: undefined,
        onPress: undefined,
      };
    }
    if (isConversationClosed) {
      return {
        text: "This chat is closed.",
        actionLabel: isClosedByMe ? "Reopen" : undefined,
        onPress: isClosedByMe
          ? async () => {
              try {
                await apiClient.post("/api/chat/reopen", { otherUserId });
                setConversationStatus("Active");
                setClosedAt(null);
                setClosedByUserId(null);
                updateConversationCache({
                  status: "Active",
                  closedAt: null,
                  closedByUserId: null,
                });
              } catch (err: any) {
                Alert.alert("Error", err?.message ?? "Failed to reopen chat.");
              }
            }
          : undefined,
      };
    }
    return null;
  }, [
    isBlockedByMe,
    isBlockedByOther,
    isConversationClosed,
    isClosedByMe,
    otherDisplayName,
    otherUserId,
    setIsBlockedByMe,
    updateConversationCache,
    setConversationStatus,
    setClosedAt,
    setClosedByUserId,
  ]);

  // Ensure conversation is visible in tabs right away
  useEffect(() => {
    if (!otherUserId) return;
    upsertConversationCache(queryClient, {
      otherUserId,
      otherUserName: name ?? null,
      otherUserRole: role ?? null,
    });
  }, [otherUserId, name, role, queryClient]);

  // Derive avatar source for other user; scan messages for avatar references
  const otherAvatarSource = useMemo(() => {
    if (avatar) {
      return avatar;
    }
    for (const m of messages) {
      const candidate =
        (m as any).senderAvatar ||
        (m as any).receiverAvatar ||
        (m as any).avatar ||
        (m as any).profilePictureUrl ||
        (m as any).profilePicture;
      if (candidate) {
        return candidate as any;
      }
    }
    return null;
  }, [messages, avatar]);

  useEffect(() => {
    if (!otherUserId || !messages.length) return;
    markChatHistoryRead(otherUserId).finally(() => {
      queryClient.invalidateQueries({
        queryKey: CHAT_CONVERSATIONS_QUERY_KEY,
        exact: false,
      });
    });
  }, [messages, otherUserId, queryClient]);

  // Surface patient context from initial history if present
  useEffect(() => {
    if (activePatientContext || !messages.length) return;
    const withContext = messages.find(
      (m: any) => m?.patientContext || (m as any)?.PatientContext,
    ) as any;
    if (withContext) {
      setActivePatientContext(
        withContext.patientContext ?? withContext.PatientContext,
      );
    }
  }, [messages, activePatientContext]);

  // Fallback for patient side: if no context arrived from history (because the
  // other user is a therapist), fetch the current user's active patient profile
  // and use it as the active context. This ensures address/lat/lng are available
  // for session details when viewed by the patient.
  useEffect(() => {
    const run = async () => {
      try {
        if (!isPatientSide) return;
        if (activePatientContext) return;
        const { default: apiClient } = await import("@/api/client");
        const res = await apiClient.get("/api/patient/profiles");
        const list = Array.isArray(res?.data) ? res.data : [];
        if (!list.length) return;
        const active = list.find((p: any) => p?.isActive) ?? list[0];
        if (active) setActivePatientContext(active);
      } catch (e) {
        // Non-fatal; context is optional for chat
        console.warn("Failed to load patient profile context for chat", e);
      }
    };
    run();
  }, [isPatientSide, activePatientContext]);

  useEffect(() => {
    if (!otherUserId || !accessToken) return;
    if (!isServerUserId(otherUserId)) return; // Defer realtime until backend id is available

    const baseURL = (apiClient.defaults.baseURL ?? "").replace(/\/+$/, "");
    if (!baseURL) return;

    // Track if effect has been cleaned up to prevent start after unmount
    let isCleanedUp = false;

    // Hub is mounted at root (/hubs/chat), not under /api
    const hubBase = baseURL.replace(/\/?api$/i, "");

    const connection: HubConnection = new HubConnectionBuilder()
      .withUrl(`${hubBase}/hubs/chat`, {
        accessTokenFactory: () => {
          // Use latest token for reconnections
          const { accessToken: currentToken } = getTokens();
          return currentToken || accessToken || "";
        },
        transport: HttpTransportType.WebSockets,
        skipNegotiation: true,
      })
      .withAutomaticReconnect()
      .configureLogging(LogLevel.Warning)
      .build();

    const normalizedOtherUserId = String(otherUserId);

    const handleReceive = (payload: any) => {
      if (!payload) return;
      const senderId = String(payload.senderId ?? "").toLowerCase();
      const receiverId = String(payload.receiverId ?? "").toLowerCase();
      const normalizedOther = normalizedOtherUserId.toLowerCase();
      const normalizedCurrent = currentUserId?.toLowerCase() ?? "";

      if (senderId !== normalizedOther && receiverId !== normalizedOther) {
        return;
      }

      // Always compute isMine locally to avoid perspective mismatch when both participants are online
      const computedIsMine = normalizedCurrent
        ? senderId === normalizedCurrent
        : false;

      const message: ChatMessageDto = {
        ...payload,
        isMine: computedIsMine,
      };

      // Fix for missing signedUrl on realtime updates:
      // If we have an image path but no url, generate the public URL
      if (
        message.messageType === "IMAGE" &&
        !message.signedUrl &&
        message.imagePath
      ) {
        message.signedUrl = getChatImageUrl(message.imagePath);
      }

      if (payload.PatientContext || payload.patientContext) {
        setActivePatientContext(
          payload.PatientContext ?? payload.patientContext,
        );
      }

      appendMessage(message);

      if (senderId === normalizedOther) {
        markChatHistoryRead(normalizedOtherUserId);
      }

      // If there's an active proposal, refetch its status when new messages arrive
      // This ensures therapists see status updates when patients accept/decline
      if (proposalContractIdRef.current) {
        const contractId = proposalContractIdRef.current;
        apiClient
          .get(`/api/contracts/${contractId}`)
          .then(({ data }) => {
            const status = (data?.status ?? "").toLowerCase();
            // Normalize status
            let normalizedStatus = status;
            if (status === "pendingconfirmation" || status === "pending") {
              normalizedStatus = "pending";
            } else if (status === "active" || status === "confirmed") {
              normalizedStatus = "confirmed";
            } else if (status === "declined") {
              normalizedStatus = "declined";
            }
            setProposalContractStatus(normalizedStatus);
          })
          .catch(() => {
            // Silent fail for refetch
          });
      }
    };

    connection.on("ReceiveMessage", handleReceive);
    const handlePatientContextUpdated = (ctx: any) => {
      setActivePatientContext(ctx ?? null);
    };
    connection.on("PatientContextUpdated", handlePatientContextUpdated);

    const handleMessageRejected = (payload: any) => {
      if (!payload) return;
      const receiverId = String(payload.receiverId ?? "");
      if (receiverId !== normalizedOtherUserId) return;

      const reason = String(payload.reason ?? "");
      let message = "We couldn't send that message.";

      if (reason === "blocked_by_you") {
        setIsBlockedByMe(true);
        updateConversationCache({ isBlockedByMe: true });
        message =
          "You blocked this user. Unblock them from the menu to send new messages.";
      } else if (reason === "blocked_by_other") {
        setIsBlockedByOther(true);
        updateConversationCache({ isBlockedByOther: true });
        message = `${otherDisplayName ?? "This user"} blocked you.`;
      } else if (reason === "conversation_closed") {
        setConversationStatus("Closed");
        const closedAtIso = new Date().toISOString();
        setClosedAt((prev) => prev ?? closedAtIso);
        updateConversationCache({ status: "Closed", closedAt: closedAtIso });
        message =
          "This chat is closed. Reopen it to continue the conversation.";
      } else if (reason === "rate_limited" && payload.retryAfter != null) {
        const retry = Math.ceil(Number(payload.retryAfter));
        message = `You're sending messages too quickly. Try again in about ${retry} seconds.`;
      }

      Alert.alert("Message not sent", message);
    };
    connection.on("MessageRejected", handleMessageRejected);

    const handleBlockedByOtherEvent = (payload: any) => {
      const blockerId = String(payload?.blockedByUserId ?? "");
      if (blockerId !== normalizedOtherUserId) return;
      setIsBlockedByOther(true);
      updateConversationCache({ isBlockedByOther: true });
      Alert.alert(
        "You've been blocked",
        `${
          otherDisplayName ?? "This user"
        } blocked you. You can still read previous messages but can't send new ones.`,
      );
    };
    connection.on("BlockedByOther", handleBlockedByOtherEvent);

    const handleUnblockedByOtherEvent = (payload: any) => {
      const unblockerId = String(payload?.unblockedByUserId ?? "");
      if (unblockerId !== normalizedOtherUserId) return;
      setIsBlockedByOther(false);
      updateConversationCache({ isBlockedByOther: false });
      Alert.alert(
        "You're unblocked",
        `${
          otherDisplayName ?? "This user"
        } unblocked you. You can send messages again.`,
      );
    };
    connection.on("UnblockedByOther", handleUnblockedByOtherEvent);

    const handleBlockStatusChanged = (payload: any) => {
      const targetId = String(payload?.blockedUserId ?? "");
      if (targetId !== normalizedOtherUserId) return;
      const next = Boolean(payload?.isBlocked);
      setIsBlockedByMe(next);
      updateConversationCache({ isBlockedByMe: next });
    };
    connection.on("BlockStatusChanged", handleBlockStatusChanged);

    const handleConversationClosedEvent = (payload: any) => {
      const initiator = String(payload?.initiatorUserId ?? "").toLowerCase();
      const otherParticipant = String(payload?.otherUserId ?? "").toLowerCase();
      const participants = [initiator, otherParticipant];
      if (!participants.includes(normalizedOtherUserId.toLowerCase())) return;

      const closedBy = payload?.closedByUserId
        ? String(payload.closedByUserId)
        : String(payload?.initiatorUserId ?? "") ||
          String(payload?.otherUserId ?? "") ||
          null;
      const closedAtIso = payload?.closedAt ?? new Date().toISOString();

      setConversationStatus("Closed");
      setClosedByUserId(closedBy);
      setClosedAt(closedAtIso);
      updateConversationCache({
        status: "Closed",
        closedAt: closedAtIso,
        closedByUserId: closedBy,
      });

      if (
        !currentUserId ||
        (closedBy && closedBy.toLowerCase() === currentUserId.toLowerCase())
      ) {
        return;
      }

      if (initiator.toLowerCase() === normalizedOtherUserId.toLowerCase()) {
        Alert.alert(
          "Chat closed",
          `${
            otherDisplayName ?? "This user"
          } closed the chat. Either of you can reopen it later.`,
        );
      }
    };
    connection.on("ConversationClosed", handleConversationClosedEvent);

    const handleConversationReopenedEvent = (payload: any) => {
      const initiator = String(payload?.initiatorUserId ?? "").toLowerCase();
      const otherParticipant = String(payload?.otherUserId ?? "").toLowerCase();
      const participants = [initiator, otherParticipant];
      if (!participants.includes(normalizedOtherUserId.toLowerCase())) return;

      setConversationStatus("Active");
      setClosedAt(null);
      setClosedByUserId(null);
      updateConversationCache({
        status: "Active",
        closedAt: null,
        closedByUserId: null,
      });

      if (
        currentUserId &&
        initiator.toLowerCase() === normalizedOtherUserId.toLowerCase()
      ) {
        Alert.alert(
          "Chat reopened",
          `${otherDisplayName ?? "This user"} reopened the chat.`,
        );
      }
    };
    connection.on("ConversationReopened", handleConversationReopenedEvent);

    const handleReconnecting = () => setConnectionReady(false);
    const handleReconnected = () => setConnectionReady(true);
    const handleClosed = () => {
      setConnectionReady(false);
      connectionStartPromiseRef.current = null;
    };

    connection.onreconnecting(handleReconnecting);
    connection.onreconnected(handleReconnected);
    connection.onclose(handleClosed);

    const startPromise = (async () => {
      try {
        // Check if already cleaned up before starting
        if (isCleanedUp) return;
        await connection.start();
        // Check again after await in case cleanup happened during start
        if (isCleanedUp) {
          connection.stop().catch(() => {});
          return;
        }
        setConnectionReady(true);
      } catch (err) {
        // Ignore errors if we've been cleaned up (expected when stop() called during start())
        if (isCleanedUp) return;
        console.warn("Failed to start chat connection", err);
        if (isServerUserId(normalizedOtherUserId)) {
          try {
            await connection.invoke(
              "SharePatientContext",
              normalizedOtherUserId,
            );
          } catch {}
        }
        setConnectionReady(false);
        throw err;
      }
    })();

    connectionStartPromiseRef.current = startPromise.finally(() => {
      if (connectionStartPromiseRef.current === startPromise) {
        connectionStartPromiseRef.current = null;
      }
    });

    startPromise.catch(() => {});

    connectionRef.current = connection;

    return () => {
      // Mark as cleaned up to prevent start() from completing
      isCleanedUp = true;

      connection.off("ReceiveMessage", handleReceive);
      connection.off("PatientContextUpdated", handlePatientContextUpdated);
      connection.off("MessageRejected", handleMessageRejected);
      connection.off("BlockedByOther", handleBlockedByOtherEvent);
      connection.off("UnblockedByOther", handleUnblockedByOtherEvent);
      connection.off("BlockStatusChanged", handleBlockStatusChanged);
      connection.off("ConversationClosed", handleConversationClosedEvent);
      connection.off("ConversationReopened", handleConversationReopenedEvent);
      setConnectionReady(false);
      connectionStartPromiseRef.current = null;

      // Only stop if connection is not in a disconnected state
      if (connection.state !== HubConnectionState.Disconnected) {
        connection.stop().catch(() => {
          // Silently ignore stop errors - these are expected when stop() is called
          // while start() is still in progress
        });
      }

      if (connectionRef.current === connection) {
        connectionRef.current = null;
      }
      pendingSystemMessageRef.current = null;
    };
  }, [
    accessToken,
    appendMessage,
    currentUserId,
    otherUserId,
    queryClient,
    setIsBlockedByOther,
    setIsBlockedByMe,
    setConversationStatus,
    setClosedAt,
    setClosedByUserId,
    updateConversationCache,
    otherDisplayName,
  ]);

  const sleep = useCallback(
    (ms: number) =>
      new Promise<void>((resolve) => {
        setTimeout(resolve, ms);
      }),
    [],
  );

  const waitForChatConnection = useCallback(
    async (timeoutMs = 5000): Promise<HubConnection | null> => {
      const deadline = Date.now() + timeoutMs;

      while (Date.now() <= deadline) {
        const current = connectionRef.current;

        if (!current) {
          await sleep(150);
          continue;
        }

        if (current.state === HubConnectionState.Connected && connectionReady) {
          return current;
        }

        if (
          current.state === HubConnectionState.Disconnected &&
          !connectionStartPromiseRef.current
        ) {
          const restartPromise = (async () => {
            try {
              await current.start();
              setConnectionReady(true);
            } catch (error) {
              console.warn("Failed to restart chat connection", error);
              setConnectionReady(false);
              throw error;
            }
          })();

          connectionStartPromiseRef.current = restartPromise.finally(() => {
            if (connectionStartPromiseRef.current === restartPromise) {
              connectionStartPromiseRef.current = null;
            }
          });

          try {
            await restartPromise;
            const resumed = connectionRef.current;
            if (resumed && resumed.state === HubConnectionState.Connected) {
              return resumed;
            }
            continue;
          } catch {
            return null;
          }
        }

        if (connectionStartPromiseRef.current) {
          try {
            await connectionStartPromiseRef.current;
            continue;
          } catch {
            return null;
          }
        }

        await sleep(150);
      }

      return null;
    },
    [connectionReady, sleep],
  );

  // Contract status real-time updates
  useEffect(() => {
    if (!accessToken || !proposalContractIdRef.current) return;

    let active = true;
    const unsubscribeFns: (() => void)[] = [];

    const setupContractsConnection = async () => {
      try {
        const { default: signalrManager } =
          await import("@/src/services/signalrManager");
        await signalrManager.getSharedConnection("contracts", accessToken);

        if (!active) {
          signalrManager.releaseConnection("contracts");
          return;
        }

        // Listen for contract status changes
        unsubscribeFns.push(
          signalrManager.subscribeToEvent(
            "contracts",
            "ContractActivated",
            (payload: any) => {
              if (!active || !payload) return;
              const contractId = Number(payload.contractId);
              if (contractId === proposalContractIdRef.current) {
                setProposalContractStatus("confirmed");
              }
            },
          ),
          signalrManager.subscribeToEvent(
            "contracts",
            "ContractDeclined",
            (payload: any) => {
              if (!active || !payload) return;
              const contractId = Number(payload.contractId);
              if (contractId === proposalContractIdRef.current) {
                setProposalContractStatus("declined");
              }
            },
          ),
          signalrManager.subscribeToEvent(
            "contracts",
            "ContractPending",
            (payload: any) => {
              if (!active || !payload) return;
              const contractId = Number(payload.contractId);
              if (contractId === proposalContractIdRef.current) {
                setProposalContractStatus("pending");
              }
            },
          ),
        );
      } catch {
        // Silent fail for contracts hub connection (expected on unmount)
      }
    };

    setupContractsConnection();

    return () => {
      active = false;
      unsubscribeFns.forEach((unsub) => unsub());
      import("@/src/services/signalrManager")
        .then(({ default: signalrManager }) => {
          signalrManager.releaseConnection("contracts");
        })
        .catch(() => {});
    };
  }, [accessToken]);

  // Send message handler
  const handleSendMessage = useCallback(
    async (text: string, imageUri?: string) => {
      if (!otherUserId) {
        Alert.alert(
          "Connection Error",
          "We couldn't determine who to send this to. Please reopen the conversation.",
        );
        throw new Error("Chat receiver unavailable");
      }

      const connection = await waitForChatConnection();
      if (!connection) {
        Alert.alert(
          "Connection Error",
          "Chat connection is not ready. Please wait a moment and try again.",
        );
        throw new Error("Chat connection unavailable");
      }

      // Handle image message
      if (imageUri) {
        setIsUploadingImage(true);
        try {
          const uploadedPath = await uploadChatImageAsync(imageUri);
          if (!uploadedPath) {
            Alert.alert(
              "Upload Failed",
              "Failed to upload image. Please try again.",
            );
            return;
          }

          await connection.invoke("SendMessage", {
            receiverId: otherUserId,
            content: text || "",
            imagePath: uploadedPath,
            messageType: "IMAGE",
          });
          setPendingImageUri(null);
        } catch (err: any) {
          console.warn("Failed to send image", err);
          Alert.alert(
            "Error",
            err?.message ?? "Failed to send image. Please try again.",
          );
          throw err;
        } finally {
          setIsUploadingImage(false);
        }
        return;
      }

      // Handle text-only message
      if (!text) return;

      setIsSending(true);
      try {
        await connection.invoke("SendMessage", {
          receiverId: otherUserId,
          content: text,
          messageType: "TEXT",
        });
      } catch (err: any) {
        console.warn("Failed to send message", err);
        Alert.alert(
          "Error",
          err?.message ?? "Failed to send message. Please try again.",
        );
        throw err;
      } finally {
        setIsSending(false);
      }
    },
    [otherUserId, waitForChatConnection],
  );

  const handlePickImage = useCallback(async () => {
    if (!otherUserId) return;

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: resolveImagePickerMediaTypes(),
        quality: 0.8,
        allowsEditing: false,
      });

      if (result.canceled || !result.assets?.[0]) return;

      const asset = result.assets[0];
      setPendingImageUri(asset.uri);
    } catch (err: any) {
      console.warn("Failed to pick image", err);
      Alert.alert(
        "Error",
        err?.message ?? "Failed to pick image. Please try again.",
      );
    }
  }, [otherUserId]);

  const visibleMessages = useMemo(() => {
    return messages.filter((msg) => {
      // Filter out proposal messages that contain "trial for dec 10" or similar not-found proposals
      // This is a temporary fix - ideally we'd track contract status globally
      const content = String(msg.content ?? "");
      if (content.includes("[SESSION_PROPOSAL]")) {
        if (content.includes("trial for dec 10")) {
          return false;
        }
      }
      return true;
    });
  }, [messages]);

  const normalizedCurrentUserIdLower = useMemo(() => {
    if (currentUserId == null) return null;
    return String(currentUserId).toLowerCase();
  }, [currentUserId]);

  const messageDayKeyById = useMemo(() => {
    const map = new Map<string, string>();
    for (const msg of visibleMessages) {
      const iso = String(msg.timestamp ?? "");
      const d = new Date(iso);
      map.set(
        String(msg.id),
        Number.isNaN(d.getTime()) ? iso : d.toDateString(),
      );
    }
    return map;
  }, [visibleMessages]);

  const messageTimeLabelById = useMemo(() => {
    const map = new Map<string, string>();
    for (const msg of visibleMessages) {
      map.set(String(msg.id), formatTimestamp(String(msg.timestamp ?? "")));
    }
    return map;
  }, [visibleMessages]);

  const messageKeyExtractor = useCallback(
    (item: ChatMessageDto) => String(item.id),
    [],
  );

  const messageListContentStyle = useMemo(
    () => ({
      paddingHorizontal: 16,
      paddingVertical: 12,
      gap: 4,
    }),
    [],
  );

  // Memoize renderItem for better performance
  const renderMessageItem = useCallback(
    ({ item, index }: { item: ChatMessageDto; index: number }) => {
      const olderMessage = visibleMessages[index + 1];

      const itemId = String(item.id);
      const olderId = olderMessage ? String(olderMessage.id) : null;

      const itemDayKey =
        messageDayKeyById.get(itemId) ?? String(item.timestamp ?? "");
      const olderDayKey = olderId
        ? (messageDayKeyById.get(olderId) ??
          String(olderMessage?.timestamp ?? ""))
        : null;

      const itemTimeLabel =
        messageTimeLabelById.get(itemId) ??
        formatTimestamp(String(item.timestamp ?? ""));
      const olderTimeLabel = olderId
        ? (messageTimeLabelById.get(olderId) ??
          formatTimestamp(String(olderMessage?.timestamp ?? "")))
        : null;

      // Show date separator if this is the oldest message or if the older message is from a different day
      const showDateSeparator = !olderMessage || olderDayKey !== itemDayKey;

      // Compute ownership from senderId to ensure correct bubble side/color (case-insensitive GUID comparison)
      const isMine = normalizedCurrentUserIdLower
        ? String(item.senderId ?? "").toLowerCase() ===
          normalizedCurrentUserIdLower
        : Boolean(item.isMine);

      const olderMessageIsMine = olderMessage
        ? normalizedCurrentUserIdLower
          ? String(olderMessage.senderId ?? "").toLowerCase() ===
            normalizedCurrentUserIdLower
          : Boolean(olderMessage.isMine)
        : undefined;

      const showTimestamp =
        !olderMessage ||
        olderMessageIsMine !== isMine ||
        olderTimeLabel !== itemTimeLabel;

      return (
        <View style={{ marginBottom: showTimestamp ? 12 : 4 }}>
          {showDateSeparator ? <DateSeparator iso={item.timestamp} /> : null}
          <MessageBubble
            message={item}
            isMine={isMine}
            onPressImage={setViewerImageUri}
          />
          {showTimestamp ? (
            <View
              className={`flex-row px-0 mt-0.5 mb-1 ${
                isMine ? "justify-end" : "justify-start"
              }`}
            >
              <Text
                className={`text-xs ${
                  isMine ? "text-gray-400" : "text-gray-500"
                }`}
              >
                {itemTimeLabel}
              </Text>
            </View>
          ) : null}
        </View>
      );
    },
    [
      visibleMessages,
      normalizedCurrentUserIdLower,
      messageDayKeyById,
      messageTimeLabelById,
    ],
  );

  return (
    <View className="flex-1 bg-teal-50">
      {/* Proposal preview modal (patient side) */}
      {isCurrentUserPatient && proposalDetails ? (
        <Modal
          visible={showProposalModal && !isProposalResolved}
          animationType="slide"
          transparent
          onRequestClose={() => setShowProposalModal(false)}
        >
          <View
            style={{
              flex: 1,
              backgroundColor: "rgba(0,0,0,0.4)",
              alignItems: "center",
              justifyContent: "center",
              padding: 16,
            }}
          >
            <View
              style={{
                width: "100%",
                maxWidth: 480,
                backgroundColor: "#fff",
                borderRadius: 16,
                padding: 16,
                shadowColor: "#000",
                shadowOpacity: 0.2,
                shadowRadius: 10,
                elevation: 6,
              }}
            >
              <Text className="text-base font-bold text-gray-900">
                Proposed Session
              </Text>
              {proposalDetails.caseTitle ? (
                <Text className="text-sm text-gray-700 mt-2">
                  {proposalDetails.caseTitle}
                </Text>
              ) : null}
              {proposalDetails.day || proposalDetails.timeRange ? (
                <Text className="text-sm text-gray-700 mt-1">
                  {proposalDetails.day} {proposalDetails.timeRange}
                </Text>
              ) : null}
              {proposalDetails.total ? (
                <Text className="text-sm text-gray-700 mt-1">
                  Total: {proposalDetails.total}
                </Text>
              ) : null}

              <View className="flex-row justify-end gap-2 mt-4">
                <TouchableOpacity
                  className={`px-4 py-2 rounded-full bg-red-500 ${
                    isProposalBusy ? "opacity-70" : ""
                  }`}
                  onPress={async () => {
                    await handleProposalDecline();
                    setShowProposalModal(false);
                  }}
                  disabled={isProposalBusy}
                >
                  {isProcessingDecline ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text className="text-white font-semibold">Decline</Text>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  className={`px-4 py-2 rounded-full bg-green-600 ${
                    isProposalBusy ? "opacity-70" : ""
                  }`}
                  onPress={async () => {
                    await handleProposalAccept();
                    setShowProposalModal(false);
                  }}
                  disabled={isProposalBusy}
                >
                  {isProcessingAccept ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text className="text-white font-semibold">Accept</Text>
                  )}
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                className="self-center mt-3"
                onPress={() => setShowProposalModal(false)}
              >
                <Text className="text-xs text-gray-500">Maybe later</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      ) : null}
      <StatusBar
        backgroundColor="#171717"
        barStyle="light-content"
        translucent={false}
      />
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : "padding"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 60 : 45}
        enabled
      >
        <View className="flex-row items-center justify-between px-4 py-3 bg-neutral-900 border-b border-neutral-800">
          {showBackButton && (
            <TouchableOpacity
              accessibilityLabel="Go back"
              onPress={() => router.back()}
              className="mr-3"
            >
              <ArrowLeft color="#FFFFFF" size={24} />
            </TouchableOpacity>
          )}

          <TouchableOpacity
            className="flex-1 flex-row items-center"
            onPress={openUserProfile}
            activeOpacity={0.7}
          >
            <Avatar
              uri={otherAvatarSource as any}
              name={otherDisplayName}
              size={40}
            />
            <View className="ml-3">
              <Text className="text-base font-bold text-white">
                {headerTitle}
              </Text>
              <Text className="text-xs text-white/80">
                {role || "Physical Therapist"}
              </Text>
            </View>
          </TouchableOpacity>

          <View className="flex-row items-center">
            {!isCurrentUserPatient ? (
              <TouchableOpacity
                accessibilityLabel="Open session details"
                onPress={() => {
                  // ... existing logic ...
                  // Block opening if patient context hasn't loaded yet (therapist side)
                  if (!isPatientSide && !activePatientContext) {
                    Alert.alert(
                      "Loading",
                      "Patient profile details are loading. Please try again in a moment.",
                    );
                    return;
                  }

                  // Check if there's already a pending proposal between these users
                  // proposalContractStatus is 'pending' when there's an active proposal awaiting confirmation
                  if (proposalContractStatus === "pending" && proposalDetails) {
                    Alert.alert(
                      "Pending Proposal",
                      "You already have a pending session proposal with this patient. Please wait for them to respond before creating a new one.",
                      [{ text: "OK", style: "default" }],
                    );
                    return;
                  }

                  // ... (rest of the logic is inside the handler, I can't easily copy it all here without reading it again.
                  // Wait, I am replacing the whole header block. I need to be careful not to lose the logic.)
                  // Actually, the logic is quite long. I should try to match the start and end of the header block.

                  // Let's just replace the visual parts and keep the logic if possible.
                  // But the logic is inside the onPress.

                  // I will use the existing logic but wrap it in the new UI structure.
                  // Since I don't want to copy-paste the huge logic block blindly, I will read the file again to get the exact content of the onPress handler.
                  // Or I can just target the visual elements surrounding it.

                  // The previous read_file output has the logic. I can copy it from there.

                  const activeAddress =
                    (activePatientContext as any)?.addressLine ||
                    (activePatientContext as any)?.address ||
                    (activePatientContext as any)?.location?.address ||
                    undefined;
                  const activeBarangay =
                    (activePatientContext as any)?.barangay ||
                    (activePatientContext as any)?.barangayName ||
                    (activePatientContext as any)?.location?.barangay ||
                    undefined;
                  const activeLat =
                    (activePatientContext as any)?.location?.latitude ??
                    (activePatientContext as any)?.latitude ??
                    undefined;
                  const activeLng =
                    (activePatientContext as any)?.location?.longitude ??
                    (activePatientContext as any)?.longitude ??
                    undefined;

                  const sessionId = proposalDetails?.sessionId;
                  const contractId = (proposalDetails as any)?.contractId;

                  const normalizeMoney = (value: any) => {
                    if (value == null) return undefined;
                    if (typeof value === "number") {
                      return formatPeso(value) ?? String(value);
                    }
                    if (typeof value === "string") {
                      const numeric = Number(value.replace(/[^0-9.\-]/g, ""));
                      if (Number.isFinite(numeric)) {
                        return formatPeso(numeric) ?? String(numeric);
                      }
                      return value;
                    }
                    return undefined;
                  };

                  const pickString = (...values: any[]) => {
                    for (const value of values) {
                      if (value == null) continue;
                      const str = String(value).trim();
                      if (str) return str;
                    }
                    return undefined;
                  };

                  const to12h = (raw?: string | null) => {
                    if (!raw) return undefined;
                    const match = String(raw).match(
                      /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/,
                    );
                    if (!match) return raw;
                    let hours = Number(match[1]);
                    const minutes = match[2];
                    if (!Number.isFinite(hours)) return raw;
                    const meridiem = hours >= 12 ? "PM" : "AM";
                    hours = hours % 12 || 12;
                    return `${hours}:${minutes} ${meridiem}`;
                  };

                  const professionalFeeParam = normalizeMoney(
                    (proposalDetails as any)?.professionalFee ??
                      (proposalDetails as any)?.fee ??
                      (proposalDetails as any)?.professional_fee,
                  );
                  const locationFeeParam = normalizeMoney(
                    (proposalDetails as any)?.locationFee ??
                      (proposalDetails as any)?.locFee ??
                      (proposalDetails as any)?.location_fee,
                  );
                  const miscFeeParam = normalizeMoney(
                    (proposalDetails as any)?.miscFee ??
                      (proposalDetails as any)?.toolsFee ??
                      (proposalDetails as any)?.miscellaneousFee ??
                      (proposalDetails as any)?.miscellaneous_fee,
                  );
                  let totalParam = normalizeMoney(
                    (proposalDetails as any)?.totalFee ??
                      (proposalDetails as any)?.total,
                  );

                  // Avoid network calls here for speed; compute locally when possible
                  const feeParamFinal = professionalFeeParam;
                  const locFeeParamFinal = locationFeeParam;
                  const toolsFeeParamFinal = miscFeeParam;
                  let totalParamFinal = totalParam;

                  const parseMoneyNumeric = (v: any) => {
                    if (v == null) return undefined;
                    const n = Number(String(v).replace(/[^0-9.\-]/g, ""));
                    return Number.isFinite(n) ? n : undefined;
                  };

                  if (!totalParamFinal) {
                    const pf = parseMoneyNumeric(feeParamFinal);
                    const lf = parseMoneyNumeric(locFeeParamFinal);
                    const tf = parseMoneyNumeric(toolsFeeParamFinal);
                    const nums = [pf, lf, tf].filter(
                      (x) => typeof x === "number",
                    ) as number[];
                    if (nums.length > 0) {
                      const sum = nums.reduce((a, b) => a + b, 0);
                      totalParamFinal = formatPeso(sum);
                    }
                  }

                  const caseTitleParam = pickString(
                    (proposalDetails as any)?.caseTitle,
                    (proposalDetails as any)?.caseToTreat,
                    (proposalDetails as any)?.case_to_treat,
                  );
                  const dayParam = pickString(
                    (proposalDetails as any)?.day,
                    (proposalDetails as any)?.sessionDays,
                    (proposalDetails as any)?.session_days,
                  );
                  const startRaw =
                    (proposalDetails as any)?.sessionStartTime ??
                    (proposalDetails as any)?.startTime ??
                    (proposalDetails as any)?.start_time;
                  const endRaw =
                    (proposalDetails as any)?.sessionEndTime ??
                    (proposalDetails as any)?.endTime ??
                    (proposalDetails as any)?.end_time;
                  const rawTimeRange = pickString(
                    (proposalDetails as any)?.timeRange,
                    (proposalDetails as any)?.time_range,
                  );
                  const startFormatted = to12h(startRaw);
                  const endFormatted = to12h(endRaw);
                  const timeRangeParam =
                    rawTimeRange ||
                    (startFormatted || endFormatted
                      ? `${startFormatted ?? ""}${
                          endFormatted ? ` - ${endFormatted}` : ""
                        }`.trim()
                      : undefined);
                  const durationParam = pickString(
                    (proposalDetails as any)?.duration,
                    (proposalDetails as any)?.durationMinutes,
                    (proposalDetails as any)?.duration_minutes,
                  );

                  const patientNameParam = (() => {
                    const nameCandidate = isCurrentUserPatient
                      ? myDisplayName
                      : otherDisplayName;
                    if (!nameCandidate) return undefined;
                    const trimmed = nameCandidate.trim();
                    return trimmed && trimmed.toLowerCase() !== "you"
                      ? trimmed
                      : undefined;
                  })();

                  const therapistNameParam = (() => {
                    const candidate = isCurrentUserTherapist
                      ? myDisplayName
                      : otherDisplayName;
                    const trimmed = candidate?.trim();
                    return trimmed || undefined;
                  })();

                  const addressParam =
                    pickString(
                      (proposalDetails as any)?.locationAddress,
                      (proposalDetails as any)?.address,
                    ) ?? activeAddress;
                  const barangayParam =
                    pickString(
                      (proposalDetails as any)?.barangay,
                      (proposalDetails as any)?.barangayName,
                    ) ?? activeBarangay;
                  const latParam =
                    (proposalDetails as any)?.latitude ??
                    (proposalDetails as any)?.lat ??
                    activeLat;
                  const lngParam =
                    (proposalDetails as any)?.longitude ??
                    (proposalDetails as any)?.lng ??
                    activeLng;

                  router.push({
                    pathname: "/create-session",
                    params: {
                      therapistName: therapistNameParam,
                      patientName: patientNameParam,
                      address: addressParam,
                      barangay: barangayParam,
                      profileId:
                        (activePatientContext as any)?.id != null
                          ? String((activePatientContext as any)?.id)
                          : undefined,
                      lat: latParam != null ? String(latParam) : undefined,
                      lng: lngParam != null ? String(lngParam) : undefined,
                      caseTitle: caseTitleParam,
                      day: dayParam,
                      timeRange: timeRangeParam,
                      duration: durationParam,
                      editable: isCurrentUserTherapist ? "1" : undefined,
                      conversationId: otherUserId ?? undefined,
                      sessionId:
                        sessionId != null ? String(sessionId) : undefined,
                      contractId:
                        contractId != null ? String(contractId) : undefined,
                      fee: feeParamFinal,
                      locFee: locFeeParamFinal,
                      toolsFee: toolsFeeParamFinal,
                      total: totalParamFinal,
                    },
                  });
                }}
                className="p-2 mr-2"
              >
                <Clipboard color="#FFFFFF" size={24} />
              </TouchableOpacity>
            ) : null}

            <TouchableOpacity
              className="p-2"
              onPress={() => setShowOptionsMenu(true)}
            >
              <MoreVertical color="#FFFFFF" size={24} />
            </TouchableOpacity>

            {/* Options Menu Modal */}
            <Modal
              visible={showOptionsMenu}
              transparent
              animationType="fade"
              onRequestClose={() => setShowOptionsMenu(false)}
            >
              <TouchableOpacity
                style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.3)" }}
                activeOpacity={1}
                onPress={() => setShowOptionsMenu(false)}
              >
                <View
                  style={{
                    position: "absolute",
                    right: 16,
                    top: 60,
                    backgroundColor: "white",
                    borderRadius: 12,
                    shadowColor: "#000",
                    shadowOffset: { width: 0, height: 2 },
                    shadowOpacity: 0.25,
                    shadowRadius: 8,
                    elevation: 5,
                    minWidth: 200,
                    overflow: "hidden",
                  }}
                >
                  <TouchableOpacity
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      paddingHorizontal: 16,
                      paddingVertical: 14,
                      borderBottomWidth: 1,
                      borderBottomColor: "#F3F4F6",
                    }}
                    onPress={() => {
                      setShowOptionsMenu(false);
                      setShowReportModal(true);
                    }}
                  >
                    <Flag
                      size={18}
                      color="#F59E0B"
                      style={{ marginRight: 12 }}
                    />
                    <Text
                      style={{
                        color: "#374151",
                        fontSize: 15,
                        fontWeight: "500",
                      }}
                    >
                      Report
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      paddingHorizontal: 16,
                      paddingVertical: 14,
                    }}
                    onPress={() => {
                      setShowOptionsMenu(false);
                      setShowDeleteConfirm(true);
                    }}
                  >
                    <Trash2
                      size={18}
                      color="#DC2626"
                      style={{ marginRight: 12 }}
                    />
                    <Text
                      style={{
                        color: "#DC2626",
                        fontSize: 15,
                        fontWeight: "500",
                      }}
                    >
                      Clear Chat History
                    </Text>
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            </Modal>

            {/* Delete Confirmation Modal */}
            <Modal
              visible={showDeleteConfirm}
              transparent
              animationType="fade"
              onRequestClose={() => setShowDeleteConfirm(false)}
            >
              <View
                style={{
                  flex: 1,
                  backgroundColor: "rgba(0,0,0,0.5)",
                  justifyContent: "center",
                  alignItems: "center",
                  padding: 24,
                }}
              >
                <View
                  style={{
                    backgroundColor: "white",
                    borderRadius: 16,
                    padding: 24,
                    width: "100%",
                    maxWidth: 340,
                    shadowColor: "#000",
                    shadowOffset: { width: 0, height: 4 },
                    shadowOpacity: 0.15,
                    shadowRadius: 12,
                    elevation: 8,
                  }}
                >
                  <View style={{ alignItems: "center", marginBottom: 16 }}>
                    <View
                      style={{
                        width: 48,
                        height: 48,
                        borderRadius: 24,
                        backgroundColor: "#FEE2E2",
                        alignItems: "center",
                        justifyContent: "center",
                        marginBottom: 12,
                      }}
                    >
                      <Trash2 size={24} color="#DC2626" />
                    </View>
                    <Text
                      style={{
                        fontSize: 18,
                        fontWeight: "700",
                        color: "#111827",
                        textAlign: "center",
                      }}
                    >
                      Clear Chat History?
                    </Text>
                  </View>
                  <Text
                    style={{
                      fontSize: 14,
                      color: "#6B7280",
                      textAlign: "center",
                      marginBottom: 24,
                      lineHeight: 20,
                    }}
                  >
                    This will delete all messages in this conversation. You can
                    still continue messaging {otherDisplayName}.
                  </Text>
                  <View style={{ flexDirection: "row", gap: 12 }}>
                    <TouchableOpacity
                      style={{
                        flex: 1,
                        paddingVertical: 12,
                        borderRadius: 10,
                        backgroundColor: "#F3F4F6",
                        alignItems: "center",
                      }}
                      onPress={() => setShowDeleteConfirm(false)}
                      disabled={isDeleting}
                    >
                      <Text
                        style={{
                          fontSize: 15,
                          fontWeight: "600",
                          color: "#374151",
                        }}
                      >
                        Cancel
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={{
                        flex: 1,
                        paddingVertical: 12,
                        borderRadius: 10,
                        backgroundColor: isDeleting ? "#FCA5A5" : "#DC2626",
                        alignItems: "center",
                      }}
                      onPress={async () => {
                        if (!otherUserId || isDeleting) return;
                        setIsDeleting(true);
                        try {
                          await deleteConversation(otherUserId);
                          setShowDeleteConfirm(false);
                          // Invalidate both conversations list and chat history to refresh the UI
                          await Promise.all([
                            queryClient.invalidateQueries({
                              queryKey: CHAT_CONVERSATIONS_QUERY_KEY,
                            }),
                            queryClient.invalidateQueries({
                              queryKey: chatHistoryQueryKey(otherUserId),
                            }),
                          ]);
                          // Stay in conversation - user can continue messaging
                          Alert.alert(
                            "Cleared",
                            "Chat history has been cleared. You can continue messaging.",
                          );
                        } catch (err: any) {
                          Alert.alert(
                            "Error",
                            err?.message ??
                              "Failed to clear chat history. Please try again.",
                          );
                        } finally {
                          setIsDeleting(false);
                        }
                      }}
                      disabled={isDeleting}
                    >
                      {isDeleting ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <Text
                          style={{
                            fontSize: 15,
                            fontWeight: "600",
                            color: "white",
                          }}
                        >
                          Clear
                        </Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            </Modal>

            {/* Report Modal */}
            <Modal
              visible={showReportModal}
              transparent
              animationType="fade"
              onRequestClose={() => {
                setShowReportModal(false);
                setReportReason("");
              }}
            >
              <View
                style={{
                  flex: 1,
                  backgroundColor: "rgba(0,0,0,0.5)",
                  justifyContent: "center",
                  alignItems: "center",
                  padding: 24,
                }}
              >
                <View
                  style={{
                    backgroundColor: "white",
                    borderRadius: 16,
                    padding: 24,
                    width: "100%",
                    maxWidth: 400,
                    shadowColor: "#000",
                    shadowOffset: { width: 0, height: 4 },
                    shadowOpacity: 0.15,
                    shadowRadius: 12,
                    elevation: 8,
                  }}
                >
                  <View style={{ alignItems: "center", marginBottom: 16 }}>
                    <View
                      style={{
                        width: 48,
                        height: 48,
                        borderRadius: 24,
                        backgroundColor: "#FEF3C7",
                        alignItems: "center",
                        justifyContent: "center",
                        marginBottom: 12,
                      }}
                    >
                      <Flag size={24} color="#F59E0B" />
                    </View>
                    <Text
                      style={{
                        fontSize: 18,
                        fontWeight: "700",
                        color: "#111827",
                        textAlign: "center",
                      }}
                    >
                      Report User
                    </Text>
                  </View>
                  <Text
                    style={{
                      fontSize: 14,
                      color: "#6B7280",
                      textAlign: "center",
                      marginBottom: 16,
                      lineHeight: 20,
                    }}
                  >
                    Please describe the issue you’re experiencing with this
                    user.
                  </Text>
                  <TextInput
                    style={{
                      borderWidth: 1,
                      borderColor: "#E5E7EB",
                      borderRadius: 10,
                      padding: 12,
                      fontSize: 14,
                      color: "#111827",
                      minHeight: 100,
                      textAlignVertical: "top",
                      marginBottom: 20,
                    }}
                    placeholder="Describe the issue..."
                    placeholderTextColor="#9CA3AF"
                    multiline
                    value={reportReason}
                    onChangeText={setReportReason}
                  />
                  <View style={{ flexDirection: "row", gap: 12 }}>
                    <TouchableOpacity
                      style={{
                        flex: 1,
                        paddingVertical: 12,
                        borderRadius: 10,
                        backgroundColor: "#F3F4F6",
                        alignItems: "center",
                      }}
                      onPress={() => {
                        setShowReportModal(false);
                        setReportReason("");
                      }}
                      disabled={isSubmittingReport}
                    >
                      <Text
                        style={{
                          fontSize: 15,
                          fontWeight: "600",
                          color: "#374151",
                        }}
                      >
                        Cancel
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={{
                        flex: 1,
                        paddingVertical: 12,
                        borderRadius: 10,
                        backgroundColor:
                          isSubmittingReport || !reportReason.trim()
                            ? "#FCD34D"
                            : "#F59E0B",
                        alignItems: "center",
                      }}
                      onPress={async () => {
                        if (
                          !otherUserId ||
                          !reportReason.trim() ||
                          isSubmittingReport
                        )
                          return;
                        setIsSubmittingReport(true);
                        try {
                          await apiClient.post("/api/Reports", {
                            reportedUserId: otherUserId,
                            reason: reportReason.trim(),
                          });
                          setShowReportModal(false);
                          setReportReason("");
                          Alert.alert(
                            "Report Submitted",
                            "Thank you for your report. Our team will review it shortly.",
                          );
                        } catch (err: any) {
                          Alert.alert(
                            "Error",
                            err?.message ??
                              "Failed to submit report. Please try again.",
                          );
                        } finally {
                          setIsSubmittingReport(false);
                        }
                      }}
                      disabled={isSubmittingReport || !reportReason.trim()}
                    >
                      {isSubmittingReport ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <Text
                          style={{
                            fontSize: 15,
                            fontWeight: "600",
                            color: "white",
                          }}
                        >
                          Submit Report
                        </Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            </Modal>
          </View>
        </View>
        {restrictionBanner ? (
          <View className="mx-4 mt-3 mb-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
            <Text className="text-sm text-amber-900">
              {restrictionBanner.text}
            </Text>
            {restrictionBanner.actionLabel && restrictionBanner.onPress ? (
              <TouchableOpacity
                onPress={restrictionBanner.onPress}
                className="mt-2 self-start rounded-full border border-amber-400 px-3 py-1.5"
              >
                <Text className="text-sm font-semibold text-amber-900">
                  {restrictionBanner.actionLabel}
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}

        {/* Show banner: 
            - For therapist: show always (pending/confirmed/declined status display)
            - For patient: only show if pending (hide after accepted/declined)
        */}
        {proposalDetails &&
        !isProposalResolved &&
        (isCurrentUserTherapist ||
          (isCurrentUserPatient && proposalContractStatus === "pending")) ? (
          <View
            className={`flex-row items-start p-4 mx-4 my-3 rounded-xl border shadow-sm ${
              isCurrentUserTherapist
                ? proposalContractStatus === "confirmed"
                  ? "bg-green-50 border-green-200"
                  : proposalContractStatus === "declined"
                    ? "bg-red-50 border-red-200"
                    : "bg-amber-50 border-amber-200"
                : "bg-[#FFF7ED] border-[#FFEDD5]" // Orange-50/100 equivalent
            }`}
          >
            <View className="mr-3 mt-0.5">
              {isCurrentUserTherapist ? (
                proposalContractStatus === "confirmed" ? (
                  <Check size={20} color="#16A34A" />
                ) : proposalContractStatus === "declined" ? (
                  <X size={20} color="#DC2626" />
                ) : (
                  <AlertCircle size={20} color="#D97706" />
                )
              ) : (
                <View className="w-8 h-8 rounded-full bg-orange-100 items-center justify-center border border-orange-200">
                  <AlertCircle size={18} color="#EA580C" />
                </View>
              )}
            </View>

            <View className="flex-1">
              <View className="flex-row justify-between items-start">
                <View className="flex-1">
                  <Text className="text-sm font-bold text-gray-900">
                    {isCurrentUserTherapist
                      ? `Proposal ${
                          proposalContractStatus === "confirmed"
                            ? "Accepted"
                            : proposalContractStatus === "declined"
                              ? "Declined"
                              : "Pending"
                        }`
                      : "New Session Proposal Pending"}
                  </Text>
                  {proposalDetails.caseTitle && (
                    <Text className="text-sm font-bold text-gray-900 mt-1">
                      {proposalDetails.caseTitle}
                    </Text>
                  )}
                  <Text className="text-sm text-gray-600 mt-0.5">
                    {proposalDetails.day} • {proposalDetails.timeRange}
                  </Text>
                  <Text className="text-sm font-semibold text-gray-900 mt-0.5">
                    {proposalDetails.total}
                  </Text>
                </View>

                {isCurrentUserTherapist && (
                  <TouchableOpacity
                    className="p-1 -mt-1 -mr-1"
                    onPress={() => {
                      // Add to dismissed set so it doesn't reappear
                      const contractId = proposalContractIdRef.current;
                      if (contractId) {
                        setDismissedProposalIds(
                          (prev) => new Set([...prev, contractId]),
                        );
                      }
                      setIsProposalResolved(true);
                    }}
                  >
                    <X size={18} color="#9CA3AF" />
                  </TouchableOpacity>
                )}
              </View>

              {isCurrentUserPatient &&
                (proposalContractStatus === "pending" ||
                  !proposalContractStatus) && (
                  <View className="flex-row justify-end gap-3 mt-3">
                    <TouchableOpacity
                      className={`px-4 py-2 rounded-lg border border-gray-300 bg-white ${
                        isProcessingDecline ? "opacity-70" : ""
                      }`}
                      onPress={() => {
                        handleProposalDecline();
                      }}
                      disabled={isProposalBusy}
                    >
                      {isProcessingDecline ? (
                        <ActivityIndicator size="small" color="#374151" />
                      ) : (
                        <Text className="text-sm font-semibold text-gray-700">
                          Decline
                        </Text>
                      )}
                    </TouchableOpacity>

                    <TouchableOpacity
                      className={`px-4 py-2 rounded-lg bg-[#0D9488] ${
                        isProcessingAccept ? "opacity-70" : ""
                      }`}
                      onPress={() => {
                        handleProposalAccept();
                      }}
                      disabled={isProposalBusy}
                    >
                      {isProcessingAccept ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <Text className="text-sm font-semibold text-white">
                          Accept Proposal
                        </Text>
                      )}
                    </TouchableOpacity>
                  </View>
                )}
            </View>
          </View>
        ) : null}

        <View className="flex-1">
          {isLoading ? (
            <View className="flex-1 items-center justify-center">
              <ActivityIndicator size="small" color="#4C6EF5" />
            </View>
          ) : isError ? (
            <View className="flex-1 items-center justify-center p-4">
              <Text className="text-sm font-semibold text-red-600 mb-1 text-center">
                Failed to load messages.
              </Text>
              {error instanceof Error ? (
                <Text className="text-xs text-gray-600 text-center">
                  {error.message}
                </Text>
              ) : null}
            </View>
          ) : (
            <FlatList
              ref={listRef}
              data={visibleMessages}
              inverted
              keyExtractor={messageKeyExtractor}
              contentContainerStyle={messageListContentStyle}
              keyboardShouldPersistTaps="handled"
              onEndReached={() => {
                if (hasNextPage && !isFetchingNextPage) {
                  fetchNextPage();
                }
              }}
              onEndReachedThreshold={0.5}
              ListHeaderComponent={
                isFetchingNextPage ? (
                  <View className="py-4 items-center">
                    <ActivityIndicator size="small" color="#4C6EF5" />
                  </View>
                ) : null
              }
              // Performance optimizations
              windowSize={10}
              maxToRenderPerBatch={10}
              updateCellsBatchingPeriod={50}
              initialNumToRender={15}
              removeClippedSubviews={Platform.OS === "android"}
              renderItem={renderMessageItem}
              showsVerticalScrollIndicator={false}
              ListEmptyComponent={
                <View className="flex-1 items-center justify-center py-10">
                  <Text className="text-base font-semibold text-gray-700 mb-1.5">
                    No messages yet.
                  </Text>
                  <Text className="text-sm text-gray-500">
                    Start the conversation by sending a message.
                  </Text>
                </View>
              }
            />
          )}
        </View>
        <MessageComposer
          onSend={handleSendMessage}
          onPickImage={handlePickImage}
          isBlocked={isBlockedByMe || isBlockedByOther}
          isSending={isSending}
          isUploadingImage={isUploadingImage}
          placeholder={composerPlaceholder}
          disabled={isConversationClosed}
          pendingImageUri={pendingImageUri}
          onRemovePendingImage={() => setPendingImageUri(null)}
        />
      </KeyboardAvoidingView>

      {/* Full-screen image viewer */}
      <ImageViewerModal
        visible={Boolean(viewerImageUri)}
        imageUri={viewerImageUri}
        onClose={() => setViewerImageUri(null)}
      />
    </View>
  );
}

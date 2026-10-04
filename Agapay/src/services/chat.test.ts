import apiClient from "@/api/client";
import {
  CHAT_CONVERSATIONS_QUERY_KEY,
  createConversation,
  deleteConversation,
  fetchChatConversations,
  fetchChatHistory,
  getBlockedUsers,
  markChatHistoryRead,
  upsertConversationCache,
} from "@/src/services/chat";

jest.mock("@/api/client", () => {
  const api = {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
    defaults: {
      baseURL: "https://example.test/api",
      headers: { common: {} },
    },
  };
  return { __esModule: true, default: api };
});

describe("src/services/chat", () => {
  const api = apiClient as unknown as {
    get: jest.Mock;
    post: jest.Mock;
    delete: jest.Mock;
    defaults: { baseURL?: string };
  };

  let warnSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    api.defaults.baseURL = "https://example.test/api";
    warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  describe("fetchChatConversations", () => {
    it("returns [] when response is not an array", async () => {
      api.get.mockResolvedValueOnce({ data: { items: [] } });
      await expect(fetchChatConversations()).resolves.toEqual([]);
      expect(api.get).toHaveBeenCalledWith("/api/chat/conversations");
    });

    it("normalizes relative avatar urls using apiClient.defaults.baseURL", async () => {
      api.get.mockResolvedValueOnce({
        data: [
          {
            otherUserId: 1,
            otherUserName: "Alice",
            otherUserAvatar: "/images/a.png",
          },
        ],
      });

      const res = await fetchChatConversations();
      expect(res).toHaveLength(1);
      expect(res[0].otherUserAvatar).toBe("https://example.test/api/images/a.png");
    });

    it("keeps absolute avatar urls unchanged", async () => {
      api.get.mockResolvedValueOnce({
        data: [
          {
            otherUserId: 1,
            otherUserName: "Alice",
            otherUserAvatar: "https://cdn.test/a.png",
          },
        ],
      });

      const res = await fetchChatConversations();
      expect(res[0].otherUserAvatar).toBe("https://cdn.test/a.png");
    });
  });

  describe("fetchChatHistory", () => {
    it("returns an empty response when otherUserId is missing", async () => {
      const res = await fetchChatHistory("");
      expect(res.messages).toEqual([]);
      expect(api.get).not.toHaveBeenCalled();
    });

    it("adds beforeId query param when cursor is provided", async () => {
      api.get.mockResolvedValueOnce({ data: { messages: [] } });
      await fetchChatHistory("u1", { cursor: 123 });
      expect(api.get).toHaveBeenCalledWith("/api/chat/history/u1?beforeId=123");
    });

    it("handles legacy array response by normalizing into ChatHistoryResponse", async () => {
      api.get.mockResolvedValueOnce({
        data: [
          {
            id: 1,
            senderId: "s",
            receiverId: "r",
            content: "hi",
            timestamp: "2026-01-01T00:00:00.000Z",
          },
        ],
      });

      const res = await fetchChatHistory("u1");
      expect(res.messages).toHaveLength(1);
      expect(res.status).toBe("Active");
      expect(res.messages[0].messageType).toBe("TEXT");
    });
  });

  describe("markChatHistoryRead", () => {
    it("no-ops when otherUserId is missing", async () => {
      await markChatHistoryRead("");
      expect(api.post).not.toHaveBeenCalled();
    });

    it("swallows errors", async () => {
      api.post.mockRejectedValueOnce(new Error("fail"));
      await expect(markChatHistoryRead("u1")).resolves.toBeUndefined();
      expect(api.post).toHaveBeenCalledWith("/api/chat/history/u1/read");
    });
  });

  describe("getBlockedUsers", () => {
    it("normalizes blocked entries and returns [] for non-array", async () => {
      api.get.mockResolvedValueOnce({ data: { items: [] } });
      await expect(getBlockedUsers()).resolves.toEqual([]);

      api.get.mockResolvedValueOnce({
        data: [{ blockedUserId: 5, createdAt: "2026-01-01T00:00:00.000Z" }],
      });
      const res = await getBlockedUsers();
      expect(res).toHaveLength(1);
      expect(res[0].blockedUserId).toBe("5");
    });
  });

  describe("upsertConversationCache", () => {
    it("inserts new conversation and updates existing by otherUserId", () => {
      const store = new Map<string, any>();
      const queryClient = {
        setQueryData: (key: any, updater: any) => {
          const k = JSON.stringify(key);
          const prev = store.get(k);
          store.set(k, updater(prev));
        },
      } as any;

      upsertConversationCache(queryClient, { otherUserId: 1, otherUserName: "A" });
      const k = JSON.stringify(CHAT_CONVERSATIONS_QUERY_KEY);
      expect(store.get(k)).toHaveLength(1);
      expect(store.get(k)[0].otherUserName).toBe("A");

      upsertConversationCache(queryClient, { otherUserId: 1, latestMessage: "yo" });
      expect(store.get(k)).toHaveLength(1);
      expect(store.get(k)[0].latestMessage).toBe("yo");
    });
  });

  describe("createConversation", () => {
    it("returns null when otherUserId missing", async () => {
      await expect(createConversation("")).resolves.toBeNull();
      expect(api.post).not.toHaveBeenCalled();
    });

    it("normalizes response into ChatConversationDto", async () => {
      api.post.mockResolvedValueOnce({
        data: {
          otherUserId: 9,
          otherUserName: "Bob",
          unreadCount: 2,
        },
      });
      const res = await createConversation(9);
      expect(res?.otherUserId).toBe(9);
      expect(res?.unreadCount).toBe(2);
      expect(api.post).toHaveBeenCalledWith("/api/chat/conversations/9");
    });
  });

  describe("deleteConversation", () => {
    it("returns messagesDeleted on success", async () => {
      api.delete.mockResolvedValueOnce({ data: { messagesDeleted: 7 } });
      await expect(deleteConversation(1)).resolves.toEqual({ messagesDeleted: 7 });
    });

    it("throws on API failure", async () => {
      api.delete.mockRejectedValueOnce(new Error("boom"));
      await expect(deleteConversation(1)).rejects.toThrow("boom");
    });
  });
});

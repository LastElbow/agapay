describe("src/services/chatMedia", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    delete process.env.EXPO_PUBLIC_CHAT_MEDIA_PREFIX;
    delete process.env.EXPO_PUBLIC_SUPABASE_BUCKET;
    delete process.env.EXPO_PUBLIC_SUPABASE_URL;

    jest.spyOn(console, "warn").mockImplementation(() => {});
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    (console.warn as any).mockRestore?.();
    (console.error as any).mockRestore?.();
    delete (global as any).FormData;
    delete (global as any).fetch;
  });

  function mockFormData() {
    class MockFormData {
      parts: any[] = [];
      append = jest.fn((...args: any[]) => {
        this.parts.push(args);
      });
    }
    (global as any).FormData = MockFormData as any;
    return MockFormData;
  }

  it("uploadChatImageAsync throws on missing uri", async () => {
    jest.doMock("@/src/lib/supabaseClient", () => ({ __esModule: true, supabaseClient: null }));
    const mod = require("@/src/services/chatMedia");

    await expect(mod.uploadChatImageAsync("")).rejects.toThrow("Image URI is required");
  });

  it("uploadChatImageAsync throws when supabaseClient not configured", async () => {
    jest.doMock("@/src/lib/supabaseClient", () => ({ __esModule: true, supabaseClient: null }));
    const mod = require("@/src/services/chatMedia");

    await expect(mod.uploadChatImageAsync("file://a.jpg")).rejects.toThrow(
      "Supabase client not configured"
    );
  });

  it("uploadChatImageAsync (native) uploads with prefix and derived extension", async () => {
    const MockFormData = mockFormData();

    const upload = jest.fn(async () => ({ error: null, data: { path: "p" } }));
    const from = jest.fn(() => ({ upload }));
    const storage = { from };

    jest.doMock("@/src/lib/supabaseClient", () => ({
      __esModule: true,
      supabaseClient: { storage },
    }));

    const { Platform } = require("react-native");
    const originalOS = Platform.OS;
    try {
      Object.defineProperty(Platform, "OS", { value: "ios", configurable: true });
    } catch {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (Platform as any).OS = "ios";
    }

    const nowSpy = jest.spyOn(Date, "now").mockReturnValue(123);
    const randSpy = jest.spyOn(Math, "random").mockReturnValue(0.123456);

    process.env.EXPO_PUBLIC_CHAT_MEDIA_PREFIX = "public/chat-media";
    process.env.EXPO_PUBLIC_SUPABASE_BUCKET = "bucket";

    const mod = require("@/src/services/chatMedia");

    const uri = "file://image.png";
    const path = await mod.uploadChatImageAsync(uri);

    expect(from).toHaveBeenCalledWith("bucket");
    expect(upload).toHaveBeenCalledWith(
      expect.stringMatching(/^public\/chat-media\/123-[a-z0-9]{6}\.png$/),
      expect.any(MockFormData),
      { upsert: false }
    );
    expect(path).toBe("p");

    nowSpy.mockRestore();
    randSpy.mockRestore();

    try {
      Object.defineProperty(Platform, "OS", { value: originalOS, configurable: true });
    } catch {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (Platform as any).OS = originalOS;
    }
  });

  it("uploadChatImageAsync (web) reads blob via fetch and appends it", async () => {
    const MockFormData = mockFormData();

    const upload = jest.fn(async () => ({ error: null, data: { path: "x" } }));
    const from = jest.fn(() => ({ upload }));
    const storage = { from };

    jest.doMock("@/src/lib/supabaseClient", () => ({
      __esModule: true,
      supabaseClient: { storage },
    }));

    const { Platform } = require("react-native");
    const originalOS = Platform.OS;
    try {
      Object.defineProperty(Platform, "OS", { value: "web", configurable: true });
    } catch {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (Platform as any).OS = "web";
    }

    (global as any).fetch = jest.fn(async () => ({
      ok: true,
      blob: async () => ({ __blob: true }),
    }));

    process.env.EXPO_PUBLIC_SUPABASE_BUCKET = "bucket";

    const mod = require("@/src/services/chatMedia");
    await mod.uploadChatImageAsync("https://example.test/a.gif");

    const form = upload.mock.calls[0][1] as InstanceType<typeof MockFormData>;
    // cacheControl + file append
    expect(form.append).toHaveBeenCalled();
    expect((global as any).fetch).toHaveBeenCalled();

    try {
      Object.defineProperty(Platform, "OS", { value: originalOS, configurable: true });
    } catch {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (Platform as any).OS = originalOS;
    }
  });

  it("getChatImageUrl returns full url as-is", () => {
    jest.doMock("@/src/lib/supabaseClient", () => ({ __esModule: true, supabaseClient: null }));
    const mod = require("@/src/services/chatMedia");

    expect(mod.getChatImageUrl("https://x/y")).toBe("https://x/y");
    expect(mod.getChatImageUrl("data:image/png;base64,abc")).toBe("data:image/png;base64,abc");
  });

  it("getChatImageUrl uses supabase getPublicUrl when client exists", () => {
    const getPublicUrl = jest.fn(() => ({ data: { publicUrl: "https://public/url" } }));
    const from = jest.fn(() => ({ getPublicUrl }));
    const storage = { from };

    jest.doMock("@/src/lib/supabaseClient", () => ({
      __esModule: true,
      supabaseClient: { storage },
    }));

    const mod = require("@/src/services/chatMedia");
    expect(mod.getChatImageUrl("public/chat-media/x.jpg")).toBe("https://public/url");
    expect(from).toHaveBeenCalled();
    expect(getPublicUrl).toHaveBeenCalledWith("public/chat-media/x.jpg");
  });

  it("getChatImageUrl falls back to EXPO_PUBLIC_SUPABASE_URL when client missing", () => {
    process.env.EXPO_PUBLIC_SUPABASE_URL = "https://proj.supabase.co";
    process.env.EXPO_PUBLIC_SUPABASE_BUCKET = "bucket";
    jest.doMock("@/src/lib/supabaseClient", () => ({ __esModule: true, supabaseClient: null }));

    const mod = require("@/src/services/chatMedia");
    expect(mod.getChatImageUrl("public/chat-media/x.jpg")).toBe(
      "https://proj.supabase.co/storage/v1/object/public/bucket/public/chat-media/x.jpg"
    );
  });
});

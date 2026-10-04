jest.mock("expo-secure-store", () => {
  return {
    __esModule: true,
    isAvailableAsync: jest.fn(),
    getItemAsync: jest.fn(),
    setItemAsync: jest.fn(),
    deleteItemAsync: jest.fn(),
  };
});

function makeStorage() {
  const store = new Map<string, string>();
  return {
    getItem: jest.fn((k: string) => (store.has(k) ? store.get(k)! : null)),
    setItem: jest.fn((k: string, v: string) => {
      store.set(k, String(v));
    }),
    removeItem: jest.fn((k: string) => {
      store.delete(k);
    }),
    __store: store,
  };
}

function setupWebEnv(opts?: { local?: boolean; session?: boolean }) {
  const local = opts?.local ?? true;
  const session = opts?.session ?? true;

  const localStorage = local ? makeStorage() : undefined;
  const sessionStorage = session ? makeStorage() : undefined;

  (global as any).window = {
    localStorage,
    sessionStorage,
    location: { hostname: "localhost", protocol: "http:" },
  };
  (global as any).document = { cookie: "" };

  return { localStorage, sessionStorage };
}

describe("src/utils/safeSecureStore", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  afterEach(() => {
    delete (global as any).window;
    delete (global as any).document;
  });

  it("uses expo-secure-store when available", async () => {
    setupWebEnv();

    const SecureStore = require("expo-secure-store");
    SecureStore.isAvailableAsync.mockResolvedValueOnce(true);
    SecureStore.getItemAsync.mockResolvedValueOnce("v");

    const ss = require("@/src/utils/safeSecureStore");

    await expect(ss.getItem("k")).resolves.toBe("v");
    expect(SecureStore.getItemAsync).toHaveBeenCalledWith("k");

    SecureStore.isAvailableAsync.mockResolvedValueOnce(true);
    await ss.setItem("k", "v2");
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith("k", "v2");

    SecureStore.isAvailableAsync.mockResolvedValueOnce(true);
    await ss.deleteItem("k");
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith("k");
  });

  it("stores sensitive keys in sessionStorage only (web fallback)", async () => {
    const { localStorage, sessionStorage } = setupWebEnv();

    const SecureStore = require("expo-secure-store");
    SecureStore.isAvailableAsync.mockResolvedValue(false);

    const ss = require("@/src/utils/safeSecureStore");

    await ss.setItem("accessToken", "tok");

    expect(sessionStorage!.setItem).toHaveBeenCalledWith("accessToken", "tok");
    // localStorage may be probed for availability; ensure we never persist the sensitive value there
    expect(localStorage!.setItem).not.toHaveBeenCalledWith("accessToken", "tok");
    expect(localStorage!.__store.has("accessToken")).toBe(false);
    expect(localStorage!.removeItem).toHaveBeenCalledWith("accessToken");

    await expect(ss.getItem("accessToken")).resolves.toBe("tok");

    await ss.deleteItem("accessToken");
    expect(sessionStorage!.removeItem).toHaveBeenCalledWith("accessToken");
    expect(localStorage!.removeItem).toHaveBeenCalledWith("accessToken");
  });

  it("respects scope=session for non-sensitive keys", async () => {
    const { localStorage, sessionStorage } = setupWebEnv();

    const SecureStore = require("expo-secure-store");
    SecureStore.isAvailableAsync.mockResolvedValue(false);

    const ss = require("@/src/utils/safeSecureStore");

    // Pre-populate local to ensure cleanup
    localStorage!.__store.set("theme", "dark");

    await ss.setItem("theme", "light", { scope: "session" });

    expect(sessionStorage!.setItem).toHaveBeenCalledWith("theme", "light");
    expect(localStorage!.removeItem).toHaveBeenCalledWith("theme");

    await expect(ss.getItem("theme")).resolves.toBe("light");
  });

  it("respects scope=local for non-sensitive keys", async () => {
    const { localStorage, sessionStorage } = setupWebEnv();

    const SecureStore = require("expo-secure-store");
    SecureStore.isAvailableAsync.mockResolvedValue(false);

    const ss = require("@/src/utils/safeSecureStore");

    // Pre-populate session to ensure cleanup
    sessionStorage!.__store.set("locale", "en");

    await ss.setItem("locale", "fil", { scope: "local" });

    expect(localStorage!.setItem).toHaveBeenCalledWith("locale", "fil");
    expect(sessionStorage!.removeItem).toHaveBeenCalledWith("locale");

    await expect(ss.getItem("locale")).resolves.toBe("fil");
  });

  it("falls back to in-memory store when window storage is unavailable", async () => {
    delete (global as any).window;
    delete (global as any).document;

    const SecureStore = require("expo-secure-store");
    SecureStore.isAvailableAsync.mockResolvedValue(false);

    const ss = require("@/src/utils/safeSecureStore");

    await ss.setItem("k", "v");
    await expect(ss.getItem("k")).resolves.toBe("v");

    await ss.deleteItem("k");
    await expect(ss.getItem("k")).resolves.toBeNull();
  });
});

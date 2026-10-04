jest.mock("@/api/client", () => {
  const api = {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
    defaults: { baseURL: "https://example.test/api", headers: { common: {} } },
  };
  return { __esModule: true, default: api };
});

jest.mock("@/src/utils/safeSecureStore", () => {
  return {
    __esModule: true,
    getItem: jest.fn(),
    setItem: jest.fn(),
    deleteItem: jest.fn(),
  };
});

jest.mock("@/src/shared/ports/clock", () => {
  return { __esModule: true, systemClock: { now: () => 1700000000000 } };
});

describe("src/services/recommendations", () => {
  let logSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
    warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it("fetchRecommendations returns [] when backend returns non-array", async () => {
    const storage = require("@/src/utils/safeSecureStore");
    storage.getItem.mockResolvedValueOnce(null);

    const api = (require("@/api/client").default ?? require("@/api/client")) as {
      get: jest.Mock;
    };

    api.get.mockResolvedValueOnce({ data: { items: [] } });

    const svc = require("@/src/services/recommendations");
    await expect(svc.fetchRecommendations("u1")).resolves.toEqual([]);

    expect(api.get).toHaveBeenCalledWith("/api/Recommendation/me", undefined);
  });

  it("fetchRecommendations caches data for userId (hits Preferences + setItem)", async () => {
    const storage = require("@/src/utils/safeSecureStore");
    storage.getItem.mockResolvedValueOnce(null);
    storage.setItem.mockResolvedValueOnce(undefined);

    const api = (require("@/api/client").default ?? require("@/api/client")) as {
      get: jest.Mock;
    };

    api.get
      // recommendations
      .mockResolvedValueOnce({ data: [{ therapistId: 1, therapistName: "T", profilePictureUrl: null, matchScore: 1, tier: "Recommended", tierLabel: "x", breakdown: null }] })
      // preferences for hash
      .mockResolvedValueOnce({ data: {} });

    const svc = require("@/src/services/recommendations");
    const res = await svc.fetchRecommendations("u1");

    expect(res).toHaveLength(1);
    expect(api.get).toHaveBeenNthCalledWith(1, "/api/Recommendation/me", undefined);
    expect(api.get).toHaveBeenNthCalledWith(2, "/api/Preferences/me", undefined);
    expect(storage.setItem).toHaveBeenCalled();
  });

  it("getCachedRecommendations returns null on storage read error", async () => {
    const storage = require("@/src/utils/safeSecureStore");
    storage.getItem.mockRejectedValueOnce(new Error("boom"));

    const svc = require("@/src/services/recommendations");
    await expect(svc.getCachedRecommendations("u1")).resolves.toBeNull();
    expect(console.warn).toHaveBeenCalled();
  });
});

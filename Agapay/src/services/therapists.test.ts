import apiClient from "@/api/client";
import {
  fetchMyTherapist,
  fetchTherapistById,
  fetchTherapistByUserId,
  fetchTherapists,
} from "@/src/services/therapists";

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

describe("src/services/therapists", () => {
  const api = apiClient as unknown as {
    get: jest.Mock;
  };

  let logSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  describe("fetchTherapists", () => {
    it("passes paging params and normalizes legacy array responses", async () => {
      api.get.mockResolvedValueOnce({ data: [{ id: 1 }, { id: 2 }] });
      const res = await fetchTherapists(2, 10, "abc");
      expect(api.get).toHaveBeenCalledWith("/api/Therapist", {
        params: { status: "verified", page: 2, limit: 10, search: "abc" },
      });
      expect(res.items).toHaveLength(2);
      expect(res.totalPages).toBe(1);
    });

    it("normalizes paginated object response", async () => {
      api.get.mockResolvedValueOnce({
        data: {
          items: [{ id: 1 }],
          totalCount: 5,
          page: 1,
          pageSize: 10,
          totalPages: 1,
          hasNextPage: false,
          hasPreviousPage: false,
        },
      });
      const res = await fetchTherapists(1, 10);
      expect(res.totalCount).toBe(5);
      expect(res.items).toHaveLength(1);
    });
  });

  it("fetchTherapistById throws when therapistId missing", async () => {
    // @ts-expect-error test invalid input
    await expect(fetchTherapistById("")).rejects.toThrow("Therapist ID is required");
  });

  it("fetchTherapistByUserId normalizes casing and returns null on error", async () => {
    api.get.mockResolvedValueOnce({ data: { Id: 9, UserId: "u", Name: "N", LicenseNumber: "L" } });
    const ok = await fetchTherapistByUserId("u");
    expect(api.get).toHaveBeenCalledWith("/api/Therapist/by-user/u");
    expect(ok?.id).toBe(9);
    expect(ok?.userId).toBe("u");

    api.get.mockRejectedValueOnce(new Error("fail"));
    await expect(fetchTherapistByUserId("u")).resolves.toBeNull();
  });

  it("fetchMyTherapist returns null on failure", async () => {
    api.get.mockRejectedValueOnce(new Error("no"));
    await expect(fetchMyTherapist()).resolves.toBeNull();
  });
});

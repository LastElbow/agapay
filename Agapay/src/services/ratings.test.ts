import apiClient from "@/api/client";
import {
  fetchMyRatings,
  fetchTherapistRatings,
  fetchTherapistRatingsById,
  submitPatientRating,
  submitRating,
} from "@/src/services/ratings";

jest.mock("@/api/client", () => {
  const api = {
    get: jest.fn(),
    post: jest.fn(),
    defaults: { baseURL: "https://example.test/api", headers: { common: {} } },
  };
  return { __esModule: true, default: api };
});

describe("src/services/ratings", () => {
  const api = apiClient as unknown as {
    get: jest.Mock;
    post: jest.Mock;
  };

  let logSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
    warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("submitRating posts to /api/ratings", async () => {
    api.post.mockResolvedValueOnce({ status: 200, data: { ok: true } });

    const res = await submitRating({ TherapistId: 1, Score: 5, Comment: "x" });

    expect(api.post).toHaveBeenCalledWith("/api/ratings", {
      TherapistId: 1,
      Score: 5,
      Comment: "x",
    });
    expect(res.data.ok).toBe(true);
  });

  it("submitPatientRating posts to /api/ratings/patient", async () => {
    api.post.mockResolvedValueOnce({ status: 200, data: { ok: true } });

    await submitPatientRating({ PatientId: 9, Score: 4 });

    expect(api.post).toHaveBeenCalledWith("/api/ratings/patient", {
      PatientId: 9,
      Score: 4,
    });
  });

  it("fetchTherapistRatings gets /api/ratings/therapist/me", async () => {
    api.get.mockResolvedValueOnce({ status: 200, data: [{ id: 1 }] });

    await expect(fetchTherapistRatings()).resolves.toEqual([{ id: 1 }]);
    expect(api.get).toHaveBeenCalledWith("/api/ratings/therapist/me");
  });

  it("fetchTherapistRatingsById gets /api/ratings/therapist/{id}", async () => {
    api.get.mockResolvedValueOnce({ status: 200, data: [{ id: 1 }] });

    await expect(fetchTherapistRatingsById("123")).resolves.toEqual([{ id: 1 }]);
    expect(api.get).toHaveBeenCalledWith("/api/ratings/therapist/123");
  });

  describe("fetchMyRatings", () => {
    it("uses patient-specific endpoint when patientId provided", async () => {
      api.get.mockResolvedValueOnce({ data: [{ id: 1 }] });
      await expect(fetchMyRatings(7)).resolves.toEqual([{ id: 1 }]);
      expect(api.get).toHaveBeenCalledWith("/api/ratings/patient/7");
    });

    it("falls back to /api/ratings/patient when no patientId", async () => {
      api.get.mockResolvedValueOnce({ data: [{ id: 1 }] });
      await expect(fetchMyRatings()).resolves.toEqual([{ id: 1 }]);
      expect(api.get).toHaveBeenCalledWith("/api/ratings/patient");
    });

    it("extracts items from paginated object response", async () => {
      api.get.mockResolvedValueOnce({ data: { items: [{ id: 2 }] } });
      await expect(fetchMyRatings()).resolves.toEqual([{ id: 2 }]);
    });

    it("returns [] on non-array response", async () => {
      api.get.mockResolvedValueOnce({ data: { nope: true } });
      await expect(fetchMyRatings()).resolves.toEqual([]);
    });

    it("returns [] on API failure", async () => {
      api.get.mockRejectedValueOnce(new Error("fail"));
      await expect(fetchMyRatings()).resolves.toEqual([]);
      expect(console.warn).toHaveBeenCalled();
    });
  });
});

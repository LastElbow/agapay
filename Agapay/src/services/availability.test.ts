import apiClient from "@/api/client";
import {
  fetchAvailabilityScore,
  fetchBookedIntervals,
  fetchTherapistAvailability,
  upsertTherapistAvailability,
} from "@/src/services/availability";

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

describe("src/services/availability", () => {
  const api = apiClient as unknown as {
    get: jest.Mock;
    post: jest.Mock;
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("fetchTherapistAvailability returns [] when response is not array", async () => {
    api.get.mockResolvedValueOnce({ data: { items: [] } });
    await expect(fetchTherapistAvailability(1)).resolves.toEqual([]);
    expect(api.get).toHaveBeenCalledWith("/api/availability/therapist/1");
  });

  it("upsertTherapistAvailability POSTs payload", async () => {
    api.post.mockResolvedValueOnce({ data: { message: "ok" } });
    await expect(upsertTherapistAvailability(1, [{ dayOfWeek: 1, startTime: "09:00", endTime: "10:00" }])).resolves.toEqual({ message: "ok" });
    expect(api.post).toHaveBeenCalledWith(
      "/api/availability/therapist/1",
      [{ dayOfWeek: 1, startTime: "09:00", endTime: "10:00" }]
    );
  });

  it("fetchBookedIntervals passes from/to as query params and guards array", async () => {
    api.get.mockResolvedValueOnce({ data: "nope" });
    const res = await fetchBookedIntervals(2, "from", "to");
    expect(api.get).toHaveBeenCalledWith(
      "/api/availability/therapist/2/booked",
      { params: { from: "from", to: "to" } }
    );
    expect(res).toEqual([]);
  });

  it("fetchAvailabilityScore returns {score:0} on missing data", async () => {
    api.get.mockResolvedValueOnce({ data: null });
    await expect(fetchAvailabilityScore(1, 2)).resolves.toEqual({ score: 0 });
  });
});

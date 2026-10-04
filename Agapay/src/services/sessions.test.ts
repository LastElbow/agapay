import apiClient from "@/api/client";
import {
  acknowledgeCancellation,
  cancelSession,
  declineReschedule,
  fetchSessionLogs,
  fetchUpcomingSessions,
  requestCancellation,
} from "@/src/services/sessions";

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

jest.mock("@/src/features/sessions/core/requestBodies", () => {
  return {
    __esModule: true,
    buildCancelSessionBody: jest.fn(() => ({ built: "cancel" })),
    buildAcknowledgeCancellationBody: jest.fn(() => ({ built: "ack" })),
    buildDeclineRescheduleBody: jest.fn(() => ({ built: "decline" })),
  };
});

describe("src/services/sessions", () => {
  const api = apiClient as unknown as {
    get: jest.Mock;
    put: jest.Mock;
  };

  let logSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it("fetchUpcomingSessions returns [] for non-array", async () => {
    api.get.mockResolvedValueOnce({ data: { items: [] } });
    await expect(fetchUpcomingSessions()).resolves.toEqual([]);
    expect(api.get).toHaveBeenCalledWith("/api/sessions/me/upcoming", { params: { take: 5 } });
  });

  it("fetchSessionLogs returns [] for non-array", async () => {
    api.get.mockResolvedValueOnce({ data: { items: [] } });
    await expect(fetchSessionLogs(1)).resolves.toEqual([]);
    expect(api.get).toHaveBeenCalledWith("/api/sessions/1/logs");
  });

  it("cancelSession uses request body builder and PUTs to cancel endpoint", async () => {
    const bodies = require("@/src/features/sessions/core/requestBodies") as typeof import("@/src/features/sessions/core/requestBodies");
    api.put.mockResolvedValueOnce({ data: {} });

    await cancelSession(10, "reason");

    expect(bodies.buildCancelSessionBody).toHaveBeenCalled();
    expect(api.put).toHaveBeenCalledWith("/api/sessions/10/cancel", { built: "cancel" });
  });

  it("acknowledgeCancellation uses builder and PUTs to expected endpoint", async () => {
    const bodies = require("@/src/features/sessions/core/requestBodies") as typeof import("@/src/features/sessions/core/requestBodies");
    api.put.mockResolvedValueOnce({ data: {} });

    await acknowledgeCancellation(10, "s", "e");

    expect(bodies.buildAcknowledgeCancellationBody).toHaveBeenCalledWith({
      rescheduleStartAt: "s",
      rescheduleEndAt: "e",
    });
    expect(api.put).toHaveBeenCalledWith(
      "/api/sessions/10/acknowledge-cancellation",
      { built: "ack" }
    );
  });

  it("requestCancellation PUTs to expected endpoint", async () => {
    api.put.mockResolvedValueOnce({ data: {} });
    await requestCancellation(10, "x");
    expect(api.put).toHaveBeenCalledWith("/api/sessions/10/request-cancellation", { reason: "x" });
  });

  it("declineReschedule uses builder and PUTs to expected endpoint", async () => {
    const bodies = require("@/src/features/sessions/core/requestBodies") as typeof import("@/src/features/sessions/core/requestBodies");
    api.put.mockResolvedValueOnce({ data: {} });

    await declineReschedule(10, "no");

    expect(bodies.buildDeclineRescheduleBody).toHaveBeenCalledWith("no");
    expect(api.put).toHaveBeenCalledWith("/api/sessions/10/decline-reschedule", { built: "decline" });
  });
});

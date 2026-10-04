import {
  computeTherapistSessionBuckets,
  isTherapistSessionEditable,
  resolveTherapistSessionStatusDisplay,
} from "@/src/features/sessions/core/therapistSessionsModel";

describe("computeTherapistSessionBuckets", () => {
  it("excludes completed/terminated contracts from upcoming", () => {
    const buckets = computeTherapistSessionBuckets({
      sessions: [{ id: 1, startAt: "2026-01-01T00:00:00Z" }],
      upcomingSessions: [
        {
          id: 2,
          startAt: "2026-01-02T00:00:00Z",
          contractStatus: "completed",
        },
        {
          id: 3,
          startAt: "2026-01-03T00:00:00Z",
          contractStatus: "terminated",
        },
        { id: 4, startAt: "2026-01-04T00:00:00Z", contractStatus: "active" },
      ],
    });

    expect(buckets.upcomingSessions.map((s) => s.id)).toEqual([4]);
  });

  it("moves rescheduled/reliever-proposed upcoming sessions into rescheduled bucket", () => {
    const buckets = computeTherapistSessionBuckets({
      sessions: [],
      upcomingSessions: [
        { id: 10, startAt: "2026-01-01T00:00:00Z", isRescheduled: true },
        { id: 11, startAt: "2026-01-01T00:00:00Z", isRelieverProposed: true },
        { id: 12, startAt: "2026-01-01T00:00:00Z" },
      ],
    });

    expect(buckets.rescheduledSessions.map((s) => s.id).sort()).toEqual([10, 11]);
    expect(buckets.upcomingSessions.map((s) => s.id)).toEqual([12]);
  });

  it("history excludes anything in upcoming or rescheduled", () => {
    const buckets = computeTherapistSessionBuckets({
      sessions: [
        { id: 100, startAt: "2026-01-01T00:00:00Z" },
        { id: 101, startAt: "2026-01-01T00:00:00Z" },
        { id: 102, startAt: "2026-01-01T00:00:00Z" },
      ],
      upcomingSessions: [
        { id: 100, startAt: "2026-01-01T00:00:00Z" },
        { id: 101, startAt: "2026-01-01T00:00:00Z", isRescheduled: true },
      ],
    });

    expect(buckets.historySessions.map((s) => s.id)).toEqual([102]);
  });
});

describe("resolveTherapistSessionStatusDisplay", () => {
  it("prefers contract status (completed)", () => {
    const display = resolveTherapistSessionStatusDisplay({
      contractStatus: "completed",
      sessionStatus: "cancelled",
      startAtIso: "2026-01-01T00:00:00Z",
    });
    expect(display.label).toBe("Contract Completed");
  });

  it("maps scheduled sessions in the past to Concluded", () => {
    const display = resolveTherapistSessionStatusDisplay({
      contractStatus: "active",
      sessionStatus: "scheduled",
      startAtIso: "2026-01-01T00:00:00Z",
      now: new Date("2026-01-02T00:00:00Z"),
    });
    expect(display.label).toBe("Concluded");
  });

  it("maps scheduled sessions in the future to Active", () => {
    const display = resolveTherapistSessionStatusDisplay({
      sessionStatus: "scheduled",
      startAtIso: "2026-01-03T00:00:00Z",
      now: new Date("2026-01-02T00:00:00Z"),
    });
    expect(display.label).toBe("Active");
  });

  it("maps donefortoday to Done for today", () => {
    const display = resolveTherapistSessionStatusDisplay({ sessionStatus: "donefortoday" });
    expect(display.label).toBe("Done for today");
  });

  it("maps cancelled/canceled to red status", () => {
    const display1 = resolveTherapistSessionStatusDisplay({ sessionStatus: "cancelled" });
    const display2 = resolveTherapistSessionStatusDisplay({ sessionStatus: "canceled" });
    expect(display1.label).toBe("Cancelled");
    expect(display2.label).toBe("Canceled");
  });
});

describe("isTherapistSessionEditable", () => {
  it("is false when contract is completed", () => {
    expect(
      isTherapistSessionEditable({
        contractStatus: "completed",
        sessionStatus: "scheduled",
      }),
    ).toBe(false);
  });

  it("is false when session is cancelled", () => {
    expect(
      isTherapistSessionEditable({
        contractStatus: "active",
        sessionStatus: "cancelled",
      }),
    ).toBe(false);
  });

  it("is true for active scheduled sessions", () => {
    expect(
      isTherapistSessionEditable({
        contractStatus: "active",
        sessionStatus: "scheduled",
      }),
    ).toBe(true);
  });
});

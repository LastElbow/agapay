import { getUserFacingSessionsErrorMessage } from "@/src/features/sessions/core/userFacingErrors";

describe("getUserFacingSessionsErrorMessage", () => {
  it("returns a network-friendly message", () => {
    expect(getUserFacingSessionsErrorMessage({ message: "Network Error", code: "ERR_NETWORK" })).toMatch(
      /internet connection/i,
    );
  });

  it("maps 404 to not-found", () => {
    expect(getUserFacingSessionsErrorMessage({ response: { status: 404 } })).toMatch(/could not find/i);
  });

  it("maps 401 to sign-in", () => {
    expect(getUserFacingSessionsErrorMessage({ response: { status: 401 } })).toMatch(/sign in/i);
  });

  it("maps 500 to server error", () => {
    expect(getUserFacingSessionsErrorMessage({ response: { status: 500 } })).toMatch(/server error/i);
  });

  it("falls back to generic message", () => {
    expect(getUserFacingSessionsErrorMessage(new Error("boom"))).toMatch(/something went wrong/i);
  });
});

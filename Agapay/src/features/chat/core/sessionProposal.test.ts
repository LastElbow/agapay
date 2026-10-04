import {
  SESSION_PROPOSAL_MARKER,
  SESSION_PROPOSAL_RESPONSE_MARKER,
  buildSessionProposalChatContent,
  extractJsonObjectAfterMarker,
  extractSessionProposalDisplayText,
  normalizeContractStatus,
  parseSessionProposalFromContent,
  parseSessionProposalResponse,
  pickFirstPendingProposal,
} from "./sessionProposal";

describe("sessionProposal core", () => {
  describe("extractJsonObjectAfterMarker", () => {
    it("returns null when marker missing", () => {
      expect(extractJsonObjectAfterMarker("hi", SESSION_PROPOSAL_MARKER)).toBeNull();
    });

    it("extracts JSON object after marker", () => {
      const content = `${SESSION_PROPOSAL_MARKER}{"contractId":123,"caseTitle":"x"}\nhello`;
      expect(extractJsonObjectAfterMarker(content, SESSION_PROPOSAL_MARKER)).toBe(
        '{"contractId":123,"caseTitle":"x"}',
      );
    });

    it("handles braces inside quoted strings", () => {
      const content =
        `${SESSION_PROPOSAL_MARKER}` +
        '{"contractId":1,"caseTitle":"brace } in string { ok"}' +
        "\nrest";
      expect(extractJsonObjectAfterMarker(content, SESSION_PROPOSAL_MARKER)).toBe(
        '{"contractId":1,"caseTitle":"brace } in string { ok"}',
      );
    });

    it("handles escaped quotes", () => {
      const content =
        `${SESSION_PROPOSAL_MARKER}` +
        '{"contractId":1,"caseTitle":"say \\\"hi\\\""}' +
        "\nrest";
      expect(extractJsonObjectAfterMarker(content, SESSION_PROPOSAL_MARKER)).toBe(
        '{"contractId":1,"caseTitle":"say \\\"hi\\\""}',
      );
    });

    it("returns null when JSON is incomplete", () => {
      const content = `${SESSION_PROPOSAL_MARKER}{"contractId":1`;
      expect(extractJsonObjectAfterMarker(content, SESSION_PROPOSAL_MARKER)).toBeNull();
    });
  });

  describe("parseSessionProposalFromContent", () => {
    it("returns null for invalid JSON", () => {
      const content = `${SESSION_PROPOSAL_MARKER}{not json}\ntext`;
      expect(parseSessionProposalFromContent(content)).toBeNull();
    });

    it("returns null when contractId missing", () => {
      const content = `${SESSION_PROPOSAL_MARKER}{"caseTitle":"x"}\ntext`;
      expect(parseSessionProposalFromContent(content)).toBeNull();
    });

    it("parses minimal proposal", () => {
      const content = `${SESSION_PROPOSAL_MARKER}{"contractId":10}\ntext`;
      expect(parseSessionProposalFromContent(content)).toEqual({
        contractId: 10,
        caseTitle: null,
        day: null,
        timeRange: null,
        total: null,
      });
    });
  });

  describe("buildSessionProposalChatContent + extractSessionProposalDisplayText", () => {
    it("builds content with marker + json + user-friendly message", () => {
      const built = buildSessionProposalChatContent({
        contractId: 7,
        caseTitle: "Neuro",
        day: "Monday",
        timeRange: "10:00-11:00",
        total: "₱1500.00",
      });
      expect(built.startsWith(SESSION_PROPOSAL_MARKER)).toBe(true);
      expect(built).toContain("\n📅 New Session Proposal");
    });

    it("extracts display text even if only json line exists", () => {
      const content = `${SESSION_PROPOSAL_MARKER}{"contractId":1,"caseTitle":"x"}`;
      const text = extractSessionProposalDisplayText(content);
      expect(text).toContain("New Session Proposal");
    });

    it("returns null for non-proposal messages", () => {
      expect(extractSessionProposalDisplayText("hello")).toBeNull();
    });
  });

  describe("parseSessionProposalResponse", () => {
    it("parses response marker", () => {
      const content = `${SESSION_PROPOSAL_RESPONSE_MARKER} 123 accepted`;
      expect(parseSessionProposalResponse(content)).toEqual({
        contractId: 123,
        status: "accepted",
      });
    });

    it("returns null when malformed", () => {
      expect(parseSessionProposalResponse(`${SESSION_PROPOSAL_RESPONSE_MARKER} nope`)).toBeNull();
    });
  });

  describe("normalizeContractStatus", () => {
    it.each([
      ["PendingConfirmation", "pending"],
      ["pending", "pending"],
      ["Active", "confirmed"],
      ["confirmed", "confirmed"],
      ["cancelled", "declined"],
      ["canceled", "declined"],
      ["declined", "declined"],
      ["deleted", "declined"],
      ["", "other"],
      [null, "other"],
      ["weird", "other"],
    ])("%p -> %p", (input, expected) => {
      expect(normalizeContractStatus(input)).toBe(expected as any);
    });
  });

  describe("pickFirstPendingProposal", () => {
    it("picks the first pending proposal that is not dismissed", () => {
      const m1 = { content: "hello" };
      const m2 = { content: `${SESSION_PROPOSAL_MARKER}{"contractId":1}` };
      const m3 = { content: `${SESSION_PROPOSAL_MARKER}{"contractId":2}` };

      const statusBy = new Map<any, any>([
        [1, "confirmed"],
        [2, "pendingconfirmation"],
      ]);

      const picked = pickFirstPendingProposal([m1, m2, m3], {
        dismissedContractIds: new Set(["999"]),
        statusByContractId: statusBy,
      });

      expect(picked?.contractId).toBe(2);
    });

    it("skips dismissed contract id", () => {
      const m = { content: `${SESSION_PROPOSAL_MARKER}{"contractId":2}` };
      const statusBy = new Map<any, any>([[2, "pending"]]);

      const picked = pickFirstPendingProposal([m], {
        dismissedContractIds: new Set([2]),
        statusByContractId: statusBy,
      });

      expect(picked).toBeNull();
    });

    it("skips proposals that are not pending", () => {
      const m = { content: `${SESSION_PROPOSAL_MARKER}{"contractId":2}` };
      const statusBy = new Map<any, any>([[2, "active"]]);

      const picked = pickFirstPendingProposal([m], {
        statusByContractId: statusBy,
      });

      expect(picked).toBeNull();
    });
  });
});

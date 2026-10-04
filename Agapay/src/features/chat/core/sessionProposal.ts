export const SESSION_PROPOSAL_MARKER = "[SESSION_PROPOSAL] ";
export const SESSION_PROPOSAL_RESPONSE_MARKER = "[SESSION_PROPOSAL_RESPONSE]";

export type SessionProposal = {
  contractId: number | string;
  caseTitle?: string | null;
  day?: string | null;
  timeRange?: string | null;
  total?: string | null;
};

export type ProposalResponse = {
  contractId: number;
  status: "accepted" | "confirmed" | "declined" | string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/**
 * Extracts the first JSON object immediately after a marker.
 * Uses a brace-matching scan that is safe with quoted strings and escapes.
 */
export function extractJsonObjectAfterMarker(
  content: string,
  marker: string,
): string | null {
  if (!content) return null;
  const startIdx = content.indexOf(marker);
  if (startIdx === -1) return null;

  const jsonStart = startIdx + marker.length;

  let braceCount = 0;
  let jsonEnd = -1;
  let inString = false;
  let escapeNext = false;

  for (let i = jsonStart; i < content.length; i++) {
    const char = content[i];

    if (escapeNext) {
      escapeNext = false;
      continue;
    }

    if (char === "\\" && inString) {
      escapeNext = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (!inString) {
      if (char === "{") {
        braceCount++;
      } else if (char === "}") {
        braceCount--;
        if (braceCount === 0) {
          jsonEnd = i + 1;
          break;
        }
      }
    }
  }

  if (jsonEnd === -1) return null;

  const jsonStr = content.substring(jsonStart, jsonEnd).trim();
  if (!jsonStr.startsWith("{") || !jsonStr.endsWith("}")) return null;
  return jsonStr;
}

export function parseSessionProposalFromContent(content: string): SessionProposal | null {
  try {
    const jsonStr = extractJsonObjectAfterMarker(content, SESSION_PROPOSAL_MARKER);
    if (!jsonStr) return null;

    const parsed = JSON.parse(jsonStr) as unknown;
    if (!isRecord(parsed)) return null;

    const contractId = parsed.contractId;
    if (contractId == null) return null;

    const proposal: SessionProposal = {
      contractId: contractId as any,
      caseTitle: (parsed.caseTitle as any) ?? null,
      day: (parsed.day as any) ?? null,
      timeRange: (parsed.timeRange as any) ?? null,
      total: (parsed.total as any) ?? null,
    };

    return proposal;
  } catch {
    return null;
  }
}

export function formatSessionProposalUserFriendlyMessage(proposal: SessionProposal): string {
  const caseTitle = proposal.caseTitle || "Therapy Session";
  const day = proposal.day || "TBD";
  const timeRange = proposal.timeRange || "TBD";
  const total = proposal.total || "₱0.00";

  return (
    `📅 New Session Proposal\n\n` +
    `🩺 ${caseTitle}\n` +
    `📆 ${day}\n` +
    `⏰ ${timeRange}\n` +
    `💰 Total: ${total}\n\n` +
    `Please review and respond to this proposal.`
  );
}

export function buildSessionProposalChatContent(proposal: SessionProposal): string {
  const userFriendlyMessage = formatSessionProposalUserFriendlyMessage(proposal);
  return `${SESSION_PROPOSAL_MARKER}${JSON.stringify(proposal)}\n${userFriendlyMessage}`;
}

/**
 * Returns the text that should be displayed in a normal chat bubble for a session proposal message.
 */
export function extractSessionProposalDisplayText(content: string): string | null {
  if (!content || !content.includes(SESSION_PROPOSAL_MARKER.trim())) return null;

  const proposal = parseSessionProposalFromContent(content);
  if (proposal) {
    // Prefer reconstructing from JSON, since the remainder may be missing or malformed.
    return formatSessionProposalUserFriendlyMessage(proposal);
  }

  // Our generated format always puts user-friendly text after the JSON line.
  const parts = content.split("\n");
  if (parts.length <= 1) {
    return "📅 Session Proposal\n\nPlease check the proposal details above.";
  }

  // Fallback: attempt to strip the JSON header line.
  const remainder = parts.slice(1).join("\n").trim();
  return remainder || "📅 Session Proposal\n\nPlease check the proposal details above.";
}

export function parseSessionProposalResponse(content: string): ProposalResponse | null {
  if (!content || !content.includes(SESSION_PROPOSAL_RESPONSE_MARKER)) return null;

  // Format used in ChatItem: [SESSION_PROPOSAL_RESPONSE] <contractId> <status>
  const match = content.match(/\[SESSION_PROPOSAL_RESPONSE\]\s*(\d+)\s*(\w+)/);
  if (!match) return null;

  const contractId = Number(match[1]);
  if (!Number.isFinite(contractId)) return null;

  const status = String(match[2] ?? "").trim();
  if (!status) return null;

  return { contractId, status: status.toLowerCase() };
}

export type NormalizedContractStatus = "pending" | "confirmed" | "declined" | "other";

export function normalizeContractStatus(raw: unknown): NormalizedContractStatus {
  const status = String(raw ?? "").trim().toLowerCase();

  if (!status) return "other";

  if (status === "pendingconfirmation" || status === "pending") return "pending";
  if (status === "active" || status === "confirmed") return "confirmed";
  if (status === "declined" || status === "cancelled" || status === "canceled" || status === "deleted")
    return "declined";

  return "other";
}

export type PendingProposalPick = {
  proposal: SessionProposal;
  contractId: string | number;
};

/**
 * Pure helper: given messages ordered newest→oldest and already-known contract statuses,
 * returns the first proposal still pending that is not dismissed.
 */
export function pickFirstPendingProposal(
  messages: { content?: string | null }[],
  options: {
    dismissedContractIds?: Set<string | number>;
    statusByContractId: Map<string | number, unknown>;
  },
): PendingProposalPick | null {
  const dismissed = options.dismissedContractIds ?? new Set();

  for (const msg of messages) {
    const content = msg.content ?? "";
    if (!content.includes(SESSION_PROPOSAL_MARKER.trim())) continue;

    const proposal = parseSessionProposalFromContent(content);
    if (!proposal) continue;

    const cid = proposal.contractId;
    if (cid == null) continue;

    if (dismissed.has(cid)) continue;

    const rawStatus = options.statusByContractId.get(cid);
    const normalized = normalizeContractStatus(rawStatus);

    if (normalized === "pending") {
      return { proposal, contractId: cid };
    }
  }

  return null;
}

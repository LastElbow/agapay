export type TherapistSessionLike = {
  id: number;
  startAt: string;
  status?: string | null;
  contractStatus?: string | null;
  isRescheduled?: boolean | null;
  isRelieverProposed?: boolean | null;
};

export type TherapistSessionBuckets<T extends TherapistSessionLike> = {
  upcomingSessions: T[];
  rescheduledSessions: T[];
  historySessions: T[];
};

function normalizeLower(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

export function computeTherapistSessionBuckets<T extends TherapistSessionLike>(input: {
  sessions: readonly T[];
  upcomingSessions: readonly T[];
}): TherapistSessionBuckets<T> {
  const sessions = Array.isArray(input.sessions) ? input.sessions : [];
  const upcoming = Array.isArray(input.upcomingSessions) ? input.upcomingSessions : [];

  const activeUpcoming = upcoming.filter((session) => {
    const contractStatus = normalizeLower(session.contractStatus);
    if (contractStatus === "completed" || contractStatus === "terminated") return false;
    return true;
  });

  const rescheduledSessions = activeUpcoming.filter(
    (session) => session.isRescheduled === true || session.isRelieverProposed === true,
  );

  const rescheduledIds = new Set(rescheduledSessions.map((s) => s.id));

  const upcomingSessions = activeUpcoming.filter((session) => !rescheduledIds.has(session.id));

  const upcomingIds = new Set(upcomingSessions.map((s) => s.id));

  const historySessions = sessions.filter(
    (session) => !upcomingIds.has(session.id) && !rescheduledIds.has(session.id),
  );

  return {
    upcomingSessions,
    rescheduledSessions,
    historySessions,
  };
}

export type TherapistSessionStatusDisplay = {
  label: string;
  badgeClass: string;
};

export function isTherapistSessionEditable(input: {
  contractStatus?: string | null;
  sessionStatus?: string | null;
}): boolean {
  const normalizedContractStatus = normalizeLower(input.contractStatus);
  const normalizedSessionStatus = normalizeLower(input.sessionStatus);

  const isContractEnded =
    normalizedContractStatus === "completed" ||
    normalizedContractStatus === "terminated";

  const isSessionFinal =
    normalizedSessionStatus === "completed" ||
    normalizedSessionStatus === "terminated" ||
    normalizedSessionStatus === "cancelled" ||
    normalizedSessionStatus === "canceled";

  return !isContractEnded && !isSessionFinal;
}

export function resolveTherapistSessionStatusDisplay(input: {
  contractStatus?: string | null;
  sessionStatus?: string | null;
  startAtIso?: string | null;
  now?: Date;
}): TherapistSessionStatusDisplay {
  const contractStatus = normalizeLower(input.contractStatus);
  const baseStatus = normalizeLower(input.sessionStatus);

  const titleize = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

  // Contract status overrides
  if (contractStatus === "completed") {
    return { label: "Contract Completed", badgeClass: "bg-green-100 text-green-800" };
  }
  if (contractStatus === "terminated") {
    return { label: "Discontinued", badgeClass: "bg-gray-100 text-gray-800" };
  }
  if (contractStatus === "pendingconfirmation") {
    return { label: "Pending Confirmation", badgeClass: "bg-amber-100 text-amber-800" };
  }

  // Explicitly surface Active sessions
  if (baseStatus === "active") {
    return { label: "Active", badgeClass: "bg-emerald-100 text-emerald-800" };
  }

  const now = input.now ?? new Date();
  const sessionStartDate = input.startAtIso ? new Date(input.startAtIso) : new Date("invalid");

  if (baseStatus === "scheduled" && Number.isFinite(sessionStartDate.getTime()) && sessionStartDate < now) {
    return { label: "Concluded", badgeClass: "bg-gray-200 text-gray-800" };
  }

  if (baseStatus === "terminated") {
    return { label: "Discontinued", badgeClass: "bg-red-100 text-red-800" };
  }

  if (baseStatus === "completed") {
    return { label: "Completed", badgeClass: "bg-green-100 text-green-800" };
  }

  if (baseStatus === "donefortoday") {
    return { label: "Done for today", badgeClass: "bg-gray-100 text-gray-800" };
  }

  if (baseStatus === "cancelled" || baseStatus === "canceled") {
    return { label: titleize(baseStatus), badgeClass: "bg-red-100 text-red-800" };
  }

  const label = baseStatus ? titleize(baseStatus) : "Active";
  return {
    label: label === "Scheduled" ? "Active" : label,
    badgeClass: "bg-emerald-100 text-emerald-800",
  };
}

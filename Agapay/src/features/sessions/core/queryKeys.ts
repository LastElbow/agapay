export const upcomingSessionsQueryKey = ["sessions", "upcoming"] as const;
export const patientUpcomingSessionsQueryKey = ["sessions", "patient", "upcoming"] as const;
export const therapistSessionsQueryKey = ["sessions", "therapist", "all"] as const;
export const allSessionsQueryKey = ["sessions", "all"] as const;
export const unreviewedContractsQueryKey = ["contracts", "unreviewed"] as const;
export const unreviewedSessionsQueryKey = ["sessions", "unreviewed"] as const;

export const sessionDetailQueryKey = (sessionId: number) =>
  ["sessions", "detail", sessionId] as const;

export const sessionLogsQueryKey = (sessionId: number) =>
  ["sessions", "logs", sessionId] as const;

export const patientSessionsQueryKey = (patientUserId: string) =>
  ["sessions", "by-patient-user", patientUserId] as const;

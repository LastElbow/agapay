import apiClient from "@/api/client";
import {
  buildAcknowledgeCancellationBody,
  buildCancelSessionBody,
  buildDeclineRescheduleBody,
} from "@/src/features/sessions/core/requestBodies";

export {
  upcomingSessionsQueryKey,
  patientUpcomingSessionsQueryKey,
  therapistSessionsQueryKey,
  allSessionsQueryKey,
  unreviewedContractsQueryKey,
  unreviewedSessionsQueryKey,
  sessionDetailQueryKey,
  sessionLogsQueryKey,
  patientSessionsQueryKey,
} from "@/src/features/sessions/core/queryKeys";

export type SessionSummary = {
  id: number;
  contractId: number;
  patientId: number;
  patientName?: string | null;
  physicalTherapistId: number;
  therapistName?: string | null;
  therapistProfilePictureUrl?: string | null;
  startAt: string;
  endAt: string;
  durationMinutes: number;
  status: string;
  contractStatus?: string | null;
  conditionCase?: string | null;
  locationAddress?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  totalFee: number;
  patientFee: number;
  professionalFee?: number | null;
  locationFee?: number | null;
  miscellaneousFee?: number | null;
  isRescheduled?: boolean;
  rescheduledAt?: string | null;
  proposedRescheduleStartAt?: string | null;
  proposedRescheduleEndAt?: string | null;
  rescheduleProposalReason?: string | null;
  rescheduleProposedAt?: string | null;
  relieverTherapistId?: number | null;
  relieverSubstitutionReason?: string | null;
  isRelieverProposed?: boolean;
};

export type SessionDetail = {
  id: number;
  patientId: number;
  patientName?: string | null;
  physicalTherapistId: number;
  therapistName?: string | null;
  therapistLicenseNo?: string | null;
  // Reliever session detection: true if session therapist differs from contract owner
  isRelieverSession?: boolean;
  originalTherapistId?: number | null;
  contractId: number;
  contractStatus?: string | null;
  contractEndDate?: string | null;
  contractEndReason?: string | null;
  contractEndedAt?: string | null;
  startAt: string;
  endAt: string;
  durationMinutes: number;
  locationAddress?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  patientAddress?: string | null;
  patientBarangay?: string | null;
  patientLatitude?: number | null;
  patientLongitude?: number | null;
  // Therapist's pinned location from their profile
  therapistAddress?: string | null;
  therapistBarangay?: string | null;
  therapistLatitude?: number | null;
  therapistLongitude?: number | null;
  effectiveAddress?: string | null;
  effectiveLatitude?: number | null;
  effectiveLongitude?: number | null;
  doctorReferralImageUrl?: string | null;
  totalFee: number;
  patientFee: number;
  conditionCase?: string | null;
  professionalFee?: number | null;
  locationFee?: number | null;
  miscellaneousFee?: number | null;
  status: string;
  cancellationReason?: string | null;
  cancelledBy?: string | null;
  createdAt: string;
  detailsProposedAt?: string | null;
  detailsConfirmedAt?: string | null;
  isAwaitingPatientConfirmation?: boolean;
  isPendingCancellation?: boolean;
  isCancellationAcknowledged?: boolean;
  patientCancellationReason?: string | null;
  cancellationRequestedAt?: string | null;
  isRescheduled?: boolean;
  rescheduledAt?: string | null;
  hasBeenRatedByPatient?: boolean;
  hasBeenRatedByTherapist?: boolean;
  proposedRescheduleStartAt?: string | null;
  proposedRescheduleEndAt?: string | null;
  rescheduleProposalReason?: string | null;
  rescheduleProposedAt?: string | null;
  relieverTherapistId?: number | null;
  relieverTherapistName?: string | null;
  relieverTherapistSpecialty?: string | null;
  relieverSubstitutionReason?: string | null;
  isRelieverProposed?: boolean;
};

export type CancelledSessionEntry = {
  sessionId: number;
  startAt: string;
  endAt: string;
  conditionCase?: string | null;
  cancelledBy?: string | null;
  cancelledAt?: string | null;
};

export type PatientCancellationHistory = {
  totalCancelled: number;
  cancelledByPatient: number;
  cancelledByTherapist: number;
  items: CancelledSessionEntry[];
};



export type ContractSummary = {
  id: number;
  patientId: number;
  physicalTherapistId: number;
  therapistName?: string | null;
  therapistProfilePictureUrl?: string | null;
  startDate: string;
  endDate: string;
  status: string;
  caseToTreat?: string | null;
};

export async function fetchUpcomingSessions(take = 5): Promise<SessionSummary[]> {
  const params = take > 0 ? { take } : undefined;
  console.log("[fetchUpcomingSessions] Calling /api/sessions/me/upcoming with params:", params);
  const res = await apiClient.get("/api/sessions/me/upcoming", { params });
  const data = res?.data;
  console.log("[fetchUpcomingSessions] API response:", JSON.stringify(data, null, 2));
  if (!Array.isArray(data)) return [];
  return data as SessionSummary[];
}

export async function fetchAllSessions(): Promise<SessionSummary[]> {
  console.log("[fetchAllSessions] Calling /api/sessions/me");
  const res = await apiClient.get("/api/sessions/me");
  const data = res?.data;
  console.log("[fetchAllSessions] API response:", JSON.stringify(data, null, 2));
  if (!Array.isArray(data)) return [];
  return data as SessionSummary[];
}

export async function fetchUnreviewedContracts(): Promise<ContractSummary[]> {
  const res = await apiClient.get("/api/contracts/me/unreviewed");
  const data = res?.data;
  if (!Array.isArray(data)) return [];
  return data as ContractSummary[];
}

export type RelieverProposal = {
  id: number;
  contractId: number;
  patientId: number;
  patientName?: string | null;
  originalTherapistId: number;
  originalTherapistName?: string | null;
  proposedRescheduleStartAt?: string | null;
  proposedRescheduleEndAt?: string | null;
  rescheduleProposalReason?: string | null;
  relieverSubstitutionReason?: string | null;
  rescheduleProposedAt?: string | null;
  locationAddress?: string | null;
  conditionCase?: string | null;
  totalFee: number;
  status: string;
};

export async function fetchRelieverProposals(): Promise<RelieverProposal[]> {
  try {
    console.log('[fetchRelieverProposals] Fetching from /api/sessions/reliever-proposals...');
    const res = await apiClient.get("/api/sessions/reliever-proposals");
    console.log('[fetchRelieverProposals] Status:', res.status);
    console.log('[fetchRelieverProposals] Response data:', JSON.stringify(res.data, null, 2));
    console.log('[fetchRelieverProposals] Response data type:', typeof res.data);
    console.log('[fetchRelieverProposals] Is array?:', Array.isArray(res.data));

    const data = res?.data;
    if (!Array.isArray(data)) {
      console.warn('[fetchRelieverProposals] Data is not an array! Type:', typeof data, 'Value:', data);
      return [];
    }

    console.log('[fetchRelieverProposals] Returning', data.length, 'proposals');
    if (data.length > 0) {
      console.log('[fetchRelieverProposals] First proposal:', JSON.stringify(data[0], null, 2));
    }

    return data as RelieverProposal[];
  } catch (error: any) {
    console.error('[fetchRelieverProposals] Error:', error);
    console.error('[fetchRelieverProposals] Error message:', error?.message);
    console.error('[fetchRelieverProposals] Error response:', error?.response?.data);
    throw error;
  }
}

export async function fetchSessionDetail(
  sessionId: number
): Promise<SessionDetail> {
  const res = await apiClient.get(`/api/sessions/${sessionId}`);
  return res.data as SessionDetail;
}

export type CreateSessionRequest = {
  TherapistId: number;
  ContractId: number;
  StartAt: string; // ISO UTC
  EndAt: string; // ISO UTC
  LocationAddress?: string | null;
  Latitude?: number | null;
  Longitude?: number | null;
};

export async function createSession(body: CreateSessionRequest) {
  return apiClient.post(`/api/sessions`, body);
}

export async function cancelSession(
  sessionId: number,
  reason: string,
  proposedRescheduleStartAt?: Date | null,
  proposedRescheduleEndAt?: Date | null,
  relieverTherapistId?: number | null,
  relieverSubstitutionReason?: string | null
) {
  const body = buildCancelSessionBody({
    reason,
    proposedRescheduleStartAt,
    proposedRescheduleEndAt,
    relieverTherapistId,
    relieverSubstitutionReason,
  });

  console.log("[cancelSession] Request body:", JSON.stringify(body, null, 2));
  console.log("[cancelSession] POST to:", `/api/sessions/${sessionId}/cancel`);

  const response = await apiClient.put(`/api/sessions/${sessionId}/cancel`, body);
  console.log("[cancelSession] Response:", response.data);
  return response;
}

/**
 * Patient requests cancellation - session goes to PendingCancellation status
 * and waits for therapist review before being cancelled.
 */
export async function requestCancellation(sessionId: number, reason: string) {
  return apiClient.put(`/api/sessions/${sessionId}/request-cancellation`, { reason });
}

/**
 * Therapist acknowledges and finalizes a patient's cancellation request.
 * Optionally provides a reschedule date.
 */
export async function acknowledgeCancellation(
  sessionId: number,
  rescheduleStartAt?: string | null,
  rescheduleEndAt?: string | null
) {
  const body = buildAcknowledgeCancellationBody({ rescheduleStartAt, rescheduleEndAt });
  return apiClient.put(`/api/sessions/${sessionId}/acknowledge-cancellation`, body);
}

/**
 * Patient approves therapist's reschedule proposal
 */
export async function approveReschedule(sessionId: number) {
  return apiClient.put(`/api/sessions/${sessionId}/approve-reschedule`, {});
}

/**
 * Patient declines therapist's reschedule proposal, cancelling the session
 */
export async function declineReschedule(sessionId: number, reason?: string | null) {
  const body = buildDeclineRescheduleBody(reason);
  return apiClient.put(`/api/sessions/${sessionId}/decline-reschedule`, body);
}



/**
 * Reliever therapist accepts the substitution request
 * After acceptance, patient will be notified about the reschedule with substitute therapist
 */
export async function acceptRelieverProposal(sessionId: number) {
  return apiClient.post(`/api/sessions/${sessionId}/reliever/accept`, {});
}

/**
 * Reliever therapist declines the substitution request
 * Original therapist will be notified to find another solution
 */
export async function declineRelieverProposal(sessionId: number) {
  return apiClient.post(`/api/sessions/${sessionId}/reliever/decline`, {});
}

export async function startSession(sessionId: number) {
  return apiClient.put(`/api/contracts/sessions/${sessionId}/start`);
}

export async function completeSession(sessionId: number) {
  return apiClient.put(`/api/contracts/sessions/${sessionId}/complete`);
}

export async function logTodaySession(sessionId: number, startTime: string, endTime: string) {
  return apiClient.post(`/api/sessions/${sessionId}/log-today`, {
    startTime,
    endTime,
  });
}

export async function markAsDone(sessionId: number) {
  return apiClient.put(`/api/sessions/${sessionId}/mark-as-done`);
}

export type SessionLog = {
  id: number;
  startTime: string;
  endTime: string;
  date: string;
  durationMinutes: number;
};

export async function fetchSessionLogs(sessionId: number): Promise<SessionLog[]> {
  const res = await apiClient.get(`/api/sessions/${sessionId}/logs`);
  const data = res?.data;
  if (!Array.isArray(data)) return [];
  return data as SessionLog[];
}

export type RescheduleSessionRequest = {
  NewStartAt: string; // ISO UTC
  NewEndAt: string;   // ISO UTC
};

export type RescheduleSessionResponse = {
  message: string;
  sessionId: number;
  newStartAt: string;
  newEndAt: string;
  status: string;
};

export async function rescheduleSession(
  sessionId: number,
  body: RescheduleSessionRequest
): Promise<RescheduleSessionResponse> {
  const res = await apiClient.put(`/api/sessions/${sessionId}/reschedule`, body);
  return res.data as RescheduleSessionResponse;
}

export async function fetchSessionsByPatientUser(
  patientUserId: string
): Promise<SessionSummary[]> {
  const res = await apiClient.get(`/api/sessions/by-patient-user/${patientUserId}`);
  const data = res?.data;
  if (!Array.isArray(data)) return [];
  return data as SessionSummary[];
}

export async function fetchPatientCancellationHistory(
  patientProfileId: number
): Promise<PatientCancellationHistory> {
  const res = await apiClient.get(
    `/api/patient/profiles/${patientProfileId}/cancellation-history`
  );
  const data = res?.data;
  // Defensive defaults
  return {
    totalCancelled: Number(data?.totalCancelled ?? 0),
    cancelledByPatient: Number(data?.cancelledByPatient ?? 0),
    cancelledByTherapist: Number(data?.cancelledByTherapist ?? 0),
    items: Array.isArray(data?.items) ? (data.items as CancelledSessionEntry[]) : [],
  };
}

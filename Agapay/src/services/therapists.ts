import apiClient from "@/api/client";

// Scope the cache to verified-only since patient directory should show verified therapists only
export const THERAPISTS_QUERY_KEY = ["therapists", "verified"] as const;

export type TherapistListItem = {
  id: number;
  userId?: string | null;
  name?: string;
  profilePictureUrl?: string | null;
  licenseNumber?: string | null;
  gender?: string | null;
  averageRating?: number | null;
  ratingCount?: number | null;
  feePerSession?: number | null;
  specializations?: string[] | null;
  serviceAreas?: string[] | null;
  isOnboardingComplete?: boolean | null;
  verificationStatus?: "Pending" | "Verified" | "Rejected" | null;
};

export type TherapistDetailDto = {
  id: number;
  userId?: string | null;
  name?: string;
  profilePictureUrl?: string | null;
  gender?: string | null;
  workPhoneNumber?: string | null;
  averageRating?: number | null;
  ratingCount?: number | null;
  feePerSession?: number | null;
  specializations?: string[] | null;
  conditionsTreated?: string[] | null;
  // A free-text field returned by the backend listing other conditions treated (comma-separated or single string)
  otherConditionsTreated?: string | null;
  serviceAreas?: string[] | null;
  // Added: license number from backend (PhysicalTherapist.LicenseNumber)
  licenseNumber?: string | null;
};

export type PaginatedResult<T> = {
  items: T[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
};

export async function fetchTherapists(
  page = 1,
  limit = 10,
  search?: string
): Promise<PaginatedResult<TherapistListItem>> {
  const start = Date.now();
  const res = await apiClient.get("/api/Therapist", {
    params: { status: "verified", page, limit, search },
  });

  // Handle both legacy array response (if any fallback needed) and new object response
  const data = res?.data;
  let result: PaginatedResult<TherapistListItem>;

  if (Array.isArray(data)) {
    // Fallback if backend reverts or something
    result = {
      items: data as TherapistListItem[],
      totalCount: data.length,
      page: 1,
      pageSize: data.length,
      totalPages: 1,
      hasNextPage: false,
      hasPreviousPage: false,
    };
  } else {
    result = {
      items: data?.items || [],
      totalCount: data?.totalCount || 0,
      page: data?.page || 1,
      pageSize: data?.pageSize || 10,
      totalPages: data?.totalPages || 0,
      hasNextPage: data?.hasNextPage || false,
      hasPreviousPage: data?.hasPreviousPage || false
    };
  }

  const duration = Date.now() - start;
  console.log(
    `[Therapists] GET /api/Therapist (page ${page}) -> ${result.items.length} items in ${duration}ms`
  );
  return result;
}

export type MyTherapist = {
  id: number | string;
  [key: string]: any;
};

export type TherapistVerificationStatusResponse = {
  status: "Pending" | "Verified" | "Rejected" | null;
  submittedAt?: string | null;
  verifiedAt?: string | null;
  rejectionReason?: string | null;
  canSubmit?: boolean | null;
  licenseImagePath?: string | null;
};

export const therapistVerificationStatusQueryKey = [
  "therapist",
  "verification-status",
] as const;

export async function fetchTherapistVerificationStatus(): Promise<TherapistVerificationStatusResponse> {
  const res = await apiClient.get(
    "/api/Onboarding/therapist/verification-status"
  );
  const data = res?.data ?? {};
  return {
    status: (data?.status ?? null) as
      | "Pending"
      | "Verified"
      | "Rejected"
      | null,
    submittedAt: data?.submittedAt ?? null,
    verifiedAt: data?.verifiedAt ?? null,
    rejectionReason: data?.rejectionReason ?? null,
    canSubmit: data?.canSubmit ?? null,
    licenseImagePath: data?.licenseImagePath ?? null,
  };
}

export async function fetchMyTherapist(): Promise<MyTherapist | null> {
  try {
    const res = await apiClient.get("/api/Therapist/me");
    const data = res?.data as MyTherapist | undefined;
    if (data && (data as any).id != null) return data;
    return null;
  } catch {
    return null;
  }
}

export const therapistDetailQueryKey = (therapistId: string | number) =>
  ["therapist", String(therapistId)] as const;

export async function fetchTherapistById(
  therapistId: string | number
): Promise<TherapistDetailDto> {
  if (therapistId === null || therapistId === undefined || therapistId === "") {
    throw new Error("Therapist ID is required");
  }

  const start = Date.now();
  const res = await apiClient.get(`/api/Therapist/${therapistId}`);
  const duration = Date.now() - start;
  const sizeHeader = (res as any)?.headers?.["content-length"];
  console.log(
    `[Therapist] GET /api/Therapist/${therapistId} in ${duration}ms` +
    (sizeHeader ? `, ~${sizeHeader} bytes` : "")
  );

  return (res?.data ?? {}) as TherapistDetailDto;
}

// Fetch therapist basic info by the therapist's underlying user GUID
export type TherapistByUserDto = {
  id: number | string;
  userId: string;
  name?: string;
  licenseNumber?: string;
};

export async function fetchTherapistByUserId(userId: string): Promise<TherapistByUserDto | null> {
  if (!userId) return null;
  try {
    const res = await apiClient.get(`/api/Therapist/by-user/${userId}`);
    const data = res?.data ?? {};
    return {
      id: data?.id ?? data?.Id ?? "",
      userId: data?.userId ?? data?.UserId ?? userId,
      name: data?.name ?? data?.Name ?? undefined,
      licenseNumber: data?.licenseNumber ?? data?.LicenseNumber ?? undefined,
    } as TherapistByUserDto;
  } catch {
    return null;
  }
}

// ========== COLLEAGUE NETWORK ==========

export const MY_COLLEAGUES_QUERY_KEY = ['therapist', 'colleagues', 'me'] as const;
export const COLLEAGUE_REQUESTS_QUERY_KEY = ['therapist', 'colleagues', 'requests'] as const;

export interface TherapistColleague {
  id: number;
  name: string;
  specializations: string[];
  averageRating?: number;
  ratingCount?: number;
  addedAt: string;
  notes?: string;
}

export interface IncomingRequest {
  id: number; // Sender ID
  name: string;
  specializations: string[];
  requestedAt: string;
  notes?: string;
}

export interface OutgoingRequest {
  id: number; // Receiver ID
  name: string;
  requestedAt: string;
}

export interface ColleagueRequestsResponse {
  incoming: IncomingRequest[];
  outgoing: OutgoingRequest[];
}

export async function fetchMyColleagues(): Promise<TherapistColleague[]> {
  const response = await apiClient.get('/api/Therapist/me/colleagues');
  return Array.isArray(response.data) ? response.data : [];
}

export async function fetchColleagueRequests(): Promise<ColleagueRequestsResponse> {
  const response = await apiClient.get('/api/Therapist/me/colleague-requests');
  return response.data || { incoming: [], outgoing: [] };
}

export async function addColleague(colleagueId: number, notes?: string): Promise<void> {
  await apiClient.post(`/api/Therapist/me/colleagues/${colleagueId}`, { notes });
}

export async function removeColleague(colleagueId: number): Promise<void> {
  await apiClient.delete(`/api/Therapist/me/colleagues/${colleagueId}`);
}

export async function acceptColleagueRequest(senderId: number): Promise<void> {
  await apiClient.post(`/api/Therapist/me/colleague-requests/${senderId}/accept`);
}

export async function declineColleagueRequest(senderId: number): Promise<void> {
  await apiClient.delete(`/api/Therapist/me/colleague-requests/${senderId}/decline`);
}


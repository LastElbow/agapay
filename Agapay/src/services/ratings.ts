import apiClient from "@/api/client";

export type SubmitRatingRequest = {
  TherapistId: number;
  SessionId?: number | null;
  Score: number; // 1..5
  Comment?: string | null;
};

export type SubmitPatientRatingRequest = {
  PatientId: number;
  SessionId?: number | null;
  Score: number; // 1..5
  Comment?: string | null;
};

export async function submitRating(body: SubmitRatingRequest) {
  console.log("📡 submitRating API called");
  console.log("📤 Request body:", JSON.stringify(body, null, 2));
  console.log("📍 Endpoint: POST /api/ratings");

  try {
    const response = await apiClient.post("/api/ratings", body);
    console.log("✅ submitRating API response:", response.status);
    console.log("📥 Response data:", response.data);
    return response;
  } catch (error: any) {
    console.error("❌ submitRating API error:", error);
    console.error("❌ Error response:", error?.response);
    console.error("❌ Error data:", error?.response?.data);
    console.error("❌ Error status:", error?.response?.status);
    throw error;
  }
}

export async function submitPatientRating(body: SubmitPatientRatingRequest) {
  console.log("📡 submitPatientRating API called");
  console.log("📤 Request body:", JSON.stringify(body, null, 2));
  console.log("📍 Endpoint: POST /api/ratings/patient");

  try {
    const response = await apiClient.post("/api/ratings/patient", body);
    console.log("✅ submitPatientRating API response:", response.status);
    console.log("📥 Response data:", response.data);
    return response;
  } catch (error: any) {
    console.error("❌ submitPatientRating API error:", error);
    console.error("❌ Error response:", error?.response);
    console.error("❌ Error data:", error?.response?.data);
    console.error("❌ Error status:", error?.response?.status);
    throw error;
  }
}

export type TherapistRating = {
  id: number;
  contractId: number;
  patientId: number;
  patientName?: string | null;
  patientProfilePictureUrl?: string | null;
  score: number;
  comment?: string | null;
  createdAt: string;
  caseToTreat?: string | null;
};

export const therapistRatingsQueryKey = ["ratings", "therapist", "me"] as const;

export async function fetchTherapistRatings(): Promise<TherapistRating[]> {
  console.log("📡 fetchTherapistRatings API called");
  console.log("📍 Endpoint: GET /api/ratings/therapist/me");

  try {
    const response = await apiClient.get("/api/ratings/therapist/me");
    console.log("✅ fetchTherapistRatings API response:", response.status);
    console.log("📥 Response data:", response.data);
    console.log("📊 Ratings count:", Array.isArray(response.data) ? response.data.length : 0);
    return response.data;
  } catch (error: any) {
    console.error("❌ fetchTherapistRatings API error:", error);
    console.error("❌ Error response:", error?.response);
    console.error("❌ Error data:", error?.response?.data);
    console.error("❌ Error status:", error?.response?.status);
    throw error;
  }
}

export const therapistRatingsByIdQueryKey = (therapistId: string) =>
  ["ratings", "therapist", therapistId] as const;

export async function fetchTherapistRatingsById(therapistId: string): Promise<TherapistRating[]> {
  console.log("📡 fetchTherapistRatingsById API called");
  console.log("📤 Therapist ID:", therapistId);
  console.log(`📍 Endpoint: GET /api/ratings/therapist/${therapistId}`);

  try {
    const response = await apiClient.get(`/api/ratings/therapist/${therapistId}`);
    console.log("✅ fetchTherapistRatingsById API response:", response.status);
    console.log("📥 Response data:", response.data);
    console.log("📊 Ratings count:", Array.isArray(response.data) ? response.data.length : 0);
    return response.data;
  } catch (error: any) {
    console.error("❌ fetchTherapistRatingsById API error:", error);
    console.error("❌ Error response:", error?.response);
    console.error("❌ Error data:", error?.response?.data);
    console.error("❌ Error status:", error?.response?.status);
    throw error;
  }
}


export type PatientRating = {
  id: number;
  contractId: number;
  patientId: number;
  therapistId: number;
  therapistName?: string | null;
  therapistProfilePictureUrl?: string | null;
  score: number;
  comment?: string | null;
  createdAt: string;
  caseToTreat?: string | null;
};

export const patientRatingsQueryKey = ["ratings", "patient", "me"] as const;

export async function fetchMyRatings(patientId?: number): Promise<PatientRating[]> {
  console.log("📡 fetchMyRatings API called");

  // If patientId is provided, try fetch by patient ID, otherwise fallback to generic
  const url = patientId ? `/api/ratings/patient/${patientId}` : "/api/ratings/patient";
  console.log(`📍 Endpoint: GET ${url}`);

  try {
    const response = await apiClient.get(url);
    console.log("✅ fetchMyRatings API response:", response.status);
    console.log("📥 Response data:", response.data);

    const data = response.data;
    if (Array.isArray(data)) {
      return data;
    }
    // If it returns a paginated result or object, try to extract items
    if (data && Array.isArray(data.items)) {
      return data.items;
    }

    return [];
  } catch (error: any) {
    console.warn("⚠️ fetchMyRatings failed:", error.message);
    // Graceful degradation: return empty array so UI shows history without details
    // instead of crashing or showing error state.
    // If the specific endpoint fails and we have a patientId, maybe try the generic one? 
    // For now, just return empty.
    return [];
  }
}

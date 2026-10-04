import apiClient from "@/api/client";

export type TherapistAvailability = {
  id: number;
  physicalTherapistId: number;
  dayOfWeek: number | string; // Backend may send numeric 0-6 or string enum name
  startTime: string; // "HH:mm:ss" or "HH:mm"
  endTime: string;   // "HH:mm:ss" or "HH:mm"
  isAvailable: boolean;
  specificDate?: string | null;
  notes?: string | null;
};

export type TherapistAvailabilityDto = {
  dayOfWeek: number; // 0..6
  startTime: string; // "HH:mm:ss" or "HH:mm"
  endTime: string;   // "HH:mm:ss" or "HH:mm"
  isAvailable?: boolean; // default true
  specificDate?: string | null; // ISO date string for specific date availability
  notes?: string;
};

export type AvailabilityScore = { score: number };

export type BookedInterval = { startAt: string; endAt: string };

export async function fetchTherapistAvailability(
  therapistId: number | string
): Promise<TherapistAvailability[]> {
  const res = await apiClient.get(`/api/availability/therapist/${therapistId}`);
  const list = Array.isArray(res?.data) ? (res.data as TherapistAvailability[]) : [];
  return list;
}

export async function upsertTherapistAvailability(
  therapistId: number | string,
  payload: TherapistAvailabilityDto[]
): Promise<{ message?: string }> {
  const res = await apiClient.post(`/api/availability/therapist/${therapistId}`,
    payload
  );
  return res?.data ?? { message: "" };
}

export async function fetchBookedIntervals(
  therapistId: number | string,
  fromISO: string,
  toISO: string
): Promise<BookedInterval[]> {
  const res = await apiClient.get(
    `/api/availability/therapist/${therapistId}/booked`,
    { params: { from: fromISO, to: toISO } }
  );
  const list = Array.isArray(res?.data) ? (res.data as BookedInterval[]) : [];
  return list;
}

export async function fetchAvailabilityScore(
  therapistId: number | string,
  patientId: number | string
): Promise<AvailabilityScore> {
  const res = await apiClient.get(
    `/api/availability/score/${therapistId}/${patientId}`
  );
  const data = res?.data as AvailabilityScore;
  return data ?? { score: 0 };
}

/**
 * Cancellation/Reschedule reason options for session management.
 * Role-specific options reflecting the home-visit PT model where
 * freelance therapists travel to patient homes.
 */

export type CancellationReason = {
  id: string;
  label: string;
};

/**
 * Patient cancellation reasons.
 * Patients are at home; therapists come to them.
 */
export const PATIENT_CANCELLATION_REASONS: CancellationReason[] = [
  { id: "feeling_unwell", label: "Feeling unwell" },
  { id: "home_unavailable", label: "Home is not available" },
  { id: "caregiver_unavailable", label: "Caregiver/family member unavailable" },
  { id: "personal_emergency", label: "Personal/family emergency" },
  { id: "schedule_conflict", label: "Schedule conflict" },
  { id: "financial_reasons", label: "Financial reasons" },
  { id: "other", label: "Other" },
];

/**
 * Therapist cancellation reasons.
 * Therapists are freelancers who travel to patient homes.
 * Note: "Schedule conflict" is intentionally excluded as the app
 * is designed to prevent double-booking.
 */
export const THERAPIST_CANCELLATION_REASONS: CancellationReason[] = [
  { id: "personal_emergency", label: "Personal emergency" },
  { id: "feeling_unwell", label: "Feeling unwell" },
  { id: "transportation_issues", label: "Transportation/travel issues" },
  { id: "weather_conditions", label: "Weather conditions" },
  { id: "safety_concerns", label: "Safety concerns" },
  { id: "other", label: "Other" },
];

/**
 * Patient reasons for declining a therapist's reschedule proposal.
 * These are phrased from the patient's perspective.
 */
export const PATIENT_RESCHEDULE_DECLINE_REASONS: CancellationReason[] = [
  { id: "time_doesnt_work", label: "The proposed time doesn't work for me" },
  { id: "prefer_original_schedule", label: "I prefer the original schedule" },
  { id: "not_ok_with_substitute", label: "I'm not comfortable with a substitute therapist" },
  { id: "home_unavailable", label: "My home won't be available at that time" },
  { id: "health_change", label: "My condition changed; I need to pause/cancel" },
  { id: "financial_reasons", label: "Financial reasons" },
  { id: "other", label: "Other" },
];

/**
 * Get the appropriate reasons list based on user role.
 */
export function getCancellationReasons(
  isTherapist: boolean
): CancellationReason[] {
  return isTherapist
    ? THERAPIST_CANCELLATION_REASONS
    : PATIENT_CANCELLATION_REASONS;
}

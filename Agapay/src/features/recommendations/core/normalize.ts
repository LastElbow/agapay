import type { PreferencesSnapshot } from '@/src/features/recommendations/core/hash';

export function snapshotFromPreferencesResponse(prefs: any): PreferencesSnapshot {
  return {
    specializations: prefs?.preferredSpecializations ?? prefs?.preferredSpecialization ?? [],
    budget: prefs?.sessionBudget ?? null,
    gender: prefs?.preferredTherapistGender ?? null,
    services: prefs?.desiredServices ?? [],
    availabilities: prefs?.availabilities ?? [],
    barangay: prefs?.preferredBarangay ?? null,
  };
}

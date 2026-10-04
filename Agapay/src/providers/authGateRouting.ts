export const PATIENT_ONBOARDING_START = "/(patient)/onboarding/tell-us-about";
export const PATIENT_TABS_ROOT = "/(patient)/(tabs)";

export function getPatientAuthGateTarget(input: {
  onboardingComplete: boolean;
  onPatientTabs: boolean;
  alreadyInPatientStack: boolean;
  inPatientOnboarding: boolean;
  onRootAuthenticatedPage: boolean;
  inAuthStack: boolean;
  isRoot: boolean;
}): string | null {
  // Hard rule: if onboarding isn't complete, patient tabs should never be accessible.
  if (!input.onboardingComplete && input.onPatientTabs) {
    return PATIENT_ONBOARDING_START;
  }

  if (input.onboardingComplete) {
    // User has completed onboarding - only redirect if coming from auth stack or root index
    // Preserve current location if already in patient stack or on any other authenticated page
    if (
      !input.alreadyInPatientStack &&
      !input.onRootAuthenticatedPage &&
      (input.inAuthStack || input.isRoot)
    ) {
      return PATIENT_TABS_ROOT;
    }

    return null;
  }

  // Onboarding not complete - only redirect if coming from auth stack or root index
  // Preserve current location if already in patient stack or on any other authenticated page
  if (
    !input.inPatientOnboarding &&
    !input.alreadyInPatientStack &&
    !input.onRootAuthenticatedPage &&
    (input.inAuthStack || input.isRoot)
  ) {
    return PATIENT_ONBOARDING_START;
  }

  return null;
}

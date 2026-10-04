import {
  getPatientAuthGateTarget,
  PATIENT_ONBOARDING_START,
  PATIENT_TABS_ROOT,
} from "./authGateRouting";

describe("getPatientAuthGateTarget", () => {
  it("forces onboarding when tabs are visible but onboarding incomplete", () => {
    const target = getPatientAuthGateTarget({
      onboardingComplete: false,
      onPatientTabs: true,
      alreadyInPatientStack: true,
      inPatientOnboarding: false,
      onRootAuthenticatedPage: false,
      inAuthStack: false,
      isRoot: false,
    });

    expect(target).toBe(PATIENT_ONBOARDING_START);
  });

  it("redirects to onboarding from auth stack when onboarding incomplete", () => {
    const target = getPatientAuthGateTarget({
      onboardingComplete: false,
      onPatientTabs: false,
      alreadyInPatientStack: false,
      inPatientOnboarding: false,
      onRootAuthenticatedPage: false,
      inAuthStack: true,
      isRoot: false,
    });

    expect(target).toBe(PATIENT_ONBOARDING_START);
  });

  it("redirects to tabs from auth stack when onboarding complete", () => {
    const target = getPatientAuthGateTarget({
      onboardingComplete: true,
      onPatientTabs: false,
      alreadyInPatientStack: false,
      inPatientOnboarding: false,
      onRootAuthenticatedPage: false,
      inAuthStack: true,
      isRoot: false,
    });

    expect(target).toBe(PATIENT_TABS_ROOT);
  });

  it("preserves location in patient stack when onboarding complete", () => {
    const target = getPatientAuthGateTarget({
      onboardingComplete: true,
      onPatientTabs: true,
      alreadyInPatientStack: true,
      inPatientOnboarding: false,
      onRootAuthenticatedPage: false,
      inAuthStack: false,
      isRoot: false,
    });

    expect(target).toBeNull();
  });

  it("does not redirect deep links outside auth/root", () => {
    const target = getPatientAuthGateTarget({
      onboardingComplete: false,
      onPatientTabs: false,
      alreadyInPatientStack: false,
      inPatientOnboarding: false,
      onRootAuthenticatedPage: true,
      inAuthStack: false,
      isRoot: false,
    });

    expect(target).toBeNull();
  });
});

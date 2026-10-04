import React, { PropsWithChildren, useEffect, useRef, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { Redirect, usePathname, useRouter, useSegments } from "expo-router";
import { useAuth } from "./AuthProvider";
import { useRole } from "./RoleProvider";
import { getPatientAuthGateTarget } from "./authGateRouting";

const PUBLIC_AUTH_PATHS = new Set([
  "/role-selection",
  "/signin",
  "/signup-step1",
  "/signup-step2",
  "/signup-step3",
  "/forgot-password-request",
  "/reset-password",
  "/privacy",
  "/terms",
]);

const normalizePath = (path: string): string => {
  const lower = path.toLowerCase();
  if (lower.startsWith("/(auth)/")) return lower.replace("/(auth)", "");
  return lower;
};

const AuthGate: React.FC<PropsWithChildren> = ({ children }) => {
  const { isBootstrapping, accessToken, user, signOut } = useAuth();
  const { selectedRole, isBootstrapping: roleBootstrapping } = useRole();
  const router = useRouter();
  const segments = useSegments();
  const segmentsArray = Array.isArray(segments) ? [...segments] : [];
  const pathname = usePathname() ?? "/";
  const [isReady, setIsReady] = useState(false);
  const lastRedirect = useRef<string | null>(null);

  // Store the initial pathname on first render to preserve it across auth bootstrapping
  const initialPathnameRef = useRef<string | null>(null);
  if (
    initialPathnameRef.current === null &&
    pathname !== "/" &&
    pathname !== ""
  ) {
    initialPathnameRef.current = pathname;
  }

  const normalizedPath = normalizePath(pathname);
  const rootSegment =
    segmentsArray.length > 0 ? (segmentsArray[0] as string) : "";
  const childSegment =
    segmentsArray.length > 1 ? (segmentsArray[1] as string) : "";
  const isRootPath = pathname === "/" || pathname === "";
  const isRootSegments =
    segmentsArray.length === 0 ||
    (segmentsArray.length === 1 && !segmentsArray[0]);
  const isRoot = isRootPath || isRootSegments;
  const inAuthStack =
    rootSegment === "(auth)" || PUBLIC_AUTH_PATHS.has(normalizedPath);
  const onPatientTabs =
    rootSegment === "(patient)" && childSegment === "(tabs)";
  const onTherapistTabs =
    rootSegment === "(therapist)" && childSegment === "(tabs)";
  const onTherapistOnboarding =
    rootSegment === "(therapist)" && childSegment === "onboarding";
  const onPatientOnboarding =
    rootSegment === "(patient)" && childSegment === "onboarding";
  const onRoleSelection =
    rootSegment === "(auth)" &&
    (childSegment === "role-selection" || normalizedPath === "/role-selection");

  // Check if user is already in their correct role stack (patient or therapist)
  const alreadyInPatientStack = rootSegment === "(patient)";
  const alreadyInTherapistStack = rootSegment === "(therapist)";

  const isAt = (target: string) => {
    const base = target.split("?")[0];
    if (base === "/") {
      return isRoot;
    }
    if (base === "/(auth)/role-selection") {
      return onRoleSelection;
    }
    if (base === "/(patient)/(tabs)") {
      return onPatientTabs;
    }
    // Treat any route under patient onboarding as matching
    if (
      base === "/(patient)/onboarding" ||
      base === "/(patient)/onboarding/tell-us-about"
    ) {
      return (
        pathname === "/(patient)/onboarding" ||
        pathname.startsWith("/(patient)/onboarding/")
      );
    }
    if (base === "/(therapist)/(tabs)") {
      return onTherapistTabs;
    }
    return pathname === base || pathname.startsWith(`${base}/`);
  };

  const navigateTo = (target: string) => {
    if (lastRedirect.current === target) {
      return false;
    }
    lastRedirect.current = target;
    setIsReady(false);
    router.replace(target as any);
    return true;
  };

  // Track whether we should redirect unauthenticated users
  const shouldRedirectToRoot =
    !isBootstrapping && !accessToken && !inAuthStack && !isRoot;

  useEffect(() => {
    // If redirecting to root, don't run auth logic
    if (shouldRedirectToRoot) {
      return;
    }

    if (isBootstrapping || roleBootstrapping) return;

    if (!accessToken) {
      // Handled by render-time Redirect below
      lastRedirect.current = null;
      setIsReady(true);
      return;
    }

    if (!selectedRole) {
      const target = "/(auth)/role-selection";
      if (!inAuthStack || !isAt(target)) {
        if (navigateTo(target)) return;
        if (!isAt(target)) return;
      }
      lastRedirect.current = null;
      setIsReady(true);
      return;
    }

    let target: string | null = null;
    if (selectedRole === "Patient") {
      // If patient onboarding is not complete, send to onboarding flow instead of tabs
      const onboardingComplete =
        user?.isPatientOnboardingComplete ??
        user?.IsPatientOnboardingComplete;
      // Use segments-based check instead of pathname (pathname doesn't include group prefix on web)
      const inPatientOnboarding =
        onPatientOnboarding || pathname.startsWith("/(patient)/onboarding");
      // Check if user is on a root-level authenticated page (e.g., session-detail, rating, messages, etc.)
      // These are pages outside of (patient)/(therapist)/(auth) stacks that authenticated users can access
      const onRootAuthenticatedPage =
        !inAuthStack &&
        !isRoot &&
        !alreadyInPatientStack &&
        !alreadyInTherapistStack;

      target = getPatientAuthGateTarget({
        onboardingComplete: Boolean(onboardingComplete),
        onPatientTabs,
        alreadyInPatientStack,
        inPatientOnboarding,
        onRootAuthenticatedPage,
        inAuthStack,
        isRoot,
      });
    } else if (selectedRole === "PhysicalTherapist") {
      const therapistComplete =
        user?.isTherapistOnboardingComplete ??
        user?.IsTherapistOnboardingComplete ??
        false;
      const therapistStatus =
        user?.therapistVerificationStatus ??
        user?.TherapistVerificationStatus ??
        null;
      // Use segments-based check instead of pathname (pathname doesn't include group prefix on web)
      const inTherapistOnboarding =
        onTherapistOnboarding || pathname.startsWith("/(therapist)/onboarding");
      // Check if user is on a root-level authenticated page
      const onRootAuthenticatedPage =
        !inAuthStack &&
        !isRoot &&
        !alreadyInPatientStack &&
        !alreadyInTherapistStack;

      if (therapistComplete) {
        // User has completed onboarding - only redirect if coming from auth stack or root index
        if (
          !alreadyInTherapistStack &&
          !onRootAuthenticatedPage &&
          (inAuthStack || isRoot)
        ) {
          target = "/(therapist)/(tabs)";
        }
      } else {
        // therapistStatus can be: null, "Pending", "Verified", or "Rejected"
        // null means data is missing/stale - sign out and redirect to login
        // to force a fresh authentication and data fetch.
        if (therapistStatus === null) {
          // Sign out and let the redirect to login happen automatically
          signOut().catch(() => {});
          return;
        } else if (therapistStatus === "Verified") {
          // Verified but onboarding not complete - send to onboarding step1
          if (
            !inTherapistOnboarding &&
            !alreadyInTherapistStack &&
            !onRootAuthenticatedPage &&
            (inAuthStack || isRoot)
          ) {
            const onboardingStart = "/(therapist)/onboarding/step1";
            target = onboardingStart;
          }
        } else {
          // User has "Pending" or "Rejected" status but onboarding not complete
          // Only redirect if coming from auth stack or root index
          if (
            !alreadyInTherapistStack &&
            !onRootAuthenticatedPage &&
            (inAuthStack || isRoot)
          ) {
            target = "/(therapist)/(tabs)";
          }
        }
      }
    }

    if (target) {
      if (!isAt(target)) {
        if (navigateTo(target)) return;
        if (!isAt(target)) return;
      }
    }

    lastRedirect.current = null;
    setIsReady(true);
  }, [
    isBootstrapping,
    roleBootstrapping,
    accessToken,
    selectedRole,
    user,
    pathname,
    normalizedPath,
    inAuthStack,
    isRoot,
    onPatientTabs,
    onTherapistTabs,
    onTherapistOnboarding,
    onPatientOnboarding,
    router,
    rootSegment,
    shouldRedirectToRoot,
    alreadyInPatientStack,
    alreadyInTherapistStack,
  ]);

  // Redirect unauthenticated users trying to access protected routes
  if (shouldRedirectToRoot) {
    return <Redirect href="/" />;
  }

  // Always render children so the navigator is mounted when redirects happen.
  // This prevents "action was not handled by any navigator" warnings on web.
  return <>{children}</>;
};

export default AuthGate;

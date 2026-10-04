import { useMemo } from "react";
import { useAuth } from "@/src/providers/AuthProvider";

type TherapistStatusValue = "Pending" | "Verified" | "Rejected" | null;

export function useTherapistStatus() {
  const { user } = useAuth();

  const status = useMemo<TherapistStatusValue>(() => {
    const raw =
      user?.therapistVerificationStatus ??
      user?.TherapistVerificationStatus ??
      null;
    if (typeof raw !== "string" || raw.trim().length === 0) return null;
    const normalized = raw.trim();
    if (
      normalized === "Pending" ||
      normalized === "Verified" ||
      normalized === "Rejected"
    ) {
      return normalized;
    }
    return null;
  }, [user]);

  const onboardingComplete =
    user?.isTherapistOnboardingComplete ??
    user?.IsTherapistOnboardingComplete ??
    false;

  const hasSubmitted = status !== null;
  const isVerified = status === "Verified";
  const isPending = status === "Pending";
  const isRejected = status === "Rejected";
  const isRestricted = !isVerified;

  return {
    status,
    hasSubmitted,
    onboardingComplete: Boolean(onboardingComplete),
    isVerified,
    isPending,
    isRejected,
    isRestricted,
  };
}

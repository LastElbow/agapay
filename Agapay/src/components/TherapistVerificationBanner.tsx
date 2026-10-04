import React, { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { AlertTriangle, Clock } from "lucide-react-native";
import { useQuery } from "@tanstack/react-query";
import {
  fetchTherapistVerificationStatus,
  therapistVerificationStatusQueryKey,
} from "@/src/services/therapists";
import { useTherapistStatus } from "@/src/hooks/useTherapistStatus";

type TherapistVerificationBannerProps = {
  style?: object;
};

const containerStyles = {
  base: {
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 18,
    marginBottom: 16,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 14,
  },
  pending: {
    backgroundColor: "#FEF9C3",
  },
  rejected: {
    backgroundColor: "#FEE2E2",
  },
};

const textStyles = StyleSheet.create({
  title: { fontSize: 15, fontWeight: "600", color: "#111827" },
  body: { fontSize: 13, color: "#374151", marginTop: 4, lineHeight: 18 },
  action: {
    marginTop: 10,
    color: "#1D4ED8",
    fontWeight: "600",
    fontSize: 13,
  },
});

export default function TherapistVerificationBanner({
  style,
}: TherapistVerificationBannerProps) {
  const router = useRouter();
  const { status, isPending, isRejected } = useTherapistStatus();

  const shouldDisplay = isPending || isRejected;

  const { data } = useQuery({
    queryKey: therapistVerificationStatusQueryKey,
    queryFn: fetchTherapistVerificationStatus,
    enabled: shouldDisplay,
    staleTime: 60 * 1000,
  });

  const { title, body, actionLabel } = useMemo(() => {
    if (isRejected) {
      const rejectionReason = data?.rejectionReason;
      return {
        title: "Application requires updates",
        body:
          rejectionReason && rejectionReason.length > 0
            ? `Our team could not verify your documents: ${rejectionReason}`
            : "Your documents were not approved. Please review the requirements and submit updated information.",
        actionLabel: "Resubmit verification",
      };
    }
    // Pending
    return {
      title: "Verification under review",
      body: "You now have limited access while our team reviews your documents. We'll notify you once the process is complete.",
      actionLabel: "View submission",
    };
  }, [isRejected, data?.rejectionReason]);

  if (!shouldDisplay || status === null) {
    return null;
  }

  const onAction = () => {
    router.push("/(therapist)/onboarding/verification");
  };

  return (
    <View
      style={[
        containerStyles.base,
        isRejected ? containerStyles.rejected : containerStyles.pending,
        style,
      ]}
    >
      {isRejected ? (
        <AlertTriangle size={28} color="#B91C1C" />
      ) : (
        <Clock size={28} color="#92400E" />
      )}
      <View style={{ flex: 1 }}>
        <Text style={textStyles.title}>{title}</Text>
        <Text style={textStyles.body}>{body}</Text>
        {!isPending && (
          <Pressable onPress={onAction}>
            <Text style={textStyles.action}>{actionLabel}</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

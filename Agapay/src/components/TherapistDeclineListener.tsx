import React from "react";
import InAppModal from "@/src/components/InAppModal";
import { useAuth } from "@/src/providers/AuthProvider";
import { useRole } from "@/src/providers/RoleProvider";
import { useQueryClient } from "@tanstack/react-query";
import {
  allSessionsQueryKey,
  upcomingSessionsQueryKey,
} from "@/src/services/sessions";
import signalrManager from "@/src/services/signalrManager";

type Notice = {
  type: "declined" | "activated";
  contractId: number;
  patientName?: string | null;
  timestamp?: string | null;
};

function formatTimestamp(value?: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  try {
    return date.toLocaleString();
  } catch {
    return date.toISOString();
  }
}

export default function TherapistContractListener() {
  const { accessToken } = useAuth();
  const { selectedRole } = useRole();
  const [notice, setNotice] = React.useState<Notice | null>(null);
  const queryClient = useQueryClient();

  React.useEffect(() => {
    if (!accessToken || selectedRole !== "PhysicalTherapist") {
      setNotice(null);
      return;
    }

    let active = true;
    const unsubscribeFns: (() => void)[] = [];

    const setupConnection = async () => {
      try {
        await signalrManager.getSharedConnection('contracts', accessToken);

        if (!active) {
          signalrManager.releaseConnection('contracts');
          return;
        }

        const handleNotice = (
          type: Notice["type"],
          payload: any,
          timestampKey: string
        ) => {
          if (!active || !payload) return;
          const contractId = Number(payload.contractId);
          if (!Number.isFinite(contractId)) return;

          const patientName =
            typeof payload.patientName === "string" &&
            payload.patientName.trim().length > 0
              ? payload.patientName.trim()
              : undefined;
          const timestamp =
            typeof payload[timestampKey] === "string"
              ? payload[timestampKey]
              : null;

          setNotice({
            type,
            contractId,
            patientName: patientName ?? null,
            timestamp,
          });
        };

        const invalidateSessions = () => {
          // Keep notifications and schedules fresh when contracts change
          queryClient
            .invalidateQueries({ queryKey: upcomingSessionsQueryKey })
            .catch(() => {});
          queryClient
            .invalidateQueries({ queryKey: allSessionsQueryKey })
            .catch(() => {});
          queryClient
            .invalidateQueries({ queryKey: ["sessions"] })
            .catch(() => {});
        };

        unsubscribeFns.push(
          signalrManager.subscribeToEvent('contracts', "ContractDeclined", (payload: any) => {
            handleNotice("declined", payload, "declinedAt");
            invalidateSessions();
          }),
          signalrManager.subscribeToEvent('contracts', "ContractActivated", (payload: any) => {
            // Don't show modal for accepted proposals - just refresh sessions
            // The banner will update to show "Accepted" status
            if (!active || !payload) return;
            invalidateSessions();
          }),
          // Optional: when a contract ends, upcoming sessions may change
          signalrManager.subscribeToEvent('contracts', "ContractEnded", (_payload: any) => {
            invalidateSessions();
          })
        );
      } catch (error) {
        console.warn("Therapist contracts hub connection failed", error);
      }
    };

    setupConnection();

    return () => {
      active = false;
      unsubscribeFns.forEach(unsub => unsub());
      signalrManager.releaseConnection('contracts');
    };
  }, [accessToken, selectedRole, queryClient]);

  if (!notice) return null;

  const patientName = notice.patientName?.trim() || "Your patient";
  const timestamp = formatTimestamp(notice.timestamp);

  let message: string;
  let title: string;

  if (notice.type === "declined") {
    title = "Session Proposal Declined";
    message = timestamp
      ? `${patientName} has declined your session proposal on ${timestamp}. You can discuss alternative arrangements or create a new proposal.`
      : `${patientName} has declined your session proposal. You can discuss alternative arrangements or create a new proposal.`;
  } else {
    title = "Session Proposal Accepted";
    message = timestamp
      ? `Great news! ${patientName} has accepted your session proposal on ${timestamp}. The session is now confirmed and scheduled.`
      : `Great news! ${patientName} has accepted your session proposal. The session is now confirmed and scheduled.`;
  }

  return (
    <InAppModal
      visible
      title={title}
      message={message}
      confirmText="Dismiss"
      showCancel={false}
      onConfirm={() => setNotice(null)}
      onCancel={() => setNotice(null)}
    />
  );
}


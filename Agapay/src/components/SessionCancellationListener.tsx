import React from "react";
import { View, Text } from "react-native";
import InAppModal from "@/src/components/InAppModal";
import { useAuth } from "@/src/providers/AuthProvider";
import { useRole } from "@/src/providers/RoleProvider";
import { useQueryClient } from "@tanstack/react-query";
import signalrManager from "@/src/services/signalrManager";

type Notice = {
  sessionId: number;
  cancelledBy: "patient" | "therapist" | null;
  cancelledByName: string;
  reason?: string | null;
  scheduledFor?: string | null;
  message: string;
  proposedReschedule?: string | null;
};

const normalizeGuid = (value?: string | null) =>
  typeof value === "string" ? value.trim().toLowerCase() : null;

const formatDateTime = (value?: string | null) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  try {
    return date.toLocaleString([], {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return date.toISOString();
  }
};

const formatProposedReschedule = (iso?: string | null) => {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;

  // Weekday full name
  const weekday = d.toLocaleDateString(undefined, { weekday: "long" });
  // Short month and day (e.g., "Nov 24")
  const dateLabel = d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
  // Time (e.g., "10:00 AM")
  const time = d.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  return `${weekday} (${dateLabel}), ${time}`;
};

export default function SessionCancellationListener() {
  const { accessToken, user: authUser } = useAuth();
  const { selectedRole } = useRole();
  const queryClient = useQueryClient();
  const [notice, setNotice] = React.useState<Notice | null>(null);
  const selectedRoleRef = React.useRef<typeof selectedRole>(selectedRole);
  const authUserIdRef = React.useRef<string | null>(
    normalizeGuid(authUser?.id ? String(authUser.id) : null)
  );

  React.useEffect(() => {
    selectedRoleRef.current = selectedRole;
  }, [selectedRole]);

  React.useEffect(() => {
    authUserIdRef.current = normalizeGuid(
      authUser?.id ? String(authUser.id) : null
    );
  }, [authUser]);

  const handleCancellation = React.useCallback(
    (payload: any) => {
      const sessionIdRaw = payload?.sessionId;
      const sessionId = Number(sessionIdRaw);
      if (!Number.isFinite(sessionId)) {
        return;
      }

      // Check if the current user is a participant in this session
      const patientUserId = normalizeGuid(
        payload?.patientUserId ? String(payload.patientUserId) : null
      );
      const therapistUserId = normalizeGuid(
        payload?.therapistUserId ? String(payload.therapistUserId) : null
      );
      const currentUserId = authUserIdRef.current;

      // Only show the modal if the current user is either the patient or therapist of this session
      if (currentUserId && patientUserId !== currentUserId && therapistUserId !== currentUserId) {
        // Current user is not a participant in this session, skip notification
        return;
      }

      void queryClient
        .invalidateQueries({
          predicate: (query) =>
            Array.isArray(query.queryKey) && query.queryKey[0] === "sessions",
        })
        .catch(() => { });

      const cancelledByRaw =
        typeof payload?.cancelledBy === "string"
          ? payload.cancelledBy.trim().toLowerCase()
          : null;
      const cancelledBy: Notice["cancelledBy"] =
        cancelledByRaw === "patient"
          ? "patient"
          : cancelledByRaw === "therapist"
            ? "therapist"
            : null;

      const cancelledByUserId = normalizeGuid(
        payload?.cancelledByUserId ? String(payload.cancelledByUserId) : null
      );
      if (
        cancelledByUserId &&
        authUserIdRef.current &&
        cancelledByUserId === authUserIdRef.current
      ) {
        // Skip notifying the initiator—they already know.
        return;
      }

      const currentRole = selectedRoleRef.current;
      if (
        (cancelledBy === "patient" && currentRole === "Patient") ||
        (cancelledBy === "therapist" && currentRole === "PhysicalTherapist")
      ) {
        // Avoid duplicate notice to the party that cancelled.
        return;
      }

      const patientName =
        typeof payload?.patientName === "string"
          ? payload.patientName.trim()
          : "";
      const therapistName =
        typeof payload?.therapistName === "string"
          ? payload.therapistName.trim()
          : "";

      const cancellerName =
        cancelledBy === "patient"
          ? patientName || "Your patient"
          : cancelledBy === "therapist"
            ? therapistName || "Your therapist"
            : "A participant";

      const scheduledFor = formatDateTime(
        typeof payload?.startAt === "string" ? payload.startAt : null
      );
      const proposedReschedule = formatProposedReschedule(
        typeof payload?.rescheduleStartAt === "string" ? payload.rescheduleStartAt : null
      );
      const reason =
        typeof payload?.cancellationReason === "string" &&
          payload.cancellationReason.trim().length > 0
          ? payload.cancellationReason.trim()
          : null;

      let message = `${cancellerName} cancelled the session`;
      message += scheduledFor ? ` scheduled on ${scheduledFor}.` : ".";
      // Store the base message and the proposed reschedule (formatted
      // as weekday + short date + time) separately so we can render it on
      // its own line with emphasis and match the reschedule picker style.
      setNotice({
        sessionId,
        cancelledBy,
        cancelledByName: cancellerName,
        reason,
        scheduledFor,
        message,
        proposedReschedule: proposedReschedule ?? null,
      });
    },
    [queryClient]
  );

  React.useEffect(() => {
    if (!accessToken) {
      setNotice(null);
      return;
    }

    let active = true;
    let unsubscribeFn: (() => void) | undefined;

    const setupConnection = async () => {
      try {
        await signalrManager.getSharedConnection('sessions', accessToken);

        if (!active) {
          signalrManager.releaseConnection('sessions');
          return;
        }

        unsubscribeFn = signalrManager.subscribeToEvent('sessions', "SessionCancelled", (payload: any) => {
          if (!active) return;
          handleCancellation(payload);
        });
      } catch (error) {
        console.warn("Sessions hub connection failed", error);
      }
    };

    setupConnection();

    return () => {
      active = false;
      if (unsubscribeFn) unsubscribeFn();
      signalrManager.releaseConnection('sessions');
    };
  }, [accessToken, handleCancellation]);

  if (!notice) return null;

  return (
    <InAppModal
      visible
      large
      title="Session Cancelled"
      message={notice.message}
      confirmText="Dismiss"
      showCancel={false}
      onConfirm={() => setNotice(null)}
      onCancel={() => setNotice(null)}
    >
      {notice.reason ? (
        <View style={{ marginBottom: 12 }}>
          <Text style={{ fontSize: 14, color: "#475569" }}>
            <Text style={{ fontWeight: "700", color: "#0F172A" }}>Reason: </Text>
            {notice.reason}
          </Text>
        </View>
      ) : null}

      {notice.scheduledFor ? (
        <View
          style={{
            backgroundColor: "#F8FAFC",
            borderRadius: 10,
            padding: 10,
            marginBottom: 8,
            borderWidth: 1,
            borderColor: "#E6EEF8",
          }}
        >
          <Text style={{ fontSize: 13, fontWeight: "700", color: "#0F172A" }}>Original schedule</Text>
          <Text style={{ fontSize: 14, color: "#334155", marginTop: 6 }}>{notice.scheduledFor}</Text>
        </View>
      ) : null}

      {notice.proposedReschedule ? (
        <View
          style={{
            backgroundColor: "#EFF8FF",
            borderRadius: 10,
            padding: 12,
            marginBottom: 6,
            borderWidth: 1,
            borderColor: "#BEE3F8",
          }}
        >
          <Text style={{ fontSize: 14, fontWeight: "700", color: "#0369A1" }}>Proposed reschedule</Text>
          <Text style={{ fontSize: 15, color: "#034E7B", marginTop: 6 }}>{notice.proposedReschedule}</Text>
        </View>
      ) : null}
    </InAppModal>
  );
}


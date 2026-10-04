import React from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "@/src/providers/AuthProvider";
import { useRole } from "@/src/providers/RoleProvider";
import apiClient from "@/api/client";
import { formatPeso } from "@/src/utils/money";
import {
  HubConnection,
  HubConnectionBuilder,
  HttpTransportType,
  HubConnectionState,
  LogLevel,
} from "@microsoft/signalr";
import { useQueryClient } from "@tanstack/react-query";
import {
  allSessionsQueryKey,
  upcomingSessionsQueryKey,
} from "@/src/services/sessions";

export default function PendingContractBanner() {
  const router = useRouter();
  const { accessToken, user } = useAuth();
  const { selectedRole } = useRole();
  const [pending, setPending] = React.useState<null | {
    contractId: number;
    therapistName?: string | null;
    therapistLicense?: string | null;
    sessionDays?: string | null;
    sessionStartTime?: string | null;
    sessionEndTime?: string | null;
    totalFee?: number | null;
    caseToTreat?: string | null;
    locationAddress?: string | null;
    professionalFee?: number | null;
    locationFee?: number | null;
    miscellaneousFee?: number | null;
  }>(null);
  const [patientProfileId, setPatientProfileId] = React.useState<
    string | undefined
  >(undefined);
  const [activePatientProfile, setActivePatientProfile] = React.useState<
    any | null
  >(null);

  const connectionRef = React.useRef<HubConnection | null>(null);
  const queryClient = useQueryClient();

  const formatTime12h = React.useCallback((raw?: string | null) => {
    if (!raw) return null;
    const match = String(raw).match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    if (!match) return raw;
    let hours = Number(match[1]);
    const minutes = match[2];
    if (!Number.isFinite(hours)) return raw;
    const meridiem = hours >= 12 ? "PM" : "AM";
    hours = hours % 12 || 12;
    return `${hours}:${minutes} ${meridiem}`;
  }, []);

  const patientDisplayName = React.useMemo(() => {
    if (activePatientProfile) {
      const first =
        activePatientProfile.firstName ??
        activePatientProfile.givenName ??
        activePatientProfile.name ??
        "";
      const last =
        activePatientProfile.lastName ??
        activePatientProfile.familyName ??
        activePatientProfile.surname ??
        "";
      const full = `${first ?? ""} ${last ?? ""}`.trim();
      if (full) return full;
    }
    if (user) {
      const first =
        user.firstName ??
        user.given_name ??
        user.name;
      const last = user.lastName ?? user.family_name ?? "";
      const full = `${first ?? ""} ${last ?? ""}`.trim();
      if (full) return full;
      if (user.email) return user.email;
    }
    return "You";
  }, [activePatientProfile, user]);

  const fetchContractDetail = React.useCallback(async (contractId: number) => {
    try {
      const res = await apiClient.get(`/api/contracts/${contractId}`);
      const data = res?.data ?? {};
      const pickNumber = (value: any): number | null => {
        const num = Number(value);
        return Number.isFinite(num) ? num : null;
      };
      return {
        caseToTreat: data.caseToTreat ?? data.CaseToTreat ?? null,
        sessionDays: data.sessionDays ?? data.SessionDays ?? null,
        sessionStartTime:
          data.sessionStartTime ?? data.SessionStartTime ?? null,
        sessionEndTime: data.sessionEndTime ?? data.SessionEndTime ?? null,
        locationAddress: data.locationAddress ?? data.LocationAddress ?? null,
        professionalFee: pickNumber(
          data.professionalFee ?? data.ProfessionalFee
        ),
        locationFee: pickNumber(data.locationFee ?? data.LocationFee),
        miscellaneousFee: pickNumber(
          data.miscellaneousFee ?? data.MiscellaneousFee
        ),
        totalFee: pickNumber(data.totalFee ?? data.TotalFee),
      } as {
        caseToTreat?: string | null;
        sessionDays?: string | null;
        sessionStartTime?: string | null;
        sessionEndTime?: string | null;
        locationAddress?: string | null;
        professionalFee?: number | null;
        locationFee?: number | null;
        miscellaneousFee?: number | null;
        totalFee?: number | null;
      };
    } catch {
      return {};
    }
  }, []);

  // New useEffect to fetch initial pending contract status
  React.useEffect(() => {
    const fetchInitialPendingContract = async () => {
      // Case-insensitive role check
      console.log("[PendingContractBanner] Initial fetch check:", {
        hasUser: !!user,
        selectedRole,
        hasAccessToken: !!accessToken,
      });

      if (
        !user ||
        String(selectedRole ?? "").toLowerCase() !== "patient" ||
        !accessToken
      ) {
        console.log(
          "[PendingContractBanner] Skipping fetch - requirements not met"
        );
        return;
      }

      try {
        console.log("[PendingContractBanner] Fetching patient profiles...");
        // First, get the patient's profile ID
        const patientProfilesResponse = await apiClient.get(
          "/api/patient/profiles"
        );
        const patientProfiles = patientProfilesResponse.data;
        console.log(
          "[PendingContractBanner] Patient profiles:",
          patientProfiles
        );

        const activePatientProfile =
          patientProfiles.find((p: any) => p.isActive) || patientProfiles[0];

        if (!activePatientProfile?.id) {
          console.warn(
            "[PendingContractBanner] No active patient profile found for the current user."
          );
          setPatientProfileId(undefined); // Ensure it's reset if no active profile
          setActivePatientProfile(null);
          return;
        }

        const patientId = activePatientProfile.id;
        console.log("[PendingContractBanner] Active patient ID:", patientId);
        setPatientProfileId(String(patientId)); // Set the patientProfileId state
        setActivePatientProfile(activePatientProfile);

        console.log(
          "[PendingContractBanner] Fetching contracts for patient:",
          patientId
        );
        const response = await apiClient.get(
          `/api/contracts/patient/${patientId}`
        );
        const contracts = response.data;
        console.log(
          "[PendingContractBanner] Contracts fetched:",
          contracts.length
        );
        console.log(
          "[PendingContractBanner] Contract statuses:",
          contracts.map((c: any) => ({ id: c.id, status: c.status }))
        );

        // Case-insensitive status check
        const pendingContract = contracts.find(
          (c: any) =>
            String(c.status ?? "").toLowerCase() === "pendingconfirmation"
        );

        console.log(
          "[PendingContractBanner] Pending contract found:",
          !!pendingContract,
          pendingContract?.id
        );

        if (pendingContract) {
          const detail = await fetchContractDetail(pendingContract.id);
          // Fetch therapist details to get therapistName
          let therapistName: string | null = null;
          let therapistLicense: string | null = null;
          try {
            const therapistResponse = await apiClient.get(
              `/api/therapist/${pendingContract.physicalTherapistId}`
            );
            const therapistDetails = therapistResponse?.data ?? null;
            if (therapistDetails) {
              const first =
                therapistDetails.firstName ??
                therapistDetails.givenName ??
                therapistDetails.name ??
                therapistDetails.Name ??
                "";
              const last =
                therapistDetails.lastName ?? therapistDetails.familyName ?? "";
              const combined = `${first ?? ""} ${last ?? ""}`.trim();
              therapistName =
                combined ||
                therapistDetails.name ||
                therapistDetails.Name ||
                null;
              therapistLicense =
                therapistDetails.licenseNumber ??
                therapistDetails.LicenseNumber ??
                null;
            }
          } catch (err) {
            console.warn(
              "[PendingContractBanner] Failed to fetch therapist detail",
              err
            );
          }

          console.log("[PendingContractBanner] Setting pending state with:", {
            contractId: pendingContract.id,
            therapistName: therapistName ?? "Unknown Therapist",
            sessionDays: pendingContract.sessionDays ?? detail.sessionDays,
            totalFee: pendingContract.totalFee ?? detail.totalFee,
          });

          setPending({
            contractId: pendingContract.id,
            therapistName: therapistName ?? "Unknown Therapist",
            therapistLicense,
            sessionDays:
              pendingContract.sessionDays ?? detail.sessionDays ?? null,
            sessionStartTime:
              pendingContract.sessionStartTime ??
              detail.sessionStartTime ??
              null,
            sessionEndTime:
              pendingContract.sessionEndTime ?? detail.sessionEndTime ?? null,
            totalFee: pendingContract.totalFee ?? detail.totalFee ?? null,
            caseToTreat:
              pendingContract.caseToTreat ?? detail.caseToTreat ?? null,
            locationAddress:
              pendingContract.locationAddress ??
              pendingContract.patientAddress ??
              detail.locationAddress ??
              null,
            professionalFee: detail.professionalFee ?? null,
            locationFee: detail.locationFee ?? null,
            miscellaneousFee: detail.miscellaneousFee ?? null,
          });
          console.log(
            "[PendingContractBanner] Pending state set successfully!"
          );
        } else {
          console.log(
            "[PendingContractBanner] No pending contract found - clearing state"
          );
          setPending(null);
        }
      } catch (error) {
        console.error(
          "[PendingContractBanner] Failed to fetch initial pending contracts:",
          error
        );
        setPending(null);
      }
    };

    console.log(
      "[PendingContractBanner] Effect triggered - calling fetchInitialPendingContract"
    );
    fetchInitialPendingContract();
  }, [user, selectedRole, accessToken, fetchContractDetail]); // Re-run if user, role, or token changes

  React.useEffect(() => {
    if (!accessToken) return;

    let active = true;
    const unsubscribeFns: (() => void)[] = [];

    const setupConnection = async () => {
      try {
        const { default: signalrManager } = await import("@/src/services/signalrManager");
        await signalrManager.getSharedConnection('contracts', accessToken);

        if (!active) {
          signalrManager.releaseConnection('contracts');
          return;
        }

        unsubscribeFns.push(
          signalrManager.subscribeToEvent('contracts', "ContractPending", (payload: any) => {
            if (!active || !payload) return;
            queryClient
              .invalidateQueries({ queryKey: upcomingSessionsQueryKey })
              .catch(() => {});
            queryClient
              .invalidateQueries({ queryKey: allSessionsQueryKey })
              .catch(() => {});
            queryClient
              .invalidateQueries({ queryKey: ["sessions"] })
              .catch(() => {});
            const contractId = Number(payload.contractId);
            setPending((prev) => ({
              contractId,
              therapistName: payload.therapistName ?? prev?.therapistName ?? null,
              therapistLicense:
                payload.therapistLicense ?? prev?.therapistLicense ?? null,
              sessionDays: payload.sessionDays ?? prev?.sessionDays ?? null,
              sessionStartTime:
                payload.sessionStartTime ?? prev?.sessionStartTime ?? null,
              sessionEndTime:
                payload.sessionEndTime ?? prev?.sessionEndTime ?? null,
              totalFee: payload.totalFee ?? prev?.totalFee ?? null,
              caseToTreat: payload.caseToTreat ?? prev?.caseToTreat ?? null,
              locationAddress:
                payload.locationAddress ?? prev?.locationAddress ?? null,
              professionalFee: prev?.professionalFee ?? null,
              locationFee: prev?.locationFee ?? null,
              miscellaneousFee: prev?.miscellaneousFee ?? null,
            }));

            fetchContractDetail(contractId)
              .then((detail) => {
                if (!active) return;
                setPending((cur) => {
                  if (!cur || cur.contractId !== contractId) return cur;
                  return {
                    ...cur,
                    sessionDays: cur.sessionDays ?? detail.sessionDays ?? null,
                    sessionStartTime:
                      cur.sessionStartTime ?? detail.sessionStartTime ?? null,
                    sessionEndTime:
                      cur.sessionEndTime ?? detail.sessionEndTime ?? null,
                    totalFee: cur.totalFee ?? detail.totalFee ?? null,
                    caseToTreat: cur.caseToTreat ?? detail.caseToTreat ?? null,
                    locationAddress:
                      cur.locationAddress ?? detail.locationAddress ?? null,
                    professionalFee:
                      detail.professionalFee ?? cur.professionalFee ?? null,
                    locationFee: detail.locationFee ?? cur.locationFee ?? null,
                    miscellaneousFee:
                      detail.miscellaneousFee ?? cur.miscellaneousFee ?? null,
                  };
                });
              })
              .catch(() => {});
          }),
          signalrManager.subscribeToEvent('contracts', "ContractActivated", (payload: any) => {
            if (!active || !payload) return;
            const id = Number(payload.contractId);
            queryClient
              .invalidateQueries({ queryKey: upcomingSessionsQueryKey })
              .catch(() => {});
            queryClient
              .invalidateQueries({ queryKey: allSessionsQueryKey })
              .catch(() => {});
            queryClient
              .invalidateQueries({ queryKey: ["sessions"] })
              .catch(() => {});
            setPending((cur) => (cur && cur.contractId === id ? null : cur));
          }),
          signalrManager.subscribeToEvent('contracts', "ContractDeclined", (payload: any) => {
            if (!active || !payload) return;
            const id = Number(payload.contractId);
            queryClient
              .invalidateQueries({ queryKey: upcomingSessionsQueryKey })
              .catch(() => {});
            queryClient
              .invalidateQueries({ queryKey: allSessionsQueryKey })
              .catch(() => {});
            queryClient
              .invalidateQueries({ queryKey: ["sessions"] })
              .catch(() => {});
            setPending((cur) => (cur && cur.contractId === id ? null : cur));
          }),
          signalrManager.subscribeToEvent('contracts', "ContractEnded", (_payload: any) => {
            if (!active) return;
            // Contract end may affect schedules and notifications
            queryClient
              .invalidateQueries({ queryKey: upcomingSessionsQueryKey })
              .catch(() => {});
            queryClient
              .invalidateQueries({ queryKey: allSessionsQueryKey })
              .catch(() => {});
            queryClient
              .invalidateQueries({ queryKey: ["sessions"] })
              .catch(() => {});
          })
        );
      } catch (e) {
        // non-fatal
        console.warn("Contracts hub connection failed", e);
      }
    };

    setupConnection();

    return () => {
      active = false;
      unsubscribeFns.forEach(unsub => unsub());
      import("@/src/services/signalrManager").then(({ default: signalrManager }) => {
        signalrManager.releaseConnection('contracts');
      }).catch(() => {});
    };
  }, [accessToken, fetchContractDetail, queryClient]);

  console.log(
    "[PendingContractBanner] Rendering - pending:",
    !!pending,
    "selectedRole:",
    selectedRole
  );

  if (!pending) {
    console.log("[PendingContractBanner] Not rendering - no pending contract");
    return null;
  }

  console.log("[PendingContractBanner] Rendering orange banner!");
  const subtitleParts: string[] = [];
  if (pending.sessionDays) subtitleParts.push(pending.sessionDays);
  const formattedStart = formatTime12h(pending.sessionStartTime);
  const formattedEnd = formatTime12h(pending.sessionEndTime);
  if (formattedStart || formattedEnd) {
    subtitleParts.push(
      `${formattedStart ?? ""}${formattedEnd ? ` - ${formattedEnd}` : ""}`
    );
  }
  if (pending.totalFee != null)
    subtitleParts.push(
      `Total: ${formatPeso(pending.totalFee) ?? pending.totalFee}`
    );

  return (
    <View className="flex-row items-center px-3 py-2.5 bg-orange-50 border border-orange-200 rounded-xl mb-3 mx-3 mt-2">
      <View className="flex-1">
        <Text className="text-[13px] font-bold text-orange-800">
          Session proposal pending confirmation
        </Text>
        <Text className="text-xs text-orange-700 mt-0.5" numberOfLines={2}>
          {pending.therapistName ? `${pending.therapistName} • ` : ""}
          {subtitleParts.join(" • ")}
        </Text>
      </View>
      <TouchableOpacity
        onPress={() => {
          const timeRange = `${formattedStart ?? ""}${
            formattedEnd ? ` - ${formattedEnd}` : ""
          }`;
          const active = activePatientProfile ?? {};
          const lat =
            active?.location?.latitude ?? active?.latitude ?? undefined;
          const lng =
            active?.location?.longitude ?? active?.longitude ?? undefined;
          const patientName =
            patientDisplayName && patientDisplayName !== "You"
              ? patientDisplayName
              : undefined;
          const professionalFeeFormatted =
            pending.professionalFee != null
              ? formatPeso(pending.professionalFee) ??
                String(pending.professionalFee)
              : undefined;
          const locationFeeFormatted =
            pending.locationFee != null
              ? formatPeso(pending.locationFee) ?? String(pending.locationFee)
              : undefined;
          const miscFeeFormatted =
            pending.miscellaneousFee != null
              ? formatPeso(pending.miscellaneousFee) ??
                String(pending.miscellaneousFee)
              : undefined;
          const totalFormatted =
            pending.totalFee != null
              ? formatPeso(pending.totalFee) ?? String(pending.totalFee)
              : undefined;

          router.push({
            pathname: "/create-session",
            params: {
              therapistName: pending.therapistName ?? undefined,
              therapistLicense: pending.therapistLicense ?? undefined,
              patientName,
              address: pending.locationAddress ?? active?.address ?? undefined,
              barangay:
                active?.barangay ??
                active?.barangayName ??
                active?.location?.barangay ??
                undefined,
              lat: lat != null ? String(lat) : undefined,
              lng: lng != null ? String(lng) : undefined,
              caseTitle: pending.caseToTreat ?? undefined,
              day: pending.sessionDays ?? undefined,
              timeRange: timeRange || undefined,
              fee: professionalFeeFormatted,
              locFee: locationFeeFormatted,
              toolsFee: miscFeeFormatted,
              total: totalFormatted,
              contractId: String(pending.contractId),
              profileId: patientProfileId, // Use the stored patientProfileId
            },
          } as any);
        }}
        className="bg-orange-600 px-3 py-2 rounded-lg ml-3"
      >
        <Text className="text-white font-bold">Review</Text>
      </TouchableOpacity>
    </View>
  );
}

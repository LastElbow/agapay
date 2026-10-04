import TherapistVerificationBanner from "@/src/components/TherapistVerificationBanner";
import {
  fetchAllSessions,
  upcomingSessionsQueryKey,
  type SessionSummary,
} from "@/src/services/sessions";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import {
  ArrowLeft,
  Calendar,
  Clock,
  MapPin,
  FileText,
} from "lucide-react-native";
import { View, Text, TouchableOpacity, FlatList } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Skeleton from "@/src/components/Skeleton";
import { useTherapistStatus } from "@/src/hooks/useTherapistStatus";

const UPCOMING_SESSION_STATUSES = new Set(["scheduled", "accepted", "active"]);

const ENDED_CONTRACT_STATUSES = new Set([
  "completed",
  "terminated",
  "cancelled",
  "canceled",
  "expired",
]);

const FINAL_SESSION_STATUSES = new Set([
  "completed",
  "terminated",
  "cancelled",
  "canceled",
]);

function SessionCard({ session }: { session: SessionSummary }) {
  const router = useRouter();

  const resolveStatusDisplay = () => {
    const contractStatusRaw = session.contractStatus ?? "";
    const contractStatus = contractStatusRaw.trim().toLowerCase();
    const baseStatusRaw = session.status ?? "";
    const baseStatus = baseStatusRaw.trim().toLowerCase();

    if (contractStatus === "completed") {
      return {
        label: "Contract Complete",
        badgeClass: "bg-green-100 text-green-800",
      };
    }
    if (contractStatus === "terminated") {
      return {
        label: "Discontinued",
        badgeClass: "bg-red-100 text-red-800",
      };
    }
    if (contractStatus === "pendingconfirmation") {
      return {
        label: "Pending Confirmation",
        badgeClass: "bg-amber-100 text-amber-800",
      };
    }

    const titleize = (v: string) =>
      v ? v.charAt(0).toUpperCase() + v.slice(1) : v;

    // Check if session has been rescheduled and show "Rescheduled" instead of "Scheduled"
    if (session.isRescheduled && baseStatus === "scheduled") {
      return { label: "Rescheduled", badgeClass: "bg-amber-100 text-amber-800" };
    }

    if (baseStatus === "active")
      return { label: "Active", badgeClass: "bg-blue-100 text-blue-800" };
    if (baseStatus === "completed")
      return { label: "Completed", badgeClass: "bg-green-100 text-green-800" };
    if (["cancelled", "canceled"].includes(baseStatus))
      return {
        label: titleize(baseStatus),
        badgeClass: "bg-red-100 text-red-800",
      };
    if (baseStatus === "terminated")
      return { label: "Discontinued", badgeClass: "bg-red-100 text-red-800" };

    const label = baseStatus ? titleize(baseStatus) : "Active";
    return { label, badgeClass: "bg-blue-100 text-blue-800" };
  };

  const { label: statusLabel, badgeClass: statusBadgeClass } =
    resolveStatusDisplay();

  const formatSessionDate = (startIso: string) => {
    const date = new Date(startIso);
    if (Number.isNaN(date.getTime())) return "Upcoming Session";
    return new Intl.DateTimeFormat(undefined, {
      weekday: "long",
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(date);
  };

  const formatSessionTimeRange = (startIso: string, endIso: string) => {
    const start = new Date(startIso);
    const end = new Date(endIso);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return "";
    const formatter = new Intl.DateTimeFormat(undefined, {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
    return `${formatter.format(start)} - ${formatter.format(end)}`;
  };

  const handleOpenSession = () => {
    router.push({
      pathname: "/session-view",
      params: {
        sessionId: String(session.id),
        profileId: String(session.patientId),
        therapistName: session.therapistName ?? undefined,
        patientName: session.patientName ?? undefined,
        startAt: session.startAt,
        endAt: session.endAt,
      },
    } as any);
  };

  return (
    <TouchableOpacity
      className="bg-white p-4 rounded-xl mb-4 border border-gray-200"
      onPress={handleOpenSession}
    >
      <View className="flex-row justify-between items-center mb-3">
        <Text className="text-lg font-bold text-gray-800">
          {session.patientName || "Patient"}
        </Text>
        <Text
          className={`text-xs font-bold px-2 py-1 rounded-full ${statusBadgeClass}`}
        >
          {statusLabel}
        </Text>
      </View>
      <View className="flex-row items-center mb-2">
        <Calendar size={16} color="#6B7280" />
        <Text className="text-gray-600 ml-2">
          {formatSessionDate(session.startAt)}
        </Text>
      </View>
      <View className="flex-row items-center mb-2">
        <Clock size={16} color="#6B7280" />
        <Text className="text-gray-600 ml-2">
          {formatSessionTimeRange(session.startAt, session.endAt)}
        </Text>
      </View>
      {session.conditionCase ? (
        <View className="flex-row items-center mb-2">
          <FileText size={16} color="#6B7280" />
          <Text className="text-gray-600 ml-2">{session.conditionCase}</Text>
        </View>
      ) : null}
      {session.locationAddress && (
        <View className="flex-row items-center">
          <MapPin size={16} color="#6B7280" />
          <Text className="text-gray-600 ml-2">{session.locationAddress}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

function SessionSkeleton() {
  return (
    <View className="bg-white p-4 rounded-xl mb-4 border border-gray-200">
      <View className="flex-row justify-between items-center mb-3">
        <Skeleton style={{ width: 128, height: 24 }} />
        <Skeleton style={{ width: 80, height: 24 }} />
      </View>
      <Skeleton style={{ width: 160, height: 20, marginBottom: 8 }} />
      <Skeleton style={{ width: 192, height: 20, marginBottom: 8 }} />
      <Skeleton style={{ width: "100%", height: 20 }} />
    </View>
  );
}

export default function TherapistUpcomingSessionsScreen() {
  const router = useRouter();
  const therapistStatus = useTherapistStatus();
  const { isRestricted, isVerified, onboardingComplete } = therapistStatus;
  const canAccessCoreFeatures = isVerified && onboardingComplete;

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: [...upcomingSessionsQueryKey, "therapist-full"],
    queryFn: () => fetchAllSessions(),
    enabled: canAccessCoreFeatures,
    staleTime: 60 * 1000,
    gcTime: 5 * 60 * 1000,
  });

  const now = new Date();
  const nowMs = now.getTime();
  const upcomingSessions = Array.isArray(data)
    ? data
      .filter((session) => {
        const sessionStatus = (session.status ?? "").trim().toLowerCase();
        const contractStatus = (session.contractStatus ?? "")
          .trim()
          .toLowerCase();

        const isContractEnded = ENDED_CONTRACT_STATUSES.has(contractStatus);
        const isSessionFinal = FINAL_SESSION_STATUSES.has(sessionStatus);
        if (isContractEnded || isSessionFinal) return false;

        const endMs = new Date(session.endAt).getTime();
        if (!Number.isFinite(endMs)) return false;

        // Show ongoing (now between start/end) and future sessions
        return endMs >= nowMs;
      })
      .sort((a, b) => {
        const aTime = new Date(a.startAt).getTime();
        const bTime = new Date(b.startAt).getTime();
        if (!Number.isFinite(aTime) && !Number.isFinite(bTime)) return 0;
        if (!Number.isFinite(aTime)) return 1;
        if (!Number.isFinite(bTime)) return -1;
        return aTime - bTime;
      })
    : [];

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <View className="flex-row items-center p-4 border-b border-gray-200 bg-white">
        <TouchableOpacity onPress={() => router.back()} className="mr-4">
          <ArrowLeft size={24} color="#1F2937" />
        </TouchableOpacity>
        <Text className="text-xl font-bold text-gray-800">
          Upcoming Sessions
        </Text>
      </View>

      <View className="flex-1 p-4">
        <TherapistVerificationBanner style={{ marginBottom: 16 }} />

        {isRestricted ? (
          <View className="flex-1 items-center justify-center px-4">
            <Text className="text-base font-semibold text-gray-900 text-center mb-2">
              Upcoming sessions locked
            </Text>
            <Text className="text-sm text-gray-600 text-center">
              You&apos;ll see your upcoming sessions once your therapist profile
              is approved.
            </Text>
          </View>
        ) : isLoading ? (
          <View>
            <SessionSkeleton />
            <SessionSkeleton />
            <SessionSkeleton />
          </View>
        ) : isError ? (
          <View className="flex-1 items-center justify-center">
            <Text className="text-red-500 mb-4">
              Error fetching sessions: {error?.message ?? "Unknown error"}
            </Text>
            <TouchableOpacity
              onPress={() => refetch()}
              className="bg-blue-600 p-3 rounded-lg"
            >
              <Text className="text-white">Retry</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <FlatList
            data={upcomingSessions}
            renderItem={({ item }) => <SessionCard session={item} />}
            keyExtractor={(item) => item.id.toString()}
            ListEmptyComponent={() => (
              <View className="flex-1 items-center justify-center mt-16">
                <Text className="text-lg font-semibold text-gray-700">
                  No upcoming sessions
                </Text>
                <Text className="text-gray-500 mt-2">
                  You have no scheduled sessions.
                </Text>
              </View>
            )}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

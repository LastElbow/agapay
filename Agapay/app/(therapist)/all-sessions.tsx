import TherapistVerificationBanner from "@/src/components/TherapistVerificationBanner";
import { fetchAllSessions, allSessionsQueryKey, type SessionSummary } from "@/src/services/sessions";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { ArrowLeft, Calendar, Clock, MapPin, FileText } from "lucide-react-native";
import { View, Text, TouchableOpacity, FlatList } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Skeleton from "@/src/components/Skeleton";
import { useTherapistStatus } from "@/src/hooks/useTherapistStatus";

const ACTIVE_SESSION_STATUSES = new Set([
    "scheduled",
    "pendingconfirmation",
    "accepted",
    "active",
    "done for today",
]);

function SessionCard({ session }: { session: SessionSummary }) {
    const router = useRouter();

    const formatSessionDate = (startIso: string) => {
        const date = new Date(startIso);
        if (Number.isNaN(date.getTime())) return "Upcoming Session";
        return new Intl.DateTimeFormat(undefined, {
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

    const resolveStatusDisplay = () => {
        const contractStatusRaw = session.contractStatus ?? "";
        const contractStatus = contractStatusRaw.trim().toLowerCase();
        const baseStatusRaw = session.status ?? "";
        const baseStatus = baseStatusRaw.trim().toLowerCase();

        const titleize = (value: string) =>
            value.charAt(0).toUpperCase() + value.slice(1);

        // Show "Inactive" for ended contracts or cancelled sessions
        const isContractEnded = contractStatus === "completed" || contractStatus === "terminated";
        const isSessionCancelled = baseStatus === "cancelled" || baseStatus === "canceled";

        if (isContractEnded || isSessionCancelled) {
            return {
                label: "Inactive",
                badgeClass: "bg-gray-200 text-gray-800",
            };
        }

        if (baseStatus === "terminated") {
            return {
                label: "Inactive",
                badgeClass: "bg-gray-200 text-gray-800",
            };
        }

        if (baseStatus === "completed") {
            return {
                label: "Completed",
                badgeClass: "bg-green-100 text-green-800",
            };
        }

        if (baseStatus === "donefortoday") {
            return {
                label: "Done for today",
                badgeClass: "bg-gray-200 text-gray-600",
            };
        }

        const label = baseStatus ? titleize(baseStatus) : "Upcoming";
        return {
            label: label === "Scheduled" ? "Upcoming" : label,
            badgeClass: "bg-blue-100 text-blue-800",
        };
    };

    const { label: statusLabel, badgeClass: statusBadgeClass } = resolveStatusDisplay();

    const normalizedContractStatus = (session.contractStatus ?? "").trim().toLowerCase();
    const normalizedSessionStatus = (session.status ?? "").trim().toLowerCase();
    const isContractEnded =
        normalizedContractStatus === "completed" || normalizedContractStatus === "terminated";
    const isSessionFinal =
        normalizedSessionStatus === "completed" ||
        normalizedSessionStatus === "terminated" ||
        normalizedSessionStatus === "cancelled" ||
        normalizedSessionStatus === "canceled";
    const isEditable = !isContractEnded && !isSessionFinal;

    const handleOpenSession = () => {
        const params: Record<string, string> = {
            patientName: session.patientName || "Patient",
            therapistName: "Therapist",
            caseTitle: session.conditionCase || "Therapy Session",
            day: formatSessionDate(session.startAt),
            timeRange: formatSessionTimeRange(session.startAt, session.endAt),
            duration: `${session.durationMinutes} mins`,
            profileId: String(session.patientId),
            sessionId: String(session.id),
            editable: String(isEditable),
        };

        if (session.locationAddress) params.address = session.locationAddress;
        if (session.latitude != null) params.lat = String(session.latitude);
        if (session.longitude != null) params.lng = String(session.longitude);

        router.push({ pathname: "/create-session", params } as any);
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
                <Text className="text-gray-600 ml-2">{formatSessionDate(session.startAt)}</Text>
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

export default function TherapistAllSessionsScreen() {
    const router = useRouter();
    const therapistStatus = useTherapistStatus();
    const { isRestricted, isVerified, onboardingComplete } = therapistStatus;
    const canAccessCoreFeatures = isVerified && onboardingComplete;

    const { data, isLoading, isError, error, refetch } = useQuery({
        queryKey: allSessionsQueryKey,
        queryFn: () => fetchAllSessions(),
        enabled: canAccessCoreFeatures,
    });

    const sessions = Array.isArray(data)
        ? (() => {
            const nowMs = Date.now();
            // First, filter for active sessions
            const activeSessions = data.filter((session) => {
                const contractStatus = (session.contractStatus ?? "").trim().toLowerCase();
                const sessionStatus = (session.status ?? "").trim().toLowerCase();

                const isContractActive = contractStatus === "active";
                const isSessionActive = ACTIVE_SESSION_STATUSES.has(sessionStatus);

                // Also check if session is in the future or ongoing
                if (sessionStatus === "donefortoday") return true;
                const endMs = new Date(session.endAt).getTime();
                if (!Number.isFinite(endMs)) return false;
                const isFutureOrOngoing = endMs >= nowMs;

                return isContractActive && isSessionActive && isFutureOrOngoing;
            });

            // Sort by start time to find the first upcoming session
            const sortedSessions = activeSessions.sort(
                (a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime()
            );

            // Exclude the first session (which is shown in Upcoming Sessions)
            return sortedSessions.slice(1);
        })()
        : [];

    return (
        <SafeAreaView className="flex-1 bg-gray-50">
            <View className="flex-row items-center p-4 border-b border-gray-200 bg-white">
                <TouchableOpacity onPress={() => router.back()} className="mr-4">
                    <ArrowLeft size={24} color="#1F2937" />
                </TouchableOpacity>
                <Text className="text-xl font-bold text-gray-800">All Sessions</Text>
            </View>

            <View className="flex-1 p-4">
                <TherapistVerificationBanner style={{ marginBottom: 16 }} />

                {isRestricted ? (
                    <View className="flex-1 items-center justify-center px-4">
                        <Text className="text-base font-semibold text-gray-900 text-center mb-2">
                            Sessions locked
                        </Text>
                        <Text className="text-sm text-gray-600 text-center">
                            You&apos;ll see your sessions once your therapist profile
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
                        <TouchableOpacity onPress={() => refetch()} className="bg-blue-600 p-3 rounded-lg">
                            <Text className="text-white">Retry</Text>
                        </TouchableOpacity>
                    </View>
                ) : (
                    <FlatList
                        data={sessions}
                        renderItem={({ item }) => <SessionCard session={item} />}
                        keyExtractor={(item) => item.id.toString()}
                        ListEmptyComponent={() => (
                            <View className="flex-1 items-center justify-center mt-16">
                                <Text className="text-lg font-semibold text-gray-700">No active sessions</Text>
                                <Text className="text-gray-500 mt-2">You don&apos;t have any active sessions at the moment.</Text>
                            </View>
                        )}
                    />
                )}
            </View>
        </SafeAreaView>
    );
}
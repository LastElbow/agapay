import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import {
  ArrowLeft,
  Phone,
  User,
  MapPin,
  Award,
  Star,
  MessageCircle,
  ChevronDown,
  ChevronUp,
  Clock,
} from "lucide-react-native";
import React from "react";
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import WebHeader from "@/src/components/WebHeader";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  createConversation,
  upsertConversationCache,
} from "@/src/services/chat";
import {
  fetchTherapistById,
  TherapistDetailDto,
  therapistDetailQueryKey,
} from "@/src/services/therapists";
import {
  fetchTherapistAvailability,
  fetchBookedIntervals,
  type TherapistAvailability,
} from "@/src/services/availability";
import {
  fetchTherapistRatingsById,
  therapistRatingsByIdQueryKey,
  type TherapistRating,
} from "@/src/services/ratings";
import { getWeekRange } from "@/src/features/scheduling/core/weekRange";
// ...existing code...
import { resolveAvatarSource } from "@/src/utils/avatar";
import { formatPeso } from "@/src/utils/money";
import InAppModal from "@/src/components/InAppModal";

const AVATAR_FALLBACK = require("@/assets/images/react-logo.png");

function getInitials(name?: string | null) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

type RouteParams = {
  therapistId?: string | string[];
};

const formatList = (values?: string[] | null) => {
  if (!Array.isArray(values) || values.length === 0) {
    return "Not specified";
  }

  return values
    .map((item) => item?.trim())
    .filter((item): item is string => Boolean(item))
    .join(", ");
};

const DAY_INDEX_BY_NAME: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

const normalizeDayOfWeek = (
  value: TherapistAvailability["dayOfWeek"],
): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;

    const numeric = Number(trimmed);
    if (!Number.isNaN(numeric)) {
      return numeric;
    }

    const lowered = trimmed.toLowerCase();
    const normalized = lowered.includes(".")
      ? lowered.substring(lowered.lastIndexOf(".") + 1)
      : lowered;

    return DAY_INDEX_BY_NAME[normalized] ?? null;
  }

  return null;
};

// rating formatting moved inline where needed

export default function TherapistDetailScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<RouteParams>();
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === "web" && width >= 768;

  const rawTherapistId = params?.therapistId;
  const therapistId = Array.isArray(rawTherapistId)
    ? (rawTherapistId[0] ?? null)
    : (rawTherapistId ?? null);

  const query = useQuery({
    queryKey: therapistId
      ? therapistDetailQueryKey(therapistId)
      : ["therapist", "unknown"],
    queryFn: () => fetchTherapistById(therapistId as string),
    enabled: Boolean(therapistId),
    staleTime: 60_000,
    gcTime: 600_000,
    refetchOnReconnect: true,
    refetchOnWindowFocus: true,
  });

  const therapist = (query.data ?? null) as TherapistDetailDto | null;

  // State for This Week / Next Week toggle
  const [scheduleWeek, setScheduleWeek] = React.useState<0 | 1>(0);

  // Calculate date range for selected week (Mon-Sun)
  const today = React.useMemo(() => new Date(), []);
  const { startDate, endDate } = React.useMemo(() => {
    const { start, end } = getWeekRange(today, scheduleWeek);
    return { startDate: start.toISOString(), endDate: end.toISOString() };
  }, [today, scheduleWeek]);

  // Query 1: Fetch therapist's general weekly availability
  const availabilityQuery = useQuery({
    queryKey: ["availability", therapistId],
    queryFn: () => fetchTherapistAvailability(therapistId as string),
    enabled: Boolean(therapistId),
    staleTime: 60_000,
  });

  // Query 2: Fetch booked sessions for the next 7 days
  const bookedSlotsQuery = useQuery({
    queryKey: ["bookedSlots", therapistId, startDate, endDate],
    queryFn: () =>
      fetchBookedIntervals(therapistId as string, startDate, endDate),
    enabled: Boolean(therapistId),
    staleTime: 60_000,
  });

  // Query 3: Fetch therapist ratings
  const ratingsQuery = useQuery({
    queryKey: therapistId
      ? therapistRatingsByIdQueryKey(therapistId)
      : ["ratings", "unknown"],
    queryFn: () => fetchTherapistRatingsById(therapistId as string),
    enabled: Boolean(therapistId),
    staleTime: 60_000,
    gcTime: 600_000,
  });

  const ratingsData = (ratingsQuery.data ?? []) as TherapistRating[];

  const sortedServiceAreas = React.useMemo(() => {
    return [...(therapist?.serviceAreas ?? [])].sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: "base" })
    );
  }, [therapist?.serviceAreas]);

  // Track expanded review IDs
  const [expandedReviewId, setExpandedReviewId] = React.useState<number | null>(
    null,
  );

  const toggleReviewExpansion = (reviewId: number) => {
    setExpandedReviewId(expandedReviewId === reviewId ? null : reviewId);
  };

  // Process and calculate live slots for the week view
  // This should match what the therapist sees in their "My Schedule" page
  const weekSchedule = React.useMemo(() => {
    if (!availabilityQuery.data || !bookedSlotsQuery.data) {
      return [];
    }

    const availability = availabilityQuery.data;
    const bookedIntervals = bookedSlotsQuery.data;

    const schedule: {
      day: string;
      date: string;
      fullDate: Date;
      slots: {
        time: string;
        available: boolean;
        isPast: boolean;
        isBooked: boolean;
      }[];
    }[] = [];

    const dayNames = [
      "Sunday",
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
    ];
    const monthNames = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];

    // Calculate the start of the current week (Monday) for Mon-Sun ordering
    const todayIndex = today.getDay(); // 0=Sunday..6=Saturday
    // Days since Monday: Sunday(0) -> 6, Monday(1) -> 0, Tuesday(2) -> 1, etc.
    const daysSinceMonday = todayIndex === 0 ? 6 : todayIndex - 1;
    const startOfThisWeek = new Date(today);
    startOfThisWeek.setDate(today.getDate() - daysSinceMonday);
    startOfThisWeek.setHours(0, 0, 0, 0);

    // Calculate the start of the target week based on scheduleWeek
    const startOfTargetWeek = new Date(startOfThisWeek);
    if (scheduleWeek === 1) {
      // Next week: add 7 days to start of this week
      startOfTargetWeek.setDate(startOfThisWeek.getDate() + 7);
    }

    const endOfTargetWeek = new Date(startOfTargetWeek);
    endOfTargetWeek.setDate(startOfTargetWeek.getDate() + 6);
    endOfTargetWeek.setHours(23, 59, 59, 999);

    // Iterate through 7 days of the target week (Monday to Sunday)
    for (let i = 0; i < 7; i++) {
      const currentDate = new Date(startOfTargetWeek);
      currentDate.setDate(startOfTargetWeek.getDate() + i);
      currentDate.setHours(0, 0, 0, 0);

      const dayOfWeek = currentDate.getDay(); // 0=Sunday..6=Saturday
      const dayName = dayNames[dayOfWeek];
      const dateStr = `${monthNames[currentDate.getMonth()]} ${currentDate.getDate()}`;

      // Format current date as YYYY-MM-DD for matching
      const year = currentDate.getFullYear();
      const month = String(currentDate.getMonth() + 1).padStart(2, "0");
      const day = String(currentDate.getDate()).padStart(2, "0");
      const currentDateStr = `${year}-${month}-${day}`;

      // Find availability blocks with SPECIFIC-DATE entries only (matching therapist's schedule)
      // This ensures we show exactly what the therapist configured for this week
      const dayAvailability = availability.filter((block) => {
        if (!block.isAvailable) return false;

        // 1. Check for specific date match
        if (block.specificDate) {
          const blockDateStr = String(block.specificDate).split("T")[0];
          return blockDateStr === currentDateStr;
        }

        // 2. Check for recurring weekly match (fallback if no specific date is set on the block)
        const blockDayOfWeek = normalizeDayOfWeek(block.dayOfWeek);
        if (blockDayOfWeek === dayOfWeek) {
          return true;
        }

        return false;
      });

      // Use a Set to deduplicate slots by their time string
      const slotSet = new Set<string>();
      const slots: {
        time: string;
        available: boolean;
        isPast: boolean;
        isBooked: boolean;
      }[] = [];

      // For each availability block, discretize into 1-hour slots
      dayAvailability.forEach((block) => {
        const [startHour, startMin] = block.startTime.split(":").map(Number);
        const [endHour, endMin] = block.endTime.split(":").map(Number);

        const startMinutes = startHour * 60 + startMin;
        const endMinutes = endHour * 60 + endMin;

        // Generate 1-hour slots
        for (
          let slotStart = startMinutes;
          slotStart < endMinutes;
          slotStart += 60
        ) {
          const slotHour = Math.floor(slotStart / 60);
          const slotMin = slotStart % 60;

          // Create the slot start time
          const slotStartTime = new Date(currentDate);
          slotStartTime.setHours(slotHour, slotMin, 0, 0);

          // Create the slot end time (1 hour later)
          const slotEndTime = new Date(slotStartTime);
          slotEndTime.setTime(slotEndTime.getTime() + 60 * 60 * 1000);

          // Format the time for display (start and end)
          const startHour12 = slotHour % 12 || 12;
          const startAmpm = slotHour < 12 ? "AM" : "PM";
          const startTimeStr = `${startHour12}:${slotMin
            .toString()
            .padStart(2, "0")}`;

          // Format end time
          const endHour24 = slotEndTime.getHours();
          const endMinute = slotEndTime.getMinutes();
          const endHour12 = endHour24 % 12 || 12;
          const endAmpm = endHour24 < 12 ? "AM" : "PM";
          const endTimeStr = `${endHour12}:${endMinute
            .toString()
            .padStart(2, "0")}`;

          // Combine start and end times with AM/PM for both
          const timeStr = `${startTimeStr} ${startAmpm} - ${endTimeStr} ${endAmpm}`;

          // Skip if we already have this slot (deduplication)
          if (slotSet.has(timeStr)) continue;
          slotSet.add(timeStr);

          // Check if this slot conflicts with any booked session
          const isBooked = bookedIntervals.some((booked) => {
            const bookedStart = new Date(booked.startAt);
            const bookedEnd = new Date(booked.endAt);

            // Check for overlap: slot overlaps with booked if slot.start < booked.end AND slot.end > booked.start
            return slotStartTime < bookedEnd && slotEndTime > bookedStart;
          });

          // Add slot - show all slots (including past) as available unless booked
          // This presents a fuller picture of the therapist's schedule for patients browsing
          slots.push({
            time: timeStr,
            available: !isBooked,
            isPast: false, // Not tracking past status - we show all slots as normal
            isBooked,
          });
        }
      });

      // Sort slots by time
      slots.sort((a, b) => a.time.localeCompare(b.time));

      schedule.push({
        day: dayName,
        date: dateStr,
        fullDate: currentDate,
        slots: slots,
      });
    }

    return schedule;
  }, [availabilityQuery.data, bookedSlotsQuery.data, today, scheduleWeek]);

  const [modalVisible, setModalVisible] = React.useState(false);
  const [modalTitle, setModalTitle] = React.useState<string | undefined>(
    undefined,
  );
  const [modalMessage, setModalMessage] = React.useState<string | undefined>(
    undefined,
  );
  const [modalShowCancel, setModalShowCancel] = React.useState(false);
  const [modalConfirmText, setModalConfirmText] = React.useState("OK");
  const [modalAction, setModalAction] = React.useState<"none" | "inquire">(
    "none",
  );
  const [pendingConvId, setPendingConvId] = React.useState<string | null>(null);

  const performInquire = React.useCallback(async () => {
    const name = therapist?.name?.trim() || "Therapist";
    const role = "Physical Therapist";

    // The backend now includes the owning user GUID on therapist details as `userId`.
    const ownerUserId = therapist?.userId ?? null;

    if (!ownerUserId) {
      setModalTitle("Messaging unavailable");
      setModalMessage(
        "We couldn't find this therapist's chat account. The backend should include the owning userId on the therapist details.",
      );
      setModalShowCancel(false);
      setModalConfirmText("OK");
      setModalAction("none");
      setModalVisible(true);
      return;
    }

    try {
      // Call backend to create/get conversation using the owner's user GUID
      const created = await createConversation(String(ownerUserId));

      if (!created) {
        setModalTitle("Failed");
        setModalMessage(
          "Could not start conversation. Please try again later.",
        );
        setModalShowCancel(false);
        setModalConfirmText("OK");
        setModalAction("none");
        setModalVisible(true);
        return;
      }

      const convId = String(created.otherUserId ?? ownerUserId);

      // Upsert the conversation into the cache using the returned data
      upsertConversationCache(queryClient, {
        otherUserId: convId,
        otherUserName: created.otherUserName ?? name,
        otherUserRole: created.otherUserRole ?? role,
        otherUserAvatar:
          created.otherUserAvatar ?? therapist?.profilePictureUrl ?? null,
        latestMessage: created.latestMessage ?? null,
        latestMessageTimestamp: created.latestMessageTimestamp ?? null,
        unreadCount: created.unreadCount ?? 0,
      });

      // Navigate directly to the conversation screen
      router.push({
        pathname: "/messages/[conversationId]",
        params: {
          conversationId: convId,
          name: created.otherUserName ?? name,
          role: created.otherUserRole ?? role,
          avatar:
            (typeof created.otherUserAvatar === "string"
              ? created.otherUserAvatar
              : therapist?.profilePictureUrl) ?? undefined,
        },
      });
    } catch (e) {
      console.error("Failed to start conversation", e);
      setModalTitle("Failed");
      setModalMessage("Could not start conversation. Please try again later.");
      setModalShowCancel(false);
      setModalConfirmText("OK");
      setModalAction("none");
      setModalVisible(true);
    }
  }, [queryClient, router, therapist]);

  const isLoading = query.isLoading && !query.isSuccess && !query.isError;
  const error = query.error as any;
  const errorMessage = error?.response?.data?.message || error?.message || null;

  const avatarSource = resolveAvatarSource(
    therapist?.profilePictureUrl ?? null,
    AVATAR_FALLBACK,
  );

  const genderLabel =
    therapist?.gender && String(therapist.gender).trim().length > 0
      ? String(therapist.gender).trim()
      : "Gender not specified";

  return (
    <View className="flex-1 bg-[#e6f5f0]">
      {isDesktop && <WebHeader />}
      <SafeAreaView
        className={`flex-1 ${isDesktop ? "bg-transparent" : "bg-transparent"}`}
      >
        <StatusBar style="dark" backgroundColor="#e6f5f0" />

        {isDesktop ? (
          <View className="px-8 py-6 bg-transparent">
            <View className="max-w-4xl mx-auto w-full">
              <TouchableOpacity
                onPress={() => router.back()}
                className="flex-row items-center self-start px-4 py-2 rounded-full bg-white border border-gray-200 mb-4"
              >
                <ArrowLeft size={16} color="#089769" />
                <Text className="ml-2 text-[#089769] font-medium">Back</Text>
              </TouchableOpacity>
              <Text className="text-xs font-semibold text-[#089769] uppercase tracking-widest mb-1">
                THERAPIST DETAILS
              </Text>
              <Text className="text-3xl font-bold text-gray-900 mb-1">
                Therapist Profile
              </Text>
              <Text className="text-gray-500 text-base">
                View detailed information and availability
              </Text>
            </View>
          </View>
        ) : (
          <View className="flex-row items-center px-5 py-3 bg-white border-b border-gray-200">
            <TouchableOpacity
              accessibilityHint="Go back to the previous screen"
              accessibilityRole="button"
              onPress={() => router.back()}
              className="w-10 h-10 rounded-xl bg-[#e6f5f0] items-center justify-center mr-3"
            >
              <ArrowLeft color="#089769" size={22} />
            </TouchableOpacity>
            <Text className="text-2xl font-bold text-gray-900">
              Therapist Profile
            </Text>
          </View>
        )}

        {isLoading ? (
          <View className="flex-1 justify-center items-center">
            <ActivityIndicator color="#089769" size="large" />
          </View>
        ) : errorMessage ? (
          <View className="flex-1 justify-center items-center px-6">
            <Text className="text-base text-red-600 text-center">
              {errorMessage}
            </Text>
          </View>
        ) : !therapist ? (
          <View className="flex-1 justify-center items-center px-6">
            <Text className="text-base text-red-600 text-center">
              Unable to load therapist details. Please try again later.
            </Text>
          </View>
        ) : (
          <ScrollView
            className="flex-1 bg-transparent"
            contentContainerStyle={{
              paddingBottom: 100,
              paddingHorizontal: isDesktop ? 24 : 0,
            }}
          >
            <View className={isDesktop ? "max-w-4xl mx-auto w-full" : ""}>
              <View
                className={`bg-white mx-4 mt-4 rounded-2xl overflow-hidden border border-gray-200 ${
                  isDesktop ? "border-l-4 border-l-[#089769]" : ""
                }`}
              >
                <View className="items-center pt-8 pb-4">
                  {avatarSource !== AVATAR_FALLBACK ? (
                    <Image
                      source={avatarSource}
                      className="w-28 h-28 rounded-full mb-4 border-2 border-[#089769]"
                      contentFit="cover"
                    />
                  ) : (
                    <View className="w-28 h-28 rounded-full mb-4 bg-[#089769] items-center justify-center">
                      <Text className="text-4xl font-bold text-white">
                        {getInitials(therapist.name)}
                      </Text>
                    </View>
                  )}

                  <Text className="text-2xl font-bold text-gray-900 text-center px-4">
                    {therapist.name?.trim() || "Unnamed Therapist"}
                  </Text>

                  <View className="flex-row items-center mt-1">
                    <Award color="#6B7280" size={14} />
                    <Text className="text-sm text-gray-500 ml-1">
                      License No. {therapist.licenseNumber ?? "-"}
                    </Text>
                  </View>
                </View>

                <View className="flex-row border-t border-gray-100 py-5">
                  <View className="flex-1 items-center">
                    <View className="flex-row items-center mb-1">
                      <Star color="#F59E0B" size={18} fill="#F59E0B" />
                      <Text className="text-xl font-bold text-gray-900 ml-1">
                        {therapist.averageRating != null &&
                        Number.isFinite(Number(therapist.averageRating))
                          ? Number(therapist.averageRating).toFixed(1)
                          : "-"}
                      </Text>
                    </View>
                    <Text className="text-xs text-gray-500 font-medium">
                      Rating
                    </Text>
                  </View>

                  <View className="w-px h-12 bg-gray-200" />

                  <View className="flex-1 items-center">
                    <Text className="text-xl font-bold text-gray-900 mb-1">
                      {therapist.ratingCount ?? 0}
                    </Text>
                    <Text className="text-xs text-gray-500 font-medium">
                      Reviews
                    </Text>
                  </View>
                </View>

                <View className="border-t border-gray-100 px-5 py-4 space-y-3">
                  <View className="flex-row items-center">
                    <View className="w-8 h-8 rounded-lg bg-[#E6F4F0] items-center justify-center mr-3">
                      <User color="#089769" size={16} />
                    </View>
                    <Text className="text-sm text-gray-700 flex-1">
                      {genderLabel}
                    </Text>
                  </View>

                  {therapist.workPhoneNumber ? (
                    <View className="flex-row items-center">
                      <View className="w-8 h-8 rounded-lg bg-[#E6F4F0] items-center justify-center mr-3">
                        <Phone color="#089769" size={16} />
                      </View>
                      <Text className="text-sm text-gray-700 flex-1">
                        {therapist.workPhoneNumber}
                      </Text>
                    </View>
                  ) : null}
                </View>
              </View>

              <View
                className={`mx-4 mt-4 bg-white rounded-2xl p-5 border border-gray-200 ${
                  isDesktop ? "border-l-4 border-l-[#089769]" : ""
                }`}
              >
                <View className="flex-row items-center mb-4">
                  <View className="w-8 h-8 rounded-lg bg-[#E6F4F0] items-center justify-center mr-2">
                    <Award color="#089769" size={16} />
                  </View>
                  <Text className="text-lg font-bold text-gray-900">
                    Specializations
                  </Text>
                </View>
                <Text className="text-sm text-gray-700 leading-6">
                  {formatList(therapist.specializations)}
                </Text>
              </View>

              <View
                className={`mx-4 mt-4 bg-white rounded-2xl p-5 border border-gray-200 ${
                  isDesktop ? "border-l-4 border-l-[#089769]" : ""
                }`}
              >
                <View className="flex-row items-center mb-4">
                  <View className="w-8 h-8 rounded-lg bg-[#E6F4F0] items-center justify-center mr-2">
                    <MessageCircle color="#089769" size={16} />
                  </View>
                  <Text className="text-lg font-bold text-gray-900">
                    Works With
                  </Text>
                </View>

                {(therapist.conditionsTreated ?? []).length === 0 ? (
                  <Text className="text-sm text-gray-500">Not specified</Text>
                ) : (
                  <View className="space-y-2">
                    {(therapist.conditionsTreated ?? []).map((c, idx) => (
                      <View key={idx} className="flex-row items-start">
                        <View className="w-1.5 h-1.5 rounded-full bg-[#089769] mt-2 mr-3" />
                        <Text className="flex-1 text-sm text-gray-700 leading-6">
                          {c}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}

                {therapist.otherConditionsTreated &&
                String(therapist.otherConditionsTreated).trim().length > 0 ? (
                  <View className="mt-4 pt-4 border-t border-gray-100">
                    <Text className="text-xs font-semibold text-[#089769] uppercase tracking-wide mb-2">
                      Other Conditions Treated
                    </Text>
                    <Text className="text-sm text-gray-700 leading-6">
                      {String(therapist.otherConditionsTreated)
                        .split(",")
                        .map((s) => s.trim())
                        .filter(Boolean)
                        .join(", ")}
                    </Text>
                  </View>
                ) : null}
              </View>

              <View
                className={`mx-4 mt-4 bg-white rounded-2xl p-5 border border-gray-200 ${
                  isDesktop ? "border-l-4 border-l-[#089769]" : ""
                }`}
              >
                <View className="flex-row items-center mb-4">
                  <View className="w-8 h-8 rounded-lg bg-[#E6F4F0] items-center justify-center mr-2">
                    <MapPin color="#089769" size={16} />
                  </View>
                  <Text className="text-lg font-bold text-gray-900">
                    Service Areas
                  </Text>
                </View>

                <View className="flex-row flex-wrap -mx-1">
                  {sortedServiceAreas.map((area, i) => (
                    <View
                      key={i}
                      className="bg-[#E6F4F0] rounded-lg px-3 py-2 m-1 border border-[#089769]/20"
                    >
                      <Text className="text-sm text-[#089769] font-medium">
                        {area}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>

              {/* Reviews Section */}
              <View
                className={`mx-4 mt-4 bg-white rounded-2xl p-5 border border-gray-200 ${
                  isDesktop ? "border-l-4 border-l-[#089769]" : ""
                }`}
              >
                <View className="flex-row items-center mb-4">
                  <View className="w-8 h-8 rounded-lg bg-[#E6F4F0] items-center justify-center mr-2">
                    <Star color="#F59E0B" size={16} fill="#F59E0B" />
                  </View>
                  <Text className="text-lg font-bold text-gray-900">
                    Reviews
                  </Text>
                </View>

                {ratingsQuery.isLoading ? (
                  <View className="py-8 items-center">
                    <ActivityIndicator color="#089769" size="small" />
                    <Text className="text-sm text-gray-500 mt-2">
                      Loading reviews...
                    </Text>
                  </View>
                ) : ratingsQuery.isError ? (
                  <View className="py-4">
                    <Text className="text-sm text-red-600 text-center">
                      Unable to load reviews. Please try again later.
                    </Text>
                  </View>
                ) : ratingsData.length === 0 ? (
                  <View className="py-8 items-center">
                    <View className="w-16 h-16 bg-[#E6F4F0] rounded-full items-center justify-center mb-3">
                      <Star size={32} color="#089769" />
                    </View>
                    <Text className="text-base font-semibold text-black mb-1.5">
                      No reviews yet
                    </Text>
                    <Text className="text-sm text-gray-500 text-center">
                      This therapist hasn&apos;t received any reviews yet.
                    </Text>
                  </View>
                ) : (
                  <ScrollView
                    className="max-h-[400px]"
                    showsVerticalScrollIndicator={true}
                    nestedScrollEnabled={true}
                  >
                    {ratingsData.map((rating) => {
                      const isExpanded = expandedReviewId === rating.id;
                      return (
                        <TouchableOpacity
                          key={rating.id}
                          activeOpacity={0.7}
                          onPress={() => toggleReviewExpansion(rating.id)}
                          className="py-3 border-b border-gray-100 last:border-0"
                        >
                          <View className="flex-row items-start mb-2">
                            {rating.patientProfilePictureUrl ? (
                              <Image
                                source={{
                                  uri: rating.patientProfilePictureUrl,
                                }}
                                className="w-10 h-10 rounded-full mr-3"
                                contentFit="cover"
                              />
                            ) : (
                              <View className="w-10 h-10 rounded-full bg-[#E6F4F0] items-center justify-center mr-3">
                                <Text className="text-[#089769] font-bold text-sm">
                                  {getInitials(rating.patientName || undefined)}
                                </Text>
                              </View>
                            )}
                            <View className="flex-1">
                              <View className="flex-row items-center justify-between">
                                <Text className="text-sm font-semibold text-gray-900">
                                  {rating.patientName || "Patient"}
                                </Text>
                                {isExpanded ? (
                                  <ChevronUp size={18} color="#6B7280" />
                                ) : (
                                  <ChevronDown size={18} color="#6B7280" />
                                )}
                              </View>
                              <View className="flex-row items-center mt-1">
                                {Array.from({ length: 5 }).map((_, i) => (
                                  <Star
                                    key={i}
                                    size={14}
                                    color={
                                      i < rating.score ? "#F59E0B" : "#D1D5DB"
                                    }
                                    fill={
                                      i < rating.score
                                        ? "#F59E0B"
                                        : "transparent"
                                    }
                                  />
                                ))}
                                <Text className="text-xs text-gray-500 ml-2">
                                  {new Date(
                                    rating.createdAt,
                                  ).toLocaleDateString()}
                                </Text>
                              </View>
                              {!isExpanded && rating.caseToTreat ? (
                                <Text className="text-xs text-gray-600 mt-1 font-medium">
                                  Case: {rating.caseToTreat}
                                </Text>
                              ) : null}
                            </View>
                          </View>

                          {/* Collapsed view - show truncated comment */}
                          {!isExpanded && rating.comment ? (
                            <Text
                              className="text-sm text-gray-700 mt-1"
                              numberOfLines={2}
                            >
                              {rating.comment}
                            </Text>
                          ) : null}

                          {/* Expanded view - show full details */}
                          {isExpanded ? (
                            <View className="mt-3 bg-gray-50 rounded-lg p-4 border border-gray-200">
                              <View className="mb-3">
                                <View className="flex-row items-center mb-2">
                                  {Array.from({ length: 5 }).map((_, i) => (
                                    <Star
                                      key={i}
                                      size={16}
                                      color={
                                        i < rating.score ? "#F59E0B" : "#D1D5DB"
                                      }
                                      fill={
                                        i < rating.score
                                          ? "#F59E0B"
                                          : "transparent"
                                      }
                                    />
                                  ))}
                                  <Text className="text-sm font-semibold text-gray-900 ml-2">
                                    {rating.score}.0 out of 5
                                  </Text>
                                </View>
                              </View>

                              {rating.caseToTreat ? (
                                <View className="mb-3">
                                  <Text className="text-xs font-medium text-gray-500 mb-1.5">
                                    Case
                                  </Text>
                                  <Text className="text-sm text-gray-900 leading-5">
                                    {rating.caseToTreat}
                                  </Text>
                                </View>
                              ) : null}

                              {rating.comment ? (
                                <View className="mb-3">
                                  <Text className="text-xs font-medium text-gray-500 mb-1.5">
                                    Feedback
                                  </Text>
                                  <Text className="text-sm text-gray-900 leading-5">
                                    {rating.comment}
                                  </Text>
                                </View>
                              ) : (
                                <View className="mb-3">
                                  <Text className="text-xs font-medium text-gray-500 mb-1.5">
                                    Feedback
                                  </Text>
                                  <Text className="text-sm text-gray-400 italic">
                                    No written feedback provided
                                  </Text>
                                </View>
                              )}

                              <View className="border-t border-gray-200 pt-3">
                                <Text className="text-xs text-gray-500">
                                  Reviewed on{" "}
                                  {new Date(
                                    rating.createdAt,
                                  ).toLocaleDateString("en-US", {
                                    month: "short",
                                    day: "numeric",
                                    year: "numeric",
                                  })}{" "}
                                  at{" "}
                                  {new Date(
                                    rating.createdAt,
                                  ).toLocaleTimeString("en-US", {
                                    hour: "numeric",
                                    minute: "2-digit",
                                    hour12: true,
                                  })}
                                </Text>
                              </View>
                            </View>
                          ) : null}
                        </TouchableOpacity>
                      );
                    })}
                    {ratingsData.length > 10 ? (
                      <Text className="text-xs text-gray-500 text-center mt-2">
                        Showing all {ratingsData.length} reviews
                      </Text>
                    ) : null}
                  </ScrollView>
                )}
              </View>

              {/* Upcoming Availability Section */}
              <View
                className={`mx-4 mt-4 bg-white rounded-2xl p-5 border border-gray-200 ${
                  isDesktop ? "border-l-4 border-l-[#089769]" : ""
                }`}
              >
                <View className="flex-row items-center justify-between mb-4">
                  <View className="flex-row items-center">
                    <View className="w-8 h-8 rounded-lg bg-[#E6F4F0] items-center justify-center mr-2">
                      <Clock color="#089769" size={16} />
                    </View>
                    <Text className="text-lg font-bold text-gray-900">
                      Upcoming Availability
                    </Text>
                  </View>
                </View>

                {/* This Week / Next Week Toggle */}
                <View className="flex-row mb-4 bg-gray-100 rounded-xl p-1">
                  <TouchableOpacity
                    onPress={() => setScheduleWeek(0)}
                    className={`flex-1 py-2 rounded-lg ${
                      scheduleWeek === 0 ? "bg-[#089769]" : "bg-transparent"
                    }`}
                  >
                    <Text
                      className={`text-sm font-semibold text-center ${
                        scheduleWeek === 0 ? "text-white" : "text-gray-600"
                      }`}
                    >
                      This Week
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setScheduleWeek(1)}
                    className={`flex-1 py-2 rounded-lg ${
                      scheduleWeek === 1 ? "bg-[#089769]" : "bg-transparent"
                    }`}
                  >
                    <Text
                      className={`text-sm font-semibold text-center ${
                        scheduleWeek === 1 ? "text-white" : "text-gray-600"
                      }`}
                    >
                      Next Week
                    </Text>
                  </TouchableOpacity>
                </View>

                {availabilityQuery.isLoading || bookedSlotsQuery.isLoading ? (
                  <View className="py-8 items-center">
                    <ActivityIndicator color="#089769" size="small" />
                    <Text className="text-sm text-gray-500 mt-2">
                      Loading schedule...
                    </Text>
                  </View>
                ) : weekSchedule.length === 0 ? (
                  <Text className="text-sm text-gray-500 text-center py-4">
                    No availability information available
                  </Text>
                ) : (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    className="-mx-2"
                  >
                    {weekSchedule.map((dayData, dayIndex) => (
                      <View
                        key={dayIndex}
                        className="mx-2 bg-[#E6F4F0] rounded-xl p-3 border border-[#089769]/20"
                        style={{ width: 130 }}
                      >
                        <Text className="text-sm font-bold text-gray-900 text-center mb-1">
                          {dayData.day}
                        </Text>
                        <Text className="text-xs text-gray-500 text-center mb-3">
                          {dayData.date}
                        </Text>

                        {dayData.slots.length === 0 ? (
                          <Text className="text-xs text-gray-400 text-center py-2">
                            No slots
                          </Text>
                        ) : (
                          <View className="space-y-2">
                            {dayData.slots.map((slot, slotIndex) => (
                              <View
                                key={slotIndex}
                                className={`py-2 px-2 rounded-lg ${
                                  slot.available
                                    ? "bg-[#089769]"
                                    : "bg-red-100 border border-red-200"
                                }`}
                              >
                                <Text
                                  className={`text-xs font-medium text-center ${
                                    slot.available
                                      ? "text-white"
                                      : "text-red-600"
                                  }`}
                                >
                                  {slot.time}
                                </Text>
                                {slot.isBooked && (
                                  <Text className="text-[10px] text-red-500 text-center mt-0.5">
                                    Booked
                                  </Text>
                                )}
                              </View>
                            ))}
                          </View>
                        )}
                      </View>
                    ))}
                  </ScrollView>
                )}
              </View>

              {therapist.feePerSession != null &&
              Number.isFinite(Number(therapist.feePerSession)) ? (
                <View
                  className={`mx-4 mt-4 mb-6 bg-white rounded-2xl p-5 border border-gray-200 ${
                    isDesktop ? "border-l-4 border-l-[#089769]" : ""
                  }`}
                >
                  <Text className="text-xs font-semibold text-[#089769] uppercase tracking-widest mb-1">
                    Professional Fee
                  </Text>
                  <View className="flex-row items-baseline">
                    <Text className="text-3xl font-bold text-gray-900">
                      {formatPeso(Number(therapist.feePerSession))}
                    </Text>
                    <Text className="text-sm text-gray-500 ml-2">
                      per session
                    </Text>
                  </View>
                </View>
              ) : null}
            </View>
          </ScrollView>
        )}
        <View
          className={`px-5 py-4 bg-white border-t border-gray-200 ${
            isDesktop ? "max-w-4xl mx-auto w-full rounded-2xl mb-4" : ""
          }`}
        >
          <TouchableOpacity
            className="bg-[#089769] rounded-xl py-4 items-center active:opacity-80"
            onPress={async () => {
              const name = therapist?.name?.trim() || "Therapist";
              setModalTitle("Open conversation?");
              setModalMessage(
                `This will redirect you to your conversation with ${name}.`,
              );
              setModalShowCancel(true);
              setModalConfirmText("Continue");
              setModalAction("inquire");
              setModalVisible(true);
            }}
          >
            <Text className="text-white text-base font-semibold">Inquire</Text>
          </TouchableOpacity>

          <InAppModal
            visible={modalVisible}
            title={modalTitle}
            message={modalMessage}
            showCancel={modalShowCancel}
            cancelText="Cancel"
            confirmText={modalConfirmText}
            onCancel={() => {
              setModalVisible(false);
              setPendingConvId(null);
              setModalAction("none");
            }}
            onConfirm={() => {
              setModalVisible(false);
              setPendingConvId(null);
              if (modalAction === "inquire") {
                setModalAction("none");
                setModalConfirmText("OK");
                void performInquire();
                return;
              }
              setModalAction("none");
            }}
          />
        </View>
      </SafeAreaView>
    </View>
  );
}

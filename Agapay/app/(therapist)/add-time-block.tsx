import { useLocalSearchParams, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { ArrowLeft, ChevronDown, Plus, X } from "lucide-react-native";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
  Modal,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "@/src/providers/AuthProvider";
import { fetchMyTherapist } from "@/src/services/therapists";
import WebHeader from "@/src/components/WebHeader";
import {
  fetchTherapistAvailability,
  upsertTherapistAvailability,
  type TherapistAvailability,
  type TherapistAvailabilityDto,
} from "@/src/services/availability";
import { toTherapistAvailabilityDtos } from "@/src/features/scheduling/core/therapistAvailabilityPayload";

type DayLabel =
  | "Monday"
  | "Tuesday"
  | "Wednesday"
  | "Thursday"
  | "Friday"
  | "Saturday"
  | "Sunday";

const DAYS: DayLabel[] = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

const TIME_OPTIONS = Array.from({ length: (20 - 6) * 2 + 1 }, (_, index) => {
  const totalMinutes = 6 * 60 + index * 30;
  const hours = Math.floor(totalMinutes / 60)
    .toString()
    .padStart(2, "0");
  const minutes = (totalMinutes % 60).toString().padStart(2, "0");
  return `${hours}:${minutes}`;
});

const formatTimeLabel = (time: string) => {
  if (!time) return "";
  const [hourStr, minuteStr] = time.split(":");
  const hour = Number(hourStr);
  const minute = Number(minuteStr);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return time;
  const normalizedHour = ((hour % 24) + 24) % 24;
  const displayHour = normalizedHour % 12 === 0 ? 12 : normalizedHour % 12;
  const suffix = normalizedHour >= 12 ? "PM" : "AM";
  return `${displayHour}:${minute.toString().padStart(2, "0")} ${suffix}`;
};

const parseTimeToMinutes = (value: string) => {
  if (!value) return null;
  const parts = value.split(":");
  if (parts.length < 2) return null;

  const h = Number.parseInt(parts[0] ?? "", 10);
  const m = Number.parseInt(parts[1] ?? "", 10);
  const s = parts.length > 2 ? Number.parseInt(parts[2] ?? "0", 10) : 0;

  const isInvalidBase =
    Number.isNaN(h) ||
    Number.isNaN(m) ||
    Number.isNaN(s) ||
    h < 0 ||
    m < 0 ||
    s < 0;
  if (isInvalidBase) return null;

  if (h === 24) {
    if (m === 0 && s === 0) return 24 * 60;
    return null;
  }

  if (h > 23 || m > 59 || s > 59) return null;

  return h * 60 + m;
};

interface TimeBlock {
  id: number;
  startTime: string;
  endTime: string;
}

const dayLabelToDow: Record<DayLabel, number> = {
  Sunday: 0,
  Monday: 1,
  Tuesday: 2,
  Wednesday: 3,
  Thursday: 4,
  Friday: 5,
  Saturday: 6,
};

const getAvailabilityForDay = (
  day: DayLabel,
  availability: TherapistAvailability[],
): TherapistAvailability[] => {
  const dow = dayLabelToDow[day];
  return availability.filter((item) => {
    const itemDow =
      typeof item.dayOfWeek === "string"
        ? dayLabelToDow[item.dayOfWeek as DayLabel]
        : item.dayOfWeek;
    return itemDow === dow && item.isAvailable !== false;
  });
};

export default function AddTimeBlock() {
  const router = useRouter();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { day, week } = useLocalSearchParams<{
    day: DayLabel;
    week?: string;
  }>();
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === "web" && width >= 768;

  // Support three modes: template (recurring), thisWeek (0), nextWeek (1)
  const isTemplate = String(week) === "template";
  const isNextWeek = String(week) === "1";

  const [timeBlocks, setTimeBlocks] = useState<TimeBlock[]>([
    { id: Date.now(), startTime: "", endTime: "" },
  ]);
  const [formError, setFormError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [timePickerVisible, setTimePickerVisible] = useState(false);
  const [activeTimeBlockId, setActiveTimeBlockId] = useState<number | null>(
    null,
  );
  const [selectedDays, setSelectedDays] = useState<Record<DayLabel, boolean>>(
    () =>
      DAYS.reduce(
        (acc, d) => {
          acc[d] = false;
          return acc;
        },
        {} as Record<DayLabel, boolean>,
      ),
  );

  useEffect(() => {
    if (day) setSelectedDays((prev) => ({ ...prev, [day]: true }));
  }, [day]);

  const selectedCount = useMemo(
    () => DAYS.filter((d) => selectedDays[d]).length,
    [selectedDays],
  );

  const toHHmmss = (time: string) => {
    if (!time) return time;
    if (time === "24:00") return "23:59:59";
    return time.length === 5 ? `${time}:00` : time;
  };
  const toHHmm = (time: string) => {
    if (!time) return "";
    const parts = time.split(":");
    if (parts.length < 2) return time;
    return `${parts[0].padStart(2, "0")}:${parts[1].padStart(2, "0")}`;
  };

  const [therapistId, setTherapistId] = useState<number | string | null>(null);
  useEffect(() => {
    let mounted = true;
    (async () => {
      const direct =
        user?.physicalTherapistId ??
        user?.therapistId ??
        user?.physicalTherapist?.id ??
        null;
      if (direct != null) {
        if (mounted) setTherapistId(direct);
        return;
      }
      const me = await fetchMyTherapist();
      if (mounted) setTherapistId(me?.id ?? null);
    })();
    return () => {
      mounted = false;
    };
  }, [user]);

  const { data: availData } = useQuery({
    queryKey: ["availability", therapistId],
    queryFn: () => fetchTherapistAvailability(therapistId as number | string),
    enabled: !!therapistId,
  });

  const openTimePicker = (blockId: number) => {
    setActiveTimeBlockId(blockId);
    setTimePickerVisible(true);
    setFormError("");
  };
  const closeTimePicker = () => {
    setTimePickerVisible(false);
    setActiveTimeBlockId(null);
  };
  const handlePickTime = (time: string) => {
    if (activeTimeBlockId === null) return;
    updateTimeBlock(activeTimeBlockId, "startTime", time);
    closeTimePicker();
  };
  const addTimeBlock = () =>
    setTimeBlocks([
      ...timeBlocks,
      { id: Date.now(), startTime: "", endTime: "" },
    ]);
  const removeTimeBlock = (id: number) =>
    setTimeBlocks(timeBlocks.filter((block) => block.id !== id));

  const updateTimeBlock = (
    id: number,
    field: "startTime" | "endTime",
    value: string,
  ) => {
    setTimeBlocks(
      timeBlocks.map((block) => {
        if (block.id === id) {
          const newBlock = { ...block, [field]: value } as TimeBlock;
          if (field === "startTime") {
            const startMinutes = parseTimeToMinutes(value);
            if (startMinutes !== null) {
              const endMinutes = startMinutes + 60;
              const endHours = Math.floor(endMinutes / 60)
                .toString()
                .padStart(2, "0");
              const endMinutesPart = (endMinutes % 60)
                .toString()
                .padStart(2, "0");
              newBlock.endTime = `${endHours}:${endMinutesPart}`;
            } else {
              newBlock.endTime = "";
            }
          }
          return newBlock;
        }
        return block;
      }),
    );
  };

  const isSameDate = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

  // Use Monday as the start of the week (matching schedule.tsx)
  const getStartOfThisWeek = (now = new Date()) => {
    const today = new Date(now);
    const todayIdx = today.getDay(); // 0=Sunday..6=Saturday
    // Days since Monday: Sunday(0) -> 6, Monday(1) -> 0, Tuesday(2) -> 1, etc.
    const daysSinceMonday = todayIdx === 0 ? 6 : todayIdx - 1;
    const startOfThisWeek = new Date(today);
    startOfThisWeek.setDate(today.getDate() - daysSinceMonday);
    startOfThisWeek.setHours(0, 0, 0, 0);
    return startOfThisWeek;
  };

  const getStartOfNextWeek = (now = new Date()) => {
    const startOfThisWeek = getStartOfThisWeek(now);
    const startOfNextWeek = new Date(startOfThisWeek);
    startOfNextWeek.setDate(startOfThisWeek.getDate() + 7);
    startOfNextWeek.setHours(0, 0, 0, 0);
    return startOfNextWeek;
  };

  // Convert day-of-week (0=Sunday..6=Saturday) to Monday-based offset (Monday=0..Sunday=6)
  const getThisWeekTargetDateForDow = (dow: number) => {
    const start = getStartOfThisWeek();
    // Convert from JS day (0=Sunday..6=Saturday) to Monday-starting offset (Monday=0..Sunday=6)
    const offsetFromMonday = dow === 0 ? 6 : dow - 1;
    const t = new Date(start);
    t.setDate(start.getDate() + offsetFromMonday);
    t.setHours(0, 0, 0, 0);
    return t;
  };

  const getNextWeekTargetDateForDow = (dow: number) => {
    const start = getStartOfNextWeek();
    // Convert from JS day (0=Sunday..6=Saturday) to Monday-starting offset (Monday=0..Sunday=6)
    const offsetFromMonday = dow === 0 ? 6 : dow - 1;
    const t = new Date(start);
    t.setDate(start.getDate() + offsetFromMonday);
    t.setHours(0, 0, 0, 0);
    return t;
  };

  const handleSubmit = async () => {
    const days = DAYS.filter((d) => selectedDays[d]);
    if (days.length === 0) {
      setFormError("Select at least one day.");
      return;
    }
    if (!therapistId) {
      setFormError("Therapist ID not found. Please sign in as a therapist.");
      return;
    }

    const queryKey = ["availability", therapistId] as const;
    const existingAvailability: TherapistAvailability[] =
      queryClient.getQueryData(queryKey) ?? [];
    const newPayloads: TherapistAvailabilityDto[] = [];

    for (const block of timeBlocks) {
      const s = parseTimeToMinutes(block.startTime);
      const e = parseTimeToMinutes(block.endTime);
      if (s === null || e === null) {
        setFormError("Please select a valid start time for all time blocks.");
        return;
      }
      if (e <= s) {
        setFormError("End time must be later than start time for all blocks.");
        return;
      }

      const normalizedStart = toHHmm(block.startTime);
      const normalizedEnd = toHHmm(block.endTime);

      for (const day of days) {
        // Intentionally allow overlapping blocks: do not block on overlap.
        const payload: TherapistAvailabilityDto = {
          dayOfWeek: dayLabelToDow[day],
          startTime: toHHmmss(normalizedStart),
          endTime: toHHmmss(normalizedEnd),
          isAvailable: true,
        };

        // Template mode: create recurring block (no specificDate)
        // This Week/Next Week: create specific-date entries
        if (isTemplate) {
          // Template blocks are recurring - no specificDate
          console.log(`[Template] Adding recurring block for ${day}`);
        } else {
          // Both This Week and Next Week use specific-date entries (independent schedules)
          const dow = dayLabelToDow[day];
          const targetDate = isNextWeek
            ? getNextWeekTargetDateForDow(dow)
            : getThisWeekTargetDateForDow(dow);
          // Format local date as YYYY-MM-DD for the backend
          const y = targetDate.getFullYear();
          const m = String(targetDate.getMonth() + 1).padStart(2, "0");
          const d = String(targetDate.getDate()).padStart(2, "0");
          payload.specificDate = `${y}-${m}-${d}`;
          console.log(
            `[${isNextWeek ? "Next Week" : "This Week"}] Adding block for ${day} with specificDate: ${payload.specificDate}`,
          );
        }

        newPayloads.push(payload);
      }
    }

    if (newPayloads.length === 0) {
      setFormError("No new time blocks to add or all blocks already exist.");
      return;
    }

    const existingPayload = toTherapistAvailabilityDtos(
      existingAvailability as any,
    );

    const combinedPayload = [...existingPayload, ...newPayloads];

    setFormError("");
    setIsSaving(true);
    try {
      await upsertTherapistAvailability(therapistId, combinedPayload);
      const physicalTherapistId =
        typeof therapistId === "number"
          ? therapistId
          : Number.parseInt(String(therapistId), 10);
      const optimisticBlocks: TherapistAvailability[] = newPayloads.map(
        (entry, idx) => ({
          id: -(Date.now() + idx),
          physicalTherapistId: Number.isFinite(physicalTherapistId)
            ? physicalTherapistId
            : 0,
          dayOfWeek: entry.dayOfWeek,
          startTime: entry.startTime,
          endTime: entry.endTime,
          isAvailable: entry.isAvailable ?? true,
          specificDate: entry.specificDate ?? null,
          notes: entry.notes,
        }),
      );
      queryClient.setQueryData<TherapistAvailability[] | undefined>(
        queryKey,
        (existing) => {
          const base = Array.isArray(existing) ? [...existing] : [];
          return [...base, ...optimisticBlocks];
        },
      );
      await queryClient.invalidateQueries({ queryKey });
      router.back();
    } catch (err: any) {
      setFormError(
        err?.response?.data?.message ||
          err?.message ||
          "Failed to save availability.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <View
      className="flex-1"
      style={
        isDesktop
          ? { backgroundColor: "#e6f5f0" }
          : { backgroundColor: "#FFFFFF" }
      }
    >
      {isDesktop && <WebHeader />}
      <SafeAreaView
        className="flex-1"
        style={
          isDesktop
            ? { backgroundColor: "transparent" }
            : { backgroundColor: "#FFFFFF" }
        }
      >
        <StatusBar
          style="dark"
          backgroundColor={isDesktop ? "#e6f5f0" : "#FFFFFF"}
        />

        {/* Desktop Header */}
        {isDesktop ? (
          <View className="max-w-4xl mx-auto w-full px-6 pt-6 pb-4">
            <TouchableOpacity
              onPress={() => router.back()}
              className="flex-row items-center self-start bg-white px-4 py-2 rounded-full mb-4"
              style={{
                shadowColor: "#000",
                shadowOpacity: 0.05,
                shadowRadius: 4,
                elevation: 2,
              }}
            >
              <ArrowLeft color="#089769" size={20} />
              <Text
                className="ml-2 text-sm font-semibold"
                style={{ color: "#089769" }}
              >
                Back to Schedule
              </Text>
            </TouchableOpacity>
            <Text className="text-2xl font-bold text-gray-900">
              {isTemplate ? "Add to Template" : "Add Time Blocks"}
            </Text>
            <Text className="text-sm text-gray-500 mt-1">
              {isTemplate
                ? "Add recurring time blocks to your weekly template"
                : "Add one or more time blocks to your schedule"}
            </Text>
          </View>
        ) : (
          /* Mobile Header */
          <View className="flex-row items-center justify-between px-4 py-3 border-b border-gray-200 bg-white">
            <TouchableOpacity
              onPress={() => router.back()}
              className="w-8 h-8 items-center justify-center"
              accessibilityRole="button"
              accessibilityHint="Go back to the previous screen"
            >
              <ArrowLeft color="#111" size={24} />
            </TouchableOpacity>
            <Text className="text-base font-bold text-gray-900">
              {isTemplate ? "Add to Template" : "Add Time Blocks"}
            </Text>
            <View className="w-8 h-8" />
          </View>
        )}

        <KeyboardAvoidingView
          className="flex-1"
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <ScrollView
            className="flex-1"
            contentContainerStyle={{ paddingBottom: 120 }}
            keyboardShouldPersistTaps="handled"
          >
            <View
              className={isDesktop ? "max-w-4xl mx-auto w-full px-6" : "px-4"}
            >
              {/* Template mode info banner */}
              {isTemplate && (
                <View
                  className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4"
                  style={{ marginTop: 16 }}
                >
                  <Text
                    className="text-sm font-medium"
                    style={{ color: "#0369a1" }}
                  >
                    🔄 <Text className="font-bold">Template Mode</Text> — Time
                    blocks added here will repeat every week automatically.
                  </Text>
                </View>
              )}

              <Text
                className="text-base font-semibold text-gray-700 mb-2"
                style={{ marginTop: isTemplate ? 0 : 16 }}
              >
                Time Blocks
              </Text>
              <Text className="text-sm text-gray-500 mb-4">
                {isTemplate
                  ? "Add recurring time blocks. These will be applied to every week automatically."
                  : "Add one or more time blocks. End times are automatically set to one hour after the start time."}
              </Text>

              <View className="gap-y-4">
                {timeBlocks.map((block) => {
                  let isTakenForStart = false;
                  if (block.startTime && availData) {
                    const s = parseTimeToMinutes(block.startTime);
                    if (s !== null) {
                      if (isNextWeek) {
                        const selectedDayLabels = DAYS.filter(
                          (d) => selectedDays[d],
                        );
                        for (const d of selectedDayLabels) {
                          const dow = dayLabelToDow[d];
                          const targetDate = getNextWeekTargetDateForDow(dow);
                          const found = availData.some((item) => {
                            if (
                              !item.specificDate ||
                              item.isAvailable === false
                            )
                              return false;
                            const itemDate = new Date(item.specificDate);
                            if (!isSameDate(itemDate, targetDate)) return false;
                            const itemStart = parseTimeToMinutes(
                              toHHmm(item.startTime),
                            );
                            const itemEnd = parseTimeToMinutes(
                              toHHmm(item.endTime),
                            );
                            if (itemStart === null || itemEnd === null)
                              return false;
                            return s >= itemStart && s < itemEnd;
                          });
                          if (found) {
                            isTakenForStart = true;
                            break;
                          }
                        }
                      } else {
                        const selectedDayLabels = DAYS.filter(
                          (d) => selectedDays[d],
                        );
                        for (const d of selectedDayLabels) {
                          const dow = dayLabelToDow[d];
                          const found = availData.some((item) => {
                            if (
                              (item as any).specificDate != null ||
                              item.isAvailable === false
                            )
                              return false;
                            // Check if the item's dayOfWeek matches the current day being checked
                            const itemDow =
                              typeof item.dayOfWeek === "string"
                                ? dayLabelToDow[item.dayOfWeek as DayLabel]
                                : item.dayOfWeek;
                            if (itemDow !== dow) return false;
                            const itemStart = parseTimeToMinutes(
                              toHHmm(item.startTime),
                            );
                            const itemEnd = parseTimeToMinutes(
                              toHHmm(item.endTime),
                            );
                            if (itemStart === null || itemEnd === null)
                              return false;
                            return s >= itemStart && s < itemEnd;
                          });
                          if (found) {
                            isTakenForStart = true;
                            break;
                          }
                        }
                      }
                    }
                  }

                  const startDisabled = !!isTakenForStart;

                  return (
                    <View key={block.id} className="flex-row gap-4 items-start">
                      <View className="flex-1">
                        <Text className="text-sm font-medium text-gray-600 mb-2">
                          Start Time
                        </Text>
                        <TouchableOpacity
                          onPress={() =>
                            !startDisabled && openTimePicker(block.id)
                          }
                          disabled={startDisabled}
                          className={`border rounded-xl p-4 flex-row items-center justify-between ${startDisabled ? "bg-gray-100 border-gray-200 opacity-70" : "bg-white border-gray-300"}`}
                        >
                          <Text
                            className={
                              startDisabled
                                ? "text-base text-gray-400"
                                : block.startTime
                                  ? "text-base text-gray-900"
                                  : "text-base text-gray-400"
                            }
                          >
                            {block.startTime
                              ? formatTimeLabel(block.startTime)
                              : "Select time"}
                          </Text>
                          <ChevronDown
                            color={startDisabled ? "#9ca3af" : "#6b7280"}
                            size={20}
                          />
                        </TouchableOpacity>
                        {isTakenForStart && (
                          <Text className="text-xs text-gray-500 mt-1">
                            Already scheduled
                          </Text>
                        )}
                      </View>

                      <View className="flex-1">
                        <Text className="text-sm font-medium text-gray-600 mb-2">
                          End Time
                        </Text>
                        <View className="border border-gray-200 rounded-xl p-4 flex-row items-center justify-between bg-gray-100 opacity-70">
                          <Text
                            className={
                              block.endTime
                                ? "text-base text-gray-800"
                                : "text-base text-gray-400"
                            }
                          >
                            {block.endTime
                              ? formatTimeLabel(block.endTime)
                              : "Auto"}
                          </Text>
                        </View>
                        {isTakenForStart && <View className="h-5" />}
                      </View>

                      {timeBlocks.length > 1 && (
                        <TouchableOpacity
                          onPress={() => removeTimeBlock(block.id)}
                          className="p-2"
                          style={{ marginTop: 28 }}
                        >
                          <X size={20} color="#9ca3af" />
                        </TouchableOpacity>
                      )}
                    </View>
                  );
                })}
              </View>

              <TouchableOpacity
                onPress={addTimeBlock}
                className="flex-row items-center gap-2 mt-4"
              >
                <Plus size={20} color="#089769" />
                <Text
                  className="text-base font-semibold"
                  style={{ color: "#089769" }}
                >
                  Add another time
                </Text>
              </TouchableOpacity>

              {formError ? (
                <Text className="text-sm text-red-600 mt-4">{formError}</Text>
              ) : null}
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>

      <Modal
        visible={timePickerVisible}
        transparent
        animationType="fade"
        onRequestClose={closeTimePicker}
      >
        <TouchableOpacity
          style={{ flex: 1 }}
          onPress={closeTimePicker}
          activeOpacity={1}
        >
          <View className="flex-1 justify-center items-center bg-black/40 p-4">
            <View className="bg-white rounded-2xl w-full max-w-sm shadow-lg">
              <Text className="text-lg font-bold text-gray-800 p-4 border-b border-gray-200">
                Select Start Time
              </Text>
              <FlatList
                data={TIME_OPTIONS}
                keyExtractor={(t) => t}
                initialNumToRender={12}
                windowSize={10}
                renderItem={({ item: time }) => {
                  const activeBlock = timeBlocks.find(
                    (b) => b.id === activeTimeBlockId,
                  );
                  const selected = activeBlock?.startTime === time;
                  const s = parseTimeToMinutes(time); // Candidate start time

                  let isTaken = false;
                  if (s !== null && availData && selectedCount > 0) {
                    const selectedDayLabels = DAYS.filter(
                      (d) => selectedDays[d],
                    );
                    for (const day of selectedDayLabels) {
                      let dayAvailability: TherapistAvailability[] = [];
                      const dow = dayLabelToDow[day];

                      if (isTemplate) {
                        // Template Mode: Compare against recurring blocks (specificDate is null)
                        dayAvailability = availData.filter((item) => {
                          // Must be recurring (no specificDate) and available
                          if (
                            item.specificDate != null ||
                            item.isAvailable === false
                          )
                            return false;

                          // Check day of week
                          const itemDow =
                            typeof item.dayOfWeek === "string"
                              ? dayLabelToDow[item.dayOfWeek as DayLabel]
                              : item.dayOfWeek;
                          return itemDow === dow;
                        });
                      } else {
                        // Specific Date Mode: Compare against blocks for the specific target date
                        const targetDate = isNextWeek
                          ? getNextWeekTargetDateForDow(dow)
                          : getThisWeekTargetDateForDow(dow);
                        dayAvailability = availData.filter((item) => {
                          if (!item.specificDate || item.isAvailable === false)
                            return false;
                          const itemDate = new Date(item.specificDate);
                          return isSameDate(itemDate, targetDate);
                        });
                      }

                      const isBlocked = dayAvailability.some((item) => {
                        const itemStart = parseTimeToMinutes(
                          toHHmm(item.startTime),
                        );
                        const itemEnd = parseTimeToMinutes(
                          toHHmm(item.endTime),
                        );
                        if (itemStart === null || itemEnd === null)
                          return false;
                        // Check if candidate start time falls within existing block
                        // (Assuming we are picking Start Time, and Duration isn't strictly defined but usually 1hr.
                        // Ideally we should check Range Overlap: [s, s+60] overlaps [itemStart, itemEnd])
                        // For now, let's stick to "Start Time cannot be inside an existing block" logic
                        // PLUS "Existing block cannot be inside [s, s+60]"
                        const candidateEnd = s + 60; // Assume 1 hour default
                        return s < itemEnd && itemStart < candidateEnd;
                      });

                      if (isBlocked) {
                        isTaken = true;
                        break;
                      }
                    }
                  }

                  // Check overlap with other pending blocks in the form
                  const isSelectedInOtherBlock = timeBlocks.some((b) => {
                    if (b.id === activeTimeBlockId) return false;
                    if (!b.startTime) return false;
                    const bStart = parseTimeToMinutes(b.startTime);
                    if (bStart === null || s === null) return false;

                    // Pending block duration is 1 hour
                    const bEnd = bStart + 60;
                    const candidateEnd = s + 60;

                    return s < bEnd && bStart < candidateEnd;
                  });

                  return (
                    <TouchableOpacity
                      onPress={() => handlePickTime(time)}
                      disabled={isTaken || isSelectedInOtherBlock}
                      className={`p-4 border-b border-gray-100 ${isTaken || isSelectedInOtherBlock ? "bg-gray-200" : ""}`}
                      style={selected ? { backgroundColor: "#d1fae5" } : {}}
                    >
                      <Text
                        className={`text-base text-center ${isTaken || isSelectedInOtherBlock ? "text-gray-400" : "text-gray-800"}`}
                        style={
                          selected
                            ? { fontWeight: "600", color: "#089769" }
                            : {}
                        }
                      >
                        {formatTimeLabel(time)}
                      </Text>
                    </TouchableOpacity>
                  );
                }}
                style={{ maxHeight: 300 }}
              />
              <View className="p-2">
                <TouchableOpacity
                  onPress={closeTimePicker}
                  className="bg-gray-100 rounded-lg p-4"
                >
                  <Text className="text-base text-center font-semibold text-gray-700">
                    Cancel
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      <SafeAreaView
        edges={["bottom"]}
        style={
          isDesktop
            ? { backgroundColor: "#e6f5f0" }
            : { backgroundColor: "#FFFFFF" }
        }
      >
        <View
          className={
            isDesktop
              ? "max-w-4xl mx-auto w-full px-6 py-4"
              : "bg-white p-4 border-t border-gray-200"
          }
        >
          <TouchableOpacity
            className="rounded-xl p-4 items-center justify-center"
            style={{ backgroundColor: isSaving ? "#86efac" : "#089769" }}
            onPress={handleSubmit}
            disabled={isSaving}
          >
            <Text className="text-white text-base font-bold">
              {isSaving ? "Saving..." : "Add To Schedule"}
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </View>
  );
}

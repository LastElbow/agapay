import TherapistVerificationBanner from "@/src/components/TherapistVerificationBanner";
import SessionCalendar from "@/src/components/SessionCalendar";
import WebHeader from "@/src/components/WebHeader";
import { useAuth } from "@/src/providers/AuthProvider";
import {
  fetchTherapistAvailability,
  upsertTherapistAvailability,
  type TherapistAvailability,
} from "@/src/services/availability";
import { fetchMyTherapist } from "@/src/services/therapists";
import { fetchAllSessions } from "@/src/services/sessions";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import {
  ArrowLeft,
  Plus,
  Clock,
  Trash2,
  Calendar,
  List,
  X,
} from "lucide-react-native";
import { useEffect, useMemo, useState } from "react";
import {
  ScrollView,
  Text,
  TouchableOpacity,
  View,
  ActivityIndicator,
  Modal,
  TextInput,
  Platform,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTherapistStatus } from "@/src/hooks/useTherapistStatus";

import {
  type DayLabel,
  DAYS_MON_START as DAYS,
  dowToDayLabel as coreDowToDayLabel,
  dayLabelToDow,
} from "@/src/features/scheduling/core/dow";
import {
  parseTimeToMinutes,
  toFriendlyTime,
  toHHmm,
  toHHmmss,
} from "@/src/features/scheduling/core/time";
import {
  toTherapistAvailabilityDto,
  toTherapistAvailabilityDtos,
} from "@/src/features/scheduling/core/therapistAvailabilityPayload";
import { generateSpecificDateBlocksFromTemplate } from "@/src/features/scheduling/core/applyTemplate";
import {
  getDateForDowInWeek,
  getWeekRange,
  parseYmdToLocalDate,
} from "@/src/features/scheduling/core/weekRange";

type TimeBlock = {
  id: string;
  start: string;
  end: string;
  raw: TherapistAvailability;
};

export default function TherapistSchedule() {
  const router = useRouter();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const therapistStatus = useTherapistStatus();
  const { isRestricted } = therapistStatus;
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === "web" && width >= 768;

  const [loadError, setLoadError] = useState<string | null>(null);
  const [therapistId, setTherapistId] = useState<number | null>(null);
  const [dayToDelete, setDayToDelete] = useState<DayLabel | null>(null);
  const [blocksToDelete, setBlocksToDelete] = useState<Record<string, boolean>>(
    {},
  );
  const [isDeleting, setIsDeleting] = useState(false);

  // View mode state
  const [viewMode, setViewMode] = useState<"list" | "calendar">("list");
  // Tab view: "template" = recurring weekly template, "thisWeek" = this week's schedule, "nextWeek" = next week's schedule
  const [tabView, setTabView] = useState<"template" | "thisWeek" | "nextWeek">(
    "thisWeek",
  );
  // Legacy weekView for backwards compatibility (0 = thisWeek, 1 = nextWeek)
  const weekView = tabView === "nextWeek" ? 1 : 0;

  // Create schedule modal state
  const [isCreateModalVisible, setIsCreateModalVisible] = useState(false);
  const [selectedDays, setSelectedDays] = useState<Record<DayLabel, boolean>>({
    Monday: false,
    Tuesday: false,
    Wednesday: false,
    Thursday: false,
    Friday: false,
    Saturday: false,
    Sunday: false,
  });
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  // Whether new blocks should be for this week or next week (both use specific-date entries)
  const [applyTarget, setApplyTarget] = useState<"thisWeek" | "nextWeek">(
    "thisWeek",
  );

  // Available slot modal state
  const [isSlotModalVisible, setIsSlotModalVisible] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<{
    start: string;
    end: string;
    day: string;
  } | null>(null);

  const dowToDayLabel = coreDowToDayLabel;

  useEffect(() => {
    let mounted = true;
    (async () => {
      const chooseNumericId = (value: unknown): number | null => {
        if (value == null) return null;
        if (typeof value === "number" && Number.isFinite(value)) {
          return value;
        }
        if (typeof value === "string") {
          const trimmed = value.trim();
          if (trimmed.length === 0) return null;
          const parsed = Number.parseInt(trimmed, 10);
          return Number.isFinite(parsed) ? parsed : null;
        }
        return null;
      };

      const directSources = [
        user?.physicalTherapistId,
        user?.physicalTherapist?.id,
        user?.therapistId,
      ];

      for (const candidate of directSources) {
        const normalized = chooseNumericId(candidate);
        if (normalized != null) {
          if (mounted) {
            setTherapistId(normalized);
            setLoadError(null);
          }
          return;
        }
      }

      const me = await fetchMyTherapist();
      const fallback = chooseNumericId(me?.id);
      if (mounted) {
        if (fallback != null) {
          setTherapistId(fallback);
          setLoadError(null);
        } else {
          setTherapistId(null);
          setLoadError(
            "We couldn't determine your therapist profile. Please try again later.",
          );
        }
      }
    })();
    return () => {
      mounted = false;
    };
  }, [user]);

  const {
    data: availData,
    isLoading: qLoading,
    isFetching: qFetching,
    error: qError,
  } = useQuery({
    queryKey: ["availability", therapistId],
    queryFn: async () => {
      const data = await fetchTherapistAvailability(therapistId!);
      // Filter out unavailable blocks (deleted blocks) to prevent them from reappearing
      return data.filter((b) => b.isAvailable !== false);
    },
    enabled: !!therapistId && !isRestricted,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });

  // Fetch all sessions to mark booked times
  const { data: sessionsData } = useQuery({
    queryKey: ["sessions", "all"],
    queryFn: fetchAllSessions,
    enabled: !!therapistId && !isRestricted,
    staleTime: 2 * 60 * 1000,
  });

  // Real-time updates: Listen for SessionCreated events to refresh booked intervals
  useEffect(() => {
    if (!therapistId || isRestricted) return;

    let active = true;
    const setupConnection = async () => {
      try {
        const { default: signalrManager } =
          await import("@/src/services/signalrManager");
        const { getTokens } = await import("@/src/auth/session");
        const accessToken = getTokens().accessToken;

        if (!accessToken) return;

        await signalrManager.getSharedConnection("sessions", accessToken);

        if (!active) {
          signalrManager.releaseConnection("sessions");
          return;
        }

        // Listen for SessionCreated events to refresh booked slots in real-time
        const unsubscribe = signalrManager.subscribeToEvent(
          "sessions",
          "SessionCreated",
          (payload: any) => {
            if (!active) return;
            console.log("[Schedule] SessionCreated event received:", payload);

            // Invalidate and immediately refetch sessions data to show the newly booked slot
            queryClient
              .invalidateQueries({ queryKey: ["sessions", "all"] })
              .catch(() => {});
            queryClient
              .refetchQueries({ queryKey: ["sessions", "all"] })
              .catch(() => {});
          },
        );

        return () => {
          unsubscribe?.();
        };
      } catch (error) {
        console.warn("Schedule sessions hub connection failed", error);
      }
    };

    const cleanup = setupConnection();

    return () => {
      active = false;
      cleanup.then((cleanupFn) => cleanupFn?.()).catch(() => {});
      import("@/src/services/signalrManager")
        .then(({ default: signalrManager }) => {
          signalrManager.releaseConnection("sessions");
        })
        .catch(() => {});
    };
  }, [therapistId, isRestricted, queryClient]);

  useEffect(() => {
    if (qError) {
      const message =
        (qError as any)?.response?.data?.message ||
        (qError as any)?.message ||
        "Failed to load availability.";
      setLoadError(message);
    } else {
      setLoadError(null);
    }
  }, [qError]);

  const isLoadingAvail = qLoading || qFetching;

  // Calculate this week's date range (Monday to Sunday)
  const thisWeekRange = useMemo(() => {
    return getWeekRange(new Date(), 0);
  }, []);

  // Auto-apply template detection: Check if current week has no specific-date blocks
  // but has template blocks. Show a banner prompting user to apply template.
  const [showAutoApplyBanner, setShowAutoApplyBanner] = useState(false);
  const [autoApplyWeek, setAutoApplyWeek] = useState<
    "thisWeek" | "nextWeek" | null
  >(null);

  // Effect to detect when weeks need template application
  useEffect(() => {
    if (!availData || isLoadingAvail) return;

    const hasTemplateBlocks = availData.some(
      (b) => b.isAvailable !== false && !(b as any).specificDate,
    );

    if (!hasTemplateBlocks) {
      setShowAutoApplyBanner(false);
      return;
    }

    // Check if this week has any specific-date blocks
    const { start: startOfThisWeek, end: endOfThisWeek } = thisWeekRange;
    const thisWeekHasBlocks = availData.some((b) => {
      if (!(b as any).specificDate || b.isAvailable === false) return false;
      const d = parseYmdToLocalDate(String((b as any).specificDate));
      if (!d) return false;
      return d >= startOfThisWeek && d <= endOfThisWeek;
    });

    // Show banner if this week has no blocks but template exists
    if (!thisWeekHasBlocks && tabView === "thisWeek") {
      setShowAutoApplyBanner(true);
      setAutoApplyWeek("thisWeek");
    } else {
      setShowAutoApplyBanner(false);
      setAutoApplyWeek(null);
    }
  }, [availData, isLoadingAvail, thisWeekRange, tabView]);

  // Build template schedule from recurring entries ONLY (where specificDate == null)
  // This is the "blueprint" that gets applied to all future weeks
  const templateSchedule = useMemo(() => {
    const processedSchedule = DAYS.reduce<Record<DayLabel, TimeBlock[]>>(
      (acc, day) => {
        acc[day] = [];
        return acc;
      },
      {} as Record<DayLabel, TimeBlock[]>,
    );

    if (!availData) {
      return processedSchedule;
    }

    availData.forEach((b: TherapistAvailability) => {
      if (!b || b.isAvailable === false) return;

      // Only include RECURRING blocks (no specificDate) for template
      if ((b as any).specificDate) {
        return; // Skip specific-date entries - template only shows recurring
      }

      const dayLabel = dowToDayLabel(b.dayOfWeek);
      if (!dayLabel) return;

      processedSchedule[dayLabel].push({
        id: `template-${dayLabel}-${b.id}`,
        start: toHHmm(b.startTime),
        end: toHHmm(b.endTime),
        raw: b,
      });
    });

    // Sort blocks by start time
    (Object.keys(processedSchedule) as DayLabel[]).forEach((day) => {
      processedSchedule[day].sort((a, b) => {
        const aStart = parseTimeToMinutes(a.start) ?? 0;
        const bStart = parseTimeToMinutes(b.start) ?? 0;
        return aStart - bStart;
      });
    });

    return processedSchedule;
  }, [availData, dowToDayLabel]);

  // Build this-week schedule from specific-date entries ONLY (for this week's dates)
  // This makes This Week completely independent from Next Week
  const schedule = useMemo(() => {
    const processedSchedule = DAYS.reduce<Record<DayLabel, TimeBlock[]>>(
      (acc, day) => {
        acc[day] = [];
        return acc;
      },
      {} as Record<DayLabel, TimeBlock[]>,
    );

    if (!availData) {
      return processedSchedule;
    }

    const { start: startOfThisWeek, end: endOfThisWeek } = thisWeekRange;
    console.log(
      "[This Week Schedule] Date range:",
      startOfThisWeek.toLocaleDateString(),
      "to",
      endOfThisWeek.toLocaleDateString(),
    );

    availData.forEach((b: TherapistAvailability) => {
      if (!b || b.isAvailable === false) return;

      // Only include specific-date entries for THIS week
      if (!(b as any).specificDate) {
        return; // Skip recurring blocks - This Week only shows specific-date entries
      }

      const dateStr = String((b as any).specificDate).split("T")[0];
      const d = parseYmdToLocalDate(dateStr);
      if (!d) return;

      // If within this week range, place into the corresponding day bucket
      if (d >= startOfThisWeek && d <= endOfThisWeek) {
        const dayLabel = dowToDayLabel(d.getDay());
        if (!dayLabel) return;
        console.log(
          "[This Week Schedule] Adding specific-date block:",
          dayLabel,
          dateStr,
          b.startTime,
          "-",
          b.endTime,
        );
        processedSchedule[dayLabel].push({
          id: `${dayLabel}-${b.id}`,
          start: toHHmm(b.startTime),
          end: toHHmm(b.endTime),
          raw: b,
        });
      }
    });

    (Object.keys(processedSchedule) as DayLabel[]).forEach((day) => {
      processedSchedule[day].sort((a, b) => {
        const aStart = parseTimeToMinutes(a.start) ?? 0;
        const bStart = parseTimeToMinutes(b.start) ?? 0;
        return aStart - bStart;
      });
    });

    return processedSchedule;
  }, [availData, thisWeekRange, dowToDayLabel]);

  // Build next-week schedule from availability items that have a specificDate ONLY
  // Each week is completely independent - no shared recurring logic
  const nextWeekSchedule = useMemo(() => {
    const processed = DAYS.reduce<Record<DayLabel, TimeBlock[]>>(
      (acc, day) => {
        acc[day] = [];
        return acc;
      },
      {} as Record<DayLabel, TimeBlock[]>,
    );

    if (!availData) return processed;

    const { start: startOfNextWeek, end: endOfNextWeek } = getWeekRange(
      new Date(),
      1,
    );

    console.log(
      "[Next Week Schedule] Date range:",
      startOfNextWeek.toLocaleDateString(),
      "to",
      endOfNextWeek.toLocaleDateString(),
    );

    availData.forEach((b) => {
      if (!b || b.isAvailable === false) return;

      // Skip recurring blocks (no specificDate) - only show specific-date entries
      if (!(b as any).specificDate) {
        return;
      }

      // Add specific-date blocks for next week only
      const dateStr = String(b.specificDate).split("T")[0]; // Get date part if ISO format
      const d = parseYmdToLocalDate(dateStr);
      if (!d) return;
      // If within next week range, place into the corresponding day bucket
      if (d >= startOfNextWeek && d <= endOfNextWeek) {
        const dayLabel = dowToDayLabel(d.getDay());
        if (!dayLabel) return;
        console.log(
          "[Next Week Schedule] Adding specific-date block:",
          dayLabel,
          dateStr,
          b.startTime,
          "-",
          b.endTime,
        );
        processed[dayLabel].push({
          id: `${dayLabel}-${b.id}`,
          start: toHHmm(b.startTime),
          end: toHHmm(b.endTime),
          raw: b,
        });
      }
    });

    (Object.keys(processed) as DayLabel[]).forEach((day) => {
      processed[day].sort((a, b) => {
        const aStart = parseTimeToMinutes(a.start) ?? 0;
        const bStart = parseTimeToMinutes(b.start) ?? 0;
        return aStart - bStart;
      });
    });

    return processed;
  }, [availData, dowToDayLabel]);

  const toggleBlockToDelete = (id: string) => {
    setBlocksToDelete((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleDelete = async () => {
    if (!therapistId || !availData) return;

    const toDeleteIds = Object.keys(blocksToDelete).filter(
      (id) => blocksToDelete[id],
    );
    if (toDeleteIds.length === 0) {
      setDayToDelete(null);
      setBlocksToDelete({});
      return;
    }

    setIsDeleting(true);
    try {
      // Get the actual database IDs of blocks to delete
      // Extract the numeric ID from blockId format "DayLabel-id" or "template-DayLabel-id"
      const dbIdsToDelete = new Set<number>();
      toDeleteIds.forEach((blockId) => {
        const dayLabel = dayToDelete;
        if (!dayLabel) return;
        // Choose the right schedule based on the current tab
        const blocks =
          tabView === "template"
            ? templateSchedule[dayLabel]
            : tabView === "thisWeek"
              ? schedule[dayLabel]
              : nextWeekSchedule[dayLabel];
        const block = blocks.find((b) => b.id === blockId);
        if (block && block.raw && block.raw.id) {
          dbIdsToDelete.add(block.raw.id);
        }
      });

      // Identify remaining and removed blocks from the current availability
      // Only delete blocks whose IDs are in the set - no cross-week matching
      const isMarkedForDelete = (b: TherapistAvailability) => {
        // Only delete if this exact block ID is marked for deletion
        if (!dbIdsToDelete.has(b.id)) return false;

        // Check if this block is booked - if so, don't mark it for deletion
        const label = dowToDayLabel(b.dayOfWeek);
        if (label) {
          // Get specific date for week-independent booking check
          const blockSpecificDate = (b as any).specificDate
            ? String((b as any).specificDate).split("T")[0]
            : undefined;
          const isBooked = isTimeBlockBooked(
            label,
            b.startTime,
            b.endTime,
            blockSpecificDate,
          );
          if (isBooked) {
            console.log(
              "Skipping deletion of booked block:",
              label,
              b.startTime,
              b.endTime,
            );
            return false;
          }
        }
        return true;
      };

      const remaining = availData.filter((b) => !isMarkedForDelete(b));
      const removed = availData.filter((b) => isMarkedForDelete(b));

      console.log(
        "[Delete] Deleting blocks:",
        removed.map((b) => ({
          day: dowToDayLabel(b.dayOfWeek),
          time: `${b.startTime}-${b.endTime}`,
        })),
      );
      console.log("[Delete] Keeping blocks:", remaining.length);

      // Build payload: only send remaining blocks as available
      // We mark removed blocks as unavailable to properly delete them
      const payload = [
        ...remaining.map((b) => toTherapistAvailabilityDto(b as any, true)),
        ...removed.map((b) => toTherapistAvailabilityDto(b as any, false)),
      ];

      await upsertTherapistAvailability(therapistId, payload);

      // Optimistically update cache with remaining only (removed ones gone)
      // Filter out isAvailable: false blocks to prevent them from reappearing
      queryClient.setQueryData(["availability", therapistId], remaining);

      // Invalidate and refetch, then filter the result
      await queryClient.invalidateQueries({
        queryKey: ["availability", therapistId],
      });

      // After refetch, ensure we filter out any isAvailable: false blocks
      const refetchedData = queryClient.getQueryData<TherapistAvailability[]>([
        "availability",
        therapistId,
      ]);
      if (refetchedData) {
        const filteredData = refetchedData.filter(
          (b) => b.isAvailable !== false,
        );
        queryClient.setQueryData(["availability", therapistId], filteredData);
      }
    } catch (err) {
      console.error("Failed to delete availability", err);
      // TODO: show a toast or error message to the user
    } finally {
      setIsDeleting(false);
      setDayToDelete(null);
      setBlocksToDelete({});
    }
  };

  const toggleDaySelection = (day: DayLabel) => {
    setSelectedDays((prev) => ({ ...prev, [day]: !prev[day] }));
  };

  const resetCreateModal = () => {
    setSelectedDays({
      Monday: false,
      Tuesday: false,
      Wednesday: false,
      Thursday: false,
      Friday: false,
      Saturday: false,
      Sunday: false,
    });
    setStartTime("");
    setEndTime("");
  };

  const handleCreateSchedule = async () => {
    if (!therapistId) return;

    const daysSelected = Object.keys(selectedDays).filter(
      (day) => selectedDays[day as DayLabel],
    ) as DayLabel[];

    if (daysSelected.length === 0) {
      alert("Please select at least one day.");
      return;
    }

    if (!startTime || !endTime) {
      alert("Please enter start and end times.");
      return;
    }

    const startMinutes = parseTimeToMinutes(startTime);
    const endMinutes = parseTimeToMinutes(endTime);

    if (startMinutes === null || endMinutes === null) {
      alert("Invalid time format. Please use HH:MM format (e.g., 09:00).");
      return;
    }

    if (endMinutes <= startMinutes) {
      alert("End time must be after start time.");
      return;
    }

    setIsCreating(true);
    try {
      // Both thisWeek and nextWeek now use specific-date entries
      const now = new Date();
      const weekOffset = applyTarget === "nextWeek" ? 1 : 0;
      const { start: startOfTargetWeek } = getWeekRange(now, weekOffset);

      const specificDateEntries = daysSelected.flatMap((day) => {
        const dow = dayLabelToDow[day];
        const targetDate = getDateForDowInWeek(startOfTargetWeek, dow);
        if (!targetDate) return [];

        // Use local date string (YYYY-MM-DD) to avoid timezone shifts when collecting .split('T')[0] later
        // Using toISOString() on a local midnight date shifts it to previous day in UTC+ timezones
        const y = targetDate.getFullYear();
        const m = String(targetDate.getMonth() + 1).padStart(2, "0");
        const d = String(targetDate.getDate()).padStart(2, "0");
        const dateStr = `${y}-${m}-${d}`;

        return [
          {
            id: -Date.now() - Math.floor(Math.random() * 1000),
            physicalTherapistId: therapistId,
            dayOfWeek: dow,
            startTime: toHHmmss(startTime),
            endTime: toHHmmss(endTime),
            isAvailable: true,
            specificDate: dateStr,
          } as any,
        ];
      });

      // Optimistically update cache
      queryClient.setQueryData(["availability", therapistId], (old: any) => {
        const arr = Array.isArray(old) ? old.slice() : [];
        return [...arr, ...specificDateEntries];
      });

      // Also save to backend
      const existingPayload = availData
        ? toTherapistAvailabilityDtos(availData as any)
        : [];

      const newPayload = specificDateEntries.map((entry) => ({
        dayOfWeek: entry.dayOfWeek,
        startTime: entry.startTime,
        endTime: entry.endTime,
        isAvailable: entry.isAvailable,
        specificDate: entry.specificDate, // Already YYYY-MM-DD
      }));

      await upsertTherapistAvailability(therapistId, [
        ...existingPayload,
        ...newPayload,
      ]);
      await queryClient.invalidateQueries({
        queryKey: ["availability", therapistId],
      });

      resetCreateModal();
      setIsCreateModalVisible(false);
    } catch (err) {
      console.error("Failed to create schedule", err);
      alert("Failed to create schedule. Please try again.");
    } finally {
      setIsCreating(false);
    }
  };

  // State for applying template
  const [isApplyingTemplate, setIsApplyingTemplate] = useState(false);

  // Apply template to a specific week (thisWeek or nextWeek)
  // This generates specific-date blocks from the recurring template
  const applyTemplateToWeek = async (targetWeek: "thisWeek" | "nextWeek") => {
    if (!therapistId || !availData) return;

    const hasTemplateBlocks = availData.some(
      (b) => b.isAvailable !== false && !(b as any).specificDate,
    );

    if (!hasTemplateBlocks) {
      alert(
        "No template blocks to apply. Please add recurring availability in the Template tab first.",
      );
      return;
    }

    setIsApplyingTemplate(true);
    try {
      const newBlocks = generateSpecificDateBlocksFromTemplate({
        availData,
        now: new Date(),
        targetWeek,
      });

      if (newBlocks.length === 0) {
        alert(
          "Template has already been applied to this week. All slots already exist.",
        );
        setIsApplyingTemplate(false);
        return;
      }

      // Combine with existing blocks
      const existingPayload = toTherapistAvailabilityDtos(availData as any);

      await upsertTherapistAvailability(therapistId, [
        ...existingPayload,
        ...newBlocks,
      ]);
      await queryClient.invalidateQueries({
        queryKey: ["availability", therapistId],
      });

      alert(
        `Template applied! ${newBlocks.length} time slot(s) added to ${targetWeek === "thisWeek" ? "This Week" : "Next Week"}.`,
      );
    } catch (err) {
      console.error("Failed to apply template", err);
      alert("Failed to apply template. Please try again.");
    } finally {
      setIsApplyingTemplate(false);
    }
  };

  // Check if a time block is booked
  // specificDate: the ISO date string (YYYY-MM-DD) of the block to ensure week-specific matching
  const isTimeBlockBooked = (
    day: DayLabel,
    blockStart: string,
    blockEnd: string,
    specificDate?: string,
  ): boolean => {
    if (!sessionsData) return false;

    const startMinutes = parseTimeToMinutes(blockStart);
    const endMinutes = parseTimeToMinutes(blockEnd);

    if (startMinutes === null || endMinutes === null) return false;

    return sessionsData.some((session) => {
      // Check if session is confirmed (not cancelled)
      const status = (session.status ?? "").toLowerCase();
      if (status === "cancelled" || status === "canceled") return false;

      const sessionStart = new Date(session.startAt);

      // Must match the specific date if provided (for week-independent booking)
      if (specificDate) {
        // Use local date components to avoid UTC conversion issues
        const sessionYear = sessionStart.getFullYear();
        const sessionMonth = String(sessionStart.getMonth() + 1).padStart(
          2,
          "0",
        );
        const sessionDay = String(sessionStart.getDate()).padStart(2, "0");
        const sessionDateStr = `${sessionYear}-${sessionMonth}-${sessionDay}`;
        if (sessionDateStr !== specificDate) return false;
      }

      // Get session time in minutes
      const sessionStartMinutes =
        sessionStart.getHours() * 60 + sessionStart.getMinutes();
      const sessionEndMinutes = sessionStartMinutes + session.durationMinutes;

      // Check if there's any overlap
      return (
        (sessionStartMinutes >= startMinutes &&
          sessionStartMinutes < endMinutes) ||
        (sessionEndMinutes > startMinutes && sessionEndMinutes <= endMinutes) ||
        (sessionStartMinutes <= startMinutes && sessionEndMinutes >= endMinutes)
      );
    });
  };

  // Prepare schedule blocks for calendar view - show BOTH This Week and Next Week
  const scheduleBlocksForCalendar = useMemo(() => {
    const blocks: {
      id: string;
      start: string;
      end: string;
      day: string;
      specificDate?: string; // ISO date string (YYYY-MM-DD)
      isBooked?: boolean;
      status?: "available" | "booked" | "completed" | "cancelled";
      patientName?: string;
      sessionId?: number;
    }[] = [];

    // Process blocks from a schedule source
    const processSchedule = (sourceSchedule: typeof schedule) => {
      DAYS.forEach((day) => {
        const dayBlocks = sourceSchedule[day];

        dayBlocks.forEach((block) => {
          // Extract the specific date from the raw block
          const rawSpecificDate = (block.raw as any)?.specificDate;
          let specificDateStr: string | undefined = undefined;
          if (rawSpecificDate) {
            specificDateStr = String(rawSpecificDate).split("T")[0];
          }

          // Skip if no specific date (shouldn't happen with new system)
          if (!specificDateStr) return;

          // Check if this block already exists (avoid duplicates)
          if (blocks.some((b) => b.id === block.id)) return;

          const startMinutes = parseTimeToMinutes(block.start);
          const endMinutes = parseTimeToMinutes(block.end);

          if (startMinutes === null || endMinutes === null) {
            blocks.push({
              id: block.id,
              start: toFriendlyTime(block.start),
              end: toFriendlyTime(block.end),
              day: day,
              specificDate: specificDateStr,
              isBooked: false,
              status: "available",
            });
            return;
          }

          // Find matching session for this time block (include cancelled sessions)
          // Must match BOTH the specific date AND time to avoid cross-week booking conflicts
          const matchingSession = sessionsData?.find((session) => {
            const sessionStart = new Date(session.startAt);

            // First, check if session date matches the block's specific date
            if (specificDateStr) {
              // Use local date components to avoid UTC conversion issues
              const sessionYear = sessionStart.getFullYear();
              const sessionMonth = String(sessionStart.getMonth() + 1).padStart(
                2,
                "0",
              );
              const sessionDay = String(sessionStart.getDate()).padStart(
                2,
                "0",
              );
              const sessionDateStr = `${sessionYear}-${sessionMonth}-${sessionDay}`;
              if (sessionDateStr !== specificDateStr) return false;
            }

            // Then check time overlap
            const startMinutesSession =
              sessionStart.getHours() * 60 + sessionStart.getMinutes();
            const endMinutesSession =
              startMinutesSession + (session.durationMinutes || 60);

            return (
              (startMinutesSession >= startMinutes &&
                startMinutesSession < endMinutes) ||
              (endMinutesSession > startMinutes &&
                endMinutesSession <= endMinutes) ||
              (startMinutesSession <= startMinutes &&
                endMinutesSession >= endMinutes)
            );
          });

          let status: "available" | "booked" | "completed" | "cancelled" =
            "available";
          let patientName: string | undefined = undefined;

          if (matchingSession) {
            const sessionStatus = (matchingSession.status ?? "").toLowerCase();

            if (sessionStatus === "completed") {
              status = "completed";
            } else if (
              sessionStatus === "cancelled" ||
              sessionStatus === "canceled"
            ) {
              status = "cancelled";
            } else {
              status = "booked";
            }

            patientName = matchingSession.patientName || "Patient";
          }

          blocks.push({
            id: block.id,
            start: toFriendlyTime(block.start),
            end: toFriendlyTime(block.end),
            day: day,
            specificDate: specificDateStr,
            isBooked: status === "booked" || status === "completed",
            status,
            patientName,
            sessionId: matchingSession?.id,
          });
        });
      });
    };

    // Process both This Week and Next Week schedules
    processSchedule(schedule);
    processSchedule(nextWeekSchedule);

    return blocks;
  }, [schedule, nextWeekSchedule, sessionsData]);

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
                Back
              </Text>
            </TouchableOpacity>
            <Text className="text-2xl font-bold text-gray-900">
              My Schedule
            </Text>
            <Text className="text-sm text-gray-500 mt-1">
              Manage your weekly availability and time slots
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
              My Schedule
            </Text>
            <View className="w-8 h-8" />
          </View>
        )}

        <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
          <View
            className={isDesktop ? "max-w-4xl mx-auto w-full px-6" : "px-4"}
          >
            <TherapistVerificationBanner
              style={{ marginTop: 16, marginBottom: 16 }}
            />

            {isRestricted ? (
              <View className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4">
                <Text className="text-sm font-bold text-red-800 mb-1">
                  Availability Locked
                </Text>
                <Text className="text-xs text-red-700">
                  Once your application is approved, you can start publishing
                  your schedule and accepting sessions.
                </Text>
              </View>
            ) : (
              <View>
                {loadError && (
                  <View className="bg-red-50 border border-red-200 rounded-xl p-3 mb-4">
                    <Text className="text-xs text-red-700">{loadError}</Text>
                  </View>
                )}

                {/* Description text */}
                <View className="bg-emerald-50 border border-emerald-100 rounded-xl p-4 mb-4">
                  <Text
                    className="text-sm font-medium leading-5"
                    style={{ color: "#089769" }}
                  >
                    📅 Manage your availability using the Template system. Set
                    your recurring weekly schedule in the{" "}
                    <Text className="font-bold">Template</Text> tab, then view
                    or customize specific weeks in{" "}
                    <Text className="font-bold">This Week</Text> or{" "}
                    <Text className="font-bold">Next Week</Text>.
                  </Text>
                </View>

                {/* View Toggle and Create Button */}
                <View
                  className={`mb-4 ${isDesktop ? "flex-row items-center justify-between" : "flex-col gap-3"}`}
                >
                  <View className="flex-row bg-gray-100 rounded-lg p-1 self-start">
                    <TouchableOpacity
                      onPress={() => setViewMode("list")}
                      className={`flex-row items-center px-4 py-2 rounded-md`}
                      style={
                        viewMode === "list"
                          ? { backgroundColor: "#089769" }
                          : {}
                      }
                    >
                      <List
                        size={18}
                        color={viewMode === "list" ? "#FFFFFF" : "#6B7280"}
                      />
                      <Text
                        className={`ml-2 text-sm font-semibold ${
                          viewMode === "list" ? "text-white" : "text-gray-600"
                        }`}
                      >
                        List
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => setViewMode("calendar")}
                      className={`flex-row items-center px-4 py-2 rounded-md`}
                      style={
                        viewMode === "calendar"
                          ? { backgroundColor: "#089769" }
                          : {}
                      }
                    >
                      <Calendar
                        size={18}
                        color={viewMode === "calendar" ? "#FFFFFF" : "#6B7280"}
                      />
                      <Text
                        className={`ml-2 text-sm font-semibold ${
                          viewMode === "calendar"
                            ? "text-white"
                            : "text-gray-600"
                        }`}
                      >
                        Calendar
                      </Text>
                    </TouchableOpacity>
                  </View>

                  {/* Schedule Tab Toggle: Template | This Week | Next Week */}
                  <View
                    className={isDesktop ? "flex-row items-center ml-3" : ""}
                  >
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={
                        isDesktop ? {} : { paddingRight: 20 }
                      }
                      scrollEnabled={!isDesktop}
                      style={isDesktop ? {} : { maxWidth: "100%" }}
                    >
                      <TouchableOpacity
                        onPress={() => setTabView("template")}
                        className={`px-3 py-2 rounded-md mr-1`}
                        style={
                          tabView === "template"
                            ? { backgroundColor: "#089769" }
                            : { backgroundColor: "#F3F4F6" }
                        }
                      >
                        <Text
                          className={`${tabView === "template" ? "text-white" : "text-gray-700"} text-sm font-semibold`}
                        >
                          🔄 Template
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => setTabView("thisWeek")}
                        className={`px-3 py-2 rounded-md mr-1`}
                        style={
                          tabView === "thisWeek"
                            ? { backgroundColor: "#089769" }
                            : { backgroundColor: "#F3F4F6" }
                        }
                      >
                        <Text
                          className={`${tabView === "thisWeek" ? "text-white" : "text-gray-700"} text-sm font-semibold`}
                        >
                          This Week
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => setTabView("nextWeek")}
                        className={`px-3 py-2 rounded-md`}
                        style={
                          tabView === "nextWeek"
                            ? { backgroundColor: "#089769" }
                            : { backgroundColor: "#F3F4F6" }
                        }
                      >
                        <Text
                          className={`${tabView === "nextWeek" ? "text-white" : "text-gray-700"} text-sm font-semibold`}
                        >
                          Next Week
                        </Text>
                      </TouchableOpacity>
                    </ScrollView>
                  </View>
                  {/* Top-right Create button removed per request */}
                </View>

                {/* List View */}
                {viewMode === "list" && (
                  <View className="gap-y-4">
                    {/* Tab-specific info banner */}
                    {tabView === "template" && (
                      <View className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 mb-2">
                        <Text
                          className="text-xs font-medium"
                          style={{ color: "#089769" }}
                        >
                          🔄 <Text className="font-bold">Weekly Template</Text>{" "}
                          — Set your recurring weekly availability here. This
                          template is automatically applied to generate
                          &quot;This Week&quot; and &quot;Next Week&quot;
                          schedules.
                        </Text>
                      </View>
                    )}

                    {/* Auto-apply prompt banner */}
                    {showAutoApplyBanner &&
                      autoApplyWeek &&
                      tabView === autoApplyWeek && (
                        <View className="bg-green-50 border-2 border-green-400 rounded-xl p-4 mb-3">
                          <View className="flex-row items-center justify-between">
                            <View className="flex-1 mr-3">
                              <Text className="text-sm text-green-800 font-bold mb-1">
                                ✨ New Week Detected!
                              </Text>
                              <Text className="text-xs text-green-700">
                                Your template has availability slots. Would you
                                like to apply them to this week?
                              </Text>
                            </View>
                            <View className="flex-row gap-2">
                              <TouchableOpacity
                                onPress={() => setShowAutoApplyBanner(false)}
                                className="px-3 py-2 rounded-lg border border-gray-300"
                              >
                                <Text className="text-xs text-gray-600 font-medium">
                                  Later
                                </Text>
                              </TouchableOpacity>
                              <TouchableOpacity
                                onPress={() => {
                                  applyTemplateToWeek(autoApplyWeek);
                                  setShowAutoApplyBanner(false);
                                }}
                                disabled={isApplyingTemplate}
                                className="bg-green-600 px-3 py-2 rounded-lg"
                                style={
                                  isApplyingTemplate ? { opacity: 0.6 } : {}
                                }
                              >
                                <Text className="text-xs text-white font-bold">
                                  {isApplyingTemplate
                                    ? "Applying..."
                                    : "Apply Now"}
                                </Text>
                              </TouchableOpacity>
                            </View>
                          </View>
                        </View>
                      )}

                    {tabView === "thisWeek" && (
                      <View className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 mb-2">
                        <View className="flex-row items-center justify-between">
                          <View className="flex-1 mr-3">
                            <Text
                              className="text-xs font-medium"
                              style={{ color: "#089769" }}
                            >
                              📅 <Text className="font-bold">This Week</Text> —
                              Your schedule for this week.
                              {templateSchedule &&
                                Object.values(templateSchedule).some(
                                  (blocks) => blocks.length > 0,
                                ) && (
                                  <Text>
                                    {" "}
                                    Click &quot;Apply Template&quot; to populate
                                    slots from your template.
                                  </Text>
                                )}
                            </Text>
                          </View>
                          {templateSchedule &&
                            Object.values(templateSchedule).some(
                              (blocks) => blocks.length > 0,
                            ) && (
                              <TouchableOpacity
                                onPress={() => applyTemplateToWeek("thisWeek")}
                                disabled={isApplyingTemplate}
                                style={[
                                  { backgroundColor: "#089769" },
                                  {
                                    paddingHorizontal: 12,
                                    paddingVertical: 8,
                                    borderRadius: 8,
                                  },
                                  isApplyingTemplate ? { opacity: 0.6 } : {},
                                ]}
                              >
                                <Text className="text-xs text-white font-bold">
                                  {isApplyingTemplate
                                    ? "Applying..."
                                    : "Apply Template"}
                                </Text>
                              </TouchableOpacity>
                            )}
                        </View>
                      </View>
                    )}
                    {tabView === "nextWeek" && (
                      <View className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 mb-2">
                        <View className="flex-row items-center justify-between">
                          <View className="flex-1 mr-3">
                            <Text
                              className="text-xs font-medium"
                              style={{ color: "#089769" }}
                            >
                              📆 <Text className="font-bold">Next Week</Text> —
                              Preview and customize next week&apos;s schedule.
                              {templateSchedule &&
                                Object.values(templateSchedule).some(
                                  (blocks) => blocks.length > 0,
                                ) && (
                                  <Text>
                                    {" "}
                                    Click &quot;Apply Template&quot; to populate
                                    slots from your template.
                                  </Text>
                                )}
                            </Text>
                          </View>
                          {templateSchedule &&
                            Object.values(templateSchedule).some(
                              (blocks) => blocks.length > 0,
                            ) && (
                              <TouchableOpacity
                                onPress={() => applyTemplateToWeek("nextWeek")}
                                disabled={isApplyingTemplate}
                                style={[
                                  { backgroundColor: "#089769" },
                                  {
                                    paddingHorizontal: 12,
                                    paddingVertical: 8,
                                    borderRadius: 8,
                                  },
                                  isApplyingTemplate ? { opacity: 0.6 } : {},
                                ]}
                              >
                                <Text className="text-xs text-white font-bold">
                                  {isApplyingTemplate
                                    ? "Applying..."
                                    : "Apply Template"}
                                </Text>
                              </TouchableOpacity>
                            )}
                        </View>
                      </View>
                    )}
                    {DAYS.map((day) => {
                      // Choose the right schedule based on the tab
                      const blocks =
                        tabView === "template"
                          ? templateSchedule[day]
                          : tabView === "thisWeek"
                            ? schedule[day]
                            : nextWeekSchedule[day];

                      const dateStr = (() => {
                        if (tabView === "template") return "";
                        const weekOffset = tabView === "nextWeek" ? 1 : 0;
                        const { start: weekStart } = getWeekRange(
                          new Date(),
                          weekOffset,
                        );
                        const dow = dayLabelToDow[day];
                        const targetDate = getDateForDowInWeek(weekStart, dow);
                        if (!targetDate) return "";
                        return targetDate.toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        });
                      })();

                      return (
                        <View key={day}>
                          <View className="flex-row items-center justify-between mb-2">
                            <View className="flex-row items-center">
                              <Text className="text-sm font-semibold text-gray-900">
                                {day}
                              </Text>
                              {/* Only show date for This Week and Next Week tabs */}
                              {tabView !== "template" && (
                                <Text
                                  className="text-sm font-semibold ml-2"
                                  style={{ color: "#089769" }}
                                >
                                  ({dateStr})
                                </Text>
                              )}
                              {/* Show "Recurring" badge for template tab */}
                              {tabView === "template" && (
                                <View className="ml-2 bg-blue-100 px-2 py-0.5 rounded">
                                  <Text className="text-xs text-blue-700 font-medium">
                                    Every week
                                  </Text>
                                </View>
                              )}
                            </View>
                            <View className="flex-row items-center">
                              <TouchableOpacity
                                onPress={() =>
                                  router.push(
                                    `/(therapist)/add-time-block?day=${day}&week=${tabView === "template" ? "template" : weekView}`,
                                  )
                                }
                                className="p-1"
                              >
                                <Plus size={16} color="#089769" />
                              </TouchableOpacity>
                              {blocks.length > 0 && (
                                <TouchableOpacity
                                  onPress={() => setDayToDelete(day)}
                                  className="p-1"
                                >
                                  <Trash2 size={16} color="#ef4444" />
                                </TouchableOpacity>
                              )}
                            </View>
                          </View>

                          {isLoadingAvail && blocks.length === 0 ? (
                            <View className="bg-white border border-gray-200 rounded-xl p-4 flex-row items-center">
                              <ActivityIndicator size="small" color="#089769" />
                              <Text className="text-sm text-gray-500 ml-3">
                                Loading...
                              </Text>
                            </View>
                          ) : blocks.length === 0 ? (
                            // Show contextual placeholder for empty days based on tab
                            <View className="bg-white border border-gray-200 rounded-xl p-4">
                              {tabView === "template" ? (
                                <Text className="text-sm text-gray-400 italic">
                                  No recurring availability set for this day
                                </Text>
                              ) : templateSchedule[day] &&
                                templateSchedule[day].length > 0 ? (
                                <View>
                                  <Text className="text-sm text-gray-400 italic">
                                    No slots set. Your template has{" "}
                                    {templateSchedule[day].length} slot(s) for
                                    this day.
                                  </Text>
                                  <Text className="text-xs text-blue-600 mt-1">
                                    Use &quot;Apply Template&quot; above to
                                    populate from template.
                                  </Text>
                                </View>
                              ) : (
                                <Text className="text-sm text-gray-400 italic">
                                  No availability set
                                </Text>
                              )}
                            </View>
                          ) : (
                            <View className="gap-2">
                              {blocks.map((block) => {
                                // Get the specific date from the block for week-independent booking check
                                const blockSpecificDate = block.raw
                                  ?.specificDate
                                  ? String(block.raw.specificDate).split("T")[0]
                                  : undefined;
                                const isBooked = isTimeBlockBooked(
                                  day,
                                  block.start,
                                  block.end,
                                  blockSpecificDate,
                                );
                                return (
                                  <View
                                    key={block.id}
                                    className={`bg-white rounded-xl p-4 flex-row items-center border-2`}
                                    style={
                                      isBooked
                                        ? { borderColor: "#DC2626" }
                                        : { borderColor: "#089769" }
                                    }
                                  >
                                    <Clock
                                      size={20}
                                      color={isBooked ? "#DC2626" : "#089769"}
                                    />
                                    <View className="flex-1 ml-3">
                                      <View className="flex-row items-center justify-between">
                                        <Text className="text-sm text-gray-900 font-semibold">
                                          {`${toFriendlyTime(block.start)} - ${toFriendlyTime(block.end)}`}
                                        </Text>
                                        {isBooked && (
                                          <View className="bg-red-100 px-2 py-1 rounded">
                                            <Text className="text-xs text-red-700 font-semibold">
                                              Booked
                                            </Text>
                                          </View>
                                        )}
                                      </View>
                                    </View>
                                  </View>
                                );
                              })}
                            </View>
                          )}
                        </View>
                      );
                    })}
                  </View>
                )}

                {/* Calendar View */}
                {viewMode === "calendar" && (
                  <View className="flex-1 -mx-4">
                    <SessionCalendar
                      scheduleBlocks={scheduleBlocksForCalendar}
                      onBlockPress={(block) => {
                        console.log("Block pressed:", block);

                        if (
                          block.sessionId &&
                          (block.status === "booked" ||
                            block.status === "completed" ||
                            block.status === "cancelled")
                        ) {
                          console.log(
                            "Navigating to session:",
                            block.sessionId,
                          );
                          router.push({
                            pathname: "/session-view",
                            params: {
                              sessionId: String(block.sessionId),
                            },
                          } as any);
                        } else if (block.status === "available") {
                          setSelectedSlot({
                            start: block.start,
                            end: block.end,
                            day: block.day,
                          });
                          setIsSlotModalVisible(true);
                        } else {
                          console.log(
                            "No action for block:",
                            block.status,
                            "sessionId:",
                            block.sessionId,
                          );
                        }
                      }}
                      onDayPress={(date, blocks) => {
                        if (blocks.length > 0) {
                          const dateStr = date.toLocaleDateString("en-US", {
                            weekday: "long",
                            month: "long",
                            day: "numeric",
                            year: "numeric",
                          });
                          alert(
                            `${dateStr}\n\n${blocks
                              .map((b) => `${b.start} - ${b.end}`)
                              .join("\n")}`,
                          );
                        }
                      }}
                    />
                  </View>
                )}
              </View>
            )}
          </View>
        </ScrollView>
        {/* Delete Schedule Modal */}
        <Modal
          visible={!!dayToDelete}
          transparent
          animationType="fade"
          onRequestClose={() => {
            setDayToDelete(null);
            setBlocksToDelete({});
          }}
        >
          <View className="flex-1 justify-center items-center bg-black/50 p-4">
            <View className="bg-white rounded-2xl w-full max-w-sm shadow-lg p-6">
              <Text className="text-lg font-bold text-gray-900 mb-2">
                {tabView === "template"
                  ? "Delete Template Schedule"
                  : "Delete Schedule"}
              </Text>
              <Text className="text-base text-gray-600 mb-6">
                Select the schedules you want to delete for {dayToDelete}.
                {tabView === "template" && (
                  <Text className="text-amber-600 font-medium">
                    {"\n"}⚠️ This will remove the recurring schedule for all
                    future weeks.
                  </Text>
                )}
              </Text>
              <View className="gap-2 mb-6">
                {dayToDelete &&
                  (tabView === "template"
                    ? templateSchedule[dayToDelete]
                    : tabView === "thisWeek"
                      ? schedule[dayToDelete]
                      : nextWeekSchedule[dayToDelete]
                  ).map((block) => {
                    // Get specific date for week-independent booking check
                    const blockSpecificDate = block.raw?.specificDate
                      ? String(block.raw.specificDate).split("T")[0]
                      : undefined;
                    const isBooked = isTimeBlockBooked(
                      dayToDelete,
                      block.start,
                      block.end,
                      blockSpecificDate,
                    );
                    return (
                      <TouchableOpacity
                        key={block.id}
                        onPress={() =>
                          !isBooked && toggleBlockToDelete(block.id)
                        }
                        disabled={isBooked}
                        className={`border-2 rounded-xl p-4 flex-row items-center ${
                          isBooked
                            ? "border-gray-300 bg-gray-100 opacity-60"
                            : blocksToDelete[block.id]
                              ? "border-red-500 bg-red-50"
                              : "border-gray-200 bg-white"
                        }`}
                      >
                        <View className="flex-1">
                          <Text
                            className={`text-sm font-semibold ${
                              isBooked ? "text-gray-500" : "text-gray-900"
                            }`}
                          >
                            {`${toFriendlyTime(block.start)} - ${toFriendlyTime(block.end)}`}
                          </Text>
                          {isBooked && (
                            <Text className="text-xs text-gray-500 mt-1">
                              Cannot delete - Booked
                            </Text>
                          )}
                        </View>
                        <View
                          className={`w-6 h-6 rounded-full border-2 ${
                            isBooked
                              ? "border-gray-300 bg-gray-200"
                              : blocksToDelete[block.id]
                                ? "bg-red-500 border-red-500"
                                : "border-gray-300"
                          }`}
                        />
                      </TouchableOpacity>
                    );
                  })}
              </View>
              <View className="flex-row gap-3">
                <TouchableOpacity
                  onPress={() => {
                    setDayToDelete(null);
                    setBlocksToDelete({});
                  }}
                  className="flex-1 bg-gray-100 rounded-lg p-3 items-center justify-center"
                  disabled={isDeleting}
                >
                  <Text className="text-base font-semibold text-gray-800">
                    Cancel
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleDelete}
                  className={`flex-1 rounded-lg p-3 items-center justify-center ${isDeleting || Object.values(blocksToDelete).every((v) => !v) ? "bg-red-300" : "bg-red-500"}`}
                  disabled={
                    isDeleting || Object.values(blocksToDelete).every((v) => !v)
                  }
                >
                  {isDeleting ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <Text className="text-base font-semibold text-white">
                      Delete
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* Create Schedule Modal */}
        <Modal
          visible={isCreateModalVisible}
          transparent
          animationType="slide"
          onRequestClose={() => {
            resetCreateModal();
            setIsCreateModalVisible(false);
          }}
        >
          <View className="flex-1 justify-end bg-black/50">
            <View className="bg-white rounded-t-3xl p-6 max-h-[80%]">
              <View className="flex-row items-center justify-between mb-4">
                <Text className="text-xl font-bold text-gray-900">
                  Create New Schedule
                </Text>
                <TouchableOpacity
                  onPress={() => {
                    resetCreateModal();
                    setIsCreateModalVisible(false);
                  }}
                  className="p-2"
                >
                  <X size={24} color="#111" />
                </TouchableOpacity>
              </View>

              <ScrollView showsVerticalScrollIndicator={false}>
                {/* Days of the Week */}
                <Text className="text-sm font-semibold text-gray-700 mb-3">
                  Days of the Week
                </Text>
                <View className="gap-2 mb-4">
                  {DAYS.map((day) => (
                    <TouchableOpacity
                      key={day}
                      onPress={() => toggleDaySelection(day)}
                      className={`flex-row items-center justify-between border-2 rounded-xl p-4`}
                      style={
                        selectedDays[day]
                          ? {
                              borderColor: "#089769",
                              backgroundColor: "#E6F4F0",
                            }
                          : {
                              borderColor: "#E5E7EB",
                              backgroundColor: "#FFFFFF",
                            }
                      }
                    >
                      <Text
                        className={`text-base font-semibold`}
                        style={
                          selectedDays[day]
                            ? { color: "#089769" }
                            : { color: "#374151" }
                        }
                      >
                        {day}
                      </Text>
                      <View
                        className={`w-6 h-6 rounded-full border-2 items-center justify-center`}
                        style={
                          selectedDays[day]
                            ? {
                                backgroundColor: "#089769",
                                borderColor: "#089769",
                              }
                            : { borderColor: "#D1D5DB" }
                        }
                      >
                        {selectedDays[day] && (
                          <Text className="text-white text-xs font-bold">
                            ✓
                          </Text>
                        )}
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Apply target: This Week vs Next Week */}
                <Text className="text-sm font-semibold text-gray-700 mb-2">
                  Apply To
                </Text>
                <View className="flex-row gap-2 mb-4">
                  <TouchableOpacity
                    onPress={() => setApplyTarget("thisWeek")}
                    className={`px-3 py-2 rounded-md`}
                    style={
                      applyTarget === "thisWeek"
                        ? { backgroundColor: "#089769" }
                        : { backgroundColor: "#F3F4F6" }
                    }
                  >
                    <Text
                      className={`${applyTarget === "thisWeek" ? "text-white" : "text-gray-700"} text-sm font-semibold`}
                    >
                      This Week
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setApplyTarget("nextWeek")}
                    className={`px-3 py-2 rounded-md`}
                    style={
                      applyTarget === "nextWeek"
                        ? { backgroundColor: "#089769" }
                        : { backgroundColor: "#F3F4F6" }
                    }
                  >
                    <Text
                      className={`${applyTarget === "nextWeek" ? "text-white" : "text-gray-700"} text-sm font-semibold`}
                    >
                      Next Week
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* Start Time */}
                <Text className="text-sm font-semibold text-gray-700 mb-2">
                  Start Time
                </Text>
                <TextInput
                  value={startTime}
                  onChangeText={setStartTime}
                  placeholder="HH:MM (e.g., 09:00)"
                  className="border-2 border-gray-200 rounded-xl p-4 mb-4 text-base"
                  keyboardType="numbers-and-punctuation"
                />

                {/* End Time */}
                <Text className="text-sm font-semibold text-gray-700 mb-2">
                  End Time
                </Text>
                <TextInput
                  value={endTime}
                  onChangeText={setEndTime}
                  placeholder="HH:MM (e.g., 17:00)"
                  className="border-2 border-gray-200 rounded-xl p-4 mb-6 text-base"
                  keyboardType="numbers-and-punctuation"
                />

                {/* Create Button */}
                <TouchableOpacity
                  onPress={handleCreateSchedule}
                  disabled={isCreating}
                  className={`rounded-xl p-4 items-center justify-center`}
                  style={
                    isCreating
                      ? { backgroundColor: "#6EE7B7" }
                      : { backgroundColor: "#089769" }
                  }
                >
                  {isCreating ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <Text className="text-white text-base font-bold">
                      Create Schedule
                    </Text>
                  )}
                </TouchableOpacity>
              </ScrollView>
            </View>
          </View>
        </Modal>

        {/* Available Slot Info Modal */}
        <Modal
          visible={isSlotModalVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setIsSlotModalVisible(false)}
        >
          <View className="flex-1 bg-black/50 justify-center items-center p-4">
            <View className="bg-white rounded-2xl w-full max-w-md p-6">
              <View className="items-center mb-4">
                <View className="w-16 h-16 bg-emerald-100 rounded-full items-center justify-center mb-3">
                  <Clock size={32} color="#089769" />
                </View>
                <Text className="text-xl font-bold text-gray-900 mb-1">
                  Available Time Slot
                </Text>
                <Text className="text-sm text-gray-500 text-center">
                  This slot is open for booking
                </Text>
              </View>

              <View className="bg-gray-50 rounded-xl p-4 mb-4">
                <View className="flex-row items-center justify-between mb-2">
                  <Text className="text-sm font-medium text-gray-600">Day</Text>
                  <Text className="text-base font-semibold text-gray-900">
                    {selectedSlot?.day}
                  </Text>
                </View>
                <View className="flex-row items-center justify-between">
                  <Text className="text-sm font-medium text-gray-600">
                    Time
                  </Text>
                  <Text className="text-base font-semibold text-gray-900">
                    {selectedSlot?.start} - {selectedSlot?.end}
                  </Text>
                </View>
              </View>

              <TouchableOpacity
                onPress={() => setIsSlotModalVisible(false)}
                className="rounded-xl p-4 items-center"
                style={{ backgroundColor: "#089769" }}
              >
                <Text className="text-white text-base font-bold">OK</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    </View>
  );
}

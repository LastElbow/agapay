import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Dimensions,
} from "react-native";
import { ChevronLeft, ChevronRight, Clock } from "lucide-react-native";
import {
  generateCalendarMonth,
  getMonthName,
  getDayHeaders,
  dateToISOString,
  getCurrentYearMonth,
  getPreviousMonth,
  getNextMonth,
  type CalendarDay,
} from "@/src/utils/calendar";

interface ScheduleTimeBlock {
  id: string;
  start: string;
  end: string;
  day: string;
  specificDate?: string; // ISO date string (YYYY-MM-DD)
  isBooked?: boolean;
  status?: "available" | "booked" | "completed" | "cancelled";
  patientName?: string;
  sessionId?: number;
}

interface SessionCalendarProps {
  scheduleBlocks: ScheduleTimeBlock[];
  onDayPress?: (date: Date, blocks: ScheduleTimeBlock[]) => void;
  onBlockPress?: (block: ScheduleTimeBlock) => void;
}

type ViewMode = "month" | "week" | "day";

// Helper to parse friendly time (e.g., "6:00 AM") to hour number
const parseTimeToHour = (timeStr: string): number => {
  const match = timeStr.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!match) return -1;
  let hour = parseInt(match[1], 10);
  const period = match[3]?.toUpperCase();
  if (period === "PM" && hour !== 12) hour += 12;
  if (period === "AM" && hour === 12) hour = 0;
  return hour;
};

export default function SessionCalendar({
  scheduleBlocks,
  onDayPress,
  onBlockPress,
}: SessionCalendarProps) {
  const { year: currentYear, month: currentMonth } = getCurrentYearMonth();
  const [year, setYear] = useState(currentYear);
  const [month, setMonth] = useState(currentMonth);
  const [viewMode, setViewMode] = useState<ViewMode>("month");
  const [selectedDate, setSelectedDate] = useState<Date>(new Date()); // For day view

  const weeks = generateCalendarMonth(year, month);
  const dayHeaders = getDayHeaders();
  const screenWidth = Dimensions.get("window").width;

  // Get the current week's days (Sunday to Saturday containing today or selectedDate)
  const currentWeekDays = React.useMemo(() => {
    const referenceDate = new Date();
    const dayOfWeek = referenceDate.getDay();
    const startOfWeek = new Date(referenceDate);
    startOfWeek.setDate(referenceDate.getDate() - dayOfWeek);
    startOfWeek.setHours(0, 0, 0, 0);

    return Array.from({ length: 7 }, (_, i) => {
      const date = new Date(startOfWeek);
      date.setDate(startOfWeek.getDate() + i);
      return {
        date,
        dayOfMonth: date.getDate(),
        isToday: date.toDateString() === new Date().toDateString(),
        isCurrentMonth:
          date.getMonth() === month && date.getFullYear() === year,
        dayName: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][i],
      };
    });
  }, [month, year]);

  // Map schedule blocks by day of week for display
  const scheduleByDayOfWeek: Record<string, ScheduleTimeBlock[]> = {};
  scheduleBlocks.forEach((block) => {
    const day = block.day.toLowerCase();
    if (!scheduleByDayOfWeek[day]) {
      scheduleByDayOfWeek[day] = [];
    }
    scheduleByDayOfWeek[day].push(block);
  });

  const handlePrevMonth = () => {
    const prev = getPreviousMonth(year, month);
    setYear(prev.year);
    setMonth(prev.month);
  };

  const handleNextMonth = () => {
    const next = getNextMonth(year, month);
    setYear(next.year);
    setMonth(next.month);
  };

  const getBlocksForDay = (calDay: CalendarDay): ScheduleTimeBlock[] => {
    // Format the calendar day as YYYY-MM-DD to match specificDate
    const calDateStr = dateToISOString(calDay.date);

    // Filter blocks that match this specific date
    return scheduleBlocks.filter((block) => {
      if (block.specificDate) {
        // If block has a specific date, match exactly
        return block.specificDate === calDateStr;
      }
      // If no specific date, don't show on any day (we only use specific-date entries now)
      return false;
    });
  };

  const handleDayPress = (calDay: CalendarDay) => {
    if (!calDay.isCurrentMonth) return;

    // Prevent selecting past dates
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const selectedDate = new Date(calDay.date);
    selectedDate.setHours(0, 0, 0, 0);
    if (selectedDate < today) return;

    const blocks = getBlocksForDay(calDay);
    onDayPress?.(calDay.date, blocks);
  };

  return (
    <View className="bg-white flex-1">
      {/* Header with View Mode Selector */}
      <View className="border-b border-gray-200">
        {/* Navigation Bar */}
        <View className="flex-row items-center justify-between px-4 py-3">
          <View className="flex-row items-center">
            <TouchableOpacity
              onPress={handlePrevMonth}
              className="p-2 mr-2"
              accessibilityRole="button"
              accessibilityLabel="Previous month"
            >
              <ChevronLeft size={20} color="#5F6368" />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleNextMonth}
              className="p-2"
              accessibilityRole="button"
              accessibilityLabel="Next month"
            >
              <ChevronRight size={20} color="#5F6368" />
            </TouchableOpacity>
            <Text className="text-xl font-normal text-gray-700 ml-3">
              {getMonthName(month)} {year}
            </Text>
          </View>

          {/* View Mode Toggle */}
          <View className="flex-row bg-white border border-gray-300 rounded-lg overflow-hidden">
            <TouchableOpacity
              onPress={() => setViewMode("month")}
              className={`px-3 py-1.5 ${viewMode === "month" ? "bg-gray-100" : ""}`}
            >
              <Text
                className={`text-xs font-medium ${viewMode === "month" ? "text-[#1A73E8]" : "text-gray-600"}`}
              >
                Month
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setViewMode("week")}
              className={`px-3 py-1.5 border-l border-r border-gray-300 ${viewMode === "week" ? "bg-gray-100" : ""}`}
            >
              <Text
                className={`text-xs font-medium ${viewMode === "week" ? "text-[#1A73E8]" : "text-gray-600"}`}
              >
                Week
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setViewMode("day")}
              className={`px-3 py-1.5 ${viewMode === "day" ? "bg-gray-100" : ""}`}
            >
              <Text
                className={`text-xs font-medium ${viewMode === "day" ? "text-[#1A73E8]" : "text-gray-600"}`}
              >
                Day
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Day Headers - Only show for Month view */}
        {viewMode === "month" && (
          <View className="flex-row bg-white border-t border-gray-200">
            {dayHeaders.map((header) => (
              <View key={header} className="flex-1 py-2">
                <Text className="text-center text-[11px] font-medium text-gray-600">
                  {header}
                </Text>
              </View>
            ))}
          </View>
        )}
      </View>

      {/* Calendar Grid - Month View */}
      {viewMode === "month" && (
        <ScrollView className="flex-1">
          {weeks.map((week, weekIndex) => (
            <View key={weekIndex} className="flex-row border-b border-gray-100">
              {week.days.map((day, dayIndex) => {
                const blocks = getBlocksForDay(day);
                const hasBlocks = blocks.length > 0 && day.isCurrentMonth;

                // Check if date is in the past
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const dayDate = new Date(day.date);
                dayDate.setHours(0, 0, 0, 0);
                const isPast = dayDate < today;

                // Check if date is within current week
                const todayIndex = today.getDay();
                const startOfWeek = new Date(today);
                startOfWeek.setDate(today.getDate() - todayIndex);
                startOfWeek.setHours(0, 0, 0, 0);
                const endOfWeek = new Date(startOfWeek);
                endOfWeek.setDate(startOfWeek.getDate() + 6);
                endOfWeek.setHours(23, 59, 59, 999);
                const isInCurrentWeek =
                  dayDate >= startOfWeek && dayDate <= endOfWeek;

                return (
                  <TouchableOpacity
                    key={dayIndex}
                    onPress={() => handleDayPress(day)}
                    disabled={
                      !day.isCurrentMonth || (isPast && !isInCurrentWeek)
                    }
                    className={`flex-1 p-1 min-h-[90px] border-r border-gray-100 ${
                      !day.isCurrentMonth
                        ? "bg-gray-50"
                        : isPast && !isInCurrentWeek
                          ? "bg-gray-50"
                          : "bg-white"
                    }`}
                    style={{ maxWidth: screenWidth / 7 }}
                    accessibilityRole="button"
                    accessibilityLabel={`${day.dayOfMonth} ${
                      day.isCurrentMonth ? getMonthName(month) : ""
                    }`}
                  >
                    <View>
                      {/* Day Number */}
                      <View className="items-center mb-1">
                        <View
                          className={`w-7 h-7 rounded-full items-center justify-center ${
                            day.isToday ? "bg-[#1A73E8]" : ""
                          }`}
                        >
                          <Text
                            className={`text-xs ${
                              day.isToday
                                ? "font-semibold text-white"
                                : day.isCurrentMonth && !isPast
                                  ? "text-gray-900"
                                  : "text-gray-400"
                            }`}
                          >
                            {day.dayOfMonth}
                          </Text>
                        </View>
                      </View>

                      {/* Schedule Blocks - Show blocks for current week and future */}
                      {hasBlocks && (isInCurrentWeek || !isPast) && (
                        <View className="gap-1 mt-1">
                          {blocks.slice(0, 2).map((block, idx) => {
                            const status = block.status || "available";
                            let bgColor = "#1A73E8"; // Blue for available
                            let opacity = 1;

                            if (status === "booked") {
                              bgColor = "#DC2626"; // Red for booked
                            } else if (status === "completed") {
                              bgColor = "#10B981"; // Green for completed
                              opacity = 0.85;
                            } else if (status === "cancelled") {
                              bgColor = "#9CA3AF"; // Gray for cancelled
                              opacity = 0.7;
                            }

                            return (
                              <TouchableOpacity
                                key={block.id}
                                className="rounded-md px-1.5 py-1"
                                style={{ backgroundColor: bgColor, opacity }}
                                onPress={() => onBlockPress?.(block)}
                                activeOpacity={0.7}
                              >
                                <Text
                                  className="text-[10px] text-white font-semibold"
                                  numberOfLines={1}
                                >
                                  {block.start} - {block.end}
                                </Text>
                                {(status === "booked" ||
                                  status === "completed") &&
                                  block.patientName && (
                                    <Text
                                      className="text-[9px] text-white"
                                      numberOfLines={1}
                                      style={{ opacity: 0.9 }}
                                    >
                                      {block.patientName}
                                    </Text>
                                  )}
                                {status === "cancelled" && (
                                  <Text
                                    className="text-[9px] text-white italic"
                                    style={{ opacity: 0.8 }}
                                  >
                                    Cancelled
                                  </Text>
                                )}
                              </TouchableOpacity>
                            );
                          })}
                          {blocks.length > 2 && (
                            <Text className="text-[10px] text-gray-500 text-center mt-0.5 font-medium">
                              +{blocks.length - 2} more
                            </Text>
                          )}
                        </View>
                      )}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          ))}
        </ScrollView>
      )}

      {/* Week View */}
      {viewMode === "week" && (
        <ScrollView className="flex-1">
          {/* Week day headers */}
          <View className="flex-row border-b border-gray-200 bg-white">
            <View className="w-12" />
            {currentWeekDays.map((day, idx) => (
              <View
                key={idx}
                className="flex-1 py-2 items-center border-r border-gray-100"
              >
                <Text className="text-[10px] text-gray-500 mb-1">
                  {day.dayName}
                </Text>
                <View
                  className={`w-6 h-6 rounded-full items-center justify-center ${day.isToday ? "bg-[#1A73E8]" : ""}`}
                >
                  <Text
                    className={`text-xs font-medium ${day.isToday ? "text-white" : "text-gray-700"}`}
                  >
                    {day.dayOfMonth}
                  </Text>
                </View>
              </View>
            ))}
          </View>

          <View className="flex-row">
            {/* Time column */}
            <View className="w-14 bg-gray-50 border-r border-gray-200">
              {Array.from({ length: 14 }, (_, i) => i + 6).map((hour) => (
                <View key={hour} className="h-20 justify-start pt-2">
                  <Text className="text-xs text-gray-500 text-center font-medium">
                    {hour === 0 || hour === 12
                      ? 12
                      : hour > 12
                        ? hour - 12
                        : hour}
                    {hour < 12 ? " AM" : " PM"}
                  </Text>
                </View>
              ))}
            </View>

            {/* Week days with time slots */}
            {currentWeekDays.map((day, dayIdx) => {
              const dateStr = `${day.date.getFullYear()}-${String(day.date.getMonth() + 1).padStart(2, "0")}-${String(day.date.getDate()).padStart(2, "0")}`;
              const blocks = scheduleBlocks.filter(
                (b) => b.specificDate === dateStr,
              );

              return (
                <View key={dayIdx} className="flex-1 border-r border-gray-100">
                  {Array.from({ length: 14 }, (_, i) => i + 6).map((hour) => {
                    const hourBlocks = blocks.filter((b) => {
                      const blockHour = parseTimeToHour(b.start);
                      return blockHour === hour;
                    });

                    return (
                      <View
                        key={hour}
                        className="h-20 border-b border-gray-100 p-1"
                      >
                        {hourBlocks.map((block) => {
                          const status = block.status || "available";
                          let bgColor = "#1A73E8";
                          if (status === "booked") bgColor = "#DC2626";
                          else if (status === "completed") bgColor = "#10B981";
                          else if (status === "cancelled") bgColor = "#9CA3AF";

                          return (
                            <TouchableOpacity
                              key={block.id}
                              className="rounded-md p-2 mb-1 flex-1 justify-center"
                              style={{
                                backgroundColor: bgColor,
                                minHeight: 52,
                              }}
                              onPress={() => onBlockPress?.(block)}
                              activeOpacity={0.7}
                            >
                              <Text
                                className="text-xs text-white font-semibold"
                                numberOfLines={1}
                              >
                                {status === "booked"
                                  ? "Booked"
                                  : status === "completed"
                                    ? "Done"
                                    : status === "cancelled"
                                      ? "Cancelled"
                                      : "Available"}
                              </Text>
                              <Text
                                className="text-[11px] text-white mt-0.5"
                                style={{ opacity: 0.9 }}
                                numberOfLines={1}
                              >
                                {block.start} - {block.end}
                              </Text>
                              {block.patientName &&
                                (status === "booked" ||
                                  status === "completed") && (
                                  <Text
                                    className="text-[10px] text-white mt-0.5"
                                    style={{ opacity: 0.8 }}
                                    numberOfLines={1}
                                  >
                                    {block.patientName}
                                  </Text>
                                )}
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    );
                  })}
                </View>
              );
            })}
          </View>
        </ScrollView>
      )}

      {/* Day View */}
      {viewMode === "day" && (
        <ScrollView className="flex-1">
          {/* Day selector */}
          <View className="flex-row items-center justify-center py-3 bg-white border-b border-gray-200">
            <TouchableOpacity
              onPress={() => {
                const newDate = new Date(selectedDate);
                newDate.setDate(newDate.getDate() - 1);
                setSelectedDate(newDate);
              }}
              className="p-2"
            >
              <ChevronLeft size={20} color="#5F6368" />
            </TouchableOpacity>
            <View className="mx-4 items-center">
              <Text className="text-lg font-medium text-gray-900">
                {selectedDate.toLocaleDateString(undefined, {
                  weekday: "long",
                  month: "short",
                  day: "numeric",
                })}
              </Text>
              {selectedDate.toDateString() === new Date().toDateString() && (
                <Text className="text-xs text-[#1A73E8] font-medium">
                  Today
                </Text>
              )}
            </View>
            <TouchableOpacity
              onPress={() => {
                const newDate = new Date(selectedDate);
                newDate.setDate(newDate.getDate() + 1);
                setSelectedDate(newDate);
              }}
              className="p-2"
            >
              <ChevronRight size={20} color="#5F6368" />
            </TouchableOpacity>
          </View>

          <View className="flex-row">
            {/* Time column */}
            <View className="w-16 bg-gray-50 border-r border-gray-200">
              {Array.from({ length: 14 }, (_, i) => i + 6).map((hour) => (
                <View
                  key={hour}
                  className="h-20 justify-start pt-1 border-b border-gray-100"
                >
                  <Text className="text-xs text-gray-600 text-right pr-2">
                    {hour === 0 || hour === 12
                      ? 12
                      : hour > 12
                        ? hour - 12
                        : hour}
                    {hour < 12 ? " AM" : " PM"}
                  </Text>
                </View>
              ))}
            </View>

            {/* Day schedule */}
            <View className="flex-1">
              {(() => {
                const dateStr = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, "0")}-${String(selectedDate.getDate()).padStart(2, "0")}`;
                const dayBlocks = scheduleBlocks.filter(
                  (b) => b.specificDate === dateStr,
                );

                return Array.from({ length: 14 }, (_, i) => i + 6).map(
                  (hour) => {
                    const hourBlocks = dayBlocks.filter((b) => {
                      const blockHour = parseTimeToHour(b.start);
                      return blockHour === hour;
                    });

                    return (
                      <View
                        key={hour}
                        className="h-20 border-b border-gray-100 p-2"
                      >
                        {hourBlocks.map((block) => {
                          const status = block.status || "available";
                          let bgColor = "#1A73E8";
                          if (status === "booked") bgColor = "#DC2626";
                          else if (status === "completed") bgColor = "#10B981";
                          else if (status === "cancelled") bgColor = "#9CA3AF";

                          return (
                            <TouchableOpacity
                              key={block.id}
                              className="rounded-lg p-3 mb-2 flex-row items-center"
                              style={{ backgroundColor: bgColor }}
                              onPress={() => onBlockPress?.(block)}
                              activeOpacity={0.7}
                            >
                              <Clock size={14} color="#FFFFFF" />
                              <View className="ml-2 flex-1">
                                <Text className="text-sm text-white font-semibold">
                                  {status === "booked"
                                    ? "Booked"
                                    : status === "completed"
                                      ? "Completed"
                                      : status === "cancelled"
                                        ? "Cancelled"
                                        : "Available"}
                                </Text>
                                <Text className="text-xs text-white opacity-90">
                                  {block.start} - {block.end}
                                </Text>
                                {block.patientName &&
                                  (status === "booked" ||
                                    status === "completed") && (
                                    <Text className="text-xs text-white opacity-80 mt-0.5">
                                      {block.patientName}
                                    </Text>
                                  )}
                              </View>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    );
                  },
                );
              })()}
            </View>
          </View>
        </ScrollView>
      )}
    </View>
  );
}

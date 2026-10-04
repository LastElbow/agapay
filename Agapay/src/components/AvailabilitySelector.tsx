import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Modal,
  Pressable,
} from "react-native";
import {
  availabilityBlocksToHourStarts,
  hourStartsToAvailabilityBlocks,
} from "@/src/features/scheduling/core/availabilityHourBlocks";

export interface AvailabilityBlock {
  dayOfWeek: number; // 0=Sunday, 1=Monday, ..., 6=Saturday
  startTime: string; // "HH:MM:SS" format
  endTime: string; // "HH:MM:SS" format
}

interface AvailabilitySelectorProps {
  value: AvailabilityBlock[];
  onChange: (blocks: AvailabilityBlock[]) => void;
  label?: string;
}

const DAYS = [
  { id: 1, name: "Monday", shortName: "Mon" },
  { id: 2, name: "Tuesday", shortName: "Tue" },
  { id: 3, name: "Wednesday", shortName: "Wed" },
  { id: 4, name: "Thursday", shortName: "Thu" },
  { id: 5, name: "Friday", shortName: "Fri" },
  { id: 6, name: "Saturday", shortName: "Sat" },
  { id: 0, name: "Sunday", shortName: "Sun" },
];

// Generate 1-hour time blocks from 6 AM to 10 PM
// Each block represents a 1-hour period (e.g., 9 = 9:00 AM - 10:00 AM)
const HOUR_BLOCKS = Array.from({ length: 16 }, (_, i) => i + 6); // 6-21 (6 AM-7 AM through 9 PM-10 PM)

export default function AvailabilitySelector({
  value = [],
  onChange,
  label = "Availability",
}: AvailabilitySelectorProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [selectedHourBlocks, setSelectedHourBlocks] = useState<Set<number>>(
    new Set(),
  );

  // Format time display for a 1-hour block (e.g., "9 AM - 10 AM")
  const formatTimeBlock = (startHour: number): string => {
    const formatHour = (hour: number): string => {
      const h = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
      const ampm = hour < 12 ? "AM" : "PM";
      return `${h} ${ampm}`;
    };
    return `${formatHour(startHour)}-${formatHour(startHour + 1)}`;
  };

  // Handle opening modal for a specific day
  const openDayEditor = (dayId: number) => {
    setSelectedDay(dayId);
    setSelectedHourBlocks(
      availabilityBlocksToHourStarts({ blocks: value, dayOfWeek: dayId }),
    );
    setModalOpen(true);
  };

  // Toggle hour block selection (1-hour blocks)
  const toggleHourBlock = (startHour: number) => {
    const newBlocks = new Set(selectedHourBlocks);
    if (newBlocks.has(startHour)) {
      newBlocks.delete(startHour);
    } else {
      newBlocks.add(startHour);
    }
    setSelectedHourBlocks(newBlocks);
  };

  // Save changes
  const saveChanges = () => {
    if (selectedDay === null) return;

    // Remove existing blocks for this day
    const otherDayBlocks = value.filter((b) => b.dayOfWeek !== selectedDay);

    // Add new blocks for this day
    const newDayBlocks = hourStartsToAvailabilityBlocks({
      hourStarts: selectedHourBlocks,
      dayOfWeek: selectedDay,
    }) as AvailabilityBlock[];

    onChange([...otherDayBlocks, ...newDayBlocks]);
    setModalOpen(false);
  };

  // Get summary for a day
  const getDaySummary = (dayId: number): string => {
    const dayBlocks = value.filter((b) => b.dayOfWeek === dayId);
    if (dayBlocks.length === 0) return "Not set";

    const hourBlocks = availabilityBlocksToHourStarts({
      blocks: value,
      dayOfWeek: dayId,
    });
    if (hourBlocks.size === 0) return "Not set";

    const sortedHours = Array.from(hourBlocks).sort((a, b) => a - b);
    const first = sortedHours[0];
    const last = sortedHours[sortedHours.length - 1];

    const formatHour = (hour: number): string => {
      const h = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
      const ampm = hour < 12 ? "AM" : "PM";
      return `${h} ${ampm}`;
    };

    return `${formatHour(first)} - ${formatHour(last + 1)} (${
      hourBlocks.size
    }h)`;
  };

  const hasAnyAvailability = value.length > 0;

  return (
    <View>
      <Text className="text-base text-[#6B7280] mt-3 mb-1.5 font-medium">
        {label}
      </Text>

      <View className="bg-white rounded-xl border border-[#E5E7EB] mb-3">
        {DAYS.map((day) => (
          <TouchableOpacity
            key={day.id}
            className="px-4 py-3 border-b border-[#E5E7EB] last:border-b-0 flex-row justify-between items-center"
            onPress={() => openDayEditor(day.id)}
          >
            <Text className="text-base font-medium text-gray-900">
              {day.name}
            </Text>
            <Text className="text-sm text-gray-500">
              {getDaySummary(day.id)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {hasAnyAvailability && (
        <Text className="text-xs text-gray-500 mb-2">
          Tap a day to edit availability
        </Text>
      )}

      {/* Day Editor Modal */}
      <Modal
        visible={modalOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setModalOpen(false)}
      >
        <View className="flex-1 justify-end bg-black/50">
          <View className="bg-white rounded-t-3xl max-h-[80%]">
            <View className="flex-row items-center justify-between p-5 border-b border-gray-200">
              <Text className="text-lg font-bold text-gray-900">
                {DAYS.find((d) => d.id === selectedDay)?.name} Availability
              </Text>
              <TouchableOpacity
                className="w-8 h-8 items-center justify-center"
                onPress={() => setModalOpen(false)}
              >
                <Text className="text-2xl text-gray-500">×</Text>
              </TouchableOpacity>
            </View>

            <ScrollView className="p-5">
              <Text className="text-sm text-gray-600 mb-4">
                Select 1-hour blocks when you&apos;re available
              </Text>

              <View className="flex-row flex-wrap gap-2">
                {HOUR_BLOCKS.map((startHour) => {
                  const isSelected = selectedHourBlocks.has(startHour);
                  return (
                    <Pressable
                      key={startHour}
                      className={`px-3 py-3 rounded-lg border ${
                        isSelected
                          ? "bg-blue-500 border-blue-600"
                          : "bg-white border-gray-300"
                      }`}
                      style={{ width: "30%" }}
                      onPress={() => toggleHourBlock(startHour)}
                    >
                      <Text
                        className={`text-center font-medium text-xs ${
                          isSelected ? "text-white" : "text-gray-700"
                        }`}
                      >
                        {formatTimeBlock(startHour)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {selectedHourBlocks.size > 0 && (
                <View className="mt-4 p-3 bg-blue-50 rounded-lg">
                  <Text className="text-sm text-blue-900">
                    Selected: {selectedHourBlocks.size} hour(s)
                  </Text>
                </View>
              )}
            </ScrollView>

            <View className="p-5 border-t border-gray-200 flex-row gap-3">
              <TouchableOpacity
                className="flex-1 py-3 rounded-xl border border-gray-300"
                onPress={() => {
                  setSelectedHourBlocks(new Set());
                }}
              >
                <Text className="text-center text-gray-700 font-medium">
                  Clear
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                className="flex-1 py-3 rounded-xl bg-blue-500"
                onPress={saveChanges}
              >
                <Text className="text-center text-white font-medium">Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

import RecommendHeader from "@/src/components/RecommendHeader";
import PrimaryButton from "@/src/components/PrimaryButton";
import FormField from "@/src/components/FormField";
import type { AvailabilityBlock } from "@/src/components/AvailabilitySelector";
import {
  buildAvailabilityBlocks,
  canProceedPreferencesStep1,
  filterTimeOptions,
  getSpecializationDisplayText,
} from "@/src/features/recommendations/core/preferencesStep1";
import { useRouter } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import {
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const SPECIALIZATIONS = [
  { id: "cardio", name: "Cardiopulmonary" },
  { id: "geriatric", name: "Geriatric" },
  { id: "musculo", name: "Musculoskeletal" },
  { id: "neuro", name: "Neurologic" },
  { id: "ortho", name: "Orthopedic" },
  { id: "pedia", name: "Pediatric" },
  { id: "sports", name: "Sports" },
  { id: "vestibular", name: "Vestibular" },
];

const DAYS_OF_WEEK = [
  { id: 1, name: "Monday", shortName: "Mon" },
  { id: 2, name: "Tuesday", shortName: "Tue" },
  { id: 3, name: "Wednesday", shortName: "Wed" },
  { id: 4, name: "Thursday", shortName: "Thu" },
  { id: 5, name: "Friday", shortName: "Fri" },
  { id: 6, name: "Saturday", shortName: "Sat" },
  { id: 0, name: "Sunday", shortName: "Sun" },
];

const TIME_OPTIONS = [
  { value: "06:00:00", label: "6:00 AM" },
  { value: "06:30:00", label: "6:30 AM" },
  { value: "07:00:00", label: "7:00 AM" },
  { value: "07:30:00", label: "7:30 AM" },
  { value: "08:00:00", label: "8:00 AM" },
  { value: "08:30:00", label: "8:30 AM" },
  { value: "09:00:00", label: "9:00 AM" },
  { value: "09:30:00", label: "9:30 AM" },
  { value: "10:00:00", label: "10:00 AM" },
  { value: "10:30:00", label: "10:30 AM" },
  { value: "11:00:00", label: "11:00 AM" },
  { value: "11:30:00", label: "11:30 AM" },
  { value: "12:00:00", label: "12:00 PM" },
  { value: "12:30:00", label: "12:30 PM" },
  { value: "13:00:00", label: "1:00 PM" },
  { value: "13:30:00", label: "1:30 PM" },
  { value: "14:00:00", label: "2:00 PM" },
  { value: "14:30:00", label: "2:30 PM" },
  { value: "15:00:00", label: "3:00 PM" },
  { value: "15:30:00", label: "3:30 PM" },
  { value: "16:00:00", label: "4:00 PM" },
  { value: "16:30:00", label: "4:30 PM" },
  { value: "17:00:00", label: "5:00 PM" },
  { value: "17:30:00", label: "5:30 PM" },
  { value: "18:00:00", label: "6:00 PM" },
  { value: "18:30:00", label: "6:30 PM" },
  { value: "19:00:00", label: "7:00 PM" },
  { value: "19:30:00", label: "7:30 PM" },
  { value: "20:00:00", label: "8:00 PM" },
];

export default function RecommendStep1() {
  const router = useRouter();

  // Specialization dropdown - now supports multiple selections
  const [specializationOpen, setSpecializationOpen] = useState(false);
  const [selectedSpecializations, setSelectedSpecializations] = useState<
    string[]
  >([]);

  // Budget
  const [sessionBudget, setSessionBudget] = useState<string | null>(null);

  // Simplified Availability state
  const [selectedDays, setSelectedDays] = useState<number[]>([]);
  const [startTime, setStartTime] = useState<string>("06:00:00");
  const [endTime, setEndTime] = useState<string>("20:00:00");
  const [timeModalOpen, setTimeModalOpen] = useState<"start" | "end" | null>(
    null,
  );

  // Gender preference
  const [preferredTherapistGender, setPreferredTherapistGender] = useState<
    string | null
  >(null);
  const [genderModalOpen, setGenderModalOpen] = useState(false);

  const GENDERS = useMemo(() => ["Male", "Female", "Any"], []);

  // Toggle day selection
  const toggleDay = (dayId: number) => {
    setSelectedDays((prev) => {
      if (prev.includes(dayId)) {
        return prev.filter((d) => d !== dayId);
      } else {
        return [...prev, dayId];
      }
    });
  };

  // Convert selected days and time range to AvailabilityBlock format
  const availabilities = useMemo((): AvailabilityBlock[] => {
    return buildAvailabilityBlocks({ selectedDays, startTime, endTime });
  }, [selectedDays, startTime, endTime]);

  // Get label for time
  const getTimeLabel = (timeValue: string): string => {
    return TIME_OPTIONS.find((t) => t.value === timeValue)?.label || timeValue;
  };

  // Toggle specialization selection
  const toggleSpecialization = useCallback((name: string) => {
    setSelectedSpecializations((prev) => {
      if (prev.includes(name)) {
        return prev.filter((s) => s !== name);
      } else {
        return [...prev, name];
      }
    });
  }, []);

  const renderSpecializationItem = useCallback(
    ({ item }: { item: (typeof SPECIALIZATIONS)[number] }) => {
      const selected = selectedSpecializations.includes(item.name);
      return (
        <Pressable
          className={`px-5 py-4 border-b border-[#F0F0F0] active:bg-gray-50 flex-row items-center justify-between ${
            selected ? "bg-[#E8F1FF]" : "bg-white"
          }`}
          onPress={() => toggleSpecialization(item.name)}
        >
          <Text
            className={`text-base ${
              selected ? "font-semibold text-primary" : "text-gray-900"
            }`}
          >
            {item.name}
          </Text>
          <View
            className={`w-6 h-6 rounded-md border-2 items-center justify-center ${
              selected ? "bg-[#00358E] border-[#00358E]" : "border-gray-300"
            }`}
          >
            {selected && (
              <Text className="text-white text-xs font-bold">✓</Text>
            )}
          </View>
        </Pressable>
      );
    },
    [selectedSpecializations, toggleSpecialization],
  );

  const renderGenderItem = useCallback(
    ({ item }: { item: string }) => {
      const selected = item === preferredTherapistGender;
      return (
        <Pressable
          className={`px-5 py-4 border-b border-[#F0F0F0] active:bg-gray-50 ${
            selected ? "bg-[#E8F1FF]" : "bg-white"
          }`}
          onPress={() => {
            setPreferredTherapistGender(item);
            setGenderModalOpen(false);
          }}
        >
          <Text
            className={`text-base ${
              selected ? "font-semibold text-primary" : "text-gray-900"
            }`}
          >
            {item}
          </Text>
        </Pressable>
      );
    },
    [preferredTherapistGender],
  );

  const filteredTimeOptions = useMemo(() => {
    return filterTimeOptions({
      timeOptions: TIME_OPTIONS,
      timeModalOpen,
      startTime,
      endTime,
    });
  }, [timeModalOpen, startTime, endTime]);

  const renderTimeItem = useCallback(
    ({ item }: { item: (typeof TIME_OPTIONS)[number] }) => {
      const currentValue = timeModalOpen === "start" ? startTime : endTime;
      const selected = item.value === currentValue;
      return (
        <Pressable
          className={`px-5 py-4 border-b border-[#F0F0F0] active:bg-gray-50 ${
            selected ? "bg-[#E8F1FF]" : "bg-white"
          }`}
          onPress={() => {
            if (timeModalOpen === "start") {
              setStartTime(item.value);
            } else {
              setEndTime(item.value);
            }
            setTimeModalOpen(null);
          }}
        >
          <Text
            className={`text-base ${
              selected ? "font-semibold text-primary" : "text-gray-900"
            }`}
          >
            {item.label}
          </Text>
        </Pressable>
      );
    },
    [timeModalOpen, startTime, endTime],
  );

  // Format selected specializations for display
  const specializationDisplayText = useMemo(() => {
    return getSpecializationDisplayText(selectedSpecializations);
  }, [selectedSpecializations]);

  const canProceed = useMemo(() => {
    return canProceedPreferencesStep1({
      selectedSpecializations,
      sessionBudget,
      preferredTherapistGender,
      selectedDays,
    });
  }, [
    selectedSpecializations,
    sessionBudget,
    preferredTherapistGender,
    selectedDays,
  ]);

  return (
    <SafeAreaView className="flex-1 bg-[#F5F5F5]">
      <View className="flex-1">
        <RecommendHeader
          title="Preferences"
          currentStep={0}
          totalSteps={2}
          hideSteps={true}
          onBack={() => router.replace("/(patient)/recommend/results")}
        />

        <ScrollView
          className="flex-1"
          contentContainerClassName="px-5 py-6 lg:max-w-4xl lg:mx-auto lg:w-full"
        >
          {/* Specialization */}
          <Text className="text-base text-[#6B7280] mt-3 mb-1.5 font-medium">
            Specialization
          </Text>
          <TouchableOpacity
            className="bg-white p-3 rounded-xl mb-3 border border-[#E5E7EB]"
            onPress={() => setSpecializationOpen(true)}
          >
            <Text
              className={`text-base ${
                selectedSpecializations.length > 0
                  ? "text-gray-900"
                  : "text-gray-500"
              }`}
            >
              {specializationDisplayText}
            </Text>
          </TouchableOpacity>

          {/* Budget */}
          <FormField
            label="Session budget"
            value={sessionBudget ?? ""}
            onChangeText={setSessionBudget as any}
            placeholder="1500.00"
            inputProps={{ keyboardType: "numeric" }}
          />

          {/* Simplified Weekly Availability */}
          <Text className="text-base text-[#6B7280] mt-3 mb-1.5 font-medium">
            Weekly availability
          </Text>

          {/* Time Range Selector */}
          <View className="bg-white rounded-xl border border-[#E5E7EB] p-4 mb-3">
            <Text className="text-sm text-gray-600 mb-3">
              Set your preferred time range
            </Text>
            <View className="flex-row items-center gap-3">
              <TouchableOpacity
                className="flex-1 bg-gray-50 border border-gray-200 rounded-lg p-3"
                onPress={() => setTimeModalOpen("start")}
              >
                <Text className="text-xs text-gray-500 mb-1">From</Text>
                <Text className="text-base font-medium text-gray-900">
                  {getTimeLabel(startTime)}
                </Text>
              </TouchableOpacity>
              <Text className="text-gray-400">to</Text>
              <TouchableOpacity
                className="flex-1 bg-gray-50 border border-gray-200 rounded-lg p-3"
                onPress={() => setTimeModalOpen("end")}
              >
                <Text className="text-xs text-gray-500 mb-1">To</Text>
                <Text className="text-base font-medium text-gray-900">
                  {getTimeLabel(endTime)}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Day Selection */}
          <View className="bg-white rounded-xl border border-[#E5E7EB] p-4 mb-3">
            <Text className="text-sm text-gray-600 mb-3">
              Select days you’re available
            </Text>
            <View className="flex-row flex-wrap gap-2">
              {DAYS_OF_WEEK.map((day) => {
                const isSelected = selectedDays.includes(day.id);
                return (
                  <TouchableOpacity
                    key={day.id}
                    className={`px-4 py-2.5 rounded-lg border ${
                      isSelected
                        ? "bg-[#00358E] border-[#00358E]"
                        : "bg-white border-gray-300"
                    }`}
                    onPress={() => toggleDay(day.id)}
                  >
                    <Text
                      className={`text-sm font-medium ${
                        isSelected ? "text-white" : "text-gray-700"
                      }`}
                    >
                      {day.shortName}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            {selectedDays.length > 0 && (
              <View className="mt-3 pt-3 border-t border-gray-100">
                <Text className="text-xs text-gray-500">
                  {selectedDays.length} day(s) selected •{" "}
                  {getTimeLabel(startTime)} - {getTimeLabel(endTime)}
                </Text>
              </View>
            )}
          </View>

          {/* Gender */}
          <Text className="text-base text-[#6B7280] mt-3 mb-1.5 font-medium">
            Therapist gender
          </Text>
          <TouchableOpacity
            className="bg-white p-3 rounded-xl mb-3 border border-[#E5E7EB]"
            onPress={() => setGenderModalOpen(true)}
          >
            <Text className="text-base text-gray-900">
              {preferredTherapistGender ?? "Select gender"}
            </Text>
          </TouchableOpacity>
        </ScrollView>

        <View className="p-5 bg-[#F5F5F5] lg:max-w-4xl lg:mx-auto lg:w-full">
          <PrimaryButton
            title="Next"
            disabled={!canProceed}
            onPress={() => {
              const payload: any = {
                preferredSpecializations: selectedSpecializations,
                // Keep single specialization for backwards compatibility
                preferredSpecialization: selectedSpecializations[0] || null,
                sessionBudget: Number(sessionBudget),
                preferredTherapistGender,
                // NEW: Send availability blocks
                availabilities: availabilities,
              };

              console.log("[Recommend][Step1] payload ->", payload);
              router.push({
                pathname: "./step2",
                params: { data: JSON.stringify(payload) },
              });
            }}
          />
        </View>
      </View>

      {/* Specialization modal - Multi-select */}
      <Modal
        visible={specializationOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setSpecializationOpen(false)}
      >
        <View className="flex-1 justify-center items-center bg-black/50 px-6">
          <View className="bg-white rounded-3xl p-6 w-full max-w-sm max-h-[80%]">
            <View className="flex-row items-center justify-between mb-4">
              <Text className="text-lg font-bold text-gray-900">
                Select specializations
              </Text>
              <TouchableOpacity
                className="w-8 h-8 items-center justify-center"
                onPress={() => setSpecializationOpen(false)}
              >
                <Text className="text-2xl text-gray-500">×</Text>
              </TouchableOpacity>
            </View>
            {selectedSpecializations.length > 0 && (
              <Text className="text-sm text-gray-500 mb-2">
                {selectedSpecializations.length} selected
              </Text>
            )}
            <FlatList
              data={SPECIALIZATIONS}
              keyExtractor={(i) => i.id}
              scrollEnabled
              renderItem={renderSpecializationItem}
            />
            <TouchableOpacity
              className="mt-4 bg-[#00358E] py-3 rounded-xl items-center"
              onPress={() => setSpecializationOpen(false)}
            >
              <Text className="text-white font-semibold text-base">Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Gender selection modal */}
      <Modal
        visible={genderModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setGenderModalOpen(false)}
      >
        <View className="flex-1 justify-center items-center bg-black/50 px-6">
          <View className="bg-white rounded-3xl p-6 w-full max-w-sm max-h-[80%]">
            <View className="flex-row items-center justify-between mb-4">
              <Text className="text-lg font-bold text-gray-900">
                Select gender
              </Text>
              <TouchableOpacity
                className="w-8 h-8 items-center justify-center"
                onPress={() => setGenderModalOpen(false)}
              >
                <Text className="text-2xl text-gray-500">×</Text>
              </TouchableOpacity>
            </View>
            <FlatList
              data={GENDERS}
              keyExtractor={(g) => g}
              scrollEnabled
              renderItem={renderGenderItem}
            />
          </View>
        </View>
      </Modal>

      {/* Time selection modal */}
      <Modal
        visible={timeModalOpen !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setTimeModalOpen(null)}
      >
        <View className="flex-1 justify-center items-center bg-black/50 px-6">
          <View className="bg-white rounded-3xl p-6 w-full max-w-sm max-h-[80%]">
            <View className="flex-row items-center justify-between mb-4">
              <Text className="text-lg font-bold text-gray-900">
                {timeModalOpen === "start"
                  ? "Select start time"
                  : "Select end time"}
              </Text>
              <TouchableOpacity
                className="w-8 h-8 items-center justify-center"
                onPress={() => setTimeModalOpen(null)}
              >
                <Text className="text-2xl text-gray-500">×</Text>
              </TouchableOpacity>
            </View>
            <FlatList
              data={filteredTimeOptions}
              keyExtractor={(t) => t.value}
              scrollEnabled
              renderItem={renderTimeItem}
            />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

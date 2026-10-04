import React from "react";
import { View, Text, TextInput, TouchableOpacity } from "react-native";
import {
  CancellationReason,
  PATIENT_CANCELLATION_REASONS,
  THERAPIST_CANCELLATION_REASONS,
} from "@/src/constants/cancellationReasons";

type Props = {
  /** Whether the current user is a therapist */
  isTherapist: boolean;
  /** Optional override list (e.g., decline reschedule reasons) */
  reasonsOverride?: CancellationReason[];
  /** Optional title shown above the chips */
  title?: React.ReactNode;
  /** Optional placeholder for the "Other" text input */
  otherPlaceholder?: string;
  /** Currently selected reason ID */
  selectedReasonId: string | null;
  /** Callback when a reason is selected */
  onSelectReason: (reasonId: string | null) => void;
  /** Custom text for "Other" reason */
  otherText: string;
  /** Callback when "Other" text changes */
  onOtherTextChange: (text: string) => void;
};

/**
 * A component that displays tappable chips for selecting a cancellation/reschedule reason.
 * Shows role-specific options based on whether the user is a therapist or patient.
 * When "Other" is selected, displays a text input for custom reason.
 */
export default function CancellationReasonSelector({
  isTherapist,
  reasonsOverride,
  title,
  otherPlaceholder,
  selectedReasonId,
  onSelectReason,
  otherText,
  onOtherTextChange,
}: Props) {
  const reasons: CancellationReason[] =
    reasonsOverride ??
    (isTherapist
      ? THERAPIST_CANCELLATION_REASONS
      : PATIENT_CANCELLATION_REASONS);

  const isOtherSelected = selectedReasonId === "other";

  return (
    <View className="mb-3">
      <Text className="text-sm font-semibold text-gray-700 mb-2">
        {title ? (
          <>
            {title} <Text className="text-red-500">*</Text>
          </>
        ) : (
          <>
            Reason for rescheduling <Text className="text-red-500">*</Text>
          </>
        )}
      </Text>

      <View className="flex-row flex-wrap gap-2 mb-2">
        {reasons.map((reason) => {
          const isSelected = selectedReasonId === reason.id;
          return (
            <TouchableOpacity
              key={reason.id}
              onPress={() => onSelectReason(isSelected ? null : reason.id)}
              activeOpacity={0.7}
              className={`px-3 py-2 rounded-lg border-2 ${
                isSelected
                  ? "bg-[#089769] border-[#089769]"
                  : "bg-gray-50 border-gray-200"
              }`}
            >
              <Text
                className={`text-sm font-medium ${
                  isSelected ? "text-white" : "text-gray-700"
                }`}
              >
                {reason.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {isOtherSelected && (
        <TextInput
          placeholder={otherPlaceholder ?? "Please specify your reason..."}
          placeholderTextColor="#9CA3AF"
          value={otherText}
          onChangeText={onOtherTextChange}
          multiline
          numberOfLines={3}
          style={{ minHeight: 80, textAlignVertical: "top" }}
          className="border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-gray-900 mt-2"
        />
      )}
    </View>
  );
}

/**
 * Helper to get the final reason text to submit.
 * Returns the label for predefined reasons, or the custom text for "Other".
 */
export function getFinalReasonText(
  selectedReasonId: string | null,
  otherText: string,
  isTherapist: boolean,
  reasonsOverride?: CancellationReason[]
): string | null {
  if (!selectedReasonId) return null;

  if (selectedReasonId === "other") {
    return otherText.trim() || null;
  }

  const reasons =
    reasonsOverride ??
    (isTherapist
      ? THERAPIST_CANCELLATION_REASONS
      : PATIENT_CANCELLATION_REASONS);

  const reason = reasons.find((r) => r.id === selectedReasonId);
  return reason?.label ?? null;
}

/**
 * Helper to validate if the selection is complete.
 * Returns true if a reason is selected, and if "Other", has text.
 */
export function isReasonValid(
  selectedReasonId: string | null,
  otherText: string
): boolean {
  if (!selectedReasonId) return false;
  if (selectedReasonId === "other" && !otherText.trim()) return false;
  return true;
}

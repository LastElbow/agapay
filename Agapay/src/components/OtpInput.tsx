import React, { useMemo, useRef, useEffect, useState } from "react";
import { Text, TextInput, TouchableOpacity, View, Animated } from "react-native";

type OtpInputProps = {
  value: string;
  onChange: (next: string) => void;
  length?: number;
  disabled?: boolean;
  onSubmitEditing?: () => void;
};

const CELL_BASE_STYLE =
  "w-12 h-14 rounded-xl border border-gray-200 bg-white items-center justify-center";

const OtpInput: React.FC<OtpInputProps> = ({
  value,
  onChange,
  length = 6,
  disabled = false,
  onSubmitEditing,
}) => {
  const hiddenInputRef = useRef<TextInput>(null);
  const cursorOpacity = useRef(new Animated.Value(1)).current;

  const normalized = useMemo(() => {
    const sanitized = value.replace(/\D/g, "").slice(0, length);
    if (sanitized !== value) onChange(sanitized);
    return sanitized.padEnd(length, " ");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, length]);

  // Blinking cursor animation
  useEffect(() => {
    if (disabled) return;

    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(cursorOpacity, {
          toValue: 0,
          duration: 500,
          useNativeDriver: true,
        }),
        Animated.timing(cursorOpacity, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
      ])
    );

    animation.start();

    return () => {
      animation.stop();
    };
  }, [disabled, cursorOpacity]);

  return (
    <View className="items-center">
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={() => hiddenInputRef.current?.focus()}
        disabled={disabled}
      >
        <View className="flex-row gap-3">
          {Array.from({ length }).map((_, index) => {
            const char = normalized[index] ?? " ";
            const isFilled = index < value.length;
            const isActive = index === Math.min(value.length, length - 1);
            const showCursor = isActive && !isFilled && !disabled;

            return (
              <View
                key={index}
                className={`${CELL_BASE_STYLE} ${isActive && !disabled ? "border-[#089769]" : ""
                  } ${disabled ? "bg-[#F9FAFB] border-[#E5E7EB]" : ""}`}
              >
                <Text
                  className={`text-xl font-semibold ${isFilled ? "text-[#111827]" : "text-[#9CA3AF]"
                    }`}
                >
                  {char.trim()}
                </Text>
                {/* Animated cursor indicator */}
                {showCursor && (
                  <Animated.View
                    style={{
                      position: 'absolute',
                      width: 2,
                      height: 20,
                      backgroundColor: '#089769',
                      opacity: cursorOpacity,
                    }}
                  />
                )}
              </View>
            );
          })}
        </View>
      </TouchableOpacity>
      <TextInput
        ref={hiddenInputRef}
        value={value}
        onChangeText={(text) => {
          const numeric = text.replace(/\D/g, "").slice(0, length);
          onChange(numeric);
        }}
        editable={!disabled}
        maxLength={length}
        inputMode="numeric"
        keyboardType="number-pad"
        onSubmitEditing={onSubmitEditing}
        style={{ position: "absolute", opacity: 0, width: 0, height: 0 }}
        returnKeyType="done"
        blurOnSubmit={false}
      />
    </View>
  );
};

export default OtpInput;

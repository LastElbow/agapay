import PrimaryButton from "@/src/components/PrimaryButton";
import { Ionicons, FontAwesome5 } from "@expo/vector-icons";
import { ArrowLeft, ChevronDown } from "lucide-react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useRouter, Link } from "expo-router";
import React, { useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import StepDots from "@/src/components/StepDots";
import {
  formatDate,
  validateSignupStep1,
} from "@/src/features/auth/core/signupStep1Validation";

export default function SignUpStep1() {
  const router = useRouter();

  const [firstName, setFirstName] = useState("");
  const isWeb = Platform.OS === "web";
  const [lastName, setLastName] = useState("");
  const [dobDate, setDobDate] = useState<Date | null>(null);
  const [gender, setGender] = useState<string | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [errorModal, setErrorModal] = useState<{
    visible: boolean;
    title: string;
    message: string;
  }>({ visible: false, title: "", message: "" });
  const { width } = useWindowDimensions();
  const isLargeWeb = isWeb && width >= 768; // center content on medium+ web screens

  const handleDateChange = (_event: any, selected?: Date) => {
    setShowPicker(Platform.OS === "ios");
    if (selected) setDobDate(selected);
  };

  const handleNext = () => {
    const result = validateSignupStep1({
      firstName,
      lastName,
      dobDate,
      gender,
    });

    if (!result.ok) {
      setErrorModal({
        visible: true,
        title: result.title,
        message: result.message,
      });
      return;
    }

    router.push({
      pathname: "/(auth)/signup-step2",
      params: result.params,
    });
  };

  return (
    <View className="flex-1 bg-physio-light relative">
      {/* Background Decorative Blobs */}
      <View className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none z-0">
        <View
          className="absolute top-0 left-1/4 w-96 h-96 bg-physio-accent rounded-full opacity-70"
          style={{ transform: [{ translateX: 30 }, { translateY: -50 }] }}
        />
        <View
          className="absolute top-0 right-1/4 w-96 h-96 bg-teal-100 rounded-full opacity-70"
          style={{ transform: [{ translateX: -20 }, { translateY: 20 }] }}
        />
        <View className="absolute -bottom-32 left-1/3 w-96 h-96 bg-green-100 rounded-full opacity-70" />
      </View>

      {/* Error Modal */}
      <Modal
        visible={errorModal.visible}
        transparent
        animationType="fade"
        onRequestClose={() =>
          setErrorModal({ visible: false, title: "", message: "" })
        }
      >
        <View className="flex-1 justify-center items-center bg-black/50 px-6">
          <View className="bg-white rounded-3xl p-6 w-full max-w-sm">
            <View className="items-center mb-4">
              <View className="w-14 h-14 rounded-full bg-red-100 items-center justify-center mb-3">
                <Ionicons name="alert-circle" size={32} color="#EF4444" />
              </View>
              <Text className="text-xl font-bold text-gray-900 text-center">
                {errorModal.title}
              </Text>
            </View>
            <Text className="text-base text-gray-600 text-center mb-6">
              {errorModal.message}
            </Text>
            <TouchableOpacity
              onPress={() =>
                setErrorModal({ visible: false, title: "", message: "" })
              }
              className="bg-physio-primary py-3.5 rounded-xl"
              activeOpacity={0.8}
            >
              <Text className="text-white text-center font-semibold text-base">
                OK
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Navigation Bar */}
      <View className="relative z-10 px-6 py-6 flex-row items-center justify-between">
        <TouchableOpacity
          onPress={() => router.back()}
          className="flex-row items-center gap-2 group"
        >
          <View className="bg-white/50 p-2 rounded-lg">
            <ArrowLeft size={20} color="#0e7468" />
          </View>
          <Text className="text-base font-semibold text-physio-dark">Back</Text>
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        className="flex-1 w-full"
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{
            flexGrow: 1,
            justifyContent: "center",
            paddingHorizontal: 24,
            paddingBottom: 48,
            ...(isLargeWeb ? { paddingVertical: 48 } : {}),
          }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View className="w-full max-w-md self-center">
            {/* Logo Center */}
            <View className="flex-row justify-center mb-8">
              <View className="flex-row items-center gap-2">
                <View
                  className="bg-physio-primary p-2 rounded-lg items-center justify-center"
                  style={{ width: 40, height: 40 }}
                >
                  <FontAwesome5
                    name="hand-holding-heart"
                    size={20}
                    color="white"
                  />
                </View>
                <Text className="text-2xl font-bold text-gray-800 tracking-tight">
                  Agapay
                </Text>
              </View>
            </View>

            {/* Card */}
            <View className="bg-white/80 p-8 rounded-3xl shadow-sm border border-white/50">
              <View className="items-center mb-8">
                <Text className="text-2xl font-bold text-gray-900">
                  Create Account
                </Text>
                <Text className="text-gray-500 text-base mt-2">
                  Let{"'"}s get started with your personal details
                </Text>
              </View>

              <View>
                {/* First Name */}
                <View>
                  <Text className="text-xs font-semibold text-gray-700 mb-3 uppercase tracking-wide">
                    First Name
                  </Text>
                  <TextInput
                    value={firstName}
                    onChangeText={setFirstName}
                    placeholder="Enter your first name"
                    className="w-full bg-white border border-gray-200 text-gray-900 text-base rounded-xl p-3.5"
                    placeholderTextColor="#9CA3AF"
                    autoCapitalize="words"
                  />
                </View>

                {/* Last Name */}
                <View className="mt-6">
                  <Text className="text-xs font-semibold text-gray-700 mb-3 uppercase tracking-wide">
                    Last Name
                  </Text>
                  <TextInput
                    value={lastName}
                    onChangeText={setLastName}
                    placeholder="Enter your last name"
                    className="w-full bg-white border border-gray-200 text-gray-900 text-base rounded-xl p-3.5"
                    placeholderTextColor="#9CA3AF"
                    autoCapitalize="words"
                  />
                </View>

                {/* Date of Birth Field */}
                <View className="mt-6">
                  <Text className="text-xs font-semibold text-gray-700 mb-3 uppercase tracking-wide">
                    Date of Birth
                  </Text>
                  {isWeb ? (
                    <input
                      type="date"
                      key={dobDate ? "has-date" : "no-date"}
                      defaultValue={dobDate ? formatDate(dobDate) : ""}
                      max={formatDate(new Date())}
                      onBlur={(e) => {
                        const value = e.target.value;
                        if (value) {
                          const parts = value.split("-");
                          if (parts.length === 3 && parts[0].length === 4) {
                            const [y, m, d] = parts.map(Number);
                            if (
                              y >= 1900 &&
                              y <= new Date().getFullYear() &&
                              m >= 1 &&
                              m <= 12 &&
                              d >= 1 &&
                              d <= 31
                            ) {
                              const newDate = new Date(y, m - 1, d);
                              if (!isNaN(newDate.getTime())) {
                                setDobDate(newDate);
                              }
                            }
                          }
                        } else {
                          setDobDate(null);
                        }
                      }}
                      onChange={(e) => {
                        // Also handle onChange for when user selects from calendar picker
                        const value = e.target.value;
                        if (value) {
                          const parts = value.split("-");
                          if (parts.length === 3 && parts[0].length === 4) {
                            const [y, m, d] = parts.map(Number);
                            if (
                              y >= 1900 &&
                              y <= new Date().getFullYear() &&
                              m >= 1 &&
                              m <= 12 &&
                              d >= 1 &&
                              d <= 31
                            ) {
                              const newDate = new Date(y, m - 1, d);
                              if (!isNaN(newDate.getTime())) {
                                setDobDate(newDate);
                              }
                            }
                          }
                        }
                      }}
                      style={
                        {
                          width: "100%",
                          backgroundColor: "#FFFFFF",
                          padding: 14,
                          paddingLeft: 14,
                          borderRadius: 12,
                          borderWidth: 1,
                          borderColor: "#E5E7EB",
                          fontSize: 16,
                          color: "#111827",
                          outline: "none",
                        } as any
                      }
                    />
                  ) : (
                    <>
                      <TouchableOpacity
                        onPress={() => setShowPicker(true)}
                        className="w-full bg-white border border-gray-200 rounded-xl p-3.5 flex-row items-center justify-between"
                      >
                        <Text
                          className={
                            dobDate
                              ? "text-gray-900 text-base"
                              : "text-gray-400 text-base"
                          }
                        >
                          {dobDate
                            ? formatDate(dobDate)
                            : "Select your date of birth"}
                        </Text>
                        <Ionicons
                          name="calendar-outline"
                          size={22}
                          color="#6B7280"
                        />
                      </TouchableOpacity>

                      {showPicker && (
                        <DateTimePicker
                          value={dobDate ?? new Date(1990, 0, 1)}
                          mode="date"
                          display={
                            Platform.OS === "ios" ? "spinner" : "calendar"
                          }
                          maximumDate={new Date()}
                          onChange={handleDateChange}
                        />
                      )}
                    </>
                  )}
                </View>

                {/* Gender Selection */}
                <View className="mt-6">
                  <Text className="text-xs font-semibold text-gray-700 mb-3 uppercase tracking-wide">
                    Gender
                  </Text>
                  {isWeb ? (
                    <View style={{ position: "relative", width: "100%" }}>
                      <select
                        value={gender ?? ""}
                        onChange={(e) => setGender(e.target.value || null)}
                        style={
                          {
                            width: "100%",
                            backgroundColor: "#FFFFFF",
                            padding: 14,
                            paddingLeft: 14,
                            paddingRight: 48,
                            borderRadius: 12,
                            borderWidth: 1,
                            borderColor: "#E5E7EB",
                            fontSize: 16,
                            color: "#111827",
                            outline: "none",
                            appearance: "none",
                            WebkitAppearance: "none",
                            MozAppearance: "none",
                          } as any
                        }
                      >
                        <option value="" disabled>
                          Select your gender
                        </option>
                        <option value="Female">Female</option>
                        <option value="Male">Male</option>
                      </select>
                      <View
                        style={{
                          position: "absolute",
                          right: 14,
                          top: "50%",
                          transform: "translateY(-50%)",
                          pointerEvents: "none",
                        }}
                      >
                        <ChevronDown size={20} color="#6B7280" />
                      </View>
                    </View>
                  ) : (
                    <View style={{ flexDirection: "row", gap: 12 }}>
                      {(["Female", "Male"] as const).map((g) => {
                        const selected = gender === g;
                        return (
                          <TouchableOpacity
                            key={g}
                            onPress={() => setGender(g)}
                            activeOpacity={0.8}
                            className={`py-3 px-6 rounded-xl border ${
                              selected
                                ? "bg-physio-accent border-physio-primary"
                                : "bg-white border-gray-200"
                            }`}
                          >
                            <Text
                              className={
                                selected
                                  ? "text-physio-primary font-semibold"
                                  : "text-gray-700"
                              }
                            >
                              {g}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  )}
                </View>
              </View>

              {/* Step Indicator & Continue Button */}
              <View className="mt-8" style={{ gap: 16 }}>
                <View className="items-center">
                  <StepDots currentStep={1} totalSteps={2} />
                </View>

                <TouchableOpacity
                  onPress={handleNext}
                  className="w-full py-3.5 px-4 bg-physio-primary rounded-xl shadow-sm items-center justify-center"
                  activeOpacity={0.8}
                >
                  <Text className="text-white font-bold text-base">
                    Continue
                  </Text>
                </TouchableOpacity>
              </View>

              <View className="mt-6 pt-6 border-t border-gray-100">
                <View className="flex-row justify-center">
                  <Text className="text-base text-gray-500">
                    Already have an account?{" "}
                  </Text>
                  <Link href="/(auth)/signin" asChild>
                    <TouchableOpacity>
                      <Text className="font-semibold text-physio-primary ml-1 text-base">
                        Sign In
                      </Text>
                    </TouchableOpacity>
                  </Link>
                </View>
              </View>
            </View>

            {/* Footer Links */}
            <View className="mt-8 flex-row justify-center gap-6">
              <TouchableOpacity>
                <Text className="text-xs text-gray-400 font-medium">
                  Privacy
                </Text>
              </TouchableOpacity>
              <Text className="text-gray-300">•</Text>
              <TouchableOpacity>
                <Text className="text-xs text-gray-400 font-medium">Terms</Text>
              </TouchableOpacity>
              <Text className="text-gray-300">•</Text>
              <TouchableOpacity>
                <Text className="text-xs text-gray-400 font-medium">Help</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

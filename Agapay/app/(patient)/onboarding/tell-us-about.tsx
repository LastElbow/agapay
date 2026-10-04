import { Feather, Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter, Redirect } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Picker } from "@react-native-picker/picker";
import { ArrowLeft, ChevronDown } from "lucide-react-native";
import StepDots from "@/src/components/StepDots";
import { formStore } from "@/src/stores/formStore";
import { useRole } from "@/src/providers/RoleProvider";
import { useAuth } from "@/src/providers/AuthProvider";
import apiClient from "@/api/client";
import {
  shouldSuppressStoreFallbackOnAddressPick,
  validatePatientTellUsAboutForm,
} from "@/src/features/onboarding/core/patientTellUsAbout";

export default function PatientTellUsAbout() {
  const { selectedRole, isBootstrapping: roleBootstrapping } = useRole();
  const { user: authUser } = useAuth();

  const isPatientComplete =
    (authUser as any)?.isPatientOnboardingComplete ??
    (authUser as any)?.IsPatientOnboardingComplete ??
    false;

  if (isPatientComplete) {
    return <Redirect href="/(patient)/(tabs)" />;
  }

  if (!roleBootstrapping && selectedRole === "PhysicalTherapist") {
    return <Redirect href="/(therapist)/(tabs)" />;
  }

  return <PatientTellUsAboutInner />;
}

function PatientTellUsAboutInner() {
  const router = useRouter();
  const { user: authUser, updateUser } = useAuth();

  // Self-healing: verify against backend if account has already completed onboarding
  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const res = await apiClient.get("/api/Onboarding/patient/status");
        if (isMounted && res.data?.isPatientOnboardingComplete) {
          if (authUser) {
            await updateUser({
              ...authUser,
              isPatientOnboardingComplete: true,
              IsPatientOnboardingComplete: true,
            });
          }
          router.replace("/(patient)/(tabs)" as any);
        }
      } catch (err) {
        console.debug("Patient onboarding status check:", err);
      }
    })();
    return () => {
      isMounted = false;
    };
  }, [authUser, updateUser, router]);

  const params = useLocalSearchParams();
  const { width } = useWindowDimensions();
  const isWeb = Platform.OS === "web";
  const isLargeWeb = isWeb && width >= 768;

  // Address (initialize and update from params)
  const [address, setAddress] = useState(
    (params.address as string) || formStore.getAddress(),
  );
  const [barangayId, setBarangayId] = useState<number | null>(
    params.barangayId ? Number(params.barangayId) : formStore.getBarangayId(),
  );
  const [barangayName, setBarangayName] = useState<string>(
    (params.barangayName as string) || formStore.getBarangayName() || "",
  );

  const [latitude, setLatitude] = useState(
    (params.latitude as string) || formStore.getLatitude(),
  );
  const [longitude, setLongitude] = useState(
    (params.longitude as string) || formStore.getLongitude(),
  );
  const [locationDisplayName, setLocationDisplayName] = useState(
    (params.locationDisplayName as string) ||
      formStore.getLocationDisplayName() ||
      address,
  );

  // Occupation and Activity Level state
  const [occupation, setOccupation] = useState("");
  const [activityLevel, setActivityLevel] = useState<
    "sedentary" | "light" | "moderate" | "very" | ""
  >("");

  const [activityModalVisible, setActivityModalVisible] = useState(false);

  const activityOptions: Array<{
    value: Exclude<typeof activityLevel, "">;
    label: string;
  }> = [
    { value: "sedentary", label: "Sedentary" },
    { value: "light", label: "Lightly Active" },
    { value: "moderate", label: "Moderately Active" },
    { value: "very", label: "Very Active" },
  ];

  const activityLabel =
    activityLevel === ""
      ? "Select activity level"
      : (activityOptions.find((o) => o.value === activityLevel)?.label ??
        "Select activity level");

  // Error modal state
  const [errorModal, setErrorModal] = useState<{
    visible: boolean;
    title: string;
    message: string;
  }>({ visible: false, title: "", message: "" });

  // Update state when params change (e.g., on return from address screen)
  useEffect(() => {
    const isReturningFromAddress = params.returnTo === "tell-us-about";

    if (params.address) {
      setAddress(params.address as string);
    } else if (isReturningFromAddress) {
      const addr = formStore.getAddress();
      if (addr) {
        setAddress(addr);
      } else {
        setAddress("");
      }
    }

    if (params.latitude) setLatitude(params.latitude as string);
    else if (isReturningFromAddress && formStore.getLatitude())
      setLatitude(formStore.getLatitude());

    if (params.longitude) setLongitude(params.longitude as string);
    else if (isReturningFromAddress && formStore.getLongitude())
      setLongitude(formStore.getLongitude());

    if (params.locationDisplayName)
      setLocationDisplayName(params.locationDisplayName as string);
    else if (isReturningFromAddress && formStore.getLocationDisplayName())
      setLocationDisplayName(formStore.getLocationDisplayName());

    if (params.barangayId) setBarangayId(Number(params.barangayId));
    else if (isReturningFromAddress && formStore.getBarangayId() !== null)
      setBarangayId(formStore.getBarangayId());

    if (params.barangayName) setBarangayName(params.barangayName as string);
    else if (isReturningFromAddress && formStore.getBarangayName())
      setBarangayName(formStore.getBarangayName());
  }, [
    params.address,
    params.latitude,
    params.longitude,
    params.locationDisplayName,
    params.barangayId,
    params.barangayName,
    params.returnTo,
  ]);

  const validation = validatePatientTellUsAboutForm({
    address,
    occupation,
    activityLevel,
  });
  const isValid = validation.ok;

  const handleContinue = () => {
    const out = validatePatientTellUsAboutForm({
      address,
      occupation,
      activityLevel,
    });

    if (!out.ok) {
      setErrorModal({
        visible: true,
        title: out.title,
        message: out.message,
      });
      return;
    }

    formStore.setAddress(address);
    formStore.setLatitude(latitude);
    formStore.setLongitude(longitude);
    formStore.setLocationDisplayName(locationDisplayName);

    router.push({
      pathname: "./concern",
      params: {
        ...params,
        barangayId: barangayId ?? undefined,
        barangayName: barangayName || undefined,
        address,
        latitude,
        longitude,
        locationDisplayName,
        recipientType: "myself",
        relationshipToUser: "Self",
        occupation: out.occupation,
        activityLevel: out.activityLevel,
      },
    });
  };

  const handleAddressPress = () => {
    const addr = address;
    const lat = latitude;
    const lng = longitude;
    const locName = locationDisplayName || addr;
    const bId = barangayId;
    const bName = barangayName;

    const suppressStoreFallback = shouldSuppressStoreFallbackOnAddressPick({
      address: addr,
      latitude: lat,
      longitude: lng,
      barangayId: bId,
      barangayName: bName,
      locationDisplayName: locName,
    });

    router.push({
      pathname: "./address",
      params: {
        ...params,
        address: addr,
        latitude: lat,
        longitude: lng,
        locationDisplayName: locName,
        relationshipToUser: "Self",
        recipientType: "myself",
        returnTo: "tell-us-about",
        barangayId: bId ?? undefined,
        barangayName: bName || undefined,
        suppressStoreFallback: suppressStoreFallback ? "1" : undefined,
      },
    });
  };

  const displayAddress = [address, barangayName].filter(Boolean).join(", ");

  return (
    <SafeAreaView className="flex-1 bg-physio-light relative" edges={[]}>
      {/* Background Decorative Blobs */}
      <View className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none z-0">
        <View
          className="absolute top-0 left-1/4 w-96 h-96 bg-physio-accent rounded-full opacity-40"
          style={{ transform: [{ translateX: 30 }, { translateY: -50 }] }}
        />
        <View
          className="absolute top-0 right-1/4 w-96 h-96 bg-teal-100 rounded-full opacity-40"
          style={{ transform: [{ translateX: -20 }, { translateY: 20 }] }}
        />
        <View className="absolute -bottom-32 left-1/3 w-96 h-96 bg-green-100 rounded-full opacity-40" />
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

      {/* Activity Level Modal (native) */}
      <Modal
        visible={activityModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setActivityModalVisible(false)}
      >
        <TouchableWithoutFeedback
          onPress={() => setActivityModalVisible(false)}
        >
          <View className="flex-1 bg-black/30 items-center justify-center px-6">
            <TouchableWithoutFeedback>
              <SafeAreaView
                edges={["top", "bottom"]}
                className="w-full max-w-md"
              >
                <View className="bg-white rounded-3xl px-6 pt-5 pb-4 border border-white/60">
                  <Text className="text-lg font-bold text-gray-900 mb-3">
                    Activity level
                  </Text>

                  <View style={{ gap: 10 }}>
                    {activityOptions.map((opt) => {
                      const selected = opt.value === activityLevel;
                      return (
                        <TouchableOpacity
                          key={opt.value}
                          onPress={() => {
                            setActivityLevel(opt.value);
                            setActivityModalVisible(false);
                          }}
                          activeOpacity={0.85}
                          className={`flex-row items-center justify-between px-4 py-4 rounded-2xl border ${
                            selected
                              ? "bg-physio-accent border-physio-primary"
                              : "bg-white border-gray-200"
                          }`}
                        >
                          <Text
                            className={`text-base font-semibold ${
                              selected ? "text-physio-dark" : "text-gray-900"
                            }`}
                          >
                            {opt.label}
                          </Text>
                          {selected ? (
                            <Ionicons
                              name="checkmark-circle"
                              size={22}
                              color="#089769"
                            />
                          ) : (
                            <View className="w-5 h-5 rounded-full border border-gray-300" />
                          )}
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  <TouchableOpacity
                    onPress={() => setActivityModalVisible(false)}
                    activeOpacity={0.85}
                    className="mt-4 w-full py-3.5 rounded-2xl items-center justify-center bg-gray-100"
                  >
                    <Text className="text-gray-700 font-semibold text-base">
                      Cancel
                    </Text>
                  </TouchableOpacity>
                </View>
              </SafeAreaView>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Navigation Bar */}
      <SafeAreaView
        edges={["top"]}
        className="relative z-20 px-6 py-3 flex-row items-center justify-between bg-physio-light/90 border-b border-white/60"
      >
        <TouchableOpacity
          onPress={() => router.back()}
          className="flex-row items-center gap-2 group"
        >
          <View className="bg-white/50 p-2 rounded-lg">
            <ArrowLeft size={20} color="#0e7468" />
          </View>
          <Text className="text-base font-semibold text-physio-dark">Back</Text>
        </TouchableOpacity>
      </SafeAreaView>

      <TouchableWithoutFeedback onPress={() => Keyboard.dismiss()}>
        <KeyboardAvoidingView
          className="flex-1 w-full"
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{
              flexGrow: 1,
              justifyContent: isLargeWeb ? "center" : "flex-start",
              paddingHorizontal: 24,
              paddingBottom: 200,
              paddingTop: isLargeWeb ? 0 : 20,
              ...(isLargeWeb ? { paddingVertical: 48 } : {}),
            }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <View className="w-full max-w-md self-center relative z-10">
              <View className="flex-row items-start gap-3 mb-6">
                <View className="w-11 h-11 rounded-2xl bg-physio-accent items-center justify-center">
                  <Feather name="user" size={20} color="#0e7468" />
                </View>
                <View className="flex-1">
                  <Text className="text-2xl font-bold text-gray-900">
                    Complete Your Profile
                  </Text>
                  <Text className="text-gray-500 text-base mt-1">
                    This information helps us match you with a suitable
                    therapist.
                  </Text>
                </View>
              </View>

              <View style={{ gap: 20 }}>
                {/* Address Field */}
                <View>
                  <Text className="text-sm font-semibold text-physio-text mb-2">
                    Address
                  </Text>
                  <TouchableOpacity
                    onPress={handleAddressPress}
                    activeOpacity={0.7}
                    className="flex-row items-center bg-white border border-gray-200 rounded-2xl px-4 py-3.5"
                  >
                    <View className="w-9 h-9 bg-physio-accent rounded-xl items-center justify-center mr-3">
                      <Feather name="map-pin" size={18} color="#089769" />
                    </View>
                    <View className="flex-1">
                      <Text
                        className={`text-base ${
                          displayAddress ? "text-gray-900" : "text-gray-400"
                        }`}
                        numberOfLines={1}
                      >
                        {displayAddress || "Add your address"}
                      </Text>
                    </View>
                    <Feather name="chevron-right" size={20} color="#089769" />
                  </TouchableOpacity>
                </View>

                {/* Occupation Field */}
                <View>
                  <Text className="text-sm font-semibold text-physio-text mb-2">
                    Occupation
                  </Text>
                  <View className="flex-row items-center bg-white border border-gray-200 rounded-2xl px-4 py-3.5">
                    <View className="w-9 h-9 bg-physio-accent rounded-xl items-center justify-center mr-3">
                      <Feather name="briefcase" size={18} color="#089769" />
                    </View>
                    {isWeb ? (
                      <input
                        type="text"
                        value={occupation}
                        onChange={(e) => setOccupation(e.target.value)}
                        placeholder="Engineer, Doctor, Teacher, etc."
                        style={
                          {
                            width: "100%",
                            flex: 1,
                            backgroundColor: "transparent",
                            border: "none",
                            fontSize: 16,
                            color: "#111827",
                            outline: "none",
                            boxSizing: "border-box",
                          } as any
                        }
                      />
                    ) : (
                      <TextInput
                        value={occupation}
                        onChangeText={setOccupation}
                        placeholder="Engineer, Doctor, Teacher, etc."
                        placeholderTextColor="#9CA3AF"
                        className="flex-1 text-gray-900 text-base"
                        autoCapitalize="words"
                      />
                    )}
                  </View>
                </View>

                {/* Activity Level Field */}
                <View>
                  <Text className="text-sm font-semibold text-physio-text mb-2">
                    Activity Level
                  </Text>
                  {isWeb ? (
                    <View
                      className="flex-row items-center bg-white border border-gray-200 rounded-2xl px-4 py-3.5"
                      style={{ position: "relative" }}
                    >
                      <View className="w-9 h-9 bg-physio-accent rounded-xl items-center justify-center mr-3">
                        <Feather name="activity" size={18} color="#089769" />
                      </View>
                      <select
                        value={activityLevel}
                        onChange={(e) =>
                          setActivityLevel(
                            e.target.value as typeof activityLevel,
                          )
                        }
                        style={
                          {
                            width: "100%",
                            flex: 1,
                            backgroundColor: "transparent",
                            border: "none",
                            fontSize: 16,
                            color: "#111827",
                            outline: "none",
                            appearance: "none",
                            WebkitAppearance: "none",
                            MozAppearance: "none",
                            paddingRight: 32,
                          } as any
                        }
                      >
                        <option value="" disabled>
                          Select activity level
                        </option>
                        <option value="sedentary">Sedentary</option>
                        <option value="light">Lightly Active</option>
                        <option value="moderate">Moderately Active</option>
                        <option value="very">Very Active</option>
                      </select>
                      <View
                        style={
                          {
                            position: "absolute",
                            right: 16,
                            top: "50%",
                            transform: "translateY(-50%)",
                            pointerEvents: "none",
                          } as any
                        }
                      >
                        <ChevronDown size={20} color="#6B7280" />
                      </View>
                    </View>
                  ) : (
                    <TouchableOpacity
                      activeOpacity={0.85}
                      onPress={() => setActivityModalVisible(true)}
                      className="flex-row items-center bg-white border border-gray-200 rounded-2xl px-4 py-3.5"
                    >
                      <View className="w-9 h-9 bg-physio-accent rounded-xl items-center justify-center mr-3">
                        <Feather name="activity" size={18} color="#089769" />
                      </View>
                      <Text
                        className={`flex-1 text-base ${
                          activityLevel ? "text-gray-900" : "text-gray-400"
                        }`}
                        numberOfLines={1}
                      >
                        {activityLabel}
                      </Text>
                      <ChevronDown size={20} color="#6B7280" />
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            </View>
          </ScrollView>

          {/* Bottom Bar */}
          <SafeAreaView
            edges={["bottom"]}
            className="relative z-20 px-6 pt-4 pb-4 bg-physio-light/90 border-t border-white/60"
          >
            <View className="w-full max-w-md self-center" style={{ gap: 12 }}>
              <View className="items-center">
                <StepDots currentStep={1} totalSteps={2} />
              </View>
              <TouchableOpacity
                onPress={handleContinue}
                disabled={!isValid}
                className={`w-full py-4 px-4 rounded-2xl shadow-sm items-center justify-center ${
                  isValid ? "bg-physio-primary" : "bg-gray-300"
                }`}
                activeOpacity={0.8}
              >
                <Text className="text-white font-bold text-base">Continue</Text>
              </TouchableOpacity>
            </View>
          </SafeAreaView>
        </KeyboardAvoidingView>
      </TouchableWithoutFeedback>
    </SafeAreaView>
  );
}

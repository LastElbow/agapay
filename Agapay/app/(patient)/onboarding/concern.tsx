import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { ArrowLeft } from "lucide-react-native";
import StepDots from "@/src/components/StepDots";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
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
import { useAuth } from "@/src/providers/AuthProvider";
import apiClient from "@/api/client";
import { buildPatientOnboardingPayloadForMyself } from "@/src/features/onboarding/core/patientPayload";
import { formStore } from "@/src/stores/formStore";

export default function PatientConcern() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { user: authUser, updateUser } = useAuth();
  const { width } = useWindowDimensions();
  const isWeb = Platform.OS === "web";
  const isLargeWeb = isWeb && width >= 768;

  const [currentComplaints, setCurrentComplaints] = useState("");
  const [loading, setLoading] = useState(false);
  const [successModal, setSuccessModal] = useState(false);
  const [errorModal, setErrorModal] = useState<{
    visible: boolean;
    title: string;
    message: string;
  }>({ visible: false, title: "", message: "" });

  const complaintsRef = useRef<TextInput>(null);

  // hydrate from incoming params if returning from another screen
  useEffect(() => {
    if (params.currentComplaints && !currentComplaints) {
      setCurrentComplaints(String(params.currentComplaints));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const recipientType = params.recipientType === "myself" ? "myself" : "other";
  const isMyself = recipientType === "myself";

  const prepareFullPayload = () =>
    buildPatientOnboardingPayloadForMyself({
      authUser,
      params: {
        address: (params.address as string) || null,
        latitude: (params.latitude as string) || null,
        longitude: (params.longitude as string) || null,
        locationDisplayName: (params.locationDisplayName as string) || null,
        occupation: (params.occupation as string) || null,
        activityLevel: (params.activityLevel as string) || null,
      },
      currentComplaints,
    });

  const handleSubmit = async () => {
    const payload = prepareFullPayload();
    console.log("Final payload before submit:", payload);
    setLoading(true);
    try {
      const res = await apiClient.post("/api/Onboarding/patient", payload);
      console.log("Server response:", res.data);

      if (authUser) {
        await updateUser({
          ...authUser,
          isPatientOnboardingComplete: true,
          IsPatientOnboardingComplete: true,
        });
      }
      formStore.resetAll();
      setSuccessModal(true);
    } catch (err: any) {
      console.error(
        "Submit error:",
        err?.response?.status,
        err?.response?.data ?? err?.message ?? err,
      );

      // If onboarding was already completed on the backend (409 Conflict), sync local auth state and proceed
      if (err?.response?.status === 409) {
        if (authUser) {
          await updateUser({
            ...authUser,
            isPatientOnboardingComplete: true,
            IsPatientOnboardingComplete: true,
          });
        }
        formStore.resetAll();
        setSuccessModal(true);
        return;
      }

      setErrorModal({
        visible: true,
        title: "Error",
        message:
          err?.response?.status === 401
            ? "Your session expired. Please sign in again."
            : "Unable to complete onboarding. Please try again.",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSuccessClose = () => {
    setSuccessModal(false);
    router.replace({ pathname: "/(patient)/(tabs)" } as any);
  };

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

      {/* Success Modal */}
      <Modal
        visible={successModal}
        transparent
        animationType="fade"
        onRequestClose={handleSuccessClose}
      >
        <View className="flex-1 justify-center items-center bg-black/50 px-6">
          <View className="bg-white rounded-3xl p-6 w-full max-w-sm">
            <View className="items-center mb-4">
              <View className="w-14 h-14 rounded-full bg-green-100 items-center justify-center mb-3">
                <Ionicons name="checkmark-circle" size={32} color="#089769" />
              </View>
              <Text className="text-xl font-bold text-gray-900 text-center">
                Success!
              </Text>
            </View>
            <Text className="text-base text-gray-600 text-center mb-6">
              Onboarding completed successfully!
            </Text>
            <TouchableOpacity
              onPress={handleSuccessClose}
              className="bg-physio-primary py-3.5 rounded-xl"
              activeOpacity={0.8}
            >
              <Text className="text-white text-center font-semibold text-base">
                Continue
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

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
                  <Ionicons
                    name="chatbubble-ellipses"
                    size={20}
                    color="#0e7468"
                  />
                </View>
                <View className="flex-1">
                  <Text className="text-2xl font-bold text-gray-900">
                    {isMyself
                      ? "Tell us about you"
                      : "Tell us about the patient"}
                  </Text>
                  <Text className="text-gray-500 text-base mt-1">
                    {isMyself
                      ? "Describe your physical symptoms or concerns"
                      : "Describe the patient's physical symptoms or concerns"}
                  </Text>
                </View>
              </View>

              <View style={{ gap: 20 }}>
                {/* Concern Text Area */}
                <View>
                  <Text className="text-sm font-semibold text-physio-text mb-2">
                    Describe your concern
                  </Text>
                  <TouchableOpacity
                    activeOpacity={1}
                    onPress={() => complaintsRef.current?.focus()}
                    className="bg-white border border-gray-200 rounded-2xl px-4 py-3.5"
                    style={{ minHeight: 150 }}
                  >
                    <TextInput
                      ref={complaintsRef}
                      value={currentComplaints}
                      onChangeText={setCurrentComplaints}
                      placeholder="Example: I have pain in my lower back when sitting for long periods"
                      placeholderTextColor="#9CA3AF"
                      className="text-gray-900 text-base"
                      style={{ textAlignVertical: "top", minHeight: 130 }}
                      multiline
                    />
                  </TouchableOpacity>
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
                <StepDots currentStep={2} totalSteps={2} />
              </View>
              <TouchableOpacity
                onPress={handleSubmit}
                disabled={loading}
                className="w-full py-4 px-4 bg-physio-primary rounded-2xl shadow-sm items-center justify-center"
                style={{ opacity: loading ? 0.7 : 1 }}
                activeOpacity={0.8}
              >
                {loading ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <Text className="text-white font-bold text-base">
                    Finish Onboarding
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </SafeAreaView>
        </KeyboardAvoidingView>
      </TouchableWithoutFeedback>
    </SafeAreaView>
  );
}

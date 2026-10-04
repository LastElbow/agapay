import OtpInput from "@/src/components/OtpInput";
import apiClient, {
  AuthResponse,
  OtpChallengeResponse,
  requestOtp,
  verifyOtp,
} from "@/api/client";
import { useAuth } from "@/src/providers/AuthProvider";
import { useRole } from "@/src/providers/RoleProvider";
import { navigateAfterAuth } from "@/src/utils/authNavigation";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useMemo, useState, useCallback } from "react";
import {
  BackHandler,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  View,
  Switch,
  TouchableOpacity,
  Modal,
  useWindowDimensions,
  ActivityIndicator,
} from "react-native";
import { getDeviceFingerprint } from "@/src/utils/deviceFingerprint";
import { ArrowLeft } from "lucide-react-native";
import { Ionicons, FontAwesome5 } from "@expo/vector-icons";
import {
  canResendOtp,
  getParam,
  parsePurpose,
  parseRoleHint,
  resendOtpCode,
  verifyOtpCode,
} from "@/src/features/auth/core/otpFlow";
import {
  completeSignup,
  requestSignupOtp,
} from "@/src/features/auth/core/authFlows";
import {
  clearSignupDraft,
  getSignupDraft,
} from "@/src/features/auth/core/signupDraftStore";

const useCountdown = (expiresAtUtc?: string) => {
  const [expiry, setExpiry] = useState<Date | null>(
    expiresAtUtc ? new Date(expiresAtUtc) : null,
  );
  const [remaining, setRemaining] = useState<number>(0);

  useEffect(() => {
    if (!expiry) {
      setRemaining(0);
      return;
    }

    const tick = () => {
      const diff = Math.max(
        0,
        Math.floor((expiry.getTime() - Date.now()) / 1000),
      );
      setRemaining(diff);
      if (diff <= 0) {
        setExpiry(null);
      }
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [expiry]);

  return {
    remainingSeconds: remaining,
    setExpiry: (next?: string) => setExpiry(next ? new Date(next) : null),
  };
};

type Params = {
  email?: string | string[];
  purpose?: string | string[];
  role?: string | string[];
  message?: string | string[];
  expiresAt?: string | string[];
  origin?: string | string[];
};

const VerifyOtpScreen: React.FC = () => {
  const router = useRouter();
  const params = useLocalSearchParams<Params>();
  const { setSession } = useAuth();
  const { setSelectedRole } = useRole();
  const { width } = useWindowDimensions();
  const isWeb = Platform.OS === "web";
  const isLargeWeb = isWeb && width >= 768;

  const email = useMemo(
    () => getParam(params.email)?.trim() ?? "",
    [params.email],
  );
  const purpose = useMemo(
    () => parsePurpose(getParam(params.purpose)),
    [params.purpose],
  );
  const roleHint = useMemo(
    () => parseRoleHint(getParam(params.role)),
    [params.role],
  );
  const initialMessage = useMemo(
    () => getParam(params.message) ?? "",
    [params.message],
  );
  const origin = useMemo(
    () => getParam(params.origin) ?? "signin",
    [params.origin],
  );
  const countdown = useCountdown(getParam(params.expiresAt));

  const [fingerprint, setFingerprint] = useState<{
    deviceId: string;
    deviceName: string;
  } | null>(null);
  const allowRememberDevice = purpose !== "PasswordReset";
  const [rememberDevice, setRememberDevice] =
    useState<boolean>(allowRememberDevice);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState(initialMessage);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [errorModal, setErrorModal] = useState<{
    visible: boolean;
    title: string;
    message: string;
  }>({ visible: false, title: "", message: "" });

  const showErrorModal = useCallback((title: string, message: string) => {
    setErrorModal({ visible: true, title, message });
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const fp = await getDeviceFingerprint();
        if (!cancelled) {
          setFingerprint(fp);
        }
      } catch (err) {
        console.warn("Failed to resolve device fingerprint", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!allowRememberDevice && rememberDevice) {
      setRememberDevice(false);
    }
  }, [allowRememberDevice, rememberDevice]);

  useEffect(() => {
    setInfoMessage(initialMessage);
  }, [initialMessage]);

  const canResend = useMemo(
    () =>
      canResendOtp({
        isResending,
        remainingSeconds: countdown.remainingSeconds,
        email,
      }),
    [isResending, countdown.remainingSeconds, email],
  );

  const handleAuthSuccess = async (response: AuthResponse) => {
    const { accessToken, refreshToken, user } = response ?? {};
    if (!accessToken) {
      throw new Error(
        "Verification succeeded but no access token was returned.",
      );
    }

    await setSession({
      accessToken,
      refreshToken: refreshToken ?? null,
      user: user ?? null,
    });

    // Only set role if we have a valid hint; otherwise let RoleProvider/AuthGate derive it.
    if (roleHint === "Patient" || roleHint === "PhysicalTherapist") {
      setSelectedRole(roleHint);
    }

    // Let AuthGate drive final redirects (patient onboarding vs tabs).
    // navigateAfterAuth is still responsible for therapist-specific routing.
    await navigateAfterAuth({
      router,
      role: roleHint ?? null,
      user,
    });
  };

  const handleBack = useCallback(() => {
    if (origin === "signup") {
      clearSignupDraft();
      router.replace("/(auth)/signin");
      return;
    }
    router.back();
  }, [origin, router]);

  useEffect(() => {
    if (origin !== "signup") return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      handleBack();
      return true;
    });
    return () => sub.remove();
  }, [origin, handleBack]);

  const handleVerify = async () => {
    if (!email) {
      showErrorModal(
        "Missing Information",
        "Missing email context for verification. Please start over.",
      );
      return;
    }
    if (code.length < 4) {
      showErrorModal(
        "Invalid Code",
        "Please enter the full verification code.",
      );
      return;
    }

    setIsVerifying(true);
    setError(null);
    try {
      let activeFingerprint = fingerprint;
      if (!activeFingerprint) {
        try {
          activeFingerprint = await getDeviceFingerprint();
          setFingerprint(activeFingerprint);
        } catch (fpError) {
          console.warn("Failed to resolve device fingerprint", fpError);
        }
      }

      if (origin === "signup") {
        const draft = getSignupDraft(email);
        if (!draft) {
          showErrorModal(
            "Missing Information",
            "Sign up details were lost. Please start sign up again.",
          );
          router.replace("/(auth)/signup-step2");
          return;
        }

        const response = await completeSignup({
          post: apiClient.post.bind(apiClient),
          payload: {
            email: draft.email,
            code,
            role: draft.role,
            firstName: draft.firstName,
            lastName: draft.lastName,
            password: draft.password,
            dateOfBirth: draft.dateOfBirth,
            gender: draft.gender ?? null,
            licenseNumber: draft.licenseNumber ?? null,
            workPhoneNumber: draft.workPhoneNumber ?? null,
          },
        });

        clearSignupDraft();
        await handleAuthSuccess(response);
      } else {
        const response = await verifyOtpCode({
          verifyOtpFn: verifyOtp,
          email,
          code,
          purpose,
          fingerprint: activeFingerprint,
          rememberDevice,
        });
        await handleAuthSuccess(response);
      }
    } catch (err: any) {
      console.error("OTP verification failed", err?.response ?? err);
      const message =
        err?.response?.data?.message ??
        err?.response?.data?.error ??
        err?.response?.data?.title ??
        "The verification code was invalid or expired. Please try again.";
      setError(message);
    } finally {
      setIsVerifying(false);
    }
  };

  const handleResend = async () => {
    if (!email) return;
    setIsResending(true);
    setError(null);
    try {
      let activeFingerprint = fingerprint;
      if (!activeFingerprint) {
        try {
          activeFingerprint = await getDeviceFingerprint();
          setFingerprint(activeFingerprint);
        } catch (fpError) {
          console.warn("Failed to resolve device fingerprint", fpError);
        }
      }

      const challenge: OtpChallengeResponse =
        origin === "signup"
          ? await requestSignupOtp({
              post: apiClient.post.bind(apiClient),
              email,
            })
          : await resendOtpCode({
              requestOtpFn: requestOtp,
              email,
              purpose,
              fingerprint: activeFingerprint,
            });
      setInfoMessage(challenge.message ?? "A new code has been sent.");
      countdown.setExpiry(challenge.expiresAtUtc);
    } catch (err: any) {
      console.error("Failed to resend OTP", err?.response ?? err);
      const message =
        err?.response?.data?.message ??
        "Unable to resend the verification code right now. Please try again shortly.";
      setError(message);
    } finally {
      setIsResending(false);
    }
  };

  const resendLabel =
    countdown.remainingSeconds > 0
      ? `Resend in ${countdown.remainingSeconds}s`
      : "Resend Code";

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
          onPress={handleBack}
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
                <View className="w-16 h-16 rounded-full bg-physio-accent items-center justify-center mb-4">
                  <Ionicons name="shield-checkmark" size={32} color="#089769" />
                </View>
                <Text className="text-2xl font-bold text-gray-900">
                  Verify Your Account
                </Text>
                <Text className="text-gray-500 text-base mt-2 text-center">
                  {infoMessage
                    ? infoMessage
                    : `Enter the code we sent to ${email}`}
                </Text>
                {origin === "signin" && (
                  <Text className="text-sm text-gray-400 mt-2 text-center">
                    Your account is protected with a one-time verification code.
                  </Text>
                )}
              </View>

              <View className="space-y-5">
                {/* OTP Input */}
                <View className="items-center py-4">
                  <OtpInput
                    value={code}
                    onChange={setCode}
                    disabled={isVerifying}
                    onSubmitEditing={handleVerify}
                  />
                </View>

                {error && (
                  <View className="bg-red-50 rounded-xl p-3">
                    <Text className="text-sm text-red-600 text-center">
                      {error}
                    </Text>
                  </View>
                )}

                {/* Remember Device Toggle */}
                {allowRememberDevice && (
                  <View className="flex-row items-center justify-between bg-[#F9FAFB] rounded-2xl px-4 py-3">
                    <View className="flex-1 pr-4">
                      <Text className="text-sm font-semibold text-gray-700">
                        Remember this device
                      </Text>
                      <Text className="text-xs text-gray-500 mt-1 leading-relaxed">
                        Skip verification on this device.
                      </Text>
                    </View>
                    <Switch
                      value={rememberDevice}
                      onValueChange={setRememberDevice}
                      disabled={!fingerprint}
                      thumbColor={
                        Platform.OS === "android"
                          ? rememberDevice
                            ? "#089769"
                            : "#f4f4f5"
                          : undefined
                      }
                      trackColor={{ true: "#ccfbf1", false: "#D1D5DB" }}
                      ios_backgroundColor="#D1D5DB"
                    />
                  </View>
                )}

                {/* Verify Button */}
                <TouchableOpacity
                  onPress={handleVerify}
                  disabled={isVerifying}
                  className="w-full py-3.5 px-4 bg-physio-primary rounded-xl shadow-sm items-center justify-center"
                  style={{ opacity: isVerifying ? 0.7 : 1 }}
                  activeOpacity={0.8}
                >
                  {isVerifying ? (
                    <ActivityIndicator color="white" />
                  ) : (
                    <Text className="text-white font-bold text-base">
                      Verify Code
                    </Text>
                  )}
                </TouchableOpacity>

                {/* Resend Button */}
                <TouchableOpacity
                  onPress={handleResend}
                  disabled={!canResend}
                  className={`w-full py-3.5 px-4 rounded-xl border items-center justify-center ${
                    canResend
                      ? "bg-white border-physio-primary"
                      : "bg-gray-50 border-gray-200"
                  }`}
                  activeOpacity={0.8}
                >
                  {isResending ? (
                    <ActivityIndicator color="#089769" />
                  ) : (
                    <Text
                      className={`font-semibold text-base ${
                        canResend ? "text-physio-primary" : "text-gray-400"
                      }`}
                    >
                      {resendLabel}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>

              <View className="mt-8 pt-6 border-t border-gray-100">
                <View className="items-center">
                  <Text className="text-sm text-gray-400">
                    Need help? Contact{" "}
                    <Text className="text-physio-primary font-medium">
                      support@agapay.ph
                    </Text>
                  </Text>
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
};

export default VerifyOtpScreen;

import { useAuth } from "@/src/providers/AuthProvider";
import { useRole } from "@/src/providers/RoleProvider";
import {
  deleteItem as ssDelete,
  getItem as ssGet,
  setItem as ssSet,
} from "@/src/utils/safeSecureStore";
import { getDeviceFingerprint } from "@/src/utils/deviceFingerprint";
import { Link, useRouter } from "expo-router";
import { ArrowLeft, Eye, EyeOff } from "lucide-react-native";
import { Ionicons, FontAwesome5 } from "@expo/vector-icons";
import React, { useCallback, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
  TextInput,
  ActivityIndicator,
} from "react-native";
import apiClient, {
  AuthResponse,
  OtpChallengeResponse,
} from "@/api/client";
import { navigateAfterAuth } from "@/src/utils/authNavigation";
import { signInWithRoleFallback } from "@/src/features/auth/core/authFlows";
import { validateSignInForm } from "@/src/features/auth/core/signInValidation";
import { getUserFacingSignInError } from "@/src/features/auth/core/userFacingAuthErrors";

export default function SignIn() {
  const router = useRouter();
  const { setSession } = useAuth();
  const { selectedRole, setSelectedRole } = useRole();
  const { width } = useWindowDimensions();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [errorModal, setErrorModal] = useState<{
    visible: boolean;
    title: string;
    message: string;
  }>({ visible: false, title: "", message: "" });
  const isWeb = Platform.OS === "web";
  const isLargeWeb = isWeb && width >= 768;

  // Load remembered email and rememberMe preference
  React.useEffect(() => {
    (async () => {
      try {
        const storedRemember = await ssGet("rememberMe");
        const storedEmail = await ssGet("rememberedEmail");
        if (storedRemember === "true") {
          setRememberMe(true);
          if (storedEmail) setEmail(storedEmail);
        }
      } catch (e) {
        console.warn("Failed to load remember-me from SecureStore", e);
      }
    })();
  }, []);

  const showErrorModal = useCallback((title: string, message: string) => {
    setErrorModal({ visible: true, title, message });
  }, []);

  const handleSignIn = async () => {
    const validation = validateSignInForm({ email, password });
    if (!validation.ok) {
      showErrorModal(validation.title, validation.message);
      return;
    }

    setIsLoading(true);
    setFormError(null);

    let fingerprint: { deviceId: string; deviceName: string } | null = null;
    try {
      fingerprint = await getDeviceFingerprint();
    } catch (fingerprintError) {
      console.warn("Failed to resolve device fingerprint", fingerprintError);
    }

    let resolvedRole: "Patient" | "PhysicalTherapist" | null = null;
    let directAuthResponse: AuthResponse | null = null;
    let otpChallenge: OtpChallengeResponse | null = null;
    let lastError: any = null;

    try {
      console.log("Login attempt:", {
        email,
        password: "***",
        selectedRole,
      });
      console.log("API Base URL:", apiClient.defaults.baseURL);

      const attempt = await signInWithRoleFallback({
        post: apiClient.post.bind(apiClient),
        email: validation.email,
        password: validation.password,
        selectedRole: selectedRole ?? null,
        fingerprint,
      });

      if (attempt.kind === "direct") {
        directAuthResponse = attempt.response;
        resolvedRole = attempt.role;
      } else if (attempt.kind === "otp") {
        otpChallenge = attempt.challenge;
        resolvedRole = attempt.role;
      } else {
        lastError = attempt.error;
      }

      if (!directAuthResponse && !otpChallenge) {
        const ui = getUserFacingSignInError(lastError);
        showErrorModal(ui.title, ui.message);
        return;
      }

      if (!resolvedRole) {
        showErrorModal(
          "Login Failed",
          "Unable to determine the correct role for this account.",
        );
        return;
      }

      if (directAuthResponse?.accessToken) {
        const { accessToken, refreshToken, user } = directAuthResponse;
        // persist remember-me preference and email BEFORE setting session so providers can respect it
        try {
          if (rememberMe) {
            await ssSet("rememberedEmail", validation.email, {
              scope: "local",
            });
            await ssSet("rememberMe", "true", { scope: "local" });
          } else {
            await ssDelete("rememberedEmail");
            await ssSet("rememberMe", "false", { scope: "local" });
          }
        } catch (e) {
          console.warn("Failed to persist rememberedEmail", e);
        }

        setSelectedRole(resolvedRole);
        await setSession({
          accessToken,
          refreshToken: refreshToken ?? null,
          user: user ?? null,
        });

        console.log("Login successful for:", user?.email ?? "(no email)");

        await navigateAfterAuth({
          router,
          role: resolvedRole,
          user,
        });
        if (resolvedRole === "Patient") {
          return;
        }
      } else if (otpChallenge?.requiresOtp) {
        try {
          if (rememberMe) {
            await ssSet("rememberedEmail", email.trim(), { scope: "local" });
            await ssSet("rememberMe", "true", { scope: "local" });
          } else {
            await ssDelete("rememberedEmail");
            await ssSet("rememberMe", "false", { scope: "local" });
          }
        } catch (persistError) {
          console.warn("Failed to persist rememberedEmail", persistError);
        }

        setSelectedRole(resolvedRole);

        router.push({
          pathname: "/(auth)/verify-otp",
          params: {
            email: otpChallenge.email ?? validation.email,
            purpose: otpChallenge.purpose ?? "TwoFactorLogin",
            role: resolvedRole ?? "",
            message:
              otpChallenge.message ??
              "Enter the verification code we sent to your email.",
            expiresAt: otpChallenge.expiresAtUtc ?? "",
            origin: "signin",
          },
        });
        return;
      } else {
        showErrorModal(
          "Login Failed",
          "Invalid email or password. Please try again.",
        );
      }
    } catch (err: any) {
      console.error("Login error:", err);
      console.error("Error response:", err?.response);
      console.error("Error status:", err?.response?.status);
      console.error("Error data:", err?.response?.data);

      const ui = getUserFacingSignInError(err);
      showErrorModal(ui.title, ui.message);
    } finally {
      setIsLoading(false);
    }
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
      {Platform.OS === "web" && (
        <View className="relative z-10 px-6 py-6 flex-row items-center justify-between">
          <TouchableOpacity
            onPress={() => router.replace("/")}
            className="flex-row items-center gap-2 group"
          >
            <View className="bg-white/50 p-2 rounded-lg">
              <ArrowLeft size={20} color="#0e7468" />
            </View>
            <Text className="text-base font-semibold text-physio-dark">
              Back to Home
            </Text>
          </TouchableOpacity>
        </View>
      )}

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
                  Welcome Back
                </Text>
                <Text className="text-gray-500 text-base mt-2">
                  Sign in to continue to your account
                </Text>
              </View>

              <View>
                <View>
                  <Text className="text-xs font-semibold text-gray-700 mb-3 uppercase tracking-wide">
                    Email Address
                  </Text>
                  <TextInput
                    value={email}
                    onChangeText={setEmail}
                    placeholder="you@example.com"
                    className="w-full bg-white border border-gray-200 text-gray-900 text-base rounded-xl p-3.5"
                    placeholderTextColor="#9CA3AF"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    editable={!isLoading}
                  />
                </View>

                <View className="mt-6">
                  <View className="flex-row items-center justify-between mb-3">
                    <Text className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
                      Password
                    </Text>
                    <TouchableOpacity
                      onPress={() =>
                        router.push("/(auth)/forgot-password-request")
                      }
                    >
                      <Text className="text-xs font-semibold text-physio-primary">
                        Forgot Password?
                      </Text>
                    </TouchableOpacity>
                  </View>
                  <View className="relative">
                    <TextInput
                      value={password}
                      onChangeText={setPassword}
                      placeholder="••••••••"
                      className="w-full bg-white border border-gray-200 text-gray-900 text-base rounded-xl p-3.5 pr-10"
                      placeholderTextColor="#9CA3AF"
                      secureTextEntry={!showPassword}
                      editable={!isLoading}
                      autoCapitalize="none"
                    />
                    <TouchableOpacity
                      className="absolute right-3 top-3.5"
                      onPress={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? (
                        <EyeOff color="#6B7280" size={20} />
                      ) : (
                        <Eye color="#6B7280" size={20} />
                      )}
                    </TouchableOpacity>
                  </View>
                </View>

                {formError && (
                  <Text
                    className="text-red-600 text-base"
                    accessibilityRole="alert"
                  >
                    {formError}
                  </Text>
                )}

                <TouchableOpacity
                  onPress={handleSignIn}
                  disabled={isLoading}
                  className="w-full mt-6 py-3.5 px-4 bg-physio-primary rounded-xl shadow-sm items-center justify-center"
                  style={{ opacity: isLoading ? 0.7 : 1 }}
                >
                  {isLoading ? (
                    <ActivityIndicator color="white" />
                  ) : (
                    <Text className="text-white font-bold text-base">
                      Sign In
                    </Text>
                  )}
                </TouchableOpacity>
              </View>

              <View className="mt-8 pt-6 border-t border-gray-100">
                <View className="flex-row justify-center">
                  <Text className="text-base text-gray-500">
                    Don&apos;t have an account?{" "}
                  </Text>
                  <Link href="/(auth)/role-selection?next=signup" asChild>
                    <TouchableOpacity>
                      <Text className="font-semibold text-physio-primary ml-1 text-base">
                        Create free account
                      </Text>
                    </TouchableOpacity>
                  </Link>
                </View>
              </View>
            </View>

            {/* Footer Links */}
            <View className="mt-8 flex-row justify-center items-center gap-2">
              <Link href="/(public)/privacy" asChild>
                <TouchableOpacity
                  className="p-4"
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Text className="text-sm text-gray-500 font-medium hover:text-physio-dark">
                    Privacy
                  </Text>
                </TouchableOpacity>
              </Link>
              <Text className="text-gray-300">•</Text>
              <Link href="/(public)/terms" asChild>
                <TouchableOpacity
                  className="p-4"
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Text className="text-sm text-gray-500 font-medium hover:text-physio-dark">
                    Terms
                  </Text>
                </TouchableOpacity>
              </Link>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

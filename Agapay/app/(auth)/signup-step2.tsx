import { Eye, EyeOff, ArrowLeft, Check, X } from "lucide-react-native";
import { useRole } from "@/src/providers/RoleProvider";
import { Ionicons, FontAwesome5 } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter, Link } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
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
import apiClient from "@/api/client";
import StepDots from "@/src/components/StepDots";
import { requestSignupOtp } from "@/src/features/auth/core/authFlows";
import {
  getPasswordRequirements,
  validateSignupStep2Form,
  validateTherapistLicenseNumber,
} from "@/src/features/auth/core/signupStep2Validation";
import { getUserFacingSignUpError } from "@/src/features/auth/core/userFacingAuthErrors";
import { setSignupDraft } from "@/src/features/auth/core/signupDraftStore";

export default function SignUpStep2() {
  const router = useRouter();
  const params = useLocalSearchParams() as Record<string, string | undefined>;
  const { selectedRole, setSelectedRole } = useRole();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [licenseNumber, setLicenseNumber] = useState("");
  const [agree, setAgree] = useState(false);
  const [loading, setLoading] = useState(false);
  const [postErrorRedirect, setPostErrorRedirect] = useState<string | null>(
    null,
  );
  const [errorModal, setErrorModal] = useState<{
    visible: boolean;
    title: string;
    message: string;
  }>({ visible: false, title: "", message: "" });
  const { width } = useWindowDimensions();
  const isWeb = Platform.OS === "web";
  const isLargeWeb = isWeb && width >= 768;
  // (Therapist license details moved to separate verification screen)

  const passwordRequirements = getPasswordRequirements(password);

  const isPasswordValid = passwordRequirements.every((req) => req.valid);

  useEffect(() => {
    if (params.email) setEmail(params.email);
  }, [params]);

  const handleSignUp = async () => {
    const validation = validateSignupStep2Form({
      email,
      password,
      confirmPassword,
      agree,
    });
    if (!validation.ok) {
      setErrorModal({
        visible: true,
        title: validation.title,
        message: validation.message,
      });
      return;
    }

    const licenseValidation =
      selectedRole === "PhysicalTherapist"
        ? validateTherapistLicenseNumber(licenseNumber)
        : null;
    if (licenseValidation && !licenseValidation.ok) {
      setErrorModal({
        visible: true,
        title: licenseValidation.title,
        message: licenseValidation.message,
      });
      return;
    }

    const therapistLicenseNumber =
      selectedRole === "PhysicalTherapist" && licenseValidation?.ok
        ? licenseValidation.licenseNumber
        : null;

    const rawGender = params.gender;
    const gender =
      Array.isArray(rawGender) && rawGender.length > 0
        ? rawGender[0]
        : typeof rawGender === "string"
          ? rawGender
          : null;

    setLoading(true);
    try {
      if (!selectedRole) {
        setErrorModal({
          visible: true,
          title: "Select Role",
          message: "Please select a role before creating your account.",
        });
        router.replace("/(auth)/role-selection?next=signup");
        return;
      }

      setSignupDraft({
        role: selectedRole,
        email: validation.email,
        password: validation.password,
        firstName: params.firstName ?? "",
        lastName: params.lastName ?? "",
        dateOfBirth: params.dateOfBirth ?? "",
        gender,
        licenseNumber: therapistLicenseNumber,
      });

      const challenge = await requestSignupOtp({
        post: apiClient.post.bind(apiClient),
        email: validation.email,
      });

      setSelectedRole(selectedRole);
      router.replace({
        pathname: "/(auth)/verify-otp",
        params: {
          email: validation.email,
          purpose: challenge.purpose ?? "AccountVerification",
          role: selectedRole,
          message:
            challenge.message ??
            "Enter the verification code we sent to your email.",
          expiresAt: challenge.expiresAtUtc ?? "",
          origin: "signup",
        },
      });
      return;
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 409) {
        setPostErrorRedirect("/(auth)/signin");
        setErrorModal({
          visible: true,
          title: "Account Already Exists",
          message:
            err?.response?.data?.message ??
            "An account with this email already exists. Please sign in.",
        });
        return;
      }
      const ui = getUserFacingSignUpError(err);
      setErrorModal({
        visible: true,
        title: ui.title,
        message: ui.message,
      });
    } finally {
      setLoading(false);
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
        onRequestClose={() => {
          setErrorModal({ visible: false, title: "", message: "" });
          setPostErrorRedirect(null);
        }}
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
              onPress={() => {
                setErrorModal({ visible: false, title: "", message: "" });
                if (postErrorRedirect) {
                  router.replace(postErrorRedirect as any);
                }
                setPostErrorRedirect(null);
              }}
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
                  Set up your login credentials
                </Text>
              </View>

              <View>
                {/* Email Address */}
                <View>
                  <Text className="text-xs font-semibold text-gray-700 mb-3 uppercase tracking-wide">
                    Email Address
                  </Text>
                  <TextInput
                    value={email}
                    onChangeText={setEmail}
                    placeholder="Enter your email address"
                    className="w-full bg-white border border-gray-200 text-gray-900 text-base rounded-xl p-3.5"
                    placeholderTextColor="#9CA3AF"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    editable={!loading}
                  />
                </View>

                {/* Therapist License Number */}
                {selectedRole === "PhysicalTherapist" && (
                  <View className="mt-6">
                    <Text className="text-xs font-semibold text-gray-700 mb-3 uppercase tracking-wide">
                      License Number
                    </Text>
                    <TextInput
                      value={licenseNumber}
                      onChangeText={setLicenseNumber}
                      placeholder="Enter your license number"
                      className="w-full bg-white border border-gray-200 text-gray-900 text-base rounded-xl p-3.5"
                      placeholderTextColor="#9CA3AF"
                      autoCapitalize="characters"
                      editable={!loading}
                    />
                  </View>
                )}

                {/* Password */}
                <View className="mt-6">
                  <Text className="text-xs font-semibold text-gray-700 mb-3 uppercase tracking-wide">
                    Password
                  </Text>
                  <View className="relative">
                    <TextInput
                      value={password}
                      onChangeText={setPassword}
                      placeholder="Create a password"
                      className="w-full bg-white border border-gray-200 text-gray-900 text-base rounded-xl p-3.5 pr-12"
                      placeholderTextColor="#9CA3AF"
                      secureTextEntry={!showPassword}
                      editable={!loading}
                      autoCapitalize="none"
                    />
                    <TouchableOpacity
                      className="absolute right-3 top-3.5"
                      onPress={() => setShowPassword(!showPassword)}
                      accessibilityLabel={
                        showPassword ? "Hide password" : "Show password"
                      }
                    >
                      {showPassword ? (
                        <EyeOff color="#6B7280" size={20} />
                      ) : (
                        <Eye color="#6B7280" size={20} />
                      )}
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Confirm Password */}
                <View className="mt-6">
                  <Text className="text-xs font-semibold text-gray-700 mb-3 uppercase tracking-wide">
                    Confirm Password
                  </Text>
                  <View className="relative">
                    <TextInput
                      value={confirmPassword}
                      onChangeText={setConfirmPassword}
                      placeholder="Re-enter your password"
                      className="w-full bg-white border border-gray-200 text-gray-900 text-base rounded-xl p-3.5 pr-12"
                      placeholderTextColor="#9CA3AF"
                      secureTextEntry={!showConfirmPassword}
                      editable={!loading}
                      autoCapitalize="none"
                    />
                    <TouchableOpacity
                      className="absolute right-3 top-3.5"
                      onPress={() =>
                        setShowConfirmPassword(!showConfirmPassword)
                      }
                      accessibilityLabel={
                        showConfirmPassword ? "Hide password" : "Show password"
                      }
                    >
                      {showConfirmPassword ? (
                        <EyeOff color="#6B7280" size={20} />
                      ) : (
                        <Eye color="#6B7280" size={20} />
                      )}
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Password Requirements */}
                {password.length > 0 && (
                  <View className="mt-1 px-1">
                    <Text className="text-xs font-semibold text-gray-700 mb-2">
                      Password must contain:
                    </Text>
                    {passwordRequirements.map((req) => (
                      <View
                        key={req.id}
                        className="flex-row items-center mb-1.5"
                      >
                        {req.valid ? (
                          <Check size={14} color="#10B981" />
                        ) : (
                          <X size={14} color="#EF4444" />
                        )}
                        <Text
                          className={`ml-2 text-xs ${
                            req.valid
                              ? "text-green-600 font-medium"
                              : "text-red-500"
                          }`}
                        >
                          {req.label}
                        </Text>
                      </View>
                    ))}
                    {/* Additional warning for uppercase and special characters */}
                    {password.length >= 8 &&
                      (!/[A-Z]/.test(password) ||
                        !/[!@#$%^&*(),.?":{}|<>]/.test(password)) && (
                        <View className="mt-2 bg-amber-50 border border-amber-200 rounded-lg p-3">
                          <Text className="text-xs text-amber-800 font-semibold">
                            ⚠️ Weak Password
                          </Text>
                          <Text className="text-xs text-amber-700 mt-1">
                            {!/[A-Z]/.test(password) &&
                            !/[!@#$%^&*(),.?":{}|<>]/.test(password)
                              ? "Add an uppercase letter and a special character for better security."
                              : !/[A-Z]/.test(password)
                                ? "Add an uppercase letter for better security."
                                : "Add a special character (!@#$%^&*) for better security."}
                          </Text>
                        </View>
                      )}
                  </View>
                )}

                {/* Terms and Conditions */}
                <TouchableOpacity
                  className="flex-row items-start mt-2"
                  activeOpacity={0.8}
                  onPress={() => setAgree((s) => !s)}
                  style={{ gap: 12 }}
                >
                  <View
                    className={`w-5 h-5 rounded-md border-2 justify-center items-center mt-0.5 ${
                      agree
                        ? "bg-physio-primary border-physio-primary"
                        : "bg-white border-gray-300"
                    }`}
                  >
                    {agree && <Check size={12} color="white" />}
                  </View>
                  <Text className="flex-1 text-gray-600 text-sm leading-relaxed">
                    I acknowledge that I have read, understood, and agree to the{" "}
                    <Link href="/(auth)/terms-and-conditions">
                      <Text className="text-physio-primary font-medium">
                        Terms and Conditions
                      </Text>
                    </Link>
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Step Indicator & Create Account Button */}
              <View className="mt-8" style={{ gap: 16 }}>
                <View className="items-center">
                  <StepDots currentStep={2} totalSteps={2} />
                </View>

                <TouchableOpacity
                  onPress={handleSignUp}
                  disabled={loading}
                  className="w-full py-3.5 px-4 bg-physio-primary rounded-xl shadow-sm items-center justify-center"
                  style={{ opacity: loading ? 0.7 : 1 }}
                  activeOpacity={0.8}
                >
                  {loading ? (
                    <ActivityIndicator color="white" />
                  ) : (
                    <Text className="text-white font-bold text-base">
                      Create Account
                    </Text>
                  )}
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

// styles converted to inline styles above

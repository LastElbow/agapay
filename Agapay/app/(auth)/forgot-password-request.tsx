import apiClient from "@/api/client";
import { requestPasswordResetLink } from "@/src/features/auth/core/authFlows";
import PrimaryButton from "@/src/components/PrimaryButton";
import Screen from "@/src/components/Screen";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

export default function ForgotPasswordRequest() {
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const router = useRouter();

  const handleSubmit = async () => {
    if (!email.trim()) {
      Alert.alert("Error", "Please enter your email address.");
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await requestPasswordResetLink({
        post: apiClient.post.bind(apiClient),
        email,
      });
      setSent(true);
      if (res.devToken) {
        console.debug("DEV reset token:", res.devToken);
        console.debug("DEV reset url:", res.resetUrl);
      }
    } catch (e: any) {
      console.warn(
        "Forgot password request failed",
        e?.response?.data || e.message,
      );
      // Still show generic success (anti enumeration) but optionally show toast/log.
      setSent(true);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Screen>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={{
            flexGrow: 1,
            padding: 20,
            justifyContent: "center",
          }}
          keyboardShouldPersistTaps="handled"
        >
          <Text
            style={{
              fontSize: 26,
              fontWeight: "700",
              textAlign: "center",
              marginBottom: 8,
            }}
          >
            Forgot Password
          </Text>
          <Text
            style={{
              fontSize: 14,
              color: "#555",
              textAlign: "center",
              marginBottom: 28,
            }}
          >
            Enter your email and we&apos;ll send you a link to reset your
            password.
          </Text>

          <View style={{ marginBottom: 20 }}>
            <Text style={{ fontSize: 14, fontWeight: "500", marginBottom: 10 }}>
              Email
            </Text>
            <TextInput
              autoCapitalize="none"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              style={{
                backgroundColor: "#F8F9FA",
                borderWidth: 1,
                borderColor: "#E1E3E6",
                paddingVertical: 14,
                paddingHorizontal: 14,
                borderRadius: 12,
                fontSize: 16,
                color: "#000",
              }}
              editable={!isSubmitting && !sent}
            />
          </View>

          {!sent ? (
            <PrimaryButton onPress={handleSubmit} loading={isSubmitting}>
              Send Reset Link
            </PrimaryButton>
          ) : (
            <View style={{ gap: 16 }}>
              <Text
                style={{ textAlign: "center", color: "#0A7E07", fontSize: 14 }}
              >
                If an account exists, a reset link has been sent. Check your
                email.
              </Text>
              <PrimaryButton onPress={() => router.replace("/(auth)/signin")}>
                Back to Login
              </PrimaryButton>
            </View>
          )}

          <TouchableOpacity
            style={{ marginTop: 32 }}
            onPress={() => router.replace("/(auth)/signin")}
          >
            <Text
              style={{
                textAlign: "center",
                color: "#0D9488",
                fontWeight: "500",
              }}
            >
              Back to Sign In
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

import apiClient from "@/api/client";
import { submitPasswordReset } from "@/src/features/auth/core/authFlows";
import PrimaryButton from "@/src/components/PrimaryButton";
import Screen from "@/src/components/Screen";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
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

export default function ResetPassword() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (typeof params.email === "string") setEmail(params.email);
    if (typeof params.token === "string") setToken(params.token);
  }, [params.email, params.token]);

  const handleReset = async () => {
    if (!email || !token || !password) {
      Alert.alert("Error", "Missing required fields.");
      return;
    }
    if (password !== confirm) {
      Alert.alert("Error", "Passwords do not match.");
      return;
    }
    setIsSubmitting(true);
    try {
      await submitPasswordReset({
        post: apiClient.post.bind(apiClient),
        email,
        token,
        newPassword: password,
      });
      setDone(true);
    } catch (e: any) {
      console.warn("Reset password failed", e?.response?.data || e.message);
      // Show generic success even on failure to avoid token brute-force signaling
      setDone(true);
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
            Reset Password
          </Text>
          <Text
            style={{
              fontSize: 14,
              color: "#555",
              textAlign: "center",
              marginBottom: 28,
            }}
          >
            Enter your new password below.
          </Text>

          <View style={{ gap: 16 }}>
            <View>
              <Text
                style={{ fontSize: 14, fontWeight: "500", marginBottom: 10 }}
              >
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
                editable={!isSubmitting && !done}
              />
            </View>
            <View>
              <Text
                style={{ fontSize: 14, fontWeight: "500", marginBottom: 10 }}
              >
                Reset Token
              </Text>
              <TextInput
                autoCapitalize="none"
                value={token}
                onChangeText={setToken}
                placeholder="Paste token if not auto-filled"
                style={{
                  backgroundColor: "#F8F9FA",
                  borderWidth: 1,
                  borderColor: "#E1E3E6",
                  paddingVertical: 14,
                  paddingHorizontal: 14,
                  borderRadius: 12,
                  fontSize: 14,
                  color: "#000",
                }}
                multiline
                numberOfLines={3}
                editable={!isSubmitting && !done}
              />
            </View>
            <View>
              <Text
                style={{ fontSize: 14, fontWeight: "500", marginBottom: 10 }}
              >
                New Password
              </Text>
              <TextInput
                secureTextEntry
                value={password}
                onChangeText={setPassword}
                placeholder="********"
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
                editable={!isSubmitting && !done}
              />
            </View>
            <View>
              <Text
                style={{ fontSize: 14, fontWeight: "500", marginBottom: 10 }}
              >
                Confirm Password
              </Text>
              <TextInput
                secureTextEntry
                value={confirm}
                onChangeText={setConfirm}
                placeholder="********"
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
                editable={!isSubmitting && !done}
              />
            </View>
          </View>

          {!done ? (
            <View style={{ marginTop: 28 }}>
              <PrimaryButton onPress={handleReset} loading={isSubmitting}>
                Reset Password
              </PrimaryButton>
            </View>
          ) : (
            <View style={{ marginTop: 28, gap: 16 }}>
              <Text
                style={{ textAlign: "center", color: "#0A7E07", fontSize: 14 }}
              >
                Password reset complete (or request accepted). You can now sign
                in.
              </Text>
              <PrimaryButton onPress={() => router.replace("/(auth)/signin")}>
                Go to Sign In
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

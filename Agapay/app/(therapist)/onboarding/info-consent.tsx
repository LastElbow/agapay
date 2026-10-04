import { useRouter, useLocalSearchParams } from "expo-router";
import { ArrowLeft, Shield } from "lucide-react-native";
import React, { useEffect, useState } from "react";
import {
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { therapistOnboardingStore } from "@/src/stores/therapistOnboardingStore";

export default function PTInfo_Consent() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const [consentGiven, setConsentGiven] = useState(false);
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === "web" && width >= 768;

  // Clear onboarding store when first entering this screen
  useEffect(() => {
    // Save gender to store before clearing other data
    if (params.gender && typeof params.gender === "string") {
      therapistOnboardingStore.setGender(params.gender);
    }

    // Clear other onboarding data but keep gender
    const currentGender = therapistOnboardingStore.gender;
    therapistOnboardingStore.clear();
    therapistOnboardingStore.setGender(currentGender);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View
      style={[styles.outerContainer, isDesktop && styles.outerContainerDesktop]}
    >
      {isDesktop ? (
        // Desktop Layout - centered card
        <ScrollView
          contentContainerStyle={styles.desktopScrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.desktopCard}>
            <TouchableOpacity
              style={styles.desktopBackButton}
              onPress={() => router.back()}
              accessibilityLabel="Go back"
            >
              <ArrowLeft size={20} color="#089769" />
              <Text style={styles.backText}>Back</Text>
            </TouchableOpacity>

            <View style={styles.desktopIconShield}>
              <Shield size={50} color="#089769" />
            </View>

            <Text style={styles.title}>Verification</Text>

            <Text style={styles.subtitle}>
              To ensure the safety and trust of our community, we need to verify
              your legitimacy. We will ask for the following:
            </Text>

            <View style={styles.bullets}>
              <Text style={styles.bullet}>• PRC License Number</Text>
              <Text style={styles.bullet}>• Picture of PRC License</Text>
            </View>

            <Text style={styles.note}>
              The photo of your license is used only for this one-time
              verification and will be permanently deleted from our database
              immediately after your account is confirmed
            </Text>

            <TouchableOpacity
              style={styles.checkboxRow}
              onPress={() => setConsentGiven((s) => !s)}
            >
              <View
                style={[styles.checkbox, consentGiven && styles.checkboxOn]}
              >
                {consentGiven && <View style={styles.checkboxDot} />}
              </View>
              <Text style={styles.checkboxLabel}>
                I understand and consent to the verification process
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.continueButton,
                styles.desktopContinueButton,
                !consentGiven && styles.continueDisabled,
              ]}
              onPress={() => {
                if (!consentGiven) return;
                router.push({
                  pathname: "/(therapist)/onboarding/verification",
                  params: params.gender
                    ? { gender: params.gender as string }
                    : {},
                } as any);
              }}
              disabled={!consentGiven}
            >
              <Text style={styles.continueText}>Continue</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      ) : (
        // Mobile Layout - original design
        <SafeAreaView style={styles.safe}>
          <View style={styles.headerRow}>
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => router.back()}
              accessibilityLabel="Go back"
            >
              <ArrowLeft size={28} color="#089769" />
            </TouchableOpacity>
          </View>

          <View style={[styles.content, { paddingBottom: 140 }]}>
            <View style={styles.contentWrapper}>
              <View style={styles.iconShield}>
                <Shield size={50} color="#089769" />
              </View>

              <Text style={styles.title}>Verification</Text>

              <Text style={styles.subtitle}>
                To ensure the safety and trust of our community, we need to
                verify your legitimacy. We will ask for the following:
              </Text>

              <View style={styles.bullets}>
                <Text style={styles.bullet}>• PRC License Number</Text>
                <Text style={styles.bullet}>• Picture of PRC License</Text>
              </View>

              <Text style={styles.note}>
                The photo of your license is used only for this one-time
                verification and will be permanently deleted from our database
                immediately after your account is confirmed
              </Text>

              <TouchableOpacity
                style={styles.checkboxRow}
                onPress={() => setConsentGiven((s) => !s)}
              >
                <View
                  style={[styles.checkbox, consentGiven && styles.checkboxOn]}
                >
                  {consentGiven && <View style={styles.checkboxDot} />}
                </View>
                <Text style={styles.checkboxLabel}>
                  I understand and consent to the verification process
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          <View
            style={[
              styles.footer,
              { bottom: insets.bottom + 12, paddingHorizontal: 20 },
            ]}
            pointerEvents="box-none"
          >
            <TouchableOpacity
              style={[
                styles.continueButton,
                !consentGiven && styles.continueDisabled,
              ]}
              onPress={() => {
                if (!consentGiven) return;
                router.push({
                  pathname: "/(therapist)/onboarding/verification",
                  params: params.gender
                    ? { gender: params.gender as string }
                    : {},
                } as any);
              }}
              disabled={!consentGiven}
            >
              <Text style={styles.continueText}>Continue</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  outerContainer: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  outerContainerDesktop: {
    backgroundColor: "#e6f5f0",
  },
  // Desktop styles
  desktopScrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 40,
  },
  desktopCard: {
    width: "100%",
    maxWidth: 500,
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 4,
    padding: 32,
  },
  desktopBackButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 24,
  },
  backText: {
    fontSize: 16,
    fontWeight: "500",
    color: "#089769",
  },
  desktopIconShield: {
    width: 74,
    height: 74,
    borderRadius: 18,
    backgroundColor: "#E6F4F0",
    marginBottom: 16,
    justifyContent: "center",
    alignItems: "center",
  },
  desktopContinueButton: {
    marginTop: 24,
  },
  // Mobile styles
  safe: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  headerRow: {
    paddingTop: 36,
    paddingHorizontal: 20,
  },
  backButton: {
    width: 44,
    height: 44,
    justifyContent: "center",
    alignItems: "center",
  },
  content: {
    paddingHorizontal: 24,
    paddingTop: 28,
    flex: 1,
  },
  contentWrapper: {
    width: "100%",
    maxWidth: 600,
  },
  iconShield: {
    width: 74,
    height: 74,
    borderRadius: 18,
    marginBottom: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  // Shared styles
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: "#111",
    marginBottom: 8,
  },
  subtitle: {
    color: "#666",
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 12,
  },
  bullets: {
    marginBottom: 18,
  },
  bullet: {
    fontSize: 16,
    marginBottom: 6,
    color: "#111",
  },
  note: {
    fontSize: 14,
    fontStyle: "italic",
    color: "#444",
    lineHeight: 20,
    marginBottom: 28,
  },
  checkboxRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: "#089769",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "transparent",
    marginRight: 12,
  },
  checkboxOn: {
    backgroundColor: "#089769",
  },
  checkboxDot: {
    width: 10,
    height: 10,
    backgroundColor: "#fff",
    borderRadius: 3,
  },
  checkboxLabel: {
    color: "#333",
    fontSize: 15,
    flex: 1,
  },
  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    paddingHorizontal: 20,
  },
  continueButton: {
    backgroundColor: "#089769",
    height: 52,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
  },
  continueDisabled: {
    backgroundColor: "#a8d5c8",
  },
  continueText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
});

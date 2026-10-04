import apiClient from "@/api/client";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { resolveAvatarSource } from "@/src/utils/avatar";
import { useRole } from "@/src/providers/RoleProvider";
import {
  fetchPatientCancellationHistory,
  PatientCancellationHistory,
} from "@/src/services/sessions";

type PatientDetail = {
  id: number;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  gender?: string | null;
  address?: string | null;
  barangay?: string | null;
  occupation?: string | null;
  activityLevel?: string | null;
  medicalCondition?: string | null;
  surgicalHistory?: string | null;
  medicationBeingTaken?: string | null;
  currentComplaints?: string | null;
};

function formatDate(dateString: string | null | undefined): string {
  if (!dateString) return "N/A";
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return dateString;
  }
}

function calculateAge(dateOfBirth: string | null | undefined): number | null {
  if (!dateOfBirth) return null;
  try {
    const birthDate = new Date(dateOfBirth);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (
      monthDiff < 0 ||
      (monthDiff === 0 && today.getDate() < birthDate.getDate())
    ) {
      age--;
    }
    return age;
  } catch {
    return null;
  }
}

export default function PatientDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const patientId = params.id as string;

  const { selectedRole } = useRole();
  const isViewingAsTherapist = selectedRole === "PhysicalTherapist";

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [patient, setPatient] = useState<PatientDetail | null>(null);
  const [cancellationHistory, setCancellationHistory] =
    useState<PatientCancellationHistory | null>(null);
  const [cancellationLoading, setCancellationLoading] = useState(false);
  const [cancellationError, setCancellationError] = useState<string | null>(
    null,
  );

  useEffect(() => {
    const loadPatientDetails = async () => {
      try {
        setLoading(true);
        setError(null);

        // Fetch patient details using the patient ID
        const response = await apiClient.get(
          `/api/patient/profiles/${patientId}`,
        );
        setPatient(response.data);
      } catch (err: any) {
        console.error("Failed to load patient details:", err);
        setError(
          err?.response?.data?.message || "Failed to load patient details",
        );
      } finally {
        setLoading(false);
      }
    };

    if (patientId) {
      loadPatientDetails();
    }
  }, [patientId]);

  useEffect(() => {
    if (!isViewingAsTherapist) return;
    if (!patient?.id) return;
    let mounted = true;

    (async () => {
      try {
        setCancellationLoading(true);
        setCancellationError(null);
        const history = await fetchPatientCancellationHistory(patient.id);
        if (!mounted) return;
        setCancellationHistory(history);
      } catch (err: any) {
        if (!mounted) return;
        setCancellationError(
          err?.response?.data?.message ||
            err?.message ||
            "Failed to load cancellation history",
        );
      } finally {
        if (!mounted) return;
        setCancellationLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [isViewingAsTherapist, patient?.id]);

  const fallbackAvatar = require("@/assets/images/react-logo.png");
  const avatarSource = resolveAvatarSource(null, fallbackAvatar);

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: "#F3F4F6" }}>
        <View
          style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
        >
          <ActivityIndicator size="large" color="#007AFF" />
        </View>
      </SafeAreaView>
    );
  }

  if (error || !patient) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: "#F3F4F6" }}>
        <View style={{ padding: 16 }}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={{
              flexDirection: "row",
              alignItems: "center",
              marginBottom: 16,
            }}
          >
            <Ionicons name="chevron-back" size={24} color="#111827" />
            <Text style={{ fontSize: 16, marginLeft: 4 }}>Back</Text>
          </TouchableOpacity>
          <View style={{ alignItems: "center", marginTop: 40 }}>
            <Text style={{ fontSize: 16, color: "#DC2626" }}>
              {error || "Patient not found"}
            </Text>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  const fullName = [patient.firstName, patient.lastName]
    .filter(Boolean)
    .map((n) => n?.trim())
    .filter(Boolean)
    .join(" ");
  const age = calculateAge(patient.dateOfBirth);
  const fullAddress = [patient.address, patient.barangay]
    .filter(Boolean)
    .join(", ");

  const InfoSection = ({
    title,
    children,
  }: {
    title: string;
    children: React.ReactNode;
  }) => (
    <View style={{ marginBottom: 20 }}>
      <Text
        style={{
          fontSize: 16,
          fontWeight: "700",
          marginBottom: 12,
          color: "#111827",
        }}
      >
        {title}
      </Text>
      {children}
    </View>
  );

  const InfoRow = ({
    label,
    value,
  }: {
    label: string;
    value: string | null | undefined;
  }) => (
    <View style={{ marginBottom: 12 }}>
      <Text style={{ fontSize: 14, color: "#6B7280", marginBottom: 4 }}>
        {label}
      </Text>
      <Text style={{ fontSize: 16, color: "#111827" }}>
        {value || "Not specified"}
      </Text>
    </View>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#F3F4F6" }}>
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        {/* Header */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            marginBottom: 20,
          }}
        >
          <TouchableOpacity
            onPress={() => router.back()}
            style={{ padding: 6, marginRight: 6 }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="chevron-back" size={24} color="#111827" />
          </TouchableOpacity>
          <Text style={{ fontSize: 20, fontWeight: "700" }}>
            Patient Details
          </Text>
        </View>

        {/* Patient Info Card */}
        <View
          style={{
            backgroundColor: "#fff",
            borderRadius: 12,
            padding: 20,
            marginBottom: 16,
            alignItems: "center",
            borderWidth: 1,
            borderColor: "#E5E7EB",
          }}
        >
          <View
            style={{
              width: 80,
              height: 80,
              borderRadius: 40,
              overflow: "hidden",
              marginBottom: 12,
              backgroundColor: "#E5E7EB",
            }}
          >
            <Image
              source={avatarSource}
              style={{ width: 80, height: 80 }}
              resizeMode="cover"
            />
          </View>
          <Text style={{ fontSize: 22, fontWeight: "700", marginBottom: 4 }}>
            {fullName}
          </Text>
          {age && (
            <Text style={{ fontSize: 16, color: "#6B7280" }}>
              {age} years old
            </Text>
          )}
        </View>

        {/* Basic Information */}
        <View
          style={{
            backgroundColor: "#fff",
            borderRadius: 12,
            padding: 16,
            marginBottom: 16,
            borderWidth: 1,
            borderColor: "#E5E7EB",
          }}
        >
          <InfoSection title="Basic Information">
            <InfoRow
              label="Date of Birth"
              value={formatDate(patient.dateOfBirth)}
            />
            <InfoRow label="Gender" value={patient.gender} />
            <InfoRow label="Address" value={fullAddress} />
            <InfoRow label="Occupation" value={patient.occupation} />
            <InfoRow label="Activity Level" value={patient.activityLevel} />
          </InfoSection>
        </View>

        {/* Medical Information */}
        <View
          style={{
            backgroundColor: "#fff",
            borderRadius: 12,
            padding: 16,
            marginBottom: 16,
            borderWidth: 1,
            borderColor: "#E5E7EB",
          }}
        >
          <InfoSection title="Medical Information">
            <InfoRow
              label="Medical Condition"
              value={patient.medicalCondition}
            />
            <InfoRow label="Surgical History" value={patient.surgicalHistory} />
            <InfoRow
              label="Current Medication"
              value={patient.medicationBeingTaken}
            />
            <InfoRow
              label="Current Complaints"
              value={patient.currentComplaints}
            />
          </InfoSection>
        </View>

        {/* Cancellation History (Therapist View Only) */}
        {isViewingAsTherapist ? (
          <View
            style={{
              backgroundColor: "#fff",
              borderRadius: 12,
              padding: 16,
              marginBottom: 16,
              borderWidth: 1,
              borderColor: "#E5E7EB",
            }}
          >
            <InfoSection title="Cancellation History">
              {cancellationLoading ? (
                <View style={{ paddingVertical: 8 }}>
                  <ActivityIndicator size="small" color="#007AFF" />
                </View>
              ) : cancellationError ? (
                <Text style={{ fontSize: 14, color: "#DC2626" }}>
                  {cancellationError}
                </Text>
              ) : !cancellationHistory ||
                cancellationHistory.totalCancelled === 0 ? (
                <Text style={{ fontSize: 14, color: "#6B7280" }}>
                  No cancelled sessions
                </Text>
              ) : (
                <>
                  <View
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                      marginBottom: 12,
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 12, color: "#6B7280" }}>
                        Cancelled by patient
                      </Text>
                      <Text
                        style={{
                          fontSize: 16,
                          fontWeight: "700",
                          color: "#111827",
                          marginTop: 2,
                        }}
                      >
                        {cancellationHistory.cancelledByPatient}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 12, color: "#6B7280" }}>
                        Cancelled by therapist
                      </Text>
                      <Text
                        style={{
                          fontSize: 16,
                          fontWeight: "700",
                          color: "#111827",
                          marginTop: 2,
                        }}
                      >
                        {cancellationHistory.cancelledByTherapist}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 12, color: "#6B7280" }}>
                        Total cancelled
                      </Text>
                      <Text
                        style={{
                          fontSize: 16,
                          fontWeight: "700",
                          color: "#111827",
                          marginTop: 2,
                        }}
                      >
                        {cancellationHistory.totalCancelled}
                      </Text>
                    </View>
                  </View>

                  {cancellationHistory.items.map((item) => {
                    const cancelledByRaw = (item.cancelledBy || "").toString();
                    const cancelledByLower = cancelledByRaw.toLowerCase();
                    const cancelledByLabel =
                      cancelledByLower === "patient"
                        ? "Cancelled by Patient"
                        : cancelledByLower === "therapist"
                          ? "Cancelled by Therapist"
                          : "Cancelled";

                    const scheduledAtText = (() => {
                      try {
                        return new Date(item.startAt).toLocaleString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        });
                      } catch {
                        return item.startAt;
                      }
                    })();

                    return (
                      <View
                        key={item.sessionId}
                        style={{
                          backgroundColor: "#F9FAFB",
                          borderRadius: 10,
                          padding: 12,
                          borderWidth: 1,
                          borderColor: "#E5E7EB",
                          marginBottom: 10,
                        }}
                      >
                        <View
                          style={{
                            flexDirection: "row",
                            alignItems: "flex-start",
                            justifyContent: "space-between",
                          }}
                        >
                          <View style={{ flex: 1, paddingRight: 10 }}>
                            <Text
                              style={{
                                fontSize: 14,
                                fontWeight: "700",
                                color: "#111827",
                              }}
                            >
                              {item.conditionCase || "Session"}
                            </Text>
                            <Text
                              style={{
                                fontSize: 12,
                                color: "#6B7280",
                                marginTop: 4,
                              }}
                            >
                              Scheduled: {scheduledAtText}
                            </Text>
                          </View>

                          <View
                            style={{
                              backgroundColor: "#FEE2E2",
                              paddingHorizontal: 8,
                              paddingVertical: 4,
                              borderRadius: 999,
                            }}
                          >
                            <Text
                              style={{
                                fontSize: 11,
                                fontWeight: "700",
                                color: "#B91C1C",
                              }}
                            >
                              {cancelledByLabel}
                            </Text>
                          </View>
                        </View>
                      </View>
                    );
                  })}
                </>
              )}
            </InfoSection>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

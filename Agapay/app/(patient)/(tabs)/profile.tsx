import { useAuth } from "@/src/providers/AuthProvider";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { useRole } from "@/src/providers/RoleProvider";
import { resolveAvatarSource } from "@/src/utils/avatar";
import { useFocusEffect } from "@react-navigation/native";
import { useRouter } from "expo-router";
import { HelpCircle, LogOut, Settings, User, ArrowRight, Shield, Trash2 } from "lucide-react-native";
import React, { useCallback, useMemo, useState } from "react";
import {
  Image,
  Text,
  TouchableOpacity,
  View,
  Modal,
  Alert,
  Platform,
} from "react-native";
import { deleteItem as ssDelete } from "@/src/utils/safeSecureStore";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import WebHeader from "@/src/components/WebHeader";
import ProfileScreen from "@/src/components/ProfileScreen";
import apiClient from "@/api/client";
import {
  uploadPatientProfilePicture,
  fetchPatientProfilePicture,
  patientProfilePictureQueryKey,
} from "@/src/services/patientProfile";

const fallbackUser = {
  firstName: "John",
  lastName: "Doe",
  email: "johndoe@gmail.com",
  avatar: require("@/assets/images/react-logo.png"),
};

function getInitials(name?: string) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function PatientProfileTab() {
  const router = useRouter();
  const { user: authUser, signOut } = useAuth();
  const { clearRole } = useRole();
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);

  const queryClient = useQueryClient();

  // Fetch patient details to ensure we have DOB/Gender/Phone
  const { data: patientDetails } = useQuery({
    queryKey: ["patientProfileDetails"],
    queryFn: async () => {
      const res = await apiClient.get("/api/patient/me");
      return res.data;
    },
    enabled: !!authUser,
  });

  // Fetch profile picture
  const { data: profilePictureData } = useQuery({
    queryKey: patientProfilePictureQueryKey,
    queryFn: fetchPatientProfilePicture,
    enabled: !!authUser,
    staleTime: 60 * 1000, // 1 minute
  });



  const displayUser = useMemo(() => {
    if (!authUser) return fallbackUser;
    const asAny = authUser as Record<string, any>;
    const first =
      asAny.firstName ??
      asAny.FirstName ??
      asAny.givenName ??
      asAny.GivenName ??
      fallbackUser.firstName;
    const last =
      asAny.lastName ??
      asAny.LastName ??
      asAny.familyName ??
      asAny.FamilyName ??
      fallbackUser.lastName;
    const email = asAny.email ?? asAny.Email ?? fallbackUser.email;
    const avatar = asAny.avatar ?? asAny.Avatar ?? fallbackUser.avatar;

    const base = {
      ...authUser,
      firstName: first,
      lastName: last,
      email,
      avatar,
    };

    if (patientDetails) {
      return {
        ...base,
        firstName: patientDetails.firstName ?? base.firstName,
        lastName: patientDetails.lastName ?? base.lastName,
        email: patientDetails.email ?? base.email,
        dateOfBirth: patientDetails.dateOfBirth,
        gender: patientDetails.gender,
        phoneNumber: patientDetails.phoneNumber,
        address: patientDetails.address,
        barangay: patientDetails.barangay,
        latitude: patientDetails.latitude,
        longitude: patientDetails.longitude,
      };
    }

    return base;
  }, [authUser, patientDetails]);

  // Use profile picture from API if available, otherwise fall back to user avatar
  const avatarSource = useMemo(() => {
    if (profilePictureData?.profilePictureUrl) {
      return { uri: profilePictureData.profilePictureUrl };
    }
    return resolveAvatarSource(displayUser?.avatar, fallbackUser.avatar);
  }, [displayUser, profilePictureData]);

  const fullName = `${displayUser?.firstName || (displayUser as any)?.name || "John"
    }${displayUser?.lastName ? ` ${displayUser.lastName}` : ""}`.trim();
  const shouldShowInitials = !profilePictureData?.profilePictureUrl && avatarSource === fallbackUser.avatar;

  const confirmLogout = async () => {
    try {
      // Clear role FIRST to prevent AuthGate from redirecting based on stale role
      clearRole();

      await signOut();
      queryClient.clear();
      router.replace("/(auth)/signin");
    } catch (error) {
      console.error("Logout error:", error);
    } finally {
      setShowLogoutModal(false);
    }
  };


  const handleLogout = () => {
    setShowLogoutModal(true);
  };

  const executeAccountDeletion = async () => {
    try {
      await apiClient.delete("/api/User/me");
      
      const onConfirm = async () => {
        clearRole();
        if (typeof signOut === "function") {
          await signOut();
        } else {
          try {
            await ssDelete("accessToken");
            await ssDelete("refreshToken");
            await ssDelete("user");
          } catch (e) {
            console.warn("Fallback SecureStore clear failed", e);
          }
        }
        queryClient.clear();
        router.replace("/(auth)/signin");
      };

      if (Platform.OS === "web") {
        window.alert("Account Deleted\n\nYour account has been successfully deleted.");
        await onConfirm();
      } else {
        Alert.alert("Account Deleted", "Your account has been successfully deleted.", [
          {
            text: "OK",
            onPress: onConfirm,
          },
        ]);
      }
    } catch (err: any) {
      console.error("Delete account error:", err);
      const errMsg = err?.response?.data?.message || "Failed to delete account. Please try again.";
      if (Platform.OS === "web") {
        window.alert("Deletion Failed\n\n" + errMsg);
      } else {
        Alert.alert("Deletion Failed", errMsg);
      }
    }
  };

  const handleDeleteAccount = () => {
    if (Platform.OS === "web") {
      const confirm1 = window.confirm(
        "Confirm Account Deletion\n\nAre you sure you want to delete your account? This will permanently erase your personal data, profile settings, and location information. This action cannot be undone."
      );
      if (confirm1) {
        const confirm2 = window.confirm(
          "Final Confirmation\n\nThis action is absolutely permanent. All your details will be anonymized. Are you 100% sure you want to proceed?"
        );
        if (confirm2) {
          executeAccountDeletion();
        }
      }
    } else {
      Alert.alert(
        "Confirm Account Deletion",
        "Are you sure you want to delete your account? This will permanently erase your personal data, profile settings, and location information. This action cannot be undone.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete My Account",
            style: "destructive",
            onPress: () => {
              Alert.alert(
                "Final Confirmation",
                "This action is absolutely permanent. All your details will be anonymized. Are you 100% sure you want to proceed?",
                [
                  { text: "Cancel", style: "cancel" },
                  {
                    text: "Yes, Delete Permanently",
                    style: "destructive",
                    onPress: executeAccountDeletion,
                  },
                ]
              );
            },
          },
        ]
      );
    }
  };

  const handleSaveProfile = async (data: any) => {
    try {
      const payload: any = {
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        relationshipToUser: "Self",
        dateOfBirth: data.dateOfBirth || null,
        gender: data.gender || null,
      };

      // Include location data if provided
      if (data.address !== undefined) {
        payload.address = data.address;
      }
      if (data.barangay !== undefined) {
        payload.barangay = data.barangay;
      }
      if (data.latitude !== undefined) {
        payload.latitude = data.latitude;
      }
      if (data.longitude !== undefined) {
        payload.longitude = data.longitude;
      }

      await apiClient.put("/api/patient/me", payload);

      // Optimistically update the cached profile so the UI doesn't momentarily
      // snap back to stale values while queries refetch.
      queryClient.setQueryData(["patientProfileDetails"], (prev: any) => ({
        ...(prev ?? {}),
        ...payload,
      }));

      // Refresh auth user context if needed, or just let the next fetch handle it
      // Ideally we should update the local user state
      // But for now, just showing success is enough as the ProfileScreen updates its local state
      Alert.alert("Success", "Profile updated successfully");

      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: ["patientProfile"] });
      queryClient.invalidateQueries({ queryKey: ["patientProfileDetails"] });
    } catch (error: any) {
      console.error("Failed to save profile", error);
      Alert.alert(
        "Error",
        error?.response?.data?.message || "Failed to save profile"
      );
      throw error;
    }
  };

  const handleChangeProfilePicture = async (imageUri: string) => {
    try {
      const result = await uploadPatientProfilePicture(imageUri);
      // Invalidate the profile picture query to refresh
      queryClient.invalidateQueries({ queryKey: patientProfilePictureQueryKey });
      Alert.alert("Success", "Profile picture updated successfully");
    } catch (error: any) {
      console.error("Failed to upload profile picture", error);
      throw error; // Re-throw to let ProfileScreen handle the error UI
    }
  };

  return (
    <View className="flex-1 bg-teal-50">
      <Modal
        visible={showSettingsModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowSettingsModal(false)}
      >
        <View className="flex-1 justify-center items-center bg-black/50 px-6">
          <View className="bg-white rounded-3xl p-6 w-full max-w-sm border border-gray-100 shadow-2xl">
            <View className="items-center mb-4">
              <View className="w-14 h-14 rounded-full bg-teal-50 items-center justify-center mb-3">
                <Settings color="#0D9488" size={28} />
              </View>
              <Text className="text-xl font-bold text-gray-900 text-center">
                Settings & Privacy
              </Text>
              <Text className="text-xs text-gray-500 text-center mt-1">
                Manage your account policies and safety
              </Text>
            </View>

            <View className="space-y-3 my-4">
              {/* Privacy Policy Link */}
              <TouchableOpacity
                onPress={() => {
                  setShowSettingsModal(false);
                  router.push("/privacy");
                }}
                className="w-full flex-row items-center justify-between p-4 bg-gray-50 rounded-2xl border border-gray-100"
                activeOpacity={0.7}
              >
                <View className="flex-row items-center">
                  <Shield size={18} color="#0D9488" />
                  <Text className="text-sm font-semibold text-gray-700 ml-2">Privacy Policy</Text>
                </View>
                <ArrowRight size={16} color="#9CA3AF" />
              </TouchableOpacity>

              {/* Community Guidelines Link */}
              <TouchableOpacity
                onPress={() => {
                  setShowSettingsModal(false);
                  router.push("/community-guidelines");
                }}
                className="w-full flex-row items-center justify-between p-4 bg-gray-50 rounded-2xl border border-gray-100"
                activeOpacity={0.7}
              >
                <View className="flex-row items-center">
                  <Ionicons name="book-outline" size={18} color="#0D9488" />
                  <Text className="text-sm font-semibold text-gray-700 ml-2">Community Guidelines</Text>
                </View>
                <ArrowRight size={16} color="#9CA3AF" />
              </TouchableOpacity>

              {/* Delete Account Button */}
              <TouchableOpacity
                onPress={() => {
                  setShowSettingsModal(false);
                  handleDeleteAccount();
                }}
                className="w-full flex-row items-center justify-between p-4 bg-red-50/50 rounded-2xl border border-red-100"
                activeOpacity={0.7}
              >
                <View className="flex-row items-center">
                  <Trash2 size={18} color="#EF4444" />
                  <Text className="text-sm font-semibold text-red-600 ml-2">Delete Account</Text>
                </View>
                <ArrowRight size={16} color="#FCA5A5" />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              onPress={() => setShowSettingsModal(false)}
              className="mt-2 bg-gray-100 py-3.5 rounded-xl w-full"
              activeOpacity={0.8}
            >
              <Text className="text-gray-800 text-center font-bold text-sm">
                Close
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showLogoutModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowLogoutModal(false)}
      >
        <View className="flex-1 justify-center items-center bg-black/50 px-6">
          <View className="bg-white rounded-3xl p-6 w-full max-w-sm">
            <View className="items-center mb-4">
              <View className="w-14 h-14 rounded-full bg-blue-100 items-center justify-center mb-3">
                <Ionicons name="help-circle" size={32} color="#2F80ED" />
              </View>
              <Text className="text-xl font-bold text-gray-900 text-center">
                Confirm Logout
              </Text>
            </View>
            <Text className="text-base text-gray-600 text-center mb-6">
              Are you sure you want to log out?
            </Text>
            <View className="flex-row justify-around">
              <TouchableOpacity
                onPress={() => setShowLogoutModal(false)}
                className="bg-gray-200 py-3.5 rounded-xl flex-1 mx-2"
                activeOpacity={0.8}
              >
                <Text className="text-gray-800 text-center font-semibold text-base">
                  Cancel
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={confirmLogout}
                className="bg-red-500 py-3.5 rounded-xl flex-1 mx-2"
                activeOpacity={0.8}
              >
                <Text className="text-white text-center font-semibold text-base">
                  Logout
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      <WebHeader />
      <ProfileScreen
        user={displayUser}
        role="patient"
        onLogout={handleLogout}
        onDeleteAccount={handleDeleteAccount}
        onEditProfile={() => router.push("/(patient)/edit-profile" as any)}
        onEditLocation={() => {
          // Navigate to edit-location screen with current location data
          const locationData = displayUser as any; // Type assertion since location props come from patientDetails
          router.push({
            pathname: "/(patient)/edit-location" as any,
            params: {
              address: locationData?.address || "",
              barangay: locationData?.barangay || "",
              latitude: locationData?.latitude?.toString() || "",
              longitude: locationData?.longitude?.toString() || "",
            },
          });
        }}
        onSaveProfile={handleSaveProfile}
        onChangeProfilePicture={handleChangeProfilePicture}
        profilePictureUrl={profilePictureData?.profilePictureUrl}
      >
        <SafeAreaView className="flex-1 bg-teal-50 w-full max-w-screen-lg mx-auto">
          <View className="flex-1 px-[18px] pt-10">
            {/* Profile Header */}
            <View className="items-center justify-center mb-8">
              {shouldShowInitials ? (
                <View className="w-24 h-24 rounded-full bg-gray-200 justify-center items-center mb-4">
                  <Text className="text-3xl font-bold text-gray-700">
                    {getInitials(fullName)}
                  </Text>
                </View>
              ) : (
                <Image
                  source={avatarSource}
                  className="w-24 h-24 rounded-full mb-4"
                />
              )}
              <Text className="text-2xl font-bold text-black">
                {fullName || "John Doe"}
              </Text>
              <Text className="text-sm text-gray-500 mt-1">
                {displayUser?.email ?? "johndoe@gmail.com"}
              </Text>
            </View>

            {/* Action Tiles */}
            <View className="flex-row flex-wrap justify-between pb-10">
              <TouchableOpacity
                className="w-[48%] min-h-[180px] bg-white rounded-2xl border border-gray-100 p-5 mb-[14px] justify-between shadow-sm"
                activeOpacity={0.8}
                onPress={() => router.push("/(patient)/edit-profile" as any)}
              >
                <View>
                  <View className="mb-4 h-10 w-10 items-center justify-center rounded-lg bg-teal-50">
                    <User color="#0D9488" size={20} />
                  </View>
                  <Text className="text-lg font-bold text-gray-900 mb-1">
                    Edit Profile
                  </Text>
                  <Text className="text-gray-500 text-xs leading-relaxed">
                    Update your information
                  </Text>
                </View>
                <View className="items-end">
                  <ArrowRight size={18} color="#D1D5DB" />
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                className="w-[48%] min-h-[180px] bg-red-50 rounded-2xl border border-red-100 p-5 mb-[14px] justify-between shadow-sm"
                activeOpacity={0.8}
                onPress={handleLogout}
              >
                <View>
                  <View className="mb-4 h-10 w-10 items-center justify-center rounded-lg bg-red-100">
                    <LogOut color="#EF4444" size={20} />
                  </View>
                  <Text className="text-lg font-bold text-red-600 mb-1">
                    Logout
                  </Text>
                  <Text className="text-red-400 text-xs leading-relaxed">
                    Sign out of account
                  </Text>
                </View>
                <View className="items-end">
                  <ArrowRight size={18} color="#FCA5A5" />
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                className="w-[48%] min-h-[180px] bg-teal-50 rounded-2xl border border-teal-100 p-5 mb-[14px] justify-between shadow-sm"
                activeOpacity={0.8}
                onPress={() => setShowSettingsModal(true)}
              >
                <View>
                  <View className="mb-4 h-10 w-10 items-center justify-center rounded-lg bg-teal-100/50">
                    <Settings color="#0D9488" size={20} />
                  </View>
                  <Text className="text-lg font-bold text-gray-900 mb-1">
                    Settings & Privacy
                  </Text>
                  <Text className="text-gray-500 text-xs leading-relaxed">
                    Privacy, deletion & policies
                  </Text>
                </View>
                <View className="items-end">
                  <ArrowRight size={18} color="#D1D5DB" />
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                className="w-[48%] min-h-[180px] bg-blue-50 rounded-2xl border border-blue-100 p-5 mb-[14px] justify-between shadow-sm"
                activeOpacity={0.8}
                onPress={() => router.push("/community-guidelines" as any)}
              >
                <View>
                  <View className="mb-4 h-10 w-10 items-center justify-center rounded-lg bg-blue-100">
                    <Shield color="#3B82F6" size={20} />
                  </View>
                  <Text className="text-lg font-bold text-blue-600 mb-1">
                    Guidelines
                  </Text>
                  <Text className="text-blue-400 text-xs leading-relaxed">
                    Community rules & policies
                  </Text>
                </View>
                <View className="items-end">
                  <ArrowRight size={18} color="#93C5FD" />
                </View>
              </TouchableOpacity>
            </View>
          </View>
        </SafeAreaView>
      </ProfileScreen>
    </View>
  );
}

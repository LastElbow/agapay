import apiClient from "@/api/client";
import { buildUpdateTherapistProfileBody } from "@/src/features/profile/core/requestBodies";
import { useAuth } from "@/src/providers/AuthProvider";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRole } from "@/src/providers/RoleProvider";
import {
  deleteItem as ssDelete,
  getItem as ssGet,
  setItem as ssSet,
} from "@/src/utils/safeSecureStore";
import * as FileSystem from "expo-file-system/legacy";
import { useRouter } from "expo-router";
import { LogOut, User, Users, ArrowRight, Shield, Trash2, Settings } from "lucide-react-native";
import React, { useEffect, useState, useMemo } from "react";
import {
  Image,
  Platform,
  Text,
  TouchableOpacity,
  View,
  Modal,
  Alert,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import {
  fetchTherapistRatings,
  therapistRatingsQueryKey,
} from "@/src/services/ratings";
import { useTherapistStatus } from "@/src/hooks/useTherapistStatus";
import useRatingsRealtime from "@/src/hooks/useRatingsRealtime";
import ProfileScreen from "@/src/components/ProfileScreen";
import WebHeader from "@/src/components/WebHeader";

function getInitials(name?: string) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function TherapistProfileTab() {
  const router = useRouter();
  const { user: authUser, signOut } = useAuth();
  const { clearRole } = useRole();
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const therapistStatus = useTherapistStatus();
  const { isVerified, onboardingComplete } = therapistStatus;

  const [user, setUser] = useState<{
    firstName?: string;
    lastName?: string;
    name?: string;
    email?: string;
    avatar?: any;
    dateOfBirth?: string;
    gender?: string;
    phoneNumber?: string;
    address?: string;
    barangay?: string;
    latitude?: number;
    longitude?: number;
  } | null>(null);

  const [profilePictureUrl, setProfilePictureUrl] = useState<string | null>(
    null,
  );

  const queryClient = useQueryClient();
  const canAccessCoreFeatures = isVerified && onboardingComplete;

  // Enable real-time ratings updates
  useRatingsRealtime();

  // Fetch therapist details for profile
  const { data: profileDetails, refetch: refetchProfile } = useQuery({
    queryKey: ["therapistProfileDetails"],
    queryFn: async () => {
      const res = await apiClient.get("/api/Therapist/me/details");
      return res.data;
    },
    enabled: !!authUser,
  });

  // Fetch therapist ratings
  const { data: ratingsData = [], isLoading: ratingsLoading } = useQuery({
    queryKey: therapistRatingsQueryKey,
    queryFn: fetchTherapistRatings,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    enabled: canAccessCoreFeatures,
  });

  // Calculate average rating
  const averageRating = useMemo(() => {
    if (ratingsData.length === 0) return 0;
    const sum = ratingsData.reduce((acc, rating) => acc + rating.score, 0);
    return sum / ratingsData.length;
  }, [ratingsData]);

  useEffect(() => {
    if (authUser) {
      setUser((prev) => {
        const next = {
          ...(prev ?? {}),
          firstName:
            authUser.firstName ??
            authUser.givenName ??
            authUser.name ??
            prev?.firstName,
          lastName: authUser.lastName ?? authUser.familyName ?? prev?.lastName,
          email: authUser.email ?? prev?.email,
          phoneNumber: (authUser as any).phoneNumber ?? prev?.phoneNumber,
        };
        const avatarCandidate =
          prev?.avatar ??
          authUser.avatar ??
          (authUser as any)?.profilePicture ??
          (authUser as any)?.profilePictureUrl ??
          null;
        if (avatarCandidate) {
          next.avatar = avatarCandidate;
        }
        return next;
      });
    } else {
      setUser(
        (prev) =>
          prev ?? {
            firstName: "John",
            lastName: "Doe",
            email: "johndoe@gmail.com",
            avatar: require("@/assets/images/react-logo.png"),
          },
      );
    }
  }, [authUser]);

  useEffect(() => {
    if (profileDetails) {
      setUser((prev) => ({
        ...prev,
        firstName: profileDetails.firstName ?? prev?.firstName,
        lastName: profileDetails.lastName ?? prev?.lastName,
        dateOfBirth: profileDetails.dateOfBirth,
        gender: profileDetails.gender,
        phoneNumber: (profileDetails as any).phoneNumber ?? prev?.phoneNumber,
        address: profileDetails.address ?? prev?.address,
        barangay: profileDetails.barangay ?? prev?.barangay,
        latitude: profileDetails.latitude ?? prev?.latitude,
        longitude: profileDetails.longitude ?? prev?.longitude,
      }));
    }
  }, [profileDetails]);

  // Resolve avatar source (supports require asset, local file, remote URL)
  const resolveAvatarSource = (avatar: any) => {
    if (!avatar) return require("@/assets/images/react-logo.png");
    if (typeof avatar === "number") return avatar;

    const str = String(avatar ?? "");
    if (str.startsWith("http://") || str.startsWith("https://"))
      return { uri: str };
    if (str.startsWith("file://") || str.startsWith("content://"))
      return { uri: str };
    if (str.startsWith("/")) return { uri: str };
    return require("@/assets/images/react-logo.png");
  };

  const fullName =
    [user?.firstName || user?.name, user?.lastName]
      .filter(Boolean)
      .map((n) => n?.trim())
      .filter(Boolean)
      .join(" ") || "John";
  const shouldShowInitials =
    resolveAvatarSource(user?.avatar) ===
    require("@/assets/images/react-logo.png");

  // Fetch and cache therapist photo similar to TherapistHome
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const isWeb = Platform.OS === "web";
        const cacheRaw = await ssGet("therapistPhotoCache");
        if (cacheRaw) {
          const cache = JSON.parse(cacheRaw);
          if (cache?.localUri && cache?.ts) {
            const age = Date.now() - cache.ts;
            try {
              if (!isWeb) {
                const info = await FileSystem.getInfoAsync(cache.localUri);
                if (info.exists && age < 24 * 60 * 60 * 1000) {
                  if (!cancelled)
                    setUser((u) => ({ ...(u ?? {}), avatar: cache.localUri }));
                  return;
                }
              }
            } catch {
              // continue to fetch
            }
          }
          if (cache?.remoteUrl && isWeb) {
            if (!cancelled)
              setUser((u) => ({ ...(u ?? {}), avatar: cache.remoteUrl }));
            return;
          }
        }

        const resp = await apiClient.get("/api/Therapist/me/photo");
        const remoteUrl = resp?.data?.profilePicture;
        if (!remoteUrl) return;

        const filename =
          remoteUrl.split("/").pop()?.split("?")[0] ??
          `therapist-${Date.now()}.jpg`;
        const localPath = `${
          FileSystem.cacheDirectory ?? ""
        }therapist-${filename}`;

        try {
          if (Platform.OS === "web") {
            const cacheObj = { localUri: null, remoteUrl, ts: Date.now() };
            await ssSet("therapistPhotoCache", JSON.stringify(cacheObj));
            if (!cancelled) {
              setUser((u) => ({ ...(u ?? {}), avatar: remoteUrl }));
              setProfilePictureUrl(remoteUrl);
            }
          } else {
            const info = await FileSystem.getInfoAsync(localPath);
            if (!info.exists) {
              await FileSystem.downloadAsync(remoteUrl, localPath);
            }
            const cacheObj = { localUri: localPath, remoteUrl, ts: Date.now() };
            await ssSet("therapistPhotoCache", JSON.stringify(cacheObj));
            if (!cancelled) {
              setUser((u) => ({ ...(u ?? {}), avatar: localPath }));
              setProfilePictureUrl(remoteUrl);
            }
          }
        } catch (err) {
          console.warn(
            "Failed to download therapist photo in profile tab",
            err,
          );
          await ssSet(
            "therapistPhotoCache",
            JSON.stringify({ localUri: null, remoteUrl, ts: Date.now() }),
          );
          if (!cancelled) {
            setUser((u) => ({ ...(u ?? {}), avatar: remoteUrl }));
            setProfilePictureUrl(remoteUrl);
          }
        }
      } catch (err) {
        console.warn("Error fetching therapist photo in profile tab", err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleSaveProfile = async (data: any) => {
    console.log("[TherapistProfile] handleSaveProfile called with:", data);
    try {
      if (!profileDetails) {
        console.log("[TherapistProfile] No profileDetails available");
        Alert.alert("Error", "Profile data not loaded yet.");
        throw new Error("Profile data not loaded yet.");
      }

      const payload = buildUpdateTherapistProfileBody({
        ...profileDetails,
        firstName: data.firstName,
        lastName: data.lastName,
        dateOfBirth: data.dateOfBirth,
        gender: data.gender,
      });

      console.log("[TherapistProfile] Sending payload to API:", payload);

      console.log(
        "[TherapistProfile] Final payload after processing:",
        payload,
      );
      await apiClient.put("/api/Therapist/me", payload);

      // Optimistically update cached details to avoid UI snapping back to stale values.
      queryClient.setQueryData(["therapistProfileDetails"], (prev: any) => ({
        ...(prev ?? {}),
        firstName: data.firstName,
        lastName: data.lastName,
        dateOfBirth: data.dateOfBirth,
        gender: data.gender,
      }));

      console.log("[TherapistProfile] Save successful!");
      Alert.alert("Success", "Profile updated successfully");
      refetchProfile();
      queryClient.invalidateQueries({ queryKey: ["therapistProfile"] });
      queryClient.invalidateQueries({ queryKey: ["therapistProfileDetails"] });
    } catch (error: any) {
      console.error("[TherapistProfile] Failed to save profile", error);
      Alert.alert(
        "Error",
        error?.response?.data?.message || "Failed to save profile",
      );
      throw error; // Re-throw so ProfileScreen knows the save failed
    }
  };

  const handleChangeProfilePicture = async (imageUri: string) => {
    console.log(
      "[TherapistProfile] handleChangeProfilePicture called with:",
      imageUri,
    );
    try {
      const formData = new FormData();

      // Extract filename from URI
      const uriParts = imageUri.split("/");
      const filename = uriParts[uriParts.length - 1];

      // Determine file type
      let fileType = "image/jpeg";
      if (filename.toLowerCase().endsWith(".png")) {
        fileType = "image/png";
      } else if (filename.toLowerCase().endsWith(".webp")) {
        fileType = "image/webp";
      } else if (filename.toLowerCase().endsWith(".gif")) {
        fileType = "image/gif";
      }

      // Handle file differently for web vs mobile
      if (Platform.OS === "web") {
        // On web, fetch the imageUri as a blob and convert to File
        const response = await fetch(imageUri);
        const blob = await response.blob();
        const file = new File([blob], filename || "profile.jpg", {
          type: fileType,
        });
        formData.append("profilePicture", file);
      } else {
        // On mobile, use the URI-based approach
        formData.append("profilePicture", {
          uri: imageUri,
          name: filename || "profile.jpg",
          type: fileType,
        } as any);
      }

      console.log("[TherapistProfile] Uploading profile picture...");
      const response = await apiClient.post(
        "/api/Therapist/profile-picture",
        formData,
        {
          headers: {
            "Content-Type": "multipart/form-data",
          },
        },
      );

      console.log("[TherapistProfile] Upload successful:", response.data);
      Alert.alert("Success", "Profile picture updated successfully");

      // Clear the therapist photo cache to force refetch
      await ssDelete("therapistPhotoCache");

      // Invalidate queries to refetch profile data
      queryClient.invalidateQueries({ queryKey: ["therapistProfileDetails"] });
      queryClient.invalidateQueries({ queryKey: ["therapistProfile"] });

      // Refetch profile to get the new URL
      refetchProfile();
    } catch (error: any) {
      console.error(
        "[TherapistProfile] Failed to upload profile picture",
        error,
      );
      throw error; // Re-throw to let ProfileScreen handle the error display
    }
  };

  const confirmLogout = async () => {
    try {
      setShowLogoutModal(false);
      // Clear role FIRST to prevent AuthGate from redirecting based on stale role
      clearRole();

      // Use centralized signOut to clear session state and persisted tokens
      if (typeof signOut === "function") {
        await signOut();
      } else {
        // Fallback: best-effort clear of stored keys if signOut not available
        try {
          await ssDelete("accessToken");
          await ssDelete("refreshToken");
          await ssDelete("user");
        } catch (e) {
          console.warn("Fallback SecureStore clear failed", e);
        }
      }

      queryClient.clear();

      // Also clear cached therapist photo metadata
      try {
        await ssDelete("therapistPhotoCache");
      } catch {}

      // Navigate after clearing auth state
      router.replace("/(auth)/signin");
    } catch (error) {
      console.error("Logout error:", error);
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
        try {
          await ssDelete("therapistPhotoCache");
        } catch {}
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
        "Confirm Account Deletion\n\nAre you sure you want to delete your account? This will permanently erase your personal data, professional details, and location information. This action cannot be undone."
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
        "Are you sure you want to delete your account? This will permanently erase your personal data, professional details, and location information. This action cannot be undone.",
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

  // Debug: Log specializations and conditions data
  console.log("[TherapistProfile] profileDetails:", {
    hasProfileDetails: !!profileDetails,
    specializations: profileDetails?.specializations,
    conditions: profileDetails?.conditions,
    specializationsLength: profileDetails?.specializations?.length,
    conditionsLength: profileDetails?.conditions?.length,
  });

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
        user={user}
        role="therapist"
        onLogout={handleLogout}
        onDeleteAccount={handleDeleteAccount}
        onEditProfile={() => router.push("/(therapist)/edit-therapist-profile" as any)}
        onEditServiceArea={() =>
          router.push("/(therapist)/edit-service-area" as any)
        }
        onSaveProfile={handleSaveProfile}
        onChangeProfilePicture={handleChangeProfilePicture}
        specializations={profileDetails?.specializations || []}
        conditions={profileDetails?.conditions || []}
        serviceAreas={profileDetails?.serviceAreas || []}
        averageRating={averageRating}
        totalReviews={ratingsData.length}
        profilePictureUrl={profilePictureUrl}
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
                  source={resolveAvatarSource(user?.avatar)}
                  className="w-24 h-24 rounded-full mb-4"
                />
              )}
              <Text className="text-2xl font-bold text-black text-center">
                {fullName || "Therapist"}
              </Text>
              <Text className="text-sm text-gray-500 mt-1">
                {user?.email ?? ""}
              </Text>
            </View>

            {/* Action Tiles */}
            <View className="flex-row flex-wrap justify-between pb-10">
              <TouchableOpacity
                className="w-[48%] min-h-[180px] bg-white rounded-2xl border border-gray-100 p-5 mb-[14px] justify-between shadow-sm"
                activeOpacity={0.8}
                onPress={() => router.push("/(therapist)/edit-therapist-profile" as any)}
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
                className="w-[48%] min-h-[180px] bg-white rounded-2xl border border-gray-100 p-5 mb-[14px] justify-between shadow-sm"
                activeOpacity={0.8}
                onPress={() => router.push("/(therapist)/colleagues" as any)}
              >
                <View>
                  <View className="mb-4 h-10 w-10 items-center justify-center rounded-lg bg-teal-50">
                    <Users color="#0D9488" size={20} />
                  </View>
                  <Text className="text-lg font-bold text-gray-900 mb-1">
                    Colleagues
                  </Text>
                  <Text className="text-gray-500 text-xs leading-relaxed">
                    Manage your network
                  </Text>
                </View>
                <View className="items-end">
                  <ArrowRight size={18} color="#D1D5DB" />
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
            </View>
          </View>
        </SafeAreaView>
      </ProfileScreen>
    </View>
  );
}

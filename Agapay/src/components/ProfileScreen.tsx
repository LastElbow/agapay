import React, { useState, useMemo, useEffect } from "react";
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  useWindowDimensions,
  TextInput,
  ActivityIndicator,
  ScrollView,
  Modal,
  Pressable,
  Alert,
  Platform,
} from "react-native";
import { Camera, Mail, Calendar, MapPin, Briefcase, Heart, Pencil, ChevronDown, Star, Check, X } from "lucide-react-native";
import { resolveAvatarSource } from "@/src/utils/avatar";
import * as ImagePicker from "expo-image-picker";
import apiClient from "@/api/client";
import { useQueryClient } from "@tanstack/react-query";

// Types for specializations and conditions
interface Specialization {
  id: number;
  name: string;
}

interface Condition {
  id: number;
  name: string;
  specializationId?: number;
}

interface ServiceArea {
  id: number;
  name: string;
}

// Define types for props
interface ProfileScreenProps {
  user: any;
  role: "patient" | "therapist";
  onLogout: () => void;
  onEditProfile: () => void;
  onEditLocation?: () => void;
  onEditServiceArea?: () => void;
  onSaveProfile?: (data: any) => Promise<void>;
  onChangeProfilePicture?: (imageUri: string) => Promise<void>;
  children?: React.ReactNode; // For mobile layout fallback or additional content
  specializations?: Specialization[];
  conditions?: Condition[];
  serviceAreas?: ServiceArea[];
  // Rating data for therapists
  averageRating?: number;
  totalReviews?: number;
  // Current profile picture URL (for display after upload)
  profilePictureUrl?: string | null;
  onDeleteAccount?: () => void;
}

function getInitials(name?: string) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function ProfileScreen({
  user,
  role,
  onLogout,
  onEditProfile,
  onEditLocation,
  onEditServiceArea,
  onSaveProfile,
  onChangeProfilePicture,
  children,
  specializations = [],
  conditions = [],
  serviceAreas = [],
  averageRating = 0,
  totalReviews = 0,
  profilePictureUrl,
  onDeleteAccount,
}: ProfileScreenProps) {
  const { width } = useWindowDimensions();
  const isDesktop = width >= 768;

  const queryClient = useQueryClient();

  // Desktop Specialization & Conditions Modal States
  const [showSpecsModal, setShowSpecsModal] = useState(false);
  const [tempSelectedSpecIds, setTempSelectedSpecIds] = useState<number[]>([]);
  const [tempSelectedConditionIds, setTempSelectedConditionIds] = useState<number[]>([]);
  const [allSpecializations, setAllSpecializations] = useState<Specialization[]>([]);
  const [tempConditionsGrouped, setTempConditionsGrouped] = useState<any[]>([]);
  const [loadingTempConditions, setLoadingTempConditions] = useState(false);
  const [savingSpecs, setSavingSpecs] = useState(false);
  const [showUnsavedAlert, setShowUnsavedAlert] = useState(false);

  // Fetch all available specializations when role is therapist on desktop web
  useEffect(() => {
    if (role === "therapist" && isDesktop) {
      apiClient
        .get("/api/Onboarding/specializations")
        .then((res) => {
          setAllSpecializations(res.data || []);
        })
        .catch((err) => {
          console.warn("[ProfileScreen] Failed to fetch specializations", err);
        });
    }
  }, [role, isDesktop]);

  // Pre-populate temp selections when modal opens
  useEffect(() => {
    if (showSpecsModal) {
      setTempSelectedSpecIds(specializations.map((s) => s.id));
      setTempSelectedConditionIds(conditions.map((c) => c.id));
    }
  }, [showSpecsModal, specializations, conditions]);

  // Dynamically load conditions grouped based on tempSelectedSpecIds in modal
  useEffect(() => {
    if (!showSpecsModal) return;

    if (tempSelectedSpecIds.length === 0) {
      setTempConditionsGrouped([]);
      return;
    }

    let mounted = true;
    setLoadingTempConditions(true);

    const queryParams = tempSelectedSpecIds.map((id) => `specializationIds=${id}`).join("&");
    const url = `/api/Onboarding/conditions-grouped?${queryParams}`;

    apiClient
      .get(url)
      .then((res) => {
        if (!mounted) return;
        setTempConditionsGrouped(res.data || []);
      })
      .catch((err) => {
        console.warn("[ProfileScreen] Failed to fetch conditions grouped", err);
      })
      .finally(() => {
        if (mounted) setLoadingTempConditions(false);
      });

    return () => {
      mounted = false;
    };
  }, [tempSelectedSpecIds, showSpecsModal]);

  // Auto-select/filter conditions when grouped conditions change
  useEffect(() => {
    if (showSpecsModal && tempConditionsGrouped.length > 0) {
      const activeConditionIds = new Set<number>();
      tempConditionsGrouped.forEach((group) => {
        if (Array.isArray(group.items)) {
          group.items.forEach((item: any) => {
            activeConditionIds.add(item.id);
          });
        }
      });

      setTempSelectedConditionIds((prev) => {
        const next = new Set<number>();

        // Keep active previously selected ones in modal
        prev.forEach((id) => {
          if (activeConditionIds.has(id)) {
            next.add(id);
          }
        });

        // Auto-select any originally owned conditions that are now active
        const originalConditionIds = conditions.map((c) => c.id);
        originalConditionIds.forEach((id) => {
          if (activeConditionIds.has(id)) {
            next.add(id);
          }
        });

        return Array.from(next);
      });
    }
  }, [tempConditionsGrouped, showSpecsModal, conditions]);

  const hasUnsavedSpecsChanges = useMemo(() => {
    const originalSpecIds = [...specializations.map((s) => s.id)].sort();
    const originalCondIds = [...conditions.map((c) => c.id)].sort();
    const tempSpecIdsSorted = [...tempSelectedSpecIds].sort();
    const tempCondIdsSorted = [...tempSelectedConditionIds].sort();

    return (
      JSON.stringify(originalSpecIds) !== JSON.stringify(tempSpecIdsSorted) ||
      JSON.stringify(originalCondIds) !== JSON.stringify(tempCondIdsSorted)
    );
  }, [specializations, conditions, tempSelectedSpecIds, tempSelectedConditionIds]);

  const handleCancelSpecsModal = () => {
    if (hasUnsavedSpecsChanges) {
      setShowUnsavedAlert(true);
    } else {
      setShowSpecsModal(false);
    }
  };

  const handleSaveSpecsAndConditions = async () => {
    setSavingSpecs(true);
    try {
      const payload = {
        specializationIds: tempSelectedSpecIds,
        conditionIds: tempSelectedConditionIds,
        serviceAreasIds: serviceAreas.map((s) => s.id), // Preserve current service areas
      };

      await apiClient.put("/api/Therapist/me", payload);

      // Invalidate queries to trigger an immediate cache refresh
      queryClient.invalidateQueries({ queryKey: ["therapistProfileDetails"] });
      queryClient.invalidateQueries({ queryKey: ["therapistProfile"] });

      setShowSpecsModal(false);
      Alert.alert("Success", "Specializations & Conditions updated successfully");
    } catch (error: any) {
      console.error("[ProfileScreen] Failed to save specializations & conditions", error);
      Alert.alert("Error", error?.response?.data?.message || "Failed to save changes");
    } finally {
      setSavingSpecs(false);
    }
  };

  const toggleTempSpec = (id: number) => {
    setTempSelectedSpecIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const toggleTempCondition = (id: number) => {
    setTempSelectedConditionIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  // Debug log
  console.log('[ProfileScreen] role:', role, 'specializations:', specializations?.length, 'conditions:', conditions?.length, 'onDeleteAccount:', typeof onDeleteAccount);

  // State for Personal Info form
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [gender, setGender] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [showGenderDropdown, setShowGenderDropdown] = useState(false);
  const [isUploadingPicture, setIsUploadingPicture] = useState(false);
  const [localImageUri, setLocalImageUri] = useState<string | null>(null);
  const [showScrollIndicator, setShowScrollIndicator] = useState(true);

  const genderOptions = ["Male", "Female"];

  // State for Location (display only)
  const [address, setAddress] = useState("");
  const [barangayName, setBarangayName] = useState("");
  const [latitude, setLatitude] = useState(0);
  const [longitude, setLongitude] = useState(0);

  const sortedServiceAreas = useMemo(() => {
    return [...serviceAreas].sort((a, b) => {
      const nameA = a?.name ?? "";
      const nameB = b?.name ?? "";
      return nameA.localeCompare(nameB, undefined, { sensitivity: "base" });
    });
  }, [serviceAreas]);

  useEffect(() => {
    if (user) {
      setFirstName(user.firstName || user.name || "");
      setLastName(user.lastName || "");
      setEmail(user.email || "");

      // Format DOB if needed
      let dob = user.dateOfBirth || user.DateOfBirth || "";
      if (dob && dob.includes("T")) {
        dob = dob.split("T")[0];
      }
      setDateOfBirth(dob);

      setGender(user.gender || user.Gender || "");

      // Location data
      setAddress(user.address || user.Address || "");
      setBarangayName(user.barangay || user.Barangay || "");
      if (user.latitude || user.Latitude) {
        setLatitude(parseFloat(user.latitude || user.Latitude) || 0);
      }
      if (user.longitude || user.Longitude) {
        setLongitude(parseFloat(user.longitude || user.Longitude) || 0);
      }
    }
  }, [user]);

  // Profile picture picker
  const pickProfileImage = async () => {
    if (!onChangeProfilePicture) {
      console.log('[ProfileScreen] No onChangeProfilePicture callback provided');
      return;
    }

    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(
          "Permission required",
          "Permission to access photos is required to change your profile picture."
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      let uri: string | undefined;
      if (result && typeof result === "object") {
        if ("canceled" in result) {
          if (!result.canceled && Array.isArray(result.assets) && result.assets.length > 0) {
            uri = result.assets[0].uri;
          }
        } else {
          // Fallback for older SDK shape
          if (!(result as any).cancelled && (result as any).uri) {
            uri = (result as any).uri;
          }
        }
      }

      if (uri) {
        setLocalImageUri(uri);
        setIsUploadingPicture(true);
        try {
          await onChangeProfilePicture(uri);
        } catch (error) {
          console.error('[ProfileScreen] Failed to upload profile picture', error);
          Alert.alert("Error", "Failed to upload profile picture. Please try again.");
          setLocalImageUri(null); // Reset on error
        } finally {
          setIsUploadingPicture(false);
        }
      }
    } catch (err) {
      console.warn('[ProfileScreen] Image pick error', err);
    }
  };

  const handleSave = async () => {
    console.log('[ProfileScreen] handleSave called, onSaveProfile:', !!onSaveProfile);
    setShowGenderDropdown(false);
    if (!onSaveProfile) {
      console.log('[ProfileScreen] No onSaveProfile callback, exiting edit mode anyway');
      setIsEditing(false);
      return;
    }
    setIsSaving(true);
    try {
      console.log('[ProfileScreen] Calling onSaveProfile with:', { firstName, lastName, email, dateOfBirth, gender });
      await onSaveProfile({
        firstName,
        lastName,
        email,
        dateOfBirth,
        gender,
      });
      console.log('[ProfileScreen] Save successful, setting isEditing to false');
      setIsEditing(false);
    } catch (error) {
      console.error("[ProfileScreen] Failed to save profile", error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancelEdit = () => {
    setShowGenderDropdown(false);
    // Reset to original values
    if (user) {
      setFirstName(user.firstName || user.name || "");
      setLastName(user.lastName || "");
      setEmail(user.email || "");
      let dob = user.dateOfBirth || user.DateOfBirth || "";
      if (dob && dob.includes("T")) {
        dob = dob.split("T")[0];
      }
      setDateOfBirth(dob);
      setGender(user.gender || user.Gender || "");
    }
    setIsEditing(false);
  };

  // Determine avatar source - prioritize local image, then profilePictureUrl prop, then user avatar
  const avatarSource = useMemo(() => {
    if (localImageUri) {
      return { uri: localImageUri };
    }
    if (profilePictureUrl) {
      return { uri: profilePictureUrl };
    }
    return resolveAvatarSource(
      user?.avatar,
      require("@/assets/images/react-logo.png")
    );
  }, [user, localImageUri, profilePictureUrl]);

  const fullName =
    [user?.firstName || user?.name, user?.lastName]
      .filter(Boolean)
      .map((n) => n?.trim())
      .filter(Boolean)
      .join(" ") || "User";

  const shouldShowInitials =
    !localImageUri && !profilePictureUrl && avatarSource === require("@/assets/images/react-logo.png");

  if (!isDesktop) {
    return <>{children}</>;
  }

  return (
    <View className="flex-1 flex-row bg-white h-full max-w-5xl mx-auto w-full my-8 rounded-3xl overflow-hidden shadow-sm border border-teal-100">
      {/* Profile Sidebar */}
      <View className="w-72 bg-gray-50 border-r border-gray-100 p-6">
        <View className="items-center">
          <View className="relative mb-4">
            {shouldShowInitials ? (
              <View className="w-20 h-20 rounded-full bg-teal-50 items-center justify-center border-4 border-white shadow-sm">
                <Text className="text-2xl font-bold text-teal-700">
                  {getInitials(fullName)}
                </Text>
              </View>
            ) : (
              <Image
                source={avatarSource}
                className="w-20 h-20 rounded-full border-4 border-white shadow-sm"
              />
            )}
            {isUploadingPicture && (
              <View className="absolute inset-0 w-20 h-20 rounded-full bg-black/40 items-center justify-center">
                <ActivityIndicator color="white" size="small" />
              </View>
            )}
            <TouchableOpacity
              onPress={pickProfileImage}
              disabled={isUploadingPicture || !onChangeProfilePicture}
              className="absolute bottom-0 right-0 bg-white p-1.5 rounded-full shadow-sm border border-gray-100"
              activeOpacity={0.7}
              style={{ opacity: onChangeProfilePicture ? 1 : 0.5 }}
            >
              <Camera size={12} color="#6B7280" />
            </TouchableOpacity>
          </View>
          <Text className="text-lg font-bold text-gray-900 text-center">
            {fullName}
          </Text>
          <Text className="text-sm text-gray-500 text-center mt-1">
            {user?.email}
          </Text>

          {/* Star Rating - Show for therapists with reviews */}
          {role === "therapist" && totalReviews > 0 && (
            <View className="flex-row items-center mt-3">
              <View className="flex-row items-center mr-1.5">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star
                    key={i}
                    size={14}
                    color={i < Math.round(averageRating) ? "#FBBF24" : "#D1D5DB"}
                    fill={i < Math.round(averageRating) ? "#FBBF24" : "transparent"}
                  />
                ))}
              </View>
              <Text className="text-xs font-semibold text-gray-700">
                {averageRating.toFixed(1)}
              </Text>
              <Text className="text-xs text-gray-400 ml-1">
                ({totalReviews})
              </Text>
            </View>
          )}
          {role === "therapist" && totalReviews === 0 && (
            <Text className="text-xs text-gray-400 mt-2">No reviews yet</Text>
          )}
        </View>
      </View>

      {/* Main Content Area */}
      <View className="flex-1 relative">
        <ScrollView
          className="flex-1 bg-white"
          contentContainerStyle={{ padding: 32, paddingBottom: 80 }}
          showsVerticalScrollIndicator={true}
          onScroll={(event) => {
            const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
            const isNearBottom = layoutMeasurement.height + contentOffset.y >= contentSize.height - 100;
            setShowScrollIndicator(!isNearBottom);
          }}
          scrollEventThrottle={16}
        >
          {
            <View className="max-w-3xl">
              <View className="mb-8 flex-row justify-between items-start">
                <View>
                  <Text className="text-2xl font-bold text-gray-900 mb-2">
                    Personal Information
                  </Text>
                  <Text className="text-gray-500">
                    {isEditing ? "Edit your personal details below." : "Your personal details."}
                  </Text>
                </View>
                {isEditing ? (
                  <TouchableOpacity
                    onPress={handleCancelEdit}
                    className="flex-row items-center border border-gray-300 rounded-lg py-2 px-4"
                    activeOpacity={0.7}
                  >
                    <Text className="text-gray-600 font-semibold">
                      Cancel
                    </Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    onPress={() => setIsEditing(true)}
                    className="flex-row items-center border rounded-lg py-2 px-4"
                    style={{ borderColor: '#089769' }}
                    activeOpacity={0.7}
                  >
                    <Pencil size={16} color="#089769" />
                    <Text style={{ color: '#089769' }} className="font-semibold ml-2">
                      Edit
                    </Text>
                  </TouchableOpacity>
                )}
              </View>

              <View className="flex-row flex-wrap -mx-3">
                {/* First Name */}
                <View className="w-1/2 px-3 mb-6">
                  <Text className="text-sm font-semibold text-gray-700 mb-2">
                    First Name
                  </Text>
                  <TextInput
                    value={firstName}
                    onChangeText={setFirstName}
                    editable={isEditing}
                    className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-gray-900"
                    placeholder="First Name"
                  />
                </View>

                {/* Last Name */}
                <View className="w-1/2 px-3 mb-6">
                  <Text className="text-sm font-semibold text-gray-700 mb-2">
                    Last Name
                  </Text>
                  <TextInput
                    value={lastName}
                    onChangeText={setLastName}
                    editable={isEditing}
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-gray-900"
                    style={{ backgroundColor: isEditing ? '#FFFFFF' : '#F9FAFB' }}
                    placeholder="Last Name"
                  />
                </View>

                {/* Email Address */}
                <View className="w-1/2 px-3 mb-6">
                  <Text className="text-sm font-semibold text-gray-700 mb-2">
                    Email Address
                  </Text>
                  <View className="relative">
                    <View className="absolute left-4 top-3.5 z-10">
                      <Mail size={18} color="#9CA3AF" />
                    </View>
                    <TextInput
                      value={email}
                      onChangeText={setEmail}
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-11 pr-4 py-3 text-gray-900"
                      placeholder="Email Address"
                      keyboardType="email-address"
                      editable={false}
                    />
                  </View>
                </View>

                {/* Date of Birth */}
                <View className="w-1/2 px-3 mb-6">
                  <Text className="text-sm font-semibold text-gray-700 mb-2">
                    Date of Birth
                  </Text>
                  <View className="relative">
                    <TextInput
                      value={dateOfBirth}
                      onChangeText={setDateOfBirth}
                      editable={isEditing}
                      className="w-full border border-gray-200 rounded-xl px-4 py-3 text-gray-900"
                      style={{ backgroundColor: isEditing ? '#FFFFFF' : '#F9FAFB' }}
                      placeholder="YYYY-MM-DD"
                    />
                    <View className="absolute right-4 top-3.5 z-10">
                      <Calendar size={18} color="#9CA3AF" />
                    </View>
                  </View>
                </View>

                {/* Gender - Dropdown */}
                <View className="w-1/2 px-3 mb-6">
                  <Text className="text-sm font-semibold text-gray-700 mb-2">
                    Gender
                  </Text>
                  <View className="relative">
                    <TouchableOpacity
                      onPress={() => isEditing && setShowGenderDropdown(!showGenderDropdown)}
                      disabled={!isEditing}
                      className="w-full border border-gray-200 rounded-xl px-4 py-3 flex-row justify-between items-center"
                      style={{ backgroundColor: isEditing ? '#FFFFFF' : '#F9FAFB' }}
                      activeOpacity={isEditing ? 0.7 : 1}
                    >
                      <Text className={gender ? "text-gray-900" : "text-gray-400"}>
                        {gender || "Select Gender"}
                      </Text>
                      {isEditing && <ChevronDown size={18} color="#9CA3AF" />}
                    </TouchableOpacity>

                    {/* Dropdown Options */}
                    {showGenderDropdown && isEditing && (
                      <View className="absolute top-14 left-0 right-0 bg-white border border-gray-200 rounded-xl shadow-lg z-50 overflow-hidden">
                        {genderOptions.map((option) => (
                          <TouchableOpacity
                            key={option}
                            onPress={() => {
                              setGender(option);
                              setShowGenderDropdown(false);
                            }}
                            className={`px-4 py-3 border-b border-gray-100 ${gender === option ? 'bg-teal-50' : ''}`}
                          >
                            <Text className={`${gender === option ? 'text-teal-700 font-semibold' : 'text-gray-900'}`}>
                              {option}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}
                  </View>
                </View>
              </View>

              {/* Save Personal Info Button - Only show when editing */}
              {isEditing && (
                <View className="flex-row justify-end mt-2 mb-8">
                  <TouchableOpacity
                    onPress={handleSave}
                    disabled={isSaving}
                    style={{ backgroundColor: '#089769' }}
                    className="py-3 px-8 rounded-xl"
                  >
                    {isSaving ? (
                      <ActivityIndicator color="white" />
                    ) : (
                      <Text className="text-white font-bold text-base">
                        Save Changes
                      </Text>
                    )}
                  </TouchableOpacity>
                </View>
              )}

              {/* Specializations & Conditions Section - Show for therapists */}
              {role === "therapist" ? (
                <View className="pt-6 border-t border-gray-200 mb-8">
                  <View className="mb-4">
                    <View className="flex-row items-center mb-2">
                      <View className="w-10 h-10 rounded-full items-center justify-center mr-3" style={{ backgroundColor: '#E6F4F0' }}>
                        <Briefcase size={20} color="#089769" />
                      </View>
                      <View>
                        <Text className="text-lg font-bold text-gray-900">
                          Specializations & Conditions
                        </Text>
                        <Text className="text-sm text-gray-500">
                          Your areas of expertise and conditions you treat
                        </Text>
                      </View>
                    </View>
                  </View>

                  {/* Specializations List */}
                  {specializations && specializations.length > 0 ? (
                    <View className="mb-4">
                      <View className="flex-row flex-wrap gap-2">
                        {specializations.map((spec) => (
                          <View
                            key={spec.id}
                            className="px-3 py-1.5 rounded-full mr-2 mb-2"
                            style={{ backgroundColor: '#089769' }}
                          >
                            <Text className="text-white font-semibold text-sm">
                              {spec.name}
                            </Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  ) : (
                    <View className="bg-gray-50 rounded-2xl border border-gray-200 p-4 items-center mb-4">
                      <Text className="text-gray-500 text-center">
                        No specializations set yet
                      </Text>
                    </View>
                  )}

                  {/* Conditions List */}
                  {conditions && conditions.length > 0 && (
                    <View className="mb-4">
                      <Text className="text-sm font-semibold text-gray-700 mb-2">
                        Conditions Treated
                      </Text>
                      <View className="flex-row flex-wrap gap-2">
                        {conditions.map((condition) => (
                          <View
                            key={condition.id}
                            className="px-3 py-1.5 rounded-full border"
                            style={{ backgroundColor: '#E6F4F0', borderColor: '#089769' }}
                          >
                            <Text style={{ color: '#089769' }} className="text-sm font-medium">
                              {condition.name}
                            </Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  )}

                  {/* Edit Specializations Button */}
                  <TouchableOpacity
                    onPress={() => isDesktop ? setShowSpecsModal(true) : onEditProfile()}
                    className="flex-row items-center justify-center rounded-xl py-3 px-4"
                    style={{ backgroundColor: '#089769' }}
                    activeOpacity={0.7}
                  >
                    <Heart size={18} color="#FFFFFF" />
                    <Text className="text-white font-semibold ml-2">
                      Edit Specializations & Conditions
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : null}

              {/* Service Area Section - Show for therapists */}
              {role === "therapist" ? (
                <View className="pt-6 border-t border-gray-200">
                  <View className="mb-4">
                    <View className="flex-row items-center mb-2">
                      <View className="w-10 h-10 rounded-full items-center justify-center mr-3" style={{ backgroundColor: '#E6F4F0' }}>
                        <MapPin size={20} color="#089769" />
                      </View>
                      <View>
                        <Text className="text-lg font-bold text-gray-900">
                          Service Area
                        </Text>
                        <Text className="text-sm text-gray-500">
                          Barangays where you provide home-visit services
                        </Text>
                      </View>
                    </View>
                  </View>

                  {/* Service Areas List */}
                  {sortedServiceAreas && sortedServiceAreas.length > 0 ? (
                    <View className="mb-4">
                      <View className="flex-row flex-wrap gap-2">
                        {sortedServiceAreas.map((area) => (
                          <View
                            key={area.id}
                            className="px-3 py-1.5 rounded-full border"
                            style={{ backgroundColor: '#E6F4F0', borderColor: '#089769' }}
                          >
                            <Text style={{ color: '#089769' }} className="text-sm font-medium">
                              {area.name}
                            </Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  ) : (
                    <View className="bg-gray-50 rounded-2xl border border-gray-200 p-4 items-center mb-4">
                      <Text className="text-gray-500 text-center">
                        No service areas set yet
                      </Text>
                    </View>
                  )}

                  {/* Edit Service Area Button */}
                  <TouchableOpacity
                    onPress={onEditServiceArea}
                    className="flex-row items-center justify-center bg-white border border-teal-200 rounded-xl py-3 px-4"
                    activeOpacity={0.7}
                  >
                    <MapPin size={18} color="#0D9488" />
                    <Text className="text-teal-700 font-semibold ml-2">
                      Edit Service Area
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : (
                /* Location Section - Show for patients only */
                <View className="pt-6 border-t border-gray-200">
                  <View className="mb-4">
                    <Text className="text-lg font-bold text-gray-900 mb-1">
                      Location
                    </Text>
                    <Text className="text-sm text-gray-500">
                      Your address is used to match you with nearby therapists.
                    </Text>
                  </View>

                  <View className="bg-gray-50 rounded-2xl border border-gray-100 p-5">
                    <View className="flex-row items-start mb-4">
                      <View className="w-10 h-10 rounded-full bg-white items-center justify-center border border-gray-200 mr-4">
                        <MapPin size={20} color="#0D9488" />
                      </View>
                      <View className="flex-1">
                        <Text className="text-sm font-semibold text-gray-700 mb-1">
                          Address
                        </Text>
                        <Text className="text-base text-gray-900">
                          {address || "No address set"}
                        </Text>
                        {barangayName ? (
                          <Text className="text-sm text-gray-500 mt-1">
                            Barangay: {barangayName}
                          </Text>
                        ) : null}
                        {latitude && longitude && address ? (
                          <Text className="text-xs text-gray-400 mt-1">
                            Coordinates: {latitude.toFixed(4)},{" "}
                            {longitude.toFixed(4)}
                          </Text>
                        ) : null}
                      </View>
                    </View>

                    <TouchableOpacity
                      onPress={onEditLocation}
                      className="flex-row items-center justify-center bg-white border border-teal-200 rounded-xl py-3 px-4"
                      activeOpacity={0.7}
                    >
                      <MapPin size={18} color="#0D9488" />
                      <Text className="text-teal-700 font-semibold ml-2">
                        {address ? "Edit Location" : "Add Location"}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            {/* Desktop Delete Account Button */}
            {onDeleteAccount && (
              <View className="mt-8 border-t border-red-100 pt-6">
                <TouchableOpacity
                  onPress={onDeleteAccount}
                  className="py-3.5 px-6 rounded-xl border border-red-200 bg-red-50/20 self-start flex-row items-center"
                  activeOpacity={0.8}
                >
                  <Text className="text-red-500 font-semibold text-sm">
                    Delete Account
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
          }
        </ScrollView>

        {/* Scroll Indicator - Show when there's more content below */}
        {showScrollIndicator && (
          <View className="absolute bottom-0 left-0 right-0 pointer-events-none">
            <View className="absolute bottom-6 left-0 right-0 items-center">
              <View className="bg-white rounded-full px-4 py-2 shadow-lg border border-gray-300 flex-row items-center">
                <Text className="text-xs text-gray-600 mr-1 font-medium">Scroll for more</Text>
                <ChevronDown size={16} color="#6B7280" />
              </View>
            </View>
          </View>
        )}
      </View>

      {/* Desktop Specializations & Conditions Modal */}
      {isDesktop && (
        <Modal
          visible={showSpecsModal}
          transparent
          animationType="fade"
          onRequestClose={handleCancelSpecsModal}
        >
          <View className="flex-1 justify-center items-center bg-black/50 p-6">
            <View className="bg-white rounded-3xl w-full max-w-4xl max-h-[85%] overflow-hidden shadow-2xl flex-col border border-teal-100">
              {/* Header */}
              <View className="flex-row justify-between items-center px-6 py-5 border-b border-gray-100 bg-gray-50/50">
                <View>
                  <Text className="text-lg font-bold text-gray-900">
                    Edit Specializations & Conditions
                  </Text>
                  <Text className="text-xs text-gray-500 mt-0.5">
                    Customize your professional areas of expertise and conditions treated
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={handleCancelSpecsModal}
                  className="w-8 h-8 rounded-full bg-gray-100 items-center justify-center"
                >
                  <X size={18} color="#6B7280" />
                </TouchableOpacity>
              </View>

              {/* Two Column Content */}
              <View className="flex-1 flex-row overflow-hidden min-h-[400px]">
                {/* Left Column: Specializations Checklist */}
                <View className="w-1/3 border-r border-gray-100 p-6 bg-gray-50/30">
                  <Text className="text-xs font-bold text-gray-500 mb-4 uppercase tracking-wider">
                    Specializations
                  </Text>
                  <ScrollView showsVerticalScrollIndicator={false} className="flex-1">
                    {allSpecializations.length === 0 ? (
                      <View className="py-8 items-center justify-center">
                        <ActivityIndicator color="#089769" />
                      </View>
                    ) : (
                      allSpecializations.map((spec) => {
                        const isSelected = tempSelectedSpecIds.includes(spec.id);
                        return (
                          <TouchableOpacity
                            key={spec.id}
                            onPress={() => toggleTempSpec(spec.id)}
                            activeOpacity={0.7}
                            className={`mb-2.5 p-3.5 rounded-xl border flex-row items-center justify-between ${
                              isSelected
                                ? "bg-teal-50/60 border-teal-500"
                                : "bg-white border-gray-200"
                            }`}
                          >
                            <Text
                              className={`text-sm font-semibold flex-1 mr-2 ${
                                isSelected ? "text-teal-700" : "text-gray-700"
                              }`}
                            >
                              {spec.name}
                            </Text>
                            <View
                              className={`w-5 h-5 rounded-md border flex items-center justify-center ${
                                isSelected ? "bg-teal-600 border-teal-600" : "border-gray-300"
                              }`}
                            >
                              {isSelected && <Check size={12} color="white" />}
                            </View>
                          </TouchableOpacity>
                        );
                      })
                    )}
                  </ScrollView>
                </View>

                {/* Right Column: Grouped Conditions Checklist */}
                <View className="flex-1 p-6">
                  <Text className="text-xs font-bold text-gray-500 mb-4 uppercase tracking-wider">
                    Conditions Treated
                  </Text>
                  
                  {loadingTempConditions ? (
                    <View className="flex-1 justify-center items-center">
                      <ActivityIndicator size="large" color="#089769" />
                      <Text className="text-sm text-gray-400 mt-3 font-medium">
                        Loading related conditions...
                      </Text>
                    </View>
                  ) : tempSelectedSpecIds.length === 0 ? (
                    <View className="flex-1 justify-center items-center border-2 border-dashed border-gray-200 rounded-2xl p-6 bg-gray-50/50">
                      <Briefcase size={40} color="#9CA3AF" />
                      <Text className="text-base font-semibold text-gray-800 mt-4 text-center">
                        Select Specializations First
                      </Text>
                      <Text className="text-sm text-gray-400 text-center mt-1.5 max-w-xs leading-relaxed">
                        Choose one or more areas of expertise from the left panel to load and select corresponding conditions.
                      </Text>
                    </View>
                  ) : (
                    <ScrollView showsVerticalScrollIndicator={true} className="flex-1 pr-2">
                      {tempConditionsGrouped.map((group) => (
                        <View key={group.key} className="mb-6">
                          <View className="bg-teal-50 px-3 py-1 rounded-lg mb-3">
                            <Text className="text-xs font-bold text-teal-700 uppercase tracking-wider">
                              {group.label}
                            </Text>
                          </View>
                          <View className="flex-row flex-wrap -mx-1.5">
                            {(group.items ?? []).map((item: any) => {
                              const isSelected = tempSelectedConditionIds.includes(item.id);
                              return (
                                <TouchableOpacity
                                  key={item.id}
                                  onPress={() => toggleTempCondition(item.id)}
                                  activeOpacity={0.7}
                                  className={`w-[47%] m-1.5 p-3 rounded-xl border flex-row items-center justify-between ${
                                    isSelected
                                      ? "bg-emerald-50/40 border-emerald-500"
                                      : "bg-white border-gray-200"
                                  }`}
                                >
                                  <Text
                                    className={`text-xs font-medium flex-1 mr-2 ${
                                      isSelected ? "text-emerald-800 font-semibold" : "text-gray-600"
                                    }`}
                                  >
                                    {item.name}
                                  </Text>
                                  <View
                                    className={`w-4 h-4 rounded border flex items-center justify-center ${
                                      isSelected ? "bg-emerald-600 border-emerald-600" : "border-gray-300"
                                    }`}
                                  >
                                    {isSelected && <Check size={11} color="white" />}
                                  </View>
                                </TouchableOpacity>
                              );
                            })}
                          </View>
                        </View>
                      ))}
                    </ScrollView>
                  )}
                </View>
              </View>

              {/* Footer */}
              <View className="flex-row justify-between items-center px-6 py-4 border-t border-gray-100 bg-gray-50/50">
                <View className="flex-row items-center">
                  <Text className="text-xs text-gray-500 font-medium">
                    {tempSelectedSpecIds.length} Specs • {tempSelectedConditionIds.length} Conditions selected
                  </Text>
                </View>
                <View className="flex-row gap-3">
                  <TouchableOpacity
                    onPress={handleCancelSpecsModal}
                    className="px-5 py-2.5 border border-gray-200 rounded-xl bg-white"
                  >
                    <Text className="text-gray-700 font-semibold text-sm">Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={handleSaveSpecsAndConditions}
                    disabled={savingSpecs || tempSelectedSpecIds.length === 0}
                    className="px-6 py-2.5 rounded-xl flex-row items-center justify-center"
                    style={{
                      backgroundColor: savingSpecs || tempSelectedSpecIds.length === 0 ? "#a8d5c8" : "#089769",
                    }}
                  >
                    {savingSpecs ? (
                      <ActivityIndicator size="small" color="white" />
                    ) : (
                      <Text className="text-white font-bold text-sm">Save Changes</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </View>
        </Modal>
      )}

      {/* Unsaved Changes Confirmation Modal */}
      <Modal
        visible={showUnsavedAlert}
        transparent
        animationType="fade"
        onRequestClose={() => setShowUnsavedAlert(false)}
      >
        <View className="flex-1 justify-center items-center bg-black/50 px-6">
          <View className="bg-white rounded-3xl p-6 w-full max-w-sm border border-gray-100 shadow-2xl">
            <View className="items-center mb-4">
              <View className="w-14 h-14 rounded-full bg-amber-100 items-center justify-center mb-3">
                <Text className="text-2xl">⚠️</Text>
              </View>
              <Text className="text-xl font-bold text-gray-900 text-center">
                Unsaved Changes
              </Text>
            </View>
            <Text className="text-base text-gray-500 text-center mb-6 leading-relaxed">
              You have unsaved changes. Are you sure you want to discard your edits and leave?
            </Text>
            <View className="flex-row gap-3">
              <TouchableOpacity
                onPress={() => {
                  setShowUnsavedAlert(false);
                  setShowSpecsModal(false);
                }}
                className="flex-1 bg-gray-100 py-3.5 rounded-xl"
                activeOpacity={0.8}
              >
                <Text className="text-gray-700 text-center font-bold text-base">
                  Discard
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setShowUnsavedAlert(false)}
                className="flex-1 py-3.5 rounded-xl"
                style={{ backgroundColor: '#089769' }}
                activeOpacity={0.8}
              >
                <Text className="text-white text-center font-bold text-base">
                  Keep Editing
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
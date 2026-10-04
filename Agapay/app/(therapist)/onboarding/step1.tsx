import { FontAwesome5 } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  Alert,
  Image,
  Platform,
  ScrollView,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { therapistOnboardingStore } from "@/src/stores/therapistOnboardingStore";
import { getImagePickerUri } from "@/src/features/onboarding/core/therapistImagePicker";

export default function TherapistOnboarding1() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === "web" && width >= 768;

  useEffect(() => {
    // Clear the onboarding store when starting fresh
    therapistOnboardingStore.clear();

    (async () => {
      const { status } =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      setHasPermission(status === "granted");
      if (status !== "granted") {
        Alert.alert(
          "Permission required",
          "Permission to access photos is required to choose a profile picture.",
        );
      }
    })();
  }, []);

  const pickImage = async () => {
    if (hasPermission === false) {
      Alert.alert(
        "No permission",
        "Please allow photo access from your device settings.",
      );
      return;
    }

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      const uri = getImagePickerUri(result);
      if (uri) setImageUri(uri);
    } catch (err) {
      console.warn("Image pick error", err);
    }
  };

  const handleProceed = () => {
    // Persist the selected image into the onboarding store then proceed
    therapistOnboardingStore.setProfilePicture(imageUri);
    // Log a preview of the onboarding payload we'll eventually send
    const previewPayload = {
      profilePictureUri: imageUri,
      // single id removed in favor of an array of ids
      specializationIds: therapistOnboardingStore.specializationIds,
      // add any other arrays required by final endpoint as placeholders
      ConditionIds: [],
      ServiceAreasIds: [],
      SpecializationIds: therapistOnboardingStore.specializationIds,
    };
    console.log(
      "[Onboarding preview] about to proceed, previewPayload:",
      previewPayload,
    );
    console.log(
      "[Onboarding store] current state:",
      therapistOnboardingStore.getAll(),
    );

    router.push("/(therapist)/onboarding/step2");
  };

  return (
    <View
      className="flex-1"
      style={{ backgroundColor: isDesktop ? "#e6f5f0" : "#F9FAFB" }}
    >
      {isDesktop ? (
        // Desktop Layout
        <ScrollView
          contentContainerStyle={{
            flexGrow: 1,
            justifyContent: "center",
            alignItems: "center",
            padding: 40,
          }}
          showsVerticalScrollIndicator={false}
        >
          <View
            style={{
              width: "100%",
              maxWidth: 500,
              backgroundColor: "#FFFFFF",
              borderRadius: 20,
              padding: 32,
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.1,
              shadowRadius: 16,
              elevation: 4,
            }}
          >
            {/* Header Section */}
            <View className="mb-6">
              <Text className="text-2xl font-bold text-gray-900 mb-2">
                Profile Picture
              </Text>
              <Text className="text-sm text-gray-500">
                A clear, professional photo helps build trust
              </Text>
            </View>

            {/* Image Preview */}
            <View className="items-center mb-6">
              {imageUri ? (
                <View>
                  <Image
                    source={{ uri: imageUri }}
                    className="w-[180px] h-[180px] rounded-2xl"
                    style={{ width: 180, height: 180 }}
                    resizeMode="cover"
                  />
                </View>
              ) : (
                <View className="w-[180px] h-[180px] rounded-2xl border-2 border-gray-200 bg-white items-center justify-center">
                  <View className="items-center">
                    <View className="w-16 h-16 rounded-full bg-gray-100 items-center justify-center mb-3">
                      <FontAwesome5 name="user" size={28} color="#9CA3AF" />
                    </View>
                    <Text className="text-gray-400 text-sm font-medium">
                      No photo selected
                    </Text>
                  </View>
                </View>
              )}
            </View>

            {/* Choose Picture Button */}
            <TouchableOpacity
              className="w-full rounded-xl py-3 items-center mb-4"
              style={{
                borderWidth: 2,
                borderColor: "#089769",
                backgroundColor: "white",
              }}
              onPress={pickImage}
              activeOpacity={0.8}
            >
              <View className="flex-row items-center">
                <View
                  className="w-8 h-8 rounded-full items-center justify-center mr-3"
                  style={{ backgroundColor: "#E6F4F0" }}
                >
                  <FontAwesome5 name="camera" size={14} color="#089769" />
                </View>
                <Text
                  style={{ color: "#089769" }}
                  className="text-base font-semibold"
                >
                  {imageUri ? "Change Picture" : "Choose Picture"}
                </Text>
              </View>
            </TouchableOpacity>

            {/* Continue Button */}
            <TouchableOpacity
              className="py-4 rounded-xl items-center"
              style={{ backgroundColor: imageUri ? "#089769" : "#a8d5c8" }}
              onPress={handleProceed}
              activeOpacity={imageUri ? 0.9 : 1}
              disabled={!imageUri}
            >
              <Text className="text-white text-base font-semibold tracking-wide">
                Continue
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      ) : (
        // Mobile Layout
        <>
          <View className="flex-1 px-6" style={{ paddingTop: insets.top + 24 }}>
            {/* Header Section */}
            <View className="mb-8">
              <Text className="text-3xl font-bold text-gray-900 mb-2">
                Profile Picture
              </Text>
              <Text className="text-base text-gray-500">
                A clear, professional photo helps build trust
              </Text>
            </View>

            {/* Image Preview */}
            <View className="items-center mb-8">
              {imageUri ? (
                <View>
                  <Image
                    source={{ uri: imageUri }}
                    className="w-[220px] h-[220px] rounded-2xl"
                    style={{ width: 220, height: 220 }}
                    resizeMode="cover"
                  />
                </View>
              ) : (
                <View className="w-[220px] h-[220px] rounded-2xl border-2 border-gray-200 bg-white items-center justify-center">
                  <View className="items-center">
                    <View className="w-20 h-20 rounded-full bg-gray-100 items-center justify-center mb-4">
                      <FontAwesome5 name="user" size={32} color="#9CA3AF" />
                    </View>
                    <Text className="text-gray-400 text-sm font-medium">
                      No photo selected
                    </Text>
                  </View>
                </View>
              )}
            </View>

            {/* Choose Picture Button */}
            <TouchableOpacity
              className="w-full rounded-2xl py-4 items-center bg-white active:bg-emerald-50"
              style={{ borderWidth: 2, borderColor: "#089769" }}
              onPress={pickImage}
              activeOpacity={0.8}
            >
              <View className="flex-row items-center">
                <View
                  className="w-8 h-8 rounded-full items-center justify-center mr-3"
                  style={{ backgroundColor: "#E6F4F0" }}
                >
                  <FontAwesome5 name="camera" size={14} color="#089769" />
                </View>
                <Text
                  style={{ color: "#089769" }}
                  className="text-base font-semibold"
                >
                  {imageUri ? "Change Picture" : "Choose Picture"}
                </Text>
              </View>
            </TouchableOpacity>
          </View>

          {/* Footer Button */}
          <View className="px-6 pb-8" style={{ backgroundColor: "#F9FAFB" }}>
            <TouchableOpacity
              className="py-4 rounded-2xl items-center shadow-sm"
              style={{ backgroundColor: imageUri ? "#089769" : "#a8d5c8" }}
              onPress={handleProceed}
              activeOpacity={imageUri ? 0.9 : 1}
              disabled={!imageUri}
            >
              <Text className="text-white text-base font-semibold tracking-wide">
                Continue
              </Text>
            </TouchableOpacity>
          </View>
        </>
      )}
    </View>
  );
}

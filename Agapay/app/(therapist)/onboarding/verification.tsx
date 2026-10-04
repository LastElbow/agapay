// verification screen (PRC upload)
import * as ImagePicker from "expo-image-picker";
import { router, useLocalSearchParams } from "expo-router";
import { ArrowLeft, ImagePlus } from "lucide-react-native";
import { useAuth } from "@/src/providers/AuthProvider";
import { therapistOnboardingStore } from "@/src/stores/therapistOnboardingStore";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";

// Note: uploads are simulated locally; server upload URL is not configured here.

const PTVerification = () => {
  const insets = useSafeAreaInsets();
  const { accessToken, updateUser, user: authUser } = useAuth();
  const params = useLocalSearchParams();
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [prcNumber, setPrcNumber] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === "web" && width >= 768;

  async function pickImage() {
    try {
      const permissionResult =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (permissionResult.status !== "granted") {
        Alert.alert(
          "Permission required",
          "Please allow photo library access to upload a photo.",
        );
        return null;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.8,
        allowsEditing: false,
      });

      console.log("ImagePicker full result:", JSON.stringify(result, null, 2));

      // Check if user cancelled
      if (result.canceled) {
        console.log("User cancelled image picker");
        return null;
      }

      // Get the URI from the result
      let uri: string | null = null;

      if (result.assets && result.assets.length > 0) {
        uri = result.assets[0].uri;
        console.log("Got URI from assets[0]:", uri);
      } else if ((result as any).uri) {
        uri = (result as any).uri;
        console.log("Got URI from result.uri:", uri);
      }

      if (!uri) {
        console.log("No URI found in result");
        Alert.alert("Error", "Could not get image from picker");
        return null;
      }

      console.log("Final URI to return:", uri);
      return uri;
    } catch (err: any) {
      Alert.alert("Error", err.message || "Could not open image picker");
      return null;
    }
  }

  // we no longer upload during selection in the client -- just display the photo

  async function handlePickAndUpload() {
    const uri = await pickImage();
    if (!uri) return;
    setImageUri(uri);
  }

  async function handleSubmit() {
    if (!prcNumber?.trim()) {
      Alert.alert("Validation", "Please enter your PRC License Number.");
      return;
    }
    if (!imageUri) {
      Alert.alert("Validation", "Please choose a photo of your PRC license.");
      return;
    }

    if (!accessToken) {
      Alert.alert("Auth", "You must be logged in to submit.");
      return;
    }

    setIsSubmitting(true);
    try {
      const formData = new FormData();
      // Field name should match the server DTO property
      formData.append("LicenseNumber", prcNumber.trim());

      // Include gender from params (from signup) or user data if available
      const gender =
        params.gender || therapistOnboardingStore.gender || authUser?.gender;
      if (gender && typeof gender === "string") {
        formData.append("Gender", gender);
      }

      // Append the image file under the name expected by the controller: licenseImage
      // In React Native FormData, file objects should have uri, name and type
      const filename = imageUri.split("/").pop() || `license-${Date.now()}.jpg`;
      const lower = filename.toLowerCase();
      const fileType = lower.endsWith(".png")
        ? "image/png"
        : lower.endsWith(".webp")
          ? "image/webp"
          : lower.endsWith(".heic")
            ? "image/heic"
            : "image/jpeg";

      if (Platform.OS === "web") {
        // Convert URI to Blob for web; RN-style {uri,name,type} won't be accepted by browsers
        const res = await fetch(imageUri);
        const blob = await res.blob();
        formData.append("licenseImage", blob, filename);
      } else {
        // @ts-ignore - RN FormData file shape
        formData.append("licenseImage", {
          uri: imageUri,
          name: filename,
          type: fileType,
        });
      }

      // Use the project's axios client only to find the configured baseURL,
      // but perform the multipart upload with fetch which is more reliable in RN.
      const apiClient = (await import("@/api/client")).default;
      // Build a robust absolute URL without accidental double slashes or whitespace
      const baseRaw = String(apiClient.defaults.baseURL ?? "");
      const base = baseRaw.trim().replace(/\/+$/, "");
      const fullUrl = `${base}/api/Onboarding/therapist/submit-license`;
      console.log("Submitting license to:", fullUrl);

      // Use fetch to POST FormData; include Authorization header from auth session
      const fetchRes = await fetch(fullUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          // Don't set Content-Type: let the runtime set the multipart boundary
        },
        body: formData as any,
      }).catch((err) => {
        console.error("Fetch upload error:", err);
        throw err;
      });

      const text = await fetchRes.text();
      let data: any = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch (e) {
        // not JSON
        console.debug("Response not JSON", e);
      }

      console.log(
        "Fetch upload response status:",
        fetchRes.status,
        "text:",
        text,
      );

      if (!fetchRes.ok) {
        throw new Error(`Upload failed ${fetchRes.status}: ${text}`);
      }

      if (data?.licensePreviewUrl)
        console.log("License preview URL:", data.licensePreviewUrl);

      try {
        await updateUser({
          ...(authUser ?? {}),
          therapistVerificationStatus: "Pending",
        });
      } catch (persistErr) {
        console.warn(
          "Failed to update user verification status locally",
          persistErr,
        );
      }

      router.replace("/(therapist)/(tabs)" as any);
    } catch (err: any) {
      console.error(err);
      Alert.alert("Upload error", err?.message || String(err));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <View style={[styles.container, isDesktop && styles.containerDesktop]}>
      {isDesktop ? (
        // Desktop Layout
        <ScrollView
          contentContainerStyle={styles.desktopScrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.desktopCard}>
            <TouchableOpacity
              onPress={() => router.back()}
              style={styles.desktopBackBtn}
            >
              <ArrowLeft size={20} color="#089769" />
              <Text style={styles.backText}>Back</Text>
            </TouchableOpacity>

            <Text style={styles.desktopTitle}>PRC License Number</Text>
            <TextInput
              style={styles.desktopInput}
              placeholder="Enter PRC License Number"
              placeholderTextColor="#888"
              value={prcNumber}
              onChangeText={(text) => {
                const numericText = text.replace(/[^0-9]/g, "");
                if (numericText.length <= 7) {
                  setPrcNumber(numericText);
                }
              }}
              keyboardType="numeric"
              maxLength={7}
              editable={!isSubmitting}
            />

            <Text style={styles.desktopTitle}>Photo of PRC License</Text>
            <View style={styles.desktopPhotoSection}>
              <View style={styles.photoUploadContainer}>
                {imageUri ? (
                  <>
                    <Image
                      source={{ uri: imageUri }}
                      style={styles.previewImage}
                      onError={(e) => {
                        console.log("Image preview error", e.nativeEvent);
                      }}
                    />
                  </>
                ) : (
                  <ImagePlus
                    size={64}
                    color="#9AA0A6"
                    style={styles.photoIcon}
                  />
                )}

                <TouchableOpacity
                  onPress={handlePickAndUpload}
                  style={styles.desktopChooseButton}
                >
                  <Text style={styles.chooseButtonText}>Choose photo</Text>
                </TouchableOpacity>
              </View>
            </View>

            <TouchableOpacity
              style={[
                styles.desktopSubmitButton,
                isSubmitting && styles.buttonDisabled,
              ]}
              onPress={handleSubmit}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>Submit</Text>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      ) : (
        // Mobile Layout
        <SafeAreaView style={styles.mobileSafe}>
          <View style={styles.headerRow}>
            <TouchableOpacity
              onPress={() => router.back()}
              style={styles.backBtn}
            >
              <ArrowLeft size={28} color="#089769" />
            </TouchableOpacity>
          </View>
          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.contentWrap}>
              <Text style={styles.title}>PRC License Number</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter PRC License Number"
                placeholderTextColor="#888"
                value={prcNumber}
                onChangeText={(text) => {
                  const numericText = text.replace(/[^0-9]/g, "");
                  if (numericText.length <= 7) {
                    setPrcNumber(numericText);
                  }
                }}
                keyboardType="numeric"
                maxLength={7}
                editable={!isSubmitting}
              />

              <Text style={styles.prclicense}>Photo of PRC License</Text>
              <View style={styles.photoSection}>
                <View style={styles.photoUploadContainer}>
                  {imageUri ? (
                    <>
                      <Image
                        source={{ uri: imageUri }}
                        style={styles.previewImage}
                        onError={(e) => {
                          console.log("Image preview error", e.nativeEvent);
                        }}
                      />
                    </>
                  ) : (
                    <ImagePlus
                      size={64}
                      color="#9AA0A6"
                      style={styles.photoIcon}
                    />
                  )}

                  <TouchableOpacity
                    onPress={handlePickAndUpload}
                    style={styles.chooseButton}
                  >
                    <Text style={styles.chooseButtonText}>Choose photo</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </ScrollView>

          <TouchableOpacity
            style={[styles.verifyButton, { bottom: insets.bottom + 12 }]}
            onPress={handleSubmit}
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Submit</Text>
            )}
          </TouchableOpacity>
        </SafeAreaView>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  containerDesktop: {
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
  desktopBackBtn: {
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
  desktopTitle: {
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 12,
    color: "#111",
  },
  desktopInput: {
    height: 48,
    borderColor: "#ccc",
    borderWidth: 1,
    width: "100%",
    borderRadius: 12,
    paddingHorizontal: 16,
    marginBottom: 24,
    fontSize: 16,
  },
  desktopPhotoSection: {
    borderWidth: 2,
    borderColor: "#ccc",
    borderStyle: "dashed",
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    alignItems: "center",
    width: "100%",
  },
  desktopChooseButton: {
    backgroundColor: "#089769",
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 20,
    marginTop: 8,
  },
  desktopSubmitButton: {
    backgroundColor: "#089769",
    height: 52,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  // Mobile styles
  mobileSafe: {
    flex: 1,
    backgroundColor: "#fff",
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 100,
  },
  title: {
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 12,
    marginTop: 18,
    marginLeft: 8,
  },
  input: {
    height: 48,
    borderColor: "#ccc",
    borderWidth: 1,
    width: "100%",
    borderRadius: 16,
    paddingHorizontal: 10,
    marginBottom: 20,
    alignSelf: "center",
  },
  contentWrap: {
    paddingHorizontal: 16,
  },
  photoSection: {
    borderWidth: 2,
    borderColor: "#ccc",
    borderStyle: "dashed",
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    alignItems: "center",
    width: "100%",
  },
  prclicense: {
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 12,
    marginLeft: 8,
  },
  photoUploadContainer: {
    width: "100%",
    alignItems: "center",
    paddingVertical: 24,
    paddingHorizontal: 12,
  },
  photoContainer: {
    alignItems: "center",
  },
  photoIcon: {
    marginBottom: 12,
    marginTop: 12,
  },
  previewImage: {
    width: "100%",
    aspectRatio: 1.6,
    marginBottom: 12,
    borderRadius: 8,
    resizeMode: "contain",
  },
  debugUri: {
    fontSize: 12,
    color: "#888",
    marginTop: 6,
    width: "100%",
  },
  chooseButton: {
    backgroundColor: "#089769",
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 20,
    marginTop: 8,
  },
  chooseButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  button: {
    backgroundColor: "#089769",
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    width: "90%",
    alignSelf: "center",
  },
  verifyButton: {
    position: "absolute",
    left: 16,
    right: 16,
    backgroundColor: "#089769",
    height: 52,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 0,
    elevation: 3,
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  headerRow: {
    paddingTop: 26,
    paddingHorizontal: 20,
  },
  backBtn: {
    width: 44,
    height: 44,
    justifyContent: "center",
    alignItems: "center",
  },
});

export default PTVerification;

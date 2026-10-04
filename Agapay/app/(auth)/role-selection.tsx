import React, { useState, useRef, useEffect } from "react";
import { useRole } from "@/src/providers/RoleProvider";
import { useLocalSearchParams, useRouter, Link } from "expo-router";
import {
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
  ScrollView,
  Platform,
  Pressable,
  Animated,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ArrowLeft } from "lucide-react-native";
import { FontAwesome5 } from "@expo/vector-icons";
import { resolveRoleSelectionNextRoute } from "@/src/features/auth/core/roleSelection";

const RoleCard = ({
  title,
  description,
  iconName,
  onPress,
  isCompact = false,
}: {
  title: string;
  description: string;
  iconName: string;
  onPress: () => void;
  isCompact?: boolean;
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const translateY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(translateY, {
      toValue: isHovered ? -8 : 0,
      duration: 200,
      useNativeDriver: Platform.OS !== "web", // Native driver for transform
    }).start();
  }, [isHovered, translateY]);

  return (
    <Pressable
      onPress={onPress}
      onHoverIn={() => setIsHovered(true)}
      onHoverOut={() => setIsHovered(false)}
      style={{ flex: 1, width: "100%" }}
    >
      <Animated.View
        style={{
          transform: [{ translateY }],
          backgroundColor: "white",
          shadowColor: "#000",
          shadowOffset: {
            width: 0,
            height: isHovered ? 20 : 4,
          },
          shadowOpacity: isHovered ? 0.1 : 0.05,
          shadowRadius: isHovered ? 30 : 20,
          elevation: isHovered ? 10 : 4,
          padding: isCompact ? 20 : 40,
          borderRadius: isCompact ? 24 : 32,
          alignItems: "center", // items-center equivalent
          justifyContent: "center", // justify-center equivalent
        }}
        className={`flex-1 ${
          isHovered
            ? "border-2 border-physio-primary"
            : "border border-transparent"
        }`}
      >
        <View
          style={{
            width: isCompact ? 72 : 112,
            height: isCompact ? 72 : 112,
            marginBottom: isCompact ? 12 : 24,
          }}
          className={`rounded-full items-center justify-center ${
            isHovered ? "bg-teal-50" : "bg-physio-light"
          }`}
        >
          <FontAwesome5
            name={iconName}
            size={isCompact ? 32 : 42}
            color="#6B7280"
          />
        </View>
        <Text
          style={{
            fontSize: isCompact ? 20 : 24,
            marginBottom: isCompact ? 8 : 12,
          }}
          className={`font-bold text-center ${
            isHovered ? "text-physio-primary" : "text-gray-900"
          }`}
        >
          {title}
        </Text>
        <Text
          style={{
            fontSize: isCompact ? 15 : 16,
            lineHeight: isCompact ? 22 : 24,
          }}
          className="text-gray-500 leading-relaxed text-center px-2"
        >
          {description}
        </Text>
      </Animated.View>
    </Pressable>
  );
};

export default function RoleSelection() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { next } = useLocalSearchParams<{ next?: string | string[] }>();
  const { setSelectedRole } = useRole();

  const nextParam = Array.isArray(next) ? next[0] : next;
  const nextRoute = resolveRoleSelectionNextRoute(nextParam);

  const isLargeScreen = width >= 768;

  const handleRoleSelect = (role: "Patient" | "PhysicalTherapist") => {
    try {
      setSelectedRole(role);
    } catch (e) {
      console.error("Error setting role", e);
    }
    router.replace(nextRoute);
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

      <SafeAreaView className="flex-1 z-10">
        <ScrollView
          contentContainerStyle={{ flexGrow: 1 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Navigation Bar */}
          {Platform.OS === "web" && (
            <View
              className={`px-6 flex-row items-center justify-between ${isLargeScreen ? "py-6" : "py-3"}`}
            >
              <TouchableOpacity
                onPress={() => router.back()}
                className="flex-row items-center gap-2 group"
              >
                <View className="bg-white/50 p-2 rounded-lg">
                  <ArrowLeft size={20} color="#0e7468" />
                </View>
                <Text className="text-base font-semibold text-physio-dark">
                  Back to Home
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Main Content Area */}
          <View
            className={`flex-1 items-center justify-center px-4 sm:px-6 lg:px-8 ${isLargeScreen ? "pb-12" : "pb-4"}`}
          >
            {/* Header Section */}
            <View
              className={`items-center text-center max-w-2xl ${isLargeScreen ? "mb-10" : "mb-8"}`}
            >
              <View
                className={`flex-row justify-center ${isLargeScreen ? "mb-6" : "mb-2"}`}
              >
                <View className="flex-row items-center gap-2">
                  <View
                    className={`bg-physio-primary rounded-xl shadow-sm items-center justify-center ${isLargeScreen ? "p-2.5" : "p-2"}`}
                  >
                    <FontAwesome5
                      name="hand-holding-heart"
                      size={isLargeScreen ? 24 : 18}
                      color="white"
                    />
                  </View>
                  <Text
                    className={`font-bold text-gray-800 tracking-tight ${isLargeScreen ? "text-3xl" : "text-2xl"}`}
                  >
                    Agapay
                  </Text>
                </View>
              </View>
              <Text
                className={`font-bold text-gray-900 text-center ${isLargeScreen ? "text-3xl md:text-4xl mb-3" : "text-xl mb-1"}`}
              >
                Choose how you{"'"}ll use Agapay
              </Text>
              <Text
                className={`text-gray-500 text-center ${isLargeScreen ? "text-lg" : "text-sm"}`}
              >
                Select your role to continue with the registration
              </Text>
            </View>

            {/* Role Selection Cards */}
            <View
              className={`w-full max-w-4xl ${
                isLargeScreen ? "flex-row gap-6 mb-10" : "flex-col gap-3 mb-6"
              }`}
            >
              <RoleCard
                title="Patient"
                description="Start your journey to better recovery and wellness. Find therapists and book sessions."
                iconName="user-injured"
                onPress={() => handleRoleSelect("Patient")}
                isCompact={!isLargeScreen}
              />
              <RoleCard
                title="Physical Therapist"
                description="Manage bookings and grow your therapy practice. Connect with patients."
                iconName="user-md"
                onPress={() => handleRoleSelect("PhysicalTherapist")}
                isCompact={!isLargeScreen}
              />
            </View>

            {/* Footer Links */}
            <View className="mt-2 flex-row justify-center items-center">
              <Text className="text-base text-gray-500">
                Already have an account?{" "}
              </Text>
              <Link href="/(auth)/signin" asChild>
                <TouchableOpacity>
                  <Text className="font-bold text-physio-primary ml-1 text-base">
                    Sign In
                  </Text>
                </TouchableOpacity>
              </Link>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

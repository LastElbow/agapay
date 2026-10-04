import React, { useEffect, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  Platform,
  Linking,
  Animated,
  Easing,
} from "react-native";
import { useRouter } from "expo-router";
import { FontAwesome, FontAwesome5 } from "@expo/vector-icons";

// Colors from design
// const COLORS = {
//   dark: '#0e7468',
//   primary: '#089769',
//   light: '#f0fdfa',
//   hover: '#067a54',
//   text: '#134e4a',
//   accent: '#ccfbf1',
// };

const FloatingElement = ({ children, delay = 0, style }: any) => {
  const translateY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animate = () => {
      Animated.sequence([
        Animated.delay(delay),
        Animated.loop(
          Animated.sequence([
            Animated.timing(translateY, {
              toValue: -20,
              duration: 3000,
              useNativeDriver: Platform.OS !== "web", // web driver support varies
              easing: Easing.inOut(Easing.ease),
            }),
            Animated.timing(translateY, {
              toValue: 0,
              duration: 3000,
              useNativeDriver: Platform.OS !== "web",
              easing: Easing.inOut(Easing.ease),
            }),
          ])
        ),
      ]).start();
    };
    animate();
  }, [delay, translateY]);

  return (
    <Animated.View style={[style, { transform: [{ translateY }] }]}>
      {children}
    </Animated.View>
  );
};

const WebLandingPage = () => {
  return (
    <View className="flex-1 bg-[#f0fdfa]">
      <Header />
      <View className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex-1 justify-center">
        <MainContent />
      </View>
      <Footer />
    </View>
  );
};

const Header = () => {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = React.useState(false);

  const navigateToSignIn = () => {
    router.push("/(auth)/signin");
    setMenuOpen(false);
  };

  const navigateToSignUp = () => {
    router.push("/(auth)/role-selection?next=signup");
    setMenuOpen(false);
  };

  return (
    <View
      className={`px-6 py-4 border-b border-gray-100 ${Platform.OS === "web"
          ? "sticky top-0 bg-white/80 backdrop-blur-md z-50"
          : "bg-white"
        }`}
    >
      <View className="flex-row justify-between items-center w-full max-w-7xl mx-auto">
        <View className="flex-row items-center gap-2">
          <View
            className="bg-[#089769] p-2 rounded-lg items-center justify-center"
            style={{ width: 40, height: 40 }}
          >
            <FontAwesome5 name="hand-holding-heart" size={20} color="white" />
          </View>
          <Text className="text-xl font-bold text-gray-800 tracking-tight">
            Agapay
          </Text>
        </View>

        {/* Desktop Navigation */}
        <View className="hidden sm:flex flex-row items-center gap-3">
          <TouchableOpacity
            className="px-4 py-2 rounded-lg hover:bg-[#f0fdfa]"
            onPress={navigateToSignIn}
          >
            <Text className="text-[#0e7468] font-semibold text-base">
              Sign In
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            className="px-5 py-2 rounded-lg bg-[#089769] shadow-sm hover:bg-[#067a54]"
            onPress={navigateToSignUp}
          >
            <Text className="text-white font-semibold text-base">Sign Up</Text>
          </TouchableOpacity>
        </View>

        {/* Mobile Menu Button */}
        <TouchableOpacity
          className="sm:hidden p-2"
          onPress={() => setMenuOpen(!menuOpen)}
        >
          <FontAwesome5
            name={menuOpen ? "times" : "bars"}
            size={20}
            color="#1f2937"
          />
        </TouchableOpacity>
      </View>

      {/* Mobile Menu */}
      {menuOpen && (
        <View className="sm:hidden pt-4 pb-2 border-t border-gray-100 mt-3">
          <View className="flex gap-2">
            <TouchableOpacity
              className="px-5 py-3 rounded-lg hover:bg-gray-50"
              onPress={navigateToSignIn}
            >
              <Text className="text-[#0e7468] font-semibold text-center text-base">
                Sign In
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              className="px-5 py-3 rounded-lg bg-[#089769]"
              onPress={navigateToSignUp}
            >
              <Text className="text-white font-semibold text-center text-base">
                Sign Up
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
};

const MainContent = () => {
  const router = useRouter();

  const handleGetStarted = () => {
    if (Platform.OS === "web") {
      Linking.openURL("#download");
    } else {
      router.push("/(auth)/role-selection?next=signup");
    }
  };

  return (
    <View className="flex-col lg:flex-row items-center gap-12 md:gap-20 py-12">
      {/* Left Column */}
      <View className="flex-1 z-10 items-center lg:items-start text-center lg:text-left">
        <View className="flex-row items-center gap-2 px-4 py-2 rounded-full bg-white border border-gray-200 mb-6 shadow-sm self-center lg:self-start">
          <View className="h-2 w-2 rounded-full bg-[#089769]" />
          <Text className="text-gray-700 font-medium text-base">
            For Patients & Professionals
          </Text>
        </View>

        <Text className="text-4xl md:text-6xl font-bold text-gray-900 mb-6 leading-tight tracking-tight text-center lg:text-left">
          Where Patients Find Care{"\n"}and{" "}
          <Text className="text-[#089769]">Therapists{"\n"}Thrive.</Text>
        </Text>

        <Text className="text-lg text-gray-500 mb-8 leading-relaxed max-w-lg text-center lg:text-left">
          Whether you are seeking recovery or growing your practice, Agapay is
          the system connecting trusted professionals with those in need.
        </Text>

        <TouchableOpacity
          className="flex-row items-center bg-[#089769] px-8 py-4 rounded-xl gap-3 hover:bg-[#067a54] self-center lg:self-start"
          onPress={handleGetStarted}
          style={{
            shadowColor: "#a7f3d0",
            shadowOffset: { width: 0, height: 8 },
            shadowOpacity: 0.4,
            shadowRadius: 16,
            elevation: 8,
          }}
        >
          <FontAwesome name="android" size={24} color="white" />
          <Text className="text-white font-semibold text-lg">Download APK</Text>
        </TouchableOpacity>
      </View>

      {/* Right Column - Floating UI */}
      {Platform.OS === "web" && (
        <View className="hidden lg:flex flex-1 h-[600px] w-full relative items-center justify-center">
          {/* Background Blob */}
          <View
            className="absolute w-[500px] h-[500px] rounded-full bg-gradient-to-tr from-[#a7f3d0] to-white opacity-40"
            style={{ filter: "blur(80px)" }}
          />

          {/* Card 1: Get Matched */}
          <FloatingElement
            delay={0}
            style={{ position: "absolute", top: 60, right: 0, zIndex: 20 }}
          >
            <View
              className="w-80 bg-[#089769] rounded-2xl p-6 border border-white/10"
              style={{
                shadowColor: "#000",
                shadowOffset: { width: 0, height: 20 },
                shadowOpacity: 0.3,
                shadowRadius: 30,
                elevation: 10,
              }}
            >
              <View className="w-12 h-12 bg-white/20 rounded-xl items-center justify-center mb-4">
                <FontAwesome5 name="brain" size={20} color="white" />
              </View>
              <Text className="text-white text-xl font-bold mb-2">
                Get Matched
              </Text>
              <Text className="text-white opacity-90 text-base leading-relaxed mb-4">
                Let our algorithm suggest a list of therapists based on your
                specific needs.
              </Text>
              <View className="w-full h-1.5 bg-white/20 rounded-full overflow-hidden">
                <View className="w-3/4 h-full bg-white/40 rounded-full" />
              </View>
            </View>
          </FloatingElement>

          {/* Card 2: Appointment */}
          <FloatingElement
            delay={1500}
            style={{ position: "absolute", bottom: 80, left: 0, zIndex: 10 }}
          >
            <View
              className="w-72 bg-white rounded-2xl p-5 border border-gray-100"
              style={{
                shadowColor: "#000",
                shadowOffset: { width: 0, height: 10 },
                shadowOpacity: 0.1,
                shadowRadius: 20,
                elevation: 5,
              }}
            >
              <View className="flex-row items-center gap-3 mb-4">
                <View className="w-10 h-10 bg-[#f0fdfa] rounded-full items-center justify-center">
                  <FontAwesome5 name="user-md" size={16} color="#0e7468" />
                </View>
                <View>
                  <Text className="font-bold text-gray-800 text-base">
                    Dr. Sarah Smith
                  </Text>
                  <Text className="text-sm text-gray-500">
                    Physical Therapist
                  </Text>
                </View>
              </View>
              <View className="flex-row gap-2 mb-3">
                <View className="px-2 py-1 bg-gray-50 rounded-md flex-row items-center">
                  <FontAwesome5
                    name="calendar"
                    size={12}
                    color="#4b5563"
                    style={{ marginRight: 4 }}
                  />
                  <Text className="text-sm text-gray-600 font-medium">
                    Today
                  </Text>
                </View>
                <View className="px-2 py-1 bg-green-50 rounded-md flex-row items-center">
                  <FontAwesome5
                    name="clock"
                    size={12}
                    color="#15803d"
                    style={{ marginRight: 4 }}
                  />
                  <Text className="text-sm text-green-700 font-medium">
                    2:00 PM
                  </Text>
                </View>
              </View>
              <View className="flex-row gap-2">
                <TouchableOpacity className="flex-1 py-2 bg-gray-100 rounded-lg items-center">
                  <Text className="text-gray-600 text-sm font-bold">
                    Decline
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity className="flex-1 py-2 bg-[#089769] rounded-lg items-center">
                  <Text className="text-white text-sm font-bold">Accept</Text>
                </TouchableOpacity>
              </View>
            </View>
          </FloatingElement>

          {/* Card 3: Notification */}
          <FloatingElement
            delay={800}
            style={{ position: "absolute", top: 280, left: 60, zIndex: 30 }}
          >
            <View
              className="bg-white px-4 py-3 rounded-xl border border-gray-50 flex-row items-center gap-3"
              style={{
                shadowColor: "#000",
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.1,
                shadowRadius: 12,
                elevation: 3,
              }}
            >
              <View className="bg-green-50 p-1.5 rounded-full">
                <FontAwesome5 name="check" size={10} color="#22c55e" />
              </View>
              <View>
                <Text className="text-sm font-bold text-gray-800">
                  Session Confirmed
                </Text>
                <Text className="text-xs text-gray-400">Just now</Text>
              </View>
            </View>
          </FloatingElement>
        </View>
      )}
    </View>
  );
};

const Footer = () => {
  const router = useRouter();

  return (
    <View className="py-6 border-t border-gray-100 bg-white">
      <View className="w-full max-w-7xl mx-auto px-6 flex-col md:flex-row justify-between items-center gap-4">
        <Text className="text-sm text-gray-500">
          © 2025 Agapay. All rights reserved.
        </Text>

        <View className="flex-row items-center gap-6">
          <TouchableOpacity onPress={() => router.push("/privacy")}>
            <Text className="text-sm text-gray-500 hover:text-[#0e7468]">
              Privacy Policy
            </Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.push("/terms-and-conditions")}>
            <Text className="text-sm text-gray-500 hover:text-[#0e7468]">
              Terms of Service
            </Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => Linking.openURL("mailto:rhenpen@gmail.com")}>
            <Text className="text-sm text-gray-500 hover:text-[#0e7468]">
              Support
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

export default WebLandingPage;

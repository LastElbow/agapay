import React from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Platform,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import {
  ArrowLeft,
  Shield,
  Users,
  MessageSquare,
  AlertTriangle,
  Ban,
  Scale,
} from "lucide-react-native";
import WebHeader from "@/src/components/WebHeader";

export default function CommunityGuidelinesScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === "web" && width >= 768;

  const guidelines = [
    {
      icon: Users,
      title: "Respect All Users",
      color: "#0D9488",
      bgColor: "bg-teal-50",
      content: [
        "Treat all patients, therapists, and staff with dignity and respect.",
        "Do not discriminate based on race, gender, religion, disability, or any other characteristic.",
        "Use appropriate and professional language in all communications.",
      ],
    },
    {
      icon: MessageSquare,
      title: "Appropriate Communication",
      color: "#3B82F6",
      bgColor: "bg-blue-50",
      content: [
        "Keep all conversations relevant to therapy services and health matters.",
        "Do not send spam, promotional content, or unsolicited messages.",
        "Avoid sharing personal contact information outside the platform.",
        "Report any inappropriate messages immediately.",
      ],
    },
    {
      icon: Shield,
      title: "Privacy & Confidentiality",
      color: "#8B5CF6",
      bgColor: "bg-purple-50",
      content: [
        "Respect the privacy of other users at all times.",
        "Do not share screenshots or content from private conversations.",
        "Keep all health-related information confidential.",
        "Only share your own medical information when necessary for treatment.",
      ],
    },
    {
      icon: AlertTriangle,
      title: "Prohibited Behaviors",
      color: "#F59E0B",
      bgColor: "bg-amber-50",
      content: [
        "Harassment, bullying, or threatening behavior of any kind.",
        "Posting false, misleading, or fraudulent information.",
        "Impersonating another person or entity.",
        "Sharing inappropriate, explicit, or offensive content.",
        "Soliciting services outside of the Agapay platform.",
      ],
    },
    {
      icon: Scale,
      title: "Professional Standards",
      color: "#10B981",
      bgColor: "bg-emerald-50",
      content: [
        "Therapists must maintain valid licenses and certifications.",
        "All appointments should be honored or cancelled with proper notice.",
        "Payments should be made through the official platform channels.",
        "Both parties should provide honest feedback and ratings.",
      ],
    },
  ];

  const consequences = [
    {
      count: "1st Warning",
      action: "Formal warning recorded on account",
      color: "text-yellow-600",
      bg: "bg-yellow-50",
    },
    {
      count: "2nd Warning",
      action: "Final warning with restricted features",
      color: "text-orange-600",
      bg: "bg-orange-50",
    },
    {
      count: "3rd Warning",
      action: "Automatic 7-day account suspension",
      color: "text-red-600",
      bg: "bg-red-50",
    },
    {
      count: "Severe Violations",
      action: "Immediate permanent ban",
      color: "text-red-700",
      bg: "bg-red-100",
    },
  ];

  return (
    <View className={`flex-1 ${isDesktop ? "bg-[#e6f5f0]" : "bg-gray-50"}`}>
      {isDesktop && <WebHeader />}
      <SafeAreaView
        className={`flex-1 ${isDesktop ? "bg-transparent" : "bg-gray-50"}`}
      >
        {/* Header */}
        {isDesktop ? (
          <View className="px-8 py-6 bg-transparent">
            <View className="max-w-4xl mx-auto w-full">
              <TouchableOpacity
                onPress={() => router.back()}
                className="flex-row items-center self-start px-4 py-2 rounded-full bg-white border border-gray-200 mb-4"
              >
                <ArrowLeft size={16} color="#089769" />
                <Text className="ml-2 text-[#089769] font-medium">Back</Text>
              </TouchableOpacity>
              <View className="flex-row items-center mb-2">
                <Shield size={28} color="#089769" />
                <Text className="text-3xl font-bold text-gray-900 ml-3">
                  Community Guidelines
                </Text>
              </View>
              <Text className="text-gray-500 text-base">
                Our standards for a safe and respectful community
              </Text>
            </View>
          </View>
        ) : (
          <View className="px-5 pt-6 pb-4 border-b border-gray-200 bg-white">
            <View className="flex-row items-center mb-3">
              <TouchableOpacity
                onPress={() => router.back()}
                className="mr-3 p-1"
                activeOpacity={0.7}
              >
                <ArrowLeft color="#089769" size={24} />
              </TouchableOpacity>
              <Shield size={24} color="#089769" />
              <Text className="text-xl font-bold text-black ml-2 flex-1">
                Community Guidelines
              </Text>
            </View>
            <Text className="text-xs text-gray-500">
              Our standards for a safe and respectful community
            </Text>
          </View>
        )}

        <ScrollView
          className="flex-1"
          contentContainerClassName={
            isDesktop ? "p-8 max-w-4xl mx-auto w-full" : "p-5"
          }
          showsVerticalScrollIndicator={false}
        >
          {/* Introduction */}
          <View
            className={`${isDesktop ? "bg-white rounded-xl p-6 mb-6 shadow-sm" : "bg-white rounded-xl p-4 mb-4"}`}
          >
            <Text className="text-base text-gray-700 leading-6">
              Welcome to Agapay! Our community guidelines are designed to ensure
              a safe, respectful, and professional environment for all users. By
              using our platform, you agree to follow these guidelines.
              Violations may result in warnings, suspension, or permanent
              removal from the platform.
            </Text>
          </View>

          {/* Guidelines Sections */}
          {guidelines.map((section, index) => {
            const Icon = section.icon;
            return (
              <View
                key={index}
                className={`${isDesktop ? "bg-white rounded-xl p-6 mb-4 shadow-sm" : "bg-white rounded-xl p-4 mb-3"}`}
              >
                <View className="flex-row items-center mb-3">
                  <View
                    className={`w-10 h-10 rounded-full ${section.bgColor} items-center justify-center mr-3`}
                  >
                    <Icon size={20} color={section.color} />
                  </View>
                  <Text className="text-lg font-bold text-gray-900">
                    {section.title}
                  </Text>
                </View>
                {section.content.map((item, itemIndex) => (
                  <View
                    key={itemIndex}
                    className="flex-row items-start mb-2 ml-2"
                  >
                    <Text className="text-teal-600 mr-2 mt-0.5">•</Text>
                    <Text className="text-sm text-gray-600 flex-1 leading-5">
                      {item}
                    </Text>
                  </View>
                ))}
              </View>
            );
          })}

          {/* Consequences Section */}
          <View
            className={`${isDesktop ? "bg-white rounded-xl p-6 mb-6 shadow-sm" : "bg-white rounded-xl p-4 mb-4"}`}
          >
            <View className="flex-row items-center mb-4">
              <View className="w-10 h-10 rounded-full bg-red-50 items-center justify-center mr-3">
                <Ban size={20} color="#DC2626" />
              </View>
              <Text className="text-lg font-bold text-gray-900">
                Violation Consequences
              </Text>
            </View>
            <Text className="text-sm text-gray-600 mb-4">
              We take violations seriously. Here&apos;s what happens when
              guidelines are not followed:
            </Text>
            {consequences.map((item, index) => (
              <View
                key={index}
                className={`flex-row items-center ${item.bg} rounded-lg p-3 mb-2`}
              >
                <Text className={`font-bold ${item.color} w-28`}>
                  {item.count}
                </Text>
                <Text className="text-sm text-gray-700 flex-1">
                  {item.action}
                </Text>
              </View>
            ))}
          </View>

          {/* Reporting Section */}
          <View
            className={`${isDesktop ? "bg-teal-50 rounded-xl p-6 mb-6 border border-teal-200" : "bg-teal-50 rounded-xl p-4 mb-4 border border-teal-200"}`}
          >
            <Text className="text-lg font-bold text-teal-800 mb-2">
              📢 Report a Violation
            </Text>
            <Text className="text-sm text-teal-700 leading-5">
              If you witness or experience any violation of these guidelines,
              please report it immediately using the report feature in
              conversations or contact our support team. All reports are
              reviewed confidentially.
            </Text>
          </View>

          {/* Footer */}
          <View className="items-center py-4 mb-8">
            <Text className="text-xs text-gray-400 text-center">
              Last updated: January 2026
            </Text>
            <Text className="text-xs text-gray-400 text-center mt-1">
              Agapay reserves the right to update these guidelines at any time.
            </Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

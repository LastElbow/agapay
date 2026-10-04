import React from "react";
import { View, Text, ScrollView, TouchableOpacity, useWindowDimensions, Platform } from "react-native";
import { ArrowLeft } from "lucide-react-native";
import { useRouter } from "expo-router";

export default function TermsOfService() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isWeb = Platform.OS === "web";
  const isLargeWeb = isWeb && width >= 768;

  return (
    <View className="flex-1 bg-physio-light relative">
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

      {/* Navigation Bar */}
      <View className="relative z-10 px-6 py-6 flex-row items-center justify-between">
        <TouchableOpacity
          onPress={() => router.back()}
          className="flex-row items-center gap-2 group"
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <View className="bg-white/50 p-2 rounded-lg">
            <ArrowLeft size={20} color="#0e7468" />
          </View>
          <Text className="text-base font-semibold text-physio-dark">
            Back
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          flexGrow: 1,
          paddingHorizontal: 24,
          paddingBottom: 48,
          ...(isLargeWeb ? { paddingVertical: 48 } : {}),
        }}
        showsVerticalScrollIndicator={false}
      >
        <View className="w-full max-w-2xl self-center bg-white/80 p-6 md:p-8 rounded-3xl shadow-sm border border-white/50">
          <Text className="text-3xl font-bold text-gray-900 mb-6 text-center">Terms of Service</Text>
          
          <Text className="text-sm text-gray-500 mb-8 text-center">Last updated: March 16, 2026</Text>

          <View className="gap-6">
            <View>
              <Text className="text-xl font-bold text-gray-800 mb-2">1. Acceptance of Terms</Text>
              <Text className="text-base text-gray-600 leading-relaxed">
                By accessing or using the Agapay application, you agree to be bound by these Terms of Service. If you disagree with any part of the terms, then you may not access the service. These Terms govern the relationship between you and Agapay concerning the mobile application or website ("Platform") provided by the Company.
              </Text>
            </View>

            <View>
              <Text className="text-xl font-bold text-gray-800 mb-2">2. Platform Nature</Text>
              <Text className="text-base text-gray-600 leading-relaxed">
                Agapay is a communications platform designed to connect Patients seeking physical therapy services with independent Physical Therapists offering such services. <Text className="font-bold">Agapay itself does not provide medical services, therapy, or healthcare, nor do we employ the Physical Therapists.</Text> The Platform strictly facilitates the matching, scheduling, and communication between these two independent parties.
              </Text>
            </View>

            <View>
              <Text className="text-xl font-bold text-gray-800 mb-2">3. User Responsibilities</Text>
              <Text className="text-base text-gray-600 leading-relaxed">
                <Text className="font-bold">Patient Responsibilities:</Text> You agree to provide accurate location information for matching purposes, accurate health backgrounds for proper care matching, and to conduct yourself respectfully.
                {"\n\n"}<Text className="font-bold">Therapist Responsibilities:</Text> If registering as a Physical Therapist, you represent and warrant that you possess all necessary licensures, certifications, and qualifications required to provide services. You must provide truthful information regarding your professional credentials, the conditions you treat, and the areas you service.
              </Text>
            </View>

            <View>
              <Text className="text-xl font-bold text-gray-800 mb-2">4. Acceptable Use</Text>
              <Text className="text-base text-gray-600 leading-relaxed">
                You agree not to use the application to:
                {"\n"}• Violate any local, state, national, or international law or regulation.
                {"\n"}• Misrepresent your identity, qualifications, or medical history.
                {"\n"}• Interfere with or disrupt the operation of the Platform.
                {"\n"}• Harvest or collect email addresses or other contact information of other users from the Service.
              </Text>
            </View>

            <View>
              <Text className="text-xl font-bold text-gray-800 mb-2">5. Disclaimers and Limitations of Liability</Text>
              <Text className="text-base text-gray-600 leading-relaxed">
                THE SERVICE IS PROVIDED ON AN "AS IS" AND "AS AVAILABLE" BASIS. AGAPAY MAKES NO WARRANTIES, EXPRESSED OR IMPLIED, AND HEREBY DISCLAIMS AND NEGATES ALL OTHER WARRANTIES INCLUDING, WITHOUT LIMITATION, IMPLIED WARRANTIES OR CONDITIONS OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, OR NON-INFRINGEMENT OF INTELLECTUAL PROPERTY OR OTHER VIOLATION OF RIGHTS.
                {"\n"}
                {"\n"}Agapay assumes no liability for the quality of services provided by the independent Physical Therapists, nor for any medical outcomes, injuries, or disputes between Patients and Therapists. Your interactions with others via the Platform are solely between you and such organizations and/or individuals.
              </Text>
            </View>

            <View>
              <Text className="text-xl font-bold text-gray-800 mb-2">6. Modifications to the Service and Prices</Text>
              <Text className="text-base text-gray-600 leading-relaxed">
                We reserve the right at any time to modify or discontinue the Service (or any part or content thereof) without notice at any time. We shall not be liable to you or to any third-party for any modification, price change, suspension or discontinuance of the Service.
              </Text>
            </View>

            <View>
              <Text className="text-xl font-bold text-gray-800 mb-2">7. Governing Law</Text>
              <Text className="text-base text-gray-600 leading-relaxed">
                These conditions are governed by and construed in accordance with the laws, and you irrevocably submit to the exclusive jurisdiction of the courts in that State or location.
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

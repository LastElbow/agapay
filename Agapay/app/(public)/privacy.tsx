import React from "react";
import { View, Text, ScrollView, TouchableOpacity, useWindowDimensions, Platform } from "react-native";
import { ArrowLeft } from "lucide-react-native";
import { useRouter } from "expo-router";

export default function PrivacyPolicy() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isWeb = Platform.OS === "web";
  const isLargeWeb = isWeb && width >= 768;

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
          <Text className="text-3xl font-bold text-gray-900 mb-6 text-center">Privacy Policy</Text>
          
          <Text className="text-sm text-gray-500 mb-8 text-center">Last updated: July 6, 2026</Text>

          <View className="gap-6">
            <View>
              <Text className="text-xl font-bold text-gray-800 mb-2">1. Introduction</Text>
              <Text className="text-base text-gray-600 leading-relaxed">
                Welcome to Agapay. Agapay is a mobile application developed by the Computing Education Department of the University of Mindanao ("we", "us", "our"). We are committed to protecting your personal information and your right to privacy in accordance with the Philippines Data Privacy Act of 2012 (DPA). This Privacy Policy outlines how we collect, use, process, and safeguard your data when you use the Agapay application, which connects Patients with licensed Physical Therapists.
              </Text>
            </View>

            <View>
              <Text className="text-xl font-bold text-gray-800 mb-2">2. Information We Collect</Text>
              <Text className="text-base text-gray-600 leading-relaxed mb-4">
                We collect personal information and sensitive personal information that you voluntarily provide to us when registering and using the Agapay platform.
              </Text>
              <View className="ml-4 gap-4">
                <Text className="text-base text-gray-600 leading-relaxed">
                  <Text className="font-bold text-gray-800">a) Personal Information (Non-Sensitive):</Text> Basic user details such as name, email address, password, contact information, and profile picture for both Patients and Physical Therapists.
                </Text>
                
                <Text className="text-base text-gray-600 leading-relaxed">
                  <Text className="font-bold text-gray-800">b) Sensitive Personal Information (Health & Verification Data):</Text>
                  {"\n"}• <Text className="font-bold">Health Data (Patients):</Text> To help describe your therapy needs, we collect details about your current physical complaints and concerns that you voluntarily enter during onboarding. We do not collect medical histories or doctor referral letters.
                  {"\n"}• <Text className="font-bold">Professional Credentials (Therapists):</Text> We collect Professional Regulation Commission (PRC) license details, qualifications, and verification document photos to authenticate your status. Verification photos are permanently deleted from our storage immediately after verification is completed.
                </Text>

                <Text className="text-base text-gray-600 leading-relaxed">
                  <Text className="font-bold text-gray-800">c) Precise Device Location Data:</Text> To display the real-time distance, route, and estimated arrival times on the map during active therapy sessions, we collect precise location data (GPS coordinates) from your device. This location tracking operates <Text className="font-bold">only in the foreground</Text> (when the app is open and active on your screen) during active sessions. We do not collect location data in the background or when the app is closed.
                </Text>
              </View>
            </View>

            <View>
              <Text className="text-xl font-bold text-gray-800 mb-2">3. How We Use Your Information</Text>
              <Text className="text-base text-gray-600 leading-relaxed">
                We use the information we collect or receive to:
                {"\n"}• Facilitate account registration, secure authentication, and profile configuration.
                {"\n"}• Display active session route status and therapist location on the map.
                {"\n"}• Document and manage active therapy sessions, booking schedules, and case records.
                {"\n"}• Verify therapist qualifications and enforce safety standards.
                {"\n"}• Improve and maintain platform performance.
              </Text>
            </View>

            <View>
              <Text className="text-xl font-bold text-gray-800 mb-2">4. Data Storage, Transfers, and Third Parties</Text>
              <Text className="text-base text-gray-600 leading-relaxed">
                Your personal details and physical complaint descriptions are shared exclusively within the Agapay ecosystem between matched patients and physical therapists to coordinate therapy care. We do not sell your personal data.
                {"\n\n"}
                <Text className="font-bold">Cross-Border Data Transfers:</Text> Our database services are securely hosted on cloud infrastructure provided by Supabase (AWS), which may store data outside the Philippines. We ensure all database endpoints are encrypted in transit via HTTPS/TLS and at rest.
              </Text>
            </View>

            <View>
              <Text className="text-xl font-bold text-gray-800 mb-2">5. Security and Data Retention</Text>
              <Text className="text-base text-gray-600 leading-relaxed">
                We employ technical, organizational, and physical security measures (including salted password hashing and secure token protocols) to protect your personal data. 
                {"\n\n"}
                We retain your data only for as long as your account remains active. Upon request for account deletion, all data is permanently anonymized or deleted from our active databases and backup logs within 30 days, except where retention is required by law.
              </Text>
            </View>

            <View>
              <Text className="text-xl font-bold text-gray-800 mb-2">6. Your Rights and Account Deletion</Text>
              <Text className="text-base text-gray-600 leading-relaxed">
                Under the Philippines Data Privacy Act of 2012, you are entitled to rights of access, correction, blocking, and deletion of your personal data.
                {"\n\n"}
                <Text className="font-bold">How to Delete Your Account:</Text> You can permanently delete your account and all associated data directly within the app. Navigate to <Text className="font-bold">Profile &gt; Settings &gt; Privacy</Text> and select &quot;Delete Account.&quot;
                {"\n\n"}
                For data privacy inquiries, corrections, or to file a Data Subject Access Request (DSAR), please contact our development team at <Text className="font-bold">rhenpen@gmail.com</Text>.
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

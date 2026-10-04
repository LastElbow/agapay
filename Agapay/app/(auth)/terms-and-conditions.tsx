import { Text, View, ScrollView, TouchableOpacity } from "react-native";
import { useRouter } from "expo-router";
import { ArrowLeft } from "lucide-react-native";

const TermsAndConditions = () => {
  const router = useRouter();

  return (
    <View className="flex-1 bg-gray-50">
      <View className="flex-row items-center px-5 py-4 bg-gray-50 border-b border-gray-200">
        <View className="w-full max-w-3xl mx-auto flex-row items-center justify-center">
          <TouchableOpacity
            onPress={() => router.back()}
            className="absolute left-0 flex-row items-center"
          >
            <ArrowLeft size={24} color="#3B82F6" />
            <Text className="text-[#3B82F6] text-base ml-1.5">Back</Text>
          </TouchableOpacity>
          <Text className="text-xl font-bold text-gray-800">
            Terms and Conditions
          </Text>
        </View>
      </View>
      <ScrollView contentContainerStyle={{ padding: 20 }}>
        <View className="w-full max-w-3xl mx-auto">
          <Text className="text-lg font-bold mt-5 mb-2 text-gray-700">
            1. Introduction
          </Text>
          <Text className="text-base leading-6 text-gray-600">
            By accessing this application, we assume you accept these terms and
            conditions. Do not continue to use Agapay if you do not agree to all
            of the terms and conditions stated on this page.
          </Text>
          <Text className="text-lg font-bold mt-5 mb-2 text-gray-700">
            2. Intellectual Property Rights
          </Text>
          <Text className="text-base leading-6 text-gray-600">
            Other than the content you own, under these Terms, Agapay and/or its
            licensors own all the intellectual property rights and materials
            contained in this application. You are granted a limited license
            only for purposes of viewing the material contained on this app.
          </Text>
          <Text className="text-lg font-bold mt-5 mb-2 text-gray-700">
            3. Restrictions
          </Text>
          <Text className="text-base leading-6 text-gray-600">
            You are specifically restricted from all of the following:
            {`
`}
            - Publishing any application material in any other media.
            {`
`}
            - Selling, sublicensing and/or otherwise commercializing any
            application material.
            {`
`}
            - Publicly performing and/or showing any application material.
            {`
`}
            - Using this application in any way that is or may be damaging to
            this application.
            {`
`}
            - Using this application in any way that impacts user access to this
            application.
          </Text>
          <Text className="text-lg font-bold mt-5 mb-2 text-gray-700">
            4. Your Content
          </Text>
          <Text className="text-base leading-6 text-gray-600">
            In these terms and conditions, “Your Content” shall mean any audio,
            video text, images or other material you choose to display on this
            application. By displaying Your Content, you grant Agapay a
            non-exclusive, worldwide irrevocable, sub-licensable license to use,
            reproduce, adapt, publish, translate and distribute it in any and
            all media.
          </Text>
          <Text className="text-lg font-bold mt-5 mb-2 text-gray-700">
            5. No warranties
          </Text>
          <Text className="text-base leading-6 text-gray-600">
            This application is provided “as is,” with all faults, and Agapay
            expresses no representations or warranties, of any kind related to
            this application or the materials contained on this application.
          </Text>
          <Text className="text-lg font-bold mt-5 mb-2 text-gray-700">
            6. Limitation of liability
          </Text>
          <Text className="text-base leading-6 text-gray-600">
            In no event shall Agapay, nor any of its officers, directors and
            employees, be held liable for anything arising out of or in any way
            connected with your use of this application whether such liability
            is under contract.
          </Text>
          <Text className="text-lg font-bold mt-5 mb-2 text-gray-700">
            7. Indemnification
          </Text>
          <Text className="text-base leading-6 text-gray-600">
            You hereby indemnify to the fullest extent Agapay from and against
            any and/or all liabilities, costs, demands, causes of action,
            damages and expenses arising in any way related to your breach of
            any of the provisions of these Terms.
          </Text>
          <Text className="text-lg font-bold mt-5 mb-2 text-gray-700">
            8. Severability
          </Text>
          <Text className="text-base leading-6 text-gray-600">
            If any provision of these Terms is found to be invalid under any
            applicable law, such provisions shall be deleted without affecting
            the remaining provisions herein.
          </Text>
          <Text className="text-lg font-bold mt-5 mb-2 text-gray-700">
            9. Variation of Terms
          </Text>
          <Text className="text-base leading-6 text-gray-600">
            Agapay is permitted to revise these terms at any time as it sees
            fit, and by using this application you are expected to review these
            terms on a regular basis.
          </Text>
          <Text className="text-lg font-bold mt-5 mb-2 text-gray-700">
            10. Governing Law & Jurisdiction
          </Text>
          <Text className="text-base leading-6 text-gray-600">
            These Terms will be governed by and interpreted in accordance with
            the laws of the State, and you submit to the non-exclusive
            jurisdiction of the state and federal courts located in for the
            resolution of any disputes.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
};

export default TermsAndConditions;

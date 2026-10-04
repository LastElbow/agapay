import StepBars from "@/src/components/StepBars";
import { COLORS } from "@/src/theme";
import { ArrowLeft } from "lucide-react-native";
import { useRouter } from "expo-router";
import { Text, TouchableOpacity, View } from "react-native";

type Props = {
  title: string;
  currentStep: number;
  totalSteps: number;
  /** If true, back button sends user to patient home tabs instead of history back */
  backToHome?: boolean;
  /** Optional custom back handler */
  onBack?: () => void;
  /** Optional custom right element (e.g. a help icon) */
  rightElement?: React.ReactNode;
  /** Hide step indicator when not part of a wizard */
  hideSteps?: boolean;
  /** Remove bottom border */
  noBorder?: boolean;
};

export default function RecommendHeader({
  title,
  currentStep,
  totalSteps,
  backToHome,
  onBack,
  rightElement,
  hideSteps,
  noBorder,
}: Props) {
  const router = useRouter();

  return (
    <View
      className={`px-5 pt-3 pb-3 ${
        noBorder ? "" : "border-b border-teal-100"
      }`}
      style={{ backgroundColor: '#FFFFFF' }}
    >
      {/* Row with balanced side widths to avoid overlap */}
      <View className="flex-row items-center justify-between mb-2">
        {/* Left: fixed area for back button (match right width to keep title truly centered) */}
        <View style={{ width: 80 }}>
          <TouchableOpacity
            className="flex-row items-center px-3 py-2 rounded-xl"
            onPress={() => {
              if (onBack) {
                onBack();
              } else if (backToHome) {
                router.replace("/(patient)/(tabs)");
              } else {
                router.back();
              }
            }}
          >
            <ArrowLeft size={20} color={COLORS.PRIMARY} />
            <Text className="text-base font-semibold ml-1" style={{ color: '#0D9488' }}>
              Back
            </Text>
          </TouchableOpacity>
        </View>

        {/* Center: truly centered within remaining space */}
        <View className="flex-1 items-center">
          <Text className="text-xl font-bold text-gray-900" numberOfLines={1}>{title}</Text>
        </View>

        {/* Right: reserve enough width for the action chip */}
        <View style={{ width: 80 }} className="items-end">
          {rightElement}
        </View>
      </View>

      {!hideSteps && (
        <View className="mt-1">
          <StepBars currentStep={currentStep} totalSteps={totalSteps} />
        </View>
      )}
    </View>
  );
}

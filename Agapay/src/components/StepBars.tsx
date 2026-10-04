import { COLORS } from "@/src/theme";
import { StyleSheet, View } from "react-native";

type Props = {
  currentStep: number;
  totalSteps: number;
};

// currentStep is 0-based (first step = 0). For a 1-based dot indicator, see StepDots.
export default function StepBars({ currentStep, totalSteps }: Props) {
  return (
    <View style={styles.container}>
      {Array.from({ length: totalSteps }).map((_, index) => (
        <View
          key={index}
          style={[
            styles.dot,
            index === currentStep ? styles.activeDot : styles.inactiveDot,
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
  },
  dot: {
    height: 8,
    width: 25,
    borderRadius: 4,
    marginHorizontal: 4,
  },
  activeDot: {
    backgroundColor: COLORS.PRIMARY,
  },
  inactiveDot: {
    backgroundColor: "#D1D5DB",
  },
});

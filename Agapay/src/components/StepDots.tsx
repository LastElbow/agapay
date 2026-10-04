import React from "react";
import { StyleSheet, View } from "react-native";

interface StepDotsProps {
  currentStep: number;
  totalSteps: number;
}

// currentStep is 1-based (first step = 1). For a 0-based indicator, see StepBars.
export default function StepDots({
  currentStep,
  totalSteps,
}: StepDotsProps) {
  return (
    <View style={styles.dotsContainer}>
      {Array.from({ length: totalSteps }).map((_, i) => (
        <View
          key={i}
          style={[styles.dot, i === currentStep - 1 && styles.activeDot]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  dotsContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginVertical: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 8,
    backgroundColor: "#E5E7EB",
    marginHorizontal: 4,
  },
  activeDot: { 
    backgroundColor: "#3B82F6", 
    width: 32, 
    borderRadius: 8 
  },
});

import { COLORS } from "@/src/theme";
import React from "react";
import { Dimensions, SafeAreaView, StyleSheet, ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const { height, width } = Dimensions.get("window");

type Props = {
  children?: React.ReactNode;
  style?: ViewStyle | ViewStyle[];
};

export default function Screen({ children, style }: Props) {
  const insets = useSafeAreaInsets();

  // add safe-area insets to the existing top/bottom spacing so layout
  // remains consistent across devices (not a breaking change)
  const dynamicPadding = {
    paddingTop: insets.top + height * 0.03,
    paddingBottom: insets.bottom + height * 0.06,
  };

  return (
    <SafeAreaView style={[styles.container, dynamicPadding, style]}>
      {children}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.BG,
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: width * 0.06,
  },
});

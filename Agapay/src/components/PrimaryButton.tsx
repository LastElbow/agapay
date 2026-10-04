import { COLORS, FONTS } from "@/src/theme";
import React from "react";
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  Text,
  TextStyle,
  TouchableOpacity,
  ViewStyle,
} from "react-native";

type Props = {
  children?: React.ReactNode;
  title?: string;
  onPress?: () => void;
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle | ViewStyle[];
  textStyle?: TextStyle | TextStyle[];
  accessibilityLabel?: string;
};

export default function PrimaryButton({
  children,
  title,
  onPress,
  disabled,
  loading,
  style,
  textStyle,
  accessibilityLabel,
}: Props) {
  // Normalize incoming style(s) into a single object so we can
  // selectively override backgroundColor when disabled/loading.
  const flattenedStyle = Array.isArray(style)
    ? Object.assign({}, ...style)
    : (style as ViewStyle) ?? {};

  const backgroundColor =
    disabled || loading
      ? styles.disabled.backgroundColor
      : flattenedStyle.backgroundColor ?? COLORS.PRIMARY;

  const mergedStyle: ViewStyle = {
    ...styles.button,
    backgroundColor,
    ...flattenedStyle,
  };

  return (
    <TouchableOpacity
      activeOpacity={0.9}
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityLabel={accessibilityLabel}
      style={mergedStyle}
    >
      {loading ? (
        <ActivityIndicator color="#FFFFFF" />
      ) : (
        <Text style={[styles.text, textStyle]}>{children ?? title}</Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: "center",
    // marginBottom: 16,
    width: "100%",
    alignSelf: "center",
  },
  primary: {
    backgroundColor: COLORS.PRIMARY,
  },
  disabled: {
    backgroundColor: "#B0B0B0",
  },
  text: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFFFFF",
    // Use a web-safe stack on web (so it doesn't fall back to serif while the webfont loads).
    // On native we use the loaded Inter semi-bold font name.
    fontFamily:
      Platform.OS === "web"
        ? 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial'
        : FONTS.MAIN_SEMI,
  },
});

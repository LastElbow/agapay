import { COLORS, FONTS } from "@/src/theme";
import React from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextStyle,
  TouchableOpacity,
  View,
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
  active?: boolean;
  leftElement?: React.ReactNode;
  topElement?: React.ReactNode;
  accessibilityLabel?: string;
};

export default function SecondaryButton({
  children,
  title,
  onPress,
  disabled,
  loading,
  style,
  textStyle,
  active,
  leftElement,
  topElement,
  accessibilityLabel,
}: Props) {
  const flattenedStyle = Array.isArray(style)
    ? Object.assign({}, ...style)
    : (style as ViewStyle) ?? {};

  // When disabled or loading, make the border and text muted and background slightly muted
  const isDisabled = !!disabled || !!loading;
  const isActive = !!active;

  // Compute visual states
  let borderColor: string;
  let backgroundColor: string;
  let textColor: string;

  if (isDisabled) {
    borderColor = flattenedStyle.borderColor ?? "#D1D5DB";
    backgroundColor = flattenedStyle.backgroundColor ?? "#FFFFFF";
    textColor = (flattenedStyle as any).color ?? "#9CA3AF";
  } else if (isActive) {
    // Active state: colored border and text (use provided borderColor when present)
    borderColor = flattenedStyle.borderColor ?? COLORS.PRIMARY;
    backgroundColor = flattenedStyle.backgroundColor ?? "#FFFFFF";
    textColor = (flattenedStyle as any).color ?? borderColor;
  } else {
    // Inactive default: light gray border, very light gray background, muted text
    borderColor = flattenedStyle.borderColor ?? "#D1D5DB"; // gray-300
    backgroundColor = flattenedStyle.backgroundColor ?? "#F7F7F7"; // very light gray
    textColor = (flattenedStyle as any).color ?? "#6B7280"; // gray-500
  }

  const mergedStyle: ViewStyle = {
    ...styles.button,
    backgroundColor,
    borderColor,
    ...flattenedStyle,
  };

  return (
    <TouchableOpacity
      activeOpacity={0.9}
      onPress={onPress}
      disabled={isDisabled}
      accessibilityLabel={accessibilityLabel}
      style={[mergedStyle, topElement ? styles.columnButton : null]}
    >
      {loading ? (
        <ActivityIndicator color={textColor} />
      ) : topElement ? (
        <>
          <View style={styles.topWrap as any}>{topElement}</View>
          <Text style={[styles.text, { color: textColor }, textStyle]}>
            {children ?? title}
          </Text>
        </>
      ) : (
        <>
          {leftElement ? (
            <React.Fragment>
              <View style={styles.leftWrap as any}>{leftElement}</View>
            </React.Fragment>
          ) : null}
          <Text style={[styles.text, { color: textColor }, textStyle]}>
            {children ?? title}
          </Text>
        </>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: "center",
    width: "100%",
    alignSelf: "center",
    borderWidth: 2,
    flexDirection: "row",
    justifyContent: "center",
  },
  text: {
    fontSize: 16,
    fontWeight: "600",
    fontFamily: FONTS.MAIN,
  },
  leftWrap: {
    marginRight: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  topWrap: {
    marginBottom: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  columnButton: {
    flexDirection: "column",
  },
});

import React from "react";
import {
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
} from "react-native";

type Props = {
  label: string;
  value: string;
  onChangeText?: (text: string) => void;
  placeholder?: string;
  inputProps?: TextInputProps;
  containerStyle?: StyleProp<ViewStyle>;
  rightElement?: React.ReactNode;
  labelStyle?: any;
  inputStyle?: any;
};

export default function FormField({
  label,
  value,
  onChangeText,
  placeholder = "",
  inputProps = {},
  containerStyle,
  rightElement,
  labelStyle,
  inputStyle,
}: Props) {
  const hasRight = Boolean(rightElement);

  return (
    <View style={[styles.container, containerStyle]}>
      <Text style={[styles.label, labelStyle]}>{label}</Text>
      <View style={styles.inputWrapper}>
        <TextInput
          style={[styles.input, hasRight && styles.inputWithRight, inputStyle]}
          placeholder={placeholder}
          placeholderTextColor="#CFCFCF"
          value={value}
          onChangeText={onChangeText}
          {...inputProps}
        />
        {hasRight ? <View style={styles.right}>{rightElement}</View> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignSelf: "stretch",
  },
  label: {
    fontSize: 16,
    color: "#6B7280",
    marginTop: 12,
    marginBottom: 6,
    fontWeight: "500",
  },
  inputWrapper: {
    position: "relative",
  },
  input: {
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    fontSize: 16,
    alignSelf: "stretch",
  },
  inputWithRight: {
    paddingRight: 44,
    marginBottom: 0,
  },
  right: {
    position: "absolute",
    right: 8,
    top: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "transparent",
    paddingHorizontal: 6,
  },
});

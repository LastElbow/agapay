import React from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from "react-native";

type Props = {
  visible: boolean;
  title?: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  showCancel?: boolean;
  onConfirm?: () => void;
  onCancel?: () => void;
  // variant can be used to style (error/info)
  variant?: "info" | "warning" | "error" | "confirm";
  children?: React.ReactNode;
  isConfirmDisabled?: boolean;
  isDestructive?: boolean;
  // render a larger modal (useful for cancel/reschedule forms)
  large?: boolean;
};

export default function InAppModal({
  visible,
  title,
  message,
  confirmText = "OK",
  cancelText = "Cancel",
  showCancel = false,
  onConfirm,
  onCancel,
  variant = "confirm",
  children,
  isConfirmDisabled = false,
  isDestructive = false,
  large = false,
}: Props) {
  const cardVariantStyle =
    variant === "error"
      ? styles.cardError
      : variant === "warning"
        ? styles.cardWarning
        : variant === "info"
          ? styles.cardInfo
          : undefined;

  const titleVariantStyle =
    variant === "error"
      ? styles.titleError
      : variant === "warning"
        ? styles.titleWarning
        : variant === "info"
          ? styles.titleInfo
          : undefined;

  const messageVariantStyle =
    variant === "error"
      ? styles.messageError
      : variant === "warning"
        ? styles.messageWarning
        : variant === "info"
          ? styles.messageInfo
          : undefined;

  const confirmButtonVariantStyle =
    variant === "error"
      ? styles.confirmButtonError
      : variant === "warning"
        ? styles.confirmButtonWarning
        : variant === "info"
          ? styles.confirmButtonInfo
          : undefined;

  const confirmTextVariantStyle =
    variant === "error"
      ? styles.confirmTextError
      : variant === "warning"
        ? styles.confirmTextWarning
        : variant === "info"
          ? styles.confirmTextInfo
          : undefined;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={() => {
        if (onCancel) onCancel();
      }}
    >
      <View style={styles.overlay}>
        <View style={[styles.card, cardVariantStyle, large && styles.cardLarge]}>
          {/* Fixed header - title and message */}
          {(title || message) && (
            <View>
              {title ? (
                <Text style={[styles.title, titleVariantStyle]}>{title}</Text>
              ) : null}
              {message ? (
                <Text style={[styles.message, messageVariantStyle]}>{message}</Text>
              ) : null}
            </View>
          )}

          {/* Scrollable content - only children */}
          {children && (
            <ScrollView
              style={[styles.content, large && styles.contentLarge]}
              contentContainerStyle={styles.contentContainer}
              showsVerticalScrollIndicator={false}
            >
              {children}
            </ScrollView>
          )}

          {/* Fixed buttons at bottom */}
          <View style={styles.buttonRow}>
            {showCancel ? (
              <TouchableOpacity
                style={[styles.button, styles.cancelButton]}
                onPress={() => {
                  if (onCancel) onCancel();
                }}
                activeOpacity={0.8}
              >
                <Text style={[styles.buttonText, styles.cancelText]}>
                  {cancelText}
                </Text>
              </TouchableOpacity>
            ) : null}

            <TouchableOpacity
              style={[
                styles.button,
                styles.confirmButton,
                confirmButtonVariantStyle,
                isDestructive && styles.destructiveButton,
                isConfirmDisabled && styles.disabledButton,
              ]}
              onPress={() => {
                if (isConfirmDisabled) return;
                if (onConfirm) onConfirm();
              }}
              activeOpacity={isConfirmDisabled ? 1 : 0.85}
              disabled={isConfirmDisabled}
            >
              <Text
                style={[
                  styles.buttonText,
                  styles.confirmText,
                  confirmTextVariantStyle,
                  isDestructive && styles.destructiveText,
                  isConfirmDisabled && styles.disabledText,
                ]}
              >
                {confirmText}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    paddingVertical: 18,
  },
  card: {
    width: "100%",
    maxWidth: 520,
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    // Keep the card within the viewport on small screens
    maxHeight: "85%",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    elevation: 8,
  },
  cardLarge: {
    maxHeight: "94%",
  },
  cardInfo: {
    borderWidth: 1,
    borderColor: "#38BDF8",
  },
  cardWarning: {
    borderWidth: 2,
    borderColor: "#F97316",
    shadowColor: "#B45309",
  },
  cardError: {
    borderWidth: 2,
    borderColor: "#DC2626",
    shadowColor: "#991B1B",
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111",
    marginBottom: 8,
  },
  titleInfo: {
    color: "#0C4A6E",
  },
  titleWarning: {
    color: "#B45309",
  },
  titleError: {
    color: "#B91C1C",
  },
  message: {
    fontSize: 15,
    color: "#333",
    marginBottom: 20,
    lineHeight: 20,
  },
  messageInfo: {
    color: "#0F172A",
  },
  messageWarning: {
    color: "#7C2D12",
  },
  messageError: {
    color: "#7F1D1D",
  },
  content: {
    // Let the scrollable area expand but keep room for buttons
    flexGrow: 1,
    maxHeight: "80%", // Increased from 70% to give more space
  },
  contentLarge: {
    maxHeight: "88%",
  },
  contentContainer: {
    paddingBottom: 8,
  },
  buttonRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
    marginTop: 12,
    // ensure buttons are always visible
    alignSelf: "stretch",
  },
  button: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    minWidth: 90,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelButton: {
    backgroundColor: "#F1F1F1",
  },
  confirmButton: {
    backgroundColor: "#089769",
  },
  confirmButtonInfo: {
    backgroundColor: "#0EA5E9",
  },
  confirmButtonWarning: {
    backgroundColor: "#EA580C",
  },
  confirmButtonError: {
    backgroundColor: "#DC2626",
  },
  destructiveButton: {
    backgroundColor: "#DC2626",
  },
  disabledButton: {
    backgroundColor: "#9CA3AF",
  },
  buttonText: {
    fontSize: 15,
    fontWeight: "600",
  },
  cancelText: {
    color: "#333",
  },
  confirmText: {
    color: "#FFF",
  },
  confirmTextInfo: {
    color: "#E0F2FE",
  },
  confirmTextWarning: {
    color: "#FFF7ED",
  },
  confirmTextError: {
    color: "#FEE2E2",
  },
  destructiveText: {
    color: "#FFF",
  },
  disabledText: {
    color: "#E5E7EB",
  },
});

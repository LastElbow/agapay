import type { ChatMessageDto } from "@/src/services/chat";
import {
  extractSessionProposalDisplayText,
  parseSessionProposalResponse,
} from "@/src/features/chat/core/sessionProposal";
import { Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";

type Props = {
  message: ChatMessageDto;
  isMine?: boolean;
  onPressImage?: (uri: string) => void;
};

export default function ChatItem({
  message,
  isMine = false,
  onPressImage,
}: Props) {
  const messageType = String(message.messageType ?? "TEXT").toUpperCase();
  const hasImage = messageType === "IMAGE" && Boolean(message.signedUrl);
  let content = message.content ?? "";

  const proposalDisplay = extractSessionProposalDisplayText(content);
  if (proposalDisplay) {
    content = proposalDisplay;
  }

  const response = parseSessionProposalResponse(content);
  if (response) {
    if (response.status === "accepted" || response.status === "confirmed") {
      content = "✅ Session proposal accepted";
    } else if (response.status === "declined") {
      content = "❌ Session proposal declined";
    } else {
      content = `Session proposal ${response.status}`;
    }
  }

  if (hasImage) {
    return (
      <View style={styles.imageContainer}>
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => onPressImage?.(message.signedUrl!)}
        >
          <Image
            source={{ uri: message.signedUrl! }}
            style={styles.image}
            resizeMode="cover"
          />
        </TouchableOpacity>
        {content ? (
          <Text
            style={[
              styles.caption,
              isMine ? styles.captionMine : styles.captionTheirs,
            ]}
          >
            {content}
          </Text>
        ) : null}
      </View>
    );
  }

  if (messageType === "IMAGE") {
    return (
      <Text style={[styles.text, isMine ? styles.textMine : styles.textTheirs]}>
        Unable to display image. Please refresh to request a new link.
      </Text>
    );
  }

  return (
    <Text style={[styles.text, isMine ? styles.textMine : styles.textTheirs]}>
      {content}
    </Text>
  );
}

const styles = StyleSheet.create({
  text: {
    fontSize: 14,
    lineHeight: 20,
  },
  textMine: {
    color: "#FFFFFF",
  },
  textTheirs: {
    color: "#1F2933",
  },
  imageContainer: {
    gap: 6,
  },
  image: {
    width: 220,
    height: 220,
    borderRadius: 18,
    backgroundColor: "#E5E7EB",
  },
  caption: {
    fontSize: 13,
    lineHeight: 18,
  },
  captionMine: {
    color: "#1F2933",
  },
  captionTheirs: {
    color: "#111827",
  },
});

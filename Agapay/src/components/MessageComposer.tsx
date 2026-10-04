import { memo, useState, useCallback } from "react";
import {
  View,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  NativeSyntheticEvent,
  TextInputKeyPressEventData,
  Image,
} from "react-native";
import { Send, Image as ImageIcon, X } from "lucide-react-native";

type MessageComposerProps = {
  onSend: (message: string, imageUri?: string) => Promise<void>;
  onPickImage: () => Promise<void>;
  isBlocked: boolean;
  isSending: boolean;
  isUploadingImage: boolean;
  placeholder: string;
  disabled?: boolean;
  pendingImageUri?: string | null;
  onRemovePendingImage?: () => void;
};

const MessageComposer = memo(
  ({
    onSend,
    onPickImage,
    isBlocked,
    isSending,
    isUploadingImage,
    placeholder,
    disabled = false,
    pendingImageUri,
    onRemovePendingImage,
  }: MessageComposerProps) => {
    const [inputValue, setInputValue] = useState("");

    const handleSend = useCallback(async () => {
      const trimmed = inputValue.trim();
      const hasImage = Boolean(pendingImageUri);

      if (!trimmed && !hasImage) return;

      try {
        await onSend(trimmed, pendingImageUri ?? undefined);
        setInputValue("");
      } catch (err) {
        console.warn("Failed to send message in MessageComposer", err);
      }
    }, [inputValue, onSend, pendingImageUri]);

    // Handle Enter key press on web to send message (Shift+Enter for new line)
    const handleKeyPress = useCallback(
      (e: NativeSyntheticEvent<TextInputKeyPressEventData>) => {
        if (Platform.OS === "web") {
          const nativeEvent = e.nativeEvent as any;
          if (nativeEvent.key === "Enter" && !nativeEvent.shiftKey) {
            e.preventDefault();
            handleSend();
          }
        }
      },
      [handleSend],
    );

    const composerBusy = isSending || isUploadingImage;
    const composerDisabled = disabled || isBlocked;
    const hasImage = Boolean(pendingImageUri);
    const canSend =
      (Boolean(inputValue.trim()) || hasImage) &&
      !composerBusy &&
      !composerDisabled;

    return (
      <View className="px-4 py-3 bg-neutral-900 border-t border-neutral-800">
        {/* Image Preview */}
        {pendingImageUri && (
          <View className="mb-3 relative self-start">
            <Image
              source={{ uri: pendingImageUri }}
              style={{ width: 80, height: 80, borderRadius: 12 }}
              resizeMode="cover"
            />
            <TouchableOpacity
              onPress={onRemovePendingImage}
              className="absolute -top-2 -right-2 bg-gray-800 rounded-full p-1"
              activeOpacity={0.7}
            >
              <X color="#FFFFFF" size={14} />
            </TouchableOpacity>
          </View>
        )}

        <View className="flex-row items-center bg-neutral-800 rounded-xl border border-neutral-700 px-3 py-2">
          <TouchableOpacity
            className={`p-2 mr-2 ${
              composerDisabled || composerBusy ? "opacity-40" : ""
            }`}
            activeOpacity={0.75}
            onPress={onPickImage}
            disabled={composerDisabled || composerBusy}
          >
            {isUploadingImage ? (
              <ActivityIndicator size="small" color="#4C6EF5" />
            ) : (
              <ImageIcon color="#D1D5DB" size={20} />
            )}
          </TouchableOpacity>

          <TextInput
            placeholder={placeholder}
            placeholderTextColor="#9CA3AF"
            className="flex-1 min-h-[40px] max-h-[100px] text-base text-gray-100"
            multiline
            value={inputValue}
            onChangeText={setInputValue}
            editable={!composerBusy && !composerDisabled}
            onSubmitEditing={handleSend}
            onKeyPress={handleKeyPress}
            blurOnSubmit={false}
          />

          <TouchableOpacity
            className={`p-2 ml-2 ${!canSend && "opacity-40"}`}
            activeOpacity={0.8}
            onPress={handleSend}
            disabled={!canSend}
          >
            {composerBusy ? (
              <ActivityIndicator size="small" color="#0D9488" />
            ) : (
              <Send color="#0D9488" size={20} />
            )}
          </TouchableOpacity>
        </View>
      </View>
    );
  },
);

MessageComposer.displayName = "MessageComposer";

export default MessageComposer;

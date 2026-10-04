import { memo, useCallback } from "react";
import {
  Modal,
  View,
  Image,
  TouchableOpacity,
  StatusBar,
  Dimensions,
  Platform,
} from "react-native";
import { X } from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type ImageViewerModalProps = {
  visible: boolean;
  imageUri: string | null;
  onClose: () => void;
};

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

const ImageViewerModal = memo(({ visible, imageUri, onClose }: ImageViewerModalProps) => {
  const handleBackdropPress = useCallback(() => {
    onClose();
  }, [onClose]);

  if (!imageUri) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <StatusBar barStyle="light-content" backgroundColor="rgba(0,0,0,0.95)" />
      <View
        style={{
          flex: 1,
          backgroundColor: "rgba(0, 0, 0, 0.95)",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        {/* Close button */}
        <SafeAreaView
          edges={["top"]}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            zIndex: 10,
          }}
        >
          <View
            style={{
              flexDirection: "row",
              justifyContent: "flex-end",
              paddingHorizontal: 16,
              paddingTop: Platform.OS === "android" ? 12 : 8,
            }}
          >
            <TouchableOpacity
              onPress={onClose}
              activeOpacity={0.7}
              style={{
                width: 40,
                height: 40,
                borderRadius: 20,
                backgroundColor: "rgba(255, 255, 255, 0.15)",
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              <X color="#FFFFFF" size={22} />
            </TouchableOpacity>
          </View>
        </SafeAreaView>

        {/* Image – tap backdrop to dismiss */}
        <TouchableOpacity
          activeOpacity={1}
          onPress={handleBackdropPress}
          style={{
            flex: 1,
            width: "100%",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <Image
            source={{ uri: imageUri }}
            style={{
              width: SCREEN_WIDTH,
              height: SCREEN_HEIGHT * 0.75,
            }}
            resizeMode="contain"
          />
        </TouchableOpacity>
      </View>
    </Modal>
  );
});

ImageViewerModal.displayName = "ImageViewerModal";

export default ImageViewerModal;

import ConversationView from "@/src/components/ConversationView";
import { SafeAreaView } from "react-native-safe-area-context";

export default function ConversationScreen() {
  return (
    <SafeAreaView
      className="flex-1 bg-neutral-900"
      edges={["top", "left", "right", "bottom"]}
    >
      <ConversationView />
    </SafeAreaView>
  );
}

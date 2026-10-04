import { ServiceItem } from "@/src/constants/serviceCatalog";
import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

type Props = {
  title: string;
  services: ServiceItem[];
  isOpen: boolean;
  onPress: () => void;
};

export default function CollapsibleCategory({
  title,
  services,
  isOpen,
  onPress,
}: Props) {
  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.header} onPress={onPress}>
        <Text>{title}</Text>
        <Ionicons
          name={isOpen ? "chevron-up" : "chevron-down"}
          size={24}
          color="#333"
        />
      </TouchableOpacity>

      {isOpen && (
        <View style={styles.content}>
          {services.map((service) => (
            <Text key={service.id} style={styles.serviceText}>
              {service.name}
            </Text>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#fff",
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
  },
  content: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: "#e0e0e0",
  },
  serviceText: {
    marginBottom: 8,
  },
});

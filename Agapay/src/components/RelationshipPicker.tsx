
import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  FlatList,
  StyleSheet,
} from "react-native";
import { FontAwesome5 } from "@expo/vector-icons";

const relationships = [
  "Parent",
  "Spouse",
  "Child",
  "Sibling",
  "Friend",
  "Other",
];

interface RelationshipPickerProps {
  onSelect: (relationship: string) => void;
}

export default function RelationshipPicker({
  onSelect,
}: RelationshipPickerProps) {
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedRelationship, setSelectedRelationship] = useState<
    string | null
  >(null);

  const handleSelect = (relationship: string) => {
    setSelectedRelationship(relationship);
    onSelect(relationship);
    setModalVisible(false);
  };

  return (
    <>
      <TouchableOpacity
        style={styles.optionButton}
        onPress={() => setModalVisible(true)}
      >
        <FontAwesome5 name="user-friends" size={40} color="#007AFF" />
        <Text style={styles.optionText}>For someone else</Text>
        {selectedRelationship && (
          <Text style={styles.selectedText}>({selectedRelationship})</Text>
        )}
      </TouchableOpacity>

      <Modal
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          onPress={() => setModalVisible(false)}
        >
          <View style={styles.modalContent}>
            <FlatList
              data={relationships}
              keyExtractor={(item) => item}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.relationshipItem}
                  onPress={() => handleSelect(item)}
                >
                  <Text style={styles.relationshipText}>{item}</Text>
                </TouchableOpacity>
              )}
            />
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  optionButton: {
    backgroundColor: "#FFFFFF",
    padding: 22,
    borderRadius: 14,
    alignItems: "center",
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#E6E6E6",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  optionText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111",
    marginTop: 12,
  },
  selectedText: {
    fontSize: 14,
    color: "#666",
    marginTop: 4,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  modalContent: {
    backgroundColor: "white",
    borderRadius: 14,
    padding: 20,
    width: "80%",
    maxHeight: "60%",
  },
  relationshipItem: {
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: "#E6E6E6",
  },
  relationshipText: {
    fontSize: 16,
    textAlign: "center",
  },
});

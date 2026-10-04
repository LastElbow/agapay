import React, { useEffect, useState, useMemo } from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  TextInput,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  Platform,
} from "react-native";
import apiClient from "@/api/client";
import { formStore } from "@/src/stores/formStore";
import { createCache } from "@/src/utils/cache";

interface Barangay {
  id: number;
  name: string;
}

interface BarangaySelectorProps {
  /** Optional callback when a barangay is selected */
  onSelect?: (barangay: Barangay) => void;
}

const barangayCache = createCache<Barangay[]>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

const BarangaySelector: React.FC<BarangaySelectorProps> = ({ onSelect }) => {
  const [visible, setVisible] = useState(false);
  const [barangays, setBarangays] = useState<Barangay[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Detect wide-web to use a centered, non-fullscreen modal
  const isWeb = Platform.OS === "web";
  const [isWideWeb, setIsWideWeb] = useState(
    isWeb && typeof window !== "undefined" ? window.innerWidth >= 1024 : false,
  );
  useEffect(() => {
    if (!isWeb || typeof window === "undefined") return;
    const onResize = () => setIsWideWeb(window.innerWidth >= 1024);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [isWeb]);

  const selectedName = formStore.getBarangayName();

  useEffect(() => {
    if (!visible) return;

    if (barangayCache.hasData() && !barangayCache.isStale(CACHE_TTL)) {
      setBarangays(barangayCache.get()!);
      return;
    }

    setLoading(true);
    setError(null);
    apiClient
      .get("/api/Onboarding/service-areas")
      .then((res) => {
        const data = Array.isArray(res.data) ? res.data : [];
        data.sort((a: Barangay, b: Barangay) =>
          a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
        );
        setBarangays(data);
        barangayCache.set(data);
      })
      .catch(() => {
        setError("Failed to load barangays");
        barangayCache.invalidate();
      })
      .finally(() => setLoading(false));
  }, [visible]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return barangays;
    return barangays.filter((b) => b.name.toLowerCase().includes(q));
  }, [barangays, query]);

  const handleSelect = (b: Barangay) => {
    formStore.setBarangayId(b.id);
    formStore.setBarangayName(b.name);
    setVisible(false);
    // Notify parent component of selection
    onSelect?.(b);
  };

  const ModalContent = (
    <View style={styles.modalInner}>
      <View style={styles.modalHeader}>
        <Text style={styles.modalTitle}>Select Barangay</Text>
        <TouchableOpacity
          onPress={() => setVisible(false)}
          style={styles.closeBtn}
        >
          <Text style={styles.closeText}>Close</Text>
        </TouchableOpacity>
      </View>
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Search barangay"
        placeholderTextColor="#999"
        style={styles.search}
        autoCapitalize="none"
      />
      {loading ? (
        <ActivityIndicator
          size="small"
          color="#0D9488"
          style={{ marginTop: 12 }}
        />
      ) : error ? (
        <Text style={styles.error}>{error}</Text>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(i) => String(i.id)}
          renderItem={({ item }) => {
            const selected = formStore.getBarangayId() === item.id;
            return (
              <TouchableOpacity
                style={[styles.item, selected && styles.itemSelected]}
                onPress={() => handleSelect(item)}
                activeOpacity={0.7}
              >
                <Text
                  style={[styles.itemText, selected && styles.itemTextSelected]}
                >
                  {item.name}
                </Text>
              </TouchableOpacity>
            );
          }}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: 16 }}
          style={{ maxHeight: 480 }}
        />
      )}
    </View>
  );

  return (
    <View style={{ marginTop: 16 }}>
      <Text style={styles.label}>Barangay</Text>
      <TouchableOpacity
        style={styles.selector}
        onPress={() => setVisible(true)}
        activeOpacity={0.7}
      >
        <Text
          style={[styles.selectorText, !selectedName && styles.placeholder]}
        >
          {selectedName || "Select Barangay"}
        </Text>
      </TouchableOpacity>
      <Modal
        visible={visible}
        animationType={isWeb && isWideWeb ? "fade" : "slide"}
        transparent={isWeb && isWideWeb}
        onRequestClose={() => setVisible(false)}
      >
        {isWeb && isWideWeb ? (
          <View style={styles.overlayCenter}>
            <View style={styles.centeredCard}>{ModalContent}</View>
          </View>
        ) : (
          <View style={styles.modalContainer}>{ModalContent}</View>
        )}
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  label: {
    fontSize: 12,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  selector: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  selectorText: { fontSize: 16, color: "#111827" },
  placeholder: { color: "#9CA3AF" },
  modalContainer: {
    flex: 1,
    backgroundColor: "#fff",
    paddingTop: 60,
    paddingHorizontal: 20,
  },
  modalInner: { paddingTop: 0, paddingHorizontal: 0, flexGrow: 1 },
  overlayCenter: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  centeredCard: {
    backgroundColor: "#fff",
    width: "100%",
    maxWidth: 560,
    borderRadius: 24,
    padding: 20,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  modalHeader: { flexDirection: "row", alignItems: "center", marginBottom: 12 },
  modalTitle: { flex: 1, fontSize: 18, fontWeight: "700", textAlign: "center" },
  closeBtn: { position: "absolute", right: 0, padding: 8 },
  closeText: { color: "#089769", fontSize: 14, fontWeight: "500" },
  search: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    fontSize: 16,
  },
  item: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    marginBottom: 8,
  },
  itemSelected: { backgroundColor: "#089769", borderColor: "#089769" },
  itemText: { color: "#111827" },
  itemTextSelected: { color: "#fff", fontWeight: "600" },
  error: { color: "#DC2626", textAlign: "center", marginTop: 12 },
});

export default BarangaySelector;

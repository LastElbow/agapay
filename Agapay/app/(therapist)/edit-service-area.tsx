import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useState, useCallback } from "react";
import {
    ActivityIndicator,
    Animated,
    Alert,
    Platform,
    ScrollView,
    Text,
    TextInput,
    TouchableOpacity,
    useWindowDimensions,
    View,
    Modal,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Check, X } from "lucide-react-native";
import WebHeader from "@/src/components/WebHeader";
import apiClient from "@/api/client";
import { useAuth } from "@/src/providers/AuthProvider";
import { useQueryClient } from "@tanstack/react-query";

type ServiceArea = { id: number; name: string };

export default function EditServiceArea() {
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const queryClient = useQueryClient();
    const { width } = useWindowDimensions();
    const isDesktop = Platform.OS === "web" && width >= 768;
    const { accessToken } = useAuth();

    const [serviceAreas, setServiceAreas] = useState<ServiceArea[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [selectedIds, setSelectedIds] = useState<number[]>([]);
    const [originalIds, setOriginalIds] = useState<number[]>([]);
    const [query, setQuery] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [showAll, setShowAll] = useState(false);
    const [showSuccessModal, setShowSuccessModal] = useState(false);
    const [showUnsavedModal, setShowUnsavedModal] = useState(false);

    const INITIAL_DISPLAY_COUNT = 8;

    // Animation for sticky button
    const [buttonOpacity] = useState(new Animated.Value(0));

    // Check for unsaved changes
    const hasUnsavedChanges = useMemo(() => {
        if (originalIds.length !== selectedIds.length) return true;
        const sortedOriginal = [...originalIds].sort();
        const sortedSelected = [...selectedIds].sort();
        return JSON.stringify(sortedOriginal) !== JSON.stringify(sortedSelected);
    }, [originalIds, selectedIds]);

    // Animate button appearance when there are changes
    useEffect(() => {
        Animated.timing(buttonOpacity, {
            toValue: hasUnsavedChanges ? 1 : 0,
            duration: 300,
            useNativeDriver: true,
        }).start();
    }, [hasUnsavedChanges, buttonOpacity]);

    // Fetch service areas and current selections
    useEffect(() => {
        let mounted = true;
        setLoading(true);

        const fetchData = async () => {
            try {
                // Fetch all available service areas
                const [areasRes, profileRes] = await Promise.all([
                    apiClient.get("/api/Onboarding/service-areas", {
                        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
                    }),
                    apiClient.get("/api/Therapist/me/details", {
                        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
                    }),
                ]);

                if (!mounted) return;

                const data = areasRes.data ?? [];
                if (Array.isArray(data)) {
                    data.sort((a: ServiceArea, b: ServiceArea) => {
                        const nameA = String(a?.name ?? "").trim();
                        const nameB = String(b?.name ?? "").trim();

                        const startsWithDigit = (s: string) => /^\d/.test(s);
                        const startsWithLetter = (s: string) => /^[A-Za-z]/.test(s);

                        const aIsLetter = startsWithLetter(nameA);
                        const bIsLetter = startsWithLetter(nameB);
                        const aIsDigit = startsWithDigit(nameA);
                        const bIsDigit = startsWithDigit(nameB);

                        if (aIsLetter && bIsDigit) return -1;
                        if (bIsLetter && aIsDigit) return 1;

                        return nameA.localeCompare(nameB, undefined, {
                            sensitivity: "base",
                            numeric: false,
                        });
                    });
                }
                setServiceAreas(data);

                // Set current selections from profile
                const currentIds = profileRes.data?.serviceAreaIds || [];
                setSelectedIds(currentIds);
                setOriginalIds(currentIds);
            } catch (err) {
                console.warn("Failed to fetch data", err);
                setError("Failed to load service areas.");
            } finally {
                if (mounted) setLoading(false);
            }
        };

        fetchData();

        return () => {
            mounted = false;
        };
    }, [accessToken]);

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return serviceAreas;
        return serviceAreas.filter((s) => s.name.toLowerCase().includes(q));
    }, [serviceAreas, query]);

    // Display only a limited number of items when not searching and showAll is false
    const displayedItems = useMemo(() => {
        const isSearching = query.trim().length > 0;
        if (isSearching || showAll) {
            return filtered;
        }
        return filtered.slice(0, INITIAL_DISPLAY_COUNT);
    }, [filtered, query, showAll, INITIAL_DISPLAY_COUNT]);

    const hasMore = useMemo(() => {
        const isSearching = query.trim().length > 0;
        return !isSearching && filtered.length > INITIAL_DISPLAY_COUNT;
    }, [filtered, query, INITIAL_DISPLAY_COUNT]);

    const toggle = (id: number) => {
        setError(null);
        setSelectedIds((s) =>
            s.includes(id) ? s.filter((x) => x !== id) : [...s, id]
        );
    };

    const handleBackPress = useCallback(() => {
        if (hasUnsavedChanges) {
            setShowUnsavedModal(true);
        } else {
            router.back();
        }
    }, [hasUnsavedChanges, router]);

    const onSave = async () => {
        if (selectedIds.length === 0) {
            setError("Please select at least one service area.");
            return;
        }

        setSaving(true);
        setError(null);

        try {
            // Get current profile details to preserve other fields
            const profileRes = await apiClient.get("/api/Therapist/me/details", {
                headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
            });

            const currentProfile = profileRes.data;

            // Update only service areas
            await apiClient.put(
                "/api/Therapist/me",
                {
                    specializationIds: currentProfile.specializationIds,
                    conditionIds: currentProfile.conditionIds,
                    serviceAreasIds: selectedIds,
                },
                {
                    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
                }
            );

            // Update original IDs to reflect saved state
            setOriginalIds(selectedIds);

            // Invalidate profile queries to refetch updated data
            queryClient.invalidateQueries({ queryKey: ["therapistProfileDetails"] });
            queryClient.invalidateQueries({ queryKey: ["therapistProfile"] });

            setShowSuccessModal(true);
        } catch (err: any) {
            console.warn("Failed to save service areas", err);
            const message = err?.response?.data?.message || err?.message || "Failed to save changes";
            setError(message);
            if (Platform.OS !== "web") {
                Alert.alert("Error", message);
            }
        } finally {
            setSaving(false);
        }
    };

    // Content component
    const renderContent = () => (
        <>
            <View
                className={`flex-1 px-6 ${isDesktop ? "pt-6" : ""}`}
                style={!isDesktop ? { paddingTop: insets.top + 24 } : undefined}
            >
                {/* Header Section */}
                <View className="mb-8">
                    <Text className="text-3xl font-bold text-gray-900 mb-2">
                        Service Area
                    </Text>
                    <Text className="text-base text-gray-500">
                        Select the barangays where you provide home-visit services
                    </Text>
                </View>

                {/* Selected Count Badge and Selected Items */}
                {selectedIds.length > 0 && (
                    <View className="mb-4">
                        {/* Count Badge */}
                        <View className="flex-row items-center mb-3">
                            <View className="bg-[#E6F4F0] px-3 py-1.5 rounded-full">
                                <Text className="text-[#089769] font-semibold text-sm">
                                    {selectedIds.length} selected
                                </Text>
                            </View>
                        </View>

                        {/* Selected Items as Removable Chips */}
                        <View className="flex-row flex-wrap gap-2">
                            {selectedIds.map((id) => {
                                const area = serviceAreas.find((a) => a.id === id);
                                if (!area) return null;
                                return (
                                    <TouchableOpacity
                                        key={id}
                                        onPress={() => toggle(id)}
                                        className="flex-row items-center bg-[#089769] px-3 py-2 rounded-full"
                                        activeOpacity={0.7}
                                    >
                                        <Text className="text-white font-medium text-sm mr-1.5">
                                            {area.name}
                                        </Text>
                                        <X size={14} color="#FFFFFF" />
                                    </TouchableOpacity>
                                );
                            })}
                        </View>
                    </View>
                )}

                {/* Search Input */}
                <TextInput
                    placeholder="Search barangays..."
                    value={query}
                    onChangeText={setQuery}
                    className="border border-gray-200 rounded-2xl px-4 py-4 text-base text-gray-900 mb-6"
                    placeholderTextColor="#9CA3AF"
                />

                {loading ? (
                    <View className="flex-1 items-center justify-center">
                        <ActivityIndicator size="large" color="#089769" />
                    </View>
                ) : error ? (
                    <View className="bg-red-50 rounded-2xl px-4 py-3 mb-4">
                        <Text className="text-sm text-red-600">{error}</Text>
                    </View>
                ) : filtered.length === 0 ? (
                    <View className="flex-1 items-center justify-center">
                        <Text className="text-center text-gray-500">
                            No service areas found.
                        </Text>
                    </View>
                ) : (
                    <ScrollView
                        showsVerticalScrollIndicator={false}
                        keyboardShouldPersistTaps="handled"
                        contentContainerStyle={{ paddingBottom: 120 }}
                    >
                        {displayedItems.map((item) => {
                            const selected = selectedIds.includes(item.id);
                            return (
                                <TouchableOpacity
                                    key={String(item.id)}
                                    activeOpacity={0.7}
                                    onPress={() => toggle(item.id)}
                                    className={`mb-3 px-5 py-4 rounded-xl flex-row items-center justify-between ${selected
                                        ? "bg-[#E6F4F0] border-2 border-[#089769]"
                                        : "bg-white border-2 border-gray-200"
                                        }`}
                                >
                                    <Text
                                        className={`text-base ${selected
                                            ? "text-[#089769] font-semibold"
                                            : "text-gray-700 font-medium"
                                            }`}
                                    >
                                        {item.name}
                                    </Text>
                                    {selected && (
                                        <View className="w-6 h-6 rounded-full bg-[#089769] items-center justify-center">
                                            <Check size={14} color="#FFFFFF" />
                                        </View>
                                    )}
                                </TouchableOpacity>
                            );
                        })}

                        {/* Show More / Show Less Button */}
                        {hasMore && (
                            <TouchableOpacity
                                onPress={() => setShowAll(!showAll)}
                                className="mb-3 px-5 py-3 rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 items-center"
                                activeOpacity={0.7}
                            >
                                <Text className="text-sm font-semibold text-gray-600">
                                    {showAll
                                        ? `Show Less (${filtered.length - INITIAL_DISPLAY_COUNT} hidden)`
                                        : `Show ${filtered.length - INITIAL_DISPLAY_COUNT} More`}
                                </Text>
                            </TouchableOpacity>
                        )}

                        <View className="h-4" />
                    </ScrollView>
                )}
            </View>
        </>
    );

    return (
        <View className="flex-1 bg-teal-50">
            <WebHeader />
            {/* Unsaved Changes Modal */}
            <Modal
                visible={showUnsavedModal}
                transparent
                animationType="fade"
                onRequestClose={() => setShowUnsavedModal(false)}
            >
                <View className="flex-1 justify-center items-center bg-black/50 px-6">
                    <View className="bg-white rounded-3xl p-6 w-full max-w-sm">
                        <View className="items-center mb-4">
                            <View className="w-14 h-14 rounded-full bg-amber-100 items-center justify-center mb-3">
                                <Text className="text-2xl">⚠️</Text>
                            </View>
                            <Text className="text-xl font-bold text-gray-900 text-center">
                                Unsaved Changes
                            </Text>
                        </View>
                        <Text className="text-base text-gray-600 text-center mb-6">
                            You have unsaved changes. Are you sure you want to leave without saving?
                        </Text>
                        <View className="flex-row gap-3">
                            <TouchableOpacity
                                onPress={() => {
                                    setShowUnsavedModal(false);
                                    router.back();
                                }}
                                className="flex-1 bg-gray-100 py-3.5 rounded-xl"
                                activeOpacity={0.8}
                            >
                                <Text className="text-gray-700 text-center font-semibold text-base">
                                    Discard
                                </Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                onPress={() => setShowUnsavedModal(false)}
                                className="flex-1 bg-[#089769] py-3.5 rounded-xl"
                                activeOpacity={0.8}
                            >
                                <Text className="text-white text-center font-semibold text-base">
                                    Keep Editing
                                </Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* Success Modal */}
            <Modal
                visible={showSuccessModal}
                transparent
                animationType="fade"
                onRequestClose={() => setShowSuccessModal(false)}
            >
                <View className="flex-1 justify-center items-center bg-black/50 px-6">
                    <View className="bg-white rounded-3xl p-6 w-full max-w-sm">
                        <View className="items-center mb-4">
                            <View className="w-14 h-14 rounded-full bg-emerald-100 items-center justify-center mb-3">
                                <Check size={28} color="#10B981" />
                            </View>
                            <Text className="text-xl font-bold text-gray-900 text-center">
                                Service Area Updated
                            </Text>
                        </View>
                        <Text className="text-base text-gray-600 text-center mb-6">
                            Your service area has been updated successfully.
                        </Text>
                        <TouchableOpacity
                            onPress={() => {
                                setShowSuccessModal(false);
                                router.back();
                            }}
                            className="bg-[#089769] py-3.5 rounded-xl"
                            activeOpacity={0.8}
                        >
                            <Text className="text-white text-center font-semibold text-base">
                                Done
                            </Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {isDesktop ? (
                <View className="flex-1 bg-[#e6f5f0]">
                    <ScrollView
                        contentContainerStyle={{
                            flexGrow: 1,
                            justifyContent: "center",
                            alignItems: "center",
                            paddingVertical: 40,
                        }}
                    >
                        <View
                            className="bg-white rounded-2xl w-full max-w-xl"
                            style={{
                                shadowColor: "#000",
                                shadowOffset: { width: 0, height: 2 },
                                shadowOpacity: 0.08,
                                shadowRadius: 8,
                                elevation: 3,
                                minHeight: 600,
                            }}
                        >
                            {renderContent()}
                        </View>
                    </ScrollView>
                </View>
            ) : (
                <View className="flex-1 bg-gray-50">{renderContent()}</View>
            )}

            {/* Sticky Bottom Save Button */}
            {hasUnsavedChanges && (
                <Animated.View
                    style={{
                        position: "absolute",
                        bottom: 0,
                        left: 0,
                        right: 0,
                        backgroundColor: "white",
                        borderTopWidth: 1,
                        borderTopColor: "#E5E7EB",
                        paddingBottom: insets.bottom || 16,
                        paddingTop: 16,
                        paddingHorizontal: 24,
                        zIndex: 1000,
                        opacity: buttonOpacity,
                        shadowColor: "#000",
                        shadowOffset: { width: 0, height: -2 },
                        shadowOpacity: 0.1,
                        shadowRadius: 8,
                        elevation: 8,
                        alignItems: "center",
                    }}
                >
                    <TouchableOpacity
                        onPress={onSave}
                        activeOpacity={saving ? 1 : 0.85}
                        disabled={saving}
                        style={{
                            backgroundColor: saving ? "#a8d5c8" : "#089769",
                            borderRadius: 12,
                            paddingVertical: 16,
                            paddingHorizontal: 24,
                            flexDirection: "row",
                            alignItems: "center",
                            justifyContent: "center",
                            width: "100%",
                            maxWidth: 576,
                        }}
                    >
                        {saving ? (
                            <ActivityIndicator color="#fff" />
                        ) : (
                            <Text className="text-white font-bold text-lg">
                                Save Changes
                            </Text>
                        )}
                    </TouchableOpacity>
                </Animated.View>
            )}
        </View>
    );
}

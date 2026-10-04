import { useRouter } from "expo-router";
import {
  Briefcase,
  MapPin,
  ShieldAlert,
  ShieldCheck,
  Star,
  User,
  Search,
  ArrowLeft,
  Filter,
  X,
  ChevronDown,
  MessageCircle,
  Calendar,
  Eye,
  ChevronLeft,
  ChevronRight,
} from "lucide-react-native";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  ListRenderItem,
  Text,
  TouchableOpacity,
  View,
  Platform,
  useWindowDimensions,
  ScrollView,
  TextInput,
  Modal,
  Pressable,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import RecommendHeader from "@/src/components/RecommendHeader";
import WebHeader from "@/src/components/WebHeader";
import {
  fetchTherapists,
  THERAPISTS_QUERY_KEY,
  TherapistListItem,
} from "@/src/services/therapists";
import { resolveAvatarSource } from "@/src/utils/avatar";
import { formatPeso } from "@/src/utils/money";
import { keepPreviousData, useQuery } from "@tanstack/react-query";

const AVATAR_FALLBACK = require("@/assets/images/react-logo.png");

// Filter options
const SPECIALIZATION_OPTIONS = [
  "Cardiopulmonary",
  "Geriatric",
  "Musculoskeletal",
  "Neurologic",
  "Orthopedic/Musculoskeletal",
  "Pediatric",
  "Sports",
  "Vestibular",
];

const GENDER_OPTIONS = ["Male", "Female", "Other"];

function getInitials(name?: string) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const formatList = (values?: string[] | null) => {
  if (!Array.isArray(values) || values.length === 0) {
    return "Not specified";
  }

  return values
    .map((item) => item?.trim())
    .filter((item): item is string => Boolean(item))
    .join(", ");
};

const formatGender = (value?: string | null) => {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed.length > 0 ? trimmed : "Gender not specified";
};

export default function TherapistDirectoryScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === "web" && width >= 768;

  // Filter state
  const [selectedSpecializations, setSelectedSpecializations] = useState<
    string[]
  >([]);
  const [selectedGender, setSelectedGender] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [specializationModalOpen, setSpecializationModalOpen] = useState(false);
  const [genderModalOpen, setGenderModalOpen] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [debouncedSearchText, setDebouncedSearchText] = useState("");

  // Pagination state
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;

  // Debounce search input and reset page to 1
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearchText(searchText);
      setPage(1);
    }, 300);

    return () => {
      clearTimeout(handler);
    };
  }, [searchText]);

  const query = useQuery({
    queryKey: [...THERAPISTS_QUERY_KEY, page, debouncedSearchText],
    queryFn: () => fetchTherapists(page, PAGE_SIZE, debouncedSearchText),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
    gcTime: 600_000,
    refetchOnReconnect: true,
    refetchOnWindowFocus: true,
  });

  const paginatedResult = query.data;
  const therapists = useMemo(() => {
    return paginatedResult?.items ?? [];
  }, [paginatedResult]);

  const totalPages = paginatedResult?.totalPages ?? 1;
  const hasNextPage = paginatedResult?.hasNextPage ?? false;
  const hasPreviousPage = paginatedResult?.hasPreviousPage ?? false;

  const handleNextPage = () => {
    if (hasNextPage) {
      setPage((prev) => prev + 1);
    }
  };

  const handlePreviousPage = () => {
    if (hasPreviousPage) {
      setPage((prev) => prev - 1);
    }
  };

  const errorMessage = useMemo(() => {
    const err = query.error as any;
    return (err?.response?.data?.message || err?.message || null) as
      | string
      | null;
  }, [query.error]);
  const isLoading = query.isLoading;
  const refreshing = query.isFetching && !query.isLoading;
  const onRefresh = useCallback(() => {
    query.refetch();
  }, [query]);

  const renderRatingText = useCallback((item: TherapistListItem) => {
    if (item.averageRating === null || item.averageRating === undefined) {
      return "No ratings yet";
    }

    const ratingValue = Number(item.averageRating);
    const formattedRating = Number.isFinite(ratingValue)
      ? ratingValue.toFixed(1)
      : "N/A";
    const count = item.ratingCount ?? 0;
    return `${formattedRating} (${count} review${count === 1 ? "" : "s"})`;
  }, []);

  // Filter therapists based on specialization and gender locally.
  // Text search filtering is fully handled on the server side now.
  const filteredTherapists = useMemo(() => {
    return therapists.filter((t) => {
      // Specialization filter
      if (selectedSpecializations.length > 0) {
        const hasMatch = selectedSpecializations.some((spec) =>
          t.specializations?.some(
            (s) => s.toLowerCase() === spec.toLowerCase(),
          ),
        );
        if (!hasMatch) return false;
      }

      // Gender filter
      if (selectedGender) {
        if (t.gender?.toLowerCase() !== selectedGender.toLowerCase())
          return false;
      }

      return true;
    });
  }, [therapists, selectedSpecializations, selectedGender]);

  const clearFilters = useCallback(() => {
    setSelectedSpecializations([]);
    setSelectedGender(null);
  }, []);

  const hasActiveFilters =
    selectedSpecializations.length > 0 || selectedGender !== null;

  // Bridge variables for existing code paths
  const loading = isLoading;
  const error = errorMessage;

  // NOTE: Keep all hooks above this line.
  // Early-return for loading state placed AFTER all hooks to avoid hook order issues.
  const renderItem: ListRenderItem<TherapistListItem> = useCallback(
    ({ item }) => {
      const avatarUrl = item.profilePictureUrl ?? null;
      const specializations = formatList(item.specializations);
      const serviceAreas = formatList(item.serviceAreas);
      const hasSessionFee =
        item.feePerSession !== null && item.feePerSession !== undefined;
      const feeAmount = Number(item.feePerSession ?? 0);
      const genderLabel = formatGender(item.gender);

      return (
        <TouchableOpacity
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityHint="View therapist details"
          onPress={() =>
            router.push({
              pathname: "/(patient)/therapists/[therapistId]",
              params: { therapistId: String(item.id) },
            })
          }
          className="w-full bg-white rounded-2xl p-4 mb-4 border border-teal-100 lg:max-w-4xl lg:mx-auto shadow-sm"
        >
          <View className="flex-row items-center mb-3">
            {avatarUrl ? (
              <Image
                source={resolveAvatarSource(avatarUrl, AVATAR_FALLBACK)}
                className="w-16 h-16 rounded-2xl mr-4"
              />
            ) : (
              <View className="w-16 h-16 rounded-2xl mr-4 bg-teal-50 justify-center items-center">
                <Text className="font-bold text-teal-700 text-lg">
                  {getInitials(item.name)}
                </Text>
              </View>
            )}
            <View className="flex-1">
              <Text className="text-lg font-bold text-black mb-1">
                {item.name?.trim() || "Unnamed Therapist"}
              </Text>
              <View className="flex-row items-center mb-1">
                <User color="#0D9488" size={16} className="mr-1.5" />
                <Text className="text-sm text-gray-700">{genderLabel}</Text>
              </View>
              <View className="flex-row items-center">
                <Star
                  color="#FFAA00"
                  size={16}
                  fill="#FFAA00"
                  className="mr-1.5"
                />
                <Text className="text-sm text-gray-700">
                  {renderRatingText(item)}
                </Text>
              </View>
            </View>
          </View>

          <View className="mb-2.5">
            <Text className="text-sm font-semibold text-gray-900 mb-1">
              Specializations
            </Text>
            <Text className="text-sm text-gray-700">{specializations}</Text>
          </View>

          <View className="mb-2.5">
            <Text className="text-sm font-semibold text-gray-900 mb-1">
              Service Areas
            </Text>
            <View className="flex-row items-start">
              <MapPin color="#0D9488" size={16} className="mr-1.5" />
              <Text className="text-sm text-gray-700 flex-1">
                {serviceAreas}
              </Text>
            </View>
          </View>

          {hasSessionFee && Number.isFinite(feeAmount) ? (
            <View className="flex-row justify-between items-center pt-3 border-t border-teal-100">
              <Text className="text-sm text-gray-700">Professional Fee</Text>
              <Text className="text-base font-bold text-teal-600">
                {formatPeso(feeAmount)}
              </Text>
            </View>
          ) : null}
        </TouchableOpacity>
      );
    },
    [renderRatingText, router],
  );

  if (loading && !refreshing && therapists.length === 0) {
    return (
      <View className="flex-1 justify-center items-center bg-slate-100">
        <ActivityIndicator color="#2D8CFF" size="large" />
      </View>
    );
  }

  // Desktop Therapist Card Component
  const DesktopTherapistCard = ({ item }: { item: TherapistListItem }) => {
    const avatarUrl = item.profilePictureUrl ?? null;
    const hasSessionFee =
      item.feePerSession !== null && item.feePerSession !== undefined;
    const feeAmount = Number(item.feePerSession ?? 0);

    return (
      <View className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden hover:shadow-md transition-shadow">
        {/* Card Header - Clean white with accent */}
        <View className="px-5 py-4 border-b border-gray-100">
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center flex-1">
              {avatarUrl ? (
                <Image
                  source={resolveAvatarSource(avatarUrl, AVATAR_FALLBACK)}
                  className="w-14 h-14 rounded-xl border-2 border-gray-200"
                />
              ) : (
                <View className="w-14 h-14 rounded-xl justify-center items-center bg-gray-200">
                  <Text className="font-bold text-gray-600 text-lg">
                    {getInitials(item.name)}
                  </Text>
                </View>
              )}
              <View className="ml-3 flex-1">
                <Text
                  className="text-gray-900 text-lg font-bold"
                  numberOfLines={1}
                >
                  {item.name?.trim() || "Unnamed Therapist"}
                </Text>
              </View>
            </View>
            {/* Rating Badge */}
            <View className="rounded-xl px-3 py-2 items-center bg-amber-50 border border-amber-200">
              <View className="flex-row items-center">
                <Star color="#F59E0B" fill="#F59E0B" size={16} />
                <Text className="text-amber-700 font-bold ml-1">
                  {item.averageRating?.toFixed(1) ?? "N/A"}
                </Text>
              </View>
              <Text className="text-amber-600/80 text-xs">
                {item.ratingCount ?? 0} reviews
              </Text>
            </View>
          </View>
        </View>

        {/* Card Body */}
        <View className="p-5">
          {/* Info Tags Row */}
          <View className="flex-row flex-wrap gap-2 mb-4">
            {item.gender && (
              <View className="flex-row items-center bg-gray-100 px-3 py-1.5 rounded-full">
                <User size={14} color="#6B7280" />
                <Text className="text-gray-600 text-xs font-medium ml-1.5">
                  {item.gender}
                </Text>
              </View>
            )}
            {hasSessionFee && Number.isFinite(feeAmount) && (
              <View className="flex-row items-center bg-gray-100 px-3 py-1.5 rounded-full">
                <Text className="text-gray-700 text-xs font-bold">
                  ₱{formatPeso(feeAmount)}/session
                </Text>
              </View>
            )}
          </View>

          {/* Specializations */}
          {item.specializations && item.specializations.length > 0 && (
            <View className="mb-3">
              <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                Specializations
              </Text>
              <View className="flex-row flex-wrap gap-1.5">
                {item.specializations.slice(0, 3).map((spec, idx) => (
                  <View
                    key={idx}
                    className="bg-gray-100 px-2.5 py-1 rounded-md"
                  >
                    <Text className="text-gray-700 text-xs">{spec}</Text>
                  </View>
                ))}
                {item.specializations.length > 3 && (
                  <View className="bg-gray-100 px-2.5 py-1 rounded-md">
                    <Text className="text-gray-500 text-xs">
                      +{item.specializations.length - 3} more
                    </Text>
                  </View>
                )}
              </View>
            </View>
          )}

          {/* Service Areas */}
          {item.serviceAreas && item.serviceAreas.length > 0 && (
            <View className="mb-4">
              <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                Service Areas
              </Text>
              <View className="flex-row items-start">
                <MapPin size={14} color="#6B7280" className="mt-0.5" />
                <Text
                  className="text-gray-600 text-sm ml-1.5 flex-1"
                  numberOfLines={2}
                >
                  {item.serviceAreas.join(", ")}
                </Text>
              </View>
            </View>
          )}

          {/* Action Buttons */}
          <View className="flex-row gap-2 pt-3 border-t border-gray-100">
            <TouchableOpacity
              style={{ backgroundColor: "#089769" }}
              className="flex-1 flex-row items-center justify-center py-2.5 rounded-xl"
              onPress={() =>
                router.push({
                  pathname: "/(patient)/therapists/[therapistId]",
                  params: { therapistId: String(item.id) },
                })
              }
            >
              <Eye size={16} color="white" />
              <Text className="text-white font-semibold ml-2">
                View Profile
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  };

  // Render Filter Modals
  const renderModals = () => (
    <>
      {/* Specialization Modal */}
      <Modal
        visible={specializationModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setSpecializationModalOpen(false)}
      >
        <Pressable
          className="flex-1 bg-black/50 justify-center items-center"
          onPress={() => setSpecializationModalOpen(false)}
        >
          <Pressable
            className="bg-white rounded-2xl p-6 w-[90%] max-w-md"
            onPress={(e) => e.stopPropagation()}
          >
            <View className="flex-row items-center justify-between mb-4">
              <Text className="text-xl font-bold text-gray-900">
                Specializations
              </Text>
              <TouchableOpacity
                onPress={() => setSpecializationModalOpen(false)}
              >
                <X size={24} color="#6B7280" />
              </TouchableOpacity>
            </View>
            <View className="gap-2">
              {SPECIALIZATION_OPTIONS.map((spec) => {
                const isSelected = selectedSpecializations.includes(spec);
                return (
                  <TouchableOpacity
                    key={spec}
                    className={`p-3 rounded-xl border-2 ${
                      isSelected
                        ? "border-emerald-500 bg-emerald-50"
                        : "border-gray-200"
                    }`}
                    onPress={() => {
                      setSelectedSpecializations((prev) =>
                        isSelected
                          ? prev.filter((s) => s !== spec)
                          : [...prev, spec],
                      );
                    }}
                  >
                    <View className="flex-row items-center justify-between">
                      <Text
                        style={isSelected ? { color: "#089769" } : undefined}
                        className={`font-medium ${
                          isSelected ? "" : "text-gray-700"
                        }`}
                      >
                        {spec}
                      </Text>
                      {isSelected && (
                        <View
                          style={{ backgroundColor: "#089769" }}
                          className="w-5 h-5 rounded-full items-center justify-center"
                        >
                          <Text className="text-white text-xs">✓</Text>
                        </View>
                      )}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
            <TouchableOpacity
              style={{ backgroundColor: "#089769" }}
              className="mt-4 py-3 rounded-xl"
              onPress={() => setSpecializationModalOpen(false)}
            >
              <Text className="text-white font-semibold text-center">Done</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Gender Modal */}
      <Modal
        visible={genderModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setGenderModalOpen(false)}
      >
        <Pressable
          className="flex-1 bg-black/50 justify-center items-center"
          onPress={() => setGenderModalOpen(false)}
        >
          <Pressable
            className="bg-white rounded-2xl p-6 w-[90%] max-w-md"
            onPress={(e) => e.stopPropagation()}
          >
            <View className="flex-row items-center justify-between mb-4">
              <Text className="text-xl font-bold text-gray-900">
                Preferred Gender
              </Text>
              <TouchableOpacity onPress={() => setGenderModalOpen(false)}>
                <X size={24} color="#6B7280" />
              </TouchableOpacity>
            </View>
            <View className="gap-2">
              <TouchableOpacity
                className={`p-3 rounded-xl border-2 ${
                  !selectedGender
                    ? "border-emerald-500 bg-emerald-50"
                    : "border-gray-200"
                }`}
                onPress={() => setSelectedGender(null)}
              >
                <Text
                  style={!selectedGender ? { color: "#089769" } : undefined}
                  className={`font-medium ${
                    !selectedGender ? "" : "text-gray-700"
                  }`}
                >
                  Any Gender
                </Text>
              </TouchableOpacity>
              {GENDER_OPTIONS.map((gender) => {
                const isSelected = selectedGender === gender;
                return (
                  <TouchableOpacity
                    key={gender}
                    className={`p-3 rounded-xl border-2 ${
                      isSelected
                        ? "border-emerald-500 bg-emerald-50"
                        : "border-gray-200"
                    }`}
                    onPress={() => setSelectedGender(gender)}
                  >
                    <Text
                      style={isSelected ? { color: "#089769" } : undefined}
                      className={`font-medium ${
                        isSelected ? "" : "text-gray-700"
                      }`}
                    >
                      {gender}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <TouchableOpacity
              style={{ backgroundColor: "#089769" }}
              className="mt-4 py-3 rounded-xl"
              onPress={() => setGenderModalOpen(false)}
            >
              <Text className="text-white font-semibold text-center">Done</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );

  // Desktop View
  if (isDesktop) {
    return (
      <View style={{ backgroundColor: "#e6f5f0" }} className="flex-1">
        <WebHeader />
        {renderModals()}
        <SafeAreaView
          style={{ backgroundColor: "#e6f5f0" }}
          className="flex-1 w-full"
        >
          <ScrollView
            className="flex-1 w-full"
            showsVerticalScrollIndicator={false}
          >
            <View className="w-full max-w-screen-xl mx-auto px-6 pt-8 pb-10">
              {/* Page Header */}
              <View className="flex-row items-center mb-8">
                <TouchableOpacity
                  className="flex-row items-center px-4 py-2 rounded-xl bg-white border border-emerald-100 mr-4 hover:bg-emerald-50 transition-colors"
                  onPress={() => router.replace("/(patient)/(tabs)")}
                >
                  <ArrowLeft size={18} color="#089769" />
                  <Text
                    style={{ color: "#089769" }}
                    className="font-semibold ml-2"
                  >
                    Back
                  </Text>
                </TouchableOpacity>
                <View className="flex-1">
                  <Text
                    style={{ color: "#089769" }}
                    className="text-xs font-semibold uppercase tracking-wide mb-1"
                  >
                    Browse Directory
                  </Text>
                  <Text className="text-3xl font-bold text-gray-900">
                    Find a Therapist
                  </Text>
                  <Text className="text-gray-500 mt-1">
                    Browse our directory of qualified physical therapists
                  </Text>
                </View>
                <View
                  style={{ backgroundColor: "#089769" }}
                  className="px-4 py-2 rounded-xl"
                >
                  <Text className="text-white font-bold text-lg">
                    {filteredTherapists.length}
                  </Text>
                  <Text
                    style={{ color: "rgba(255,255,255,0.8)" }}
                    className="text-xs"
                  >
                    {filteredTherapists.length === 1
                      ? "Therapist"
                      : "Therapists"}
                  </Text>
                </View>
              </View>

              {/* Filter Bar */}
              <View className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4 mb-6">
                {/* Search Input (Desktop) */}
                <View className="flex-row items-center bg-gray-50 rounded-xl border border-gray-200 px-4 py-3 mb-3">
                  <Search size={18} color="#9CA3AF" />
                  <TextInput
                    placeholder="Search by name..."
                    placeholderTextColor="#9CA3AF"
                    className="flex-1 ml-3 text-base text-gray-800"
                    value={searchText}
                    onChangeText={setSearchText}
                    autoCorrect={false}
                  />
                  {searchText.length > 0 && (
                    <TouchableOpacity onPress={() => setSearchText("")}>
                      <X size={18} color="#9CA3AF" />
                    </TouchableOpacity>
                  )}
                </View>
                <View className="flex-row items-center justify-between">
                  <View className="flex-row items-center">
                    <Filter size={20} color="#6B7280" />
                    <Text className="ml-2 font-semibold text-gray-700">
                      Filter by:
                    </Text>
                  </View>
                  <View className="flex-row items-center gap-3">
                    {/* Specialization Filter */}
                    <TouchableOpacity
                      className={`flex-row items-center px-4 py-2.5 rounded-xl border-2 ${
                        selectedSpecializations.length > 0
                          ? "border-emerald-500 bg-emerald-50"
                          : "border-gray-200 bg-white hover:bg-gray-50"
                      }`}
                      onPress={() => setSpecializationModalOpen(true)}
                    >
                      <Text
                        style={
                          selectedSpecializations.length > 0
                            ? { color: "#089769" }
                            : undefined
                        }
                        className={`font-medium ${
                          selectedSpecializations.length > 0
                            ? ""
                            : "text-gray-600"
                        }`}
                      >
                        Specialization
                        {selectedSpecializations.length > 0
                          ? ` (${selectedSpecializations.length})`
                          : ""}
                      </Text>
                      <ChevronDown
                        size={16}
                        color={
                          selectedSpecializations.length > 0
                            ? "#089769"
                            : "#6B7280"
                        }
                        className="ml-1"
                      />
                    </TouchableOpacity>

                    {/* Gender Filter */}
                    <TouchableOpacity
                      className={`flex-row items-center px-4 py-2.5 rounded-xl border-2 ${
                        selectedGender
                          ? "border-emerald-500 bg-emerald-50"
                          : "border-gray-200 bg-white hover:bg-gray-50"
                      }`}
                      onPress={() => setGenderModalOpen(true)}
                    >
                      <Text
                        style={
                          selectedGender ? { color: "#089769" } : undefined
                        }
                        className={`font-medium ${
                          selectedGender ? "" : "text-gray-600"
                        }`}
                      >
                        {selectedGender || "Gender"}
                      </Text>
                      <ChevronDown
                        size={16}
                        color={selectedGender ? "#089769" : "#6B7280"}
                        className="ml-1"
                      />
                    </TouchableOpacity>

                    {/* Clear Filters */}
                    {hasActiveFilters && (
                      <TouchableOpacity
                        className="flex-row items-center px-4 py-2.5 rounded-xl bg-red-50 border-2 border-red-200 hover:bg-red-100"
                        onPress={clearFilters}
                      >
                        <X size={16} color="#DC2626" />
                        <Text className="ml-1.5 font-medium text-red-600">
                          Clear All
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>

                {/* Active Filter Tags */}
                {hasActiveFilters && (
                  <View className="flex-row flex-wrap gap-2 mt-4 pt-4 border-t border-gray-100">
                    {selectedSpecializations.map((spec) => (
                      <View
                        key={spec}
                        style={{ backgroundColor: "rgba(8, 151, 105, 0.15)" }}
                        className="flex-row items-center px-3 py-1.5 rounded-full"
                      >
                        <Text
                          style={{ color: "#089769" }}
                          className="text-sm font-medium"
                        >
                          {spec}
                        </Text>
                        <TouchableOpacity
                          className="ml-2"
                          onPress={() =>
                            setSelectedSpecializations((prev) =>
                              prev.filter((s) => s !== spec),
                            )
                          }
                        >
                          <X size={14} color="#089769" />
                        </TouchableOpacity>
                      </View>
                    ))}
                    {selectedGender && (
                      <View className="flex-row items-center bg-blue-100 px-3 py-1.5 rounded-full">
                        <Text className="text-blue-700 text-sm font-medium">
                          {selectedGender}
                        </Text>
                        <TouchableOpacity
                          className="ml-2"
                          onPress={() => setSelectedGender(null)}
                        >
                          <X size={14} color="#2563EB" />
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                )}
              </View>

              {/* Results */}
              {error ? (
                <View className="bg-red-50 border border-red-200 rounded-2xl p-6 items-center">
                  <ShieldAlert size={48} color="#DC2626" />
                  <Text className="text-red-700 font-semibold text-lg mt-4">
                    Error Loading Therapists
                  </Text>
                  <Text className="text-red-600 text-center mt-2">{error}</Text>
                  <TouchableOpacity
                    className="mt-4 bg-red-600 px-6 py-3 rounded-xl"
                    onPress={onRefresh}
                  >
                    <Text className="text-white font-semibold">Try Again</Text>
                  </TouchableOpacity>
                </View>
              ) : filteredTherapists.length === 0 ? (
                <View className="bg-white rounded-2xl shadow-sm border border-emerald-100 p-12 items-center">
                  <View
                    style={{ backgroundColor: "rgba(8, 151, 105, 0.1)" }}
                    className="w-20 h-20 rounded-full items-center justify-center mb-4"
                  >
                    <Search size={36} color="#089769" />
                  </View>
                  <Text className="text-xl font-bold text-gray-900 mb-2">
                    No Therapists Found
                  </Text>
                  <Text className="text-gray-500 text-center max-w-md">
                    {hasActiveFilters
                      ? "Try adjusting your filters or search terms to find more therapists."
                      : "We couldn't find any therapists at the moment. Please check back later."}
                  </Text>
                  {hasActiveFilters && (
                    <TouchableOpacity
                      style={{ backgroundColor: "#089769" }}
                      className="mt-6 px-6 py-3 rounded-xl"
                      onPress={clearFilters}
                    >
                      <Text className="text-white font-semibold">
                        Clear All Filters
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              ) : (
                <>
                  <View
                    className="gap-4"
                    style={{
                      display: "flex",
                      flexDirection: "row",
                      flexWrap: "wrap",
                    }}
                  >
                    {filteredTherapists.map((therapist) => (
                      <View key={therapist.id} style={{ width: "48%" }}>
                        <DesktopTherapistCard item={therapist} />
                      </View>
                    ))}
                  </View>

                  {/* Pagination Controls (Desktop) */}
                  <View className="flex-row justify-center items-center gap-4 mt-8 pb-4">
                    <TouchableOpacity
                      disabled={!hasPreviousPage}
                      onPress={handlePreviousPage}
                      className={`px-4 py-2 rounded-xl flex-row items-center ${!hasPreviousPage ? "bg-gray-100" : "bg-emerald-500"}`}
                    >
                      <ChevronLeft
                        size={20}
                        color={!hasPreviousPage ? "#9CA3AF" : "white"}
                      />
                      <Text
                        className={`font-semibold ml-1 ${!hasPreviousPage ? "text-gray-400" : "text-white"}`}
                      >
                        Previous
                      </Text>
                    </TouchableOpacity>

                    <Text className="text-gray-700 font-medium">
                      Page {page} of {totalPages}
                    </Text>

                    <TouchableOpacity
                      disabled={!hasNextPage}
                      onPress={handleNextPage}
                      className={`px-4 py-2 rounded-xl flex-row items-center ${!hasNextPage ? "bg-gray-100" : "bg-emerald-500"}`}
                    >
                      <Text
                        className={`font-semibold mr-1 ${!hasNextPage ? "text-gray-400" : "text-white"}`}
                      >
                        Next
                      </Text>
                      <ChevronRight
                        size={20}
                        color={!hasNextPage ? "#9CA3AF" : "white"}
                      />
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </View>
          </ScrollView>
        </SafeAreaView>
      </View>
    );
  }

  // Mobile View
  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: "#e6f5f0" }}>
      {renderModals()}
      <View className="flex-1">
        <RecommendHeader
          title="Find a Therapist"
          currentStep={1}
          totalSteps={1}
          hideSteps
          backToHome
        />

        {/* Search & Filter Bar (Mobile) */}
        <View className="px-4 pt-3 pb-1">
          {/* Search Input */}
          <View className="flex-row items-center bg-white rounded-xl border border-gray-200 px-3 py-2.5 mb-3">
            <Search size={18} color="#9CA3AF" />
            <TextInput
              placeholder="Search by name..."
              placeholderTextColor="#9CA3AF"
              className="flex-1 ml-2 text-base text-gray-800"
              value={searchText}
              onChangeText={setSearchText}
              autoCorrect={false}
            />
            {searchText.length > 0 && (
              <TouchableOpacity onPress={() => setSearchText("")}>
                <X size={18} color="#9CA3AF" />
              </TouchableOpacity>
            )}
          </View>

          {/* Filter Buttons Row */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8 }}
          >
            {/* Specialization Filter */}
            <TouchableOpacity
              className={`flex-row items-center px-3 py-2 rounded-xl border ${
                selectedSpecializations.length > 0
                  ? "border-emerald-500 bg-emerald-50"
                  : "border-gray-200 bg-white"
              }`}
              onPress={() => setSpecializationModalOpen(true)}
            >
              <Filter
                size={14}
                color={
                  selectedSpecializations.length > 0 ? "#089769" : "#6B7280"
                }
              />
              <Text
                style={
                  selectedSpecializations.length > 0
                    ? { color: "#089769" }
                    : undefined
                }
                className={`ml-1.5 text-sm font-medium ${
                  selectedSpecializations.length > 0 ? "" : "text-gray-600"
                }`}
              >
                Specialization
                {selectedSpecializations.length > 0
                  ? ` (${selectedSpecializations.length})`
                  : ""}
              </Text>
              <ChevronDown
                size={14}
                color={
                  selectedSpecializations.length > 0 ? "#089769" : "#6B7280"
                }
                className="ml-1"
              />
            </TouchableOpacity>

            {/* Gender Filter */}
            <TouchableOpacity
              className={`flex-row items-center px-3 py-2 rounded-xl border ${
                selectedGender
                  ? "border-emerald-500 bg-emerald-50"
                  : "border-gray-200 bg-white"
              }`}
              onPress={() => setGenderModalOpen(true)}
            >
              <User size={14} color={selectedGender ? "#089769" : "#6B7280"} />
              <Text
                style={selectedGender ? { color: "#089769" } : undefined}
                className={`ml-1.5 text-sm font-medium ${selectedGender ? "" : "text-gray-600"}`}
              >
                {selectedGender || "Gender"}
              </Text>
              <ChevronDown
                size={14}
                color={selectedGender ? "#089769" : "#6B7280"}
                className="ml-1"
              />
            </TouchableOpacity>

            {/* Clear Filters */}
            {hasActiveFilters && (
              <TouchableOpacity
                className="flex-row items-center px-3 py-2 rounded-xl bg-red-50 border border-red-200"
                onPress={clearFilters}
              >
                <X size={14} color="#DC2626" />
                <Text className="ml-1 text-sm font-medium text-red-600">
                  Clear
                </Text>
              </TouchableOpacity>
            )}
          </ScrollView>

          {/* Active Filter Tags */}
          {hasActiveFilters && (
            <View className="flex-row flex-wrap gap-2 mt-2.5">
              {selectedSpecializations.map((spec) => (
                <View
                  key={spec}
                  style={{ backgroundColor: "rgba(8, 151, 105, 0.12)" }}
                  className="flex-row items-center px-2.5 py-1 rounded-full"
                >
                  <Text
                    style={{ color: "#089769" }}
                    className="text-xs font-medium"
                  >
                    {spec}
                  </Text>
                  <TouchableOpacity
                    className="ml-1.5"
                    onPress={() =>
                      setSelectedSpecializations((prev) =>
                        prev.filter((s) => s !== spec),
                      )
                    }
                  >
                    <X size={12} color="#089769" />
                  </TouchableOpacity>
                </View>
              ))}
              {selectedGender && (
                <View className="flex-row items-center bg-blue-100 px-2.5 py-1 rounded-full">
                  <Text className="text-blue-700 text-xs font-medium">
                    {selectedGender}
                  </Text>
                  <TouchableOpacity
                    className="ml-1.5"
                    onPress={() => setSelectedGender(null)}
                  >
                    <X size={12} color="#2563EB" />
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}

          {/* Results count */}
          <Text className="text-xs text-gray-500 mt-2 mb-1">
            {filteredTherapists.length} therapist
            {filteredTherapists.length !== 1 ? "s" : ""} found
          </Text>
        </View>

        {error ? (
          <View className="px-5 pt-3">
            <Text className="text-red-600 text-sm mb-3">{error}</Text>
          </View>
        ) : null}

        {filteredTherapists.length === 0 ? (
          <View className="flex-1 items-center justify-center px-6">
            <View
              style={{ backgroundColor: "rgba(8, 151, 105, 0.1)" }}
              className="w-16 h-16 rounded-full items-center justify-center mb-3"
            >
              <Search size={28} color="#089769" />
            </View>
            <Text className="text-lg font-semibold text-gray-900 mb-2 text-center">
              No therapists found
            </Text>
            <Text className="text-sm text-gray-700 text-center leading-5">
              {hasActiveFilters || searchText.length > 0
                ? "Try adjusting your filters or search to find more therapists."
                : "We couldn\u0027t find therapists right now. Pull down to refresh and try again."}
            </Text>
            {(hasActiveFilters || searchText.length > 0) && (
              <TouchableOpacity
                style={{ backgroundColor: "#089769" }}
                className="mt-4 px-5 py-2.5 rounded-xl"
                onPress={() => {
                  clearFilters();
                  setSearchText("");
                }}
              >
                <Text className="text-white font-semibold">
                  Clear All Filters
                </Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <FlatList
            data={filteredTherapists}
            renderItem={renderItem}
            keyExtractor={(item) => String(item.id)}
            contentContainerStyle={{
              paddingBottom: 24,
              paddingTop: 12,
              paddingHorizontal: 20,
            }}
            refreshing={refreshing}
            onRefresh={onRefresh}
            initialNumToRender={8}
            maxToRenderPerBatch={8}
            windowSize={7}
            removeClippedSubviews
            ListFooterComponent={
              filteredTherapists.length > 0 ? (
                <View className="flex-row justify-center items-center gap-4 mt-4 mb-8">
                  <TouchableOpacity
                    disabled={!hasPreviousPage}
                    onPress={handlePreviousPage}
                    className={`px-4 py-2 rounded-xl flex-row items-center ${!hasPreviousPage ? "bg-gray-200" : "bg-emerald-500"}`}
                  >
                    <ChevronLeft
                      size={20}
                      color={!hasPreviousPage ? "#9CA3AF" : "white"}
                    />
                    <Text
                      className={`font-bold ml-1 ${!hasPreviousPage ? "text-gray-400" : "text-white"}`}
                    >
                      Prev
                    </Text>
                  </TouchableOpacity>

                  <Text className="text-gray-700 font-bold">
                    Page {page} of {totalPages}
                  </Text>

                  <TouchableOpacity
                    disabled={!hasNextPage}
                    onPress={handleNextPage}
                    className={`px-4 py-2 rounded-xl flex-row items-center ${!hasNextPage ? "bg-gray-200" : "bg-emerald-500"}`}
                  >
                    <Text
                      className={`font-bold mr-1 ${!hasNextPage ? "text-gray-400" : "text-white"}`}
                    >
                      Next
                    </Text>
                    <ChevronRight
                      size={20}
                      color={!hasNextPage ? "#9CA3AF" : "white"}
                    />
                  </TouchableOpacity>
                </View>
              ) : null
            }
          />
        )}
      </View>
    </SafeAreaView>
  );
}

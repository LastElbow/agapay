import apiClient from "@/api/client";
import RecommendHeader from "@/src/components/RecommendHeader";
import PrimaryButton from "@/src/components/PrimaryButton";
import { COLORS } from "@/src/theme";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, {
  useCallback,
  useEffect,
  useState,
  useMemo,
  useRef,
} from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Text,
  View,
  RefreshControl,
  TouchableOpacity,
  ScrollView,
  Modal,
  Pressable,
  Platform,
  useWindowDimensions,
  TextInput,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import MatchBreakdown from "@/src/components/MatchBreakdown";
import WebHeader from "@/src/components/WebHeader";
import { SERVICE_DATA } from "@/src/constants/serviceCatalog";
import type { AvailabilityBlock } from "@/src/components/AvailabilitySelector";
import { Ionicons } from "@expo/vector-icons";
import {
  Briefcase,
  MapPin,
  User,
  TrendingUp,
  Search,
  RefreshCw,
  Check,
  X,
  Clock,
  ChevronRight,
  ChevronDown,
  ArrowLeft,
  Info,
} from "lucide-react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/src/providers/AuthProvider";
import {
  fetchRecommendations,
  refreshRecommendations,
  clearRecommendationsCache,
  invalidateRecommendationsOnPreferenceChange,
  RECOMMENDATIONS_QUERY_KEY,
  type Recommendation,
} from "@/src/services/recommendations";
import {
  formatGenderLabel,
  formatListOrNotSpecified,
  getMatchPercentage,
  getUserFacingRecommendationsError,
  getUserIdForRecommendations,
  splitRecommendationsByThreshold,
} from "@/src/features/recommendations/core/matcherUi";
import {
  buildAvailabilityBlocks,
  canProceedPreferencesStep1,
  filterTimeOptions,
  getSpecializationDisplayText,
} from "@/src/features/recommendations/core/preferencesStep1";
import {
  filterCategoriesByServiceQuery,
  mapSpecializationsToCategoryIds,
  reorderCategoriesBySelectedIds,
} from "@/src/features/recommendations/core/preferencesStep2";

const getTierStyles = (
  tier: Recommendation["tier"] | string | null | undefined,
) => {
  switch (tier) {
    case "Recommended":
      return {
        bgColor: "bg-emerald-100",
        textColor: "text-emerald-700",
        borderColor: "border-emerald-500",
      };
    case "OtherOption":
    default:
      return {
        bgColor: "bg-gray-100",
        textColor: "text-gray-700",
        borderColor: "border-gray-400",
      };
  }
};

// Constants for step 1
const SPECIALIZATIONS = [
  { id: "cardio", name: "Cardiopulmonary" },
  { id: "geriatric", name: "Geriatric" },
  { id: "musculo", name: "Musculoskeletal" },
  { id: "neuro", name: "Neurologic" },
  { id: "ortho", name: "Orthopedic" },
  { id: "pedia", name: "Pediatric" },
  { id: "sports", name: "Sports" },
  { id: "vestibular", name: "Vestibular" },
];

const DAYS_OF_WEEK = [
  { id: 1, name: "Monday", shortName: "Mon" },
  { id: 2, name: "Tuesday", shortName: "Tue" },
  { id: 3, name: "Wednesday", shortName: "Wed" },
  { id: 4, name: "Thursday", shortName: "Thu" },
  { id: 5, name: "Friday", shortName: "Fri" },
  { id: 6, name: "Saturday", shortName: "Sat" },
  { id: 0, name: "Sunday", shortName: "Sun" },
];

const TIME_OPTIONS = [
  { value: "06:00:00", label: "06:00 AM" },
  { value: "06:30:00", label: "06:30 AM" },
  { value: "07:00:00", label: "07:00 AM" },
  { value: "07:30:00", label: "07:30 AM" },
  { value: "08:00:00", label: "08:00 AM" },
  { value: "08:30:00", label: "08:30 AM" },
  { value: "09:00:00", label: "09:00 AM" },
  { value: "09:30:00", label: "09:30 AM" },
  { value: "10:00:00", label: "10:00 AM" },
  { value: "10:30:00", label: "10:30 AM" },
  { value: "11:00:00", label: "11:00 AM" },
  { value: "11:30:00", label: "11:30 AM" },
  { value: "12:00:00", label: "12:00 PM" },
  { value: "12:30:00", label: "12:30 PM" },
  { value: "13:00:00", label: "01:00 PM" },
  { value: "13:30:00", label: "01:30 PM" },
  { value: "14:00:00", label: "02:00 PM" },
  { value: "14:30:00", label: "02:30 PM" },
  { value: "15:00:00", label: "03:00 PM" },
  { value: "15:30:00", label: "03:30 PM" },
  { value: "16:00:00", label: "04:00 PM" },
  { value: "16:30:00", label: "04:30 PM" },
  { value: "17:00:00", label: "05:00 PM" },
  { value: "17:30:00", label: "05:30 PM" },
  { value: "18:00:00", label: "06:00 PM" },
  { value: "18:30:00", label: "06:30 PM" },
  { value: "19:00:00", label: "07:00 PM" },
  { value: "19:30:00", label: "07:30 PM" },
  { value: "20:00:00", label: "08:00 PM" },
];

const GENDERS = ["Male", "Female", "Any"];

// Map specializations to category IDs for step 2
const specializationToCategoryMap: Record<string, string> = {
  Neurologic: "neuro",
  Musculoskeletal: "musculo",
  Pediatric: "pedia",
  Geriatric: "geria",
  Cardiopulmonary: "cardio",
  Orthopedic: "ortho",
  Sports: "sports",
  Vestibular: "vestibular",
};

export default function RecommendResults() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === "web" && width >= 768;
  const queryClient = useQueryClient();
  const { user } = useAuth();

  // Get user ID for cache scoping
  const userId = useMemo(() => getUserIdForRecommendations(user), [user]);

  // Use React Query for recommendations with secure caching
  const {
    data: items = [],
    isLoading: loading,
    isFetching,
    isError,
    error: queryError,
    refetch,
  } = useQuery({
    queryKey: RECOMMENDATIONS_QUERY_KEY,
    queryFn: () => fetchRecommendations(userId),
    enabled: true,
    staleTime: params.fresh === "1" ? 0 : 15 * 60 * 1000, // Force fresh if requested
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    refetchOnMount: params.fresh === "1" ? "always" : false,
    retry: 1,
  });

  // Force refetch if fresh param is present
  useEffect(() => {
    if (params.fresh === "1") {
      refetch();
    }
  }, [params.fresh]);

  // Derive error message from query error
  const error = useMemo(
    () => getUserFacingRecommendationsError({ isError, queryError }),
    [isError, queryError],
  );

  const refreshing = isFetching && !loading;

  // Desktop wizard state
  const [desktopStep, setDesktopStep] = useState<1 | 2 | "results">("results");
  const [submittingPrefs, setSubmittingPrefs] = useState(false);

  // Step 1 state
  const [selectedSpecializations, setSelectedSpecializations] = useState<
    string[]
  >([]);
  const [sessionBudget, setSessionBudget] = useState<string>("");
  const [selectedDays, setSelectedDays] = useState<number[]>([]);
  const [startTime, setStartTime] = useState<string>("06:00:00");
  const [endTime, setEndTime] = useState<string>("20:00:00");
  const [preferredTherapistGender, setPreferredTherapistGender] = useState<
    string | null
  >(null);
  const [specializationOpen, setSpecializationOpen] = useState(false);
  const [genderModalOpen, setGenderModalOpen] = useState(false);
  const [timeModalOpen, setTimeModalOpen] = useState<"start" | "end" | null>(
    null,
  );

  // Step 2 state
  const [expandedIds, setExpandedIds] = useState<string[]>([]);
  const [selectedServices, setSelectedServices] = useState<string[]>([]);
  const [serviceQuery, setServiceQuery] = useState("");
  const [appliedServiceQuery, setAppliedServiceQuery] = useState("");
  const serviceInputRef = useRef<TextInput | null>(null);

  // Preferences modal state
  const [showPreferencesModal, setShowPreferencesModal] = useState(false);

  // Toggle for "Other Options"
  const [showOtherOptions, setShowOtherOptions] = useState(false);

  // Saved preferences from API (for mobile modal)
  const [savedPreferences, setSavedPreferences] = useState<{
    preferredSpecializations?: string[];
    sessionBudget?: number;
    preferredTherapistGender?: string;
    availabilities?: {
      dayOfWeek: number;
      startTime: string;
      endTime: string;
    }[];
    desiredServices?: string[];
    preferredBarangay?: string;
  } | null>(null);

  // Patient's barangay from their profile (fallback for modal)
  const [patientBarangay, setPatientBarangay] = useState<string | null>(null);

  // Fetch saved preferences on mount for mobile modal display (and desktop modal)
  useEffect(() => {
    apiClient
      .get("/api/Preferences/me")
      .then((res) => {
        if (res?.data) {
          setSavedPreferences(res.data);
          // Also populate state variables for consistency
          // Handle both plural and singular specialization field names from API
          const specs =
            res.data.preferredSpecializations ||
            (res.data.preferredSpecialization
              ? [res.data.preferredSpecialization]
              : null) ||
            (res.data.PreferredSpecialization
              ? [res.data.PreferredSpecialization]
              : null);
          if (specs && specs.length > 0) {
            setSelectedSpecializations(specs);
          }
          if (res.data.sessionBudget || res.data.SessionBudget) {
            setSessionBudget(
              String(res.data.sessionBudget || res.data.SessionBudget),
            );
          }
          if (
            res.data.preferredTherapistGender ||
            res.data.PreferredTherapistGender
          ) {
            setPreferredTherapistGender(
              res.data.preferredTherapistGender ||
                res.data.PreferredTherapistGender,
            );
          }
          // Handle availabilities (check both casings)
          const availabilities =
            res.data.availabilities || res.data.Availabilities;
          if (availabilities && availabilities.length > 0) {
            const days: number[] = availabilities.map(
              (a: { dayOfWeek?: number; DayOfWeek?: number }) =>
                a.dayOfWeek ?? a.DayOfWeek,
            );
            setSelectedDays([...new Set(days)] as number[]);
            setStartTime(
              availabilities[0].startTime ||
                availabilities[0].StartTime ||
                "06:00:00",
            );
            setEndTime(
              availabilities[0].endTime ||
                availabilities[0].EndTime ||
                "20:00:00",
            );
          }
          // Handle desiredServices (check both casings)
          const services = res.data.desiredServices || res.data.DesiredServices;
          if (services && services.length > 0) {
            setSelectedServices(services);
          }
        }
      })
      .catch((err) => {
        console.log(
          "[Preferences] Could not fetch preferences for modal",
          err?.response?.status,
        );
      });

    // Also fetch patient profile to get barangay as fallback
    apiClient
      .get("/api/patient/me")
      .then((res) => {
        if (res?.data?.barangay) {
          setPatientBarangay(res.data.barangay);
        } else if (res?.data?.Barangay) {
          setPatientBarangay(res.data.Barangay);
        }
      })
      .catch((err) => {
        console.log(
          "[Patient] Could not fetch patient profile for barangay",
          err?.response?.status,
        );
      });
  }, []);

  // Force refresh function that clears cache
  const forceRefreshRecs = useCallback(async () => {
    await clearRecommendationsCache();
    queryClient.invalidateQueries({ queryKey: RECOMMENDATIONS_QUERY_KEY });
  }, [queryClient]);

  // Best-effort: allow creating/enrolling patient profile if missing/forbidden
  const [isEnrolling, setIsEnrolling] = useState(false);
  const enrollPatient = useCallback(async () => {
    if (isEnrolling) return;
    setIsEnrolling(true);
    try {
      await apiClient.post("/api/Auth/enroll/patient");
      // After enrolling, invalidate cache and refetch
      await forceRefreshRecs();
    } catch (err) {
      console.warn("Enroll patient failed", (err as any)?.response || err);
    } finally {
      setIsEnrolling(false);
    }
  }, [isEnrolling, forceRefreshRecs]);

  // derive base URL from axios instance so we can build relative image URLs
  const baseUrl = (apiClient as any)?.defaults?.baseURL ?? "";

  const buildImageUrl = useCallback(
    (path?: string | null) => {
      if (!path) return null;
      if (/^https?:\/\//i.test(path)) return path;
      if (!baseUrl) return path;
      return baseUrl.endsWith("/")
        ? `${baseUrl}${path.replace(/^\//, "")}`
        : `${baseUrl}/${path.replace(/^\//, "")}`;
    },
    [baseUrl],
  );

  const renderItem = useCallback(
    ({ item }: { item: Recommendation }) => {
      const imgSrc = buildImageUrl(item.profilePictureUrl ?? undefined);

      const specializationText = formatListOrNotSpecified(item.specializations);
      const serviceAreasText = formatListOrNotSpecified(item.serviceAreas);
      const genderLabel = formatGenderLabel(item.gender);
      const matchPercentage = getMatchPercentage(item.matchScore);

      const tierStyles = getTierStyles(item.tier);

      return (
        <TouchableOpacity
          className={`w-full bg-white rounded-2xl p-4 mb-4 border border-teal-100 lg:max-w-4xl lg:mx-auto shadow-sm ${
            item.breakdown ? "lg:flex-row" : ""
          }`}
          activeOpacity={0.85}
          onPress={() =>
            router.push({
              pathname: "/(patient)/therapists/[therapistId]",
              params: { therapistId: String(item.therapistId) },
            })
          }
        >
          <View
            className={`flex-1 ${item.breakdown ? "lg:pr-4 lg:w-1/2" : ""}`}
          >
            {/* Tier Badge */}
            {item.tier === "Recommended" && (
              <View className="flex-row justify-end mb-2">
                <View
                  className={`px-3 py-1 rounded-full ${tierStyles.bgColor} border ${tierStyles.borderColor}`}
                >
                  <Text
                    className={`text-xs font-semibold ${tierStyles.textColor}`}
                  >
                    {item.tierLabel || "Recommended"}
                  </Text>
                </View>
              </View>
            )}

            <View className="flex-row items-center mb-3">
              {imgSrc ? (
                <Image
                  source={{ uri: imgSrc }}
                  className="w-16 h-16 rounded-2xl mr-4 bg-[#EEE]"
                />
              ) : (
                <View className="w-16 h-16 rounded-2xl mr-4 bg-teal-50 items-center justify-center">
                  <Text className="font-bold text-teal-700 text-lg">
                    {getInitials(item.therapistName)}
                  </Text>
                </View>
              )}
              <View className="flex-1">
                <Text className="text-lg font-bold text-black mb-1">
                  {item.therapistName?.trim() || "Unnamed Therapist"}
                </Text>
                {item.licenseNumber && (
                  <Text className="text-xs text-[#6B7280] mb-1.5">
                    License: {item.licenseNumber}
                  </Text>
                )}
                <View className="flex-row items-center mb-1">
                  <User color="#0D9488" size={16} style={{ marginRight: 6 }} />
                  <Text className="text-sm text-gray-700">{genderLabel}</Text>
                </View>
                <View
                  className={`flex-row items-center px-2 py-1 rounded-lg self-start mt-1 ${
                    matchPercentage >= 70
                      ? "bg-emerald-50"
                      : matchPercentage >= 50
                        ? "bg-amber-50"
                        : "bg-gray-50"
                  }`}
                >
                  <TrendingUp
                    color={
                      matchPercentage >= 70
                        ? "#059669"
                        : matchPercentage >= 50
                          ? "#D97706"
                          : "#6B7280"
                    }
                    size={14}
                    style={{ marginRight: 4 }}
                  />
                  <Text
                    className={`text-xs font-bold ${
                      matchPercentage >= 70
                        ? "text-emerald-700"
                        : matchPercentage >= 50
                          ? "text-amber-700"
                          : "text-gray-700"
                    }`}
                  >
                    {matchPercentage}% Match
                  </Text>
                </View>
              </View>
            </View>

            <View className="mb-2.5">
              <Text className="text-sm font-semibold text-gray-900 mb-1">
                Specializations
              </Text>
              <Text className="text-sm text-gray-700 flex-1">
                {specializationText}
              </Text>
            </View>

            <View className="mb-2.5">
              <Text className="text-sm font-semibold text-gray-900 mb-1">
                Service Areas
              </Text>
              <View className="flex-row items-start">
                <MapPin color="#0D9488" size={16} style={{ marginRight: 6 }} />
                <Text className="text-sm text-gray-700 flex-1">
                  {serviceAreasText}
                </Text>
              </View>
            </View>
          </View>

          {item.breakdown && Object.keys(item.breakdown).length > 0 && (
            <MatchBreakdown breakdown={item.breakdown} />
          )}
        </TouchableOpacity>
      );
    },
    [buildImageUrl, router],
  );

  const fromFresh = !!params.fresh;

  const [resetting, setResetting] = useState(false);

  const handleReset = useCallback(async () => {
    if (resetting) return;
    if (isDesktop) {
      // For desktop, show the wizard inline instead of redirecting
      try {
        setResetting(true);
        await apiClient.delete("/api/Preferences/me");
        // Clear recommendations cache since preferences are being reset
        await clearRecommendationsCache();
        queryClient.invalidateQueries({ queryKey: RECOMMENDATIONS_QUERY_KEY });
        // Reset wizard state
        setSelectedSpecializations([]);
        setSessionBudget("");
        setSelectedDays([]);
        setStartTime("06:00:00");
        setEndTime("20:00:00");
        setPreferredTherapistGender(null);
        setSelectedServices([]);
        setExpandedIds([]);
        setDesktopStep(1);
      } catch (e) {
        console.warn("Failed to reset preferences", e);
      } finally {
        setResetting(false);
      }
    } else {
      // For mobile, redirect to step1
      try {
        setResetting(true);
        await apiClient.delete("/api/Preferences/me");
        // Clear recommendations cache since preferences are being reset
        await clearRecommendationsCache();
        queryClient.invalidateQueries({ queryKey: RECOMMENDATIONS_QUERY_KEY });
        router.replace("/(patient)/recommend/step1");
      } catch (e) {
        console.warn("Failed to reset preferences", e);
        setResetting(false);
      }
    }
  }, [resetting, router, isDesktop, queryClient]);

  // Step 1 helpers
  const toggleSpecialization = (name: string) => {
    setSelectedSpecializations((prev) =>
      prev.includes(name) ? prev.filter((s) => s !== name) : [...prev, name],
    );
  };

  const toggleDay = (dayId: number) => {
    setSelectedDays((prev) =>
      prev.includes(dayId) ? prev.filter((d) => d !== dayId) : [...prev, dayId],
    );
  };

  const getTimeLabel = (timeValue: string): string => {
    return TIME_OPTIONS.find((t) => t.value === timeValue)?.label || timeValue;
  };

  const availabilities = useMemo((): AvailabilityBlock[] => {
    return buildAvailabilityBlocks({ selectedDays, startTime, endTime });
  }, [selectedDays, startTime, endTime]);

  const specializationDisplayText = useMemo(() => {
    return getSpecializationDisplayText(selectedSpecializations);
  }, [selectedSpecializations]);

  const canProceedStep1 = useMemo(() => {
    return canProceedPreferencesStep1({
      selectedSpecializations,
      sessionBudget,
      preferredTherapistGender,
      selectedDays,
    });
  }, [
    selectedSpecializations,
    sessionBudget,
    preferredTherapistGender,
    selectedDays,
  ]);

  // Step 2 helpers
  const selectedCategoryIds = useMemo(() => {
    return mapSpecializationsToCategoryIds(
      selectedSpecializations,
      specializationToCategoryMap,
    );
  }, [selectedSpecializations]);

  const orderedServiceData = useMemo(() => {
    if (selectedCategoryIds.length === 0) return SERVICE_DATA;
    return reorderCategoriesBySelectedIds(SERVICE_DATA, selectedCategoryIds);
  }, [selectedCategoryIds]);

  const filteredServiceData = useMemo(() => {
    return filterCategoriesByServiceQuery(
      orderedServiceData,
      appliedServiceQuery,
    );
  }, [appliedServiceQuery, orderedServiceData]);

  // Auto-expand categories when entering step 2
  useEffect(() => {
    if (
      desktopStep === 2 &&
      selectedCategoryIds.length > 0 &&
      expandedIds.length === 0
    ) {
      setExpandedIds(selectedCategoryIds);
    }
  }, [desktopStep, selectedCategoryIds, expandedIds.length]);

  // Submit preferences (desktop)
  const handleSubmitPreferences = useCallback(async () => {
    if (submittingPrefs) return;
    setSubmittingPrefs(true);
    try {
      const payload = {
        preferredSpecializations: selectedSpecializations,
        preferredSpecialization: selectedSpecializations[0] || null,
        sessionBudget: Number(sessionBudget),
        preferredTherapistGender,
        availabilities,
        desiredServices: selectedServices,
      };
      console.log("[Recommend][Desktop] final payload ->", payload);
      await apiClient.post("/api/Preferences/me", payload);
      // Invalidate cache since preferences changed, then fetch fresh recommendations
      await invalidateRecommendationsOnPreferenceChange();
      queryClient.invalidateQueries({ queryKey: RECOMMENDATIONS_QUERY_KEY });
      setDesktopStep("results");
    } catch (err) {
      console.error("Failed to submit preferences", err);
    } finally {
      setSubmittingPrefs(false);
    }
  }, [
    submittingPrefs,
    selectedSpecializations,
    sessionBudget,
    preferredTherapistGender,
    availabilities,
    selectedServices,
    queryClient,
  ]);

  // Split results into "Recommended" (>= 0.70) and "Others" (< 0.70)
  const { recommendedItems, otherItems } = useMemo(() => {
    return splitRecommendationsByThreshold(items, 0.7);
  }, [items]);

  const headerRight = useMemo(
    () => (
      <View className="flex-row items-center gap-3">
        {/* Refresh button for desktop/web */}
        {isDesktop && (
          <TouchableOpacity
            onPress={forceRefreshRecs}
            disabled={refreshing || loading}
            accessibilityLabel="Refresh recommendations"
            style={{ backgroundColor: "rgba(8, 151, 105, 0.1)" }}
            className="flex-row items-center px-4 py-2.5 rounded-xl border border-teal-200 transition-colors"
            activeOpacity={0.85}
          >
            {refreshing || loading ? (
              <ActivityIndicator size="small" color="#089769" />
            ) : (
              <>
                <RefreshCw size={16} color="#089769" style={{ marginRight: 8 }} />
                <Text style={{ color: "#089769" }} className="font-bold text-sm">
                  Refresh
                </Text>
              </>
            )}
          </TouchableOpacity>
        )}

        <TouchableOpacity
          onPress={() => setShowPreferencesModal(true)}
          accessibilityLabel="View preferences"
          style={{ backgroundColor: "#089769" }}
          className="flex-row items-center px-3 py-2.5 rounded-lg"
          activeOpacity={0.85}
        >
          <Info size={18} color="white" />
        </TouchableOpacity>
      </View>
    ),
    [isDesktop, forceRefreshRecs, refreshing, loading],
  );

  // Desktop Step Indicator Component
  const DesktopStepIndicator = () => (
    <View className="flex-row items-center justify-center mb-10">
      {/* Step 1 */}
      <View className="items-center">
        <View
          style={{
            backgroundColor:
              desktopStep === 1 ||
              desktopStep === 2 ||
              desktopStep === "results"
                ? "#4B5563"
                : "white",
            borderWidth:
              desktopStep === 1 ||
              desktopStep === 2 ||
              desktopStep === "results"
                ? 0
                : 2,
            borderColor: "#E5E7EB",
          }}
          className="w-12 h-12 rounded-full items-center justify-center shadow-sm"
        >
          {desktopStep === 2 || desktopStep === "results" ? (
            <Check size={22} color="white" strokeWidth={3} />
          ) : (
            <Text className="text-white font-bold text-lg">1</Text>
          )}
        </View>
        <Text
          className={`mt-2 text-sm font-medium ${
            desktopStep === 1 ? "text-gray-900" : "text-gray-500"
          }`}
        >
          Preferences
        </Text>
      </View>

      {/* Connector Line */}
      <View
        style={{
          backgroundColor:
            desktopStep === 2 || desktopStep === "results"
              ? "#4B5563"
              : "#E5E7EB",
        }}
        className="w-32 h-1.5 mx-4 rounded-full"
      />

      {/* Step 2 */}
      <View className="items-center">
        <View
          style={{
            backgroundColor:
              desktopStep === 2 || desktopStep === "results"
                ? "#4B5563"
                : "white",
            borderWidth: desktopStep === 2 || desktopStep === "results" ? 0 : 2,
            borderColor: "#E5E7EB",
          }}
          className="w-12 h-12 rounded-full items-center justify-center shadow-sm"
        >
          {desktopStep === "results" ? (
            <Check size={22} color="white" strokeWidth={3} />
          ) : (
            <Text
              className={`font-bold text-lg ${
                desktopStep === 2 ? "text-white" : "text-gray-400"
              }`}
            >
              2
            </Text>
          )}
        </View>
        <Text
          className={`mt-2 text-sm font-medium ${
            desktopStep === 2 ? "text-gray-900" : "text-gray-500"
          }`}
        >
          Conditions
        </Text>
      </View>
    </View>
  );

  // Render desktop unified view
  if (isDesktop) {
    return (
      <View style={{ backgroundColor: "#e6f5f0" }} className="flex-1">
        <WebHeader />
        <SafeAreaView
          style={{ backgroundColor: "#e6f5f0" }}
          className="flex-1 w-full"
        >
          <ScrollView
            className="flex-1 w-full"
            showsVerticalScrollIndicator={false}
          >
            <View className="w-full max-w-screen-lg mx-auto px-6 pt-8 pb-10">
              {/* Page Header */}
              <View className="flex-row items-center mb-8">
                <TouchableOpacity
                  className="flex-row items-center px-4 py-2 rounded-xl bg-white border border-gray-200 mr-4 hover:bg-gray-50 transition-colors"
                  onPress={() => {
                    if (desktopStep === 2) {
                      setDesktopStep(1);
                    } else if (desktopStep === 1) {
                      router.replace("/(patient)/(tabs)");
                    } else {
                      router.replace("/(patient)/(tabs)");
                    }
                  }}
                >
                  <ArrowLeft size={18} color="#6B7280" />
                  <Text className="font-semibold ml-2 text-gray-600">Back</Text>
                </TouchableOpacity>
                <View className="flex-1">
                  <Text className="text-xs font-semibold uppercase tracking-wide mb-1 text-gray-500">
                    {desktopStep === 1
                      ? "Step 1 of 2"
                      : desktopStep === 2
                        ? "Step 2 of 2"
                        : "Results"}
                  </Text>
                  <Text className="text-3xl font-bold text-gray-900">
                    {desktopStep === 1
                      ? "Set Your Preferences"
                      : desktopStep === 2
                        ? "Select Your Condition"
                        : "Your Top Matches"}
                  </Text>
                  <Text className="text-gray-500 mt-1">
                    {desktopStep === 1
                      ? "Tell us what you're looking for in a therapist"
                      : desktopStep === 2
                        ? "Choose the conditions you need help with"
                        : "Therapists that best match your needs"}
                  </Text>
                </View>
                {desktopStep === "results" && (
                  <View className="items-end">{headerRight}</View>
                )}
              </View>

              {/* Step Indicator for wizard steps */}
              {desktopStep !== "results" && <DesktopStepIndicator />}

              {/* Step 1: Preferences */}
              {desktopStep === 1 && (
                <View className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                  {/* Header */}
                  <View className="px-8 py-6 border-b border-gray-200 bg-gray-50">
                    <Text className="text-gray-900 text-lg font-semibold mb-1">
                      Tell us about your preferences
                    </Text>
                    <Text className="text-sm text-gray-500">
                      Help us find the perfect therapist match for you
                    </Text>
                  </View>

                  <View className="p-8">
                    {/* Specialization */}
                    <View className="mb-6">
                      <Text className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">
                        Specialization
                      </Text>
                      <TouchableOpacity
                        className={`p-4 rounded-xl border-2 transition-colors ${
                          selectedSpecializations.length > 0
                            ? "border-gray-400 bg-gray-50"
                            : "border-gray-200 bg-white hover:border-gray-300"
                        }`}
                        onPress={() => setSpecializationOpen(true)}
                      >
                        <View className="flex-row items-center justify-between">
                          <Text
                            className={`text-base ${
                              selectedSpecializations.length > 0
                                ? "font-medium text-gray-900"
                                : "text-gray-400"
                            }`}
                          >
                            {specializationDisplayText}
                          </Text>
                          <ChevronDown size={20} color="#6B7280" />
                        </View>
                      </TouchableOpacity>
                    </View>

                    {/* Budget */}
                    <View className="mb-6">
                      <Text className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">
                        Session Budget (₱)
                      </Text>
                      <View
                        className={`flex-row items-center rounded-xl border-2 px-4 ${
                          sessionBudget
                            ? "border-gray-400 bg-gray-50"
                            : "border-gray-200 bg-white"
                        }`}
                      >
                        <Text
                          className={`mr-2 text-lg ${
                            sessionBudget ? "text-gray-700" : "text-gray-400"
                          }`}
                        >
                          ₱
                        </Text>
                        <TextInput
                          value={sessionBudget}
                          onChangeText={setSessionBudget}
                          placeholder="1500.00"
                          keyboardType="numeric"
                          className="flex-1 py-4 text-base text-gray-900"
                          placeholderTextColor="#9CA3AF"
                        />
                      </View>
                    </View>

                    {/* Weekly Availability */}
                    <View className="mb-6">
                      <Text className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">
                        Weekly Availability
                      </Text>
                      <View className="flex-row gap-4 mb-4">
                        <TouchableOpacity
                          className={`flex-1 rounded-xl border-2 p-4 ${
                            startTime !== "06:00:00"
                              ? "border-gray-400 bg-gray-50"
                              : "border-gray-200 bg-white"
                          }`}
                          onPress={() => setTimeModalOpen("start")}
                        >
                          <Text className="text-xs text-gray-500 uppercase tracking-wide mb-1">
                            From
                          </Text>
                          <View className="flex-row items-center justify-between">
                            <Text
                              className={`text-base font-medium text-gray-900`}
                            >
                              {getTimeLabel(startTime)}
                            </Text>
                            <Clock size={18} color="#6B7280" />
                          </View>
                        </TouchableOpacity>
                        <TouchableOpacity
                          className={`flex-1 rounded-xl border-2 p-4 ${
                            endTime !== "20:00:00"
                              ? "border-gray-400 bg-gray-50"
                              : "border-gray-200 bg-white"
                          }`}
                          onPress={() => setTimeModalOpen("end")}
                        >
                          <Text className="text-xs text-gray-500 uppercase tracking-wide mb-1">
                            To
                          </Text>
                          <View className="flex-row items-center justify-between">
                            <Text
                              className={`text-base font-medium text-gray-900`}
                            >
                              {getTimeLabel(endTime)}
                            </Text>
                            <Clock size={18} color="#6B7280" />
                          </View>
                        </TouchableOpacity>
                      </View>

                      {/* Day Selection */}
                      <View className="flex-row flex-wrap gap-2">
                        {DAYS_OF_WEEK.map((day) => {
                          const isSelected = selectedDays.includes(day.id);
                          return (
                            <TouchableOpacity
                              key={day.id}
                              style={
                                isSelected
                                  ? {
                                      backgroundColor: "#089769",
                                      borderColor: "#089769",
                                    }
                                  : undefined
                              }
                              className={`px-5 py-3 rounded-xl border-2 transition-colors ${
                                isSelected
                                  ? ""
                                  : "bg-white border-gray-200 hover:border-gray-300"
                              }`}
                              onPress={() => toggleDay(day.id)}
                            >
                              <Text
                                className={`text-sm font-semibold ${
                                  isSelected ? "text-white" : "text-gray-600"
                                }`}
                              >
                                {day.shortName}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                      {selectedDays.length > 0 && (
                        <Text className="text-sm mt-3 text-gray-600">
                          {selectedDays.length} day
                          {selectedDays.length !== 1 ? "s" : ""} selected
                        </Text>
                      )}
                    </View>

                    {/* Gender */}
                    <View className="mb-8">
                      <Text className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">
                        Therapist Gender Preference
                      </Text>
                      <TouchableOpacity
                        className={`p-4 rounded-xl border-2 ${
                          preferredTherapistGender
                            ? "border-gray-400 bg-gray-50"
                            : "border-gray-200 bg-white hover:border-gray-300"
                        }`}
                        onPress={() => setGenderModalOpen(true)}
                      >
                        <View className="flex-row items-center justify-between">
                          <Text
                            className={`text-base ${
                              preferredTherapistGender
                                ? "font-medium text-gray-900"
                                : "text-gray-400"
                            }`}
                          >
                            {preferredTherapistGender ??
                              "Select your preference"}
                          </Text>
                          <ChevronDown size={20} color="#6B7280" />
                        </View>
                      </TouchableOpacity>
                    </View>

                    {/* Next Button */}
                    <TouchableOpacity
                      style={
                        canProceedStep1
                          ? { backgroundColor: "#089769" }
                          : undefined
                      }
                      className={`py-4 rounded-xl items-center flex-row justify-center ${
                        canProceedStep1 ? "" : "bg-gray-200"
                      }`}
                      disabled={!canProceedStep1}
                      onPress={() => setDesktopStep(2)}
                    >
                      <Text
                        className={`font-bold text-lg mr-2 ${
                          canProceedStep1 ? "text-white" : "text-gray-400"
                        }`}
                      >
                        Continue to Services
                      </Text>
                      <ChevronRight
                        size={20}
                        color={canProceedStep1 ? "white" : "#9CA3AF"}
                      />
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {/* Step 2: Select Services */}
              {desktopStep === 2 && (
                <View className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                  {/* Header */}
                  <View className="px-8 py-6 border-b border-gray-200 bg-gray-50">
                    <Text className="text-gray-900 text-lg font-semibold mb-1">
                      What condition do you need help with?
                    </Text>
                    <Text className="text-sm text-gray-500">
                      Select one or more conditions that match your needs
                    </Text>
                  </View>

                  {/* Search Bar */}
                  <View className="px-8 py-5 bg-gray-50 border-b border-gray-100">
                    <View className="flex-row gap-3">
                      <View className="flex-1 flex-row items-center bg-white border-2 border-gray-200 rounded-xl px-4 focus-within:border-gray-400">
                        <Search size={18} color="#9CA3AF" />
                        <TextInput
                          ref={serviceInputRef}
                          value={serviceQuery}
                          onChangeText={setServiceQuery}
                          placeholder="Search specific cases (e.g. COPD, Stroke, ACL tear)"
                          className="flex-1 py-3 ml-3 text-base"
                          placeholderTextColor="#9CA3AF"
                          onSubmitEditing={() =>
                            setAppliedServiceQuery(serviceQuery)
                          }
                        />
                        {serviceQuery.length > 0 && (
                          <TouchableOpacity
                            onPress={() => {
                              setServiceQuery("");
                              setAppliedServiceQuery("");
                            }}
                          >
                            <X size={18} color="#9CA3AF" />
                          </TouchableOpacity>
                        )}
                      </View>
                      <TouchableOpacity
                        style={{ backgroundColor: "#089769" }}
                        className="px-6 rounded-xl items-center justify-center"
                        onPress={() => setAppliedServiceQuery(serviceQuery)}
                      >
                        <Text className="text-white font-bold">Search</Text>
                      </TouchableOpacity>
                    </View>
                  </View>

                  {/* Service Categories */}
                  <ScrollView
                    className="max-h-[400px]"
                    showsVerticalScrollIndicator={false}
                  >
                    <View className="p-6">
                      {filteredServiceData.map((cat, catIndex) => {
                        const isExpanded = expandedIds.includes(cat.id);
                        const isMatchingCategory = selectedCategoryIds.includes(
                          cat.id,
                        );
                        return (
                          <View
                            key={cat.id}
                            style={
                              isMatchingCategory
                                ? {
                                    backgroundColor: "#F3F4F6",
                                    borderColor: "#9CA3AF",
                                  }
                                : undefined
                            }
                            className={`mb-3 rounded-xl overflow-hidden border ${
                              isMatchingCategory
                                ? ""
                                : "border-gray-100 bg-white"
                            }`}
                          >
                            <TouchableOpacity
                              className={`flex-row items-center p-4 ${
                                isExpanded ? "border-b border-gray-100" : ""
                              }`}
                              onPress={() => {
                                setExpandedIds((prev) =>
                                  prev.includes(cat.id)
                                    ? prev.filter((id) => id !== cat.id)
                                    : [...prev, cat.id],
                                );
                              }}
                            >
                              <View
                                className={`w-1 h-8 rounded-full mr-4 ${
                                  isMatchingCategory
                                    ? "bg-gray-500"
                                    : "bg-gray-300"
                                }`}
                              />
                              <Text
                                className={`text-lg font-bold flex-1 ${
                                  isMatchingCategory
                                    ? "text-gray-900"
                                    : "text-gray-900"
                                }`}
                              >
                                {cat.category}
                              </Text>
                              {isMatchingCategory && (
                                <View className="px-2 py-1 rounded-md mr-3 bg-gray-200">
                                  <Text className="text-xs font-semibold text-gray-600">
                                    Recommended
                                  </Text>
                                </View>
                              )}
                              <View
                                className={`w-8 h-8 rounded-full items-center justify-center ${
                                  isExpanded ? "bg-gray-200" : "bg-gray-100"
                                }`}
                              >
                                {isExpanded ? (
                                  <ChevronDown size={18} color="#6B7280" />
                                ) : (
                                  <ChevronRight size={18} color="#6B7280" />
                                )}
                              </View>
                            </TouchableOpacity>
                            {isExpanded && (
                              <View className="p-4 pt-2">
                                {cat.services.map((svc) => {
                                  const isSelected = selectedServices.includes(
                                    svc.name,
                                  );
                                  return (
                                    <TouchableOpacity
                                      key={svc.id}
                                      style={
                                        isSelected
                                          ? { backgroundColor: "#089769" }
                                          : undefined
                                      }
                                      className={`p-4 rounded-xl mb-2 flex-row items-center justify-between transition-colors ${
                                        isSelected
                                          ? ""
                                          : "bg-gray-50 hover:bg-gray-100"
                                      }`}
                                      onPress={() => {
                                        setSelectedServices((prev) =>
                                          prev.includes(svc.name)
                                            ? prev.filter((s) => s !== svc.name)
                                            : [...prev, svc.name],
                                        );
                                      }}
                                    >
                                      <Text
                                        className={`text-base ${
                                          isSelected
                                            ? "text-white font-semibold"
                                            : "text-gray-700"
                                        }`}
                                      >
                                        {svc.name}
                                      </Text>
                                      {isSelected && (
                                        <View className="w-6 h-6 rounded-full bg-white items-center justify-center">
                                          <Check size={14} color="#089769" />
                                        </View>
                                      )}
                                    </TouchableOpacity>
                                  );
                                })}
                              </View>
                            )}
                          </View>
                        );
                      })}
                    </View>
                  </ScrollView>

                  {/* Selected Summary & Submit */}
                  <View className="px-8 py-6 border-t border-gray-100 bg-gradient-to-r from-gray-50 to-white">
                    <View className="flex-row items-center justify-between">
                      <View className="flex-1 mr-4">
                        <Text className="text-xs text-gray-500 uppercase tracking-wide mb-1">
                          Selected Condition
                          {selectedServices.length !== 1 ? "s" : ""}
                        </Text>
                        {selectedServices.length > 0 ? (
                          <>
                            <Text
                              className="text-lg font-bold text-gray-900"
                              numberOfLines={1}
                            >
                              {selectedServices.slice(0, 2).join(", ")}
                              {selectedServices.length > 2 &&
                                ` +${selectedServices.length - 2} more`}
                            </Text>
                            <Text className="text-sm font-medium text-gray-600">
                              {selectedServices.length} condition
                              {selectedServices.length !== 1 ? "s" : ""}{" "}
                              selected
                            </Text>
                          </>
                        ) : (
                          <Text className="text-base text-gray-400">
                            No conditions selected yet
                          </Text>
                        )}
                      </View>
                      <TouchableOpacity
                        style={
                          selectedServices.length > 0 && !submittingPrefs
                            ? { backgroundColor: "#089769" }
                            : undefined
                        }
                        className={`px-8 py-4 rounded-xl flex-row items-center ${
                          selectedServices.length > 0 && !submittingPrefs
                            ? ""
                            : "bg-gray-200"
                        }`}
                        disabled={
                          selectedServices.length === 0 || submittingPrefs
                        }
                        onPress={handleSubmitPreferences}
                      >
                        {submittingPrefs ? (
                          <ActivityIndicator size="small" color="white" />
                        ) : (
                          <>
                            <Text
                              className={`font-bold text-lg mr-2 ${
                                selectedServices.length > 0
                                  ? "text-white"
                                  : "text-gray-400"
                              }`}
                            >
                              Find Matches
                            </Text>
                            <Search
                              size={18}
                              color={
                                selectedServices.length > 0
                                  ? "white"
                                  : "#9CA3AF"
                              }
                            />
                          </>
                        )}
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              )}

              {/* Results View */}
              {desktopStep === "results" && (
                <>
                  {/* Results Header Banner */}
                  {!loading && !error && items.length > 0 && (
                    <View
                      style={{ backgroundColor: "#089769" }}
                      className="rounded-2xl px-8 py-6 mb-6 shadow-sm"
                    >
                      <View className="flex-row items-center justify-between">
                        <View className="flex-1">
                          <Text className="text-white text-xl font-bold mb-1">
                            Based on your submitted preferences, here are the
                            top matches
                            {selectedServices.length > 0
                              ? ` for ${selectedServices[0]}`
                              : ""}
                            .
                          </Text>
                          <Text
                            style={{ color: "rgba(255,255,255,0.8)" }}
                            className="text-sm"
                          >
                            {items.length} therapist
                            {items.length !== 1 ? "s" : ""} found matching your
                            criteria
                          </Text>
                        </View>
                      </View>
                    </View>
                  )}

                  <View className="mb-6">
                    {recommendedItems.length > 0 ? (
                      recommendedItems.map((item) => (
                        <View key={item.therapistId}>
                          {renderItem({ item })}
                        </View>
                      ))
                    ) : (
                      <View className="items-center py-10 bg-white rounded-2xl border border-gray-200 mb-6">
                        <View className="w-16 h-16 bg-gray-50 rounded-full items-center justify-center mb-4">
                          <Search size={32} color="#9CA3AF" />
                        </View>
                        <Text className="text-lg font-bold text-gray-900 mb-2">
                          No recommended matches found
                        </Text>
                        <Text className="text-gray-500 text-center px-8">
                          We couldn{"'"}t find any therapists that meet the
                          strictly recommended criteria (70%+ match).
                          {otherItems.length > 0 &&
                            " Check the other options below."}
                        </Text>
                      </View>
                    )}
                  </View>

                  {/* Other Options Toggle Section */}
                  {otherItems.length > 0 && (
                    <View className="mb-8">
                      <TouchableOpacity
                        onPress={() => setShowOtherOptions(!showOtherOptions)}
                        className="flex-row items-center justify-center py-3 mb-4"
                        activeOpacity={0.7}
                      >
                        <Text className="text-gray-500 font-medium mr-2">
                          {showOtherOptions ? "Hide" : "View"} other recommendation
                        </Text>
                        {showOtherOptions ? (
                          <ChevronDown size={20} color="#6B7280" />
                        ) : (
                          <ChevronRight size={20} color="#6B7280" />
                        )}
                      </TouchableOpacity>

                      {showOtherOptions && (
                        <View>
                          <Text className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-4 ml-1">
                            Other Recommendation
                          </Text>
                          {otherItems.map((item) => (
                            <View key={item.therapistId}>
                              {renderItem({ item })}
                            </View>
                          ))}
                        </View>
                      )}
                    </View>
                  )}
                  {resetting ? (
                    <View className="flex-1 items-center justify-center py-20 bg-white rounded-2xl border border-gray-200">
                      <View className="w-16 h-16 rounded-full items-center justify-center mb-4 bg-gray-100">
                        <ActivityIndicator size="large" color="#6B7280" />
                      </View>
                      <Text className="text-lg font-semibold text-gray-900 mb-1">
                        Resetting preferences...
                      </Text>
                      <Text className="text-gray-500">
                        Please wait a moment
                      </Text>
                    </View>
                  ) : loading ? (
                    <View className="flex-1 items-center justify-center py-20 bg-white rounded-2xl border border-gray-200">
                      <View className="w-16 h-16 rounded-full items-center justify-center mb-4 bg-gray-100">
                        <ActivityIndicator size="large" color="#6B7280" />
                      </View>
                      <Text className="text-lg font-semibold text-gray-900 mb-1">
                        Finding your perfect matches...
                      </Text>
                      <Text className="text-gray-500">
                        Analyzing therapist profiles
                      </Text>
                    </View>
                  ) : error ? (
                    <View className="flex-1 items-center justify-center py-20 bg-white rounded-2xl border border-gray-200">
                      {error.toLowerCase().includes("preference") ? (
                        <>
                          <View className="w-24 h-24 rounded-full items-center justify-center mb-6 bg-gray-100">
                            <Search size={48} color="#6B7280" />
                          </View>
                          <Text className="text-2xl font-bold text-gray-900 text-center mb-2">
                            Find Your Perfect Match
                          </Text>
                          <Text className="text-gray-500 text-center mb-8 text-base leading-6 max-w-md px-4">
                            Tell us about your preferences and we&apos;ll match
                            you with the best therapists for your needs.
                          </Text>
                          <TouchableOpacity
                            onPress={() => setDesktopStep(1)}
                            style={{ backgroundColor: "#089769" }}
                            className="flex-row items-center px-8 py-4 rounded-xl"
                            activeOpacity={0.85}
                          >
                            <Search
                              size={20}
                              color="white"
                              style={{ marginRight: 10 }}
                            />
                            <Text className="text-white text-lg font-bold">
                              Get Started
                            </Text>
                          </TouchableOpacity>
                        </>
                      ) : (
                        <>
                          <View className="w-20 h-20 rounded-full bg-red-100 items-center justify-center mb-4">
                            <X size={40} color="#DC2626" />
                          </View>
                          <Text className="text-red-600 text-center mb-6 text-base">
                            {error}
                          </Text>
                          <TouchableOpacity
                            style={{ backgroundColor: "#089769" }}
                            className="px-8 py-4 rounded-xl"
                            onPress={() => {
                              refetch();
                            }}
                          >
                            <Text className="text-white font-bold text-lg">
                              Try Again
                            </Text>
                          </TouchableOpacity>
                        </>
                      )}
                    </View>
                  ) : items.length === 0 ? (
                    <View className="flex-1 items-center justify-center py-20 bg-white rounded-2xl border border-gray-200">
                      <View className="w-20 h-20 rounded-full bg-gray-100 items-center justify-center mb-4">
                        <Search size={40} color="#6B7280" />
                      </View>
                      <Text className="text-xl font-bold text-gray-900 mb-2">
                        No Matches Found
                      </Text>
                      <Text className="text-gray-500 text-center mb-6 max-w-md">
                        We couldn&apos;t find any therapists matching your
                        criteria. Try adjusting your preferences.
                      </Text>
                      <TouchableOpacity
                        style={{ backgroundColor: "#089769" }}
                        className="px-8 py-4 rounded-xl flex-row items-center"
                        disabled={resetting}
                        onPress={handleReset}
                      >
                        <RefreshCw
                          size={18}
                          color="white"
                          style={{ marginRight: 8 }}
                        />
                        <Text className="text-white font-bold text-lg">
                          {resetting ? "Resetting..." : "Adjust Preferences"}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <View>
                      {items.map((item, index) => (
                        <DesktopTherapistCard
                          key={item.therapistId}
                          item={item}
                          buildImageUrl={buildImageUrl}
                          rank={index + 1}
                          onPress={() =>
                            router.push({
                              pathname: "/(patient)/therapists/[therapistId]",
                              params: { therapistId: String(item.therapistId) },
                            })
                          }
                        />
                      ))}
                    </View>
                  )}
                </>
              )}
            </View>
          </ScrollView>
        </SafeAreaView>

        {/* Modals */}
        {renderModals()}
      </View>
    );
  }

  // Mobile view - original implementation
  return (
    <SafeAreaView className="flex-1 bg-[#e6f5f0]">
      <View className="flex-1">
        <RecommendHeader
          title="Recommendations"
          currentStep={1}
          totalSteps={2}
          backToHome
          hideSteps
          rightElement={headerRight}
        />
        {fromFresh && !loading && !error && items.length > 0 && (
          <View className="px-4 py-3 bg-blue-50 border-b border-blue-100">
            <Text className="text-blue-800 text-base font-semibold text-center">
              Based on your submitted preferences, here are the top matches.
            </Text>
          </View>
        )}
        {resetting ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator size="large" color={COLORS.PRIMARY} />
            <Text className="mt-4 text-[#555]">
              Resetting your preferences...
            </Text>
          </View>
        ) : loading ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator size="large" color={COLORS.PRIMARY} />
            <Text className="mt-4 text-[#555]">
              Fetching recommendations...
            </Text>
          </View>
        ) : error ? (
          <View className="flex-1 items-center justify-center px-6">
            {error && error.toLowerCase().includes("preference") ? (
              <>
                <View className="w-20 h-20 rounded-full bg-blue-100 items-center justify-center mb-4">
                  <Search size={40} color={COLORS.PRIMARY} />
                </View>
                <Text className="text-xl font-bold text-[#111] text-center mb-2">
                  Find Your Perfect Match
                </Text>
                <Text className="text-[#6B7280] text-center mb-6 text-base leading-6">
                  {error}
                </Text>
                <TouchableOpacity
                  onPress={() => router.replace("/(patient)/recommend/step1")}
                  accessibilityLabel="Find Match"
                  className="flex-row items-center px-6 py-3 rounded-lg bg-blue-600"
                  activeOpacity={0.85}
                >
                  <Search size={20} color="white" style={{ marginRight: 8 }} />
                  <Text className="text-white text-lg font-semibold">
                    Find Match
                  </Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text className="text-[#DC2626] text-center mb-4">{error}</Text>
                <PrimaryButton
                  title="Retry"
                  style={{ marginTop: 16 }}
                  onPress={() => {
                    refetch();
                  }}
                />
                {(error?.includes("Patient") || error?.includes("profile")) && (
                  <PrimaryButton
                    title={
                      isEnrolling
                        ? "Setting up your account…"
                        : "Create Patient Account"
                    }
                    disabled={isEnrolling}
                    style={{ marginTop: 10 }}
                    onPress={enrollPatient}
                  />
                )}
              </>
            )}
          </View>
        ) : items.length === 0 ? (
          <View className="flex-1 items-center justify-center">
            <Text className="text-[#6B7280] text-center">
              No recommendations found.
            </Text>
            <PrimaryButton
              title={resetting ? "Resetting" : "Reset Preferences"}
              disabled={resetting}
              style={{ marginTop: 20 }}
              onPress={handleReset}
            />
          </View>
        ) : (
          <FlatList
            data={recommendedItems}
            keyExtractor={(i) => String(i.therapistId)}
            renderItem={renderItem}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => {
                  forceRefreshRecs();
                }}
              />
            }
            ListEmptyComponent={() => (
              <View className="items-center py-10 bg-white rounded-2xl border border-gray-200 mx-4 mb-6">
                <View className="w-16 h-16 bg-gray-50 rounded-full items-center justify-center mb-4">
                  <Search size={32} color="#9CA3AF" />
                </View>
                <Text className="text-lg font-bold text-gray-900 mb-2">
                  No recommended matches found
                </Text>
                <Text className="text-gray-500 text-center px-8">
                  We couldn{"'"}t find any therapists that meet the strictly
                  recommended criteria (70%+ match).
                  {otherItems.length > 0 && " Check the other options below."}
                </Text>
              </View>
            )}
            ListFooterComponent={() => (
              <View className="px-4 pb-8">
                {otherItems.length > 0 && (
                  <View className="mt-4">
                    <TouchableOpacity
                      onPress={() => setShowOtherOptions(!showOtherOptions)}
                      className="flex-row items-center justify-center py-3 mb-4"
                      activeOpacity={0.7}
                    >
                      <Text className="text-gray-500 font-medium mr-2">
                        {showOtherOptions ? "Hide" : "View"} other recommendation
                      </Text>
                      {showOtherOptions ? (
                        <ChevronDown size={20} color="#6B7280" />
                      ) : (
                        <ChevronRight size={20} color="#6B7280" />
                      )}
                    </TouchableOpacity>

                    {showOtherOptions && (
                      <View>
                        <Text className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-4 ml-1">
                          Other Recommendation
                        </Text>
                        {otherItems.map((item) => (
                          <View key={item.therapistId}>
                            {renderItem({ item })}
                          </View>
                        ))}
                      </View>
                    )}
                  </View>
                )}
              </View>
            )}
            contentContainerStyle={{
              paddingBottom: 24,
              paddingTop: 24,
              paddingHorizontal: 20,
            }}
          />
        )}
      </View>
      {renderModals()}
    </SafeAreaView>
  );

  // Modals renderer
  function renderModals() {
    return (
      <>
        {/* Preferences Info Modal */}
        <Modal
          visible={showPreferencesModal}
          transparent
          animationType="fade"
          onRequestClose={() => setShowPreferencesModal(false)}
        >
          <View className="flex-1 justify-center items-center bg-black/50 px-6">
            <View className="bg-white rounded-3xl w-full max-w-md overflow-hidden">
              {/* Header */}
              <View className="px-6 py-5 border-b border-gray-100 flex-row items-center justify-between">
                <View className="flex-row items-center">
                  <View className="w-10 h-10 rounded-full bg-teal-100 items-center justify-center mr-3">
                    <Info size={20} color="#0D9488" />
                  </View>
                  <Text className="text-lg font-bold text-gray-900">
                    Your Preferences
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => setShowPreferencesModal(false)}
                >
                  <X size={24} color="#6B7280" />
                </TouchableOpacity>
              </View>

              {/* Content */}
              <ScrollView className="px-6 py-5" style={{ maxHeight: 400 }}>
                {/* Barangay */}
                <View className="mb-4">
                  <View className="flex-row items-center mb-2">
                    <MapPin
                      size={16}
                      color="#0D9488"
                      style={{ marginRight: 6 }}
                    />
                    <Text className="text-sm font-semibold text-gray-700">
                      Barangay
                    </Text>
                  </View>
                  <Text className="text-base text-gray-900 ml-6">
                    {savedPreferences?.preferredBarangay ||
                      (savedPreferences as any)?.PreferredBarangay ||
                      patientBarangay ||
                      user?.barangay ||
                      user?.address ||
                      "Not specified"}
                  </Text>
                </View>

                {/* Specializations */}
                {(selectedSpecializations.length > 0 ||
                  (savedPreferences?.preferredSpecializations &&
                    savedPreferences.preferredSpecializations.length > 0)) && (
                  <View className="mb-4">
                    <View className="flex-row items-center mb-2">
                      <Briefcase
                        size={16}
                        color="#0D9488"
                        style={{ marginRight: 6 }}
                      />
                      <Text className="text-sm font-semibold text-gray-700">
                        Specializations
                      </Text>
                    </View>
                    <View className="ml-6 flex-row flex-wrap gap-2">
                      {(selectedSpecializations.length > 0
                        ? selectedSpecializations
                        : savedPreferences?.preferredSpecializations || []
                      ).map((spec) => (
                        <View
                          key={spec}
                          className="bg-teal-50 px-3 py-1.5 rounded-full"
                        >
                          <Text className="text-sm text-teal-700">{spec}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                )}

                {/* Budget */}
                {sessionBudget && (
                  <View className="mb-4">
                    <View className="flex-row items-center mb-2">
                      <TrendingUp
                        size={16}
                        color="#0D9488"
                        style={{ marginRight: 6 }}
                      />
                      <Text className="text-sm font-semibold text-gray-700">
                        Session Budget
                      </Text>
                    </View>
                    <Text className="text-base text-gray-900 ml-6">
                      ₱{sessionBudget}
                    </Text>
                  </View>
                )}

                {/* Gender Preference */}
                {preferredTherapistGender && (
                  <View className="mb-4">
                    <View className="flex-row items-center mb-2">
                      <User
                        size={16}
                        color="#0D9488"
                        style={{ marginRight: 6 }}
                      />
                      <Text className="text-sm font-semibold text-gray-700">
                        Preferred Therapist Gender
                      </Text>
                    </View>
                    <Text className="text-base text-gray-900 ml-6">
                      {preferredTherapistGender}
                    </Text>
                  </View>
                )}

                {/* Availability */}
                {selectedDays.length > 0 && (
                  <View className="mb-4">
                    <View className="flex-row items-center mb-2">
                      <Clock
                        size={16}
                        color="#0D9488"
                        style={{ marginRight: 6 }}
                      />
                      <Text className="text-sm font-semibold text-gray-700">
                        Preferred Days
                      </Text>
                    </View>
                    <View className="ml-6 flex-row flex-wrap gap-2">
                      {selectedDays.map((dayId) => {
                        const dayName =
                          DAYS_OF_WEEK.find((d) => d.id === dayId)?.shortName ||
                          dayId;
                        return (
                          <View
                            key={dayId}
                            className="bg-gray-100 px-3 py-1.5 rounded-full"
                          >
                            <Text className="text-sm text-gray-700">
                              {dayName}
                            </Text>
                          </View>
                        );
                      })}
                    </View>
                  </View>
                )}

                {/* Time Range */}
                {startTime && endTime && (
                  <View className="mb-4">
                    <View className="flex-row items-center mb-2">
                      <Clock
                        size={16}
                        color="#0D9488"
                        style={{ marginRight: 6 }}
                      />
                      <Text className="text-sm font-semibold text-gray-700">
                        Preferred Time
                      </Text>
                    </View>
                    <Text className="text-base text-gray-900 ml-6">
                      {getTimeLabel(startTime)} - {getTimeLabel(endTime)}
                    </Text>
                  </View>
                )}

                {/* Services / Conditions Treated */}
                <View className="mb-4">
                  <View className="flex-row items-center mb-2">
                    <Briefcase
                      size={16}
                      color="#0D9488"
                      style={{ marginRight: 6 }}
                    />
                    <Text className="text-sm font-semibold text-gray-700">
                      Services / Conditions
                    </Text>
                  </View>
                  {(() => {
                    const services =
                      selectedServices.length > 0
                        ? selectedServices
                        : savedPreferences?.desiredServices ||
                          (savedPreferences as any)?.DesiredServices ||
                          [];
                    if (services.length > 0) {
                      return (
                        <View className="ml-6 flex-row flex-wrap gap-2">
                          {services.map((service: string) => (
                            <View
                              key={service}
                              className="bg-blue-50 px-3 py-1.5 rounded-full"
                            >
                              <Text className="text-sm text-blue-700">
                                {service}
                              </Text>
                            </View>
                          ))}
                        </View>
                      );
                    }
                    return (
                      <Text className="text-base text-gray-900 ml-6">
                        Not specified
                      </Text>
                    );
                  })()}
                </View>
              </ScrollView>

              {/* Footer with Match Again button */}
              <View className="px-6 py-4 border-t border-gray-100 bg-gray-50">
                <TouchableOpacity
                  onPress={() => {
                    setShowPreferencesModal(false);
                    handleReset();
                  }}
                  disabled={resetting}
                  className="flex-row items-center justify-center px-4 py-3.5 rounded-xl"
                  style={{ backgroundColor: resetting ? "#9CA3AF" : "#089769" }}
                  activeOpacity={0.85}
                >
                  <RefreshCw
                    size={18}
                    color="white"
                    style={{ marginRight: 8 }}
                  />
                  <Text className="text-white text-base font-bold">
                    {resetting ? "Resetting..." : "Match Again"}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* Specialization Modal */}
        <Modal
          visible={specializationOpen}
          transparent
          animationType="fade"
          onRequestClose={() => setSpecializationOpen(false)}
        >
          <View className="flex-1 justify-center items-center bg-black/50 px-6">
            <View className="bg-white rounded-3xl p-6 w-full max-w-md max-h-[80%]">
              <View className="flex-row items-center justify-between mb-4">
                <Text className="text-lg font-bold text-gray-900">
                  Select specializations
                </Text>
                <TouchableOpacity onPress={() => setSpecializationOpen(false)}>
                  <X size={24} color="#6B7280" />
                </TouchableOpacity>
              </View>
              {selectedSpecializations.length > 0 && (
                <Text className="text-sm text-gray-500 mb-2">
                  {selectedSpecializations.length} selected
                </Text>
              )}
              <FlatList
                data={SPECIALIZATIONS}
                keyExtractor={(i) => i.id}
                renderItem={({ item }) => {
                  const selected = selectedSpecializations.includes(item.name);
                  return (
                    <Pressable
                      style={
                        selected ? { backgroundColor: "#F3F4F6" } : undefined
                      }
                      className={`px-5 py-4 border-b border-gray-100 flex-row items-center justify-between ${
                        selected ? "" : "bg-white"
                      }`}
                      onPress={() => toggleSpecialization(item.name)}
                    >
                      <Text
                        className={`text-base ${
                          selected
                            ? "font-semibold text-gray-900"
                            : "text-gray-900"
                        }`}
                      >
                        {item.name}
                      </Text>
                      <View
                        style={
                          selected
                            ? {
                                backgroundColor: "#089769",
                                borderColor: "#089769",
                              }
                            : undefined
                        }
                        className={`w-6 h-6 rounded-md border-2 items-center justify-center ${
                          selected ? "" : "border-gray-300"
                        }`}
                      >
                        {selected && <Check size={14} color="white" />}
                      </View>
                    </Pressable>
                  );
                }}
              />
              <TouchableOpacity
                style={{ backgroundColor: "#089769" }}
                className="mt-4 py-3 rounded-xl items-center"
                onPress={() => setSpecializationOpen(false)}
              >
                <Text className="text-white font-semibold text-base">Done</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* Gender Modal */}
        <Modal
          visible={genderModalOpen}
          transparent
          animationType="fade"
          onRequestClose={() => setGenderModalOpen(false)}
        >
          <View className="flex-1 justify-center items-center bg-black/50 px-6">
            <View className="bg-white rounded-3xl p-6 w-full max-w-md">
              <View className="flex-row items-center justify-between mb-4">
                <Text className="text-lg font-bold text-gray-900">
                  Select gender
                </Text>
                <TouchableOpacity onPress={() => setGenderModalOpen(false)}>
                  <X size={24} color="#6B7280" />
                </TouchableOpacity>
              </View>
              {GENDERS.map((g) => {
                const selected = g === preferredTherapistGender;
                return (
                  <Pressable
                    key={g}
                    style={
                      selected ? { backgroundColor: "#F3F4F6" } : undefined
                    }
                    className={`px-5 py-4 border-b border-gray-100 ${
                      selected ? "" : "bg-white"
                    }`}
                    onPress={() => {
                      setPreferredTherapistGender(g);
                      setGenderModalOpen(false);
                    }}
                  >
                    <Text
                      className={`text-base ${
                        selected
                          ? "font-semibold text-gray-900"
                          : "text-gray-900"
                      }`}
                    >
                      {g}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </Modal>

        {/* Time Modal */}
        <Modal
          visible={timeModalOpen !== null}
          transparent
          animationType="fade"
          onRequestClose={() => setTimeModalOpen(null)}
        >
          <View className="flex-1 justify-center items-center bg-black/50 px-6">
            <View className="bg-white rounded-3xl p-6 w-full max-w-md max-h-[80%]">
              <View className="flex-row items-center justify-between mb-4">
                <Text className="text-lg font-bold text-gray-900">
                  {timeModalOpen === "start"
                    ? "Select start time"
                    : "Select end time"}
                </Text>
                <TouchableOpacity onPress={() => setTimeModalOpen(null)}>
                  <X size={24} color="#6B7280" />
                </TouchableOpacity>
              </View>
              <FlatList
                data={filterTimeOptions({
                  timeOptions: TIME_OPTIONS,
                  timeModalOpen,
                  startTime,
                  endTime,
                })}
                keyExtractor={(t) => t.value}
                renderItem={({ item }) => {
                  const currentValue =
                    timeModalOpen === "start" ? startTime : endTime;
                  const selected = item.value === currentValue;
                  return (
                    <Pressable
                      style={
                        selected ? { backgroundColor: "#F3F4F6" } : undefined
                      }
                      className={`px-5 py-4 border-b border-gray-100 ${
                        selected ? "" : "bg-white"
                      }`}
                      onPress={() => {
                        if (timeModalOpen === "start") {
                          setStartTime(item.value);
                        } else {
                          setEndTime(item.value);
                        }
                        setTimeModalOpen(null);
                      }}
                    >
                      <Text
                        className={`text-base ${
                          selected
                            ? "font-semibold text-gray-900"
                            : "text-gray-900"
                        }`}
                      >
                        {item.label}
                      </Text>
                    </Pressable>
                  );
                }}
              />
            </View>
          </View>
        </Modal>
      </>
    );
  }
}

// Desktop Therapist Card Component
function DesktopTherapistCard({
  item,
  buildImageUrl,
  onPress,
  rank,
}: {
  item: Recommendation;
  buildImageUrl: (path?: string | null) => string | null;
  onPress: () => void;
  rank?: number;
}) {
  const imgSrc = buildImageUrl(item.profilePictureUrl ?? undefined);
  const matchPercentage = getMatchPercentage(item.matchScore);

  const genderLabel =
    typeof item.gender === "string" && item.gender.trim().length > 0
      ? item.gender.trim()
      : "Not specified";

  const serviceAreasText =
    item.serviceAreas && item.serviceAreas.length > 0
      ? item.serviceAreas[0]
      : "Not specified";

  // Determine match quality for styling
  const isHighMatch = matchPercentage >= 70;
  const isMediumMatch = matchPercentage >= 50 && matchPercentage < 70;

  return (
    <View className="bg-white rounded-2xl mb-4 border border-gray-200 shadow-sm overflow-hidden">
      {/* Card Header with Match Badge */}
      <View className="flex-row">
        {/* Left Section: Avatar and Info */}
        <View className="flex-1 p-6">
          <View className="flex-row">
            {/* Avatar */}
            <View className="mr-5">
              {imgSrc ? (
                <Image
                  source={{ uri: imgSrc }}
                  className="w-20 h-20 rounded-2xl bg-gray-200"
                />
              ) : (
                <View className="w-20 h-20 rounded-2xl items-center justify-center bg-gray-200">
                  <Text className="font-bold text-gray-600 text-2xl">
                    {getInitials(item.therapistName)}
                  </Text>
                </View>
              )}
            </View>

            {/* Info */}
            <View className="flex-1">
              <View className="flex-row items-center mb-2">
                <Text className="text-xl font-bold text-gray-900 mr-3">
                  {item.therapistName?.trim() || "Unnamed Therapist"}
                </Text>
                <View
                  className={`px-3 py-1.5 rounded-full flex-row items-center ${
                    isHighMatch
                      ? "bg-emerald-100"
                      : isMediumMatch
                        ? "bg-amber-100"
                        : "bg-gray-100"
                  }`}
                >
                  <Text className="mr-1">✦</Text>
                  <Text
                    className={`text-sm font-bold ${
                      isHighMatch
                        ? "text-emerald-700"
                        : isMediumMatch
                          ? "text-amber-700"
                          : "text-gray-700"
                    }`}
                  >
                    {matchPercentage}% Match
                  </Text>
                </View>
              </View>

              <View className="flex-row items-center flex-wrap gap-x-4 gap-y-1 mb-3">
                <View className="flex-row items-center">
                  <User color="#6B7280" size={14} style={{ marginRight: 6 }} />
                  <Text className="text-sm text-gray-600">{genderLabel}</Text>
                </View>
              </View>

              {/* Specializations */}
              <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                Specializations
              </Text>
              <View className="flex-row flex-wrap gap-2 mb-3">
                {item.specializations?.map((spec, idx) => (
                  <View
                    key={idx}
                    className="px-3 py-1.5 rounded-lg border border-gray-200 bg-gray-100"
                  >
                    <Text className="text-sm font-medium text-gray-700">
                      {spec}
                    </Text>
                  </View>
                ))}
              </View>

              {/* Service Area */}
              <View className="flex-row items-center">
                <MapPin color="#6B7280" size={14} style={{ marginRight: 6 }} />
                <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wide mr-2">
                  Service Area
                </Text>
                <Text className="text-sm text-gray-600">
                  {serviceAreasText}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* Right Section: Requirements & Analysis */}
        <View className="flex-row border-l border-gray-100">
          {/* Requirements Met */}
          <View className="p-6 w-52 border-r border-gray-100 bg-gray-50/50">
            <Text className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-4">
              Requirements Met
            </Text>
            {item.breakdown && (
              <View className="space-y-3">
                {Object.entries(item.breakdown)
                  .filter(([key]) =>
                    ["specialization", "desiredService"].includes(key),
                  )
                  .map(([key, score]) => {
                    const isMatch = score >= 1;
                    const label =
                      key === "specialization"
                        ? "Specialization Match"
                        : "Service Availability";
                    return (
                      <View key={key} className="flex-row items-center mb-3">
                        <View
                          className={`w-6 h-6 rounded-full items-center justify-center mr-3 ${
                            isMatch ? "bg-emerald-500" : "bg-red-400"
                          }`}
                        >
                          {isMatch ? (
                            <Check size={14} color="white" />
                          ) : (
                            <X size={14} color="white" />
                          )}
                        </View>
                        <Text
                          className={`text-sm ${
                            isMatch
                              ? "text-gray-700"
                              : "text-gray-400 line-through"
                          }`}
                        >
                          {label}
                        </Text>
                      </View>
                    );
                  })}
              </View>
            )}
          </View>

          {/* Match Analysis */}
          <View className="p-6 w-56">
            <Text className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-4">
              Match Analysis
            </Text>
            {item.breakdown && (
              <View>
                {Object.entries(item.breakdown)
                  .filter(([key]) =>
                    [
                      "availability",
                      "rating",
                      "budget",
                      "specialization",
                      "desiredService",
                    ].includes(key),
                  )
                  .map(([key, score]) => {
                    const percentage = Math.round(score * 100);
                    const label =
                      key === "availability"
                        ? "Availability"
                        : key === "rating"
                          ? "Rating"
                          : key === "budget"
                            ? "Budget Friendly"
                            : key === "specialization"
                              ? "Specialization"
                              : "Service Match";
                    const barColor =
                      percentage >= 75
                        ? "#10B981"
                        : percentage >= 50
                          ? "#F59E0B"
                          : percentage >= 25
                            ? "#F97316"
                            : "#EF4444";
                    return (
                      <View key={key} className="mb-3">
                        <View className="flex-row justify-between mb-1.5">
                          <Text className="text-sm text-gray-600">{label}</Text>
                          <Text
                            className="text-sm font-bold"
                            style={{ color: barColor }}
                          >
                            {percentage}%
                          </Text>
                        </View>
                        <View className="w-full bg-gray-100 rounded-full h-2">
                          <View
                            style={{
                              width: `${percentage}%`,
                              backgroundColor: barColor,
                            }}
                            className="h-2 rounded-full"
                          />
                        </View>
                      </View>
                    );
                  })}
              </View>
            )}
          </View>
        </View>
      </View>

      {/* View Profile Button */}
      <View className="px-6 py-4 border-t border-gray-100 bg-gray-50/30 flex-row justify-end">
        <TouchableOpacity
          className="px-6 py-3 rounded-xl flex-row items-center transition-colors"
          style={{ backgroundColor: "#089769" }}
          onPress={onPress}
          activeOpacity={0.85}
        >
          <Text className="text-white font-bold mr-2">View Profile</Text>
          <ChevronRight size={18} color="white" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

function getInitials(name?: string) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

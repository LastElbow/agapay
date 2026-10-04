import apiClient from "@/api/client";
import { useAuth } from "@/src/providers/AuthProvider";
import { useLocalSearchParams, useRouter } from "expo-router";
import { DraftStore } from "@/src/stores/therapistDraftStore";
import WebHeader from "@/src/components/WebHeader";
import Constants from "expo-constants";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Platform,
  Image,
  RefreshControl,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useTherapistAvatar } from "@/src/hooks/useTherapistAvatar";
import { useFocusEffect } from "@react-navigation/native";
import * as ImagePicker from "expo-image-picker";
import { useQueryClient } from "@tanstack/react-query";

type Spec = { id: number; name: string };
type ConditionGroup = {
  key: string;
  label: string;
  items: { id: number; name: string }[];
};
type ServiceArea = { id: number; name: string };

type EditableProfile = {
  therapistId: number;
  userId: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  gender?: string | null;
  yearsOfExperience: number;
  feePerSession?: number | null;
  otherConditions?: string | null;
  specializationIds: number[];
  conditionIds: number[];
  serviceAreaIds: number[];
  // Location fields
  address?: string | null;
  barangay?: string | null;
  latitude?: number | null;
  longitude?: number | null;
};

const GENDER_OPTIONS = [
  { label: "Male", value: "Male" },
  { label: "Female", value: "Female" },
];

function formatDob(iso?: string | null) {
  if (!iso) return "";
  const str = String(iso);
  if (str.startsWith("0001-") || str.startsWith("1900-01-01")) return "";
  const m = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[2]}-${m[3]}-${m[1]}`; // MM-DD-YYYY
  try {
    const d = new Date(iso);
    if (!isNaN(d.valueOf()) && d.getFullYear() > 1900) {
      return d.toLocaleDateString("en-US");
    }
  } catch {}
  return "";
}

function normalizeGenderValue(input?: string | null): string | null {
  if (input === null || input === undefined) return null;
  const trimmed = String(input).trim();
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();
  if (lower === "m" || lower === "male" || lower === "1") return "Male";
  if (lower === "f" || lower === "female" || lower === "0") return "Female";
  return trimmed;
}

function showMessage(title: string, message: string) {
  if (Platform.OS === "web" && typeof window !== "undefined") {
    window.alert(`${title}${title ? "\n" : ""}${message}`);
  } else {
    Alert.alert(title, message);
  }
}

export default function TherapistEditProfile2() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user: authUser, accessToken, updateUser } = useAuth();
  const {
    avatarSource,
    hasRealAvatar,
    refetch: refetchAvatar,
  } = useTherapistAvatar();
  const { width } = useWindowDimensions();
  const params = useLocalSearchParams<{
    updatedSpecializations?: string;
    updatedConditions?: string;
    updatedServiceAreas?: string;
  }>();

  // Responsive: mobile = native or web < 768px
  const isMobile = Platform.OS !== "web" || width < 768;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [uploadingPicture, setUploadingPicture] = useState(false);
  const [showDobPicker, setShowDobPicker] = useState(false);
  const [showUnsavedModal, setShowUnsavedModal] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);

  // Selection modals for desktop
  const [showSpecModal, setShowSpecModal] = useState(false);
  const [showConditionsModal, setShowConditionsModal] = useState(false);
  const [showAreasModal, setShowAreasModal] = useState(false);

  // Temp selection for modals
  const [tempSpecIds, setTempSpecIds] = useState<number[]>([]);
  const [tempConditionIds, setTempConditionIds] = useState<number[]>([]);
  const [tempAreaIds, setTempAreaIds] = useState<number[]>([]);

  const [profile, setProfile] = useState<EditableProfile | null>(null);
  const [draft, setDraft] = useState<EditableProfile | null>(null);

  const [specializations, setSpecializations] = useState<Spec[]>([]);
  const [conditions, setConditions] = useState<ConditionGroup[]>([]);
  const [serviceAreas, setServiceAreas] = useState<ServiceArea[]>([]);

  // Expanded sections for editing (kept for backward compatibility but not used in new UI)
  const [expandedSections, setExpandedSections] = useState<
    Record<string, boolean>
  >({});
  const [showAllConditions, setShowAllConditions] = useState(false);
  const [showAllServiceAreas, setShowAllServiceAreas] = useState(false);

  const headers = useMemo(
    () => ({
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    }),
    [accessToken],
  );

  // Display name from auth
  const fullName = useMemo(() => {
    const first = (authUser?.firstName ?? authUser?.givenName ?? "").toString();
    const last = (authUser?.lastName ?? authUser?.familyName ?? "").toString();
    return `${first}${last ? ` ${last}` : ""}`.trim() || "Therapist";
  }, [authUser]);

  // Get initials for fallback avatar
  const initials = useMemo(() => {
    const first = (
      draft?.firstName ??
      authUser?.firstName ??
      authUser?.givenName ??
      ""
    )
      .toString()
      .trim();
    const last = (
      draft?.lastName ??
      authUser?.lastName ??
      authUser?.familyName ??
      ""
    )
      .toString()
      .trim();
    const firstInitial = first.charAt(0).toUpperCase();
    const lastInitial = last.charAt(0).toUpperCase();
    return `${firstInitial}${lastInitial}` || "?";
  }, [draft?.firstName, draft?.lastName, authUser]);

  // Check for unsaved changes
  const hasUnsavedChanges = useMemo(() => {
    if (!profile || !draft) return false;
    if (draft.firstName !== profile.firstName) return true;
    if (draft.lastName !== profile.lastName) return true;
    if (draft.dateOfBirth !== profile.dateOfBirth) return true;
    if (
      normalizeGenderValue(draft.gender) !==
      normalizeGenderValue(profile.gender)
    )
      return true;
    if (draft.yearsOfExperience !== profile.yearsOfExperience) return true;
    if (draft.feePerSession !== profile.feePerSession) return true;
    if (
      JSON.stringify([...(draft.specializationIds || [])].sort()) !==
      JSON.stringify([...(profile.specializationIds || [])].sort())
    )
      return true;
    if (
      JSON.stringify([...(draft.conditionIds || [])].sort()) !==
      JSON.stringify([...(profile.conditionIds || [])].sort())
    )
      return true;
    if (
      JSON.stringify([...(draft.serviceAreaIds || [])].sort()) !==
      JSON.stringify([...(profile.serviceAreaIds || [])].sort())
    )
      return true;
    return false;
  }, [profile, draft]);

  const handleBackPress = useCallback(() => {
    if (hasUnsavedChanges) {
      setShowUnsavedModal(true);
    } else {
      router.back();
    }
  }, [hasUnsavedChanges, router]);

  const seedFromAuth = useCallback(
    (): EditableProfile => ({
      therapistId: 0,
      userId: String((authUser as any)?.userId ?? (authUser as any)?.id ?? ""),
      firstName: String(
        authUser?.firstName ??
          (authUser as any)?.givenName ??
          (authUser as any)?.name ??
          "",
      ),
      lastName: String(
        authUser?.lastName ?? (authUser as any)?.familyName ?? "",
      ),
      dateOfBirth: "",
      gender: (authUser as any)?.gender ?? null,
      yearsOfExperience: 0,
      feePerSession: null,
      otherConditions: null,
      specializationIds: [],
      conditionIds: [],
      serviceAreaIds: [],
    }),
    [authUser],
  );

  const normalizeProfile = useCallback(
    (raw: any): EditableProfile => {
      const specIds = Array.isArray(raw?.specializationIds)
        ? raw.specializationIds
        : Array.isArray(raw?.SpecializationIds)
          ? raw.SpecializationIds
          : [];

      const condIds = Array.isArray(raw?.conditionIds)
        ? raw.conditionIds
        : Array.isArray(raw?.ConditionIds)
          ? raw.ConditionIds
          : [];

      const serviceIds = Array.isArray(raw?.serviceAreaIds)
        ? raw.serviceAreaIds
        : Array.isArray(raw?.ServiceAreaIds)
          ? raw.ServiceAreaIds
          : [];

      return {
        therapistId: Number(
          raw?.therapistId ?? raw?.id ?? raw?.TherapistId ?? 0,
        ),
        userId: String(raw?.userId ?? raw?.UserId ?? ""),
        firstName: String(
          raw?.firstName ??
            raw?.FirstName ??
            authUser?.firstName ??
            (authUser as any)?.givenName ??
            (authUser as any)?.name ??
            "",
        ),
        lastName: String(
          raw?.lastName ??
            raw?.LastName ??
            authUser?.lastName ??
            (authUser as any)?.familyName ??
            "",
        ),
        dateOfBirth: String(
          raw?.dateOfBirth ??
            raw?.DateOfBirth ??
            raw?.birthDate ??
            raw?.BirthDate ??
            raw?.birthdate ??
            raw?.dob ??
            raw?.DOB ??
            "",
        ),
        gender: raw?.gender ?? raw?.Gender ?? (authUser as any)?.gender ?? null,
        yearsOfExperience: Number(
          raw?.yearsOfExperience ?? raw?.YearsOfExperience ?? 0,
        ),
        feePerSession: raw?.feePerSession ?? raw?.FeePerSession ?? null,
        otherConditions: raw?.otherConditions ?? raw?.OtherConditions ?? null,
        specializationIds: specIds,
        conditionIds: condIds,
        serviceAreaIds: serviceIds,
        // Location fields
        address: raw?.address ?? raw?.Address ?? null,
        barangay: raw?.barangay ?? raw?.Barangay ?? null,
        latitude: raw?.latitude ?? raw?.Latitude ?? null,
        longitude: raw?.longitude ?? raw?.Longitude ?? null,
      };
    },
    [authUser],
  );

  const loadData = useCallback(
    async (options?: { silent?: boolean }) => {
      const silent = options?.silent ?? false;
      if (!silent) setLoading(true);
      setError(null);

      try {
        const [profRes, specRes, areaRes] = await Promise.all([
          apiClient.get("/api/Therapist/me/details", { headers }),
          apiClient.get("/api/Onboarding/specializations", { headers }),
          apiClient.get("/api/Onboarding/service-areas", { headers }),
        ]);

        const raw = profRes?.data ?? null;
        const hasProfile = !!(
          raw &&
          (raw.therapistId != null || raw.id != null)
        );
        const normalized = hasProfile ? normalizeProfile(raw) : seedFromAuth();

        setProfile(normalized);
        setDraft({ ...normalized });

        // Specializations
        const specs =
          Array.isArray(specRes.data) && specRes.data.length > 0
            ? specRes.data.map((s: any) => ({ id: s.id, name: s.name }))
            : [
                { id: 1, name: "Orthopedic/Musculoskeletal" },
                { id: 2, name: "Pediatric" },
                { id: 3, name: "Geriatric" },
                { id: 4, name: "Neurological" },
                { id: 5, name: "Sports" },
                { id: 6, name: "Cardiopulmonary" },
                { id: 7, name: "Vestibular" },
              ];
        setSpecializations(specs);

        // Service Areas
        const areas = Array.isArray(areaRes.data) ? areaRes.data : [];
        areas.sort((a: ServiceArea, b: ServiceArea) => {
          const nameA = String(a?.name ?? "").trim();
          const nameB = String(b?.name ?? "").trim();
          return nameA.localeCompare(nameB, undefined, { sensitivity: "base" });
        });
        setServiceAreas(areas);

        // Conditions grouped by specialization
        const specIds = normalized.specializationIds || [];
        let condUrl = "/api/Onboarding/conditions-grouped";
        if (specIds.length > 0) {
          const queryParams = specIds
            .map((id: number) => `specializationIds=${id}`)
            .join("&");
          condUrl = `${condUrl}?${queryParams}`;
        }
        const condRes = await apiClient.get(condUrl, { headers });
        const conds = Array.isArray(condRes.data) ? condRes.data : [];
        setConditions(conds);
      } catch (e: any) {
        console.warn("Failed to load therapist edit profile", e);
        setError(
          e?.response?.data?.message || e?.message || "Failed to load profile",
        );
        // Seed from auth on failure
        const normalized = seedFromAuth();
        setProfile(normalized);
        setDraft({ ...normalized });
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [headers, normalizeProfile, seedFromAuth],
  );

  // Avoid re-triggering the initial load effect when the `loadData` callback identity
  // changes due to authUser updates (e.g., after save -> updateUser).
  const loadDataRef = useRef(loadData);
  useEffect(() => {
    loadDataRef.current = loadData;
  }, [loadData]);

  useEffect(() => {
    if (!accessToken) return;
    loadDataRef.current();
  }, [accessToken]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData({ silent: true });
    setRefreshing(false);
  }, [loadData]);

  // Profile picture picker
  const pickProfileImage = useCallback(async () => {
    if (uploadingPicture) return;

    try {
      const permissionResult =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permissionResult.granted) {
        showMessage(
          "Permission Required",
          "Please allow access to your photo library.",
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (result.canceled || !result.assets?.[0]?.uri) return;

      setUploadingPicture(true);
      try {
        const uri = result.assets[0].uri;
        const formData = new FormData();

        const parts = uri.split("/");
        const filename = parts[parts.length - 1] || "photo.jpg";
        const ext = (filename.split(".").pop() || "").toLowerCase();
        const mimeType = ext === "png" ? "image/png" : "image/jpeg";

        formData.append("profilePicture", {
          uri,
          name: filename,
          type: mimeType,
        } as any);

        await apiClient.put("/api/Therapist/me/profile-picture", formData, {
          headers: {
            ...headers,
            "Content-Type": "multipart/form-data",
          },
        });

        // Refetch avatar
        if (refetchAvatar) refetchAvatar();
        showMessage("Success", "Profile picture updated successfully.");
      } catch (err: any) {
        console.error("Failed to upload profile picture", err);
        showMessage(
          "Error",
          "Failed to upload profile picture. Please try again.",
        );
      } finally {
        setUploadingPicture(false);
      }
    } catch (err) {
      console.error("Image picker error", err);
    }
  }, [uploadingPicture, headers, refetchAvatar]);

  // Gender change handler
  const handleGenderChange = useCallback((value: string) => {
    setDraft((d) => ({ ...(d ?? ({} as any)), gender: value }));
  }, []);

  // Toggle specialization
  const toggleSpec = useCallback((id: number) => {
    setDraft((d) => {
      if (!d) return d;
      const next = new Set(d.specializationIds);
      next.has(id) ? next.delete(id) : next.add(id);
      return { ...d, specializationIds: Array.from(next) };
    });
  }, []);

  // Toggle condition
  const toggleCondition = useCallback((id: number) => {
    setDraft((d) => {
      if (!d) return d;
      const next = new Set(d.conditionIds);
      next.has(id) ? next.delete(id) : next.add(id);
      return { ...d, conditionIds: Array.from(next) };
    });
  }, []);

  // Toggle service area
  const toggleServiceArea = useCallback((id: number) => {
    setDraft((d) => {
      if (!d) return d;
      const next = new Set(d.serviceAreaIds);
      next.has(id) ? next.delete(id) : next.add(id);
      return { ...d, serviceAreaIds: Array.from(next) };
    });
  }, []);

  // Toggle section expansion
  const toggleSection = useCallback((section: string) => {
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }));
  }, []);

  // Handle updates from navigation (via DraftStore) and load data on focus
  useFocusEffect(
    useCallback(() => {
      const updates = DraftStore.getAndReset();
      let appliedUpdates = false;

      if (updates.updatedSpecializations) {
        setDraft((d) =>
          d ? { ...d, specializationIds: updates.updatedSpecializations! } : d,
        );
        appliedUpdates = true;
      }
      if (updates.updatedConditions) {
        setDraft((d) =>
          d ? { ...d, conditionIds: updates.updatedConditions! } : d,
        );
        appliedUpdates = true;
      }
      if (updates.updatedServiceAreas) {
        setDraft((d) =>
          d ? { ...d, serviceAreaIds: updates.updatedServiceAreas! } : d,
        );
        appliedUpdates = true;
      }

      // Only load data if we didn't just apply updates from navigation
      if (!appliedUpdates) {
        loadData({ silent: true });
      }

      return () => {};
    }, [loadData]),
  );

  // Handle params-based updates (legacy/fallback)
  useEffect(() => {
    if (params.updatedSpecializations) {
      try {
        const parsed = JSON.parse(params.updatedSpecializations);
        if (Array.isArray(parsed)) {
          setDraft((d) => (d ? { ...d, specializationIds: parsed } : d));
        }
      } catch (e) {
        console.warn("Failed to parse updatedSpecializations", e);
      }
    }
    if (params.updatedConditions) {
      try {
        const parsed = JSON.parse(params.updatedConditions);
        if (Array.isArray(parsed)) {
          setDraft((d) => (d ? { ...d, conditionIds: parsed } : d));
        }
      } catch (e) {
        console.warn("Failed to parse updatedConditions", e);
      }
    }
    if (params.updatedServiceAreas) {
      try {
        const parsed = JSON.parse(params.updatedServiceAreas);
        if (Array.isArray(parsed)) {
          setDraft((d) => (d ? { ...d, serviceAreaIds: parsed } : d));
        }
      } catch (e) {
        console.warn("Failed to parse updatedServiceAreas", e);
      }
    }
  }, [
    params.updatedSpecializations,
    params.updatedConditions,
    params.updatedServiceAreas,
  ]);

  // Group selected conditions for display
  const groupedSelectedConditions = useMemo(() => {
    if (!conditions || !draft) return [];
    return conditions
      .map((g) => ({
        ...g,
        items: g.items.filter((i) => draft.conditionIds.includes(i.id)),
      }))
      .filter((g) => g.items.length > 0);
  }, [conditions, draft?.conditionIds]);

  const { visibleGroups, remainingCount } = useMemo(() => {
    const totalCount = draft?.conditionIds.length ?? 0;
    if (showAllConditions) {
      return { visibleGroups: groupedSelectedConditions, remainingCount: 0 };
    }

    const LIMIT = 5;
    let count = 0;
    const visible: typeof groupedSelectedConditions = [];

    for (const g of groupedSelectedConditions) {
      if (count >= LIMIT) break;

      const available = LIMIT - count;
      const itemsToShow = g.items.slice(0, available);

      if (itemsToShow.length > 0) {
        visible.push({ ...g, items: itemsToShow });
        count += itemsToShow.length;
      }
    }

    return { visibleGroups: visible, remainingCount: totalCount - count };
  }, [groupedSelectedConditions, showAllConditions, draft?.conditionIds]);

  const { visibleServiceAreas, remainingServiceAreasCount } = useMemo(() => {
    const selectedIds = draft?.serviceAreaIds ?? [];
    const sortedIds = [...selectedIds].sort((a, b) => {
      const nameA = serviceAreas.find((x) => x.id === a)?.name ?? "";
      const nameB = serviceAreas.find((x) => x.id === b)?.name ?? "";
      return nameA.localeCompare(nameB, undefined, { sensitivity: "base" });
    });
    const totalCount = sortedIds.length;
    if (showAllServiceAreas) {
      return {
        visibleServiceAreas: sortedIds,
        remainingServiceAreasCount: 0,
      };
    }
    const LIMIT = 5;
    return {
      visibleServiceAreas: sortedIds.slice(0, LIMIT),
      remainingServiceAreasCount: Math.max(0, totalCount - LIMIT),
    };
  }, [draft?.serviceAreaIds, serviceAreas, showAllServiceAreas]);

  // Handlers for opening selection screens (mobile) or modals (desktop)
  const handleEditSpecializations = useCallback(() => {
    if (isMobile) {
      router.push({
        pathname: "/(therapist)/select-specializations",
        params: { selected: JSON.stringify(draft?.specializationIds ?? []) },
      });
    } else {
      setTempSpecIds(draft?.specializationIds ?? []);
      setShowSpecModal(true);
    }
  }, [isMobile, router, draft?.specializationIds]);

  const handleEditConditions = useCallback(() => {
    if (isMobile) {
      router.push({
        pathname: "/(therapist)/select-conditions",
        params: {
          selected: JSON.stringify(draft?.conditionIds ?? []),
          specializationIds: JSON.stringify(draft?.specializationIds ?? []),
        },
      });
    } else {
      setTempConditionIds(draft?.conditionIds ?? []);
      setShowConditionsModal(true);
    }
  }, [isMobile, router, draft?.conditionIds, draft?.specializationIds]);

  const handleEditServiceAreas = useCallback(() => {
    if (isMobile) {
      router.push({
        pathname: "/(therapist)/select-service-areas",
        params: { selected: JSON.stringify(draft?.serviceAreaIds ?? []) },
      });
    } else {
      setTempAreaIds(draft?.serviceAreaIds ?? []);
      setShowAreasModal(true);
    }
  }, [isMobile, router, draft?.serviceAreaIds]);

  // Modal confirm handlers (desktop)
  const handleConfirmSpecModal = useCallback(() => {
    setDraft((d) => (d ? { ...d, specializationIds: tempSpecIds } : d));
    setShowSpecModal(false);
  }, [tempSpecIds]);

  const handleConfirmConditionsModal = useCallback(() => {
    setDraft((d) => (d ? { ...d, conditionIds: tempConditionIds } : d));
    setShowConditionsModal(false);
  }, [tempConditionIds]);

  const handleConfirmAreasModal = useCallback(() => {
    setDraft((d) => (d ? { ...d, serviceAreaIds: tempAreaIds } : d));
    setShowAreasModal(false);
  }, [tempAreaIds]);

  // Toggle temp selection in modals
  const toggleTempSpec = useCallback((id: number) => {
    setTempSpecIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }, []);

  const toggleTempCondition = useCallback((id: number) => {
    setTempConditionIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }, []);

  const toggleTempArea = useCallback((id: number) => {
    setTempAreaIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }, []);

  // Save handler
  const onSave = async (): Promise<boolean> => {
    if (!draft) return false;
    if (saving) return false;
    setSaving(true);
    setError(null);

    try {
      const payload = {
        firstName: draft.firstName?.trim() || undefined,
        lastName: draft.lastName?.trim() || undefined,
        dateOfBirth: draft.dateOfBirth || undefined,
        gender: draft.gender ?? undefined,
        yearsOfExperience: draft.yearsOfExperience,
        feePerSession: draft.feePerSession ?? undefined,
        specializationIds: draft.specializationIds,
        conditionIds: draft.conditionIds,
        serviceAreasIds: draft.serviceAreaIds,
      };

      await apiClient.put("/api/Therapist/me", payload, { headers });

      // Update profile state
      setProfile({ ...draft });
      setShowSuccessModal(true);

      // Keep auth/user + other screens in sync immediately (avoid having to leave/re-enter).
      try {
        await updateUser({
          ...(authUser as any),
          firstName: draft.firstName,
          FirstName: draft.firstName,
          lastName: draft.lastName,
          LastName: draft.lastName,
          gender: draft.gender ?? null,
          Gender: draft.gender ?? null,
          dateOfBirth: draft.dateOfBirth,
          DateOfBirth: draft.dateOfBirth,
        } as any);
      } catch {}

      try {
        queryClient.setQueryData(["therapistProfileDetails"], (prev: any) => ({
          ...(prev ?? {}),
          firstName: draft.firstName,
          lastName: draft.lastName,
          dateOfBirth: draft.dateOfBirth,
          gender: draft.gender,
        }));
      } catch {}
      void queryClient.invalidateQueries({ queryKey: ["therapistProfileDetails"] });
      void queryClient.invalidateQueries({ queryKey: ["therapistProfile"] });

      // Reload conditions if specializations changed
      if (
        profile &&
        JSON.stringify(draft.specializationIds.sort()) !==
          JSON.stringify(profile.specializationIds.sort())
      ) {
        const specIds = draft.specializationIds || [];
        let condUrl = "/api/Onboarding/conditions-grouped";
        if (specIds.length > 0) {
          const queryParams = specIds
            .map((id: number) => `specializationIds=${id}`)
            .join("&");
          condUrl = `${condUrl}?${queryParams}`;
        }
        const condRes = await apiClient.get(condUrl, { headers });
        const conds = Array.isArray(condRes.data) ? condRes.data : [];
        setConditions(conds);
      }

      return true;
    } catch (e: any) {
      console.warn("Failed to save therapist profile", e);
      const message =
        e?.response?.data?.message || e?.message || "Failed to save changes";
      setError(message);
      showMessage("Error", message);
      return false;
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#f0fdfa",
        }}
      >
        <ActivityIndicator size="large" color="#089769" />
      </SafeAreaView>
    );
  }

  if (!profile || !draft) {
    return (
      <SafeAreaView
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          padding: 20,
          backgroundColor: "#f0fdfa",
        }}
      >
        <Text style={{ color: "#DC2626" }}>
          {error ?? "Unable to load profile."}
        </Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#f0fdfa" }}>
      {/* Unsaved Changes Confirmation Modal */}
      <Modal
        visible={showUnsavedModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowUnsavedModal(false)}
      >
        <View
          style={{
            flex: 1,
            justifyContent: "center",
            alignItems: "center",
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            paddingHorizontal: 24,
          }}
        >
          <View
            style={{
              backgroundColor: "#FFFFFF",
              borderRadius: 24,
              padding: 24,
              width: "100%",
              maxWidth: 360,
            }}
          >
            <View style={{ alignItems: "center", marginBottom: 16 }}>
              <View
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 28,
                  backgroundColor: "#FEF3C7",
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: 12,
                }}
              >
                <Ionicons name="warning" size={28} color="#F59E0B" />
              </View>
              <Text
                style={{
                  fontSize: 18,
                  fontWeight: "700",
                  color: "#111827",
                  textAlign: "center",
                }}
              >
                Unsaved Changes
              </Text>
            </View>
            <Text
              style={{
                fontSize: 15,
                color: "#6B7280",
                textAlign: "center",
                marginBottom: 24,
              }}
            >
              You have unsaved changes. Are you sure you want to leave without
              saving?
            </Text>
            <View style={{ flexDirection: "row", gap: 12 }}>
              <TouchableOpacity
                onPress={() => {
                  setShowUnsavedModal(false);
                  router.back();
                }}
                style={{
                  flex: 1,
                  paddingVertical: 14,
                  borderRadius: 12,
                  backgroundColor: "#F3F4F6",
                  alignItems: "center",
                }}
                activeOpacity={0.8}
              >
                <Text
                  style={{ color: "#374151", fontWeight: "600", fontSize: 15 }}
                >
                  Discard
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setShowUnsavedModal(false)}
                style={{
                  flex: 1,
                  paddingVertical: 14,
                  borderRadius: 12,
                  backgroundColor: "#089769",
                  alignItems: "center",
                }}
                activeOpacity={0.8}
              >
                <Text
                  style={{ color: "#FFFFFF", fontWeight: "600", fontSize: 15 }}
                >
                  Keep Editing
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Save Success Modal */}
      <Modal
        visible={showSuccessModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowSuccessModal(false)}
      >
        <View
          style={{
            flex: 1,
            justifyContent: "center",
            alignItems: "center",
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            paddingHorizontal: 24,
          }}
        >
          <View
            style={{
              backgroundColor: "#FFFFFF",
              borderRadius: 24,
              padding: 24,
              width: "100%",
              maxWidth: 360,
            }}
          >
            <View style={{ alignItems: "center", marginBottom: 16 }}>
              <View
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 28,
                  backgroundColor: "#D1FAE5",
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: 12,
                }}
              >
                <Ionicons name="checkmark" size={28} color="#10B981" />
              </View>
              <Text
                style={{
                  fontSize: 18,
                  fontWeight: "700",
                  color: "#111827",
                  textAlign: "center",
                }}
              >
                Profile Updated
              </Text>
            </View>
            <Text
              style={{
                fontSize: 15,
                color: "#6B7280",
                textAlign: "center",
                marginBottom: 24,
              }}
            >
              Your profile changes have been saved successfully.
            </Text>
            <TouchableOpacity
              onPress={() => setShowSuccessModal(false)}
              style={{
                paddingVertical: 14,
                borderRadius: 12,
                backgroundColor: "#089769",
                alignItems: "center",
              }}
              activeOpacity={0.8}
            >
              <Text
                style={{ color: "#FFFFFF", fontWeight: "600", fontSize: 15 }}
              >
                OK
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Top bar */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            marginBottom: 12,
          }}
        >
          <TouchableOpacity
            onPress={handleBackPress}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            style={{ padding: 6, marginRight: 6 }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="chevron-back" size={24} color="#111827" />
          </TouchableOpacity>
          <Text style={{ fontSize: 20, fontWeight: "700" }}>Edit Profile</Text>
        </View>

        {/* Header with avatar */}
        <View style={{ alignItems: "center", marginBottom: 16 }}>
          <TouchableOpacity
            onPress={pickProfileImage}
            disabled={uploadingPicture}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Change profile picture"
            style={{
              width: 80,
              height: 80,
              borderRadius: 40,
              overflow: "hidden",
              marginBottom: 8,
              backgroundColor: "#E5E7EB",
              position: "relative",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {hasRealAvatar ? (
              <Image
                source={avatarSource as any}
                style={{ width: 80, height: 80 }}
                resizeMode="cover"
              />
            ) : (
              <Text
                style={{ color: "#374151", fontSize: 28, fontWeight: "700" }}
              >
                {initials}
              </Text>
            )}
            {/* Camera overlay */}
            <View
              style={{
                position: "absolute",
                bottom: 0,
                left: 0,
                right: 0,
                backgroundColor: "rgba(0, 0, 0, 0.5)",
                paddingVertical: 4,
                alignItems: "center",
              }}
            >
              {uploadingPicture ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Ionicons name="camera" size={16} color="#FFFFFF" />
              )}
            </View>
          </TouchableOpacity>
          <Text style={{ fontSize: 16, fontWeight: "600", color: "#111827" }}>
            {fullName}
          </Text>
          <Text style={{ fontSize: 13, color: "#6B7280" }}>
            Physical Therapist
          </Text>
        </View>

        {/* Account Details */}
        <View
          style={{
            backgroundColor: "#fff",
            borderRadius: 12,
            padding: 16,
            marginBottom: 16,
            borderWidth: 1,
            borderColor: "#E5E7EB",
          }}
        >
          <View style={{ marginBottom: 8 }}>
            <Text style={{ fontWeight: "700" }}>Account Details</Text>
          </View>

          {error && (
            <Text style={{ color: "#DC2626", marginBottom: 8 }}>{error}</Text>
          )}

          <Text style={{ color: "#6B7280", marginBottom: 4 }}>First Name</Text>
          <TextInput
            value={draft.firstName ?? ""}
            onChangeText={(t) =>
              setDraft((d) => ({ ...(d ?? ({} as any)), firstName: t }))
            }
            style={{
              borderWidth: 1,
              borderColor: "#E5E7EB",
              borderRadius: 8,
              padding: 10,
              marginBottom: 8,
            }}
            placeholder="First name"
          />

          <Text style={{ color: "#6B7280", marginBottom: 4 }}>Last Name</Text>
          <TextInput
            value={draft.lastName ?? ""}
            onChangeText={(t) =>
              setDraft((d) => ({ ...(d ?? ({} as any)), lastName: t }))
            }
            style={{
              borderWidth: 1,
              borderColor: "#E5E7EB",
              borderRadius: 8,
              padding: 10,
              marginBottom: 8,
            }}
            placeholder="Last name"
          />

          <Text style={{ color: "#6B7280", marginBottom: 4 }}>
            Date of Birth
          </Text>
          {Platform.OS === "web" ? (
            <input
              type="date"
              value={draft.dateOfBirth ?? ""}
              max={new Date().toISOString().slice(0, 10)}
              onChange={(e) => {
                const value = e.target.value;
                setDraft((d) => ({
                  ...(d ?? ({} as any)),
                  dateOfBirth: value || "",
                }));
              }}
              style={
                {
                  width: "100%",
                  backgroundColor: "#FFFFFF",
                  padding: 10,
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor: "#E5E7EB",
                  fontSize: 16,
                  color: "#111827",
                  marginBottom: 8,
                } as any
              }
            />
          ) : (
            <>
              <TouchableOpacity
                onPress={() => setShowDobPicker(true)}
                style={{
                  borderWidth: 1,
                  borderColor: "#E5E7EB",
                  borderRadius: 8,
                  padding: 10,
                  marginBottom: 8,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  backgroundColor: "#FFFFFF",
                }}
              >
                <Text
                  style={{
                    color: draft.dateOfBirth ? "#111827" : "#9CA3AF",
                    fontSize: 14,
                  }}
                >
                  {draft.dateOfBirth
                    ? formatDob(draft.dateOfBirth)
                    : "Select your date of birth"}
                </Text>
                <Ionicons name="calendar-outline" size={20} color="#6B7280" />
              </TouchableOpacity>
              {showDobPicker && (
                <DateTimePicker
                  value={
                    draft.dateOfBirth
                      ? new Date(draft.dateOfBirth)
                      : new Date(1990, 0, 1)
                  }
                  mode="date"
                  display={Platform.OS === "ios" ? "spinner" : "calendar"}
                  maximumDate={new Date()}
                  onChange={(_event, selected) => {
                    setShowDobPicker(Platform.OS === "ios");
                    if (selected) {
                      const yyyy = selected.getFullYear();
                      const mm = String(selected.getMonth() + 1).padStart(
                        2,
                        "0",
                      );
                      const dd = String(selected.getDate()).padStart(2, "0");
                      setDraft((d) => ({
                        ...(d ?? ({} as any)),
                        dateOfBirth: `${yyyy}-${mm}-${dd}`,
                      }));
                    }
                  }}
                />
              )}
            </>
          )}

          <Text style={{ color: "#6B7280", marginBottom: 4 }}>Gender</Text>
          <View style={{ flexDirection: "row", marginBottom: 8 }}>
            {GENDER_OPTIONS.map((option, index) => {
              const selected =
                normalizeGenderValue(draft.gender ?? null) === option.value;
              return (
                <TouchableOpacity
                  key={option.value}
                  onPress={() => handleGenderChange(option.value)}
                  style={{
                    paddingVertical: 8,
                    paddingHorizontal: 16,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: selected ? "#089769" : "#D1D5DB",
                    backgroundColor: selected ? "#089769" : "#FFFFFF",
                    marginRight: index < GENDER_OPTIONS.length - 1 ? 8 : 0,
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                >
                  <Text
                    style={{
                      color: selected ? "#FFFFFF" : "#111827",
                      fontWeight: selected ? "700" : "500",
                    }}
                  >
                    {option.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Professional Details */}
        <View
          style={{
            backgroundColor: "#fff",
            borderRadius: 12,
            padding: 16,
            marginBottom: 16,
            borderWidth: 1,
            borderColor: "#E5E7EB",
          }}
        >
          <View style={{ marginBottom: 8 }}>
            <Text style={{ fontWeight: "700" }}>Professional Details</Text>
          </View>

          <Text style={{ color: "#6B7280", marginBottom: 4 }}>
            Session Fee (₱)
          </Text>
          <TextInput
            keyboardType="numeric"
            value={
              draft.feePerSession != null ? String(draft.feePerSession) : ""
            }
            onChangeText={(t) =>
              setDraft((d) => ({
                ...(d ?? ({} as any)),
                feePerSession: t ? Number(t) : null,
              }))
            }
            style={{
              borderWidth: 1,
              borderColor: "#E5E7EB",
              borderRadius: 8,
              padding: 10,
            }}
            placeholder="e.g. 500"
          />
        </View>

        {/* Specializations */}
        <View
          style={{
            backgroundColor: "#fff",
            borderRadius: 12,
            padding: 16,
            marginBottom: 16,
            borderWidth: 1,
            borderColor: "#E5E7EB",
          }}
        >
          <TouchableOpacity
            onPress={handleEditSpecializations}
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
            }}
            activeOpacity={0.7}
          >
            <Text style={{ fontWeight: "700", fontSize: 15 }}>
              Specializations
            </Text>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              {draft.specializationIds.length > 0 && (
                <Text
                  style={{ color: "#089769", marginRight: 8, fontSize: 13 }}
                >
                  {draft.specializationIds.length} selected
                </Text>
              )}
              <Ionicons name="chevron-forward" size={20} color="#6B7280" />
            </View>
          </TouchableOpacity>

          {/* List Display */}
          {draft.specializationIds.length > 0 ? (
            <View
              style={{
                marginTop: 12,
                borderTopWidth: 1,
                borderTopColor: "#F3F4F6",
                paddingTop: 12,
              }}
            >
              {draft.specializationIds.map((id, index) => {
                const spec = specializations.find((s) => s.id === id);
                if (!spec) return null;
                return (
                  <View
                    key={id}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      paddingVertical: 8,
                      borderBottomWidth:
                        index < draft.specializationIds.length - 1 ? 1 : 0,
                      borderBottomColor: "#F3F4F6",
                    }}
                  >
                    <Ionicons
                      name="checkmark-circle"
                      size={18}
                      color="#089769"
                      style={{ marginRight: 10 }}
                    />
                    <Text style={{ fontSize: 14, color: "#374151" }}>
                      {spec.name}
                    </Text>
                  </View>
                );
              })}
            </View>
          ) : (
            <Text
              style={{
                marginTop: 12,
                color: "#9CA3AF",
                fontSize: 13,
                fontStyle: "italic",
              }}
            >
              No specializations selected. Tap to add.
            </Text>
          )}
        </View>

        {/* Conditions Treated */}
        <View
          style={{
            backgroundColor: "#fff",
            borderRadius: 12,
            padding: 16,
            marginBottom: 16,
            borderWidth: 1,
            borderColor: "#E5E7EB",
          }}
        >
          <TouchableOpacity
            onPress={handleEditConditions}
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
            }}
            activeOpacity={0.7}
          >
            <Text style={{ fontWeight: "700", fontSize: 15 }}>
              Conditions Treated
            </Text>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              {draft.conditionIds.length > 0 && (
                <Text
                  style={{ color: "#089769", marginRight: 8, fontSize: 13 }}
                >
                  {draft.conditionIds.length} selected
                </Text>
              )}
              <Ionicons name="chevron-forward" size={20} color="#6B7280" />
            </View>
          </TouchableOpacity>

          {/* List Display */}
          {draft.conditionIds.length > 0 ? (
            <View
              style={{
                marginTop: 12,
                borderTopWidth: 1,
                borderTopColor: "#F3F4F6",
                paddingTop: 12,
              }}
            >
              {visibleGroups.map((group) => (
                <View key={group.key} style={{ marginBottom: 12 }}>
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: "700",
                      color: "#6B7280",
                      textTransform: "uppercase",
                      marginBottom: 6,
                      letterSpacing: 0.5,
                    }}
                  >
                    {group.label}
                  </Text>
                  {group.items.map((item, idx) => (
                    <View
                      key={item.id}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        paddingVertical: 6,
                        borderBottomWidth: idx < group.items.length - 1 ? 1 : 0,
                        borderBottomColor: "#F3F4F6",
                      }}
                    >
                      <Ionicons
                        name="checkmark-circle"
                        size={16}
                        color="#089769"
                        style={{ marginRight: 8 }}
                      />
                      <Text style={{ fontSize: 14, color: "#374151" }}>
                        {item.name}
                      </Text>
                    </View>
                  ))}
                </View>
              ))}

              {(remainingCount > 0 || showAllConditions) && (
                <TouchableOpacity
                  onPress={() => setShowAllConditions(!showAllConditions)}
                  style={{
                    marginTop: 8,
                    flexDirection: "row",
                    alignItems: "center",
                  }}
                >
                  <Text
                    style={{
                      color: "#089769",
                      fontSize: 13,
                      fontWeight: "600",
                    }}
                  >
                    {showAllConditions
                      ? "Show Less"
                      : `+${remainingCount} more conditions`}
                  </Text>
                  <Ionicons
                    name={showAllConditions ? "chevron-up" : "chevron-down"}
                    size={16}
                    color="#089769"
                    style={{ marginLeft: 4 }}
                  />
                  {!showAllConditions && (
                    <Text
                      style={{ marginLeft: 4, color: "#9CA3AF", fontSize: 13 }}
                    >
                      (View More)
                    </Text>
                  )}
                </TouchableOpacity>
              )}
            </View>
          ) : (
            <Text
              style={{
                marginTop: 12,
                color: "#9CA3AF",
                fontSize: 13,
                fontStyle: "italic",
              }}
            >
              {draft.specializationIds.length > 0
                ? "No conditions selected. Tap to add."
                : "Select specializations first to add conditions."}
            </Text>
          )}
        </View>

        {/* Service Areas */}
        <View
          style={{
            backgroundColor: "#fff",
            borderRadius: 12,
            padding: 16,
            marginBottom: 16,
            borderWidth: 1,
            borderColor: "#E5E7EB",
          }}
        >
          <TouchableOpacity
            onPress={handleEditServiceAreas}
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
            }}
            activeOpacity={0.7}
          >
            <Text style={{ fontWeight: "700", fontSize: 15 }}>
              Service Areas
            </Text>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              {draft.serviceAreaIds.length > 0 && (
                <Text
                  style={{ color: "#089769", marginRight: 8, fontSize: 13 }}
                >
                  {draft.serviceAreaIds.length} selected
                </Text>
              )}
              <Ionicons name="chevron-forward" size={20} color="#6B7280" />
            </View>
          </TouchableOpacity>

          {/* List Display */}
          {draft.serviceAreaIds.length > 0 ? (
            <View
              style={{
                marginTop: 12,
                borderTopWidth: 1,
                borderTopColor: "#F3F4F6",
                paddingTop: 12,
              }}
            >
              {visibleServiceAreas.map((id, index) => {
                const area = serviceAreas.find((a) => a.id === id);
                if (!area) return null;
                return (
                  <View
                    key={id}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      paddingVertical: 8,
                      borderBottomWidth:
                        index < visibleServiceAreas.length - 1 ? 1 : 0,
                      borderBottomColor: "#F3F4F6",
                    }}
                  >
                    <Ionicons
                      name="checkmark-circle"
                      size={18}
                      color="#089769"
                      style={{ marginRight: 10 }}
                    />
                    <Text style={{ fontSize: 14, color: "#374151" }}>
                      {area.name}
                    </Text>
                  </View>
                );
              })}

              {(remainingServiceAreasCount > 0 || showAllServiceAreas) && (
                <TouchableOpacity
                  onPress={() => setShowAllServiceAreas(!showAllServiceAreas)}
                  style={{
                    marginTop: 8,
                    flexDirection: "row",
                    alignItems: "center",
                  }}
                >
                  <Text
                    style={{
                      color: "#089769",
                      fontSize: 13,
                      fontWeight: "600",
                    }}
                  >
                    {showAllServiceAreas
                      ? "Show Less"
                      : `+${remainingServiceAreasCount} more areas`}
                  </Text>
                  <Ionicons
                    name={showAllServiceAreas ? "chevron-up" : "chevron-down"}
                    size={16}
                    color="#089769"
                    style={{ marginLeft: 4 }}
                  />
                  {!showAllServiceAreas && (
                    <Text
                      style={{ marginLeft: 4, color: "#9CA3AF", fontSize: 13 }}
                    >
                      (View More)
                    </Text>
                  )}
                </TouchableOpacity>
              )}
            </View>
          ) : (
            <Text
              style={{
                marginTop: 12,
                color: "#9CA3AF",
                fontSize: 13,
                fontStyle: "italic",
              }}
            >
              No service areas selected. Tap to add.
            </Text>
          )}
        </View>
      </ScrollView>

      {/* Fixed Bottom Save Button */}
      <View
        style={{
          paddingHorizontal: 16,
          paddingVertical: 12,
          backgroundColor: "#FFFFFF",
          borderTopWidth: 1,
          borderTopColor: "#ccfbf1",
        }}
      >
        <TouchableOpacity
          onPress={() => onSave()}
          disabled={saving}
          style={{
            backgroundColor: saving ? "#9CA3AF" : "#089769",
            paddingVertical: 14,
            borderRadius: 12,
            alignItems: "center",
            justifyContent: "center",
          }}
          activeOpacity={0.8}
        >
          {saving ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={{ color: "#FFFFFF", fontWeight: "700", fontSize: 16 }}>
              Save Changes
            </Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Desktop Selection Modals */}
      {!isMobile && (
        <>
          {/* Specializations Modal */}
          <Modal
            visible={showSpecModal}
            transparent
            animationType="fade"
            onRequestClose={() => setShowSpecModal(false)}
          >
            <View
              style={{
                flex: 1,
                justifyContent: "center",
                alignItems: "center",
                backgroundColor: "rgba(0, 0, 0, 0.5)",
                padding: 24,
              }}
            >
              <View
                style={{
                  backgroundColor: "#FFFFFF",
                  borderRadius: 16,
                  width: "100%",
                  maxWidth: 480,
                  maxHeight: "80%",
                }}
              >
                {/* Modal Header */}
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    paddingHorizontal: 20,
                    paddingVertical: 16,
                    borderBottomWidth: 1,
                    borderBottomColor: "#E5E7EB",
                  }}
                >
                  <TouchableOpacity onPress={() => setShowSpecModal(false)}>
                    <Text style={{ fontSize: 15, color: "#6B7280" }}>
                      Cancel
                    </Text>
                  </TouchableOpacity>
                  <Text
                    style={{
                      fontSize: 17,
                      fontWeight: "600",
                      color: "#111827",
                    }}
                  >
                    Specializations
                  </Text>
                  <TouchableOpacity onPress={handleConfirmSpecModal}>
                    <Text
                      style={{
                        fontSize: 15,
                        fontWeight: "600",
                        color: "#089769",
                      }}
                    >
                      Done
                    </Text>
                  </TouchableOpacity>
                </View>
                {/* Selection Count */}
                <View
                  style={{
                    paddingHorizontal: 20,
                    paddingVertical: 12,
                    backgroundColor: "#F9FAFB",
                  }}
                >
                  <Text style={{ fontSize: 13, color: "#6B7280" }}>
                    {tempSpecIds.length === 0
                      ? "Select your specializations"
                      : `${tempSpecIds.length} selected`}
                  </Text>
                </View>
                {/* List */}
                <ScrollView style={{ maxHeight: 400 }}>
                  {specializations.map((spec, index) => {
                    const isSelected = tempSpecIds.includes(spec.id);
                    return (
                      <TouchableOpacity
                        key={spec.id}
                        onPress={() => toggleTempSpec(spec.id)}
                        activeOpacity={0.7}
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          justifyContent: "space-between",
                          paddingHorizontal: 20,
                          paddingVertical: 14,
                          borderBottomWidth:
                            index < specializations.length - 1 ? 1 : 0,
                          borderBottomColor: "#F3F4F6",
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 15,
                            color: isSelected ? "#089769" : "#374151",
                            fontWeight: isSelected ? "600" : "400",
                          }}
                        >
                          {spec.name}
                        </Text>
                        {isSelected && (
                          <Ionicons
                            name="checkmark-circle"
                            size={22}
                            color="#089769"
                          />
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            </View>
          </Modal>

          {/* Conditions Modal */}
          <Modal
            visible={showConditionsModal}
            transparent
            animationType="fade"
            onRequestClose={() => setShowConditionsModal(false)}
          >
            <View
              style={{
                flex: 1,
                justifyContent: "center",
                alignItems: "center",
                backgroundColor: "rgba(0, 0, 0, 0.5)",
                padding: 24,
              }}
            >
              <View
                style={{
                  backgroundColor: "#FFFFFF",
                  borderRadius: 16,
                  width: "100%",
                  maxWidth: 480,
                  maxHeight: "80%",
                }}
              >
                {/* Modal Header */}
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    paddingHorizontal: 20,
                    paddingVertical: 16,
                    borderBottomWidth: 1,
                    borderBottomColor: "#E5E7EB",
                  }}
                >
                  <TouchableOpacity
                    onPress={() => setShowConditionsModal(false)}
                  >
                    <Text style={{ fontSize: 15, color: "#6B7280" }}>
                      Cancel
                    </Text>
                  </TouchableOpacity>
                  <Text
                    style={{
                      fontSize: 17,
                      fontWeight: "600",
                      color: "#111827",
                    }}
                  >
                    Conditions Treated
                  </Text>
                  <TouchableOpacity onPress={handleConfirmConditionsModal}>
                    <Text
                      style={{
                        fontSize: 15,
                        fontWeight: "600",
                        color: "#089769",
                      }}
                    >
                      Done
                    </Text>
                  </TouchableOpacity>
                </View>
                {/* Selection Count */}
                <View
                  style={{
                    paddingHorizontal: 20,
                    paddingVertical: 12,
                    backgroundColor: "#F9FAFB",
                  }}
                >
                  <Text style={{ fontSize: 13, color: "#6B7280" }}>
                    {tempConditionIds.length === 0
                      ? "Select conditions you treat"
                      : `${tempConditionIds.length} selected`}
                  </Text>
                </View>
                {/* Grouped List */}
                <ScrollView style={{ maxHeight: 400 }}>
                  {conditions.length === 0 ? (
                    <View style={{ padding: 24, alignItems: "center" }}>
                      <Ionicons
                        name="information-circle-outline"
                        size={40}
                        color="#9CA3AF"
                      />
                      <Text
                        style={{
                          fontSize: 14,
                          color: "#6B7280",
                          textAlign: "center",
                          marginTop: 12,
                        }}
                      >
                        Select specializations first to see related conditions
                      </Text>
                    </View>
                  ) : (
                    conditions.map((group) => (
                      <View key={group.key}>
                        <View
                          style={{
                            paddingHorizontal: 20,
                            paddingVertical: 10,
                            backgroundColor: "#F3F4F6",
                          }}
                        >
                          <Text
                            style={{
                              fontSize: 13,
                              fontWeight: "600",
                              color: "#374151",
                            }}
                          >
                            {group.label}
                          </Text>
                        </View>
                        {(group.items ?? []).map((item, index) => {
                          const isSelected = tempConditionIds.includes(item.id);
                          return (
                            <TouchableOpacity
                              key={item.id}
                              onPress={() => toggleTempCondition(item.id)}
                              activeOpacity={0.7}
                              style={{
                                flexDirection: "row",
                                alignItems: "center",
                                justifyContent: "space-between",
                                paddingHorizontal: 20,
                                paddingLeft: 32,
                                paddingVertical: 12,
                                borderBottomWidth:
                                  index < (group.items?.length ?? 0) - 1
                                    ? 1
                                    : 0,
                                borderBottomColor: "#F3F4F6",
                              }}
                            >
                              <Text
                                style={{
                                  fontSize: 14,
                                  color: isSelected ? "#089769" : "#374151",
                                  fontWeight: isSelected ? "600" : "400",
                                }}
                              >
                                {item.name}
                              </Text>
                              {isSelected && (
                                <Ionicons
                                  name="checkmark-circle"
                                  size={20}
                                  color="#089769"
                                />
                              )}
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    ))
                  )}
                </ScrollView>
              </View>
            </View>
          </Modal>

          {/* Service Areas Modal */}
          <Modal
            visible={showAreasModal}
            transparent
            animationType="fade"
            onRequestClose={() => setShowAreasModal(false)}
          >
            <View
              style={{
                flex: 1,
                justifyContent: "center",
                alignItems: "center",
                backgroundColor: "rgba(0, 0, 0, 0.5)",
                padding: 24,
              }}
            >
              <View
                style={{
                  backgroundColor: "#FFFFFF",
                  borderRadius: 16,
                  width: "100%",
                  maxWidth: 480,
                  maxHeight: "80%",
                }}
              >
                {/* Modal Header */}
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    paddingHorizontal: 20,
                    paddingVertical: 16,
                    borderBottomWidth: 1,
                    borderBottomColor: "#E5E7EB",
                  }}
                >
                  <TouchableOpacity onPress={() => setShowAreasModal(false)}>
                    <Text style={{ fontSize: 15, color: "#6B7280" }}>
                      Cancel
                    </Text>
                  </TouchableOpacity>
                  <Text
                    style={{
                      fontSize: 17,
                      fontWeight: "600",
                      color: "#111827",
                    }}
                  >
                    Service Areas
                  </Text>
                  <TouchableOpacity onPress={handleConfirmAreasModal}>
                    <Text
                      style={{
                        fontSize: 15,
                        fontWeight: "600",
                        color: "#089769",
                      }}
                    >
                      Done
                    </Text>
                  </TouchableOpacity>
                </View>
                {/* Selection Count */}
                <View
                  style={{
                    paddingHorizontal: 20,
                    paddingVertical: 12,
                    backgroundColor: "#F9FAFB",
                  }}
                >
                  <Text style={{ fontSize: 13, color: "#6B7280" }}>
                    {tempAreaIds.length === 0
                      ? "Select the areas you serve"
                      : `${tempAreaIds.length} selected`}
                  </Text>
                </View>
                {/* List */}
                <ScrollView style={{ maxHeight: 400 }}>
                  {serviceAreas.map((area, index) => {
                    const isSelected = tempAreaIds.includes(area.id);
                    return (
                      <TouchableOpacity
                        key={area.id}
                        onPress={() => toggleTempArea(area.id)}
                        activeOpacity={0.7}
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          justifyContent: "space-between",
                          paddingHorizontal: 20,
                          paddingVertical: 14,
                          borderBottomWidth:
                            index < serviceAreas.length - 1 ? 1 : 0,
                          borderBottomColor: "#F3F4F6",
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 15,
                            color: isSelected ? "#089769" : "#374151",
                            fontWeight: isSelected ? "600" : "400",
                          }}
                        >
                          {area.name}
                        </Text>
                        {isSelected && (
                          <Ionicons
                            name="checkmark-circle"
                            size={22}
                            color="#089769"
                          />
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            </View>
          </Modal>
        </>
      )}
    </SafeAreaView>
  );
}

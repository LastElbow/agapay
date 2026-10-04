import apiClient from "@/api/client";
import { useAuth } from "@/src/providers/AuthProvider";
import { useRouter } from "expo-router";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { resolveAvatarSource } from "@/src/utils/avatar";
import {
  getItem as ssGet,
  setItem as ssSet,
} from "@/src/utils/safeSecureStore";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchPatientProfilePicture,
  patientProfilePictureQueryKey,
  uploadPatientProfilePicture,
} from "@/src/services/patientProfile";
import * as ImagePicker from "expo-image-picker";
import DateTimePicker from "@react-native-community/datetimepicker";

type PatientProfile = {
  id: number | string;
  firstName?: string;
  lastName?: string;
  dateOfBirth?: string | null; // ISO YYYY-MM-DD
  gender?: string | null; // optional if backend supports
  relationshipToUser?: string | null;
  // Onboarding fields
  occupation?: string | null;
  activityLevel?: string | null;
  currentComplaints?: string | null;
  address?: string | null;
  barangay?: string | null;
};

type PatientProfilePayload = Partial<Omit<PatientProfile, "id">>;

const PATIENT_PROFILE_CACHE_KEY = "patientProfile:lastKnown";

function formatDob(iso?: string | null) {
  if (!iso) return "";

  // Filter out default/invalid dates
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

function formatGender(g?: string | null) {
  const normalized = normalizeGenderValue(g ?? null);
  return normalized ?? "";
}

function normalizeRelationshipValue(input?: string | null): string | null {
  if (input === null || input === undefined) return null;
  const trimmed = String(input).trim();
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();
  if (lower === "self" || lower === "me" || lower === "myself") return "Self";
  if (lower === "parent" || lower === "guardian") return "Parent";
  if (lower === "child" || lower === "kid") return "Child";
  return trimmed;
}

function normalizeDateInput(input: string) {
  const raw = input.trim();
  if (!raw) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const mdY = raw.match(/^(\d{2})[-/](\d{2})[-/](\d{4})$/);
  if (mdY) {
    const [, mm, dd, yyyy] = mdY;
    return `${yyyy}-${mm}-${dd}`;
  }
  const parsed = new Date(raw);
  if (!isNaN(parsed.valueOf())) {
    return parsed.toISOString().slice(0, 10);
  }
  return "";
}

function mapPatientApiResponse(
  raw: any,
  fallbackId?: number | string | null,
): PatientProfile {
  const data = raw ?? {};
  const idValue = data.id ?? data.Id ?? fallbackId ?? 0;
  const rel =
    data.relationshipToUser ??
    data.RelationshipToUser ??
    (data.isSelf === true ? "Self" : null);

  const genderRaw =
    data.gender ??
    data.Gender ??
    data.patient?.gender ??
    data.patient?.Gender ??
    data.Patient?.gender ??
    data.Patient?.Gender ??
    (typeof data.sex === "string" ? data.sex : null) ??
    (typeof data.Sex === "string" ? data.Sex : null) ??
    (typeof data.isMale === "boolean"
      ? data.isMale
        ? "Male"
        : "Female"
      : null);

  return {
    id: idValue,
    firstName: String(data.firstName ?? data.FirstName ?? ""),
    lastName: String(data.lastName ?? data.LastName ?? ""),
    dateOfBirth:
      data.dateOfBirth ?? data.DateOfBirth ?? data.dob ?? data.DOB ?? null,
    gender: normalizeGenderValue(genderRaw ?? null),
    relationshipToUser: normalizeRelationshipValue(rel) ?? null,
    // Onboarding fields
    occupation: data.occupation ?? data.Occupation ?? null,
    activityLevel: data.activityLevel ?? data.ActivityLevel ?? null,
    currentComplaints: data.currentComplaints ?? data.CurrentComplaints ?? null,
  };
}

type MergeableKey = Exclude<keyof PatientProfile, "id">;

const MERGEABLE_KEYS: MergeableKey[] = [
  "firstName",
  "lastName",
  "dateOfBirth",
  "gender",
  "relationshipToUser",
  "occupation",
  "activityLevel",
  "currentComplaints",
];

const GENDER_OPTIONS = [
  { label: "Male", value: "Male" },
  { label: "Female", value: "Female" },
];

const ACTIVITY_LEVEL_OPTIONS = [
  { label: "Sedentary", value: "sedentary" },
  { label: "Lightly Active", value: "light" },
  { label: "Moderately Active", value: "moderate" },
  { label: "Very Active", value: "very" },
];

function hasMeaningfulProfileValue(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return false;
    if (trimmed.startsWith("0001-")) return false;
    return true;
  }
  if (typeof value === "number") {
    return !Number.isNaN(value) && value !== 0;
  }
  return true;
}

function mergeProfileData(
  preferred: PatientProfile,
  fallback?: PatientProfile | null,
): PatientProfile {
  if (!fallback) return { ...preferred };
  const merged: PatientProfile = { ...preferred };

  if (
    !hasMeaningfulProfileValue(merged.id) &&
    hasMeaningfulProfileValue(fallback.id)
  ) {
    merged.id = fallback.id;
  }

  for (const key of MERGEABLE_KEYS) {
    const preferredValue = merged[key];
    const fallbackValue = fallback[key];
    if (
      !hasMeaningfulProfileValue(preferredValue) &&
      hasMeaningfulProfileValue(fallbackValue)
    ) {
      if (key === "gender") {
        merged[key] = normalizeGenderValue(fallbackValue as any) as any;
      } else if (key === "relationshipToUser") {
        merged[key] = normalizeRelationshipValue(fallbackValue as any) as any;
      } else {
        merged[key] = fallbackValue as any;
      }
    }
  }

  return merged;
}

function normalizeProfileFieldValue(
  key: MergeableKey,
  value: any,
): string | null {
  if (value === null || value === undefined) return null;
  if (key === "dateOfBirth") {
    const normalized = normalizeDateInput(String(value));
    return normalized || null;
  }
  if (key === "gender") {
    return normalizeGenderValue(value)?.toLowerCase() ?? null;
  }
  if (key === "relationshipToUser") {
    return normalizeRelationshipValue(value)?.toLowerCase() ?? null;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (key === "firstName" || key === "lastName") {
      return trimmed.toLowerCase();
    }
    return trimmed;
  }
  return String(value);
}

function profileValuesEqual(
  key: MergeableKey,
  current: any,
  target: any,
): boolean {
  return (
    normalizeProfileFieldValue(key, current) ===
    normalizeProfileFieldValue(key, target)
  );
}

function showMessage(title: string, message: string) {
  if (Platform.OS === "web" && typeof window !== "undefined") {
    window.alert(`${title}${title ? "\n" : ""}${message}`);
  } else {
    Alert.alert(title, message);
  }
}

export default function PatientEditProfile() {
  const router = useRouter();

  function getInitials(name?: string) {
    if (!name) return "?";
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  const queryClient = useQueryClient();
  const {
    user: authUser,
    accessToken,
    isBootstrapping,
    updateUser,
  } = useAuth();

  // Fetch profile picture
  const { data: profilePictureData } = useQuery({
    queryKey: patientProfilePictureQueryKey,
    queryFn: fetchPatientProfilePicture,
    enabled: !!accessToken,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [uploadingPicture, setUploadingPicture] = useState(false);
  const [showDobPicker, setShowDobPicker] = useState(false);
  const [showUnsavedModal, setShowUnsavedModal] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);

  const [profile, setProfile] = useState<PatientProfile | null>(null);
  const [draft, setDraft] = useState<PatientProfile | null>(null);
  const pendingProfileRef = useRef<Partial<PatientProfile> | null>(null);
  const cachedProfileRef = useRef<PatientProfile | null>(null);

  const cacheProfile = useCallback(async (value: PatientProfile | null) => {
    cachedProfileRef.current = value;
    try {
      if (!value) {
        await ssSet(PATIENT_PROFILE_CACHE_KEY, null);
        return;
      }
      const payload = JSON.stringify(value);
      await ssSet(PATIENT_PROFILE_CACHE_KEY, payload, { scope: "local" });
    } catch (err) {
      console.warn("Failed to cache patient profile", err);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const raw = await ssGet(PATIENT_PROFILE_CACHE_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw) as PatientProfile | null;
        if (!parsed || typeof parsed !== "object") return;
        if (cancelled) return;
        cachedProfileRef.current = parsed;
        setProfile((prev) => mergeProfileData(parsed, prev));
      } catch (err) {
        console.warn("Failed to hydrate cached patient profile", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleGenderChange = useCallback((value: string) => {
    setDraft((d) => ({ ...(d ?? ({} as any)), gender: value }));
  }, []);

  const handleActivityLevelChange = useCallback((value: string) => {
    setDraft((d) => ({ ...(d ?? ({} as any)), activityLevel: value }));
  }, []);

  // Profile picture picker
  const pickProfileImage = useCallback(async () => {
    if (uploadingPicture) return;

    try {
      // Request permission
      const permissionResult =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permissionResult.granted) {
        showMessage(
          "Permission Required",
          "Please allow access to your photo library.",
        );
        return;
      }

      // Launch image picker
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (result.canceled || !result.assets?.[0]?.uri) return;

      setUploadingPicture(true);
      try {
        await uploadPatientProfilePicture(result.assets[0].uri);
        // Invalidate the profile picture query to refetch
        await queryClient.invalidateQueries({
          queryKey: patientProfilePictureQueryKey,
        });
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
  }, [uploadingPicture, queryClient]);

  // Avatar + display name (must be declared unconditionally before any early returns)
  const fallbackAvatar = require("@/assets/images/react-logo.png");
  const avatarSource = useMemo(() => {
    if (profilePictureData?.profilePictureUrl) {
      return { uri: profilePictureData.profilePictureUrl };
    }
    return resolveAvatarSource((authUser as any)?.avatar, fallbackAvatar);
  }, [authUser, fallbackAvatar, profilePictureData]);

  // Display the User account name (not the patient profile name)
  const fullName = useMemo(() => {
    const first = (authUser?.firstName ?? authUser?.givenName ?? "").toString();
    const last = (authUser?.lastName ?? authUser?.familyName ?? "").toString();
    return `${first}${last ? ` ${last}` : ""}`.trim() || "Patient";
  }, [authUser]);

  const shouldShowInitials =
    !profilePictureData?.profilePictureUrl && avatarSource === fallbackAvatar;

  // Check if there are unsaved changes
  const hasUnsavedChanges = useMemo(() => {
    if (!profile || !draft) return false;
    for (const key of MERGEABLE_KEYS) {
      const profileVal = normalizeProfileFieldValue(key, profile[key]);
      const draftVal = normalizeProfileFieldValue(key, draft[key]);
      if (profileVal !== draftVal) return true;
    }
    return false;
  }, [profile, draft]);

  // Handle back button press with unsaved changes check
  const handleBackPress = useCallback(() => {
    if (hasUnsavedChanges) {
      setShowUnsavedModal(true);
    } else {
      router.back();
    }
  }, [hasUnsavedChanges, router]);

  const fetchSelfProfile = useCallback(async (): Promise<any | null> => {
    try {
      const direct = await apiClient.get("/api/patient/me");
      if (direct?.data) {
        return direct.data;
      }
    } catch (err: any) {
      const status = err?.response?.status;
      if (status && status !== 404 && status !== 403) {
        console.warn("Failed to fetch patient profile via /me endpoint", err);
      }
    }
    return null;
  }, []);

  const load = useCallback(
    async (options?: { silent?: boolean }) => {
      const silent = options?.silent ?? false;
      if (!silent) {
        setLoading(true);
      }
      if (!accessToken) {
        if (!silent) {
          setLoading(false);
        }
        return;
      }
      setError(null);
      try {
        const self = await fetchSelfProfile();
        const authDob = normalizeDateInput(
          String(
            (authUser as any)?.dateOfBirth ??
              (authUser as any)?.DateOfBirth ??
              "",
          ),
        );

        if (!self) {
          // No profile yet: seed from auth user and let the user create one
          const normalized: PatientProfile = {
            id: 0 as any, // indicates new profile to be created
            firstName: (
              authUser?.firstName ??
              authUser?.givenName ??
              (authUser as any)?.name ??
              ""
            ).toString(),
            lastName: (
              authUser?.lastName ??
              authUser?.familyName ??
              ""
            ).toString(),
            dateOfBirth: authDob || null,
            gender: normalizeGenderValue((authUser as any)?.gender ?? null),
            relationshipToUser: "Self",
          };
          // Start in edit mode with a draft so user can save to create
          setProfile(normalized);
          setDraft({ ...normalized });
          void cacheProfile(normalized);
        } else {
          // Patient profile exists - but prioritize User account data for display
          // This ensures we show "Patient 1 Test" not "Alex Malilong"
          const fromServer = mapPatientApiResponse(self);

          console.log("Raw patient data from server:", self);
          console.log("Mapped patient data:", fromServer);

          const normalizedRelationship =
            normalizeRelationshipValue(
              fromServer.relationshipToUser ??
                self.relationshipToUser ??
                self.RelationshipToUser ??
                "Self",
            ) ?? "Self";

          const cachedGender = cachedProfileRef.current?.gender ?? null;

          // CRITICAL: Use User account data as primary source, Patient profile as fallback
          const normalizedFromServer: PatientProfile = {
            id: fromServer.id,
            // Always use User account firstName/lastName for display
            firstName: String(
              authUser?.firstName ??
                authUser?.givenName ??
                fromServer.firstName ??
                (authUser as any)?.name ??
                "",
            ),
            lastName: String(
              authUser?.lastName ??
                authUser?.familyName ??
                fromServer.lastName ??
                "",
            ),
            dateOfBirth:
              authDob ||
              normalizeDateInput(String(fromServer.dateOfBirth ?? "")) ||
              (fromServer.dateOfBirth ?? null) ||
              null,
            gender:
              normalizeGenderValue(
                fromServer.gender ??
                  cachedGender ??
                  pendingProfileRef.current?.gender ??
                  (authUser as any)?.gender ??
                  null,
              ) ?? null,
            relationshipToUser: normalizedRelationship,
            // Onboarding fields
            occupation: fromServer.occupation ?? null,
            activityLevel: fromServer.activityLevel ?? null,
            currentComplaints: fromServer.currentComplaints ?? null,
          };

          let adjustedProfile: PatientProfile = normalizedFromServer;
          const overrides = pendingProfileRef.current;
          if (overrides) {
            let allMatched = true;
            for (const key of MERGEABLE_KEYS) {
              const overrideValue = overrides[key];
              if (overrideValue === undefined) continue;
              if (
                !profileValuesEqual(
                  key,
                  normalizedFromServer[key],
                  overrideValue,
                )
              ) {
                allMatched = false;
                break;
              }
            }

            if (allMatched) {
              pendingProfileRef.current = null;
            } else {
              adjustedProfile = { ...normalizedFromServer };
              for (const key of MERGEABLE_KEYS) {
                const overrideValue = overrides[key];
                if (overrideValue !== undefined) {
                  if (key === "gender") {
                    adjustedProfile[key] = normalizeGenderValue(
                      overrideValue as any,
                    ) as any;
                  } else if (key === "relationshipToUser") {
                    adjustedProfile[key] = normalizeRelationshipValue(
                      overrideValue as any,
                    ) as any;
                  } else {
                    adjustedProfile[key] = overrideValue as any;
                  }
                }
              }
            }
          }

          console.log("Final normalized profile:", adjustedProfile);
          setProfile((prev) => {
            const merged = mergeProfileData(adjustedProfile, prev);
            void cacheProfile(merged);
            // Always initialize draft for immediate editing
            setDraft({ ...merged });
            return merged;
          });
        }
      } catch (e: any) {
        console.warn("Failed to load patient edit profile", e);
        setError(
          e?.response?.data?.message || e?.message || "Failed to load profile",
        );
      } finally {
        if (!silent) {
          setLoading(false);
        }
      }
    },
    [accessToken, authUser, cacheProfile, fetchSelfProfile],
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load({ silent: true });
    setRefreshing(false);
  }, [load]);

  // Avoid re-triggering the initial load effect when the `load` callback identity
  // changes due to authUser updates (e.g., after save -> updateUser).
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  }, [load]);

  useEffect(() => {
    if (isBootstrapping) return;
    if (!accessToken) return;
    loadRef.current();
  }, [isBootstrapping, accessToken]);

  const onSave = async (silent?: boolean): Promise<boolean> => {
    if (!profile) return false;
    if (saving) return false;
    setError(null);

    const firstName = (draft?.firstName ?? profile.firstName ?? "")
      .toString()
      .trim();
    const lastName = (draft?.lastName ?? profile.lastName ?? "")
      .toString()
      .trim();
    const dateRaw = (draft?.dateOfBirth ?? profile.dateOfBirth ?? "")
      .toString()
      .trim();
    const relationship = (
      draft?.relationshipToUser ??
      profile.relationshipToUser ??
      ""
    )
      .toString()
      .trim();

    const genderRaw = normalizeGenderValue(
      (draft?.gender ?? profile.gender ?? "") as string | null,
    );
    setSaving(true);
    setError(null);
    try {
      const normalizedDob = normalizeDateInput(dateRaw);
      const authDob = normalizeDateInput(
        (authUser as any)?.dateOfBirth ?? (authUser as any)?.DateOfBirth ?? "",
      );

      const fallbackFirst =
        firstName ||
        profile.firstName ||
        String(
          authUser?.firstName ??
            (authUser as any)?.givenName ??
            (authUser as any)?.name ??
            "Patient",
        );
      const fallbackLast =
        lastName ||
        profile.lastName ||
        String(authUser?.lastName ?? (authUser as any)?.familyName ?? "User");
      const fallbackRelationship =
        relationship || profile.relationshipToUser || "Self";
      const fallbackDob =
        normalizedDob ||
        normalizeDateInput(String(profile.dateOfBirth ?? "")) ||
        authDob ||
        null;
      const normalizedRelationship =
        normalizeRelationshipValue(fallbackRelationship) ?? "Self";

      const payload: PatientProfilePayload = {
        firstName: fallbackFirst.trim() || "Patient",
        lastName: fallbackLast.trim() || "User",
        relationshipToUser: normalizedRelationship,
      };

      if (fallbackDob) {
        payload.dateOfBirth = fallbackDob;
      }

      if (draft && draft.gender !== undefined) {
        if (genderRaw) payload.gender = genderRaw;
        else payload.gender = null;
      } else if (!profile.gender && genderRaw) {
        payload.gender = genderRaw;
      }

      // Include onboarding fields
      if (draft) {
        if (draft.occupation !== undefined) {
          payload.occupation = draft.occupation?.trim() || null;
        }
        if (draft.activityLevel !== undefined) {
          payload.activityLevel = draft.activityLevel || null;
        }
        if (draft.currentComplaints !== undefined) {
          payload.currentComplaints = draft.currentComplaints?.trim() || null;
        }
      }

      let serverProfile: any = null;
      try {
        const response = await apiClient.put("/api/patient/me", payload);
        serverProfile = response?.data ?? null;
      } catch (err: any) {
        console.warn("Failed to save patient profile", err);
        throw err;
      }

      if (!serverProfile) {
        throw new Error("No patient profile returned by server.");
      }

      const mappedFromServer = mapPatientApiResponse(
        serverProfile,
        profile.id ?? null,
      );

      const resolvedId =
        (mappedFromServer.id as number | string | undefined) ?? profile.id;

      const baseProfile: PatientProfile = {
        id: resolvedId ?? profile.id,
        firstName: fallbackFirst.trim() || "Patient",
        lastName: fallbackLast.trim() || "User",
        dateOfBirth:
          fallbackDob ??
          mappedFromServer.dateOfBirth ??
          profile.dateOfBirth ??
          null,
        gender: normalizeGenderValue(
          genderRaw ?? mappedFromServer.gender ?? profile.gender ?? null,
        ),
        relationshipToUser:
          normalizeRelationshipValue(
            normalizedRelationship ||
              mappedFromServer.relationshipToUser ||
              profile.relationshipToUser ||
              "Self",
          ) ?? "Self",
        // Onboarding fields
        occupation:
          draft?.occupation ??
          mappedFromServer.occupation ??
          profile.occupation ??
          null,
        activityLevel:
          draft?.activityLevel ??
          mappedFromServer.activityLevel ??
          profile.activityLevel ??
          null,
        currentComplaints:
          draft?.currentComplaints ??
          mappedFromServer.currentComplaints ??
          profile.currentComplaints ??
          null,
      };

      let nextProfile = mergeProfileData(baseProfile, mappedFromServer);

      try {
        const verifyRes = await apiClient.get("/api/patient/me", {
          params: { _ts: Date.now() },
        });
        if (verifyRes?.data) {
          const verified = mapPatientApiResponse(
            verifyRes.data,
            nextProfile.id ?? profile.id ?? null,
          );
          nextProfile = mergeProfileData(nextProfile, verified);
        }
      } catch (verifyErr) {
        console.warn("Failed to verify patient profile after save", verifyErr);
      }

      void cacheProfile(nextProfile);

      pendingProfileRef.current = {
        firstName: nextProfile.firstName,
        lastName: nextProfile.lastName,
        dateOfBirth: nextProfile.dateOfBirth ?? null,
        gender: nextProfile.gender ?? null,
        relationshipToUser: nextProfile.relationshipToUser ?? null,
        occupation: nextProfile.occupation ?? null,
        activityLevel: nextProfile.activityLevel ?? null,
        currentComplaints: nextProfile.currentComplaints ?? null,
      };

      setProfile((prev) => mergeProfileData(nextProfile, prev));
      // Sync draft with saved profile to clear unsaved changes state
      setDraft({ ...nextProfile });

      if (!silent) {
        setShowSuccessModal(true);
      }

      try {
        const normalizedFirstForAuth =
          nextProfile.firstName?.toString().trim() ||
          (authUser as any)?.firstName ||
          (authUser as any)?.FirstName ||
          "Patient";
        const normalizedLastForAuth =
          nextProfile.lastName?.toString().trim() ||
          (authUser as any)?.lastName ||
          (authUser as any)?.LastName ||
          "User";
        const normalizedGenderForAuth =
          nextProfile.gender ??
          (authUser as any)?.gender ??
          (authUser as any)?.Gender ??
          null;
        const normalizedDobForAuth =
          nextProfile.dateOfBirth ??
          fallbackDob ??
          (authUser as any)?.dateOfBirth ??
          (authUser as any)?.DateOfBirth ??
          null;

        await updateUser({
          ...(authUser as any),
          firstName: normalizedFirstForAuth,
          FirstName: normalizedFirstForAuth,
          lastName: normalizedLastForAuth,
          LastName: normalizedLastForAuth,
          gender: normalizedGenderForAuth,
          Gender: normalizedGenderForAuth,
          dateOfBirth: normalizedDobForAuth,
          DateOfBirth: normalizedDobForAuth,
        } as any);
      } catch {}

      // Keep the edit form state (nextProfile) as the source of truth.
      // A silent reload here can re-hydrate from stale authUser and cause the
      // noticeable "refresh" + old values snapping back until you leave/re-enter.
      try {
        queryClient.setQueryData(["patientProfileDetails"], (prev: any) => ({
          ...(prev ?? {}),
          ...nextProfile,
        }));
      } catch {}
      void queryClient.invalidateQueries({ queryKey: ["patientProfileDetails"] });
      void queryClient.invalidateQueries({ queryKey: ["patientProfile"] });

      return true;
    } catch (e: any) {
      console.warn("Failed to save patient profile", e);
      const responseData = e?.response?.data;
      let message = "Failed to save changes";
      if (typeof responseData === "string" && responseData.trim().length > 0) {
        message = responseData;
      } else if (responseData?.message) {
        message = responseData.message;
      } else if (responseData?.title) {
        message = responseData.title;
      } else if (responseData?.errors) {
        try {
          const errors = Object.values(
            responseData.errors as Record<string, any>,
          )
            .flat()
            .filter(Boolean);
          if (errors.length > 0) message = errors.join("\n");
        } catch {}
      } else if (e?.message) {
        message = e.message;
      }
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
        style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
      >
        <ActivityIndicator />
      </SafeAreaView>
    );
  }

  if (!profile) {
    return (
      <SafeAreaView
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          padding: 20,
        }}
      >
        <Text style={{ color: "#DC2626" }}>
          {error ?? "Unable to load profile."}
        </Text>
      </SafeAreaView>
    );
  }

  const viewItem = (label: string, value?: string | null) => (
    <View
      style={{
        flexDirection: "row",
        justifyContent: "space-between",
        marginBottom: 10,
      }}
    >
      <Text style={{ color: "#9CA3AF" }}>{label}</Text>
      <Text>{value || "-"}</Text>
    </View>
  );

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

        {/* Header with avatar and full name (mirrors therapist page) */}
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
            }}
          >
            {shouldShowInitials ? (
              <View
                style={{
                  width: 80,
                  height: 80,
                  borderRadius: 40,
                  backgroundColor: "#E5E7EB",
                  justifyContent: "center",
                  alignItems: "center",
                }}
              >
                <Text
                  style={{ fontSize: 24, fontWeight: "bold", color: "#374151" }}
                >
                  {getInitials(fullName)}
                </Text>
              </View>
            ) : (
              <Image
                source={avatarSource}
                style={{ width: 80, height: 80 }}
                resizeMode="cover"
              />
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
          <View
            style={{
              marginBottom: 8,
            }}
          >
            <Text style={{ fontWeight: "700" }}>Account Details</Text>
          </View>

          <View>
            {error ? (
              <Text style={{ color: "#DC2626", marginBottom: 8 }}>{error}</Text>
            ) : null}
            <Text style={{ color: "#6B7280", marginBottom: 4 }}>
              First Name
            </Text>
            <TextInput
              value={draft?.firstName ?? ""}
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
              value={draft?.lastName ?? ""}
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
                value={draft?.dateOfBirth ?? ""}
                max={new Date().toISOString().slice(0, 10)}
                onChange={(e) => {
                  const value = e.target.value;
                  setDraft((d) => ({
                    ...(d ?? ({} as any)),
                    dateOfBirth: value || null,
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
                      color: draft?.dateOfBirth ? "#111827" : "#9CA3AF",
                      fontSize: 14,
                    }}
                  >
                    {draft?.dateOfBirth
                      ? formatDob(draft.dateOfBirth)
                      : "Select your date of birth"}
                  </Text>
                  <Ionicons name="calendar-outline" size={20} color="#6B7280" />
                </TouchableOpacity>

                {showDobPicker && (
                  <DateTimePicker
                    value={
                      draft?.dateOfBirth
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
                  normalizeGenderValue(
                    (draft?.gender ?? profile.gender ?? null) as string | null,
                  ) === option.value;
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

          {/* Occupation - now part of Account Details */}
          <Text style={{ color: "#6B7280", marginBottom: 4, marginTop: 8 }}>
            Occupation
          </Text>
          <TextInput
            value={draft?.occupation ?? ""}
            onChangeText={(t) =>
              setDraft((d) => ({ ...(d ?? ({} as any)), occupation: t }))
            }
            style={{
              borderWidth: 1,
              borderColor: "#E5E7EB",
              borderRadius: 8,
              padding: 10,
              marginBottom: 12,
            }}
            placeholder="e.g. Engineer, Teacher, Student"
          />

          {/* Activity Level */}
          <Text style={{ color: "#6B7280", marginBottom: 4 }}>
            Activity Level
          </Text>
          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              marginBottom: 12,
              gap: 8,
            }}
          >
            {ACTIVITY_LEVEL_OPTIONS.map((option) => {
              const selected =
                (draft?.activityLevel ?? profile.activityLevel ?? "") ===
                option.value;
              return (
                <TouchableOpacity
                  key={option.value}
                  onPress={() => handleActivityLevelChange(option.value)}
                  style={{
                    paddingVertical: 8,
                    paddingHorizontal: 12,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: selected ? "#089769" : "#D1D5DB",
                    backgroundColor: selected ? "#089769" : "#FFFFFF",
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                >
                  <Text
                    style={{
                      color: selected ? "#FFFFFF" : "#111827",
                      fontWeight: selected ? "700" : "500",
                      fontSize: 13,
                    }}
                  >
                    {option.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Current Complaints */}
          <Text style={{ color: "#6B7280", marginBottom: 4 }}>
            Current Complaints / Concerns
          </Text>
          <TextInput
            value={draft?.currentComplaints ?? ""}
            onChangeText={(t) =>
              setDraft((d) => ({ ...(d ?? ({} as any)), currentComplaints: t }))
            }
            style={{
              borderWidth: 1,
              borderColor: "#E5E7EB",
              borderRadius: 8,
              padding: 10,
              minHeight: 80,
              textAlignVertical: "top",
            }}
            placeholder="Describe any physical symptoms or concerns"
            multiline
          />

          {/* Location Section - at the very end */}
          <View
            style={{
              marginTop: 24,
              paddingTop: 16,
              borderTopWidth: 1,
              borderTopColor: "#E5E7EB",
            }}
          >
            <Text
              style={{
                fontSize: 16,
                fontWeight: "600",
                color: "#111827",
                marginBottom: 12,
              }}
            >
              Location
            </Text>

            {draft?.address ||
            draft?.barangay ||
            profile?.address ||
            profile?.barangay ? (
              <View style={{ marginBottom: 12 }}>
                {!!(draft?.address || profile?.address) && (
                  <Text
                    style={{
                      color: "#374151",
                      fontSize: 15,
                      fontWeight: "500",
                    }}
                  >
                    {draft?.address ?? profile?.address}
                  </Text>
                )}
                {!!(draft?.barangay || profile?.barangay) && (
                  <Text
                    style={{ color: "#6B7280", fontSize: 13, marginTop: 2 }}
                  >
                    {draft?.barangay ?? profile?.barangay}
                  </Text>
                )}
              </View>
            ) : null}

            <TouchableOpacity
              onPress={() => router.push("/edit-location")}
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                paddingVertical: 12,
                paddingHorizontal: 16,
                backgroundColor: "#F9FAFB",
                borderRadius: 8,
                borderWidth: 1,
                borderColor: "#E5E7EB",
              }}
              accessibilityRole="button"
              accessibilityLabel="Edit your location"
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  flex: 1,
                  paddingRight: 8,
                }}
              >
                <Ionicons
                  name="location-outline"
                  size={20}
                  color="#6B7280"
                  style={{ marginRight: 12 }}
                />
                <Text style={{ color: "#374151", fontSize: 15 }}>
                  Edit your location
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
            </TouchableOpacity>
          </View>
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
          onPress={() => onSave(false)}
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
    </SafeAreaView>
  );
}

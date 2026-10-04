import { useCallback, useEffect, useMemo, useState } from "react";
import * as FileSystem from "expo-file-system/legacy";
import { Platform } from "react-native";
import apiClient from "@/api/client";
import { useAuth } from "@/src/providers/AuthProvider";
import { resolveAvatarSource } from "@/src/utils/avatar";
import type { ImageSourcePropType } from "react-native";
import {
  getItem as ssGet,
  setItem as ssSet,
} from "@/src/utils/safeSecureStore";

type PhotoCache = {
  userId?: string | number | null;
  localUri: string | null;
  remoteUrl: string | null;
  ts: number;
};

const CACHE_KEY = "therapistPhotoCache";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const fallbackAvatar = require("@/assets/images/react-logo.png");

const parseCache = (raw: string | null): PhotoCache | null => {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as PhotoCache;
    if (parsed && typeof parsed.ts === "number") {
      return parsed;
    }
  } catch (err) {
    console.warn("Failed to parse therapist photo cache", err);
  }
  return null;
};

const isCacheFresh = (cache: PhotoCache | null) => {
  if (!cache) return false;
  return Date.now() - cache.ts < CACHE_TTL_MS;
};

const buildLocalPath = (remoteUrl: string) => {
  if (!FileSystem.cacheDirectory) return null;
  const fileName =
    remoteUrl.split("/").pop()?.split("?")[0] ?? `therapist-${Date.now()}.jpg`;
  return `${FileSystem.cacheDirectory}therapist-${fileName}`;
};

type UseTherapistAvatarResult = {
  avatarSource: ImageSourcePropType;
  hasRealAvatar: boolean;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  refetch: () => Promise<void>;
};

export const useTherapistAvatar = (): UseTherapistAvatarResult => {
  const { user } = useAuth();
  const [overrideUri, setOverrideUri] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const userId = useMemo(
    () => user?.id ?? user?._id ?? user?.userId ?? null,
    [user]
  );

  useEffect(() => {
    // Reset override when user switches (e.g., logout/login)
    setOverrideUri(null);
  }, [userId]);

  const loadFromCache = useCallback(async (): Promise<string | null> => {
    try {
      const raw = await ssGet(CACHE_KEY);
      const cache = parseCache(raw);
      if (!cache) return null;
      if (cache.userId && userId && cache.userId !== userId) {
        return null;
      }
      if (!isCacheFresh(cache)) {
        return null;
      }
      if (cache.localUri && Platform.OS !== "web") {
        try {
          const info = await FileSystem.getInfoAsync(cache.localUri);
          if (info.exists) {
            return cache.localUri;
          }
        } catch {
          // Fall through to remote url fetch
        }
      }
      if (cache.remoteUrl) {
        return cache.remoteUrl;
      }
    } catch (err) {
      console.warn("Failed to read therapist photo cache", err);
    }
    return null;
  }, [userId]);

  const persistCache = useCallback(
    async (payload: PhotoCache) => {
      try {
        await ssSet(CACHE_KEY, JSON.stringify(payload));
      } catch (err) {
        console.warn("Failed to persist therapist photo cache", err);
      }
    },
    []
  );

  const fetchRemotePhoto = useCallback(async (): Promise<string | null> => {
    try {
      const response = await apiClient.get("/api/Therapist/me/photo");
      const remoteUrl = response?.data?.profilePicture;
      if (!remoteUrl) {
        await persistCache({ userId, localUri: null, remoteUrl: null, ts: Date.now() });
        return null;
      }

      const isWeb = Platform.OS === "web";
      const localPath = isWeb ? null : buildLocalPath(remoteUrl);
      let finalUri = remoteUrl;

      if (localPath) {
        try {
          const info = await FileSystem.getInfoAsync(localPath);
          if (!info.exists) {
            await FileSystem.downloadAsync(remoteUrl, localPath);
          }
          finalUri = localPath;
        } catch (err) {
          console.warn("Failed to cache therapist photo locally", err);
          finalUri = remoteUrl;
        }
      }

      await persistCache({
        userId,
        localUri: !isWeb && finalUri === localPath ? finalUri : null,
        remoteUrl,
        ts: Date.now(),
      });
      return finalUri;
    } catch (err: any) {
      const message = err?.response?.status
        ? `Failed to fetch therapist photo: ${err.response.status}`
        : err?.message ?? "Failed to fetch therapist photo";
      setError(message);
      console.warn(message, err);
      return null;
    }
  }, [persistCache, userId]);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const cached = await loadFromCache();
      if (cached) {
        setOverrideUri(cached);
        return;
      }

      const remote = await fetchRemotePhoto();
      setOverrideUri(remote);
    } finally {
      setIsLoading(false);
    }
  }, [fetchRemotePhoto, loadFromCache]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const hasRealAvatar = useMemo(
    () => !!(overrideUri || user?.avatar),
    [overrideUri, user?.avatar]
  );

  const avatarSource = useMemo(
    () =>
      resolveAvatarSource(
        overrideUri ?? user?.avatar ?? null,
        fallbackAvatar
      ),
    [overrideUri, user?.avatar]
  );

  return {
    avatarSource,
    hasRealAvatar,
    isLoading,
    error,
    refresh,
    refetch: refresh,
  };
};

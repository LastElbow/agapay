import apiClient from "@/api/client";
import type { ImageSourcePropType, ImageURISource } from "react-native";

type AvatarLike =
  | ImageSourcePropType
  | string
  | null
  | undefined
  | Record<string, any>;

const cache = new Map<string, ImageURISource>();

const normalizeUrl = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  if (/^(https?:|file:|content:|data:image\/)/i.test(trimmed)) return trimmed;
  // If it's a relative path, prepend baseURL (without trailing slash)
  if (trimmed.startsWith("/")) {
    const base = (apiClient.defaults.baseURL || "").replace(/\/?$/,"" );
    if (base) return `${base}${trimmed}`;
  } else if (!trimmed.includes("://")) {
    // Likely bare relative path like 'uploads/abc.jpg'
    const base = (apiClient.defaults.baseURL || "").replace(/\/?$/,"" );
    if (base) return `${base}/${trimmed}`;
  }
  return trimmed;
};

const asUriSource = (value: string): ImageURISource => {
  const url = normalizeUrl(value);
  const cached = cache.get(url);
  if (cached) return cached;
  const src: ImageURISource = { uri: url };
  cache.set(url, src);
  return src;
};

export const resolveAvatarSource = (
  avatar: AvatarLike,
  fallback: ImageSourcePropType
): ImageSourcePropType => {
  if (!avatar) return fallback;

  // React Native `require()` returns a number that can be used directly
  if (typeof avatar === "number") {
    return avatar;
  }

  // If the avatar is already an object with a `uri` field, use it.
  if (
    typeof avatar === "object" &&
    !Array.isArray(avatar) &&
    avatar !== null &&
    "uri" in avatar &&
    typeof (avatar as any).uri === "string" &&
    (avatar as any).uri.length > 0
  ) {
    return avatar as ImageURISource;
  }

  // If the backend returned an object with a nested url field (several APIs
  // use names like `profilePicture`, `profilePictureUrl`, `url`, `src`, or
  // `path`), try to extract a string from those common keys.
  if (typeof avatar === "object" && !Array.isArray(avatar) && avatar !== null) {
    const obj = avatar as Record<string, any>;
    const candidates = [
      "profilePicture",
      "profilePictureUrl",
      "profile_picture",
      "profile_picture_url",
      "avatar",
      "avatarUrl",
      "avatar_url",
      "url",
      "src",
      "path",
      "file",
    ];

    for (const key of candidates) {
      const v = obj[key];
      if (typeof v === "string" && v.length > 0) {
        const str = v;
        if (
          str.startsWith("http://") ||
          str.startsWith("https://") ||
          str.startsWith("file://") ||
          str.startsWith("content://") ||
          str.startsWith("data:image/")
        ) {
          return asUriSource(str);
        }
      }
    }
  }

  const str = String(avatar);

  if (!str) return fallback;

  // Accept any form and normalize; fallback if still not absolute
  const normalized = normalizeUrl(str);
  if (normalized) {
    if (/^(https?:|file:|content:|data:image\/)/i.test(normalized)) {
      return asUriSource(normalized);
    }
  }

  return fallback;
};

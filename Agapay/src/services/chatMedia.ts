import { supabaseClient } from "@/src/lib/supabaseClient";
import { Platform } from "react-native";

const CHAT_MEDIA_PREFIX = (process.env.EXPO_PUBLIC_CHAT_MEDIA_PREFIX ?? "public/chat-media")
  .replace(/^\/*/, "")
  .replace(/\/*$/, "");

const CHAT_MEDIA_BUCKET = process.env.EXPO_PUBLIC_SUPABASE_BUCKET ?? "agapay";

const guessExtensionFromContentType = (type: string | null | undefined): string => {
  if (!type) return "";
  const normalized = type.toLowerCase();
  if (normalized.includes("png")) return "png";
  if (normalized.includes("webp")) return "webp";
  if (normalized.includes("gif")) return "gif";
  if (normalized.includes("heic")) return "heic";
  return "jpg";
};

const guessContentTypeFromUri = (uri: string): string => {
  const lower = uri.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".heic")) return "image/heic";
  return "image/jpeg";
};

const extractExtension = (uri: string): string => {
  const match = /\.([a-z0-9]+)(?:\?.*)?$/i.exec(uri);
  return match?.[1]?.toLowerCase() ?? "";
};

const ensureSupabaseClient = () => {
  if (!supabaseClient) {
    throw new Error(
      "Supabase client not configured. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY."
    );
  }
  return supabaseClient;
};

export async function uploadChatImageAsync(uri: string): Promise<string> {
  if (!uri) {
    throw new Error("Image URI is required.");
  }

  const client = ensureSupabaseClient();

  const detectedContentType = guessContentTypeFromUri(uri);
  let extension = extractExtension(uri);
  if (!extension) {
    extension = guessExtensionFromContentType(detectedContentType);
  }

  const fileName = `${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}.${extension || "jpg"}`;

  const objectPath = `${CHAT_MEDIA_PREFIX}/${fileName}`;

  // Build a FormData so that Supabase's uploadOrUpdate takes the
  // `fileBody instanceof FormData` branch, which works on every platform.
  // On React Native, FormData.append() accepts a {uri, name, type} object
  // instead of an actual Blob/File.
  const formData = new FormData();
  formData.append("cacheControl", "3600");

  if (Platform.OS === "web") {
    // On web, fetch works normally and Blob is reliable
    const response = await fetch(uri);
    if (!response.ok) {
      throw new Error("Unable to read the selected image.");
    }
    const blob = await response.blob();
    formData.append("", blob, fileName);
  } else {
    // On React Native, append the file using the {uri, name, type} convention.
    // RN's FormData polyfill handles reading the file from the local URI.
    formData.append("", {
      uri,
      name: fileName,
      type: detectedContentType || "image/jpeg",
    } as any);
  }

  const { error, data } = await client.storage
    .from(CHAT_MEDIA_BUCKET)
    .upload(objectPath, formData, {
      upsert: false,
    });

  if (error) {
    throw new Error(error.message ?? "Failed to upload image.");
  }

  return data?.path ?? objectPath;
}

export function getChatImageUrl(path: string): string {
  if (!path) return "";

  // If already a full URL, return as is
  if (path.startsWith("http") || path.startsWith("data:")) {
    return path;
  }

  // Use the configured client if available
  if (supabaseClient) {
    const { data } = supabaseClient.storage
      .from(CHAT_MEDIA_BUCKET)
      .getPublicUrl(path);

    return data.publicUrl;
  }

  // Fallback if client not initialized (e.g. missing env vars)
  // We try to construct it manually using the known project info if possible,
  // or return the path if we can't do anything else.
  // Warning: This manual construction relies on the user eventually providing the URL.
  const projectUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  if (projectUrl) {
    const baseUrl = projectUrl.replace(/\/$/, "");
    return `${baseUrl}/storage/v1/object/public/${CHAT_MEDIA_BUCKET}/${path}`;
  }

  return path;
}

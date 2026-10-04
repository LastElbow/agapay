import apiClient from "@/api/client";
import { Platform } from "react-native";

export type ProfilePictureResponse = {
    message?: string;
    profilePictureUrl: string | null;
};

/**
 * Upload a profile picture for the current patient user.
 * @param imageUri - The local URI of the image to upload
 * @returns The uploaded profile picture URL
 */
export async function uploadPatientProfilePicture(
    imageUri: string
): Promise<ProfilePictureResponse> {
    const formData = new FormData();

    if (Platform.OS === "web") {
        // On web, fetch the blob and create a File object
        const filename = imageUri.split("/").pop() || "profile.jpg";
        const match = /\.(\w+)$/.exec(filename);
        const fileType = match ? `image/${match[1]}` : "image/jpeg";
        const response = await fetch(imageUri);
        const blob = await response.blob();
        const file = new File([blob], filename, { type: fileType });
        formData.append("profilePicture", file);
    } else {
        // On native, append the URI with metadata
        const filename = imageUri.split("/").pop() || "profile.jpg";
        const match = /\.(\w+)$/.exec(filename);
        const type = match ? `image/${match[1]}` : "image/jpeg";

        formData.append("profilePicture", {
            uri: imageUri,
            name: filename,
            type,
        } as any);
    }

    const res = await apiClient.post("/api/patient/profile-picture", formData, {
        headers: {
            "Content-Type": "multipart/form-data",
        },
    });

    return res.data;
}

/**
 * Get the current patient user's profile picture URL.
 * @returns The profile picture URL or null if not set
 */
export async function fetchPatientProfilePicture(): Promise<ProfilePictureResponse> {
    const res = await apiClient.get("/api/patient/profile-picture");
    return res.data;
}

export const patientProfilePictureQueryKey = ["patient", "profile-picture"] as const;

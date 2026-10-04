
import { Image } from "expo-image";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { resolveAvatarSource } from "@/src/utils/avatar";

const AVATAR_FALLBACK = require("@/assets/images/react-logo.png");

function getInitials(name?: string) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

type AvatarProps = {
  uri?: string | null;
  name?: string | null;
  size?: number;
};

export function Avatar({ uri, name, size = 48 }: AvatarProps) {
  const containerStyle = [
    styles.avatar,
    { width: size, height: size, borderRadius: size / 2 },
  ];
    const initialsStyle = [styles.avatarInitials, { fontSize: size / 3 }];

  if (uri) {
    return (
      <Image
        source={resolveAvatarSource(uri, AVATAR_FALLBACK)}
        style={containerStyle}
      />
    );
  }

  return (
    <View style={[containerStyle, styles.avatarPlaceholder]}>
      <Text style={initialsStyle}>{getInitials(name ?? undefined)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: {
    backgroundColor: "#EEE",
  },
  avatarPlaceholder: {
    backgroundColor: "#E5E7EB",
    justifyContent: "center",
    alignItems: "center",
  },
  avatarInitials: {
    fontWeight: "700",
    color: "#374151",
  },
});

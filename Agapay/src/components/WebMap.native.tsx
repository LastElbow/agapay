import React from "react";
import { View, Text } from "react-native";

type Props = {
  center: [number, number];
  onChange?: (lng: number, lat: number) => void;
  style?: any;
  zoom?: number;
};

export default function WebMap(_props: Props) {
  // Native platforms use @rnmapbox/maps directly in the screen.
  // This is a no-op placeholder to satisfy platform-specific imports.
  return <View />;
}


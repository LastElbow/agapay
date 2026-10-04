import {
  Inter_400Regular,
  Inter_600SemiBold,
  useFonts as useInter,
} from "@expo-google-fonts/inter";
import {
  Poppins_500Medium,
  Poppins_600SemiBold,
  useFonts as usePoppins,
} from "@expo-google-fonts/poppins";
import {
  Raleway_700Bold,
  useFonts as useRaleway,
} from "@expo-google-fonts/raleway";
import React from "react";
import { Text, View } from "react-native";

// Active FontLoader using @expo-google-fonts.
// NOTE: you must run the install commands listed in the repository README or below
// before this will work:
// npm install @expo-google-fonts/inter @expo-google-fonts/poppins

export default function FontLoader({
  children,
}: {
  children: React.ReactNode;
}) {
  const [interLoaded] = useInter({ Inter_400Regular, Inter_600SemiBold });
  const [poppinsLoaded] = usePoppins({
    Poppins_500Medium,
    Poppins_600SemiBold,
  });
  const [ralewayLoaded] = useRaleway({ Raleway_700Bold });
  const loaded = interLoaded && poppinsLoaded;
  // ensure raleway is included in the loaded set
  const allLoaded = loaded && ralewayLoaded;
  if (!allLoaded) return <View />;

  // Set a global default Text style so components using plain <Text> render with Inter.
  (Text as any).defaultProps = (Text as any).defaultProps || {};
  (Text as any).defaultProps.style = [
    (Text as any).defaultProps.style || {},
    { fontFamily: "Inter_400Regular" },
  ];

  return <>{children}</>;
}

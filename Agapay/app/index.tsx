import React from "react";
import { Redirect } from "expo-router";

// Native (iOS/Android): immediately open Sign In
export default function Index() {
  return <Redirect href="/(auth)/signin" />;
}

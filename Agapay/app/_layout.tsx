import { useTokenRefresh } from "@/src/auth/useTokenRefresh";
import { AuthProvider } from "@/src/providers/AuthProvider";
import { RoleProvider } from "@/src/providers/RoleProvider";
import { DebugLogProvider } from "@/src/providers/DebugLogProvider";
import { NetworkProvider } from "@/src/providers/NetworkProvider";
import { AdminNotificationProvider } from "@/src/providers/AdminNotificationContext";
import { SuspensionProvider } from "@/src/providers/SuspensionContext";
import { QueryClientProvider } from "@tanstack/react-query";
import queryClient from "@/src/queryClient";
import { Stack, useRouter } from "expo-router";
import Head from "expo-router/head";
import { Platform, BackHandler } from "react-native";
import { useEffect } from "react";
import { useNavigationState } from "@react-navigation/native";
import "./global.css";
import TherapistContractListener from "@/src/components/TherapistDeclineListener";
import SessionCancellationListener from "@/src/components/SessionCancellationListener";
import DebugSessionListener from "@/src/components/DebugSessionListener";
import AuthGate from "@/src/providers/AuthGate";
import ErrorBoundary from "@/src/components/ErrorBoundary";

export default function RootLayout() {
  useTokenRefresh();
  const router = useRouter();

  // Global Android hardware back button handler.
  // On root tab screens (where there's no screen to go back to), block the
  // back button to prevent the app from closing or navigating to sign-in.
  // On all other screens, call router.back() so the phone's built-in back
  // button works exactly like the in-app back buttons.
  const navIndex = useNavigationState((state) => state?.index ?? 0);
  const navRoutesLength = useNavigationState(
    (state) => state?.routes?.length ?? 0
  );

  useEffect(() => {
    if (Platform.OS !== "android") return;

    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      () => {
        // If there are stacked screens to go back to, navigate back
        if (navRoutesLength > 1 && navIndex > 0) {
          router.back();
          return true; // We handled it
        }
        // On root screen (home tabs), block back to prevent app exit
        return true;
      }
    );

    return () => subscription.remove();
  }, [navIndex, navRoutesLength, router]);
  return (
    <ErrorBoundary>
      <AuthProvider>
        <RoleProvider>
          <DebugLogProvider>
            <QueryClientProvider client={queryClient}>
              <NetworkProvider>
                <AdminNotificationProvider>
                  <SuspensionProvider>
                    {Platform.OS === "web" && (
                      <Head>
                        <link
                          rel="stylesheet"
                          href="https://api.mapbox.com/mapbox-gl-js/v2.15.0/mapbox-gl.css"
                        />
                      </Head>
                    )}
                    <AuthGate>
                      <TherapistContractListener />
                      <SessionCancellationListener />
                      <DebugSessionListener />
                      <Stack
                        screenOptions={{
                          headerShown: false, // Hide all headers by default
                        }}
                      />
                    </AuthGate>
                  </SuspensionProvider>
                </AdminNotificationProvider>
              </NetworkProvider>
            </QueryClientProvider>
          </DebugLogProvider>
        </RoleProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}
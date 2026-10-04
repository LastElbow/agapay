import { QueryClient } from "@tanstack/react-query";
import { setupOnlineManager } from "./utils/setupOnlineManager";

// Sync React Query's online status with network state
setupOnlineManager();

// Centralized singleton QueryClient so we can clear caches on sign-out
// Configure defaults to reduce aggressive refetches on tab/window focus that can
// expose transient undefined states in infinite queries during mount/unmount races.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Prevent aggressive refetching - data stays fresh for 30 seconds
      staleTime: 30 * 1000, // 30 seconds
      // Keep unused cache data for 5 minutes before garbage collection
      gcTime: 5 * 60 * 1000, // 5 minutes (formerly cacheTime)
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      // Prevent refetching when component mounts if data is fresh
      refetchOnMount: false,
      // Avoid retry storms on auth-protected endpoints; keeps shape stable on profile screens
      retry: 1,
      // Limit how often failed requests can retry
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    },
  },
});

export default queryClient;


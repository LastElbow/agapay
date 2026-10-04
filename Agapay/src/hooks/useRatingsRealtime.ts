import { useEffect } from "react";
import { useAuth } from "@/src/providers/AuthProvider";
import { useQueryClient } from "@tanstack/react-query";
import { therapistRatingsQueryKey } from "@/src/services/ratings";
import signalrManager from "@/src/services/signalrManager";

/**
 * Real-time listener for therapist ratings using SignalR.
 * Automatically invalidates the therapist ratings query when a new rating is submitted.
 */
export function useRatingsRealtime() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!accessToken) return;

    let active = true;
    let unsubscribeFn: (() => void) | undefined;

    const setup = async () => {
      try {
        await signalrManager.getSharedConnection('ratings', accessToken);

        if (!active) {
          signalrManager.releaseConnection('ratings');
          return;
        }

        // Listen for RatingSubmitted event
        unsubscribeFn = signalrManager.subscribeToEvent('ratings', "RatingSubmitted", (payload: any) => {
          console.log("📡 RatingSubmitted event received:", payload);
          // Invalidate therapist ratings query to refresh the ratings list
          queryClient
            .invalidateQueries({ queryKey: therapistRatingsQueryKey })
            .catch(() => { });
        });

        console.log("✅ Ratings hub connected");
      } catch (e) {
        console.warn("useRatingsRealtime connection failed", e);
      }
    };

    setup();

    return () => {
      active = false;
      if (unsubscribeFn) unsubscribeFn();
      signalrManager.releaseConnection('ratings');
    };
  }, [accessToken, queryClient]);
}

export default useRatingsRealtime;

import { useCallback, useEffect, useRef } from "react";
import { useAuth } from "@/src/providers/AuthProvider";
import { useQueryClient } from "@tanstack/react-query";
import { sessionDetailQueryKey, upcomingSessionsQueryKey, allSessionsQueryKey } from "@/src/services/sessions";
import { setItem as ssSet, deleteItem as ssDel } from "@/src/utils/safeSecureStore";
import { getSharedConnection, releaseConnection, subscribeToEvent } from "@/src/services/signalrManager";
import { buildSessionRealtimePlan } from "@/src/features/sessions/realtime/planner";

/**
 * Shared session real-time listener (SignalR) for both therapist & patient session views.
 * Automatically invalidates react-query caches on lifecycle changes & log additions.
 *
 * Expected server events (by convention; extend when backend emits them):
 *  - SessionCancelled: { sessionId }
 *  - SessionStarted: { sessionId }
 *  - SessionMarkedDone: { sessionId }
 *  - SessionCompleted: { sessionId }
 *  - SessionLogAdded: { sessionId, logId }
 */
export function useSessionRealtime(sessionId?: number) {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  const lastInvalidateRef = useRef<number>(0);
  const pendingInvalidateRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Increased debounce to 2 seconds to prevent 429 rate limiting
  const INVALIDATE_DEBOUNCE_MS = 2000;

  // Debounced invalidation for detail + lists - now with trailing edge debounce
  const invalidateCore = useCallback((id?: number) => {
    // Cancel any pending invalidation
    if (pendingInvalidateRef.current) {
      clearTimeout(pendingInvalidateRef.current);
    }

    // Schedule new invalidation with trailing edge debounce
    pendingInvalidateRef.current = setTimeout(() => {
      const now = Date.now();
      // Additional check to prevent rapid invalidations
      if (now - lastInvalidateRef.current < INVALIDATE_DEBOUNCE_MS) return;
      lastInvalidateRef.current = now;

      // Invalidate queries but don't force immediate refetch
      void queryClient.invalidateQueries({ queryKey: upcomingSessionsQueryKey, refetchType: 'none' });
      void queryClient.invalidateQueries({ queryKey: allSessionsQueryKey, refetchType: 'none' });
      if (id) void queryClient.invalidateQueries({ queryKey: sessionDetailQueryKey(id), refetchType: 'active' });

      pendingInvalidateRef.current = null;
    }, INVALIDATE_DEBOUNCE_MS);
  }, [queryClient]);

  useEffect(() => {
    if (!accessToken) return;

    let active = true;
    let unsubscribeFns: (() => void)[] = [];

    const setup = async () => {
      try {
        // We use getSharedConnection to ensure the connection is active, 
        // but we primarily use subscribeToEvent for handling messages.
        await getSharedConnection('sessions', accessToken);

        if (!active) {
          releaseConnection('sessions');
          return;
        }

        // Generic handler to consolidate invalidation
        const handleCore = (payload: any) => {
          const idRaw = payload?.sessionId;
          const idNum = Number(idRaw);
          const validId = Number.isFinite(idNum) ? idNum : undefined;
          invalidateCore(validId);
          if (validId && sessionId && validId === sessionId) {
            // Force detail refetch even if already stale
            void queryClient.invalidateQueries({ queryKey: sessionDetailQueryKey(validId) });
          }
        };

        const safeSubscribe = (eventName: string, handler: (payload: any) => void) => {
          try {
            const unsub = subscribeToEvent('sessions', eventName, handler);
            unsubscribeFns.push(unsub);
          } catch (err) {
            console.warn(`Failed to subscribe to sessions:${eventName}`, err);
          }
        };

        const handleEventWithPlanner = async (eventName: string, payload: any) => {
          const plan = buildSessionRealtimePlan({ ...(payload ?? {}), eventName }, sessionId);

          // Debounced core invalidation + focused-session immediate detail refresh
          handleCore(payload);

          // Immediate invalidation for session logs (planner-driven)
          for (const key of plan.invalidateQueryKeys) {
            if (Array.isArray(key) && key[0] === 'sessions' && key[1] === 'logs') {
              void queryClient.invalidateQueries({ queryKey: key });
            }
          }

          for (const key of plan.clearStorageKeys) {
            try {
              await ssDel(key);
            } catch (err) {
              console.warn(`Failed to clear storage key ${key} on ${eventName}`, err);
            }
          }
          for (const item of plan.setStorageItems) {
            try {
              await ssSet(item.key, item.value);
            } catch (err) {
              console.warn(`Failed to set storage key ${item.key} on ${eventName}`, err);
            }
          }
        };

        safeSubscribe("SessionCancelled", async (p: any) => {
          await handleEventWithPlanner('SessionCancelled', p);
        });

        safeSubscribe("SessionStarted", async (p: any) => {
          await handleEventWithPlanner('SessionStarted', p);
        });

        safeSubscribe("SessionMarkedDone", async (p: any) => {
          await handleEventWithPlanner('SessionMarkedDone', p);
        });

        safeSubscribe("SessionCompleted", async (p: any) => {
          await handleEventWithPlanner('SessionCompleted', p);
        });

        safeSubscribe("SessionLogAdded", async (p: any) => {
          await handleEventWithPlanner('SessionLogAdded', p);
        });

        safeSubscribe("SessionRescheduled", (p: any) => {
            console.log("📅 SessionRescheduled event received:", p);
            handleCore(p);
          });

        safeSubscribe("RescheduleProposed", (p: any) => {
            console.log("📅 RescheduleProposed event received:", p);
            handleCore(p);
          });

        safeSubscribe("CancellationRequested", (p: any) => {
            console.log("🔔 CancellationRequested event received:", p);
            handleCore(p);
          });

        safeSubscribe("CancellationAcknowledged", (p: any) => {
            console.log("✅ CancellationAcknowledged event received:", p);
            handleCore(p);
          });

        safeSubscribe("RescheduleApproved", (p: any) => {
            console.log("✅ RescheduleApproved event received:", p);
            handleCore(p);
          });

        safeSubscribe("RescheduleDeclined", (p: any) => {
            console.log("❌ RescheduleDeclined event received:", p);
            handleCore(p);
          });

        safeSubscribe("RelieverAccepted", (p: any) => {
            console.log("✅ RelieverAccepted event received:", p);
            handleCore(p);
          });

        safeSubscribe("RelieverDeclined", (p: any) => {
            console.log("❌ RelieverDeclined event received:", p);
            handleCore(p);
          });

        safeSubscribe("RelieverProposed", (p: any) => {
            console.log("🔔 RelieverProposed event received:", p);
            handleCore(p);
          });

        safeSubscribe("RelieverProposalSent", (p: any) => {
            console.log("📤 RelieverProposalSent event received:", p);
            handleCore(p);
          });

        safeSubscribe("SessionUpdated", (p: any) => {
            console.log("🔄 SessionUpdated event received:", p);
            handleCore(p);
          });

        safeSubscribe("SessionsRefresh", (p: any) => {
            console.log("🔄 SessionsRefresh event received:", p);
            // Invalidate all session lists when backend requests a refresh
            void queryClient.invalidateQueries({ queryKey: upcomingSessionsQueryKey });
            void queryClient.invalidateQueries({ queryKey: allSessionsQueryKey });
            if (sessionId) {
              void queryClient.invalidateQueries({ queryKey: sessionDetailQueryKey(sessionId) });
            }
          });

        safeSubscribe("PatientLocationUpdated", (p: any) => {
            console.log("📍 PatientLocationUpdated event received:", p);
            // Invalidate all session queries to refresh maps with new patient location
            void queryClient.invalidateQueries({ queryKey: upcomingSessionsQueryKey });
            void queryClient.invalidateQueries({ queryKey: allSessionsQueryKey });
            if (sessionId) {
              void queryClient.invalidateQueries({ queryKey: sessionDetailQueryKey(sessionId) });
            }
          });

      } catch (e) {
        console.warn("useSessionRealtime connection failed", e);
      }
    };

    setup();

    return () => {
      active = false;
      unsubscribeFns.forEach(unsub => unsub());
      releaseConnection('sessions');
    };
  }, [accessToken, sessionId, queryClient, invalidateCore]);
}

export default useSessionRealtime;

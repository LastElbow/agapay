import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getSharedConnection, releaseConnection, subscribeToEvent } from '@/src/services/signalrManager';
import { getTokens } from '@/src/auth/session';
import { MY_COLLEAGUES_QUERY_KEY, COLLEAGUE_REQUESTS_QUERY_KEY, THERAPISTS_QUERY_KEY } from '@/src/services/therapists';

/**
 * Hook to set up real-time SignalR updates for colleague network changes.
 * Listens for ColleagueRequestUpdated events and invalidates relevant queries.
 */
export default function useColleaguesRealtime() {
    const queryClient = useQueryClient();
    const connectionSetupRef = useRef(false);

    useEffect(() => {
        let cleanup: (() => void) | null = null;

        const setupColleaguesHub = async () => {
            // Prevent duplicate setup
            if (connectionSetupRef.current) return;
            connectionSetupRef.current = true;

            try {
                const tokens = await getTokens();
                if (!tokens?.accessToken) {
                    console.warn('[ColleaguesHub] No access token available');
                    return;
                }

                // Get shared connection to colleagues hub
                const connection = await getSharedConnection('colleagues', tokens.accessToken);

                // Subscribe to colleague request updates
                const unsubscribe = subscribeToEvent('colleagues', 'ColleagueRequestUpdated', (payload: any) => {
                    console.log('[ColleaguesHub] Received update:', payload);

                    // Invalidate colleagues list, requests list, and therapists list
                    // This ensures the "Add Colleagues" tab updates when requests are declined
                    queryClient.invalidateQueries({ queryKey: MY_COLLEAGUES_QUERY_KEY });
                    queryClient.invalidateQueries({ queryKey: COLLEAGUE_REQUESTS_QUERY_KEY });
                    queryClient.invalidateQueries({ queryKey: THERAPISTS_QUERY_KEY });
                });

                cleanup = () => {
                    unsubscribe();
                    releaseConnection('colleagues');
                };
            } catch (error) {
                console.error('[ColleaguesHub] Failed to setup:', error);
                connectionSetupRef.current = false;
            }
        };

        setupColleaguesHub();

        return () => {
            if (cleanup) {
                cleanup();
            }
            connectionSetupRef.current = false;
        };
    }, [queryClient]);
}

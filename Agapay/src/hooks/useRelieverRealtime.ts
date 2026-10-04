import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getSharedConnection, releaseConnection, subscribeToEvent } from '@/src/services/signalrManager';
import { getTokens } from '@/src/auth/session';
import { upcomingSessionsQueryKey } from '@/src/services/sessions';

/**
 * Hook to set up real-time SignalR updates for reliever proposals.
 * Listens for reliever-related events on the sessions hub:
 * - RelieverProposed: When you're proposed as a reliever
 * - RelieverAccepted: When you accept a reliever request (updates original therapist)
 * - RelieverDeclined: When patient declines or you decline
 * - RelieverApproved: When patient approves and you're confirmed as the session therapist
 */
export default function useRelieverRealtime() {
    const queryClient = useQueryClient();
    const connectionSetupRef = useRef(false);

    useEffect(() => {
        let cleanupFunctions: (() => void)[] = [];

        const setupHub = async () => {
            // Prevent duplicate setup
            if (connectionSetupRef.current) return;
            connectionSetupRef.current = true;

            try {
                const tokens = await getTokens();
                if (!tokens?.accessToken) {
                    console.warn('[RelieverRealtime] No access token available');
                    return;
                }

                console.log('[RelieverRealtime] Setting up connection...');

                // Get shared connection to sessions hub
                await getSharedConnection('sessions', tokens.accessToken);
                console.log('[RelieverRealtime] Connection established');

                // Subscribe to RelieverProposed event - when you're proposed as a reliever
                const unsubscribeProposed = subscribeToEvent('sessions', 'RelieverProposed', (payload: any) => {
                    console.log('[RelieverRealtime] 🔔 New reliever proposal received!', payload);
                    // Invalidate reliever proposals query to show the new request
                    queryClient.invalidateQueries({ queryKey: ["reliever-proposals"] });
                });
                cleanupFunctions.push(unsubscribeProposed);

                // Subscribe to RelieverAccepted event - confirmation after accepting
                const unsubscribeAccepted = subscribeToEvent('sessions', 'RelieverAccepted', (payload: any) => {
                    console.log('[RelieverRealtime] ✅ Reliever accepted confirmation:', payload);
                    // Refresh reliever proposals list (remove accepted item)
                    queryClient.invalidateQueries({ queryKey: ["reliever-proposals"] });
                });
                cleanupFunctions.push(unsubscribeAccepted);

                // Subscribe to RelieverApproved event - when patient approves and you're confirmed
                const unsubscribeApproved = subscribeToEvent('sessions', 'RelieverApproved', (payload: any) => {
                    console.log('[RelieverRealtime] 🎉 Patient approved! You are assigned to session:', payload);
                    // Refresh upcoming sessions (new session assigned to you)
                    queryClient.invalidateQueries({ queryKey: upcomingSessionsQueryKey });
                    // Also refresh reliever proposals (remove from pending list)
                    queryClient.invalidateQueries({ queryKey: ["reliever-proposals"] });
                });
                cleanupFunctions.push(unsubscribeApproved);

                // Subscribe to RelieverDeclined event - when patient declines the proposal
                const unsubscribeDeclined = subscribeToEvent('sessions', 'RelieverDeclined', (payload: any) => {
                    console.log('[RelieverRealtime] ❌ Reliever request declined/cancelled:', payload);
                    // Refresh reliever proposals list (remove declined item)
                    queryClient.invalidateQueries({ queryKey: ["reliever-proposals"] });
                });
                cleanupFunctions.push(unsubscribeDeclined);

                console.log('[RelieverRealtime] All event listeners registered');

            } catch (error) {
                console.error('[RelieverRealtime] Failed to setup:', error);
                connectionSetupRef.current = false;
            }
        };

        setupHub();

        return () => {
            console.log('[RelieverRealtime] Cleaning up...');
            cleanupFunctions.forEach(cleanup => cleanup());
            releaseConnection('sessions');
            connectionSetupRef.current = false;
        };
    }, [queryClient]);
}

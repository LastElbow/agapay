/**
 * Server Time Synchronization Utility
 * 
 * This module provides synchronized time between client and server to ensure
 * that session timers display the same elapsed time on both patient and therapist sides.
 * 
 * The approach:
 * 1. Fetch server time and measure round-trip latency
 * 2. Calculate offset = serverTime - clientTime (accounting for latency)
 * 3. Use getSyncedNow() instead of Date.now() for timer calculations
 */

import apiClient from '@/api/client';

// Time offset between client and server (in milliseconds)
// Positive means server is ahead, negative means client is ahead
let serverTimeOffset: number = 0;
let lastSyncTime: number = 0;
let isSyncing: boolean = false;
let syncPromise: Promise<void> | null = null;

// How often to re-sync (5 minutes)
const SYNC_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Syncs the client clock with the server clock.
 * Uses round-trip time to estimate one-way latency.
 */
export async function syncServerTime(): Promise<void> {
    // Prevent concurrent syncs
    if (isSyncing && syncPromise) {
        return syncPromise;
    }

    isSyncing = true;
    syncPromise = (async () => {
        try {
            const clientSendTime = Date.now();
            const response = await apiClient.get('/api/sessions/server-time');
            const clientReceiveTime = Date.now();

            const serverTimeMs = response?.data?.serverTimeMs;
            if (!Number.isFinite(serverTimeMs)) {
                console.warn('Invalid server time response');
                return;
            }

            // Round-trip time
            const rtt = clientReceiveTime - clientSendTime;
            // Estimate one-way latency as half of RTT
            const oneWayLatency = rtt / 2;

            // Server time at the moment we received the response
            // (server time + time elapsed since server sent it)
            const estimatedServerTimeNow = serverTimeMs + oneWayLatency;

            // Calculate offset: how much to add to client time to get server time
            serverTimeOffset = estimatedServerTimeNow - clientReceiveTime;
            lastSyncTime = Date.now();

            console.log(`⏱️ Time sync complete: offset=${serverTimeOffset}ms, RTT=${rtt}ms`);
        } catch (error) {
            console.warn('Failed to sync server time:', error);
            // Keep using previous offset or 0
        } finally {
            isSyncing = false;
            syncPromise = null;
        }
    })();

    return syncPromise;
}

/**
 * Returns the current time synchronized with the server.
 * Use this instead of Date.now() for timer calculations.
 */
export function getSyncedNow(): number {
    // Trigger background sync if stale
    if (Date.now() - lastSyncTime > SYNC_INTERVAL_MS) {
        syncServerTime().catch(() => { });
    }

    return Date.now() + serverTimeOffset;
}

/**
 * Calculates elapsed seconds from a start timestamp using synced time.
 * @param startAtMs - The start time in Unix milliseconds
 * @returns Elapsed seconds (always >= 0)
 */
export function getElapsedSeconds(startAtMs: number): number {
    const now = getSyncedNow();
    return Math.max(0, Math.floor((now - startAtMs) / 1000));
}

/**
 * Returns the current server time offset in milliseconds.
 * Positive means server is ahead, negative means client is ahead.
 */
export function getServerTimeOffset(): number {
    return serverTimeOffset;
}

/**
 * Checks if time has been synced at least once.
 */
export function isTimeSynced(): boolean {
    return lastSyncTime > 0;
}

/**
 * Forces an immediate time sync.
 */
export async function forceTimeSync(): Promise<void> {
    lastSyncTime = 0; // Reset to force sync
    return syncServerTime();
}

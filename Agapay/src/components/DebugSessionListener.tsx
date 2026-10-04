import { useEffect, useRef } from "react";
import { HubConnection, HubConnectionBuilder, HttpTransportType, HubConnectionState, LogLevel } from "@microsoft/signalr";
import apiClient from "@/api/client";
import { useAuth } from "@/src/providers/AuthProvider";
import { useQueryClient } from "@tanstack/react-query";
import { upcomingSessionsQueryKey, allSessionsQueryKey } from "@/src/services/sessions";
import { useDebugLog } from "@/src/providers/DebugLogProvider";

/**
 * Global session event listener for debug logging.
 * Captures automated session lifecycle events like:
 * - Session auto-started (timer)
 * - Session auto-marked DoneForToday
 * - Sessions refresh (5 AM daily reset)
 * - Upcoming sessions filter changes
 */
export default function DebugSessionListener() {
    // DISABLED: This listener creates an extra SignalR connection that causes 429 rate limiting.
    // Uncomment the code below when you need to debug session events.
    // The debug log panel will still work for manually logged events.
    return null;

    /* DISABLED FOR PERFORMANCE - Uncomment to enable debug logging
    const { accessToken } = useAuth();
    const queryClient = useQueryClient();
    const { addLog } = useDebugLog();
    const connectionRef = useRef<HubConnection | null>(null);
    
    useEffect(() => {
        let cancelled = false;
    
        const establish = async () => {
            if (!accessToken) return;
    
            // Clean up existing connection
            if (connectionRef.current) {
                try {
                    connectionRef.current.stop().catch(() => { });
                } catch { }
                connectionRef.current = null;
            }
    
            const baseURL = (apiClient.defaults.baseURL ?? "").replace(/\/+$/, "");
            if (!baseURL) return;
            const hubBase = baseURL.replace(/\/api$/i, "");
    
            const conn = new HubConnectionBuilder()
                .withUrl(`${hubBase}/hubs/sessions`, {
                    accessTokenFactory: () => accessToken || "",
                    transport: HttpTransportType.WebSockets,
                    skipNegotiation: true,
                })
                .withAutomaticReconnect()
                .configureLogging(LogLevel.Warning)
                .build();
    
            // ⏱️ Timer Started - Session has begun
            conn.on("SessionStarted", (p: any) => {
                const sessionId = Number(p?.sessionId);
                const startAtMs = p?.startAtMs;
                const isAutoStart = p?.autoStart === true;
    
                addLog({
                    level: "timer",
                    category: "timer-start",
                    message: isAutoStart
                        ? "Timer auto-started (scheduled time reached)"
                        : "Timer started manually",
                    details: startAtMs
                        ? `Start time: ${new Date(startAtMs).toLocaleTimeString()}`
                        : undefined,
                    sessionId: Number.isFinite(sessionId) ? sessionId : undefined,
                });
            });
    
            // ⏱️ Timer Stopped / Session Marked Done
            conn.on("SessionMarkedDone", (p: any) => {
                const sessionId = Number(p?.sessionId);
                const isAutoComplete = p?.autoComplete === true;
    
                addLog({
                    level: isAutoComplete ? "system" : "timer",
                    category: isAutoComplete ? "auto-done" : "timer-stop",
                    message: isAutoComplete
                        ? "Session auto-marked as 'DoneForToday' (end time reached)"
                        : "Session marked as 'DoneForToday'",
                    details: isAutoComplete
                        ? "Backend automatically transitioned session status"
                        : "Therapist ended the session",
                    sessionId: Number.isFinite(sessionId) ? sessionId : undefined,
                });
            });
    
            // 🔄 Sessions Refresh (5 AM Daily Reset)
            conn.on("SessionsRefresh", (p: any) => {
                const count = p?.count || p?.sessionCount;
                const reason = p?.reason || "daily_reset";
    
                addLog({
                    level: "system",
                    category: "auto-reset",
                    message: reason === "daily_reset"
                        ? "Daily session reset completed (5:00 AM)"
                        : "Sessions refreshed by system",
                    details: count
                        ? `${count} session(s) reset to 'Scheduled' status`
                        : "Session dates and statuses have been reset",
                });
    
                // Invalidate session lists to reflect changes
                void queryClient.invalidateQueries({ queryKey: upcomingSessionsQueryKey });
                void queryClient.invalidateQueries({ queryKey: allSessionsQueryKey });
            });
    
            // 📤 Session Removed from Upcoming (implicit - we track via query changes)
            // This is handled by observing session list changes
    
            // Other SignalR events for comprehensive logging
            conn.on("SessionCancelled", (p: any) => {
                const sessionId = Number(p?.sessionId);
                addLog({
                    level: "warning",
                    category: "session-action",
                    message: "Session cancelled",
                    sessionId: Number.isFinite(sessionId) ? sessionId : undefined,
                });
            });
    
            conn.on("SessionRescheduled", (p: any) => {
                const sessionId = Number(p?.sessionId);
                addLog({
                    level: "info",
                    category: "session-action",
                    message: "Session rescheduled",
                    sessionId: Number.isFinite(sessionId) ? sessionId : undefined,
                });
            });
    
            conn.on("RescheduleProposed", (p: any) => {
                const sessionId = Number(p?.sessionId);
                addLog({
                    level: "info",
                    category: "session-action",
                    message: "Reschedule proposal sent",
                    sessionId: Number.isFinite(sessionId) ? sessionId : undefined,
                });
            });
    
            conn.on("SessionLogAdded", (p: any) => {
                const sessionId = Number(p?.sessionId);
                addLog({
                    level: "success",
                    category: "session-action",
                    message: "Session log created",
                    sessionId: Number.isFinite(sessionId) ? sessionId : undefined,
                });
            });
    
            // Connection state logging
            conn.onreconnecting(() => {
                addLog({
                    level: "warning",
                    category: "signalr",
                    message: "SignalR connection lost, reconnecting...",
                });
            });
    
            conn.onreconnected(() => {
                addLog({
                    level: "success",
                    category: "signalr",
                    message: "SignalR connection restored",
                });
            });
    
            try {
                await conn.start();
                if (cancelled) {
                    await conn.stop().catch(() => { });
                    return;
                }
                connectionRef.current = conn;
    
                addLog({
                    level: "success",
                    category: "signalr",
                    message: "Debug listener connected to SignalR hub",
                });
            } catch (e) {
                addLog({
                    level: "error",
                    category: "signalr",
                    message: "Failed to connect to SignalR hub",
                    details: String(e),
                });
            }
        };
    
        establish();
    
        return () => {
            cancelled = true;
            const conn = connectionRef.current;
            connectionRef.current = null;
            if (conn && conn.state !== HubConnectionState.Disconnected) {
                conn.stop().catch(() => { });
            }
        };
    }, [accessToken, addLog, queryClient]);
    
    // This component doesn't render anything, it's just a listener
    return null;
    END OF DISABLED CODE */
}

import { HubConnection, HubConnectionBuilder, HttpTransportType, HubConnectionState, LogLevel } from "@microsoft/signalr";
import apiClient from "@/api/client";
import { getTokens } from "@/src/auth/session";

/**
 * Centralized SignalR connection manager.
 * Prevents multiple connections to the same hub by sharing connections across components.
 * This significantly reduces API calls and prevents 429 Too Many Requests errors.
 */

type HubName = 'sessions' | 'chat' | 'contracts' | 'ratings' | 'colleagues' | 'location' | 'notifications';

interface ManagedConnection {
  connection: HubConnection;
  refCount: number;
  listeners: Map<string, Set<(payload: any) => void>>;
}

const connections = new Map<HubName, ManagedConnection>();
const pendingConnections = new Map<HubName, Promise<HubConnection>>();

function getHubUrl(hubName: HubName): string {
  const baseURL = (apiClient.defaults.baseURL ?? '').replace(/\/+$/, '');
  const hubBase = baseURL.replace(/\/api$/i, '');

  // Location hub has a different path convention
  if (hubName === 'location') {
    return `${hubBase}/locationhub`;
  }

  return `${hubBase}/hubs/${hubName}`;
}

/**
 * Get or create a shared SignalR connection for the specified hub.
 * Connections are reference-counted and only closed when all consumers release them.
 */
export async function getSharedConnection(
  hubName: HubName,
  accessToken: string
): Promise<HubConnection> {
  // If we already have an active connection, increment ref count and return it
  const existing = connections.get(hubName);
  if (existing && existing.connection.state === HubConnectionState.Connected) {
    existing.refCount++;
    return existing.connection;
  }

  // If there's a pending connection attempt, wait for it
  const pending = pendingConnections.get(hubName);
  if (pending) {
    const conn = await pending;
    const managed = connections.get(hubName);
    if (managed) {
      managed.refCount++;
    }
    return conn;
  }

  // Create a new connection
  const connectionPromise = (async () => {
    const conn = new HubConnectionBuilder()
      .withUrl(getHubUrl(hubName), {
        accessTokenFactory: () => {
          // Use the latest token from session state to ensure reconnections succeed
          // even if the original token passed to this function has expired.
          const { accessToken: currentToken } = getTokens();
          return currentToken || accessToken || '';
        },
        transport: HttpTransportType.WebSockets,
        skipNegotiation: true,
      })
      .withAutomaticReconnect({
        nextRetryDelayInMilliseconds: (retryContext) => {
          // Exponential backoff: 1s, 2s, 5s, 10s, max 30s
          const delays = [1000, 2000, 5000, 10000, 30000];
          return delays[Math.min(retryContext.previousRetryCount, delays.length - 1)];
        }
      })
      .configureLogging(LogLevel.Warning)
      .build();

    await conn.start();

    connections.set(hubName, {
      connection: conn,
      refCount: 1,
      listeners: new Map(),
    });

    return conn;
  })();

  pendingConnections.set(hubName, connectionPromise);

  try {
    const conn = await connectionPromise;
    pendingConnections.delete(hubName);
    return conn;
  } catch (error) {
    pendingConnections.delete(hubName);
    throw error;
  }
}

/**
 * Release a reference to a shared connection.
 * The connection is only closed when all references are released.
 */
export function releaseConnection(hubName: HubName): void {
  const managed = connections.get(hubName);
  if (!managed) return;

  managed.refCount--;
  if (managed.refCount <= 0) {
    // No more consumers, close the connection
    managed.connection.stop().catch(() => { });
    connections.delete(hubName);
  }
}

/**
 * Subscribe to a SignalR event on a shared connection.
 * Returns an unsubscribe function.
 */
export function subscribeToEvent(
  hubName: HubName,
  eventName: string,
  callback: (payload: any) => void
): () => void {
  const managed = connections.get(hubName);
  if (!managed) {
    console.warn(`No active connection for hub: ${hubName}`);
    return () => { };
  }

  // Track listeners to avoid duplicate registrations
  if (!managed.listeners.has(eventName)) {
    managed.listeners.set(eventName, new Set());
    // Register the master handler that dispatches to all subscribers
    managed.connection.on(eventName, (payload: any) => {
      const callbacks = managed.listeners.get(eventName);
      if (callbacks) {
        callbacks.forEach(cb => {
          try {
            cb(payload);
          } catch (err) {
            console.error(`Error in ${eventName} handler:`, err);
          }
        });
      }
    });
  }

  managed.listeners.get(eventName)!.add(callback);

  // Return unsubscribe function
  return () => {
    const callbacks = managed.listeners.get(eventName);
    if (callbacks) {
      callbacks.delete(callback);
    }
  };
}

/**
 * Get the current state of a hub connection.
 */
export function getConnectionState(hubName: HubName): HubConnectionState | null {
  const managed = connections.get(hubName);
  return managed?.connection.state ?? null;
}

/**
 * Check if a hub is currently connected.
 */
export function isConnected(hubName: HubName): boolean {
  return getConnectionState(hubName) === HubConnectionState.Connected;
}

/**
 * Force close all connections (useful for logout).
 */
export async function closeAllConnections(): Promise<void> {
  const closePromises: Promise<void>[] = [];

  connections.forEach((managed, hubName) => {
    closePromises.push(
      managed.connection.stop().catch(() => { })
    );
    connections.delete(hubName);
  });

  await Promise.all(closePromises);
}

export default {
  getSharedConnection,
  releaseConnection,
  subscribeToEvent,
  getConnectionState,
  isConnected,
  closeAllConnections,
};

export type RealtimeUnsubscribe = () => void;

export interface RealtimePort {
  ensureConnected(channel: string, accessToken: string): Promise<void>;
  release(channel: string): void;
  subscribe(channel: string, eventName: string, handler: (payload: any) => void): RealtimeUnsubscribe;
}

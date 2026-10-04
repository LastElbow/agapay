/**
 * Global Error Emitter
 *
 * This module allows non-React code (like the API client) to trigger global
 * error notifications that the NetworkProvider can display.
 *
 * Usage from API client:
 *   import { emitGlobalError } from '@/src/utils/globalErrorEmitter';
 *   emitGlobalError({ title: '...', message: '...', variant: 'error' });
 *
 * The NetworkProvider subscribes to these events and shows the modal.
 */

export type GlobalErrorPayload = {
  title: string;
  message: string;
  variant?: 'info' | 'warning' | 'error';
  confirmText?: string;
  /** If true, this error should NOT be displayed (e.g., 401 handled silently) */
  silent?: boolean;
};

type ErrorListener = (payload: GlobalErrorPayload) => void;

let listener: ErrorListener | null = null;

/**
 * Register a listener (called by NetworkProvider on mount).
 */
export function subscribeToGlobalErrors(cb: ErrorListener): () => void {
  listener = cb;
  return () => {
    if (listener === cb) listener = null;
  };
}

/**
 * Emit a global error (called by API client or any non-React code).
 */
export function emitGlobalError(payload: GlobalErrorPayload): void {
  if (payload.silent) return;
  if (listener) {
    listener(payload);
  } else {
    // Fallback: log to console if no listener is registered yet
    console.warn('[GlobalErrorEmitter] No listener registered. Error:', payload);
  }
}

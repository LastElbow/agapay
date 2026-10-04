import React, { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { Platform } from 'react-native';
import InAppModal from '@/src/components/InAppModal';
import { subscribeToGlobalErrors, GlobalErrorPayload } from '@/src/utils/globalErrorEmitter';
import { useNetworkConnection } from '@/src/hooks/useNetworkConnection';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
type ErrorModalPayload = {
  title: string;
  message: string;
  variant?: 'info' | 'warning' | 'error';
  confirmText?: string;
  onConfirm?: () => void;
};

type NetworkContextValue = {
  isConnected: boolean | null;
  /** Show a global error modal imperatively */
  showError: (payload: ErrorModalPayload) => void;
  /** Dismiss the currently visible error modal */
  dismissError: () => void;
};

const NetworkContext = createContext<NetworkContextValue | undefined>(undefined);

// ─────────────────────────────────────────────────────────────────────────────
// Provider
// ─────────────────────────────────────────────────────────────────────────────

export function NetworkProvider({ children }: { children: ReactNode }) {
  const isConnected = useNetworkConnection();
  const [wasOffline, setWasOffline] = useState(false);
  const [errorModal, setErrorModal] = useState<ErrorModalPayload | null>(null);

  // Monitor connection state changes to show/hide offline modal
  useEffect(() => {
    // Skip initial null state
    if (isConnected === null) return;

    if (!isConnected && !wasOffline) {
      // Just went offline
      setWasOffline(true);
      setErrorModal({
        title: 'No Internet Connection',
        message: 'Please check your network settings and try again.',
        variant: 'warning',
        confirmText: 'OK',
      });
    } else if (isConnected && wasOffline) {
      // Just came back online
      setWasOffline(false);
      setErrorModal((prev) =>
        prev?.title === 'No Internet Connection' ? null : prev
      );
    }
  }, [isConnected, wasOffline]);

  // Subscribe to global errors from non-React code (API client)
  useEffect(() => {
    const unsubscribe = subscribeToGlobalErrors((payload: GlobalErrorPayload) => {
      setErrorModal({
        title: payload.title,
        message: payload.message,
        variant: payload.variant ?? 'error',
        confirmText: payload.confirmText ?? 'OK',
      });
    });
    return unsubscribe;
  }, []);

  const showError = useCallback((payload: ErrorModalPayload) => {
    setErrorModal(payload);
  }, []);

  const dismissError = useCallback(() => {
    setErrorModal(null);
  }, []);

  const handleConfirm = useCallback(() => {
    if (errorModal?.onConfirm) {
      errorModal.onConfirm();
    }
    setErrorModal(null);
  }, [errorModal]);

  return (
    <NetworkContext.Provider value={{ isConnected, showError, dismissError }}>
      {children}
      <InAppModal
        visible={!!errorModal}
        title={errorModal?.title}
        message={errorModal?.message}
        variant={errorModal?.variant ?? 'error'}
        confirmText={errorModal?.confirmText ?? 'OK'}
        onConfirm={handleConfirm}
        onCancel={dismissError}
        showCancel={false}
      />
    </NetworkContext.Provider>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────────────────
export function useNetwork(): NetworkContextValue {
  const context = useContext(NetworkContext);
  if (!context) {
    throw new Error('useNetwork must be used within a NetworkProvider');
  }
  return context;
}

export default NetworkProvider;

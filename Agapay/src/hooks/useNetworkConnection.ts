import { useEffect, useState } from 'react';

export function useNetworkConnection() {
    // On web, initial state comes from navigator.onLine
    // SSR safety: check if navigator exists
    const isBrowser = typeof navigator !== 'undefined';
    const [isConnected, setIsConnected] = useState<boolean | null>(
        isBrowser ? navigator.onLine : true
    );

    useEffect(() => {
        if (!isBrowser) return;

        const handleOnline = () => setIsConnected(true);
        const handleOffline = () => setIsConnected(false);

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, [isBrowser]);

    return isConnected;
}

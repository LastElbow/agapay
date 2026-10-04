import { useEffect, useState } from 'react';

export function useNetworkConnection() {
    const [isConnected, setIsConnected] = useState<boolean | null>(true);

    useEffect(() => {
        // Deferred require to avoid circular-dependency / stack-overflow
        // during native bundling with @react-native-community/netinfo v11
        // and Expo SDK 54 / React Native 0.81.
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const NetInfo = require('@react-native-community/netinfo').default;

        // Initial fetch
        NetInfo.fetch().then((state: any) => {
            setIsConnected(state.isConnected ?? false);
        });

        // Subscribe to network state updates
        const unsubscribe = NetInfo.addEventListener((state: any) => {
            setIsConnected(state.isConnected ?? false);
        });

        return () => {
            unsubscribe();
        };
    }, []);

    return isConnected;
}

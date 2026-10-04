import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';

export type LogLevel = 'info' | 'success' | 'warning' | 'error' | 'timer' | 'system';

export interface DebugLogEntry {
    id: string;
    timestamp: Date;
    level: LogLevel;
    category: string;
    message: string;
    details?: string;
    sessionId?: number;
}

interface DebugLogContextType {
    logs: DebugLogEntry[];
    addLog: (entry: Omit<DebugLogEntry, 'id' | 'timestamp'>) => void;
    clearLogs: () => void;
    isEnabled: boolean;
    toggleEnabled: () => void;
}

const DebugLogContext = createContext<DebugLogContextType | undefined>(undefined);

export function DebugLogProvider({ children }: { children: ReactNode }) {
    const [logs, setLogs] = useState<DebugLogEntry[]>([]);
    const [isEnabled, setIsEnabled] = useState(true);

    const addLog = useCallback((entry: Omit<DebugLogEntry, 'id' | 'timestamp'>) => {
        if (!isEnabled) return;

        const newEntry: DebugLogEntry = {
            ...entry,
            id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            timestamp: new Date(),
        };

        setLogs(prev => [newEntry, ...prev].slice(0, 100)); // Keep last 100 logs

        // Also log to console for development
        const emoji = {
            info: 'ℹ️',
            success: '✅',
            warning: '⚠️',
            error: '❌',
            timer: '⏱️',
            system: '🔧',
        }[entry.level];

        console.log(`${emoji} [DebugLog] ${entry.category}: ${entry.message}`, entry.details || '');
    }, [isEnabled]);

    const clearLogs = useCallback(() => {
        setLogs([]);
    }, []);

    const toggleEnabled = useCallback(() => {
        setIsEnabled(prev => !prev);
    }, []);

    return (
        <DebugLogContext.Provider value={{ logs, addLog, clearLogs, isEnabled, toggleEnabled }}>
            {children}
        </DebugLogContext.Provider>
    );
}

export function useDebugLog() {
    const context = useContext(DebugLogContext);
    if (!context) {
        // Return a no-op version if not wrapped in provider
        return {
            logs: [],
            addLog: () => { },
            clearLogs: () => { },
            isEnabled: false,
            toggleEnabled: () => { },
        };
    }
    return context;
}

export default DebugLogProvider;

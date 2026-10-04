import React, { useState } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    ScrollView,
    Modal,
    Platform,
    StyleSheet,
} from 'react-native';
import { FileText, X, Trash2 } from 'lucide-react-native';
import { useDebugLog, DebugLogEntry, LogLevel } from '@/src/providers/DebugLogProvider';

const levelColors: Record<LogLevel, { bg: string; text: string; icon: string }> = {
    info: { bg: '#DBEAFE', text: '#1E40AF', icon: 'ℹ️' },
    success: { bg: '#D1FAE5', text: '#065F46', icon: '✅' },
    warning: { bg: '#FEF3C7', text: '#92400E', icon: '⚠️' },
    error: { bg: '#FEE2E2', text: '#991B1B', icon: '❌' },
    timer: { bg: '#E0E7FF', text: '#3730A3', icon: '⏱️' },
    system: { bg: '#F3E8FF', text: '#6B21A8', icon: '🔧' },
};

const categoryLabels: Record<string, string> = {
    'timer-start': '⏱️ Timer Started',
    'timer-stop': '⏱️ Timer Stopped',
    'auto-done': '🔄 Auto DoneForToday',
    'auto-reset': '🔄 Daily Reset (5 AM)',
    'upcoming-removed': '📤 Removed from Upcoming',
    'signalr': '📡 SignalR Event',
    'session-action': '👤 Therapist Action',
};

function formatTime(date: Date): string {
    return date.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
    });
}

function LogEntry({ entry }: { entry: DebugLogEntry }) {
    const colors = levelColors[entry.level];
    const categoryLabel = categoryLabels[entry.category] || entry.category;

    return (
        <View style={[styles.logEntry, { backgroundColor: colors.bg }]}>
            <View style={styles.logHeader}>
                <Text style={[styles.logTime, { color: colors.text }]}>
                    {formatTime(entry.timestamp)}
                </Text>
                <Text style={[styles.logCategory, { color: colors.text }]}>
                    {categoryLabel}
                </Text>
            </View>
            <Text style={[styles.logMessage, { color: colors.text }]}>
                {entry.message}
            </Text>
            {entry.details && (
                <Text style={[styles.logDetails, { color: colors.text }]}>
                    {entry.details}
                </Text>
            )}
            {entry.sessionId && (
                <Text style={[styles.logSessionId, { color: colors.text }]}>
                    Session #{entry.sessionId}
                </Text>
            )}
        </View>
    );
}

export default function DebugLogPanel() {
    const [isOpen, setIsOpen] = useState(false);
    const { logs, clearLogs, isEnabled, toggleEnabled } = useDebugLog();

    const unreadCount = logs.length;

    return (
        <>
            {/* Debug Log Button */}
            <TouchableOpacity
                onPress={() => setIsOpen(true)}
                style={styles.headerButton}
                activeOpacity={0.7}
            >
                <FileText size={20} color="#6B7280" />
                {unreadCount > 0 && (
                    <View style={styles.badge}>
                        <Text style={styles.badgeText}>
                            {unreadCount > 99 ? '99+' : unreadCount}
                        </Text>
                    </View>
                )}
            </TouchableOpacity>

            {/* Log Panel Modal */}
            <Modal
                visible={isOpen}
                transparent
                animationType="fade"
                onRequestClose={() => setIsOpen(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        {/* Header */}
                        <View style={styles.modalHeader}>
                            <View style={styles.headerLeft}>
                                <Text style={styles.modalTitle}>🔧 Debug Activity Log</Text>
                                <Text style={styles.modalSubtitle}>
                                    {logs.length} entries • {isEnabled ? 'Active' : 'Paused'}
                                </Text>
                            </View>
                            <View style={styles.headerActions}>
                                <TouchableOpacity
                                    onPress={toggleEnabled}
                                    style={[
                                        styles.actionButton,
                                        { backgroundColor: isEnabled ? '#D1FAE5' : '#FEE2E2' },
                                    ]}
                                >
                                    <Text style={{ color: isEnabled ? '#065F46' : '#991B1B', fontSize: 12 }}>
                                        {isEnabled ? 'Logging ON' : 'Logging OFF'}
                                    </Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    onPress={clearLogs}
                                    style={[styles.actionButton, { backgroundColor: '#F3F4F6' }]}
                                >
                                    <Trash2 size={16} color="#6B7280" />
                                </TouchableOpacity>
                                <TouchableOpacity
                                    onPress={() => setIsOpen(false)}
                                    style={[styles.actionButton, { backgroundColor: '#F3F4F6' }]}
                                >
                                    <X size={16} color="#6B7280" />
                                </TouchableOpacity>
                            </View>
                        </View>

                        {/* Legend */}
                        <View style={styles.legend}>
                            <Text style={styles.legendTitle}>Priority Events:</Text>
                            <View style={styles.legendItems}>
                                <View style={styles.legendItem}>
                                    <View style={[styles.legendDot, { backgroundColor: '#E0E7FF' }]} />
                                    <Text style={styles.legendText}>Timer</Text>
                                </View>
                                <View style={styles.legendItem}>
                                    <View style={[styles.legendDot, { backgroundColor: '#F3E8FF' }]} />
                                    <Text style={styles.legendText}>System</Text>
                                </View>
                                <View style={styles.legendItem}>
                                    <View style={[styles.legendDot, { backgroundColor: '#D1FAE5' }]} />
                                    <Text style={styles.legendText}>Success</Text>
                                </View>
                            </View>
                        </View>

                        {/* Logs List */}
                        <ScrollView style={styles.logsList} showsVerticalScrollIndicator>
                            {logs.length === 0 ? (
                                <View style={styles.emptyState}>
                                    <Text style={styles.emptyIcon}>📋</Text>
                                    <Text style={styles.emptyTitle}>No logs yet</Text>
                                    <Text style={styles.emptyText}>
                                        Activity logs will appear here as events occur.
                                    </Text>
                                    <Text style={styles.emptyHint}>
                                        Watching for: Timer events, auto-transitions, SignalR events
                                    </Text>
                                </View>
                            ) : (
                                logs.map((entry) => <LogEntry key={entry.id} entry={entry} />)
                            )}
                        </ScrollView>
                    </View>
                </View>
            </Modal>
        </>
    );
}

const styles = StyleSheet.create({
    headerButton: {
        position: 'relative',
        padding: 8,
        marginRight: 4,
    },
    badge: {
        position: 'absolute',
        top: 2,
        right: 2,
        backgroundColor: '#EF4444',
        borderRadius: 10,
        minWidth: 18,
        height: 18,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 4,
    },
    badgeText: {
        color: '#FFFFFF',
        fontSize: 10,
        fontWeight: '600',
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 16,
    },
    modalContent: {
        backgroundColor: '#FFFFFF',
        borderRadius: 12,
        width: '100%',
        maxWidth: 500,
        maxHeight: '80%',
        ...Platform.select({
            web: {
                boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)',
            },
            default: {
                elevation: 8,
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.15,
                shadowRadius: 12,
            },
        }),
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        padding: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#E5E7EB',
    },
    headerLeft: {
        flex: 1,
    },
    modalTitle: {
        fontSize: 16,
        fontWeight: '700',
        color: '#111827',
    },
    modalSubtitle: {
        fontSize: 12,
        color: '#6B7280',
        marginTop: 2,
    },
    headerActions: {
        flexDirection: 'row',
        gap: 8,
    },
    actionButton: {
        padding: 8,
        borderRadius: 6,
    },
    legend: {
        paddingHorizontal: 16,
        paddingVertical: 8,
        backgroundColor: '#F9FAFB',
        borderBottomWidth: 1,
        borderBottomColor: '#E5E7EB',
    },
    legendTitle: {
        fontSize: 11,
        fontWeight: '600',
        color: '#6B7280',
        marginBottom: 4,
    },
    legendItems: {
        flexDirection: 'row',
        gap: 12,
    },
    legendItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    legendDot: {
        width: 10,
        height: 10,
        borderRadius: 5,
    },
    legendText: {
        fontSize: 11,
        color: '#6B7280',
    },
    logsList: {
        flex: 1,
        padding: 12,
    },
    logEntry: {
        padding: 10,
        borderRadius: 8,
        marginBottom: 8,
    },
    logHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 4,
    },
    logTime: {
        fontSize: 11,
        fontWeight: '600',
    },
    logCategory: {
        fontSize: 10,
        fontWeight: '500',
    },
    logMessage: {
        fontSize: 13,
        fontWeight: '500',
    },
    logDetails: {
        fontSize: 11,
        marginTop: 4,
        opacity: 0.8,
    },
    logSessionId: {
        fontSize: 10,
        marginTop: 4,
        fontWeight: '600',
    },
    emptyState: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 40,
    },
    emptyIcon: {
        fontSize: 40,
        marginBottom: 12,
    },
    emptyTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: '#111827',
        marginBottom: 4,
    },
    emptyText: {
        fontSize: 13,
        color: '#6B7280',
        textAlign: 'center',
    },
    emptyHint: {
        fontSize: 11,
        color: '#9CA3AF',
        textAlign: 'center',
        marginTop: 8,
        fontStyle: 'italic',
    },
});

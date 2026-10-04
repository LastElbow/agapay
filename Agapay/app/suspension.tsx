import React, { useEffect, useState } from "react";
import {
    View,
    Text,
    TouchableOpacity,
    Platform,
    useWindowDimensions,
    ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ban, Clock, AlertTriangle, BookOpen, LogOut, RefreshCw } from "lucide-react-native";
import { useAuth } from "@/src/providers/AuthProvider";
import apiClient from "@/api/client";

type SuspensionDetails = {
    reason: string | null;
    suspendedAt: string | null;
    suspendedUntil: string | null;
    isPermanent: boolean;
    warningCount?: number;
};

type SuspensionStatus = {
    accountStatus: string;
    isSuspended: boolean;
    isBanned: boolean;
    isActive: boolean;
    suspensionDetails: SuspensionDetails | null;
};

export default function SuspensionScreen() {
    const router = useRouter();
    const { signOut } = useAuth();
    const { width } = useWindowDimensions();
    const isDesktop = Platform.OS === "web" && width >= 768;

    const [status, setStatus] = useState<SuspensionStatus | null>(null);
    const [loading, setLoading] = useState(true);
    const [checkingStatus, setCheckingStatus] = useState(false);

    const fetchSuspensionStatus = async () => {
        try {
            const res = await apiClient.get('/api/users/suspension-status');
            setStatus(res.data);

            // If user is now active, redirect them back to the app
            if (res.data.isActive) {
                router.replace('/(patient)/' as any);
            }
        } catch (error) {
            console.error('Failed to fetch suspension status:', error);
        } finally {
            setLoading(false);
            setCheckingStatus(false);
        }
    };

    useEffect(() => {
        fetchSuspensionStatus();
    }, []);

    const handleCheckStatus = async () => {
        setCheckingStatus(true);
        await fetchSuspensionStatus();
    };

    const handleLogout = async () => {
        await signOut();
        router.replace('/login' as any);
    };

    const handleViewGuidelines = () => {
        router.push('/community-guidelines' as any);
    };

    const formatDate = (dateString: string | null) => {
        if (!dateString) return 'N/A';
        return new Date(dateString).toLocaleString(undefined, {
            dateStyle: 'medium',
            timeStyle: 'short',
        });
    };

    const getTimeRemaining = (endDate: string | null) => {
        if (!endDate) return null;
        const end = new Date(endDate);
        const now = new Date();
        const diff = end.getTime() - now.getTime();

        if (diff <= 0) return 'Suspension period has ended';

        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

        if (days > 0) return `${days} day${days > 1 ? 's' : ''}, ${hours} hour${hours !== 1 ? 's' : ''} remaining`;
        if (hours > 0) return `${hours} hour${hours !== 1 ? 's' : ''}, ${minutes} minute${minutes !== 1 ? 's' : ''} remaining`;
        return `${minutes} minute${minutes !== 1 ? 's' : ''} remaining`;
    };

    const isBanned = status?.isBanned;
    const details = status?.suspensionDetails;

    if (loading) {
        return (
            <View className="flex-1 bg-gray-100 items-center justify-center">
                <Text className="text-gray-600">Loading...</Text>
            </View>
        );
    }

    return (
        <SafeAreaView className={`flex-1 ${isBanned ? 'bg-red-50' : 'bg-orange-50'}`}>
            <ScrollView
                className="flex-1"
                contentContainerStyle={{
                    flexGrow: 1,
                    paddingHorizontal: isDesktop ? 32 : 16,
                    paddingVertical: 24,
                }}
            >
                <View className={`${isDesktop ? 'max-w-lg mx-auto' : ''} w-full`}>
                    {/* Icon Header */}
                    <View className="items-center mb-6">
                        <View className={`w-24 h-24 rounded-full ${isBanned ? 'bg-red-100' : 'bg-orange-100'} items-center justify-center mb-4`}>
                            {isBanned ? (
                                <Ban color="#DC2626" size={48} />
                            ) : (
                                <Clock color="#EA580C" size={48} />
                            )}
                        </View>
                        <Text className={`text-2xl font-bold ${isBanned ? 'text-red-800' : 'text-orange-800'} text-center`}>
                            {isBanned ? 'Account Banned' : 'Account Suspended'}
                        </Text>
                        <Text className="text-gray-600 text-center mt-2">
                            {isBanned
                                ? 'Your account has been permanently banned from Agapay.'
                                : 'Your account is temporarily suspended from using Agapay.'}
                        </Text>
                    </View>

                    {/* Suspension Details Card */}
                    <View className={`bg-white rounded-2xl p-5 mb-4 border ${isBanned ? 'border-red-200' : 'border-orange-200'} ${Platform.OS === 'web' ? 'shadow-md' : ''}`}>
                        <Text className="text-lg font-semibold text-gray-900 mb-4">
                            {isBanned ? 'Ban Details' : 'Suspension Details'}
                        </Text>

                        {/* Reason */}
                        <View className="mb-4">
                            <View className="flex-row items-center mb-1">
                                <AlertTriangle color="#6B7280" size={16} />
                                <Text className="text-sm text-gray-500 ml-2">Reason</Text>
                            </View>
                            <Text className="text-base text-gray-800 ml-6">
                                {details?.reason || 'Violation of community guidelines'}
                            </Text>
                        </View>

                        {/* Suspended At */}
                        <View className="mb-4">
                            <View className="flex-row items-center mb-1">
                                <Clock color="#6B7280" size={16} />
                                <Text className="text-sm text-gray-500 ml-2">
                                    {isBanned ? 'Banned On' : 'Suspended On'}
                                </Text>
                            </View>
                            <Text className="text-base text-gray-800 ml-6">
                                {formatDate(details?.suspendedAt ?? null)}
                            </Text>
                        </View>

                        {/* Ends At (only for suspensions) */}
                        {!isBanned && details?.suspendedUntil && (
                            <View className="mb-4">
                                <View className="flex-row items-center mb-1">
                                    <Clock color="#6B7280" size={16} />
                                    <Text className="text-sm text-gray-500 ml-2">Ends On</Text>
                                </View>
                                <Text className="text-base text-gray-800 ml-6">
                                    {formatDate(details.suspendedUntil)}
                                </Text>
                            </View>
                        )}

                        {/* Time Remaining */}
                        {!isBanned && details?.suspendedUntil && (
                            <View className={`bg-orange-50 rounded-xl p-4 mt-2`}>
                                <Text className="text-orange-800 font-medium text-center">
                                    ⏳ {getTimeRemaining(details.suspendedUntil)}
                                </Text>
                            </View>
                        )}

                        {/* Permanent Ban Notice */}
                        {isBanned && (
                            <View className="bg-red-50 rounded-xl p-4 mt-2">
                                <Text className="text-red-800 font-medium text-center">
                                    This ban is permanent and cannot be appealed.
                                </Text>
                            </View>
                        )}

                        {/* Warning Count */}
                        {details?.warningCount !== undefined && details.warningCount > 0 && (
                            <View className="bg-yellow-50 rounded-xl p-4 mt-4">
                                <Text className="text-yellow-800 text-sm text-center">
                                    ⚠️ You have received {details.warningCount} warning{details.warningCount > 1 ? 's' : ''} on your account.
                                </Text>
                            </View>
                        )}
                    </View>

                    {/* What This Means */}
                    <View className="bg-white rounded-2xl p-5 mb-4 border border-gray-200">
                        <Text className="text-lg font-semibold text-gray-900 mb-3">
                            What This Means
                        </Text>
                        <View className="space-y-2">
                            <Text className="text-gray-700">• You cannot create new therapy sessions</Text>
                            <Text className="text-gray-700">• You cannot send messages to therapists</Text>
                            <Text className="text-gray-700">• You cannot submit ratings or reviews</Text>
                            <Text className="text-gray-700">• You cannot update your profile</Text>
                            {!isBanned && (
                                <Text className="text-gray-700 mt-2">
                                    Once your suspension ends, you will regain full access to the app.
                                </Text>
                            )}
                        </View>
                    </View>

                    {/* Action Buttons */}
                    <View className="space-y-3">
                        {/* View Guidelines */}
                        <TouchableOpacity
                            className="bg-teal-600 rounded-xl py-4 px-6 flex-row items-center justify-center"
                            onPress={handleViewGuidelines}
                            activeOpacity={0.8}
                        >
                            <BookOpen color="#FFFFFF" size={20} />
                            <Text className="text-white font-semibold text-base ml-2">
                                Review Community Guidelines
                            </Text>
                        </TouchableOpacity>

                        {/* Check Status (only for suspensions) */}
                        {!isBanned && (
                            <TouchableOpacity
                                className="bg-white border border-teal-600 rounded-xl py-4 px-6 flex-row items-center justify-center"
                                onPress={handleCheckStatus}
                                activeOpacity={0.8}
                                disabled={checkingStatus}
                            >
                                <RefreshCw color="#0D9488" size={20} className={checkingStatus ? 'animate-spin' : ''} />
                                <Text className="text-teal-600 font-semibold text-base ml-2">
                                    {checkingStatus ? 'Checking...' : 'Check If Suspension Ended'}
                                </Text>
                            </TouchableOpacity>
                        )}

                        {/* Logout */}
                        <TouchableOpacity
                            className={`${isBanned ? 'bg-red-600' : 'bg-gray-600'} rounded-xl py-4 px-6 flex-row items-center justify-center`}
                            onPress={handleLogout}
                            activeOpacity={0.8}
                        >
                            <LogOut color="#FFFFFF" size={20} />
                            <Text className="text-white font-semibold text-base ml-2">
                                Log Out
                            </Text>
                        </TouchableOpacity>
                    </View>

                    {/* Footer Note */}
                    <Text className="text-center text-gray-500 text-sm mt-6">
                        If you believe this was a mistake, please contact support after reviewing the community guidelines.
                    </Text>
                </View>
            </ScrollView>
        </SafeAreaView>
    );
}

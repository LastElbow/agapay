import { Calendar, Clock, MapPin, ArrowRight } from "lucide-react-native";
import {
  Image,
  ImageSourcePropType,
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  useWindowDimensions,
} from "react-native";
import { toDisplayStatus } from "@/src/utils/statusLabels";

type Props = {
  therapistName: string; // This is the main name displayed (Therapist or Patient)
  role?: string; // This is the subtext (Role or Condition)
  date: string;
  time: string;
  address?: string;
  status?: string;
  avatarSource?: ImageSourcePropType | null;
  statusOverride?: string;
  statusColorHex?: string;
  isRescheduled?: boolean; // Whether the session has been rescheduled
  onPress?: () => void; // Added onPress for the button inside the card if needed, though the card itself is usually touchable
};

function getInitials(name?: string) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function UpcomingSessionCard({
  therapistName,
  role,
  date,
  time,
  address,
  status,
  avatarSource,
  statusOverride,
  statusColorHex,
  isRescheduled,
  onPress,
}: Props) {
  const { width } = useWindowDimensions();
  const isLargeScreen = width >= 768;

  const rawStatusLabel = (statusOverride ?? status)?.trim();
  const normalizedRawStatus = rawStatusLabel?.toLowerCase();
  const normalizedStatus =
    normalizedRawStatus === "terminated" ? "discontinued" : normalizedRawStatus;
  const statusLabel = toDisplayStatus(rawStatusLabel) || rawStatusLabel;

  // Colors based on status - keeping existing logic but can be tweaked
  const derivedColor = normalizedStatus?.startsWith("active")
    ? "#0F766E" // teal-700
    : normalizedStatus === "scheduled"
      ? "#0F766E" // teal-700
      : normalizedStatus === "inprogress" || normalizedStatus === "in progress"
        ? "#3B82F6"
        : normalizedStatus === "donefortoday" ||
          normalizedStatus === "done for today"
          ? "#6B7280"
          : normalizedStatus === "accepted"
            ? "#0F766E"
            : normalizedStatus === "completed"
              ? "#059669"
              : normalizedStatus === "pendingconfirmation" ||
                normalizedStatus === "pending confirmation"
                ? "#F97316"
                : normalizedStatus === "discontinued"
                  ? "#DC2626"
                  : normalizedStatus === "cancelled" || normalizedStatus === "canceled"
                    ? "#EF4444"
                    : "#6B7280";
  const statusColor = statusColorHex ?? derivedColor;

  // Background color for the status badge
  const statusBgColor =
    normalizedStatus?.startsWith("active") ||
      normalizedStatus === "scheduled" ||
      normalizedStatus === "accepted"
      ? "#F0FDFA" // teal-50
      : `${statusColor}1A`; // 10% opacity of the status color

  const StatusBadge = () => {
    if (isRescheduled) {
      return (
        <View className="px-3 py-1 rounded-full bg-amber-50 border border-amber-200">
          <Text className="text-xs font-bold text-amber-700">
            Rescheduled
          </Text>
        </View>
      );
    }
    if (statusLabel) {
      return (
        <View
          className="px-3 py-1 rounded-full border border-teal-100"
          style={{
            backgroundColor: statusBgColor,
            borderColor:
              statusBgColor === "#F0FDFA" ? "#CCFBF1" : "transparent",
          }}
        >
          <Text className="text-xs font-bold" style={{ color: statusColor }}>
            {statusLabel}
          </Text>
        </View>
      );
    }
    return null;
  };

  return (
    <View className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden mb-4">
      {/* Header - Responsive Layout */}
      <View className={`bg-white p-4 border-b border-gray-100 relative ${isLargeScreen ? 'flex-row justify-between items-center flex-wrap gap-3' : ''}`}>
        <View className={`flex-row items-center gap-3 ${isLargeScreen ? 'flex-1' : ''}`}>
          <View className="bg-teal-50 h-11 w-11 items-center justify-center rounded-lg border border-teal-100">
            <Calendar size={20} color="#0D9488" />
          </View>
          <View className="flex-1">
            <Text className="text-xs font-bold uppercase tracking-wider text-teal-700 mb-0.5">
              Next Session
            </Text>
            <View className={`${isLargeScreen ? 'flex-row items-center flex-wrap gap-1' : ''}`}>
              <Text className="font-bold text-gray-900 text-sm">{date}</Text>
              {isLargeScreen && <Text className="text-gray-300">|</Text>}
              <View className="flex-row items-center gap-1">
                <Clock size={14} color="#14B8A6" />
                <Text className="text-sm text-gray-600 font-medium">
                  {time}
                </Text>
              </View>
            </View>
          </View>
          {/* Status Badge - inline on large screens */}
          {isLargeScreen && (
            <View className="flex-row items-center gap-2">
              <StatusBadge />
            </View>
          )}
        </View>
        
        {/* Status Badge - top right corner on mobile */}
        {!isLargeScreen && (
          <View className="absolute top-3 right-3">
            <StatusBadge />
          </View>
        )}
      </View>

      {/* Body - Responsive Layout */}
      <View className="p-4">
        <View className={`${isLargeScreen ? 'flex-row justify-between items-center gap-4' : 'gap-4'}`}>
          {/* Person Info */}
          <View className="flex-row items-center gap-3 flex-1">
            <View className="relative">
              {avatarSource ? (
                <Image
                  source={avatarSource}
                  className="h-14 w-14 rounded-full border-2 border-white"
                />
              ) : (
                <View className="h-14 w-14 rounded-full bg-gray-100 items-center justify-center border-2 border-white">
                  <Text className="text-gray-500 font-bold text-lg">
                    {getInitials(therapistName)}
                  </Text>
                </View>
              )}
            </View>
            <View className="flex-1">
              <Text
                className="font-bold text-lg text-gray-900"
                numberOfLines={isLargeScreen ? 1 : 2}
              >
                {therapistName}
              </Text>
              {address ? (
                <View className="flex-row items-center gap-1 mt-0.5">
                  <MapPin size={14} color="#9CA3AF" />
                  <Text className="text-sm text-gray-500" numberOfLines={1}>
                    {address}
                  </Text>
                </View>
              ) : role ? (
                <Text className="text-sm text-gray-500" numberOfLines={1}>
                  {role}
                </Text>
              ) : null}
            </View>
          </View>

          {/* Action Button */}
          <View className={`${isLargeScreen ? '' : 'mt-1'}`}>
            <View className={`bg-teal-600 px-4 py-2.5 rounded-xl flex-row items-center justify-center gap-2 shadow-sm shadow-teal-200 ${isLargeScreen ? '' : 'w-full'}`}>
              <Text className="text-white font-medium text-sm">View Details</Text>
              <ArrowRight size={14} color="white" />
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Kept for backward compatibility if needed, but using Tailwind classes mostly
});


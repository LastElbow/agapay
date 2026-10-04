import React from "react";
import { View, Text } from "react-native";
import {
  Calendar,
  Star,
  DollarSign,
  Award,
  Heart,
  TrendingUp,
  CheckCircle,
  Check,
  X,
} from "lucide-react-native";

type Breakdown = Record<string, number>;

type MatchBreakdownProps = {
  breakdown: Breakdown;
};

// Define the consistent order for criteria display
const CRITERIA_ORDER = [
  "availability",
  "experience",
  "rating",
  "budget",
  "specialization",
  "desiredService",
] as const;

const CRITERIA_CONFIG = {
  availability: {
    label: "Schedule",
    icon: Calendar,
    isBinary: false,
    order: 1,
    description: (score: number) =>
      score > 0.8
        ? "Excellent schedule compatibility."
        : score > 0.5
        ? "Good schedule compatibility."
        : "Some schedule conflicts.",
  },
  specialization: {
    label: "Specialization",
    icon: Award,
    isBinary: true,
    order: 0,
    description: (score: number) =>
      score >= 1
        ? "Matches your preferred specialization."
        : "Different specialization.",
  },
  desiredService: {
    label: "Service",
    icon: Heart,
    isBinary: true,
    order: 0,
    description: (score: number) =>
      score >= 1
        ? "Provides the service you need."
        : "Doesn't specialize in the service you need.",
  },
  budget: {
    label: "Budget",
    icon: DollarSign,
    isBinary: false,
    order: 2,
    description: (score: number) =>
      score > 0.8
        ? "Fits well within your budget."
        : score > 0.5
        ? "Close to your budget."
        : "Outside of your budget.",
  },
  experience: {
    label: "Experience",
    icon: TrendingUp,
    isBinary: false,
    order: 4,
    description: (score: number) =>
      score > 0.8
        ? "Very experienced therapist."
        : score > 0.5
        ? "Experienced therapist."
        : "Newer therapist.",
  },
  rating: {
    label: "Rating",
    icon: Star,
    isBinary: false,
    order: 3,
    description: (score: number) =>
      score > 0.8
        ? "Excellent patient ratings."
        : score > 0.5
        ? "Good patient ratings."
        : "Some mixed reviews.",
  },
};

/**
 * Returns a color based on score using distinct color stops
 * Green (>=75%), Yellow (50-74%), Orange (25-49%), Red (<25%)
 */
const getScoreColor = (score: number): string => {
  if (score >= 0.75) {
    return "#22C55E"; // Green
  } else if (score >= 0.5) {
    return "#EAB308"; // Yellow
  } else if (score >= 0.25) {
    return "#F97316"; // Orange
  } else {
    return "#EF4444"; // Red
  }
};

const getTopCriteria = (breakdown: Breakdown): string[] => {
  return Object.entries(breakdown)
    .filter(([key]) => {
      const config = CRITERIA_CONFIG[key as keyof typeof CRITERIA_CONFIG];
      return config && !config.isBinary;
    })
    .sort(([, a], [, b]) => b - a)
    .slice(0, 2)
    .map(([key]) => key);
};

const generateSummary = (breakdown: Breakdown): string => {
  const topCriteria = getTopCriteria(breakdown);

  if (topCriteria.length === 0) {
    return "This therapist is a potential match for you.";
  }

  const first =
    CRITERIA_CONFIG[
      topCriteria[0] as keyof typeof CRITERIA_CONFIG
    ]?.label.toLowerCase();

  if (topCriteria.length === 1) {
    return `Great ${first} match.`;
  }

  const second =
    CRITERIA_CONFIG[
      topCriteria[1] as keyof typeof CRITERIA_CONFIG
    ]?.label.toLowerCase();
  return `Great ${first} and ${second} match.`;
};

const ProgressBar = ({
  progress,
  color,
}: {
  progress: number;
  color: string;
}) => (
  <View className="w-full bg-gray-200 rounded-full h-2.5">
    <View
      style={{ width: `${progress * 100}%`, backgroundColor: color }}
      className="h-2.5 rounded-full"
    />
  </View>
);

const MatchBreakdown = ({ breakdown }: MatchBreakdownProps) => {
  // Get binary and continuous items in consistent order
  const binaryItems = CRITERIA_ORDER.filter((key) => {
    const config = CRITERIA_CONFIG[key];
    return config && config.isBinary && breakdown[key] !== undefined;
  }).map((key) => [key, breakdown[key]] as [string, number]);

  const continuousItems = CRITERIA_ORDER.filter((key) => {
    const config = CRITERIA_CONFIG[key];
    return config && !config.isBinary && breakdown[key] !== undefined;
  }).map((key) => [key, breakdown[key]] as [string, number]);

  return (
    <View className="mt-1 pt-3 border-t border-gray-200 lg:mt-0 lg:pt-0 lg:border-t-0 lg:border-l lg:pl-4 lg:w-1/2">
      {/* Binary Criteria Section */}
      {binaryItems.length > 0 && (
        <View className="mb-4">
          <Text className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">
            Requirements
          </Text>
          <View className="space-y-2">
            {binaryItems.map(([key, score]) => {
              const config =
                CRITERIA_CONFIG[key as keyof typeof CRITERIA_CONFIG];
              if (!config) return null;

              const Icon = config.icon;
              const isMatch = score >= 1;
              const iconColor = getScoreColor(score);

              return (
                <View key={key} className="flex-row items-center">
                  <View
                    className="w-5 h-5 rounded-full items-center justify-center mr-2"
                    style={{
                      backgroundColor: isMatch ? "#10B981" : "#EF4444",
                    }}
                  >
                    {isMatch ? (
                      <Check size={14} color="#FFFFFF" strokeWidth={3} />
                    ) : (
                      <X size={14} color="#FFFFFF" strokeWidth={3} />
                    )}
                  </View>
                  <Icon color={iconColor} size={16} />
                  <Text
                    className="text-sm ml-2"
                    style={{
                      color: isMatch ? "#374151" : "#6B7280",
                    }}
                  >
                    {config.label}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>
      )}

      {/* Continuous Criteria Section */}
      {continuousItems.length > 0 && (
        <View>
          <Text className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">
            Scores
          </Text>
          <View className="space-y-3">
            {continuousItems.map(([key, score]) => {
              const config =
                CRITERIA_CONFIG[key as keyof typeof CRITERIA_CONFIG];
              if (!config) return null;

              const Icon = config.icon;
              const barColor = getScoreColor(score);

              return (
                <View key={key}>
                  <View className="flex-row justify-between items-center mb-1">
                    <View className="flex-row items-center">
                      <Icon color={barColor} size={16} />
                      <Text className="text-sm text-gray-600 ml-2">
                        {config.label}
                      </Text>
                    </View>
                    <Text
                      className="text-sm font-bold"
                      style={{ color: barColor }}
                    >
                      {Math.round(score * 100)}%
                    </Text>
                  </View>
                  <ProgressBar progress={score} color={barColor} />
                </View>
              );
            })}
          </View>
        </View>
      )}
    </View>
  );
};

export default MatchBreakdown;

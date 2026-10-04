import { useEffect, useState } from "react";
import apiClient from "@/api/client";

export type ConditionItem = { id: number; name: string };
export type ConditionGroup = {
  key: string;
  label: string;
  items: ConditionItem[];
};

export default function useConditionsGrouped(specializationIds?: number[]) {
  const [groups, setGroups] = useState<ConditionGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Stringify the array for stable dependency comparison
  const specializationIdsKey = JSON.stringify(specializationIds || []);

  useEffect(() => {
    let mounted = true;
    setLoading(true);

    // Parse back to array
    const ids = JSON.parse(specializationIdsKey) as number[];

    // Build query params with specialization IDs if provided
    // For ASP.NET Core array binding, we need to send multiple parameters with the same name
    let url = "/api/Onboarding/conditions-grouped";
    if (ids && ids.length > 0) {
      const queryParams = ids.map((id) => `specializationIds=${id}`).join("&");
      url = `${url}?${queryParams}`;
    }

    console.log("[useConditionsGrouped] Fetching with specializationIds:", ids);
    console.log("[useConditionsGrouped] Request URL:", url);

    apiClient
      .get<ConditionGroup[]>(url)
      .then((res) => {
        if (!mounted) return;
        const data = res.data ?? [];
        console.log("[useConditionsGrouped] Response data:", data);

        // Ensure 'Other' group exists and keep it even if it's empty
        const hasOther = data.some((g) => g.key === "Other" || g.key === "other");
        const normalized = data.map((g) => ({
          key: String(g.key),
          label: g.label ?? String(g.key),
          items: Array.isArray(g.items) ? g.items : [],
        }));

        if (!hasOther) {
          normalized.push({ key: "Other", label: "Other", items: [] });
        }

        console.log("[useConditionsGrouped] Normalized groups:", normalized);
        setGroups(normalized);
      })
      .catch((e) => {
        console.warn("failed to fetch grouped conditions", e);
        setError("Failed to load conditions.");
      })
      .finally(() => mounted && setLoading(false));

    return () => {
      mounted = false;
    };
  }, [specializationIdsKey]);

  return { groups, loading, error } as const;
}

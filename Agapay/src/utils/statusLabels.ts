const normalizeStatus = (status: string | null | undefined) =>
    String(status ?? "")
        .trim()
        .toLowerCase();

const STATUS_LABELS: Record<string, string> = {
    active: "Active",
    accepted: "Accepted",
    scheduled: "Scheduled",
    inprogress: "In Progress",
    donefortoday: "Done for today",
    "done for today": "Done for today",
    pendingconfirmation: "Pending Confirmation",
    pendingcancellation: "Pending Reschedule",
    cancellationacknowledged: "Awaiting New Schedule",
    pendingrescheduleapproval: "Pending Reschedule Approval",
    rescheduled: "Rescheduled",
    completed: "Completed",
    terminated: "Discontinued",
    discontinue: "Discontinued",
    discontinued: "Discontinued",
    cancelled: "Discontinued",
    canceled: "Discontinued",
    expired: "Expired",
    declined: "Declined",
};

const capitalizeFallback = (value: string) =>
    value ? value.charAt(0).toUpperCase() + value.slice(1) : "";

export const toDisplayStatus = (status?: string | null): string => {
    const normalized = normalizeStatus(status);
    if (!normalized) return "";
    return STATUS_LABELS[normalized] ?? capitalizeFallback(status ?? "");
};

export const toDiscontinueActionLabel = (status?: string | null): string => {
    if (!status) return "";
    return toDisplayStatus(status);
};

const normalizeContractStatusForFilter = (status: string | null | undefined) => {
    const normalized = normalizeStatus(status);
    if (!normalized) return "";
    if (normalized === "canceled") return "cancelled";
    return normalized;
};

const sessionStatusToContractMap: Record<string, string> = {
    pendingconfirmation: "pendingconfirmation",
    completed: "completed",
    terminated: "terminated",
    cancelled: "cancelled",
    canceled: "cancelled",
    expired: "expired",
    discontinued: "terminated",
    decline: "declined",
    declined: "declined",
};

export const deriveContractStatusKey = (
    contractStatus?: string | null,
    sessionStatus?: string | null
): string => {
    const contract = normalizeContractStatusForFilter(contractStatus);
    if (contract) return contract;

    const session = normalizeContractStatusForFilter(sessionStatus);
    if (session && sessionStatusToContractMap[session]) {
        return sessionStatusToContractMap[session];
    }

    return "active";
};

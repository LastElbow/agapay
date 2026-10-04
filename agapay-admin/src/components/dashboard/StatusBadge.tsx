import React from "react";

interface StatusBadgeProps {
  status: "pending" | "accepted" | "rejected";
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status }) => {
  const map: Record<string, { text: string; cls: string }> = {
    pending: { 
        text: "PENDING", 
        cls: "inline-flex items-center rounded-md bg-yellow-50 px-2 py-1 text-xs font-medium text-yellow-800 ring-1 ring-inset ring-yellow-600/20" 
    },
    accepted: { 
        text: "ACCEPTED", 
        cls: "inline-flex items-center rounded-md bg-green-50 px-2 py-1 text-xs font-medium text-green-700 ring-1 ring-inset ring-green-600/20" 
    },
    rejected: { 
        text: "REJECTED", 
        cls: "inline-flex items-center rounded-md bg-red-50 px-2 py-1 text-xs font-medium text-red-700 ring-1 ring-inset ring-red-600/20" 
    },
  };
  const cfg = map[status] || { text: "UNKNOWN", cls: "inline-flex items-center rounded-md bg-gray-50 px-2 py-1 text-xs font-medium text-gray-600 ring-1 ring-inset ring-gray-500/10" };
  return <span className={cfg.cls}>{cfg.text}</span>;
};

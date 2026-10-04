import React, { useState } from "react";
import { StatusBadge } from "./StatusBadge";

interface Submission {
  id: string;
  therapistName: string;
  patientName: string;
  submittedAt: string;
  notes?: string;
  licensePreviewUrl?: string;
  status: "pending" | "accepted" | "rejected";
}

interface SubmissionListProps {
  submissions: Submission[];
  selectedSubmission: Submission | null;
  onSelectSubmission: (submission: Submission) => void;
}

type FilterStatus = "all" | "pending" | "accepted" | "rejected";

export const SubmissionList: React.FC<SubmissionListProps> = ({
  submissions,
  selectedSubmission,
  onSelectSubmission,
}) => {
  const [filter, setFilter] = useState<FilterStatus>("all");

  // Count submissions by status
  const pendingCount = submissions.filter((s) => s.status === "pending").length;
  const acceptedCount = submissions.filter((s) => s.status === "accepted").length;
  const rejectedCount = submissions.filter((s) => s.status === "rejected").length;

  // Filter submissions based on selected filter
  const filteredSubmissions = filter === "all"
    ? submissions
    : submissions.filter((s) => s.status === filter);

  const renderSubmissionItem = (submission: Submission) => {
    const isSelected = selectedSubmission?.id === submission.id;
    return (
      <div
        key={submission.id}
        onClick={() => onSelectSubmission(submission)}
        className={`p-4 cursor-pointer transition-colors hover:bg-gray-50 ${isSelected ? "bg-blue-50 border-l-4 border-physio-primary pl-[13px]" : "border-l-4 border-transparent"
          }`}
      >
        <div className="flex justify-between items-start">
          <div className="flex-1 min-w-0 pr-4">
            <h3 className={`text-sm font-semibold truncate ${isSelected ? "text-physio-dark" : "text-gray-900"}`}>
              {submission.therapistName}
            </h3>
            <p className="text-xs text-gray-500 mt-0.5 truncate">
              {submission.patientName}
            </p>
            <p className="text-xs text-gray-400 mt-1 line-clamp-1">
              {submission.notes || "No additional notes"}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1.5 shrink-0">
            <StatusBadge status={submission.status} />
            <span className="text-[10px] text-gray-400">
              {new Date(submission.submittedAt).toLocaleDateString()}
            </span>
          </div>
        </div>
      </div>
    );
  };

  const filterButtons: { value: FilterStatus; label: string; count: number }[] = [
    { value: "all", label: "All", count: submissions.length },
    { value: "pending", label: "Pending", count: pendingCount },
    { value: "accepted", label: "Accepted", count: acceptedCount },
    { value: "rejected", label: "Rejected", count: rejectedCount },
  ];

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-gray-200 bg-white">
        <h2 className="text-lg font-semibold text-gray-900 mb-3">
          Therapist Submissions <span className="text-gray-500 font-normal">({submissions.length})</span>
        </h2>

        {/* Filter Tabs */}
        <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
          {filterButtons.map((btn) => (
            <button
              key={btn.value}
              onClick={() => setFilter(btn.value)}
              className={`flex-1 px-2 py-1.5 text-xs font-medium rounded-md transition-colors ${filter === btn.value
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-600 hover:text-gray-900"
                }`}
            >
              {btn.label}
              <span className={`ml-1 ${filter === btn.value ? "text-gray-500" : "text-gray-400"}`}>
                ({btn.count})
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {filteredSubmissions.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full p-8 text-center text-gray-500">
            <p>No {filter === "all" ? "" : filter} submissions found</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {filteredSubmissions.map(renderSubmissionItem)}
          </div>
        )}
      </div>
    </div>
  );
};

import React from "react";
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

interface SubmissionDetailProps {
  submission: Submission | null;
  onAccept: () => void;
  onReject: () => void;
  onViewLicense: () => void;
}

export const SubmissionDetail: React.FC<SubmissionDetailProps> = ({
  submission,
  onAccept,
  onReject,
  onViewLicense,
}) => {
  if (!submission) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center text-gray-400">
        <p className="text-lg">Select a submission to view details</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-white">
      <div className="px-6 py-5 border-b border-gray-200 flex justify-between items-center bg-white rounded-t-xl">
        <h2 className="text-xl font-bold text-gray-900 leading-6">Submission Details</h2>
        <StatusBadge status={submission.status} />
      </div>

      <div className="p-6 flex-1 overflow-y-auto">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-6 mb-8">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
              Name
            </label>
            <p className="text-base text-gray-900 font-medium break-words">{submission.therapistName}</p>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
              Email
            </label>
            <p className="text-base text-gray-900 font-medium break-words">{submission.patientName}</p>
          </div>
        </div>

        <div className="mb-8">
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
            Submitted At
          </label>
          <p className="text-base text-gray-900">
            {new Date(submission.submittedAt).toLocaleString()}
          </p>
        </div>

        {submission.notes && (
          <div className="mb-8">
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
              Notes / License Number
            </label>
            <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-700 border border-gray-100">
                {submission.notes}
            </div>
          </div>
        )}

        <div className="mb-8">
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
            PRC Verification
          </label>
          <div className="mt-1">
            <a
              href="https://verification.prc.gov.ph/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center text-physio-primary font-medium hover:text-physio-dark transition-colors"
            >
              Verify License on PRC Website
              <span className="text-xs ml-1">↗</span>
            </a>
          </div>
        </div>

        <div className="flex flex-wrap gap-3 pt-6 border-t border-gray-100">
          <button
            onClick={onViewLicense}
            className="rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 transition-all"
          >
            View License
          </button>

          {submission.status === "pending" && (
            <>
              <button
                onClick={onAccept}
                className="rounded-lg bg-physio-primary px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-physio-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-physio-primary transition-all"
              >
                Approve
              </button>
              <button
                onClick={onReject}
                className="rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-red-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600 transition-all"
              >
                Reject
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

import React, { useState } from "react";
import { AlertTriangle, X } from "lucide-react";

interface RejectionReasonModalProps {
  isOpen: boolean;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}

export const RejectionReasonModal: React.FC<RejectionReasonModalProps> = ({
  isOpen,
  onConfirm,
  onCancel,
}) => {
  const [reason, setReason] = useState("");

  if (!isOpen) return null;

  const handleConfirm = () => {
    if (reason.trim()) {
      onConfirm(reason.trim());
      setReason("");
    }
  };

  const handleCancel = () => {
    setReason("");
    onCancel();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
        <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
             <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" onClick={handleCancel} aria-hidden="true" />
             
             <div className="relative transform overflow-hidden rounded-lg bg-white text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-lg">
                 <div className="absolute right-0 top-0 pr-4 pt-4 sm:block">
                    <button
                        type="button"
                        className="rounded-md bg-white text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
                        onClick={handleCancel}
                    >
                        <span className="sr-only">Close</span>
                        <X className="h-6 w-6" aria-hidden="true" />
                    </button>
                 </div>

                 <div className="bg-white px-4 pb-4 pt-5 sm:p-6 sm:pb-4">
                     <div className="sm:flex sm:items-start">
                        <div className="mx-auto flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-red-100 sm:mx-0 sm:h-10 sm:w-10">
                            <AlertTriangle className="h-6 w-6 text-red-600" aria-hidden="true" />
                        </div>
                        <div className="mt-3 text-center sm:ml-4 sm:mt-0 sm:text-left w-full">
                            <h3 className="text-base font-semibold leading-6 text-gray-900" id="modal-title">
                                Reject Submission
                            </h3>
                            <div className="mt-2">
                                <p className="text-sm text-gray-500">
                                    Please provide a reason for rejecting this therapist's submission.
                                    This will be communicated to the therapist.
                                </p>
                            </div>
                            
                            <div className="mt-4">
                                <label htmlFor="reason" className="block text-sm font-medium leading-6 text-gray-900 text-left">
                                    Rejection Reason <span className="text-red-500">*</span>
                                </label>
                                <div className="mt-2">
                                    <textarea
                                        id="reason"
                                        name="reason"
                                        rows={4}
                                        className="block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-red-600 sm:text-sm sm:leading-6 outline-none"
                                        placeholder="Please explain why this submission is being rejected..."
                                        value={reason}
                                        onChange={(e) => setReason(e.target.value)}
                                    />
                                </div>
                            </div>
                        </div>
                     </div>
                 </div>

                 <div className="bg-gray-50 px-4 py-3 sm:flex sm:flex-row-reverse sm:px-6">
                    <button
                        type="button"
                        className="inline-flex w-full justify-center rounded-md bg-red-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-red-500 sm:ml-3 sm:w-auto disabled:opacity-50 disabled:cursor-not-allowed"
                        onClick={handleConfirm}
                        disabled={!reason.trim()}
                    >
                        Reject Submission
                    </button>
                    <button
                        type="button"
                        className="mt-3 inline-flex w-full justify-center rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 sm:mt-0 sm:w-auto"
                        onClick={handleCancel}
                    >
                        Cancel
                    </button>
                 </div>
             </div>
        </div>
    </div>
  );
};

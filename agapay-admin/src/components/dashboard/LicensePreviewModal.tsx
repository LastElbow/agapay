import React from "react";
import { Loader2, X } from "lucide-react";

interface LicensePreviewModalProps {
  isOpen: boolean;
  imageUrl?: string | null;
  isLoading?: boolean;
  onClose: () => void;
}

export const LicensePreviewModal: React.FC<LicensePreviewModalProps> = ({
  isOpen,
  imageUrl,
  isLoading = false,
  onClose,
}) => {
  if (!isOpen) return null;

  const trimmed = imageUrl && imageUrl.trim().length > 0 ? imageUrl : null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
        <div className="flex min-h-full items-center justify-center p-4 text-center sm:p-0">
             <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" onClick={onClose} aria-hidden="true" />
             
             <div className="relative transform overflow-hidden rounded-lg bg-white text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-4xl p-6">
                 <div className="absolute right-0 top-0 pr-4 pt-4 sm:block">
                    <button
                        type="button"
                        className="rounded-md bg-white text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-physio-primary focus:ring-offset-2"
                        onClick={onClose}
                    >
                        <span className="sr-only">Close</span>
                        <X className="h-6 w-6" aria-hidden="true" />
                    </button>
                 </div>

                 <div className="sm:flex sm:items-start w-full">
                    <div className="mt-3 text-center sm:ml-4 sm:mt-0 sm:text-left w-full">
                        <h3 className="text-lg font-semibold leading-6 text-gray-900 mb-4" id="modal-title">
                            License Preview
                        </h3>
                        <div className="mt-2 flex items-center justify-center bg-gray-50 rounded-lg min-h-[300px] border border-gray-200">
                             {isLoading ? (
                                <div className="flex flex-col items-center text-gray-500">
                                   <Loader2 className="h-8 w-8 animate-spin mb-2 text-physio-primary" />
                                   <p>Loading license image...</p>
                                </div>
                            ) : trimmed ? (
                                <img
                                    src={trimmed}
                                    alt="License"
                                    className="max-h-[70vh] w-auto max-w-full object-contain rounded-md"
                                />
                            ) : (
                                <div className="text-center text-gray-500 py-10">
                                    <p>License image unavailable.</p>
                                </div>
                            )}
                        </div>
                    </div>
                 </div>
             </div>
        </div>
    </div>
  );
};

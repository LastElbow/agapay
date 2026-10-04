import React from "react";
import { Check, X } from "lucide-react";

interface SuccessMessageProps {
  message: string;
  onClose?: () => void;
}

export const SuccessMessage: React.FC<SuccessMessageProps> = ({
  message,
  onClose,
}) => {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center justify-between p-4 bg-green-50 border border-green-200 rounded-lg shadow-lg gap-3 min-w-[300px]"
    >
      <div className="flex items-center gap-3">
        <div className="flex-shrink-0 w-6 h-6 rounded-full bg-green-500 flex items-center justify-center">
            <Check className="w-4 h-4 text-white font-bold" />
        </div>
        <p className="text-sm font-medium text-green-800">{message}</p>
      </div>
      {onClose && (
        <button
          onClick={onClose}
          aria-label="Close notification"
          className="text-green-700 hover:text-green-900 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      )}
    </div>
  );
};

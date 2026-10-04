import React from "react";
import { AlertTriangle, X } from "lucide-react";

interface ErrorMessageProps {
  message: string;
  onRetry?: () => void;
}

export const ErrorMessage: React.FC<ErrorMessageProps> = ({
  message,
  onRetry,
}) => {
  return (
    <div
      role="alert"
      aria-live="assertive"
      className="flex items-center justify-between p-4 bg-red-50 border border-red-200 rounded-lg shadow-lg gap-3 min-w-[300px]"
    >
      <div className="flex items-center gap-3">
        <div className="flex-shrink-0 w-6 h-6 rounded-full bg-red-500 flex items-center justify-center">
             <AlertTriangle className="w-4 h-4 text-white font-bold" />
        </div>
        <p className="text-sm font-medium text-red-800">{message}</p>
      </div>
      {onRetry && (
        <button
          onClick={onRetry}
          aria-label="Close notification"
          className="text-red-700 hover:text-red-900 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      )}
    </div>
  );
};

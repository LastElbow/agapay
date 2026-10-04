import React from "react";
import { Loader2 } from "lucide-react";

export const LoadingState: React.FC = () => {
  return (
    <div className="flex flex-col items-center justify-center p-10 gap-4">
      <Loader2 className="h-10 w-10 text-physio-primary animate-spin" />
      <p className="text-gray-500 text-base">
        Loading submissions...
      </p>
    </div>
  );
};

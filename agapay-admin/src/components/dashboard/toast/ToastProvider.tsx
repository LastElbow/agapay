import React, { useCallback, useMemo, useState } from "react";
import { SuccessMessage } from "../SuccessMessage";
import { ErrorMessage } from "../ErrorMessage";
import { ToastContext } from "./toastContext";
import type { ToastItem } from "./toastContext";

const ToastProviderComponent: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const push = useCallback((incoming: Omit<ToastItem, "id">) => {
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const item: ToastItem = { id, ...incoming };
    setToasts((s) => [item, ...s]); // newest on top

    // auto remove after default timeout depending on type
    const timeout = incoming.type === "success" ? 3000 : 6000;
    setTimeout(() => setToasts((s) => s.filter((t) => t.id !== id)), timeout);

    return id;
  }, []);

  const remove = useCallback((id: string) => {
    setToasts((s) => s.filter((t) => t.id !== id));
  }, []);

  const value = useMemo(() => ({ push, remove }), [push, remove]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/* container: render toasts stacked in top-right */}
      <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-3 pointer-events-none">
        {toasts.map((t) => (
          <div key={t.id} className="pointer-events-auto">
            {t.type === "success" ? (
              <SuccessMessage
                message={t.message}
                onClose={() => remove(t.id)}
              />
            ) : (
              <ErrorMessage message={t.message} onRetry={() => remove(t.id)} />
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};

export default ToastProviderComponent;

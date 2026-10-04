import { createContext } from 'react';

export type ToastType = 'success' | 'error' | 'warning';
export interface ToastItem {
  id: string;
  type: ToastType;
  message: string;
}

export interface ToastContextValue {
  push: (t: Omit<ToastItem, 'id'>) => string;
  remove: (id: string) => void;
}

export const ToastContext = createContext<ToastContextValue | null>(null);

export default ToastContext;

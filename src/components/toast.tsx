"use client";

import { createContext, useContext, useState, useCallback, ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, CheckCircle, AlertCircle, Info } from "lucide-react";
import { hapticSuccess, hapticError, hapticLight } from "@/lib/haptics";

type ToastType = "success" | "error" | "info";

interface Toast {
  id: string;
  message: string;
  type: ToastType;
  action?: {
    label: string;
    onClick: () => void;
  };
}

interface ToastContextType {
  showToast: (message: string, type?: ToastType, action?: Toast["action"]) => void;
  success: (message: string) => void;
  error: (message: string, action?: Toast["action"]) => void;
  info: (message: string) => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (message: string, type: ToastType = "info", action?: Toast["action"]) => {
      const id = Math.random().toString(36).slice(2);
      setToasts((prev) => [...prev, { id, message, type, action }]);

      // Trigger haptic feedback based on type
      if (type === "success") hapticSuccess();
      else if (type === "error") hapticError();
      else hapticLight();

      // Auto-dismiss after 4 seconds (longer if there's an action)
      setTimeout(() => removeToast(id), action ? 6000 : 4000);
    },
    [removeToast]
  );

  const success = useCallback((message: string) => showToast(message, "success"), [showToast]);
  const error = useCallback((message: string, action?: Toast["action"]) => showToast(message, "error", action), [showToast]);
  const info = useCallback((message: string) => showToast(message, "info"), [showToast]);

  return (
    <ToastContext.Provider value={{ showToast, success, error, info }}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={removeToast} />
    </ToastContext.Provider>
  );
}

function ToastContainer({
  toasts,
  onDismiss,
}: {
  toasts: Toast[];
  onDismiss: (id: string) => void;
}) {
  return (
    <div className="fixed top-0 left-0 right-0 z-[9999] flex flex-col items-center pointer-events-none p-4 pt-[calc(env(safe-area-inset-top)+16px)]">
      <AnimatePresence mode="sync">
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onDismiss={() => onDismiss(toast.id)} />
        ))}
      </AnimatePresence>
    </div>
  );
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const icons = {
    success: <CheckCircle className="w-5 h-5 text-green-400 shrink-0" />,
    error: <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />,
    info: <Info className="w-5 h-5 text-primary shrink-0" />,
  };

  const backgrounds = {
    success: "bg-green-500/10 border-green-500/20",
    error: "bg-red-500/10 border-red-500/20",
    info: "bg-primary/10 border-primary/20",
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -20, scale: 0.95 }}
      transition={{ type: "spring", damping: 25, stiffness: 300 }}
      className={`pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-xl border backdrop-blur-xl shadow-lg mb-2 max-w-[calc(100vw-32px)] ${backgrounds[toast.type]}`}
    >
      {icons[toast.type]}
      <span className="text-sm font-medium text-foreground flex-1">{toast.message}</span>
      {toast.action && (
        <button
          onClick={() => {
            toast.action?.onClick();
            onDismiss();
          }}
          className="text-sm font-semibold text-primary hover:text-primary/80 transition-colors"
        >
          {toast.action.label}
        </button>
      )}
      <button
        onClick={onDismiss}
        className="p-1 rounded-full hover:bg-white/10 transition-colors"
      >
        <X className="w-4 h-4 text-muted-foreground" />
      </button>
    </motion.div>
  );
}

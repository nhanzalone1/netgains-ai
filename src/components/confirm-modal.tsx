"use client";

import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, Trash2, RotateCcw } from "lucide-react";

type ConfirmModalVariant = "destructive" | "warning" | "reset";

interface ConfirmModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: ConfirmModalVariant;
  loading?: boolean;
}

const variantStyles = {
  destructive: {
    iconBg: "rgba(239, 68, 68, 0.15)",
    iconColor: "text-red-500",
    confirmBg: "bg-red-500 hover:bg-red-600",
    Icon: Trash2,
  },
  warning: {
    iconBg: "rgba(249, 115, 22, 0.15)",
    iconColor: "text-orange-500",
    confirmBg: "bg-orange-500 hover:bg-orange-600",
    Icon: AlertTriangle,
  },
  reset: {
    iconBg: "rgba(249, 115, 22, 0.15)",
    iconColor: "text-orange-500",
    confirmBg: "bg-orange-500 hover:bg-orange-600",
    Icon: RotateCcw,
  },
};

export function ConfirmModal({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = "Confirm",
  cancelText = "Cancel",
  variant = "destructive",
  loading = false,
}: ConfirmModalProps) {
  const styles = variantStyles[variant];
  const { Icon } = styles;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-2xl p-6"
            style={{
              background: "var(--card)",
              border: "1px solid rgba(255, 255, 255, 0.1)",
            }}
          >
            {/* Icon */}
            <div className="flex justify-center mb-4">
              <div
                className="w-16 h-16 rounded-full flex items-center justify-center"
                style={{ background: styles.iconBg }}
              >
                <Icon className={`w-8 h-8 ${styles.iconColor}`} />
              </div>
            </div>

            {/* Title */}
            <h2 className="text-xl font-bold text-center text-white mb-2">
              {title}
            </h2>

            {/* Message */}
            <p className="text-sm text-gray-400 text-center mb-6">
              {message}
            </p>

            {/* Buttons */}
            <div className="flex gap-3">
              <button
                onClick={onClose}
                disabled={loading}
                className="flex-1 py-3 rounded-xl font-semibold text-white transition-colors disabled:opacity-50"
                style={{ background: "rgba(55, 55, 65, 0.8)" }}
              >
                {cancelText}
              </button>
              <button
                onClick={onConfirm}
                disabled={loading}
                className={`flex-1 py-3 rounded-xl font-semibold text-white transition-colors disabled:opacity-50 ${styles.confirmBg}`}
              >
                {loading ? (
                  <div className="flex items-center justify-center gap-2">
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Processing...</span>
                  </div>
                ) : (
                  confirmText
                )}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

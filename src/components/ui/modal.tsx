"use client";

import { ReactNode, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { IconButton } from "./icon-button";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}

export function Modal({ open, onClose, title, children }: ModalProps) {
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.2 }}
            className="fixed left-4 right-4 top-1/2 -translate-y-1/2 z-[60] max-w-[calc(100vw-32px)] sm:max-w-md mx-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="rounded-3xl overflow-hidden glass-elevated">
              {title && (
                <div className="flex items-center justify-between p-4 border-b border-white/5">
                  <h2 className="text-lg font-black uppercase tracking-tight">
                    {title}
                  </h2>
                  <IconButton onClick={onClose}>
                    <X className="w-5 h-5" />
                  </IconButton>
                </div>
              )}
              <div className="p-4">{children}</div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

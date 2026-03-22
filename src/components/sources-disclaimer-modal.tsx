"use client";

import { motion } from "framer-motion";
import { BookOpen, X } from "lucide-react";
import { Button } from "./ui/button";

interface SourcesDisclaimerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SourcesDisclaimerModal({ isOpen, onClose }: SourcesDisclaimerModalProps) {
  if (!isOpen) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal content */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="relative w-full max-w-md rounded-2xl overflow-hidden"
        style={{ background: "var(--background)" }}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="p-6 text-center">
          <div className="w-16 h-16 rounded-2xl bg-primary/20 flex items-center justify-center mx-auto mb-4">
            <BookOpen className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold mb-2">Sources & Disclaimer</h1>
        </div>

        {/* Content */}
        <div className="px-6 pb-4 space-y-4">
          {/* Sources */}
          <div
            className="rounded-xl p-4"
            style={{ background: "rgba(255,255,255,0.03)" }}
          >
            <p className="text-sm text-foreground/90 leading-relaxed">
              Nutrition and fitness recommendations are informed by guidelines from the{" "}
              <strong className="text-foreground">American College of Sports Medicine (ACSM)</strong>,{" "}
              <strong className="text-foreground">International Society of Sports Nutrition (ISSN)</strong>, and{" "}
              <strong className="text-foreground">National Academy of Sports Medicine (NASM)</strong>.
            </p>
          </div>

          {/* Medical disclaimer */}
          <div
            className="rounded-xl p-4 border border-yellow-500/20"
            style={{ background: "rgba(234, 179, 8, 0.05)" }}
          >
            <p className="text-sm text-foreground/90 leading-relaxed">
              <strong className="text-yellow-500">NetGains AI is not a medical provider.</strong>{" "}
              This app does not provide medical advice, diagnosis, or treatment. Always consult a qualified healthcare provider before starting any diet or exercise program.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 pt-2 border-t border-white/5">
          <Button
            onClick={onClose}
            className="w-full"
          >
            Got It
          </Button>
        </div>
      </motion.div>
    </motion.div>
  );
}

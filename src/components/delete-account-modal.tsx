"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, Loader2, ExternalLink } from "lucide-react";
import { Modal } from "./ui/modal";
import { SubscriptionTier } from "@/lib/constants";

interface DeleteAccountModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  subscriptionTier: SubscriptionTier;
  subscriptionExpiresAt: Date | null;
}

export function DeleteAccountModal({
  open,
  onClose,
  onConfirm,
  subscriptionTier,
  subscriptionExpiresAt,
}: DeleteAccountModalProps) {
  const [confirmText, setConfirmText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isConfirmed = confirmText === "DELETE";
  const hasActiveSubscription = subscriptionTier !== "free" && subscriptionExpiresAt && subscriptionExpiresAt > new Date();

  // Calculate days remaining
  const daysRemaining = hasActiveSubscription && subscriptionExpiresAt
    ? Math.ceil((subscriptionExpiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : 0;

  const openAppleSubscriptions = () => {
    window.open("https://apps.apple.com/account/subscriptions", "_blank");
  };

  const handleDelete = async () => {
    if (!isConfirmed || isDeleting) return;

    setIsDeleting(true);
    setError(null);

    try {
      await onConfirm();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete account");
      setIsDeleting(false);
    }
  };

  const handleClose = () => {
    if (isDeleting) return;
    setConfirmText("");
    setError(null);
    onClose();
  };

  return (
    <Modal open={open} onClose={handleClose} title="Delete Account">
      <div className="space-y-4">
        {/* Warning */}
        <div className="flex items-start gap-3 p-3 rounded-xl bg-red-500/10 border border-red-500/20">
          <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-400 font-medium">
            This will permanently delete your account and all your data. This cannot be undone.
          </p>
        </div>

        {/* Active Subscription Warning */}
        {hasActiveSubscription && (
          <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 space-y-3">
            <div className="text-sm">
              <p className="text-amber-400 font-medium mb-1">
                You have {subscriptionTier.charAt(0).toUpperCase() + subscriptionTier.slice(1)} with {daysRemaining} {daysRemaining === 1 ? "day" : "days"} remaining
              </p>
              <p className="text-muted-foreground">
                Subscriptions are managed through your Apple ID and cannot be cancelled within the app. Tap below to manage your subscription in Settings.
              </p>
            </div>
            <motion.button
              whileTap={{ scale: 0.98 }}
              onClick={openAppleSubscriptions}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-white/10 text-white text-sm font-medium hover:bg-white/15 transition-colors"
            >
              <span>Manage Subscription</span>
              <ExternalLink className="w-4 h-4" />
            </motion.button>
          </div>
        )}

        {/* Confirmation input */}
        <div className="space-y-2">
          <label className="text-sm text-muted-foreground">
            Type <span className="font-mono font-semibold text-white">DELETE</span> to confirm
          </label>
          <input
            type="text"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value.toUpperCase())}
            placeholder="DELETE"
            disabled={isDeleting}
            className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-red-500/50 focus:border-red-500/50 disabled:opacity-50 font-mono"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
          />
        </div>

        {/* Error message */}
        {error && (
          <p className="text-sm text-red-400">{error}</p>
        )}

        {/* Buttons */}
        <div className="flex gap-3 pt-2">
          <motion.button
            whileTap={{ scale: 0.98 }}
            onClick={handleClose}
            disabled={isDeleting}
            className="flex-1 px-4 py-3 rounded-xl bg-white/10 text-white font-semibold hover:bg-white/15 transition-colors disabled:opacity-50"
          >
            Cancel
          </motion.button>
          <motion.button
            whileTap={{ scale: isConfirmed && !isDeleting ? 0.98 : 1 }}
            onClick={handleDelete}
            disabled={!isConfirmed || isDeleting}
            className="flex-1 px-4 py-3 rounded-xl bg-red-600 text-white font-semibold hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isDeleting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Deleting...
              </>
            ) : (
              "Delete Account"
            )}
          </motion.button>
        </div>
      </div>
    </Modal>
  );
}

"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Palette,
  Flame,
  Calendar,
  Check,
  Pencil,
  X,
  Save,
  Repeat,
  Trash2,
  Brain,
  RotateCcw,
  ChevronRight,
  AlertTriangle,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { GlassCard } from "@/components/ui/glass-card";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/components/auth-provider";
import { useTheme, themes } from "@/components/theme-provider";
import { apiFetch } from "@/lib/capacitor";

const intensityOptions = [
  { id: "light", name: "Light", description: "~300 cal deficit/surplus" },
  { id: "moderate", name: "Moderate", description: "~500 cal deficit/surplus" },
  { id: "aggressive", name: "Aggressive", description: "~750+ cal deficit/surplus" },
] as const;

type IntensityId = (typeof intensityOptions)[number]["id"];

// Deduplicate split rotation by removing consecutive duplicate patterns
function deduplicateSplitRotation(rotation: string[]): string[] {
  if (rotation.length === 0) return rotation;

  // Try to find a repeating pattern (starting from half the array)
  for (let patternLen = 1; patternLen <= rotation.length / 2; patternLen++) {
    if (rotation.length % patternLen !== 0) continue;

    const pattern = rotation.slice(0, patternLen);
    let isRepeating = true;

    for (let i = patternLen; i < rotation.length; i++) {
      if (rotation[i] !== pattern[i % patternLen]) {
        isRepeating = false;
        break;
      }
    }

    if (isRepeating && rotation.length > patternLen) {
      return pattern;
    }
  }

  return rotation;
}

export default function SettingsPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { theme, setTheme } = useTheme();
  const [intensity, setIntensityState] = useState<IntensityId>("moderate");
  const [splitRotation, setSplitRotation] = useState<string[]>([]);
  const [isRepeating, setIsRepeating] = useState(false);
  const [editingSplitIndex, setEditingSplitIndex] = useState<number | null>(null);
  const [editingSplitValue, setEditingSplitValue] = useState("");
  const [savingSplit, setSavingSplit] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [resetting, setResetting] = useState(false);
  const supabase = createClient();

  // Load user data on mount
  useEffect(() => {
    if (!user?.id) return;
    const loadUserData = async () => {
      // Load intensity
      const { data: profileData } = await supabase
        .from("profiles")
        .select("coaching_intensity")
        .eq("id", user.id)
        .maybeSingle();
      if (profileData?.coaching_intensity) {
        setIntensityState(profileData.coaching_intensity as IntensityId);
      }

      // Load split rotation and repeating flag
      const { data: splitData } = await supabase
        .from("coach_memory")
        .select("value")
        .eq("user_id", user.id)
        .eq("key", "split_rotation")
        .maybeSingle();
      if (splitData?.value) {
        try {
          const parsed = JSON.parse(splitData.value);
          if (Array.isArray(parsed)) {
            // Deduplicate any previously duplicated rotations
            const deduplicated = deduplicateSplitRotation(parsed);
            setSplitRotation(deduplicated);

            // If we deduplicated, save the cleaned version
            if (deduplicated.length !== parsed.length) {
              await supabase
                .from("coach_memory")
                .update({ value: JSON.stringify(deduplicated) })
                .eq("user_id", user.id)
                .eq("key", "split_rotation");
            }
          }
        } catch {
          // ignore parse errors
        }
      }

      // Load split repeating flag
      const { data: repeatingData } = await supabase
        .from("coach_memory")
        .select("value")
        .eq("user_id", user.id)
        .eq("key", "split_repeating")
        .maybeSingle();
      if (repeatingData?.value) {
        setIsRepeating(repeatingData.value === "true");
      }
    };
    loadUserData();
  }, [user?.id, supabase]);

  const setIntensity = async (newIntensity: IntensityId) => {
    const oldIntensity = intensity;
    setIntensityState(newIntensity);
    if (user?.id) {
      await supabase
        .from("profiles")
        .update({ coaching_intensity: newIntensity })
        .eq("id", user.id);

      try {
        const response = await apiFetch("/api/nutrition/recalculate", { method: "POST" });
        const data = await response.json();

        if (data.goals) {
          await supabase.from("coach_memory").upsert(
            {
              user_id: user.id,
              key: "pending_changes",
              value: JSON.stringify({
                type: "intensity",
                from: oldIntensity,
                to: newIntensity,
                newCalories: data.goals.calories,
              }),
            },
            { onConflict: "user_id,key" }
          );
        }
      } catch (error) {
        console.error("Failed to recalculate nutrition goals:", error);
      }
    }
  };

  const startEditingSplit = (index: number) => {
    setEditingSplitIndex(index);
    setEditingSplitValue(splitRotation[index]);
  };

  const saveSplitEdit = async () => {
    if (editingSplitIndex === null || !user?.id) return;

    const newRotation = [...splitRotation];
    newRotation[editingSplitIndex] = editingSplitValue.trim() || splitRotation[editingSplitIndex];

    setSavingSplit(true);
    try {
      const { data: existing } = await supabase
        .from("coach_memory")
        .select("id")
        .eq("user_id", user.id)
        .eq("key", "split_rotation")
        .maybeSingle();

      if (existing) {
        await supabase
          .from("coach_memory")
          .update({ value: JSON.stringify(newRotation) })
          .eq("id", existing.id);
      } else {
        await supabase.from("coach_memory").insert({
          user_id: user.id,
          key: "split_rotation",
          value: JSON.stringify(newRotation),
        });
      }

      await supabase.from("coach_memory").upsert(
        {
          user_id: user.id,
          key: "pending_changes",
          value: JSON.stringify({
            type: "split",
            newRotation: newRotation,
          }),
        },
        { onConflict: "user_id,key" }
      );

      setSplitRotation(newRotation);
    } catch (error) {
      console.error("Failed to save split:", error);
    }
    setSavingSplit(false);
    setEditingSplitIndex(null);
  };

  const cancelSplitEdit = () => {
    setEditingSplitIndex(null);
    setEditingSplitValue("");
  };

  const toggleSplitRepeating = async () => {
    if (!user?.id || splitRotation.length === 0) return;

    const newValue = !isRepeating;

    setSavingSplit(true);
    try {
      await supabase.from("coach_memory").upsert(
        {
          user_id: user.id,
          key: "split_repeating",
          value: String(newValue),
        },
        { onConflict: "user_id,key" }
      );

      // Update pending changes so coach acknowledges
      await supabase.from("coach_memory").upsert(
        {
          user_id: user.id,
          key: "pending_changes",
          value: JSON.stringify({
            type: "split",
            newRotation: splitRotation,
            isRepeating: newValue,
          }),
        },
        { onConflict: "user_id,key" }
      );

      setIsRepeating(newValue);
    } catch (error) {
      console.error("Failed to toggle split repeating:", error);
    }
    setSavingSplit(false);
  };

  const removeSplitDay = async (index: number) => {
    if (!user?.id || splitRotation.length <= 1) return;

    const newRotation = splitRotation.filter((_, i) => i !== index);

    setSavingSplit(true);
    try {
      const { data: existing } = await supabase
        .from("coach_memory")
        .select("id")
        .eq("user_id", user.id)
        .eq("key", "split_rotation")
        .maybeSingle();

      if (existing) {
        await supabase
          .from("coach_memory")
          .update({ value: JSON.stringify(newRotation) })
          .eq("id", existing.id);
      }

      setSplitRotation(newRotation);
    } catch (error) {
      console.error("Failed to remove split day:", error);
    }
    setSavingSplit(false);
  };

  const handleResetCoach = async () => {
    if (!user?.id) return;
    setResetting(true);

    try {
      // Clear chat messages
      await supabase.from("chat_messages").delete().eq("user_id", user.id);

      // Clear Pinecone memories via API
      await apiFetch("/api/memory/clear-test?all=true", { method: "DELETE" });

      // Clear conversation summary
      await supabase
        .from("coach_memory")
        .delete()
        .eq("user_id", user.id)
        .eq("key", "conversation_summary");

      await supabase
        .from("coach_memory")
        .delete()
        .eq("user_id", user.id)
        .eq("key", "summary_message_count");

      // Reload the page to reset state
      window.location.href = "/coach";
    } catch (error) {
      console.error("Failed to reset coach:", error);
      setResetting(false);
      setShowResetConfirm(false);
    }
  };

  return (
    <div className="min-h-screen pb-24">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-xl border-b border-white/5">
        <div className="flex items-center gap-3 p-4">
          <button
            onClick={() => router.back()}
            className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center hover:bg-white/10 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-semibold">Settings</h1>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Coach Profile Link */}
        <GlassCard
          className="p-4 cursor-pointer hover:bg-white/10 transition-colors"
          onClick={() => router.push("/settings/coach-profile")}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
                <Brain className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="font-medium">Coach Profile</p>
                <p className="text-xs text-muted-foreground">
                  Supplements, food, preferences, injuries
                </p>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-muted-foreground" />
          </div>
        </GlassCard>

        {/* Theme */}
        <GlassCard className="p-4">
          <div className="flex items-center gap-3 mb-4">
            <Palette className="w-5 h-5 text-primary" />
            <span className="font-medium">Theme</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {themes.map((t) => (
              <motion.button
                key={t.id}
                whileTap={{ scale: 0.95 }}
                onClick={() => setTheme(t.id)}
                className="flex flex-col items-center gap-1.5 p-3 rounded-xl transition-colors"
                style={{
                  background: theme.id === t.id ? "rgba(255, 255, 255, 0.1)" : "transparent",
                }}
              >
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center"
                  style={{ background: t.primary }}
                >
                  {theme.id === t.id && <Check className="w-4 h-4 text-white" />}
                </div>
                <span className="text-xs text-muted-foreground font-medium">{t.name.split(" ")[0]}</span>
              </motion.button>
            ))}
          </div>
        </GlassCard>

        {/* Goal Intensity */}
        <GlassCard className="p-4">
          <div className="flex items-center gap-3 mb-4">
            <Flame className="w-5 h-5 text-primary" />
            <span className="font-medium">Goal Intensity</span>
          </div>
          <div className="space-y-2">
            {intensityOptions.map((opt) => (
              <motion.button
                key={opt.id}
                whileTap={{ scale: 0.98 }}
                onClick={() => setIntensity(opt.id)}
                className="w-full flex items-center gap-3 p-3 rounded-xl transition-colors"
                style={{
                  background: intensity === opt.id ? "rgba(255, 255, 255, 0.1)" : "transparent",
                }}
              >
                <div
                  className="w-6 h-6 rounded-full flex items-center justify-center border border-white/20"
                  style={{
                    background: intensity === opt.id ? "var(--primary)" : "transparent",
                  }}
                >
                  {intensity === opt.id && <Check className="w-3 h-3 text-white" />}
                </div>
                <div className="flex-1 text-left">
                  <p className="text-sm font-medium">{opt.name}</p>
                  <p className="text-xs text-muted-foreground">{opt.description}</p>
                </div>
              </motion.button>
            ))}
          </div>
        </GlassCard>

        {/* Training Split */}
        {splitRotation.length > 0 && (
          <GlassCard className="p-4">
            <div className="flex items-center gap-3 mb-4">
              <Calendar className="w-5 h-5 text-primary" />
              <span className="font-medium">Training Split</span>
              {isRepeating && (
                <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/20 text-primary text-xs">
                  <Repeat className="w-3 h-3" />
                  Repeats
                </span>
              )}
              <span className="text-xs text-muted-foreground ml-auto">
                {splitRotation.filter((d) => typeof d === "string" && d !== "Rest").length} days
              </span>
            </div>
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground mb-2">Tap to rename, use trash to delete</p>
              {splitRotation.map((day, index) => (
                <div key={index}>
                  {editingSplitIndex === index ? (
                    <div className="flex items-center gap-2 p-2 rounded-xl bg-white/5">
                      <input
                        type="text"
                        value={editingSplitValue}
                        onChange={(e) => setEditingSplitValue(e.target.value)}
                        className="flex-1 bg-white/10 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === "Enter") saveSplitEdit();
                          if (e.key === "Escape") cancelSplitEdit();
                        }}
                      />
                      <button
                        onClick={saveSplitEdit}
                        disabled={savingSplit}
                        className="w-8 h-8 rounded-lg flex items-center justify-center bg-primary/20 text-primary hover:bg-primary/30 disabled:opacity-50"
                      >
                        <Save className="w-4 h-4" />
                      </button>
                      <button
                        onClick={cancelSplitEdit}
                        className="w-8 h-8 rounded-lg flex items-center justify-center bg-white/10 text-muted-foreground hover:bg-white/20"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1">
                      <motion.button
                        whileTap={{ scale: 0.98 }}
                        onClick={() => startEditingSplit(index)}
                        className="flex-1 flex items-center gap-3 p-2 rounded-xl transition-colors hover:bg-white/5"
                      >
                        <span className="w-6 h-6 rounded-full flex items-center justify-center bg-white/10 text-xs font-semibold text-muted-foreground">
                          {index + 1}
                        </span>
                        <span className="flex-1 text-left text-sm">{day}</span>
                        <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                      </motion.button>
                      {splitRotation.length > 1 && (
                        <button
                          onClick={() => removeSplitDay(index)}
                          disabled={savingSplit}
                          className="w-7 h-7 rounded-lg flex items-center justify-center text-red-400/60 hover:text-red-400 hover:bg-red-500/10 disabled:opacity-50"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}

              <motion.button
                whileTap={{ scale: 0.98 }}
                onClick={toggleSplitRepeating}
                disabled={savingSplit}
                className={`w-full flex items-center justify-center gap-2 p-2 mt-2 rounded-xl transition-colors disabled:opacity-50 ${
                  isRepeating
                    ? "bg-primary text-white"
                    : "bg-primary/10 text-primary hover:bg-primary/20"
                }`}
              >
                <Repeat className="w-4 h-4" />
                <span className="text-sm font-medium">
                  {isRepeating ? "Cycle Repeats" : "Repeat Cycle"}
                </span>
                {isRepeating && <Check className="w-4 h-4" />}
              </motion.button>
            </div>
          </GlassCard>
        )}

        {/* Reset Coach */}
        <GlassCard className="p-4">
          <motion.button
            whileTap={{ scale: 0.98 }}
            onClick={() => setShowResetConfirm(true)}
            className="w-full flex items-center gap-3 text-left"
          >
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center">
              <RotateCcw className="w-5 h-5 text-amber-500" />
            </div>
            <div>
              <p className="font-medium">Reset Coach</p>
              <p className="text-xs text-muted-foreground">Clear conversation history and coach memory</p>
            </div>
          </motion.button>
        </GlassCard>
      </div>

      {/* Reset Confirmation Modal */}
      <AnimatePresence>
        {showResetConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
            onClick={() => !resetting && setShowResetConfirm(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm rounded-2xl p-6"
              style={{
                background: "rgba(26, 26, 36, 0.95)",
                backdropFilter: "blur(24px)",
                border: "1px solid rgba(255, 255, 255, 0.05)",
              }}
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-xl bg-amber-500/20 flex items-center justify-center">
                  <AlertTriangle className="w-6 h-6 text-amber-500" />
                </div>
                <div>
                  <h3 className="font-semibold text-lg">Reset Coach</h3>
                  <p className="text-xs text-muted-foreground">This cannot be undone</p>
                </div>
              </div>

              <p className="text-sm text-zinc-300 mb-6">
                This will clear your conversation history and coach memory. Your workout logs,
                nutrition data, stats, and account settings will not be affected.
              </p>
              <p className="text-sm text-zinc-400 mb-6">
                The coach will start fresh with no memory of past conversations. This is useful if
                the coach has outdated information or you want a fresh start.
              </p>

              <div className="flex gap-3">
                <button
                  onClick={() => setShowResetConfirm(false)}
                  disabled={resetting}
                  className="flex-1 py-3 rounded-xl bg-white/10 text-white font-medium hover:bg-white/20 disabled:opacity-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleResetCoach}
                  disabled={resetting}
                  className="flex-1 py-3 rounded-xl bg-amber-500 text-black font-semibold hover:bg-amber-400 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                >
                  {resetting ? (
                    <>
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                      >
                        <RotateCcw className="w-4 h-4" />
                      </motion.div>
                      Resetting...
                    </>
                  ) : (
                    "Reset Coach"
                  )}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

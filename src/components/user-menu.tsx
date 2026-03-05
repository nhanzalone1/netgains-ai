"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { User, LogOut, Palette, Check, Flame, Calendar, Pencil, X, Save, Repeat, Trash2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "./auth-provider";
import { useTheme, themes } from "./theme-provider";
import { IconButton } from "./ui/icon-button";

const intensityOptions = [
  { id: "light", name: "Light", description: "~300 cal deficit/surplus" },
  { id: "moderate", name: "Moderate", description: "~500 cal deficit/surplus" },
  { id: "aggressive", name: "Aggressive", description: "~750+ cal deficit/surplus" },
] as const;

type IntensityId = typeof intensityOptions[number]["id"];

export function UserMenu() {
  const { user } = useAuth();
  const { theme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const [showThemes, setShowThemes] = useState(false);
  const [showIntensity, setShowIntensity] = useState(false);
  const [showSplit, setShowSplit] = useState(false);
  const [intensity, setIntensityState] = useState<IntensityId>("moderate");
  const [splitRotation, setSplitRotation] = useState<string[]>([]);
  const [editingSplitIndex, setEditingSplitIndex] = useState<number | null>(null);
  const [editingSplitValue, setEditingSplitValue] = useState("");
  const [savingSplit, setSavingSplit] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  // Load intensity and split rotation from profile on mount
  useEffect(() => {
    if (!user?.id) return;
    const loadUserData = async () => {
      // Load intensity
      const { data: profileData } = await supabase
        .from("profiles")
        .select("coaching_intensity")
        .eq("id", user.id)
        .single();
      if (profileData?.coaching_intensity) {
        setIntensityState(profileData.coaching_intensity as IntensityId);
      }

      // Load split rotation
      const { data: splitData } = await supabase
        .from("coach_memory")
        .select("value")
        .eq("user_id", user.id)
        .eq("key", "split_rotation")
        .single();
      if (splitData?.value) {
        try {
          const parsed = JSON.parse(splitData.value);
          if (Array.isArray(parsed)) {
            setSplitRotation(parsed);
          }
        } catch {
          // ignore parse errors
        }
      }
    };
    loadUserData();
  }, [user?.id, supabase]);

  const setIntensity = async (newIntensity: IntensityId) => {
    setIntensityState(newIntensity);
    if (user?.id) {
      // Update intensity in profile
      await supabase
        .from("profiles")
        .update({ coaching_intensity: newIntensity })
        .eq("id", user.id);

      // Recalculate nutrition goals based on new intensity
      try {
        await fetch("/api/nutrition/recalculate", { method: "POST" });
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
      // Check if split_rotation exists
      const { data: existing } = await supabase
        .from("coach_memory")
        .select("id")
        .eq("user_id", user.id)
        .eq("key", "split_rotation")
        .single();

      if (existing) {
        await supabase
          .from("coach_memory")
          .update({ value: JSON.stringify(newRotation) })
          .eq("id", existing.id);
      } else {
        await supabase
          .from("coach_memory")
          .insert({ user_id: user.id, key: "split_rotation", value: JSON.stringify(newRotation) });
      }

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

  const repeatSplitRotation = async () => {
    if (!user?.id || splitRotation.length === 0) return;

    const doubled = [...splitRotation, ...splitRotation];

    setSavingSplit(true);
    try {
      const { data: existing } = await supabase
        .from("coach_memory")
        .select("id")
        .eq("user_id", user.id)
        .eq("key", "split_rotation")
        .single();

      if (existing) {
        await supabase
          .from("coach_memory")
          .update({ value: JSON.stringify(doubled) })
          .eq("id", existing.id);
      }

      setSplitRotation(doubled);
    } catch (error) {
      console.error("Failed to repeat split:", error);
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
        .single();

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

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push("/auth/login");
    router.refresh();
  };

  if (!user) return null;

  return (
    <div className="relative">
      <IconButton onClick={() => setOpen(!open)}>
        <User className="w-5 h-5" />
      </IconButton>

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-10"
              onClick={() => {
                setOpen(false);
                setShowThemes(false);
              }}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: -10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -10 }}
              transition={{ duration: 0.15 }}
              className="absolute right-0 top-14 z-20 min-w-[220px] overflow-hidden rounded-2xl"
              style={{
                background: "rgba(26, 26, 36, 0.95)",
                backdropFilter: "blur(24px)",
                WebkitBackdropFilter: "blur(24px)",
                border: "1px solid rgba(255, 255, 255, 0.05)",
                boxShadow: "0 8px 32px rgba(0, 0, 0, 0.4)",
              }}
            >
              <div className="p-3 border-b border-white/5">
                <p className="text-xs text-muted-foreground truncate uppercase tracking-wide">
                  {user.email}
                </p>
              </div>

              {/* Theme Picker */}
              <div className="border-b border-white/5">
                <motion.button
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setShowThemes(!showThemes)}
                  className="w-full flex items-center gap-3 p-3 text-left hover:bg-white/5 transition-colors min-h-[44px]"
                >
                  <Palette className="w-4 h-4 text-primary" />
                  <span className="font-medium flex-1">Theme</span>
                  <div
                    className="w-4 h-4 rounded-full"
                    style={{ background: theme.primary }}
                  />
                </motion.button>

                <AnimatePresence>
                  {showThemes && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="px-2 pb-2 grid grid-cols-3 gap-2">
                        {themes.map((t) => (
                          <motion.button
                            key={t.id}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => setTheme(t.id)}
                            className="flex flex-col items-center gap-1.5 p-2 rounded-xl transition-colors"
                            style={{
                              background:
                                theme.id === t.id
                                  ? "rgba(255, 255, 255, 0.1)"
                                  : "transparent",
                            }}
                          >
                            <div
                              className="w-8 h-8 rounded-full flex items-center justify-center"
                              style={{ background: t.primary }}
                            >
                              {theme.id === t.id && (
                                <Check className="w-4 h-4 text-white" />
                              )}
                            </div>
                            <span className="text-[10px] text-muted-foreground font-medium">
                              {t.name.split(" ")[0]}
                            </span>
                          </motion.button>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Coaching Intensity Picker */}
              <div className="border-b border-white/5">
                <motion.button
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setShowIntensity(!showIntensity)}
                  className="w-full flex items-center gap-3 p-3 text-left hover:bg-white/5 transition-colors min-h-[44px]"
                >
                  <Flame className="w-4 h-4 text-primary" />
                  <span className="font-medium flex-1">Goal Intensity</span>
                  <span className="text-xs text-muted-foreground capitalize">{intensity}</span>
                </motion.button>

                <AnimatePresence>
                  {showIntensity && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="px-2 pb-2 space-y-1">
                        {intensityOptions.map((opt) => (
                          <motion.button
                            key={opt.id}
                            whileTap={{ scale: 0.98 }}
                            onClick={() => setIntensity(opt.id)}
                            className="w-full flex items-center gap-3 p-2 rounded-xl transition-colors"
                            style={{
                              background:
                                intensity === opt.id
                                  ? "rgba(255, 255, 255, 0.1)"
                                  : "transparent",
                            }}
                          >
                            <div
                              className="w-6 h-6 rounded-full flex items-center justify-center border border-white/20"
                              style={{
                                background: intensity === opt.id ? "var(--primary)" : "transparent",
                              }}
                            >
                              {intensity === opt.id && (
                                <Check className="w-3 h-3 text-white" />
                              )}
                            </div>
                            <div className="flex-1 text-left">
                              <p className="text-sm font-medium">{opt.name}</p>
                              <p className="text-[10px] text-muted-foreground">{opt.description}</p>
                            </div>
                          </motion.button>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Split Rotation Editor */}
              {splitRotation.length > 0 && (
                <div className="border-b border-white/5">
                  <motion.button
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setShowSplit(!showSplit)}
                    className="w-full flex items-center gap-3 p-3 text-left hover:bg-white/5 transition-colors min-h-[44px]"
                  >
                    <Calendar className="w-4 h-4 text-primary" />
                    <span className="font-medium flex-1">Training Split</span>
                    <span className="text-xs text-muted-foreground">{splitRotation.filter(d => d !== "Rest").length} days</span>
                  </motion.button>

                  <AnimatePresence>
                    {showSplit && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <div className="px-2 pb-2 space-y-1">
                          <p className="text-[10px] text-muted-foreground px-2 mb-2">Tap to rename, swipe to delete</p>
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

                          {/* Repeat button */}
                          <motion.button
                            whileTap={{ scale: 0.98 }}
                            onClick={repeatSplitRotation}
                            disabled={savingSplit}
                            className="w-full flex items-center justify-center gap-2 p-2 mt-2 rounded-xl bg-primary/10 text-primary hover:bg-primary/20 disabled:opacity-50 transition-colors"
                          >
                            <Repeat className="w-4 h-4" />
                            <span className="text-sm font-medium">Repeat Cycle</span>
                          </motion.button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}

              <motion.button
                whileTap={{ scale: 0.98 }}
                onClick={handleSignOut}
                className="w-full flex items-center gap-3 p-3 text-left hover:bg-white/5 transition-colors min-h-[44px]"
              >
                <LogOut className="w-4 h-4 text-primary" />
                <span className="font-medium">Sign Out</span>
              </motion.button>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

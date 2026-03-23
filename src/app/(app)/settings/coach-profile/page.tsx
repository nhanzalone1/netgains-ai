"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, Loader2, Brain, ChevronDown } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { GlassCard } from "@/components/ui/glass-card";
import { apiFetch } from "@/lib/capacitor";
import type { KeyMemories } from "@/lib/supabase/types";

const DEFAULT_KEY_MEMORIES: KeyMemories = {
  supplements: "",
  food_available: "",
  preferences: "",
  injuries: "",
};

const FIELD_CONFIG = {
  supplements: {
    label: "Supplements",
    placeholder: "e.g., creatine 5g daily, vitamin D 5000iu morning, fish oil with dinner",
    rows: 3,
  },
  food_available: {
    label: "Food Available",
    placeholder: "e.g., dorm: protein powder, rice cakes, PB. Dining hall: fruit, bagels, grilled chicken always available",
    rows: 4,
  },
  preferences: {
    label: "Preferences",
    placeholder: "e.g., grams not ounces, cardio after lifting, incline walk 8-10%",
    rows: 3,
  },
  injuries: {
    label: "Injuries / Limitations",
    placeholder: "e.g., left shoulder clicks on overhead press, avoid behind-neck movements",
    rows: 3,
  },
} as const;

type FieldKey = keyof typeof FIELD_CONFIG;

export default function CoachProfilePage() {
  const router = useRouter();
  const [keyMemories, setKeyMemories] = useState<KeyMemories>(DEFAULT_KEY_MEMORIES);
  const [loading, setLoading] = useState(true);
  const [savingField, setSavingField] = useState<FieldKey | null>(null);
  const [savedField, setSavedField] = useState<FieldKey | null>(null);
  const [showAllMemories, setShowAllMemories] = useState(false);

  // Load key memories on mount
  useEffect(() => {
    const loadKeyMemories = async () => {
      try {
        const response = await apiFetch("/api/profile/key-memories");
        if (response.ok) {
          const data = await response.json();
          setKeyMemories(data.key_memories || DEFAULT_KEY_MEMORIES);
        }
      } catch (error) {
        console.error("Failed to load key memories:", error);
      }
      setLoading(false);
    };
    loadKeyMemories();
  }, []);

  // Debounced save function
  const saveField = useCallback(async (field: FieldKey, value: string) => {
    setSavingField(field);
    try {
      const response = await apiFetch("/api/profile/key-memories", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
      });

      if (response.ok) {
        setSavedField(field);
        // Clear the saved indicator after 2 seconds
        setTimeout(() => setSavedField(null), 2000);
      }
    } catch (error) {
      console.error("Failed to save key memory:", error);
    }
    setSavingField(null);
  }, []);

  const handleBlur = (field: FieldKey, value: string) => {
    // Only save if value changed from what we loaded
    if (value !== keyMemories[field]) {
      saveField(field, value);
      setKeyMemories(prev => ({ ...prev, [field]: value }));
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen p-4 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

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
          <div>
            <h1 className="text-lg font-semibold">Coach Profile</h1>
            <p className="text-xs text-muted-foreground">Info the coach always remembers</p>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Intro Card */}
        <GlassCard className="p-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center flex-shrink-0">
              <Brain className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">
                Add details here that you want the coach to always remember. These are included in every conversation.
              </p>
            </div>
          </div>
        </GlassCard>

        {/* Key Memory Fields */}
        {(Object.keys(FIELD_CONFIG) as FieldKey[]).map((field) => {
          const config = FIELD_CONFIG[field];
          const isSaving = savingField === field;
          const isSaved = savedField === field;

          return (
            <GlassCard key={field} className="p-4">
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-white">
                  {config.label}
                </label>
                <AnimatePresence mode="wait">
                  {isSaving && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="flex items-center gap-1 text-xs text-muted-foreground"
                    >
                      <Loader2 className="w-3 h-3 animate-spin" />
                      <span>Saving...</span>
                    </motion.div>
                  )}
                  {isSaved && !isSaving && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0 }}
                      className="flex items-center gap-1 text-xs text-green-400"
                    >
                      <Check className="w-3 h-3" />
                      <span>Saved</span>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              <textarea
                defaultValue={keyMemories[field]}
                placeholder={config.placeholder}
                rows={config.rows}
                onBlur={(e) => handleBlur(field, e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
              />
            </GlassCard>
          );
        })}

        {/* View All Memories Link */}
        <button
          onClick={() => setShowAllMemories(!showAllMemories)}
          className="w-full flex items-center justify-between p-4 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors"
        >
          <span className="text-sm text-muted-foreground">View all coach memories</span>
          <ChevronDown
            className={`w-4 h-4 text-muted-foreground transition-transform ${showAllMemories ? "rotate-180" : ""}`}
          />
        </button>

        <AnimatePresence>
          {showAllMemories && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <CoachMemoriesDebug />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// Debug view of all coach memories (Pinecone + coach_memory table)
function CoachMemoriesDebug() {
  const [memories, setMemories] = useState<{ fact: string; category: string }[]>([]);
  const [savedItems, setSavedItems] = useState<{ key: string; value: string; label: string }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadMemories = async () => {
      try {
        const response = await apiFetch("/api/memory/list");
        if (response.ok) {
          const data = await response.json();
          setMemories(data.memories || []);
          setSavedItems(data.savedItems || []);
        }
      } catch (error) {
        console.error("Failed to load memories:", error);
      }
      setLoading(false);
    };
    loadMemories();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-5 h-5 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <GlassCard className="p-4">
      <h3 className="text-sm font-medium text-white mb-3">All Coach Memories</h3>

      {savedItems.length > 0 && (
        <div className="mb-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-2">Saved Data</p>
          <div className="space-y-2">
            {savedItems.map((item, index) => (
              <div key={index} className="p-2 rounded-lg bg-white/5 text-xs">
                <span className="text-primary font-medium">{item.label}:</span>{" "}
                <span className="text-zinc-300">{item.value}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {memories.length > 0 && (
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-2">
            Learned from Conversations
          </p>
          <div className="space-y-2">
            {memories.map((memory, index) => (
              <div key={index} className="p-2 rounded-lg bg-white/5 text-xs">
                <span className="text-zinc-500">[{memory.category}]</span>{" "}
                <span className="text-zinc-300">{memory.fact}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {memories.length === 0 && savedItems.length === 0 && (
        <p className="text-sm text-zinc-500 text-center py-4">
          No memories yet. Keep chatting with your coach!
        </p>
      )}
    </GlassCard>
  );
}

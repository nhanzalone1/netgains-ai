"use client";

import { useState, useEffect, useMemo } from "react";
import { X, Check, ChevronRight, ChevronDown, AlertTriangle, Dumbbell, Info, ArrowRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import { MUSCLE_GROUP_LABELS, type MuscleGroup } from "@/lib/supabase/types";
import { apiFetch } from "@/lib/capacitor";

interface SplitMigrationModalProps {
  open: boolean;
  onClose: () => void;
  locationId: string;
  userId: string;
  currentFolders: Array<{ id: string; name: string; exercise_count: number }>;
  onComplete: () => void;
}

interface ExerciseTemplate {
  id: string;
  name: string;
  equipment: string;
  muscle_group: MuscleGroup[];
}

interface SplitPreset {
  name: string;
  days: Array<{
    name: string;
    muscleGroups: MuscleGroup[];
  }>;
}

// Common split presets
const SPLIT_PRESETS: SplitPreset[] = [
  {
    name: "Push / Pull / Legs",
    days: [
      { name: "Push", muscleGroups: ["chest", "front_delt", "side_delt", "triceps"] },
      { name: "Pull", muscleGroups: ["back", "rear_delt", "biceps", "forearms"] },
      { name: "Legs", muscleGroups: ["quads", "hamstrings", "glutes", "calves", "abs"] },
    ],
  },
  {
    name: "Upper / Lower",
    days: [
      { name: "Upper", muscleGroups: ["chest", "back", "front_delt", "side_delt", "rear_delt", "biceps", "triceps", "forearms"] },
      { name: "Lower", muscleGroups: ["quads", "hamstrings", "glutes", "calves", "abs"] },
    ],
  },
  {
    name: "Bro Split (5-Day)",
    days: [
      { name: "Chest", muscleGroups: ["chest"] },
      { name: "Back", muscleGroups: ["back", "rear_delt"] },
      { name: "Shoulders", muscleGroups: ["front_delt", "side_delt", "rear_delt"] },
      { name: "Arms", muscleGroups: ["biceps", "triceps", "forearms"] },
      { name: "Legs", muscleGroups: ["quads", "hamstrings", "glutes", "calves", "abs"] },
    ],
  },
  {
    name: "Full Body",
    days: [
      { name: "Full Body A", muscleGroups: ["chest", "back", "quads", "hamstrings", "front_delt", "biceps", "triceps", "abs"] },
      { name: "Full Body B", muscleGroups: ["chest", "back", "quads", "glutes", "side_delt", "biceps", "triceps", "calves"] },
      { name: "Full Body C", muscleGroups: ["chest", "back", "hamstrings", "glutes", "rear_delt", "biceps", "triceps", "abs"] },
    ],
  },
];

type Step = "select" | "preview" | "confirm";

export function SplitMigrationModal({
  open,
  onClose,
  locationId,
  userId,
  currentFolders,
  onComplete,
}: SplitMigrationModalProps) {
  const supabase = createClient();

  const [step, setStep] = useState<Step>("select");
  const [selectedPreset, setSelectedPreset] = useState<SplitPreset | null>(null);
  const [exercises, setExercises] = useState<ExerciseTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());

  // Load exercises when modal opens
  useEffect(() => {
    if (open) {
      loadExercises();
      setStep("select");
      setSelectedPreset(null);
      setExpandedDays(new Set());
    }
  }, [open]);

  const loadExercises = async () => {
    setLoading(true);
    try {
      // Get all exercises for this gym (including universal exercises)
      const { data, error } = await supabase
        .from("exercise_templates")
        .select("id, name, equipment, muscle_group, gym_id, is_gym_specific")
        .eq("user_id", userId);

      if (!error && data) {
        // Filter to exercises that can appear at this gym
        const filtered = data.filter((ex) => {
          if (ex.is_gym_specific === false) return true;
          return ex.gym_id === locationId;
        });
        setExercises(filtered as ExerciseTemplate[]);
      }
    } catch (error) {
      console.error("Failed to load exercises:", error);
    }
    setLoading(false);
  };

  // Group exercises by which new split day they'll appear in
  const exercisesByDay = useMemo(() => {
    if (!selectedPreset) return new Map<string, ExerciseTemplate[]>();

    const grouped = new Map<string, ExerciseTemplate[]>();
    const unassigned: ExerciseTemplate[] = [];

    exercises.forEach((exercise) => {
      let assigned = false;
      selectedPreset.days.forEach((day) => {
        const hasOverlap = exercise.muscle_group?.some((mg) =>
          day.muscleGroups.includes(mg)
        );
        if (hasOverlap) {
          const existing = grouped.get(day.name) || [];
          // Avoid duplicates (exercise can match multiple days)
          if (!existing.find((e) => e.id === exercise.id)) {
            grouped.set(day.name, [...existing, exercise]);
          }
          assigned = true;
        }
      });
      if (!assigned && exercise.muscle_group?.length > 0) {
        unassigned.push(exercise);
      }
    });

    if (unassigned.length > 0) {
      grouped.set("Uncategorized", unassigned);
    }

    return grouped;
  }, [selectedPreset, exercises]);

  const handleSelectPreset = (preset: SplitPreset) => {
    setSelectedPreset(preset);
    // Auto-expand all days for preview
    setExpandedDays(new Set(preset.days.map((d) => d.name)));
    setStep("preview");
  };

  const toggleDayExpanded = (dayName: string) => {
    setExpandedDays((prev) => {
      const next = new Set(prev);
      if (next.has(dayName)) {
        next.delete(dayName);
      } else {
        next.add(dayName);
      }
      return next;
    });
  };

  const handleConfirm = async () => {
    if (!selectedPreset) return;

    setSaving(true);
    try {
      // Delete existing folders for this location
      await supabase
        .from("folders")
        .delete()
        .eq("location_id", locationId)
        .eq("user_id", userId);

      // Create new folders with the preset structure
      for (let i = 0; i < selectedPreset.days.length; i++) {
        const day = selectedPreset.days[i];

        // Create folder
        const { data: folder, error: folderError } = await supabase
          .from("folders")
          .insert({
            user_id: userId,
            location_id: locationId,
            name: day.name,
            order_index: i,
          })
          .select()
          .single();

        if (folderError || !folder) {
          console.error("Failed to create folder:", folderError);
          continue;
        }

        // Create split_muscle_groups mapping
        await apiFetch("/api/split-muscle-groups", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            folderId: folder.id,
            muscleGroups: day.muscleGroups,
          }),
        });
      }

      onComplete();
      onClose();
    } catch (error) {
      console.error("Failed to migrate split:", error);
    }
    setSaving(false);
  };

  const renderSelectStep = () => (
    <div className="flex-1 overflow-y-auto px-4 py-4">
      {/* Current Split Info */}
      <div className="mb-6 p-4 rounded-xl bg-white/5 border border-white/10">
        <div className="flex items-center gap-2 mb-2">
          <Info className="w-4 h-4 text-gray-400" />
          <span className="text-sm font-medium text-gray-300">Current Split</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {currentFolders.map((folder) => (
            <span
              key={folder.id}
              className="px-3 py-1.5 rounded-lg bg-white/10 text-sm text-gray-300"
            >
              {folder.name} ({folder.exercise_count})
            </span>
          ))}
        </div>
      </div>

      {/* Instructions */}
      <p className="text-sm text-gray-400 mb-6">
        Choose a new split structure. Your exercises will be automatically reorganized based on their muscle groups.
      </p>

      {/* Preset Options */}
      <div className="space-y-3">
        {SPLIT_PRESETS.map((preset) => (
          <button
            key={preset.name}
            onClick={() => handleSelectPreset(preset)}
            className="w-full p-4 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20 transition-all text-left"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="font-semibold text-white">{preset.name}</span>
              <ChevronRight className="w-5 h-5 text-gray-400" />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {preset.days.map((day) => (
                <span
                  key={day.name}
                  className="px-2 py-1 rounded-md bg-[#22d3ee]/20 text-[#22d3ee] text-xs font-medium"
                >
                  {day.name}
                </span>
              ))}
            </div>
          </button>
        ))}
      </div>
    </div>
  );

  const renderPreviewStep = () => {
    if (!selectedPreset) return null;

    return (
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {/* Migration Message */}
        <div className="mb-6 p-4 rounded-xl bg-[#22d3ee]/10 border border-[#22d3ee]/30">
          <div className="flex items-start gap-3">
            <Dumbbell className="w-5 h-5 text-[#22d3ee] mt-0.5" />
            <div>
              <p className="text-sm font-medium text-white mb-1">
                Reorganizing to {selectedPreset.name}
              </p>
              <p className="text-xs text-gray-400">
                Your exercises will be reorganized into your new split based on their muscle groups. Review the changes below.
              </p>
            </div>
          </div>
        </div>

        {/* Preview Groups */}
        <div className="space-y-3">
          {selectedPreset.days.map((day) => {
            const dayExercises = exercisesByDay.get(day.name) || [];
            const isExpanded = expandedDays.has(day.name);

            return (
              <div
                key={day.name}
                className="rounded-xl bg-white/5 border border-white/10 overflow-hidden"
              >
                <button
                  onClick={() => toggleDayExpanded(day.name)}
                  className="w-full p-4 flex items-center justify-between"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[#22d3ee]/20 flex items-center justify-center">
                      <Dumbbell className="w-5 h-5 text-[#22d3ee]" />
                    </div>
                    <div className="text-left">
                      <p className="font-semibold text-white">{day.name}</p>
                      <p className="text-xs text-gray-400">
                        {dayExercises.length} exercise{dayExercises.length !== 1 ? "s" : ""}
                      </p>
                    </div>
                  </div>
                  {isExpanded ? (
                    <ChevronDown className="w-5 h-5 text-gray-400" />
                  ) : (
                    <ChevronRight className="w-5 h-5 text-gray-400" />
                  )}
                </button>

                <AnimatePresence>
                  {isExpanded && dayExercises.length > 0 && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="px-4 pb-4 space-y-2">
                        {dayExercises.slice(0, 10).map((exercise) => (
                          <div
                            key={exercise.id}
                            className="flex items-center gap-3 px-3 py-2 rounded-lg bg-white/5"
                          >
                            <span className="text-sm text-gray-300 flex-1">
                              {exercise.name}
                            </span>
                            <span className="text-xs text-gray-500 capitalize">
                              {exercise.equipment}
                            </span>
                          </div>
                        ))}
                        {dayExercises.length > 10 && (
                          <p className="text-xs text-gray-500 text-center py-2">
                            +{dayExercises.length - 10} more exercises
                          </p>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Muscle Groups for this day */}
                <div className="px-4 pb-3 flex flex-wrap gap-1">
                  {day.muscleGroups.map((mg) => (
                    <span
                      key={mg}
                      className="px-2 py-0.5 rounded text-xs bg-white/10 text-gray-400"
                    >
                      {MUSCLE_GROUP_LABELS[mg]}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}

          {/* Uncategorized exercises warning */}
          {exercisesByDay.has("Uncategorized") && (
            <div className="rounded-xl bg-orange-500/10 border border-orange-500/30 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-orange-400 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-orange-300 mb-1">
                    {exercisesByDay.get("Uncategorized")?.length} exercises won&apos;t appear in any split
                  </p>
                  <p className="text-xs text-gray-400">
                    These exercises have muscle groups that don&apos;t match the new split. You can categorize them later in the exercise picker.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderConfirmStep = () => {
    if (!selectedPreset) return null;

    return (
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {/* Summary */}
        <div className="mb-6 p-4 rounded-xl bg-white/5 border border-white/10">
          <div className="flex items-center gap-2 mb-3">
            <ArrowRight className="w-5 h-5 text-[#22d3ee]" />
            <span className="font-semibold text-white">Migration Summary</span>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-400">New structure:</span>
              <span className="text-white font-medium">{selectedPreset.name}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-400">Split days:</span>
              <span className="text-white font-medium">{selectedPreset.days.length}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-400">Total exercises:</span>
              <span className="text-white font-medium">{exercises.length}</span>
            </div>
          </div>
        </div>

        {/* Warning about history */}
        <div className="mb-6 p-4 rounded-xl bg-green-500/10 border border-green-500/30">
          <div className="flex items-start gap-3">
            <Check className="w-5 h-5 text-green-400 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-green-300 mb-1">
                Your exercise history and PRs will not be affected
              </p>
              <p className="text-xs text-gray-400">
                Only the organizational view is changing. All your logged workouts, sets, and personal records remain intact.
              </p>
            </div>
          </div>
        </div>

        {/* Old vs New visualization */}
        <div className="p-4 rounded-xl bg-white/5 border border-white/10">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
            Changes
          </p>

          <div className="flex items-start gap-3">
            {/* Old Structure */}
            <div className="flex-1">
              <p className="text-xs text-gray-500 mb-2">Old</p>
              <div className="space-y-1.5">
                {currentFolders.map((folder) => (
                  <div
                    key={folder.id}
                    className="px-2 py-1.5 rounded-lg bg-red-500/10 text-red-300 text-xs"
                  >
                    {folder.name}
                  </div>
                ))}
              </div>
            </div>

            {/* Arrow */}
            <div className="pt-6">
              <ArrowRight className="w-5 h-5 text-gray-500" />
            </div>

            {/* New Structure */}
            <div className="flex-1">
              <p className="text-xs text-gray-500 mb-2">New</p>
              <div className="space-y-1.5">
                {selectedPreset.days.map((day) => (
                  <div
                    key={day.name}
                    className="px-2 py-1.5 rounded-lg bg-green-500/10 text-green-300 text-xs"
                  >
                    {day.name}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[200]"
          style={{ background: "#0d1117" }}
        >
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            className="h-full flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-4 border-b border-white/10">
              <button
                onClick={() => {
                  if (step === "preview") {
                    setStep("select");
                  } else if (step === "confirm") {
                    setStep("preview");
                  } else {
                    onClose();
                  }
                }}
                className="w-10 h-10 rounded-xl flex items-center justify-center bg-white/5"
              >
                <X className="w-5 h-5" />
              </button>
              <div className="text-center">
                <h1 className="text-lg font-bold text-white">
                  {step === "select" && "Change Split Structure"}
                  {step === "preview" && "Preview Changes"}
                  {step === "confirm" && "Confirm Migration"}
                </h1>
                <p className="text-sm text-gray-400">
                  {step === "select" && "Choose a new training split"}
                  {step === "preview" && "Review exercise assignments"}
                  {step === "confirm" && "Ready to apply changes"}
                </p>
              </div>
              <div className="w-10" /> {/* Spacer for centering */}
            </div>

            {/* Content */}
            {loading ? (
              <div className="flex-1 flex items-center justify-center">
                <div className="w-8 h-8 border-2 border-[#22d3ee] border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              <>
                {step === "select" && renderSelectStep()}
                {step === "preview" && renderPreviewStep()}
                {step === "confirm" && renderConfirmStep()}
              </>
            )}

            {/* Footer */}
            {step !== "select" && (
              <div className="px-4 py-4 border-t border-white/10 bg-white/5">
                {step === "preview" && (
                  <button
                    onClick={() => setStep("confirm")}
                    className="w-full py-3.5 rounded-xl bg-[#22d3ee] text-black font-semibold"
                  >
                    Continue
                  </button>
                )}
                {step === "confirm" && (
                  <button
                    onClick={handleConfirm}
                    disabled={saving}
                    className="w-full py-3.5 rounded-xl bg-[#22d3ee] text-black font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {saving ? (
                      <>
                        <div className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin" />
                        Migrating...
                      </>
                    ) : (
                      <>
                        <Check className="w-5 h-5" />
                        Apply Changes
                      </>
                    )}
                  </button>
                )}
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

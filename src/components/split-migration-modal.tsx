"use client";

import { useState, useEffect, useMemo } from "react";
import { X, Check, ChevronRight, ChevronDown, AlertTriangle, Dumbbell, Info, ArrowRight, Plus, Trash2, Pencil } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import { MUSCLE_GROUPS, MUSCLE_GROUP_LABELS, type MuscleGroup } from "@/lib/supabase/types";
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

interface SplitDay {
  name: string;
  muscleGroups: MuscleGroup[];
}

interface SplitPreset {
  name: string;
  days: SplitDay[];
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

// Group muscle groups by body region for custom editor
const MUSCLE_GROUP_SECTIONS = [
  {
    label: "Push",
    groups: ["chest", "front_delt", "side_delt", "triceps"] as MuscleGroup[],
  },
  {
    label: "Pull",
    groups: ["back", "rear_delt", "biceps", "forearms"] as MuscleGroup[],
  },
  {
    label: "Lower",
    groups: ["quads", "hamstrings", "glutes", "calves", "abs"] as MuscleGroup[],
  },
];

type Step = "select" | "custom" | "preview" | "confirm";

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
  const [customDays, setCustomDays] = useState<SplitDay[]>([{ name: "", muscleGroups: [] }]);
  const [editingDayIndex, setEditingDayIndex] = useState<number | null>(null);
  const [exercises, setExercises] = useState<ExerciseTemplate[]>([]);
  const [excludedExercises, setExcludedExercises] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());

  // Load exercises when modal opens
  useEffect(() => {
    if (open) {
      loadExercises();
      setStep("select");
      setSelectedPreset(null);
      setCustomDays([{ name: "", muscleGroups: [] }]);
      setEditingDayIndex(null);
      setExcludedExercises(new Set());
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

  // Get the active split config (preset or custom)
  const activeSplit = useMemo(() => {
    if (selectedPreset) return selectedPreset;
    // Build custom preset from customDays
    const validDays = customDays.filter(d => d.name.trim() && d.muscleGroups.length > 0);
    if (validDays.length === 0) return null;
    return { name: "Custom", days: validDays };
  }, [selectedPreset, customDays]);

  // Group exercises by which new split day they'll appear in
  const exercisesByDay = useMemo(() => {
    if (!activeSplit) return new Map<string, ExerciseTemplate[]>();

    const grouped = new Map<string, ExerciseTemplate[]>();
    const unassigned: ExerciseTemplate[] = [];

    exercises.forEach((exercise) => {
      // Skip excluded exercises
      if (excludedExercises.has(exercise.id)) return;

      let assigned = false;
      activeSplit.days.forEach((day) => {
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
  }, [activeSplit, exercises, excludedExercises]);

  const handleSelectPreset = (preset: SplitPreset) => {
    setSelectedPreset(preset);
    // Auto-expand all days for preview
    setExpandedDays(new Set(preset.days.map((d) => d.name)));
    setStep("preview");
  };

  const handleStartCustom = () => {
    setSelectedPreset(null);
    setCustomDays([{ name: "", muscleGroups: [] }]);
    setStep("custom");
  };

  const handleAddCustomDay = () => {
    setCustomDays([...customDays, { name: "", muscleGroups: [] }]);
    setEditingDayIndex(customDays.length);
  };

  const handleRemoveCustomDay = (index: number) => {
    setCustomDays(customDays.filter((_, i) => i !== index));
    if (editingDayIndex === index) setEditingDayIndex(null);
  };

  const handleUpdateDayName = (index: number, name: string) => {
    const updated = [...customDays];
    updated[index] = { ...updated[index], name };
    setCustomDays(updated);
  };

  const handleToggleMuscleGroup = (dayIndex: number, group: MuscleGroup) => {
    const updated = [...customDays];
    const day = updated[dayIndex];
    if (day.muscleGroups.includes(group)) {
      day.muscleGroups = day.muscleGroups.filter(g => g !== group);
    } else {
      day.muscleGroups = [...day.muscleGroups, group];
    }
    setCustomDays(updated);
  };

  const handleCustomContinue = () => {
    const validDays = customDays.filter(d => d.name.trim() && d.muscleGroups.length > 0);
    if (validDays.length === 0) return;
    setExpandedDays(new Set(validDays.map(d => d.name)));
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

  const toggleExcludeExercise = (exerciseId: string) => {
    setExcludedExercises(prev => {
      const next = new Set(prev);
      if (next.has(exerciseId)) {
        next.delete(exerciseId);
      } else {
        next.add(exerciseId);
      }
      return next;
    });
  };

  const handleConfirm = async () => {
    if (!activeSplit) return;

    setSaving(true);
    try {
      // IMPORTANT: First, detach all exercise_templates from folders at this location
      // This prevents cascade deletion when we delete folders
      const folderIds = currentFolders.map(f => f.id);
      if (folderIds.length > 0) {
        await supabase
          .from("exercise_templates")
          .update({ folder_id: null })
          .in("folder_id", folderIds);
      }

      // Now safe to delete existing folders for this location
      await supabase
        .from("folders")
        .delete()
        .eq("location_id", locationId)
        .eq("user_id", userId);

      // Create new folders with the split structure
      for (let i = 0; i < activeSplit.days.length; i++) {
        const day = activeSplit.days[i];

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

        {/* Custom Split Option */}
        <button
          onClick={handleStartCustom}
          className="w-full p-4 rounded-xl bg-white/5 border border-dashed border-white/20 hover:bg-white/10 hover:border-white/30 transition-all text-left"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="font-semibold text-white">Custom Split</span>
            <Plus className="w-5 h-5 text-gray-400" />
          </div>
          <p className="text-xs text-gray-400">
            Create your own split structure with custom days and muscle groups
          </p>
        </button>
      </div>
    </div>
  );

  const renderCustomStep = () => (
    <div className="flex-1 overflow-y-auto px-4 py-4">
      <p className="text-sm text-gray-400 mb-6">
        Create your custom split. Add days and assign muscle groups to each.
      </p>

      <div className="space-y-4">
        {customDays.map((day, index) => {
          const isEditing = editingDayIndex === index;

          return (
            <div
              key={index}
              className="rounded-xl bg-white/5 border border-white/10 overflow-hidden"
            >
              {/* Day Header */}
              <div className="p-4 flex items-center gap-3">
                <input
                  type="text"
                  value={day.name}
                  onChange={(e) => handleUpdateDayName(index, e.target.value)}
                  placeholder={`Day ${index + 1} name (e.g., Push)`}
                  className="flex-1 bg-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-[#22d3ee]"
                />
                <button
                  onClick={() => setEditingDayIndex(isEditing ? null : index)}
                  className={`w-10 h-10 rounded-lg flex items-center justify-center transition-colors ${
                    isEditing ? "bg-[#22d3ee] text-black" : "bg-white/10 text-gray-400"
                  }`}
                >
                  <Pencil className="w-4 h-4" />
                </button>
                {customDays.length > 1 && (
                  <button
                    onClick={() => handleRemoveCustomDay(index)}
                    className="w-10 h-10 rounded-lg bg-red-500/20 text-red-400 flex items-center justify-center"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Muscle Group Selector */}
              <AnimatePresence>
                {isEditing && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="px-4 pb-4 space-y-3">
                      {MUSCLE_GROUP_SECTIONS.map((section) => (
                        <div key={section.label}>
                          <p className="text-xs text-gray-500 mb-2">{section.label}</p>
                          <div className="flex flex-wrap gap-2">
                            {section.groups.map((group) => {
                              const isSelected = day.muscleGroups.includes(group);
                              return (
                                <button
                                  key={group}
                                  onClick={() => handleToggleMuscleGroup(index, group)}
                                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                                    isSelected
                                      ? "bg-[#22d3ee] text-black"
                                      : "bg-white/10 text-gray-400"
                                  }`}
                                >
                                  {MUSCLE_GROUP_LABELS[group]}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Selected muscle groups preview */}
              {!isEditing && day.muscleGroups.length > 0 && (
                <div className="px-4 pb-3 flex flex-wrap gap-1">
                  {day.muscleGroups.map((mg) => (
                    <span
                      key={mg}
                      className="px-2 py-0.5 rounded text-xs bg-[#22d3ee]/20 text-[#22d3ee]"
                    >
                      {MUSCLE_GROUP_LABELS[mg]}
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {/* Add Day Button */}
        <button
          onClick={handleAddCustomDay}
          className="w-full py-3 rounded-xl border border-dashed border-white/20 text-gray-400 hover:text-white hover:border-white/30 transition-all flex items-center justify-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Add Another Day
        </button>
      </div>
    </div>
  );

  const renderPreviewStep = () => {
    if (!activeSplit) return null;

    return (
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {/* Migration Message */}
        <div className="mb-6 p-4 rounded-xl bg-[#22d3ee]/10 border border-[#22d3ee]/30">
          <div className="flex items-start gap-3">
            <Dumbbell className="w-5 h-5 text-[#22d3ee] mt-0.5" />
            <div>
              <p className="text-sm font-medium text-white mb-1">
                Reorganizing to {activeSplit.name}
              </p>
              <p className="text-xs text-gray-400">
                Your exercises will be reorganized based on their muscle groups. Tap an exercise to exclude it from migration.
              </p>
            </div>
          </div>
        </div>

        {/* Preview Groups */}
        <div className="space-y-3">
          {activeSplit.days.map((day) => {
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
                        {dayExercises.map((exercise) => (
                          <button
                            key={exercise.id}
                            onClick={() => toggleExcludeExercise(exercise.id)}
                            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors text-left"
                          >
                            <span className="text-sm text-gray-300 flex-1">
                              {exercise.name}
                            </span>
                            <span className="text-xs text-gray-500 capitalize">
                              {exercise.equipment}
                            </span>
                            <X className="w-4 h-4 text-gray-500" />
                          </button>
                        ))}
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

          {/* Excluded exercises */}
          {excludedExercises.size > 0 && (
            <div className="rounded-xl bg-orange-500/10 border border-orange-500/30 p-4">
              <div className="flex items-start gap-3 mb-3">
                <AlertTriangle className="w-5 h-5 text-orange-400 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-orange-300">
                    {excludedExercises.size} exercise{excludedExercises.size !== 1 ? "s" : ""} excluded
                  </p>
                  <p className="text-xs text-gray-400">
                    These won&apos;t appear in the new split. Tap to restore.
                  </p>
                </div>
              </div>
              <div className="space-y-1">
                {exercises
                  .filter((e) => excludedExercises.has(e.id))
                  .map((exercise) => (
                    <button
                      key={exercise.id}
                      onClick={() => toggleExcludeExercise(exercise.id)}
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-left"
                    >
                      <Plus className="w-4 h-4 text-orange-400" />
                      <span className="text-sm text-gray-300">{exercise.name}</span>
                    </button>
                  ))}
              </div>
            </div>
          )}

          {/* Uncategorized exercises warning */}
          {exercisesByDay.has("Uncategorized") && (
            <div className="rounded-xl bg-yellow-500/10 border border-yellow-500/30 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-yellow-400 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-yellow-300 mb-1">
                    {exercisesByDay.get("Uncategorized")?.length} exercises won&apos;t appear in any split
                  </p>
                  <p className="text-xs text-gray-400">
                    These exercises have muscle groups that don&apos;t match the new split. You can recategorize them later.
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
    if (!activeSplit) return null;

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
              <span className="text-white font-medium">{activeSplit.name}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-400">Split days:</span>
              <span className="text-white font-medium">{activeSplit.days.length}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-400">Total exercises:</span>
              <span className="text-white font-medium">{exercises.length - excludedExercises.size}</span>
            </div>
            {excludedExercises.size > 0 && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-400">Excluded:</span>
                <span className="text-orange-400 font-medium">{excludedExercises.size}</span>
              </div>
            )}
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
                {activeSplit.days.map((day) => (
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

  const canContinueCustom = customDays.some(d => d.name.trim() && d.muscleGroups.length > 0);

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
                  if (step === "custom") {
                    setStep("select");
                  } else if (step === "preview") {
                    setStep(selectedPreset ? "select" : "custom");
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
                  {step === "custom" && "Custom Split"}
                  {step === "preview" && "Preview Changes"}
                  {step === "confirm" && "Confirm Migration"}
                </h1>
                <p className="text-sm text-gray-400">
                  {step === "select" && "Choose a new training split"}
                  {step === "custom" && "Define your split days"}
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
                {step === "custom" && renderCustomStep()}
                {step === "preview" && renderPreviewStep()}
                {step === "confirm" && renderConfirmStep()}
              </>
            )}

            {/* Footer */}
            {(step === "custom" || step === "preview" || step === "confirm") && (
              <div className="px-4 py-4 border-t border-white/10 bg-white/5">
                {step === "custom" && (
                  <button
                    onClick={handleCustomContinue}
                    disabled={!canContinueCustom}
                    className="w-full py-3.5 rounded-xl bg-[#22d3ee] text-black font-semibold disabled:opacity-50"
                  >
                    Preview Exercises
                  </button>
                )}
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

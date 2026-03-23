"use client";

import { useState, useEffect } from "react";
import { X, Check, Dumbbell } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import { MUSCLE_GROUPS, MUSCLE_GROUP_LABELS, type MuscleGroup } from "@/lib/supabase/types";
import { apiFetch } from "@/lib/capacitor";

interface SplitEditorModalProps {
  open: boolean;
  onClose: () => void;
  folderId: string;
  folderName: string;
  locationId: string;
  userId: string;
  onSave?: () => void;
}

// Group muscle groups by body region for better UX
const MUSCLE_GROUP_SECTIONS = [
  {
    label: "Upper Body - Push",
    groups: ["chest", "front_delt", "side_delt", "triceps"] as MuscleGroup[],
  },
  {
    label: "Upper Body - Pull",
    groups: ["back", "rear_delt", "biceps", "forearms"] as MuscleGroup[],
  },
  {
    label: "Lower Body",
    groups: ["quads", "hamstrings", "glutes", "calves"] as MuscleGroup[],
  },
  {
    label: "Core",
    groups: ["abs"] as MuscleGroup[],
  },
];

export function SplitEditorModal({
  open,
  onClose,
  folderId,
  folderName,
  locationId,
  userId,
  onSave,
}: SplitEditorModalProps) {
  const supabase = createClient();

  const [selectedMuscleGroups, setSelectedMuscleGroups] = useState<MuscleGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [exercisePreview, setExercisePreview] = useState<number>(0);
  const [previewLoading, setPreviewLoading] = useState(false);

  // Load existing mapping when modal opens
  useEffect(() => {
    if (open && folderId) {
      loadExistingMapping();
    }
  }, [open, folderId]);

  // Update exercise preview when selection changes
  useEffect(() => {
    if (open && selectedMuscleGroups.length > 0) {
      loadExercisePreview();
    } else {
      setExercisePreview(0);
    }
  }, [selectedMuscleGroups, open]);

  const loadExistingMapping = async () => {
    setLoading(true);
    try {
      const response = await apiFetch(`/api/split-muscle-groups?folderId=${folderId}`);
      if (response.ok) {
        const { data } = await response.json();
        if (data && data.length > 0 && data[0].muscle_groups) {
          setSelectedMuscleGroups(data[0].muscle_groups as MuscleGroup[]);
        } else {
          // Try to auto-parse from folder name
          await autoParseFromName();
        }
      }
    } catch (error) {
      console.error("Failed to load split mapping:", error);
    }
    setLoading(false);
  };

  const autoParseFromName = async () => {
    try {
      const response = await apiFetch("/api/exercise/parse-split", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ splitDays: [folderName] }),
      });
      if (response.ok) {
        const { mapping } = await response.json();
        if (mapping && mapping[folderName]) {
          setSelectedMuscleGroups(mapping[folderName] as MuscleGroup[]);
        }
      }
    } catch (error) {
      console.error("Failed to auto-parse split name:", error);
    }
  };

  const loadExercisePreview = async () => {
    setPreviewLoading(true);
    try {
      // Count exercises that match the selected muscle groups at this gym
      const { data, error } = await supabase
        .from("exercise_templates")
        .select("id, muscle_group, gym_id, is_gym_specific")
        .eq("user_id", userId);

      if (!error && data) {
        // Filter exercises that match muscle groups AND (gym matches OR universal)
        const matching = data.filter(ex => {
          // Check muscle group overlap
          const hasMatchingMuscle = ex.muscle_group?.some(
            (mg: string) => selectedMuscleGroups.includes(mg as MuscleGroup)
          );
          if (!hasMatchingMuscle) return false;

          // Check gym filter
          if (ex.is_gym_specific === false) return true;
          return ex.gym_id === locationId;
        });
        setExercisePreview(matching.length);
      }
    } catch (error) {
      console.error("Failed to load preview:", error);
    }
    setPreviewLoading(false);
  };

  const toggleMuscleGroup = (group: MuscleGroup) => {
    setSelectedMuscleGroups(prev =>
      prev.includes(group)
        ? prev.filter(g => g !== group)
        : [...prev, group]
    );
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const response = await apiFetch("/api/split-muscle-groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          folderId,
          muscleGroups: selectedMuscleGroups,
        }),
      });

      if (response.ok) {
        onSave?.();
        onClose();
      } else {
        console.error("Failed to save split mapping");
      }
    } catch (error) {
      console.error("Failed to save split mapping:", error);
    }
    setSaving(false);
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
                onClick={onClose}
                className="w-10 h-10 rounded-xl flex items-center justify-center bg-white/5"
              >
                <X className="w-5 h-5" />
              </button>
              <div className="text-center">
                <h1 className="text-lg font-bold text-white">Edit Split</h1>
                <p className="text-sm text-gray-400">{folderName}</p>
              </div>
              <button
                onClick={handleSave}
                disabled={saving || selectedMuscleGroups.length === 0}
                className="w-10 h-10 rounded-xl flex items-center justify-center bg-[#22d3ee] text-black disabled:opacity-50"
              >
                {saving ? (
                  <div className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Check className="w-5 h-5" />
                )}
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-4 py-4">
              {loading ? (
                <div className="flex items-center justify-center py-16">
                  <div className="w-8 h-8 border-2 border-[#22d3ee] border-t-transparent rounded-full animate-spin" />
                </div>
              ) : (
                <>
                  {/* Instructions */}
                  <p className="text-sm text-gray-400 mb-6">
                    Select the muscle groups trained on this day. Exercises matching these groups will appear when you start this workout.
                  </p>

                  {/* Muscle Group Sections */}
                  <div className="space-y-6">
                    {MUSCLE_GROUP_SECTIONS.map(section => (
                      <div key={section.label}>
                        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                          {section.label}
                        </h3>
                        <div className="flex flex-wrap gap-2">
                          {section.groups.map(group => {
                            const isSelected = selectedMuscleGroups.includes(group);
                            return (
                              <button
                                key={group}
                                onClick={() => toggleMuscleGroup(group)}
                                className={`px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
                                  isSelected
                                    ? "bg-[#22d3ee] text-black"
                                    : "bg-white/10 text-gray-400 hover:text-white hover:bg-white/15"
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

                  {/* Quick Presets */}
                  <div className="mt-8">
                    <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                      Quick Presets
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => setSelectedMuscleGroups(["chest", "front_delt", "triceps"])}
                        className="px-3 py-2 rounded-lg text-xs font-medium bg-white/5 text-gray-400 hover:text-white hover:bg-white/10"
                      >
                        Push
                      </button>
                      <button
                        onClick={() => setSelectedMuscleGroups(["back", "rear_delt", "biceps"])}
                        className="px-3 py-2 rounded-lg text-xs font-medium bg-white/5 text-gray-400 hover:text-white hover:bg-white/10"
                      >
                        Pull
                      </button>
                      <button
                        onClick={() => setSelectedMuscleGroups(["quads", "hamstrings", "glutes", "calves"])}
                        className="px-3 py-2 rounded-lg text-xs font-medium bg-white/5 text-gray-400 hover:text-white hover:bg-white/10"
                      >
                        Legs
                      </button>
                      <button
                        onClick={() => setSelectedMuscleGroups(["chest", "back", "front_delt", "side_delt", "rear_delt", "biceps", "triceps"])}
                        className="px-3 py-2 rounded-lg text-xs font-medium bg-white/5 text-gray-400 hover:text-white hover:bg-white/10"
                      >
                        Upper
                      </button>
                      <button
                        onClick={() => setSelectedMuscleGroups(["quads", "hamstrings", "glutes", "calves", "abs"])}
                        className="px-3 py-2 rounded-lg text-xs font-medium bg-white/5 text-gray-400 hover:text-white hover:bg-white/10"
                      >
                        Lower
                      </button>
                      <button
                        onClick={() => setSelectedMuscleGroups([])}
                        className="px-3 py-2 rounded-lg text-xs font-medium bg-white/5 text-gray-400 hover:text-white hover:bg-white/10"
                      >
                        Clear
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Preview Footer */}
            <div className="px-4 py-4 border-t border-white/10 bg-white/5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[#22d3ee]/20 flex items-center justify-center">
                    <Dumbbell className="w-5 h-5 text-[#22d3ee]" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white">
                      {selectedMuscleGroups.length} muscle group{selectedMuscleGroups.length !== 1 ? "s" : ""} selected
                    </p>
                    <p className="text-xs text-gray-400">
                      {previewLoading ? (
                        "Loading preview..."
                      ) : exercisePreview > 0 ? (
                        `${exercisePreview} exercise${exercisePreview !== 1 ? "s" : ""} will appear`
                      ) : selectedMuscleGroups.length > 0 ? (
                        "No matching exercises yet"
                      ) : (
                        "Select muscle groups above"
                      )}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

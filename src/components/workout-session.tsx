"use client";

import { useState, useEffect } from "react";
import {
  ChevronLeft,
  ChevronDown,
  Plus,
  X,
  MoreHorizontal,
  Zap,
  Layers,
  TrendingDown,
  Move,
  Trash2,
  Pencil,
  AlertTriangle,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import { Button } from "./ui/button";
import { NewExerciseModal } from "./new-exercise-modal";
import { ExercisePickerModal } from "./exercise-picker-modal";
import { useTheme } from "./theme-provider";
import type { ExerciseTemplate } from "@/lib/supabase/types";

// Set variant types for special sets
type SetVariant = "normal" | "assisted-parent" | "assisted-child" | "drop" | "drop-parent" | "left" | "right";

interface WorkoutSet {
  id: string;
  weight: string;
  reps: string;
  variant: SetVariant;
  label?: string; // For special set labels
}

interface ActiveExercise {
  id: string;
  name: string;
  equipment: string;
  templateId: string | null;
  sets: WorkoutSet[];
  supersetPairId?: string; // Links superset pairs
}

interface WorkoutSessionProps {
  userId: string;
  folderId: string;
  folderName: string;
  onBack: () => void;
  onSave: (exercises: ActiveExercise[]) => void;
}

// Equipment badge colors
const EQUIPMENT_COLORS: Record<string, { bg: string; text: string }> = {
  barbell: { bg: "rgba(99, 102, 241, 0.2)", text: "#818cf8" },
  dumbbell: { bg: "rgba(34, 197, 94, 0.2)", text: "#4ade80" },
  cable: { bg: "rgba(249, 115, 22, 0.2)", text: "#fb923c" },
  machine: { bg: "rgba(14, 165, 233, 0.2)", text: "#38bdf8" },
  smith: { bg: "rgba(255, 71, 87, 0.2)", text: "#ff4757" },
  bodyweight: { bg: "rgba(168, 85, 247, 0.2)", text: "#a855f7" },
};

// Set variant styles - backgrounds and borders
const SET_VARIANT_STYLES: Record<SetVariant, { bg: string; inputBg: string; borderLeft?: string }> = {
  normal: { bg: "transparent", inputBg: "#0f0f13" },
  "assisted-parent": { bg: "rgba(59, 130, 246, 0.12)", inputBg: "rgba(0,0,0,0.3)", borderLeft: "4px solid #3b82f6" },
  "assisted-child": { bg: "rgba(59, 130, 246, 0.12)", inputBg: "rgba(0,0,0,0.3)", borderLeft: "4px solid #3b82f6" },
  drop: { bg: "rgba(239, 68, 68, 0.12)", inputBg: "rgba(0,0,0,0.3)", borderLeft: "4px solid #ef4444" },
  "drop-parent": { bg: "rgba(239, 68, 68, 0.12)", inputBg: "rgba(0,0,0,0.3)", borderLeft: "4px solid #ef4444" },
  left: { bg: "rgba(34, 197, 94, 0.12)", inputBg: "rgba(0,0,0,0.3)", borderLeft: "4px solid #22c55e" },
  right: { bg: "rgba(34, 197, 94, 0.12)", inputBg: "rgba(0,0,0,0.3)", borderLeft: "4px solid #22c55e" },
};

// Format equipment label
const formatEquipment = (equipment: string): string => {
  return equipment.charAt(0).toUpperCase() + equipment.slice(1);
};

export function WorkoutSession({
  userId,
  folderId,
  folderName,
  onBack,
  onSave,
}: WorkoutSessionProps) {
  const supabase = createClient();
  const { theme } = useTheme();

  // Library exercises (from exercise_templates)
  const [libraryExercises, setLibraryExercises] = useState<ExerciseTemplate[]>([]);
  const [loadingLibrary, setLoadingLibrary] = useState(true);

  // All user's historical exercises for autocomplete
  const [allUserExercises, setAllUserExercises] = useState<{ name: string; equipment: string }[]>([]);

  // Active workout state — restore from localStorage if navigating back
  const [activeExercises, setActiveExercises] = useState<ActiveExercise[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const stored = localStorage.getItem("netgains-current-workout");
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.exercises && Array.isArray(parsed.exercises)) {
          return parsed.exercises.map(
            (ex: { name: string; equipment: string; templateId?: string | null; sets: { weight: string; reps: string; variant: string; label?: string }[] }) => ({
              id: Math.random().toString(36).substring(2, 9),
              name: ex.name,
              equipment: ex.equipment,
              templateId: ex.templateId || null,
              sets:
                ex.sets.length > 0
                  ? ex.sets.map((s) => ({
                      id: Math.random().toString(36).substring(2, 9),
                      weight: s.weight || "",
                      reps: s.reps || "",
                      variant: (s.variant || "normal") as SetVariant,
                      label: s.label,
                    }))
                  : [{ id: Math.random().toString(36).substring(2, 9), weight: "", reps: "", variant: "normal" as SetVariant }],
            })
          );
        }
      }
    } catch { /* ignore parse errors */ }
    return [];
  });
  const [saving, setSaving] = useState(false);

  // New exercise modal
  const [showNewExercise, setShowNewExercise] = useState(false);
  const [savingNewExercise, setSavingNewExercise] = useState(false);

  // Superset mode - tracks which exercise we're adding a superset to
  const [supersetForExerciseId, setSupersetForExerciseId] = useState<string | null>(null);
  const [showSupersetPicker, setShowSupersetPicker] = useState(false);

  // Advanced options menu
  const [openOptionsMenuId, setOpenOptionsMenuId] = useState<string | null>(null);

  // Clear confirmation modal
  const [showClearModal, setShowClearModal] = useState(false);

  // Library collapsed state
  const [isLibraryCollapsed, setIsLibraryCollapsed] = useState(false);

  // Edit mode for library
  const [isEditingLibrary, setIsEditingLibrary] = useState(false);
  const [editingExercise, setEditingExercise] = useState<ExerciseTemplate | null>(null);
  const [editName, setEditName] = useState("");
  const [editEquipment, setEditEquipment] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Progressive overload - best sets per exercise (keyed by templateId AND name for redundancy)
  const [bestSets, setBestSets] = useState<Record<string, { weight: number; reps: number } | null>>({});

  // Sync current workout to localStorage so Coach can see in-progress data
  // and so the workout can be restored if the user navigates away
  useEffect(() => {
    if (activeExercises.length > 0) {
      const workoutData = {
        folderName,
        startedAt: new Date().toISOString(),
        exercises: activeExercises.map((ex) => ({
          name: ex.name,
          equipment: ex.equipment,
          templateId: ex.templateId,
          sets: ex.sets.map((s) => ({
            weight: s.weight,
            reps: s.reps,
            variant: s.variant,
            label: s.label,
          })),
        })),
      };
      localStorage.setItem("netgains-current-workout", JSON.stringify(workoutData));
    } else {
      localStorage.removeItem("netgains-current-workout");
    }
  }, [activeExercises, folderName]);

  // Helper to safely get best set using multiple possible keys
  const getBestSetForExercise = (exercise: ActiveExercise): { weight: number; reps: number } | null => {
    // Try templateId first, then exercise name (normalized)
    const nameKey = exercise.name.toLowerCase();
    return bestSets[exercise.templateId || ""] || bestSets[nameKey] || null;
  };

  // Load library exercises on mount
  useEffect(() => {
    loadLibrary();
    loadAllUserExercises();
  }, [folderId]);

  const loadLibrary = async () => {
    setLoadingLibrary(true);
    const { data } = await supabase
      .from("exercise_templates")
      .select("*")
      .eq("folder_id", folderId)
      .order("order_index", { ascending: true });

    setLibraryExercises((data || []) as ExerciseTemplate[]);
    setLoadingLibrary(false);
  };

  // Load all user's exercise names for autocomplete
  const loadAllUserExercises = async () => {
    // Get all exercise templates across all folders
    const { data: templates } = await supabase
      .from("exercise_templates")
      .select("name, equipment")
      .eq("user_id", userId);

    if (templates) {
      // Dedupe by name (case-insensitive), keeping the first occurrence
      const uniqueMap = new Map<string, { name: string; equipment: string }>();
      templates.forEach((t) => {
        const key = t.name.toLowerCase();
        if (!uniqueMap.has(key)) {
          uniqueMap.set(key, { name: t.name, equipment: t.equipment });
        }
      });
      setAllUserExercises(Array.from(uniqueMap.values()));
    }
  };

  // Fetch best set for a given exercise template (using Epley formula for 1RM)
  // Matches by exercise NAME (case-insensitive) since exercises table doesn't have template_id
  const fetchBestSet = async (templateId: string, exerciseName: string) => {
    if (!templateId || !exerciseName || bestSets[templateId] !== undefined) return;

    // Mark as loading (null means we're fetching)
    setBestSets((prev) => ({ ...prev, [templateId]: null }));

    // Query all workouts with exercises and sets, then filter by name
    const { data: workouts } = await supabase
      .from("workouts")
      .select(`
        id,
        exercises (
          id,
          name,
          sets (
            weight,
            reps
          )
        )
      `)
      .eq("user_id", userId);

    if (!workouts || workouts.length === 0) {
      return;
    }

    // Calculate estimated 1RM using Epley formula and find the best
    let bestSet: { weight: number; reps: number } | null = null;
    let best1RM = 0;

    workouts.forEach((workout) => {
      const exercises = workout.exercises as {
        id: string;
        name: string;
        sets: { weight: number; reps: number }[];
      }[];

      // Find matching exercises (case-insensitive)
      const matchingExercises = exercises.filter(
        (ex) => ex.name.toLowerCase() === exerciseName.toLowerCase()
      );

      matchingExercises.forEach((ex) => {
        ex.sets.forEach((set) => {
          if (set.weight > 0 && set.reps > 0) {
            const estimated1RM = set.weight * (1 + set.reps / 30);
            if (estimated1RM > best1RM) {
              best1RM = estimated1RM;
              bestSet = { weight: set.weight, reps: set.reps };
            }
          }
        });
      });
    });

    if (bestSet) {
      // Store under both templateId AND normalized name for redundant lookup
      const nameKey = exerciseName.toLowerCase();
      setBestSets((prev) => ({
        ...prev,
        [templateId]: bestSet,
        [nameKey]: bestSet,
      }));
    }
  };

  // Generate unique ID
  const generateId = () => Math.random().toString(36).substring(2, 9);

  // Create a new set with variant
  const createSet = (variant: SetVariant = "normal", weight = "", label?: string): WorkoutSet => ({
    id: generateId(),
    weight,
    reps: "",
    variant,
    label,
  });

  // Add exercise from library
  const addExerciseFromLibrary = (template: ExerciseTemplate, insertAfterIndex?: number) => {
    const newExercise: ActiveExercise = {
      id: generateId(),
      name: template.name,
      equipment: template.equipment,
      templateId: template.id,
      sets: [createSet()],
    };

    setActiveExercises((prev) => {
      if (insertAfterIndex !== undefined) {
        const newList = [...prev];
        newList.splice(insertAfterIndex + 1, 0, newExercise);
        return newList;
      }
      return [...prev, newExercise];
    });

    // Fetch best set for progressive overload indicator
    if (template.id) {
      fetchBestSet(template.id, template.name);
    }

    return newExercise.id;
  };

  // Add exercise for superset
  const addExerciseForSuperset = (template: ExerciseTemplate) => {
    if (!supersetForExerciseId) return;

    const currentIndex = activeExercises.findIndex((ex) => ex.id === supersetForExerciseId);
    if (currentIndex === -1) return;

    const pairId = generateId();

    // Update the current exercise with superset pair ID
    setActiveExercises((prev) =>
      prev.map((ex) =>
        ex.id === supersetForExerciseId ? { ...ex, supersetPairId: pairId } : ex
      )
    );

    // Create new exercise with same pair ID
    const newExercise: ActiveExercise = {
      id: generateId(),
      name: template.name,
      equipment: template.equipment,
      templateId: template.id,
      sets: [createSet()],
      supersetPairId: pairId,
    };

    setActiveExercises((prev) => {
      const newList = [...prev];
      // Update the original exercise's supersetPairId
      const origIndex = newList.findIndex((ex) => ex.id === supersetForExerciseId);
      if (origIndex !== -1) {
        newList[origIndex] = { ...newList[origIndex], supersetPairId: pairId };
      }
      // Insert after original
      newList.splice(origIndex + 1, 0, newExercise);
      return newList;
    });

    // Fetch best set for progressive overload indicator
    if (template.id) {
      fetchBestSet(template.id, template.name);
    }

    setSupersetForExerciseId(null);
  };

  // Add new exercise (from modal)
  const handleAddNewExercise = async (data: {
    name: string;
    equipment: string;
    exerciseType: "strength";
  }) => {
    setSavingNewExercise(true);

    const { data: newTemplate, error } = await supabase
      .from("exercise_templates")
      .insert({
        user_id: userId,
        folder_id: folderId,
        name: data.name,
        equipment: data.equipment,
        exercise_type: data.exerciseType,
        order_index: libraryExercises.length,
      })
      .select()
      .single();

    setShowNewExercise(false);
    setSavingNewExercise(false);

    if (!error && newTemplate) {
      const template = newTemplate as ExerciseTemplate;
      setLibraryExercises((prev) => [...prev, template]);

      // Check if this is for a superset
      if (supersetForExerciseId) {
        addExerciseForSuperset(template);
      } else {
        addExerciseFromLibrary(template);
      }
    } else if (error) {
      console.error("Failed to create exercise:", error);
      alert(`Failed to create exercise: ${error.message}`);
    }
  };

  // Add normal set
  const addSet = (exerciseId: string) => {
    setActiveExercises((prev) =>
      prev.map((ex) =>
        ex.id === exerciseId
          ? { ...ex, sets: [...ex.sets, createSet()] }
          : ex
      )
    );
  };

  // Add Assisted set (parent-child coupling)
  const addAssistedSet = (exerciseId: string) => {
    setActiveExercises((prev) =>
      prev.map((ex) => {
        if (ex.id !== exerciseId) return ex;
        const lastSet = ex.sets[ex.sets.length - 1];

        // Convert last set to parent (if it's normal)
        const updatedSets = ex.sets.map((s, i) =>
          i === ex.sets.length - 1 && s.variant === "normal"
            ? { ...s, variant: "assisted-parent" as SetVariant }
            : s
        );

        // Create child set with same weight
        const childSet = createSet("assisted-child", lastSet?.weight || "", "Ast");
        return { ...ex, sets: [...updatedSets, childSet] };
      })
    );
    setOpenOptionsMenuId(null);
  };

  // Add Drop set (parent-child coupling)
  const addDropSet = (exerciseId: string) => {
    setActiveExercises((prev) =>
      prev.map((ex) => {
        if (ex.id !== exerciseId) return ex;
        const lastSet = ex.sets[ex.sets.length - 1];

        // Convert last set to drop-parent (if it's normal)
        const updatedSets = ex.sets.map((s, i) =>
          i === ex.sets.length - 1 && s.variant === "normal"
            ? { ...s, variant: "drop-parent" as SetVariant }
            : s
        );

        // Create drop child set with empty weight
        const childSet = createSet("drop", "", "Drop");
        return { ...ex, sets: [...updatedSets, childSet] };
      })
    );
    setOpenOptionsMenuId(null);
  };

  // Add R+L sets (unilateral) - converts the last normal set to R, adds L
  const addUnilateralSets = (exerciseId: string) => {
    setActiveExercises((prev) =>
      prev.map((ex) => {
        if (ex.id !== exerciseId) return ex;
        const lastSet = ex.sets[ex.sets.length - 1];

        // Convert last set to right (if it's normal)
        const updatedSets = ex.sets.map((s, i) =>
          i === ex.sets.length - 1 && s.variant === "normal"
            ? { ...s, variant: "right" as SetVariant, label: "R" }
            : s
        );

        // Create left set with same weight
        const leftSet = createSet("left", lastSet?.weight || "", "L");
        return { ...ex, sets: [...updatedSets, leftSet] };
      })
    );
    setOpenOptionsMenuId(null);
  };

  // Start superset flow - open the picker modal
  const startSuperset = (exerciseId: string) => {
    setSupersetForExerciseId(exerciseId);
    setShowSupersetPicker(true);
    setOpenOptionsMenuId(null);
  };

  // Handle superset exercise selection from picker
  const handleSupersetSelect = (template: ExerciseTemplate) => {
    addExerciseForSuperset(template);
    setShowSupersetPicker(false);
  };

  // Handle creating new exercise from superset picker
  const handleSupersetCreateNew = async (data: { name: string; equipment: string }): Promise<ExerciseTemplate | null> => {
    const { data: newTemplate, error } = await supabase
      .from("exercise_templates")
      .insert({
        user_id: userId,
        folder_id: folderId,
        name: data.name,
        equipment: data.equipment,
        exercise_type: "strength",
        order_index: libraryExercises.length,
      })
      .select()
      .single();

    if (!error && newTemplate) {
      const template = newTemplate as ExerciseTemplate;
      setLibraryExercises((prev) => [...prev, template]);
      return template;
    }

    if (error) {
      console.error("Failed to create exercise:", error);
      alert(`Failed to create exercise: ${error.message}`);
    }

    return null;
  };

  // Update set value with validation
  const updateSet = (
    exerciseId: string,
    setId: string,
    field: "weight" | "reps",
    value: string
  ) => {
    if (field === "weight") {
      // Allow only valid decimal numbers up to 2500 lbs
      if (value && !/^\d*\.?\d*$/.test(value)) return;
      const numValue = parseFloat(value);
      if (!isNaN(numValue) && numValue > 2500) return;
    } else {
      // Allow only integers up to 999 reps
      if (value && !/^\d*$/.test(value)) return;
      const numValue = parseInt(value, 10);
      if (!isNaN(numValue) && numValue > 999) return;
    }

    setActiveExercises((prev) =>
      prev.map((ex) =>
        ex.id === exerciseId
          ? {
              ...ex,
              sets: ex.sets.map((s) =>
                s.id === setId ? { ...s, [field]: value } : s
              ),
            }
          : ex
      )
    );
  };

  // Delete set
  const deleteSet = (exerciseId: string, setId: string) => {
    setActiveExercises((prev) =>
      prev.map((ex) =>
        ex.id === exerciseId
          ? { ...ex, sets: ex.sets.filter((s) => s.id !== setId) }
          : ex
      )
    );
  };

  // Delete exercise
  const deleteExercise = (exerciseId: string) => {
    setActiveExercises((prev) => prev.filter((ex) => ex.id !== exerciseId));
  };

  // Clear all - show confirmation modal
  const clearAll = () => {
    if (activeExercises.length === 0) return;
    setShowClearModal(true);
  };

  // Confirm clear - actually clears exercises
  const handleConfirmClear = () => {
    setActiveExercises([]);
    setShowClearModal(false);
  };

  // Finish and save
  const handleFinish = async () => {
    if (activeExercises.length === 0) return;

    const validExercises = activeExercises.filter((ex) =>
      ex.sets.some((s) => s.weight && s.reps)
    );

    if (validExercises.length === 0) {
      alert("Please complete at least one set before saving.");
      return;
    }

    setSaving(true);
    localStorage.removeItem("netgains-current-workout");
    onSave(validExercises);
  };

  // Get equipment badge style
  const getEquipmentStyle = (equipment: string) => {
    return EQUIPMENT_COLORS[equipment] || EQUIPMENT_COLORS.barbell;
  };

  // Open edit modal for an exercise
  const openEditModal = (exercise: ExerciseTemplate) => {
    setEditingExercise(exercise);
    setEditName(exercise.name);
    setEditEquipment(exercise.equipment);
  };

  // Close edit modal
  const closeEditModal = () => {
    setEditingExercise(null);
    setEditName("");
    setEditEquipment("");
    setShowDeleteConfirm(false);
  };

  // Save edited exercise
  const handleUpdateExercise = async () => {
    if (!editingExercise || !editName.trim()) return;

    setSavingEdit(true);

    const { error } = await supabase
      .from("exercise_templates")
      .update({
        name: editName.trim(),
        equipment: editEquipment,
      })
      .eq("id", editingExercise.id)
      .eq("user_id", userId);

    setSavingEdit(false);

    if (error) {
      console.error("Failed to update exercise:", error);
      alert(`Failed to update exercise: ${error.message}`);
      return;
    }

    // Update local state
    setLibraryExercises((prev) =>
      prev.map((ex) =>
        ex.id === editingExercise.id
          ? { ...ex, name: editName.trim(), equipment: editEquipment }
          : ex
      )
    );

    closeEditModal();
  };

  // Delete exercise permanently
  const handleDeleteExercise = async () => {
    if (!editingExercise) return;

    setSavingEdit(true);

    const { error } = await supabase
      .from("exercise_templates")
      .delete()
      .eq("id", editingExercise.id)
      .eq("user_id", userId);

    setSavingEdit(false);

    if (error) {
      console.error("Failed to delete exercise:", error);
      alert(`Failed to delete exercise: ${error.message}`);
      return;
    }

    // Update local state
    setLibraryExercises((prev) =>
      prev.filter((ex) => ex.id !== editingExercise.id)
    );

    closeEditModal();
  };

  // Handle library chip click (check for edit mode or superset mode)
  const handleLibraryChipClick = (template: ExerciseTemplate) => {
    if (isEditingLibrary) {
      openEditModal(template);
    } else if (supersetForExerciseId) {
      addExerciseForSuperset(template);
    } else {
      addExerciseFromLibrary(template);
    }
  };

  return (
    <div className="flex flex-col min-h-screen pb-72">
      {/* Header */}
      <div className="flex items-center justify-between p-4 sticky top-0 z-20 bg-background/80 backdrop-blur-lg">
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={onBack}
          className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{
            background: "rgba(26, 26, 36, 0.6)",
            border: "1px solid rgba(255, 255, 255, 0.05)",
          }}
        >
          <ChevronLeft className="w-5 h-5" />
        </motion.button>

        <h1 className="text-lg font-bold tracking-tight">{folderName}</h1>

        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={clearAll}
          className="text-sm font-semibold text-muted-foreground uppercase tracking-wide px-3 py-2"
        >
          Clear
        </motion.button>
      </div>

      {/* Active Workout Area - Extra bottom padding for dropdown visibility */}
      <div className="flex-1 px-4 space-y-4 pb-64">
        <AnimatePresence>
          {activeExercises.map((exercise, exerciseIndex) => {
            const equipStyle = getEquipmentStyle(exercise.equipment);
            const hasSuperset = !!exercise.supersetPairId;

            // Determine if this is a superset origin or partner
            const supersetPairExercises = hasSuperset
              ? activeExercises.filter((ex) => ex.supersetPairId === exercise.supersetPairId)
              : [];
            const isFirstInPair = hasSuperset && supersetPairExercises.length > 1 && supersetPairExercises[0].id === exercise.id;
            const isSecondInPair = hasSuperset && supersetPairExercises.length > 1 && supersetPairExercises[1]?.id === exercise.id;

            // Visual coupling: check if next exercise is the superset partner
            const nextExercise = activeExercises[exerciseIndex + 1];
            const isConnectedToNext = hasSuperset && nextExercise?.supersetPairId === exercise.supersetPairId;

            return (
              <motion.div
                key={exercise.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: -100 }}
                className={`relative ${isConnectedToNext ? "rounded-t-2xl" : "rounded-2xl"} ${isSecondInPair ? "rounded-b-2xl -mt-1" : ""}`}
                style={{
                  background: hasSuperset ? "rgba(168, 85, 247, 0.08)" : "#1a1a24",
                  border: "1px solid rgba(255, 255, 255, 0.05)",
                  borderLeft: hasSuperset ? "4px solid #a855f7" : undefined,
                  borderBottom: isConnectedToNext ? "none" : undefined,
                  borderTopLeftRadius: isSecondInPair ? 0 : undefined,
                  borderTopRightRadius: isSecondInPair ? 0 : undefined,
                  borderBottomLeftRadius: isConnectedToNext ? 0 : undefined,
                  borderBottomRightRadius: isConnectedToNext ? 0 : undefined,
                }}
              >
                {/* Exercise Header */}
                <div className="px-4 py-3 border-b border-white/5 rounded-t-2xl">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <h3 className="font-semibold truncate">{exercise.name}</h3>
                      {exercise.equipment && (
                        <span
                          className="px-2 py-0.5 rounded text-xs font-semibold uppercase shrink-0"
                          style={{
                            background: equipStyle.bg,
                            color: equipStyle.text,
                          }}
                        >
                          {formatEquipment(exercise.equipment)}
                        </span>
                      )}
                      {hasSuperset && (
                        <span className="px-2 py-0.5 rounded text-xs font-semibold uppercase bg-purple-500/20 text-purple-400">
                          {isFirstInPair ? "SS1" : isSecondInPair ? "SS2" : "SS"}
                        </span>
                      )}
                    </div>
                  <div className="flex items-center gap-1 shrink-0 ml-2">
                    {/* More Options Button */}
                    <div className="relative">
                      <motion.button
                        whileTap={{ scale: 0.9 }}
                        onClick={() =>
                          setOpenOptionsMenuId(
                            openOptionsMenuId === exercise.id ? null : exercise.id
                          )
                        }
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-500 hover:text-white hover:bg-white/10 transition-colors"
                      >
                        <MoreHorizontal className="w-5 h-5" />
                      </motion.button>

                      {/* Advanced Options Dropdown */}
                      <AnimatePresence>
                        {openOptionsMenuId === exercise.id && (
                          <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: -5 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: -5 }}
                            className="absolute right-0 top-10 z-[100] rounded-xl min-w-[160px] shadow-xl shadow-black/50"
                            style={{
                              background: "rgba(20, 20, 28, 0.98)",
                              backdropFilter: "blur(20px)",
                              border: "1px solid rgba(255, 255, 255, 0.15)",
                            }}
                          >
                            <button
                              onClick={() => addAssistedSet(exercise.id)}
                              className="flex items-center gap-3 px-4 py-3 text-sm w-full hover:bg-blue-500/10 transition-colors text-blue-400"
                            >
                              <Zap className="w-4 h-4" />
                              Assisted
                            </button>
                            <button
                              onClick={() => startSuperset(exercise.id)}
                              className="flex items-center gap-3 px-4 py-3 text-sm w-full hover:bg-purple-500/10 transition-colors text-purple-400"
                            >
                              <Layers className="w-4 h-4" />
                              Superset
                            </button>
                            <button
                              onClick={() => addDropSet(exercise.id)}
                              className="flex items-center gap-3 px-4 py-3 text-sm w-full hover:bg-red-500/10 transition-colors text-red-400"
                            >
                              <TrendingDown className="w-4 h-4" />
                              Drop Set
                            </button>
                            <button
                              onClick={() => addUnilateralSets(exercise.id)}
                              className="flex items-center gap-3 px-4 py-3 text-sm w-full hover:bg-green-500/10 transition-colors text-green-400"
                            >
                              <Move className="w-4 h-4" />
                              R + L
                            </button>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>

                    {/* Delete Button */}
                    <motion.button
                      whileTap={{ scale: 0.9 }}
                      onClick={() => deleteExercise(exercise.id)}
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-500 hover:text-red-500 hover:bg-red-500/10 transition-colors"
                    >
                      <X className="w-5 h-5" />
                    </motion.button>
                  </div>
                  </div>

                  {/* Progressive Overload Indicator */}
                  {(() => {
                    const bestSet = getBestSetForExercise(exercise);
                    return bestSet ? (
                      <div className="mt-1.5 text-xs text-amber-400 flex items-center gap-1">
                        <span>🏆</span>
                        <span>
                          Best: {bestSet.weight} lbs × {bestSet.reps}
                        </span>
                      </div>
                    ) : null;
                  })()}
                </div>

                {/* Set Headers */}
                <div className="grid grid-cols-[40px_1fr_1fr_32px] gap-2 px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  <span className="text-center">Set</span>
                  <span className="text-right pr-10">
                    {exercise.equipment === "bodyweight" ? "Added Wt" : "Weight"}
                  </span>
                  <span className="text-right pr-10">Reps</span>
                  <span></span>
                </div>

                {/* Sets */}
                <div className="px-4 pb-2 space-y-1">
                  {exercise.sets.map((set, index) => {
                    const variantStyle = SET_VARIANT_STYLES[set.variant];
                    const isSpecial = set.variant !== "normal";

                    // Determine coupling (parent/child relationships)
                    // R comes first (parent), L comes second (child)
                    const isParent = set.variant === "assisted-parent" || set.variant === "drop-parent" || set.variant === "right";
                    const isChild = set.variant === "assisted-child" || set.variant === "drop" || set.variant === "left";

                    // Rounding: parent gets top-rounded, child gets bottom-rounded
                    const roundingClass = isParent
                      ? "rounded-t-lg"
                      : isChild
                      ? "rounded-b-lg"
                      : "rounded-lg";

                    // Margin: children snap tightly to parents
                    const marginClass = isChild ? "-mt-1" : "";

                    // Get label color based on variant type
                    const getLabelColor = () => {
                      if (set.variant.includes("assisted")) return "#3b82f6";
                      if (set.variant.includes("drop")) return "#ef4444";
                      if (set.variant === "left" || set.variant === "right") return "#22c55e";
                      return theme.primary;
                    };

                    // Compute numbered label for R/L sets (e.g., "1R", "1L", "2R", "2L")
                    const getSetLabel = () => {
                      if (set.variant === "right" || set.variant === "left") {
                        const side = set.variant === "right" ? "R" : "L";
                        // Count how many R sets came before this one to get pair number
                        let pairIndex = 0;
                        for (const s of exercise.sets) {
                          if (s.id === set.id) break;
                          if (s.variant === "right") pairIndex++;
                        }
                        // For L sets, use the same pair number as the preceding R
                        if (set.variant === "left") {
                          // Count R sets before this L to get the pair number
                          let rCount = 0;
                          for (const s of exercise.sets) {
                            if (s.id === set.id) break;
                            if (s.variant === "right") rCount++;
                          }
                          return `${rCount}${side}`;
                        }
                        return `${pairIndex + 1}${side}`;
                      }
                      return set.label || index + 1;
                    };

                    return (
                      <div
                        key={set.id}
                        className={`grid grid-cols-[40px_1fr_1fr_32px] gap-2 items-center p-1.5 ${roundingClass} ${marginClass}`}
                        style={{
                          background: variantStyle.bg,
                          borderLeft: variantStyle.borderLeft,
                        }}
                      >
                        {/* Set Number/Label */}
                        <span
                          className="text-sm font-bold text-center"
                          style={{ color: getLabelColor() }}
                        >
                          {getSetLabel()}
                        </span>

                        {/* Weight Input */}
                        <div className="relative">
                          {exercise.equipment === "bodyweight" && (
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-medium text-purple-400 pointer-events-none">
                              BW+
                            </span>
                          )}
                          <input
                            type="text"
                            inputMode="decimal"
                            value={set.weight}
                            onChange={(e) =>
                              updateSet(exercise.id, set.id, "weight", e.target.value)
                            }
                            placeholder={exercise.equipment === "bodyweight" ? "0" : "—"}
                            className={`w-full rounded-lg py-2.5 text-right font-semibold focus:outline-none focus:ring-2 focus:ring-primary min-h-[44px] ${
                              exercise.equipment === "bodyweight" ? "pl-10 pr-10" : "pl-3 pr-10"
                            }`}
                            style={{ background: variantStyle.inputBg }}
                          />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-gray-500 pointer-events-none">
                            {exercise.equipment === "bodyweight" ? "lbs" : "lbs"}
                          </span>
                        </div>

                        {/* Reps Input */}
                        <div className="relative">
                          <input
                            type="text"
                            inputMode="numeric"
                            value={set.reps}
                            onChange={(e) =>
                              updateSet(exercise.id, set.id, "reps", e.target.value)
                            }
                            placeholder="—"
                            className="w-full rounded-lg pl-3 pr-12 py-2.5 text-right font-semibold focus:outline-none focus:ring-2 focus:ring-primary min-h-[44px]"
                            style={{ background: variantStyle.inputBg }}
                          />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-gray-500 pointer-events-none">
                            reps
                          </span>
                        </div>

                        {/* Delete Button */}
                        <motion.button
                          whileTap={{ scale: 0.9 }}
                          onClick={() => deleteSet(exercise.id, set.id)}
                          className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-colors"
                        >
                          <X className="w-4 h-4" />
                        </motion.button>
                      </div>
                    );
                  })}
                </div>

                {/* Add Set Button */}
                <button
                  onClick={() => addSet(exercise.id)}
                  className="w-full py-2.5 text-xs font-semibold text-primary uppercase tracking-wide hover:bg-primary/5 transition-colors border-t border-white/5 rounded-b-2xl"
                >
                  + Add Set
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>

        {/* Empty State */}
        {activeExercises.length === 0 && (
          <div className="text-center py-16">
            <p className="text-muted-foreground mb-2">No exercises yet</p>
            <p className="text-sm text-muted-foreground">
              Tap an exercise from your library below to start
            </p>
          </div>
        )}
      </div>

      {/* Click outside to close menu */}
      {openOptionsMenuId && (
        <div
          className="fixed inset-0 z-[90]"
          onClick={() => setOpenOptionsMenuId(null)}
        />
      )}

      {/* Finish Button */}
      {activeExercises.length > 0 && (
        <div className={`fixed left-0 right-0 z-50 px-4 ${isLibraryCollapsed ? "bottom-36" : "bottom-72"}`}>
          <div className="max-w-lg mx-auto">
            <Button onClick={handleFinish} loading={saving}>
              Finish & Save
            </Button>
          </div>
        </div>
      )}

      {/* Background fill below nav to prevent scroll bleed-through */}
      <div
        className="fixed bottom-0 left-0 right-0 h-24 z-30"
        style={{ background: "#0f0f13" }}
      />

      {/* Exercise Library */}
      <div
        className="fixed bottom-24 left-0 right-0 z-40"
        style={{
          background: "#0f0f13",
          borderTop: "1px solid rgba(255, 255, 255, 0.05)",
          borderBottom: "1px solid rgba(255, 255, 255, 0.05)",
        }}
      >
        <div className="max-w-lg mx-auto px-4 py-3">
          <div
            className="flex items-center justify-between cursor-pointer"
            onClick={() => !supersetForExerciseId && setIsLibraryCollapsed(!isLibraryCollapsed)}
          >
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
              {supersetForExerciseId ? (
                <span className="text-purple-400">Select Superset Exercise</span>
              ) : (
                <>
                  Exercise Library
                  <ChevronDown
                    className={`w-3 h-3 transition-transform ${isLibraryCollapsed ? "-rotate-90" : ""}`}
                  />
                </>
              )}
            </h4>
            {!supersetForExerciseId && libraryExercises.length > 0 && (
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={(e) => {
                  e.stopPropagation();
                  setIsEditingLibrary(!isEditingLibrary);
                }}
                className="text-xs font-semibold uppercase tracking-wide px-2 py-1"
                style={{ color: isEditingLibrary ? "#22c55e" : theme.primary }}
              >
                {isEditingLibrary ? "Done" : "Edit"}
              </motion.button>
            )}
          </div>

          {!isLibraryCollapsed && (
            <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto mt-3">
              {/* New Exercise Chip */}
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={() => setShowNewExercise(true)}
                className="px-4 py-2 rounded-full text-sm font-semibold flex items-center gap-1.5"
                style={{
                  background: supersetForExerciseId
                    ? "rgba(168, 85, 247, 0.15)"
                    : `rgba(${theme.primaryRgb}, 0.15)`,
                  border: supersetForExerciseId
                    ? "1px solid rgba(168, 85, 247, 0.3)"
                    : `1px solid rgba(${theme.primaryRgb}, 0.3)`,
                  color: supersetForExerciseId ? "#a855f7" : theme.primary,
                }}
              >
                <Plus className="w-4 h-4" />
                New
              </motion.button>

              {/* Cancel Superset Button */}
              {supersetForExerciseId && (
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setSupersetForExerciseId(null)}
                  className="px-4 py-2 rounded-full text-sm font-semibold flex items-center gap-1.5 bg-muted/30 text-muted-foreground"
                >
                  <X className="w-4 h-4" />
                  Cancel
                </motion.button>
              )}

              {/* Library Exercise Chips */}
              {loadingLibrary ? (
                <span className="text-sm text-muted-foreground px-4 py-2">
                  Loading...
                </span>
              ) : (
                libraryExercises.map((exercise) => {
                  const chipStyle = getEquipmentStyle(exercise.equipment);
                  return (
                    <motion.button
                      key={exercise.id}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => handleLibraryChipClick(exercise)}
                      className="px-3 py-2 rounded-full text-sm font-medium flex items-center gap-1.5"
                      style={{
                        background: isEditingLibrary
                          ? "rgba(255, 71, 87, 0.08)"
                          : supersetForExerciseId
                          ? "rgba(168, 85, 247, 0.1)"
                          : "rgba(26, 26, 36, 0.8)",
                        border: isEditingLibrary
                          ? "1px dashed rgba(255, 71, 87, 0.5)"
                          : supersetForExerciseId
                          ? "1px solid rgba(168, 85, 247, 0.3)"
                          : "1px solid rgba(255, 255, 255, 0.1)",
                      }}
                    >
                      {isEditingLibrary && (
                        <Pencil className="w-3 h-3 text-red-400" />
                      )}
                      <span>{exercise.name}</span>
                      <span
                        className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase"
                        style={{
                          background: chipStyle.bg,
                          color: chipStyle.text,
                        }}
                      >
                        {formatEquipment(exercise.equipment).slice(0, 2)}
                      </span>
                    </motion.button>
                  );
                })
              )}

              {!loadingLibrary && libraryExercises.length === 0 && (
                <span className="text-sm text-muted-foreground">
                  Tap &quot;+ New&quot; to add your first exercise
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* New Exercise Modal */}
      <NewExerciseModal
        open={showNewExercise}
        onClose={() => {
          setShowNewExercise(false);
        }}
        onSave={handleAddNewExercise}
        loading={savingNewExercise}
        existingExercises={allUserExercises}
      />

      {/* Superset Picker Modal */}
      <ExercisePickerModal
        open={showSupersetPicker}
        onClose={() => {
          setShowSupersetPicker(false);
          setSupersetForExerciseId(null);
        }}
        onSelect={handleSupersetSelect}
        onCreateNew={handleSupersetCreateNew}
        userId={userId}
        folderId={folderId}
        title="Select Superset Exercise"
        accentColor="purple"
      />

      {/* Clear Confirmation Modal */}
      <AnimatePresence>
        {showClearModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
            onClick={() => setShowClearModal(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm rounded-2xl p-6"
              style={{
                background: "#1a1a24",
                border: "1px solid rgba(255, 255, 255, 0.1)",
              }}
            >
              {/* Icon */}
              <div className="flex justify-center mb-4">
                <div
                  className="w-16 h-16 rounded-full flex items-center justify-center"
                  style={{ background: "rgba(239, 68, 68, 0.15)" }}
                >
                  <Trash2 className="w-8 h-8 text-red-500" />
                </div>
              </div>

              {/* Title */}
              <h2 className="text-xl font-bold text-center text-white mb-2">
                Clear Session?
              </h2>

              {/* Message */}
              <p className="text-sm text-gray-400 text-center mb-6">
                This will delete all exercises and sets from this workout. This action cannot be undone.
              </p>

              {/* Buttons */}
              <div className="flex gap-3">
                <button
                  onClick={() => setShowClearModal(false)}
                  className="flex-1 py-3 rounded-xl font-semibold text-white transition-colors"
                  style={{ background: "rgba(55, 55, 65, 0.8)" }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmClear}
                  className="flex-1 py-3 rounded-xl font-semibold text-white bg-red-500 hover:bg-red-600 transition-colors"
                >
                  Clear Everything
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Edit Exercise Modal */}
      <AnimatePresence>
        {editingExercise && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
            onClick={closeEditModal}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm rounded-2xl p-6"
              style={{
                background: "#1a1a24",
                border: "1px solid rgba(255, 255, 255, 0.1)",
              }}
            >
              {showDeleteConfirm ? (
                <>
                  {/* Delete Confirmation View */}
                  <div className="flex justify-center mb-4">
                    <div
                      className="w-16 h-16 rounded-full flex items-center justify-center"
                      style={{ background: "rgba(239, 68, 68, 0.15)" }}
                    >
                      <AlertTriangle className="w-8 h-8 text-red-500" />
                    </div>
                  </div>

                  <h2 className="text-xl font-bold text-center text-white mb-2">
                    Delete Exercise?
                  </h2>

                  <p className="text-sm text-gray-400 text-center mb-6">
                    This will permanently delete "{editingExercise.name}" and remove it from your workout history. This action cannot be undone.
                  </p>

                  <div className="flex gap-3">
                    <button
                      onClick={() => setShowDeleteConfirm(false)}
                      className="flex-1 py-3 rounded-xl font-semibold text-white transition-colors"
                      style={{ background: "rgba(55, 55, 65, 0.8)" }}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleDeleteExercise}
                      disabled={savingEdit}
                      className="flex-1 py-3 rounded-xl font-semibold text-white bg-red-500 hover:bg-red-600 transition-colors disabled:opacity-50"
                    >
                      {savingEdit ? "Deleting..." : "Delete"}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  {/* Edit Form View */}
                  <div className="flex items-center justify-between mb-6">
                    <h2 className="text-xl font-bold text-white">Edit Exercise</h2>
                    <motion.button
                      whileTap={{ scale: 0.9 }}
                      onClick={closeEditModal}
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-500 hover:text-white hover:bg-white/10"
                    >
                      <X className="w-5 h-5" />
                    </motion.button>
                  </div>

                  {/* Name Input */}
                  <div className="mb-4">
                    <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                      Name
                    </label>
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="w-full bg-background/50 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary min-h-[44px]"
                      placeholder="Exercise name"
                    />
                  </div>

                  {/* Equipment Select */}
                  <div className="mb-6">
                    <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                      Equipment
                    </label>
                    <select
                      value={editEquipment}
                      onChange={(e) => setEditEquipment(e.target.value)}
                      className="w-full bg-background/50 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary min-h-[44px] appearance-none cursor-pointer"
                    >
                      <option value="barbell">Barbell</option>
                      <option value="dumbbell">Dumbbell</option>
                      <option value="cable">Cable</option>
                      <option value="machine">Machine</option>
                      <option value="smith">Smith</option>
                    </select>
                  </div>

                  {/* Update Button */}
                  <Button
                    onClick={handleUpdateExercise}
                    loading={savingEdit}
                    disabled={!editName.trim()}
                    className="mb-4"
                  >
                    Update
                  </Button>

                  {/* Delete Button */}
                  <button
                    onClick={() => setShowDeleteConfirm(true)}
                    className="w-full py-3 rounded-xl font-semibold text-red-500 hover:bg-red-500/10 transition-colors"
                  >
                    Delete Permanently
                  </button>
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

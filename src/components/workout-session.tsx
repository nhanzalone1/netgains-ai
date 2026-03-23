"use client";

import { useState, useEffect, useRef } from "react";
import {
  ChevronLeft,
  Plus,
  X,
  Zap,
  Layers,
  TrendingDown,
  Move,
  Trash2,
  Flame,        // For warmup sets
  Target,       // For failure sets
  RotateCcw,    // For load previous workout
  Sparkles,     // For start fresh
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import { Button } from "./ui/button";
import { NewExerciseModal } from "./new-exercise-modal";
import { ExercisePickerModal } from "./exercise-picker-modal";
import { useTheme } from "./theme-provider";
import { useToast } from "./toast";
import type { ExerciseTemplate } from "@/lib/supabase/types";
import { isGymSpecificEquipment } from "@/lib/supabase/types";

// Set variant types for special sets
type SetVariant =
  | "normal"
  | "warmup"        // Warm-up sets (excluded from PRs)
  | "failure"       // Sets taken to failure
  | "drop" | "drop-parent"
  | "assisted-parent" | "assisted-child"
  | "left" | "right";

type MeasureType = "reps" | "secs";

interface WorkoutSet {
  id: string;
  weight: string;
  reps: string;
  variant: SetVariant;
  measureType: MeasureType;
  label?: string; // For special set labels
  targetReps?: string; // Coach-suggested target reps (e.g., "8-12")
  // Previous workout values for backdrop display
  previousWeight?: string;
  previousReps?: string;
}

interface ActiveExercise {
  id: string;
  name: string;
  equipment: string;
  templateId: string | null;
  sets: WorkoutSet[];
  supersetPairId?: string; // Links superset pairs
  defaultMeasureType: MeasureType; // Default for new sets (reps or secs)
}

// Time-based exercise detection for bodyweight exercises
const TIME_BASED_KEYWORDS = [
  'plank', 'wall sit', 'hollow hold', 'dead hang', 'l-sit', 'l sit',
  'superman hold', 'isometric', 'carry', "farmer's walk", 'farmers walk',
  'farmer walk', 'hold', 'hang'
];

function isTimeBasedExercise(name: string): boolean {
  const lowerName = name.toLowerCase();
  return TIME_BASED_KEYWORDS.some(keyword => lowerName.includes(keyword));
}

function detectMeasureType(name: string, equipment: string): MeasureType {
  if (equipment.toLowerCase() === 'bodyweight' && isTimeBasedExercise(name)) {
    return 'secs';
  }
  return 'reps';
}

interface WorkoutSessionProps {
  userId: string;
  folderId: string;
  folderName: string;
  locationId: string; // Current gym/location ID
  onBack: () => void;
  onSave: (exercises: ActiveExercise[], cardioNotes?: string) => void;
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

// Default color for custom equipment types
const CUSTOM_EQUIPMENT_COLOR = { bg: "rgba(236, 72, 153, 0.2)", text: "#ec4899" }; // Pink

// Set variant styles - backgrounds and borders
const SET_VARIANT_STYLES: Record<SetVariant, { bg: string; inputBg: string; borderLeft?: string }> = {
  normal: { bg: "transparent", inputBg: "var(--background)" },
  warmup: { bg: "rgba(234, 179, 8, 0.12)", inputBg: "rgba(0,0,0,0.3)", borderLeft: "4px solid #eab308" },      // Yellow
  failure: { bg: "rgba(249, 115, 22, 0.12)", inputBg: "rgba(0,0,0,0.3)", borderLeft: "4px solid #f97316" },    // Orange
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

// Cache limit for best sets to prevent unbounded memory growth
const BEST_SETS_CACHE_LIMIT = 100;

// Previous workout data structure
interface PreviousWorkoutData {
  workoutId: string;
  date: string;
  exercises: {
    name: string;
    equipment: string;
    sets: {
      weight: number;
      reps: number;
      variant: string;
      measureType: string;
    }[];
  }[];
}

// Exercise stats (last time + best)
interface ExerciseStats {
  lastTime: { weight: number; reps: number; date: string } | null;
  best: { weight: number; reps: number } | null;
}

export function WorkoutSession({
  userId,
  folderId,
  folderName,
  locationId,
  onBack,
  onSave,
}: WorkoutSessionProps) {
  const supabase = createClient();
  const { theme } = useTheme();
  const toast = useToast();

  // Workout start mode: "choice" = show Load/Start buttons, "started" = workout in progress
  const [workoutMode, setWorkoutMode] = useState<"choice" | "started">("choice");

  // Previous workout data for this folder + gym
  const [previousWorkout, setPreviousWorkout] = useState<PreviousWorkoutData | null>(null);
  const [loadingPrevious, setLoadingPrevious] = useState(true);

  // Library exercises (from exercise_templates)
  const [libraryExercises, setLibraryExercises] = useState<ExerciseTemplate[]>([]);

  // All user's historical exercises for autocomplete
  const [allUserExercises, setAllUserExercises] = useState<{ name: string; equipment: string }[]>([]);

  // Active workout state — restore from localStorage after mount to avoid hydration mismatch
  const [activeExercises, setActiveExercises] = useState<ActiveExercise[]>([]);
  const hasRestoredFromStorage = useRef(false);

  // Exercise stats: last time + best for each exercise (keyed by templateId or name)
  const [exerciseStats, setExerciseStats] = useState<Record<string, ExerciseStats>>({});

  // Fetch previous workout for this folder + gym
  useEffect(() => {
    const fetchPreviousWorkout = async () => {
      setLoadingPrevious(true);

      // First try to find by folder_id + location_id
      let { data: workout } = await supabase
        .from("workouts")
        .select(`
          id,
          date,
          exercises (
            name,
            equipment,
            order_index,
            sets (
              weight,
              reps,
              variant,
              measure_type,
              order_index
            )
          )
        `)
        .eq("user_id", userId)
        .eq("folder_id", folderId)
        .eq("location_id", locationId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      // Fallback: if no folder_id match, try matching by notes (for existing workouts)
      if (!workout) {
        const { data: fallbackWorkout } = await supabase
          .from("workouts")
          .select(`
            id,
            date,
            notes,
            exercises (
              name,
              equipment,
              order_index,
              gym_id,
              sets (
                weight,
                reps,
                variant,
                measure_type,
                order_index
              )
            )
          `)
          .eq("user_id", userId)
          .ilike("notes", `%${folderName}%`)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        // Also check if the gym matches (for fallback)
        if (fallbackWorkout) {
          const exercises = fallbackWorkout.exercises as { gym_id: number | null }[];
          // Accept if any exercise was at this gym, or if exercises have no gym (universal)
          const gymMatches = exercises.some(ex => !ex.gym_id || ex.gym_id === Number(locationId));
          if (gymMatches) {
            workout = fallbackWorkout;
          }
        }
      }

      if (workout) {
        const exercises = (workout.exercises || []) as {
          name: string;
          equipment: string;
          order_index: number;
          sets: { weight: number; reps: number; variant: string; measure_type: string; order_index: number }[];
        }[];

        // Sort exercises by order_index
        exercises.sort((a, b) => a.order_index - b.order_index);

        const previousData: PreviousWorkoutData = {
          workoutId: workout.id,
          date: workout.date,
          exercises: exercises.map((ex) => ({
            name: ex.name,
            equipment: ex.equipment,
            sets: (ex.sets || [])
              .sort((a, b) => a.order_index - b.order_index)
              .map((s) => ({
                weight: s.weight,
                reps: s.reps,
                variant: s.variant,
                measureType: s.measure_type,
              })),
          })),
        };

        setPreviousWorkout(previousData);
      }

      setLoadingPrevious(false);
    };

    fetchPreviousWorkout();
  }, [userId, folderId, locationId, folderName, supabase]);

  // Restore workout from localStorage on mount (client-side only)
  // If there's an in-progress workout, skip the choice screen
  useEffect(() => {
    if (hasRestoredFromStorage.current) return;
    hasRestoredFromStorage.current = true;

    try {
      const stored = localStorage.getItem("netgains-current-workout");
      if (stored) {
        const parsed = JSON.parse(stored);
        if ((parsed.exercises && Array.isArray(parsed.exercises) && parsed.exercises.length > 0) || parsed.cardioNotes) {
          const restoredExercises = (parsed.exercises || []).map(
            (ex: { name: string; equipment: string; templateId?: string | null; defaultMeasureType?: string; sets?: { weight: string; reps: string; variant: string; label?: string; targetReps?: string; measureType?: string; previousWeight?: string; previousReps?: string }[] }) => ({
              id: Math.random().toString(36).substring(2, 9),
              name: ex.name,
              equipment: ex.equipment,
              templateId: ex.templateId || null,
              defaultMeasureType: (ex.defaultMeasureType || "reps") as MeasureType,
              sets:
                ex.sets && ex.sets.length > 0
                  ? ex.sets.map((s) => ({
                      id: Math.random().toString(36).substring(2, 9),
                      weight: s.weight || "",
                      reps: s.reps || "",
                      variant: (s.variant || "normal") as SetVariant,
                      measureType: (s.measureType || "reps") as MeasureType,
                      label: s.label,
                      targetReps: s.targetReps,
                      previousWeight: s.previousWeight,
                      previousReps: s.previousReps,
                    }))
                  : [{ id: Math.random().toString(36).substring(2, 9), weight: "", reps: "", variant: "normal" as SetVariant, measureType: "reps" as MeasureType }],
            })
          );
          setActiveExercises(restoredExercises);
          // Restore cardio notes if present
          if (parsed.cardioNotes) {
            setCardioNotes(parsed.cardioNotes);
          }
          // Skip choice screen if we have an in-progress workout
          setWorkoutMode("started");
        }
      }
    } catch { /* ignore parse errors */ }
  }, []);
  const [saving, setSaving] = useState(false);

  // Handle "Load Last Workout" - pre-populate with previous workout data
  const handleLoadPreviousWorkout = () => {
    if (!previousWorkout) return;

    const loadedExercises: ActiveExercise[] = previousWorkout.exercises.map((ex) => {
      const defaultMeasureType: MeasureType = ex.sets[0]?.measureType === "secs" ? "secs" : "reps";

      return {
        id: generateId(),
        name: ex.name,
        equipment: ex.equipment,
        templateId: null, // Will be matched when adding to library
        defaultMeasureType,
        sets: ex.sets.map((s) => ({
          id: generateId(),
          weight: "", // Empty - user fills in
          reps: "", // Empty - user fills in
          variant: s.variant as SetVariant,
          measureType: s.measureType as MeasureType,
          // Store previous values for backdrop display
          previousWeight: s.weight.toString(),
          previousReps: s.reps.toString(),
        })),
      };
    });

    setActiveExercises(loadedExercises);
    setWorkoutMode("started");

    // Fetch stats for loaded exercises
    loadedExercises.forEach((ex) => {
      fetchExerciseStats(ex.name, ex.equipment);
    });
  };

  // Handle "Start Fresh" - blank workout
  const handleStartFresh = () => {
    setActiveExercises([]);
    setWorkoutMode("started");
  };

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

  // Exercise picker modal state
  const [showExercisePicker, setShowExercisePicker] = useState(false);

  // Cardio notes state
  const [cardioNotes, setCardioNotes] = useState("");

  // Sync current workout to localStorage so Coach can see in-progress data
  // and so the workout can be restored if the user navigates away
  useEffect(() => {
    if (workoutMode === "started" && (activeExercises.length > 0 || cardioNotes.trim())) {
      const workoutData = {
        folderName,
        startedAt: new Date().toISOString(),
        cardioNotes: cardioNotes.trim() || undefined,
        exercises: activeExercises.map((ex) => ({
          name: ex.name,
          equipment: ex.equipment,
          templateId: ex.templateId,
          defaultMeasureType: ex.defaultMeasureType,
          sets: ex.sets.map((s) => ({
            weight: s.weight,
            reps: s.reps,
            variant: s.variant,
            measureType: s.measureType,
            label: s.label,
            targetReps: s.targetReps,
            previousWeight: s.previousWeight, // Preserve previous values for backdrop
            previousReps: s.previousReps,
          })),
        })),
      };
      localStorage.setItem("netgains-current-workout", JSON.stringify(workoutData));
    } else if (workoutMode === "started" && activeExercises.length === 0 && !cardioNotes.trim()) {
      localStorage.removeItem("netgains-current-workout");
    }
  }, [activeExercises, folderName, workoutMode, cardioNotes]);


  // Load library exercises on mount
  useEffect(() => {
    loadLibrary();
    loadAllUserExercises();
  }, [folderId]);

  const loadLibrary = async () => {
    const { data } = await supabase
      .from("exercise_templates")
      .select("*")
      .eq("folder_id", folderId)
      .order("order_index", { ascending: true });

    setLibraryExercises((data || []) as ExerciseTemplate[]);
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

  // Fetch exercise stats: last time (gym-aware) + best (1RM using Epley formula)
  const fetchExerciseStats = async (exerciseName: string, equipment: string) => {
    const nameKey = exerciseName.toLowerCase();
    if (exerciseStats[nameKey] !== undefined) return;

    // Skip if cache is full
    if (Object.keys(exerciseStats).length >= BEST_SETS_CACHE_LIMIT) return;

    // Mark as loading
    setExerciseStats((prev) => ({ ...prev, [nameKey]: { lastTime: null, best: null } }));

    const isGymSpecific = isGymSpecificEquipment(equipment);

    // Query workouts with exercises and sets
    const { data: workouts } = await supabase
      .from("workouts")
      .select(`
        id,
        date,
        created_at,
        exercises (
          id,
          name,
          equipment,
          gym_id,
          is_gym_specific,
          sets (
            weight,
            reps,
            variant
          )
        )
      `)
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (!workouts || workouts.length === 0) {
      return;
    }

    let lastTimeSet: { weight: number; reps: number; date: string } | null = null;
    let bestSet: { weight: number; reps: number } | null = null;
    let best1RM = 0;

    workouts.forEach((workout) => {
      const exercises = workout.exercises as {
        id: string;
        name: string;
        equipment: string;
        gym_id: number | null;
        is_gym_specific: boolean;
        sets: { weight: number; reps: number; variant: string }[];
      }[];

      // Find matching exercises (case-insensitive)
      const matchingExercises = exercises.filter(
        (ex) => ex.name.toLowerCase() === exerciseName.toLowerCase()
      );

      matchingExercises.forEach((ex) => {
        // For gym-specific exercises, only count if at same gym
        // For universal exercises, count all gyms
        const gymMatches = !isGymSpecific || ex.gym_id === Number(locationId) || !ex.gym_id;

        // Get best working set (exclude warmups)
        const workingSets = ex.sets.filter((s) => s.variant !== "warmup" && s.weight > 0 && s.reps > 0);
        if (workingSets.length === 0) return;

        // Find the top set by weight (or by 1RM if same weight)
        const topSet = workingSets.reduce((best, s) => {
          const s1RM = s.weight * (1 + s.reps / 30);
          const best1RM = best.weight * (1 + best.reps / 30);
          return s1RM > best1RM ? s : best;
        });

        // Track last time (gym-aware)
        if (gymMatches && !lastTimeSet) {
          lastTimeSet = {
            weight: topSet.weight,
            reps: topSet.reps,
            date: workout.date,
          };
        }

        // Track best overall (across all gyms for best 1RM)
        const topSet1RM = topSet.weight * (1 + topSet.reps / 30);
        if (topSet1RM > best1RM) {
          best1RM = topSet1RM;
          bestSet = { weight: topSet.weight, reps: topSet.reps };
        }
      });
    });

    setExerciseStats((prev) => ({
      ...prev,
      [nameKey]: { lastTime: lastTimeSet, best: bestSet },
    }));
  };

  // Legacy wrapper for compatibility
  const fetchBestSet = async (templateId: string, exerciseName: string) => {
    // Find the template to get equipment
    const template = libraryExercises.find((t) => t.id === templateId);
    const equipment = template?.equipment || "barbell";
    await fetchExerciseStats(exerciseName, equipment);
  };

  // Helper to get stats for an exercise
  const getStatsForExercise = (exercise: ActiveExercise): ExerciseStats | null => {
    const nameKey = exercise.name.toLowerCase();
    return exerciseStats[nameKey] || null;
  };

  // Generate unique ID
  const generateId = () => Math.random().toString(36).substring(2, 9);

  // Create a new set with variant and measure type
  const createSet = (variant: SetVariant = "normal", weight = "", label?: string, measureType: MeasureType = "reps"): WorkoutSet => ({
    id: generateId(),
    weight,
    reps: "",
    variant,
    measureType,
    label,
  });

  // Add exercise from library
  const addExerciseFromLibrary = (template: ExerciseTemplate, insertAfterIndex?: number) => {
    // Use template's default_measure_type if available, otherwise detect from name/equipment
    const defaultMeasureType: MeasureType =
      (template.default_measure_type as MeasureType) ||
      detectMeasureType(template.name, template.equipment);

    const newExercise: ActiveExercise = {
      id: generateId(),
      name: template.name,
      equipment: template.equipment,
      templateId: template.id,
      sets: [createSet("normal", "", undefined, defaultMeasureType)],
      defaultMeasureType,
    };

    setActiveExercises((prev) => {
      if (insertAfterIndex !== undefined) {
        const newList = [...prev];
        newList.splice(insertAfterIndex + 1, 0, newExercise);
        return newList;
      }
      return [...prev, newExercise];
    });

    // Fetch stats for progressive overload indicator
    fetchExerciseStats(template.name, template.equipment);

    return newExercise.id;
  };

  // Add exercise for superset
  const addExerciseForSuperset = (template: ExerciseTemplate) => {
    if (!supersetForExerciseId) return;

    const currentIndex = activeExercises.findIndex((ex) => ex.id === supersetForExerciseId);
    if (currentIndex === -1) return;

    const pairId = generateId();

    // Use template's default_measure_type if available, otherwise detect from name/equipment
    const defaultMeasureType: MeasureType =
      (template.default_measure_type as MeasureType) ||
      detectMeasureType(template.name, template.equipment);

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
      sets: [createSet("normal", "", undefined, defaultMeasureType)],
      supersetPairId: pairId,
      defaultMeasureType,
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

    // Fetch stats for progressive overload indicator
    fetchExerciseStats(template.name, template.equipment);

    setSupersetForExerciseId(null);
  };

  // Add new exercise (from modal)
  const handleAddNewExercise = async (data: {
    name: string;
    equipment: string;
    exerciseType: "strength";
  }) => {
    setSavingNewExercise(true);

    // Detect default measure type for bodyweight exercises
    const detectedMeasureType = detectMeasureType(data.name, data.equipment);

    const { data: newTemplate, error } = await supabase
      .from("exercise_templates")
      .insert({
        user_id: userId,
        folder_id: folderId,
        name: data.name,
        equipment: data.equipment,
        exercise_type: data.exerciseType,
        default_measure_type: detectedMeasureType,
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
      toast.error("Failed to create exercise. Please try again.");
    }
  };

  // Add normal set
  const addSet = (exerciseId: string) => {
    setActiveExercises((prev) =>
      prev.map((ex) => {
        if (ex.id !== exerciseId) return ex;

        // Check if exercise already has L/R sets
        const hasLRSets = ex.sets.some(
          (s) => s.variant === "left" || s.variant === "right"
        );

        if (hasLRSets) {
          // Auto-add R+L pair to match existing pattern
          const rightSet = createSet("right", "", "R", ex.defaultMeasureType);
          const leftSet = createSet("left", "", "L", ex.defaultMeasureType);
          return { ...ex, sets: [...ex.sets, rightSet, leftSet] };
        }

        // Normal set - use exercise's default measure type
        return { ...ex, sets: [...ex.sets, createSet("normal", "", undefined, ex.defaultMeasureType)] };
      })
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
        const childSet = createSet("assisted-child", lastSet?.weight || "", "Ast", ex.defaultMeasureType);
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
        const childSet = createSet("drop", "", "Drop", ex.defaultMeasureType);
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
        const leftSet = createSet("left", lastSet?.weight || "", "L", ex.defaultMeasureType);
        return { ...ex, sets: [...updatedSets, leftSet] };
      })
    );
    setOpenOptionsMenuId(null);
  };

  // Toggle warmup variant on last set (or add new warmup set)
  const addWarmupSet = (exerciseId: string) => {
    setActiveExercises((prev) =>
      prev.map((ex) => {
        if (ex.id !== exerciseId) return ex;
        const lastSet = ex.sets[ex.sets.length - 1];

        // If last set is normal, convert it to warmup
        if (lastSet && lastSet.variant === "normal") {
          const updatedSets = ex.sets.map((s, i) =>
            i === ex.sets.length - 1 ? { ...s, variant: "warmup" as SetVariant, label: "W" } : s
          );
          return { ...ex, sets: updatedSets };
        }

        // Otherwise add a new warmup set
        const warmupSet = createSet("warmup", "", "W", ex.defaultMeasureType);
        return { ...ex, sets: [...ex.sets, warmupSet] };
      })
    );
    setOpenOptionsMenuId(null);
  };

  // Toggle failure variant on last set (or add new failure set)
  const addFailureSet = (exerciseId: string) => {
    setActiveExercises((prev) =>
      prev.map((ex) => {
        if (ex.id !== exerciseId) return ex;
        const lastSet = ex.sets[ex.sets.length - 1];

        // If last set is normal, convert it to failure
        if (lastSet && lastSet.variant === "normal") {
          const updatedSets = ex.sets.map((s, i) =>
            i === ex.sets.length - 1 ? { ...s, variant: "failure" as SetVariant, label: "F" } : s
          );
          return { ...ex, sets: updatedSets };
        }

        // Otherwise add a new failure set
        const failureSet = createSet("failure", "", "F", ex.defaultMeasureType);
        return { ...ex, sets: [...ex.sets, failureSet] };
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
  const handleSupersetCreateNew = async (data: { name: string; equipment: string; muscle_group?: string[]; gym_id?: string; is_gym_specific?: boolean }): Promise<ExerciseTemplate | null> => {
    // Detect default measure type for bodyweight exercises
    const detectedMeasureType = detectMeasureType(data.name, data.equipment);

    // Determine gym-specific based on equipment if not provided
    const gymSpecific = data.is_gym_specific ?? isGymSpecificEquipment(data.equipment);

    const { data: newTemplate, error } = await supabase
      .from("exercise_templates")
      .insert({
        user_id: userId,
        folder_id: folderId,
        name: data.name,
        equipment: data.equipment,
        exercise_type: "strength",
        default_measure_type: detectedMeasureType,
        order_index: libraryExercises.length,
        muscle_group: data.muscle_group && data.muscle_group.length > 0 ? data.muscle_group : null,
        gym_id: data.gym_id || locationId,
        is_gym_specific: gymSpecific,
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
      toast.error("Failed to create exercise. Please try again.");
    }

    return null;
  };

  // Toggle measure type (reps <-> secs) for a set
  const toggleSetMeasureType = (exerciseId: string, setId: string) => {
    setActiveExercises((prev) =>
      prev.map((ex) => {
        if (ex.id !== exerciseId) return ex;
        return {
          ...ex,
          sets: ex.sets.map((set) =>
            set.id === setId
              ? { ...set, measureType: set.measureType === "reps" ? "secs" : "reps" }
              : set
          ),
        };
      })
    );
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
      // Allow only integers
      if (value && !/^\d*$/.test(value)) return;
      const numValue = parseInt(value, 10);
      // Find the set to check its measureType
      const exercise = activeExercises.find((ex) => ex.id === exerciseId);
      const set = exercise?.sets.find((s) => s.id === setId);
      // Allow up to 3600 secs (1 hour) or 999 reps
      const maxValue = set?.measureType === "secs" ? 3600 : 999;
      if (!isNaN(numValue) && numValue > maxValue) return;
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

  // Validate a set based on its type (reps vs time-based)
  const isValidSet = (set: { weight: string; reps: string; measureType?: string }) => {
    const weight = parseFloat(set.weight);
    const reps = parseInt(set.reps, 10);
    const isTimeBased = set.measureType === 'secs';

    // For time-based exercises (planks, holds): weight can be 0 (bodyweight), but must have time > 0
    if (isTimeBased) {
      return !isNaN(reps) && reps > 0;
    }

    // For weight-based exercises: both weight and reps must be positive numbers
    return !isNaN(weight) && !isNaN(reps) && weight > 0 && reps > 0;
  };

  // Finish and save
  const handleFinish = async () => {
    const validExercises = activeExercises.filter((ex) =>
      ex.sets.some((s) => isValidSet(s))
    );

    const hasCardio = cardioNotes.trim().length > 0;

    if (validExercises.length === 0 && !hasCardio) {
      toast.error("Complete at least one set or add cardio notes before saving.");
      return;
    }

    setSaving(true);
    localStorage.removeItem("netgains-current-workout");
    onSave(validExercises, cardioNotes.trim() || undefined);
  };

  // Get equipment badge style
  const getEquipmentStyle = (equipment: string) => {
    const normalized = equipment?.toLowerCase() || "barbell";
    return EQUIPMENT_COLORS[normalized] || CUSTOM_EQUIPMENT_COLOR;
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

      {/* Choice Screen: Load Last Workout or Start Fresh */}
      {workoutMode === "choice" && (
        <div className="px-4 mb-6">
          {loadingPrevious ? (
            <div className="flex justify-center py-8">
              <div className="animate-pulse text-muted-foreground text-sm">
                Checking for previous workouts...
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {previousWorkout && (
                <motion.button
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleLoadPreviousWorkout}
                  className="w-full py-4 px-4 rounded-2xl flex items-center gap-4 text-left"
                  style={{
                    background: `rgba(${theme.primaryRgb}, 0.12)`,
                    border: `1px solid rgba(${theme.primaryRgb}, 0.3)`,
                  }}
                >
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
                    style={{ background: `rgba(${theme.primaryRgb}, 0.2)` }}
                  >
                    <RotateCcw className="w-6 h-6" style={{ color: theme.primary }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-base" style={{ color: theme.primary }}>
                      Load Last Workout
                    </h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {previousWorkout.exercises.length} exercises from{" "}
                      {new Date(previousWorkout.date).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })}
                    </p>
                  </div>
                </motion.button>
              )}

              <motion.button
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: previousWorkout ? 0.1 : 0 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleStartFresh}
                className="w-full py-4 px-4 rounded-2xl flex items-center gap-4 text-left"
                style={{
                  background: "rgba(255, 255, 255, 0.05)",
                  border: "1px solid rgba(255, 255, 255, 0.1)",
                }}
              >
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background: "rgba(255, 255, 255, 0.08)" }}
                >
                  <Sparkles className="w-6 h-6 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-base text-white">Start Fresh</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Begin with a blank workout
                  </p>
                </div>
              </motion.button>
            </div>
          )}
        </div>
      )}

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
                  background: hasSuperset ? "rgba(168, 85, 247, 0.08)" : "var(--card)",
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
                    {/* Advanced Sets Button */}
                    <div className="relative">
                      <motion.button
                        whileTap={{ scale: 0.95 }}
                        onClick={() =>
                          setOpenOptionsMenuId(
                            openOptionsMenuId === exercise.id ? null : exercise.id
                          )
                        }
                        className="px-2.5 py-1 rounded-lg text-xs font-medium text-gray-400 hover:text-white bg-white/5 hover:bg-white/10 transition-colors"
                      >
                        Advanced
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
                            <div className="border-t border-white/10 my-1" />
                            <button
                              onClick={() => addWarmupSet(exercise.id)}
                              className="flex items-center gap-3 px-4 py-3 text-sm w-full hover:bg-yellow-500/10 transition-colors text-yellow-400"
                            >
                              <Flame className="w-4 h-4" />
                              Warm-up
                            </button>
                            <button
                              onClick={() => addFailureSet(exercise.id)}
                              className="flex items-center gap-3 px-4 py-3 text-sm w-full hover:bg-orange-500/10 transition-colors text-orange-400"
                            >
                              <Target className="w-4 h-4" />
                              To Failure
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

                  {/* Previous Stats: Last Time + Best */}
                  {(() => {
                    const stats = getStatsForExercise(exercise);
                    if (!stats) return null;

                    const { lastTime, best } = stats;

                    // Check if last time IS the best (same weight and reps)
                    const lastTimeIsBest =
                      lastTime &&
                      best &&
                      lastTime.weight === best.weight &&
                      lastTime.reps === best.reps;

                    if (lastTimeIsBest && lastTime) {
                      // Combined line
                      return (
                        <div className="mt-1.5 text-xs text-amber-400 flex items-center gap-1">
                          <span>🏆</span>
                          <span>
                            Last time (PR): {lastTime.weight} lbs × {lastTime.reps} reps
                          </span>
                        </div>
                      );
                    }

                    return (
                      <div className="mt-1.5 space-y-0.5">
                        {lastTime && (
                          <div className="text-xs text-gray-400 flex items-center gap-1">
                            <span>📊</span>
                            <span>
                              Last time: {lastTime.weight} lbs × {lastTime.reps} reps
                            </span>
                          </div>
                        )}
                        {best && !lastTimeIsBest && (
                          <div className="text-xs text-amber-400 flex items-center gap-1">
                            <span>🏆</span>
                            <span>
                              Best: {best.weight} lbs × {best.reps} reps
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>

                {/* Set Headers */}
                <div className="grid grid-cols-[40px_1fr_1fr_32px] gap-2 px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  <span className="text-center">Set</span>
                  <span className="text-right pr-10">
                    {exercise.equipment === "bodyweight" ? "Added Wt" : "Weight"}
                  </span>
                  <span className="text-right pr-10">
                    {exercise.defaultMeasureType === "secs" ? "Time" : "Reps"}
                  </span>
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
                      if (set.variant === "warmup") return "#eab308";      // Yellow
                      if (set.variant === "failure") return "#f97316";     // Orange
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

                        {/* Weight Input - uses placeholder for previous values */}
                        <div className="relative">
                          {exercise.equipment === "bodyweight" && (
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-medium text-purple-400 pointer-events-none z-10">
                              +
                            </span>
                          )}
                          <input
                            type="text"
                            inputMode="decimal"
                            value={set.weight}
                            onChange={(e) =>
                              updateSet(exercise.id, set.id, "weight", e.target.value)
                            }
                            placeholder={set.previousWeight || (exercise.equipment === "bodyweight" ? "0" : "—")}
                            className={`w-full rounded-lg py-2.5 text-right font-semibold focus:outline-none focus:ring-2 focus:ring-primary min-h-[44px] ${
                              exercise.equipment === "bodyweight" ? "pl-10 pr-10" : "pl-3 pr-10"
                            } ${set.previousWeight ? "placeholder:text-white/30 placeholder:font-semibold" : "placeholder:text-gray-600"}`}
                            style={{ background: variantStyle.inputBg }}
                          />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-gray-500 pointer-events-none z-10">
                            lbs
                          </span>
                        </div>

                        {/* Reps/Secs Input - uses placeholder for previous values */}
                        <div className="relative">
                          <input
                            type="text"
                            inputMode="numeric"
                            value={set.reps}
                            onChange={(e) =>
                              updateSet(exercise.id, set.id, "reps", e.target.value)
                            }
                            placeholder={set.previousReps || set.targetReps || "—"}
                            className={`w-full rounded-lg pl-3 pr-12 py-2.5 text-right font-semibold focus:outline-none focus:ring-2 focus:ring-primary min-h-[44px] ${
                              set.previousReps
                                ? "placeholder:text-white/30 placeholder:font-semibold"
                                : set.targetReps
                                  ? "placeholder:text-cyan-500/60"
                                  : "placeholder:text-gray-600"
                            }`}
                            style={{ background: variantStyle.inputBg }}
                          />
                          {/* Toggle button for bodyweight exercises */}
                          {exercise.equipment === "bodyweight" ? (
                            <button
                              type="button"
                              onClick={() => toggleSetMeasureType(exercise.id, set.id)}
                              className="absolute right-2 top-1/2 -translate-y-1/2 px-1.5 py-0.5 text-xs font-medium rounded bg-white/10 hover:bg-white/20 text-gray-400 hover:text-white transition-colors z-10"
                            >
                              {set.measureType === "secs" ? "secs" : "reps"}
                            </button>
                          ) : (
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-gray-500 pointer-events-none z-10">
                              reps
                            </span>
                          )}
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

        {/* Empty State - only show when workout has started */}
        {workoutMode === "started" && activeExercises.length === 0 && !cardioNotes.trim() && (
          <div className="text-center py-16">
            <p className="text-muted-foreground mb-2">No exercises yet</p>
            <p className="text-sm text-muted-foreground">
              Tap Add Exercise below to start
            </p>
          </div>
        )}

        {/* Cardio Notes Field - show when workout started */}
        {workoutMode === "started" && (
          <div
            className="rounded-2xl p-4"
            style={{
              background: "var(--card)",
              border: "1px solid rgba(255, 255, 255, 0.05)",
            }}
          >
            <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
              Cardio Notes (Optional)
            </label>
            <textarea
              value={cardioNotes}
              onChange={(e) => setCardioNotes(e.target.value)}
              placeholder="e.g., 25 min incline walk, 10% incline, 3.2 mph"
              className="w-full bg-background/50 rounded-xl px-4 py-3 text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary resize-none"
              rows={2}
              style={{ minHeight: "60px" }}
            />
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

      {/* Add Exercise Button (primary action - on top) - only show when workout started */}
      {workoutMode === "started" && (
        <div
          className="fixed bottom-48 left-0 right-0 z-50"
          style={{
            background: "var(--background)",
          }}
        >
          <div className="max-w-lg mx-auto px-4 py-2">
            <motion.button
              whileTap={{ scale: 0.98 }}
              onClick={() => setShowExercisePicker(true)}
              className="w-full py-4 rounded-2xl font-bold text-base uppercase tracking-wide flex items-center justify-center gap-2"
              style={{
                background: `rgba(${theme.primaryRgb}, 0.15)`,
                border: `1px solid rgba(${theme.primaryRgb}, 0.3)`,
                color: theme.primary,
              }}
            >
              <Plus className="w-5 h-5" />
              Add Exercise
            </motion.button>
          </div>
        </div>
      )}

      {/* End Workout Button (below Add Exercise) - only show when workout started and has content */}
      {workoutMode === "started" && (activeExercises.length > 0 || cardioNotes.trim()) && (
        <div className="fixed left-0 right-0 z-40 px-4 bottom-28">
          <div className="max-w-lg mx-auto">
            <Button onClick={handleFinish} loading={saving}>
              End Workout
            </Button>
          </div>
        </div>
      )}

      {/* Background fill below nav to prevent scroll bleed-through - only when workout started */}
      {workoutMode === "started" && (
        <div
          className="fixed bottom-0 left-0 right-0 h-24 z-30"
          style={{ background: "var(--background)" }}
        />
      )}

      {/* Main Exercise Picker Modal */}
      <ExercisePickerModal
        open={showExercisePicker}
        onClose={() => setShowExercisePicker(false)}
        onSelect={(template) => {
          addExerciseFromLibrary(template);
          setShowExercisePicker(false);
        }}
        onCreateNew={handleSupersetCreateNew}
        userId={userId}
        folderId={folderId}
        locationId={locationId}
        folderName={folderName}
      />

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
        locationId={locationId}
        folderName={folderName}
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
                background: "var(--card)",
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

    </div>
  );
}

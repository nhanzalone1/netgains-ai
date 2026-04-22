"use client";

import { useState, useEffect } from "react";
import { Dumbbell, X, ChevronRight, Loader2 } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { motion, AnimatePresence } from "framer-motion";
import { apiFetch } from "@/lib/capacitor";

interface PendingWorkoutExercise {
  name: string;
  equipment: string;
  templateId: string | null;
  sets: Array<{
    weight: string;
    reps: string;
    targetReps: string;
    variant: string;
    measureType: string;
  }>;
  notes: string | null;
  defaultMeasureType: string;
}

interface PendingWorkout {
  workoutName: string;
  targetMuscles: string[];
  generatedAt: string;
  durationMinutes?: number;
  notes?: string;
  readyToLoad: boolean;
  folderId: string | null;
  folderName: string | null;
  exercises: PendingWorkoutExercise[];
}

interface PendingWorkoutBannerProps {
  onLoadWorkout: (workout: PendingWorkout) => void;
}

export function PendingWorkoutBanner({ onLoadWorkout }: PendingWorkoutBannerProps) {
  const { user } = useAuth();
  const [pendingWorkout, setPendingWorkout] = useState<PendingWorkout | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDismissing, setIsDismissing] = useState(false);
  const [isLoadingWorkout, setIsLoadingWorkout] = useState(false);

  useEffect(() => {
    if (!user?.id) return;

    const abortController = new AbortController();

    const fetchPendingWorkout = async () => {
      try {
        const response = await apiFetch("/api/workout/pending", {
          signal: abortController.signal,
        });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        if (data.pending_workout && data.pending_workout.readyToLoad) {
          setPendingWorkout(data.pending_workout);
        } else {
          setPendingWorkout(null);
        }
      } catch (err) {
        if ((err as Error).name === 'AbortError') return; // Ignore abort errors
        console.error("Failed to fetch pending workout:", err);
        setPendingWorkout(null);
      }

      setIsLoading(false);
    };

    fetchPendingWorkout();

    return () => {
      abortController.abort();
    };
  }, [user?.id]);

  const handleDismiss = async () => {
    setIsDismissing(true);
    try {
      await apiFetch("/api/workout/pending", { method: "DELETE" });
      setPendingWorkout(null);
    } catch (err) {
      console.error("Failed to dismiss pending workout:", err);
    }
    setIsDismissing(false);
  };

  const handleLoad = async () => {
    if (!pendingWorkout) return;

    setIsLoadingWorkout(true);

    const workoutExercises = pendingWorkout.exercises || [];

    // Convert to localStorage format
    const localStorageWorkout = {
      folderName: pendingWorkout.folderName || "Coach Workout",
      folderId: pendingWorkout.folderId,
      startedAt: new Date().toISOString(),
      fromCoach: true,
      exercises: workoutExercises.map(ex => ({
        name: ex.name,
        equipment: ex.equipment,
        templateId: ex.templateId,
        defaultMeasureType: ex.defaultMeasureType,
        notes: ex.notes,
        sets: (ex.sets || []).map(set => ({
          weight: set.weight,
          reps: set.reps,
          targetReps: set.targetReps,
          variant: set.variant,
          measureType: set.measureType,
        })),
      })),
    };

    // Save to localStorage
    localStorage.setItem("netgains-current-workout", JSON.stringify(localStorageWorkout));

    // Clear from database
    try {
      await apiFetch("/api/workout/pending", { method: "DELETE" });
    } catch (err) {
      console.error("Failed to clear pending workout:", err);
    }

    // Notify parent to load the workout
    onLoadWorkout(pendingWorkout);
    setPendingWorkout(null);
    setIsLoadingWorkout(false);
  };

  if (isLoading || !pendingWorkout) {
    return null;
  }

  const exercises = pendingWorkout.exercises || [];
  const totalSets = exercises.reduce((sum, ex) => sum + (ex.sets?.length || 0), 0);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        className="mb-4"
      >
        <div className="bg-gradient-to-r from-cyan-900/30 to-blue-900/30 border border-cyan-500/30 rounded-xl p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 flex-1">
              <div className="w-10 h-10 rounded-lg bg-cyan-500/20 flex items-center justify-center flex-shrink-0">
                <Dumbbell className="w-5 h-5 text-cyan-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-medium text-cyan-400 uppercase tracking-wide">
                    Workout Ready
                  </span>
                </div>
                <h3 className="text-white font-semibold truncate">
                  {pendingWorkout.workoutName}
                </h3>
                <p className="text-sm text-gray-400 mt-0.5">
                  {exercises.length} exercises, {totalSets} sets
                  {pendingWorkout.durationMinutes && ` \u2022 ~${pendingWorkout.durationMinutes} min`}
                </p>
                {pendingWorkout.folderName && (
                  <p className="text-xs text-gray-500 mt-1">
                    Loading into: {pendingWorkout.folderName}
                  </p>
                )}
              </div>
            </div>

            <button
              onClick={handleDismiss}
              disabled={isDismissing}
              className="p-1.5 rounded-lg hover:bg-white/10 transition-colors text-gray-400 hover:text-white"
              aria-label="Dismiss workout"
            >
              {isDismissing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <X className="w-4 h-4" />
              )}
            </button>
          </div>

          <button
            onClick={handleLoad}
            disabled={isLoadingWorkout}
            className="mt-3 w-full flex items-center justify-center gap-2 btn-primary py-2.5 px-4 rounded-lg"
          >
            {isLoadingWorkout ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Loading...
              </>
            ) : (
              <>
                Load Workout
                <ChevronRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

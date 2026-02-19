"use client";

import { useState, useEffect, useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  Loader2,
  TrendingUp,
  TrendingDown,
  ChevronDown,
  ChevronRight,
  Search,
  X,
  Dumbbell,
  BarChart3,
  Info,
  Trophy,
  Scale,
  Plus,
} from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/components/auth-provider";
import { useTheme } from "@/components/theme-provider";
import { UserMenu } from "@/components/user-menu";
import { GlassCard } from "@/components/ui/glass-card";
import { PageHeader } from "@/components/ui/page-header";
import { Popover } from "@/components/ui/popover";
import type { ExerciseTemplate } from "@/lib/supabase/types";

// Epley Formula: Est. 1RM = Weight × (1 + Reps / 30)
const calculateEst1RM = (weight: number, reps: number): number => {
  if (reps === 1) return weight; // Actual 1RM
  return Math.round(weight * (1 + reps / 30));
};

// Muscle group keywords for categorization
const MUSCLE_GROUP_KEYWORDS: Record<string, string[]> = {
  Chest: ["bench", "fly", "chest", "pec", "pushup", "push-up", "push up", "incline press", "decline press"],
  Back: ["row", "pull", "lat", "pulldown", "pullup", "pull-up", "pull up", "deadlift", "back", "shrug"],
  Shoulders: ["shoulder", "ohp", "overhead press", "lateral raise", "front raise", "rear delt", "delt", "military"],
  Legs: ["squat", "leg", "lunge", "calf", "quad", "hamstring", "glute", "hip", "rdl", "extension", "curl"],
  Arms: ["curl", "tricep", "bicep", "arm", "pushdown", "hammer", "preacher", "skull", "dip"],
  Core: ["ab", "core", "plank", "crunch", "sit-up", "situp", "oblique", "hanging leg", "cable crunch"],
};

// Categorize exercise by name
const categorizeExercise = (name: string): string => {
  const lowerName = name.toLowerCase();
  for (const [group, keywords] of Object.entries(MUSCLE_GROUP_KEYWORDS)) {
    if (keywords.some(kw => lowerName.includes(kw))) {
      return group;
    }
  }
  return "Other";
};

// Normalize exercise name for merging duplicates
const normalizeExerciseName = (name: string): string => {
  // Remove parenthetical tags like "(bodyweight)", "(dumbbell)"
  return name.replace(/\s*\([^)]*\)\s*$/, "").trim().toLowerCase();
};

// Exercise with PR data
interface ExerciseWithPR {
  id: string;
  name: string;
  equipment: string;
  normalizedName: string;
  prWeight: number;
  prReps: number;
  est1RM: number;
}

interface SessionData {
  date: string;
  dateFormatted: string;
  bestWeight: number;
  bestReps: number;
  est1RM: number;
  change: number; // Change from previous session
}

interface ChartDataPoint {
  date: string;
  est1RM: number;
  weight: number;
  reps: number;
}

export default function StatsPage() {
  const { user } = useAuth();
  const { theme } = useTheme();
  const supabase = createClient();

  // Exercises with PR data
  const [exercisesWithPR, setExercisesWithPR] = useState<ExerciseWithPR[]>([]);
  const [loadingExercises, setLoadingExercises] = useState(true);

  // Selected exercise
  const [selectedExercise, setSelectedExercise] = useState<ExerciseWithPR | null>(null);

  // Exercise history data
  const [sessionHistory, setSessionHistory] = useState<SessionData[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Picker modal
  const [showPicker, setShowPicker] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Collapsed sections
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());

  // Body weight tracking
  const [weighIns, setWeighIns] = useState<{ date: string; weight: number }[]>([]);
  const [showWeighInModal, setShowWeighInModal] = useState(false);
  const [weighInValue, setWeighInValue] = useState("");
  const [savingWeighIn, setSavingWeighIn] = useState(false);
  const [loadingWeighIns, setLoadingWeighIns] = useState(true);

  // Load exercises with PRs and weigh-ins on mount
  useEffect(() => {
    if (user) {
      loadExercisesWithPRs();
      loadWeighIns();
    } else {
      setLoadingExercises(false);
      setLoadingWeighIns(false);
    }
  }, [user]);

  const loadWeighIns = async () => {
    setLoadingWeighIns(true);
    const { data } = await supabase
      .from("weigh_ins")
      .select("date, weight_lbs")
      .eq("user_id", user!.id)
      .order("date", { ascending: true })
      .limit(90); // Last ~3 months

    setWeighIns(
      (data || []).map((w) => ({
        date: new Date(w.date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        weight: w.weight_lbs,
      }))
    );
    setLoadingWeighIns(false);
  };

  const handleSaveWeighIn = async () => {
    if (!weighInValue.trim() || !user) return;

    setSavingWeighIn(true);
    const weight = parseFloat(weighInValue);

    if (isNaN(weight) || weight <= 0) {
      setSavingWeighIn(false);
      return;
    }

    const today = new Date().toISOString().split("T")[0];

    // Upsert weigh-in (one per day)
    const { error: weighInError } = await supabase.from("weigh_ins").upsert(
      { user_id: user.id, date: today, weight_lbs: weight },
      { onConflict: "user_id,date" }
    );

    // Update profile weight
    if (!weighInError) {
      await supabase.from("profiles").update({ weight_lbs: weight }).eq("id", user.id);
    }

    setSavingWeighIn(false);
    setShowWeighInModal(false);
    setWeighInValue("");
    loadWeighIns();
  };

  // Load history when exercise is selected
  useEffect(() => {
    if (selectedExercise) {
      loadExerciseHistory(selectedExercise.name);
    }
  }, [selectedExercise]);

  const loadExercisesWithPRs = async () => {
    setLoadingExercises(true);

    // Get all exercise templates
    const { data: templates } = await supabase
      .from("exercise_templates")
      .select("*")
      .eq("user_id", user!.id)
      .order("name", { ascending: true });

    if (!templates || templates.length === 0) {
      setExercisesWithPR([]);
      setLoadingExercises(false);
      return;
    }

    // Get all exercises with sets to calculate PRs
    const { data: exercises } = await supabase
      .from("exercises")
      .select(`
        id,
        name,
        sets (
          weight,
          reps
        ),
        workouts!inner (
          user_id
        )
      `)
      .eq("workouts.user_id", user!.id);

    // Build PR map by normalized exercise name
    const prMap = new Map<string, { weight: number; reps: number; est1RM: number }>();

    (exercises || []).forEach((exercise) => {
      const sets = exercise.sets as { weight: number; reps: number }[];
      const normalizedName = normalizeExerciseName(exercise.name);

      sets.forEach((set) => {
        if (set.weight > 0 && set.reps > 0) {
          const est1RM = calculateEst1RM(set.weight, set.reps);
          const current = prMap.get(normalizedName);
          if (!current || est1RM > current.est1RM) {
            prMap.set(normalizedName, { weight: set.weight, reps: set.reps, est1RM });
          }
        }
      });
    });

    // Merge templates by normalized name and add PR data
    const mergedMap = new Map<string, ExerciseWithPR>();

    templates.forEach((template) => {
      const normalizedName = normalizeExerciseName(template.name);
      const pr = prMap.get(normalizedName);

      // Only add if not already in map (first occurrence wins for display name)
      if (!mergedMap.has(normalizedName)) {
        mergedMap.set(normalizedName, {
          id: template.id,
          name: template.name,
          equipment: template.equipment,
          normalizedName,
          prWeight: pr?.weight || 0,
          prReps: pr?.reps || 0,
          est1RM: pr?.est1RM || 0,
        });
      }
    });

    setExercisesWithPR(Array.from(mergedMap.values()));
    setLoadingExercises(false);
  };

  const toggleSection = (section: string) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(section)) {
        next.delete(section);
      } else {
        next.add(section);
      }
      return next;
    });
  };

  const loadExerciseHistory = async (exerciseName: string) => {
    setLoadingHistory(true);

    // Normalize the search name to merge duplicates
    const normalizedSearch = normalizeExerciseName(exerciseName);

    // Query all exercises for this user
    const { data: allExercises } = await supabase
      .from("exercises")
      .select(`
        id,
        name,
        workout_id,
        sets (
          weight,
          reps
        ),
        workouts!inner (
          id,
          date,
          user_id
        )
      `)
      .eq("workouts.user_id", user!.id);

    // Filter to exercises matching the normalized name (merges duplicates)
    const exercises = (allExercises || []).filter(
      (ex) => normalizeExerciseName(ex.name) === normalizedSearch
    );

    if (!exercises || exercises.length === 0) {
      setSessionHistory([]);
      setLoadingHistory(false);
      return;
    }

    // Process data: find best set per day for this exercise
    const sessionMap = new Map<string, { weight: number; reps: number; est1RM: number }>();

    exercises.forEach((exercise) => {
      const workout = exercise.workouts as { id: string; date: string; user_id: string };
      const sets = exercise.sets as { weight: number; reps: number }[];

      // Find the "Champion Set" - highest Est. 1RM for this day
      let bestSet = { weight: 0, reps: 0, est1RM: 0 };

      sets.forEach((set) => {
        if (set.weight > 0 && set.reps > 0) {
          const est1RM = calculateEst1RM(set.weight, set.reps);
          if (est1RM > bestSet.est1RM) {
            bestSet = { weight: set.weight, reps: set.reps, est1RM };
          }
        }
      });

      if (bestSet.est1RM > 0) {
        const dateKey = workout.date;
        const existing = sessionMap.get(dateKey);

        // Keep the better session if multiple on same day
        if (!existing || bestSet.est1RM > existing.est1RM) {
          sessionMap.set(dateKey, bestSet);
        }
      }
    });

    // Convert to array and calculate changes
    const sortedDates = Array.from(sessionMap.keys()).sort();
    const history: SessionData[] = sortedDates.map((date, index) => {
      const session = sessionMap.get(date)!;
      const prevSession = index > 0 ? sessionMap.get(sortedDates[index - 1]) : null;
      const change = prevSession ? session.est1RM - prevSession.est1RM : 0;

      return {
        date,
        dateFormatted: new Date(date).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        }),
        bestWeight: session.weight,
        bestReps: session.reps,
        est1RM: session.est1RM,
        change,
      };
    });

    setSessionHistory(history);
    setLoadingHistory(false);
  };

  // Filtered exercises for search
  const filteredExercises = useMemo(() => {
    if (!searchQuery.trim()) return exercisesWithPR;
    const query = searchQuery.toLowerCase();
    return exercisesWithPR.filter(
      (ex) =>
        ex.name.toLowerCase().includes(query) ||
        ex.equipment.toLowerCase().includes(query)
    );
  }, [exercisesWithPR, searchQuery]);

  // Group exercises by muscle group
  const groupedExercises = useMemo(() => {
    const groups: Record<string, ExerciseWithPR[]> = {};
    const muscleGroups = ["Chest", "Back", "Shoulders", "Legs", "Arms", "Core", "Other"];

    // Initialize all groups
    muscleGroups.forEach((g) => (groups[g] = []));

    filteredExercises.forEach((ex) => {
      const group = categorizeExercise(ex.name);
      groups[group].push(ex);
    });

    // Sort exercises within each group alphabetically
    Object.keys(groups).forEach((g) => {
      groups[g].sort((a, b) => a.name.localeCompare(b.name));
    });

    // Return only non-empty groups
    return muscleGroups.filter((g) => groups[g].length > 0).map((g) => ({
      name: g,
      exercises: groups[g],
    }));
  }, [filteredExercises]);

  // Chart data
  const chartData: ChartDataPoint[] = useMemo(() => {
    return sessionHistory.map((s) => ({
      date: s.dateFormatted,
      est1RM: s.est1RM,
      weight: s.bestWeight,
      reps: s.bestReps,
    }));
  }, [sessionHistory]);

  // Stats summary
  const stats = useMemo(() => {
    if (sessionHistory.length === 0) return null;

    const current = sessionHistory[sessionHistory.length - 1];
    const first = sessionHistory[0];
    const totalGain = current.est1RM - first.est1RM;
    const best = Math.max(...sessionHistory.map((s) => s.est1RM));

    return {
      current: current.est1RM,
      best,
      totalGain,
      sessions: sessionHistory.length,
    };
  }, [sessionHistory]);

  // Handle exercise selection
  const handleSelectExercise = (exercise: ExerciseWithPR) => {
    setSelectedExercise(exercise);
    setShowPicker(false);
    setSearchQuery("");
  };

  if (loadingExercises) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-4 pb-48 max-w-lg mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-black uppercase tracking-tighter">
            Stats
          </h1>
          <Popover trigger={<Info className="w-4 h-4 text-muted-foreground" />}>
            <div className="space-y-2">
              <p className="font-semibold text-white">Proof of Progress.</p>
              <ul className="text-sm text-gray-400 space-y-1">
                <li>• <span className="text-gray-300">All Lifts:</span> Track strength trends for <em>every</em> exercise, not just the main lifts.</li>
                <li>• <span className="text-gray-300">Est. 1RM:</span> Calculated using the Epley formula from your daily reps.</li>
                <li>• <span className="text-gray-300">The Trend:</span> Ignore bad days. Watch the line move up over time.</li>
              </ul>
            </div>
          </Popover>
        </div>
        <UserMenu />
      </div>

      {/* Body Weight Section */}
      <div
        className="mb-6 rounded-2xl overflow-hidden"
        style={{
          background: "#1a1a24",
          border: "1px solid rgba(255, 255, 255, 0.05)",
        }}
      >
        <div className="flex items-center justify-between p-4 border-b border-white/5">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ background: "rgba(147, 51, 234, 0.15)" }}
            >
              <Scale className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <p className="font-semibold text-white">Body Weight</p>
              {weighIns.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  Latest: {weighIns[weighIns.length - 1].weight} lbs
                </p>
              )}
            </div>
          </div>
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={() => setShowWeighInModal(true)}
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: "rgba(147, 51, 234, 0.15)" }}
          >
            <Plus className="w-5 h-5 text-purple-400" />
          </motion.button>
        </div>

        {/* Weight Chart */}
        {weighIns.length >= 2 ? (
          <div className="p-4 h-40">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={weighIns}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis
                  dataKey="date"
                  stroke="#a0a0b0"
                  tick={{ fill: "#a0a0b0", fontSize: 9 }}
                  interval="preserveStartEnd"
                />
                <YAxis
                  stroke="#a0a0b0"
                  tick={{ fill: "#a0a0b0", fontSize: 9 }}
                  domain={["dataMin - 5", "dataMax + 5"]}
                  width={35}
                />
                <Tooltip
                  contentStyle={{
                    background: "rgba(26, 26, 36, 0.95)",
                    border: "1px solid rgba(255, 255, 255, 0.1)",
                    borderRadius: "8px",
                  }}
                  labelStyle={{ color: "#ffffff" }}
                  formatter={(value: number) => [`${value} lbs`, "Weight"]}
                />
                <Line
                  type="monotone"
                  dataKey="weight"
                  stroke="#a855f7"
                  strokeWidth={2}
                  dot={{ fill: "#a855f7", strokeWidth: 0, r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : weighIns.length === 1 ? (
          <div className="p-4 text-center text-sm text-muted-foreground">
            Log another weigh-in to see your trend
          </div>
        ) : (
          <div className="p-4 text-center text-sm text-muted-foreground">
            Tap + to log your first weigh-in
          </div>
        )}
      </div>

      {/* Exercise Picker Button */}
      <motion.button
        whileTap={{ scale: 0.98 }}
        onClick={() => setShowPicker(true)}
        className="w-full mb-6 p-4 rounded-2xl flex items-center justify-between min-h-[60px]"
        style={{
          background: "#1a1a24",
          border: "1px solid rgba(255, 255, 255, 0.1)",
        }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: "rgba(255, 71, 87, 0.15)" }}
          >
            <Dumbbell className="w-5 h-5 text-primary" />
          </div>
          <div className="text-left">
            {selectedExercise ? (
              <>
                <p className="font-semibold text-white">{selectedExercise.name}</p>
                <p className="text-xs text-muted-foreground capitalize">
                  {selectedExercise.equipment}
                </p>
              </>
            ) : (
              <p className="text-muted-foreground">Select an exercise...</p>
            )}
          </div>
        </div>
        <ChevronDown className="w-5 h-5 text-muted-foreground" />
      </motion.button>

      {/* No Exercise Selected State */}
      {!selectedExercise && (
        <div className="text-center py-16">
          <div
            className="w-20 h-20 rounded-full mx-auto mb-4 flex items-center justify-center"
            style={{ background: "rgba(255, 71, 87, 0.1)" }}
          >
            <BarChart3 className="w-10 h-10 text-primary/50" />
          </div>
          <p className="text-muted-foreground mb-1">No exercise selected</p>
          <p className="text-sm text-muted-foreground">
            Select an exercise to view your strength progression.
          </p>
        </div>
      )}

      {/* Exercise Data */}
      {selectedExercise && (
        <>
          {loadingHistory ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : sessionHistory.length === 0 ? (
            <div className="text-center py-16">
              <div
                className="w-20 h-20 rounded-full mx-auto mb-4 flex items-center justify-center"
                style={{ background: "rgba(255, 71, 87, 0.1)" }}
              >
                <TrendingUp className="w-10 h-10 text-primary/50" />
              </div>
              <p className="text-muted-foreground mb-1">No data yet</p>
              <p className="text-sm text-muted-foreground">
                Log some workouts with {selectedExercise.name} to track your progress!
              </p>
            </div>
          ) : (
            <>
              {/* Stats Summary Cards */}
              {stats && (
                <div className="grid grid-cols-3 gap-3 mb-6">
                  <div
                    className="rounded-2xl p-3 text-center"
                    style={{
                      background: "#1a1a24",
                      border: "1px solid rgba(255, 255, 255, 0.05)",
                    }}
                  >
                    <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
                      Current
                    </p>
                    <p className="text-2xl font-black text-white">{stats.current}</p>
                    <p className="text-xs text-muted-foreground">lbs</p>
                  </div>
                  <div
                    className="rounded-2xl p-3 text-center"
                    style={{
                      background: "#1a1a24",
                      border: "1px solid rgba(255, 255, 255, 0.05)",
                    }}
                  >
                    <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
                      Best
                    </p>
                    <p className="text-2xl font-black text-primary">{stats.best}</p>
                    <p className="text-xs text-muted-foreground">lbs</p>
                  </div>
                  <div
                    className="rounded-2xl p-3 text-center"
                    style={{
                      background: "#1a1a24",
                      border: "1px solid rgba(255, 255, 255, 0.05)",
                    }}
                  >
                    <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
                      Total Gain
                    </p>
                    <p
                      className={`text-2xl font-black ${
                        stats.totalGain >= 0 ? "text-green-500" : "text-red-500"
                      }`}
                    >
                      {stats.totalGain >= 0 ? "+" : ""}
                      {stats.totalGain}
                    </p>
                    <p className="text-xs text-muted-foreground">lbs</p>
                  </div>
                </div>
              )}

              {/* Progress Chart */}
              <GlassCard className="mb-6">
                <h2 className="font-bold text-sm uppercase tracking-wide mb-4 text-muted-foreground">
                  Est. 1RM Progress
                </h2>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData}>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="rgba(255,255,255,0.05)"
                      />
                      <XAxis
                        dataKey="date"
                        stroke="#a0a0b0"
                        tick={{ fill: "#a0a0b0", fontSize: 10 }}
                        axisLine={{ stroke: "rgba(255,255,255,0.1)" }}
                      />
                      <YAxis
                        stroke="#a0a0b0"
                        tick={{ fill: "#a0a0b0", fontSize: 10 }}
                        domain={["dataMin - 10", "dataMax + 10"]}
                        axisLine={{ stroke: "rgba(255,255,255,0.1)" }}
                        tickFormatter={(value) => `${value}`}
                      />
                      <Tooltip
                        contentStyle={{
                          background: "rgba(26, 26, 36, 0.95)",
                          backdropFilter: "blur(16px)",
                          border: "1px solid rgba(255, 255, 255, 0.1)",
                          borderRadius: "12px",
                          boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
                        }}
                        labelStyle={{ color: "#ffffff", fontWeight: "bold" }}
                        formatter={(value: number, name: string, props: any) => {
                          if (name === "est1RM") {
                            const { weight, reps } = props.payload;
                            const isBodyweight = selectedExercise?.equipment === "bodyweight";
                            const weightDisplay = isBodyweight ? `BW+${weight}` : `${weight}lbs`;
                            return [
                              <span key="value">
                                <strong>{value} lbs</strong>
                                <br />
                                <span style={{ color: "#a0a0b0", fontSize: "12px" }}>
                                  Performed: {weightDisplay} × {reps} reps
                                </span>
                              </span>,
                              "Est. 1RM",
                            ];
                          }
                          return [value, name];
                        }}
                      />
                      <Line
                        type="monotone"
                        dataKey="est1RM"
                        stroke={theme.primary}
                        strokeWidth={2.5}
                        dot={{ fill: theme.primary, strokeWidth: 0, r: 4 }}
                        activeDot={{ r: 6, strokeWidth: 2, stroke: "#fff" }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </GlassCard>

              {/* Session History List */}
              <div
                className="rounded-2xl overflow-hidden"
                style={{
                  background: "#1a1a24",
                  border: "1px solid rgba(255, 255, 255, 0.05)",
                }}
              >
                <div className="px-4 py-3 border-b border-white/5">
                  <h2 className="font-bold text-sm uppercase tracking-wide text-muted-foreground">
                    Session History
                  </h2>
                </div>

                {/* Header Row */}
                <div className="grid grid-cols-3 gap-2 px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide border-b border-white/5">
                  <span>Date</span>
                  <span className="text-center">Best Set</span>
                  <span className="text-right">Est. 1RM</span>
                </div>

                {/* History Rows */}
                <div className="divide-y divide-white/5 max-h-[300px] overflow-y-auto">
                  {[...sessionHistory].reverse().map((session, index) => (
                    <motion.div
                      key={session.date}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.03 }}
                      className="grid grid-cols-3 gap-2 px-4 py-3 items-center"
                    >
                      <span className="text-sm text-white">
                        {session.dateFormatted}
                      </span>
                      <span className="text-sm text-muted-foreground text-center font-mono">
                        {selectedExercise?.equipment === "bodyweight"
                          ? `BW+${session.bestWeight}`
                          : session.bestWeight}{" "}
                        × {session.bestReps}
                      </span>
                      <div className="flex items-center justify-end gap-2">
                        <span className="text-sm font-semibold text-white">
                          {session.est1RM}
                        </span>
                        {session.change !== 0 && (
                          <span
                            className={`text-xs font-semibold flex items-center gap-0.5 ${
                              session.change > 0 ? "text-green-500" : "text-red-500"
                            }`}
                          >
                            {session.change > 0 ? (
                              <TrendingUp className="w-3 h-3" />
                            ) : (
                              <TrendingDown className="w-3 h-3" />
                            )}
                            {session.change > 0 ? "+" : ""}
                            {session.change}
                          </span>
                        )}
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>
            </>
          )}
        </>
      )}

      {/* Exercise Picker Modal */}
      <AnimatePresence>
        {showPicker && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] flex items-end justify-center bg-black/80 backdrop-blur-sm"
            onClick={() => {
              setShowPicker(false);
              setSearchQuery("");
            }}
          >
            <motion.div
              initial={{ opacity: 0, y: 100 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 100 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-lg rounded-t-3xl max-h-[80vh] flex flex-col"
              style={{
                background: "#1a1a24",
                border: "1px solid rgba(255, 255, 255, 0.1)",
              }}
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between p-4 border-b border-white/5">
                <h2 className="text-lg font-bold">Select Exercise</h2>
                <button
                  onClick={() => {
                    setShowPicker(false);
                    setSearchQuery("");
                  }}
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-white hover:bg-white/10"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Search */}
              <div className="p-4 border-b border-white/5">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search exercises..."
                    className="w-full bg-background/50 rounded-xl pl-10 pr-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary min-h-[44px]"
                    autoFocus
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery("")}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              {/* Exercise List - Grouped by Muscle */}
              <div className="flex-1 overflow-y-auto p-2">
                {groupedExercises.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <p>{searchQuery ? "No exercises match your search" : "No exercises yet"}</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {groupedExercises.map((group) => (
                      <div key={group.name}>
                        {/* Section Header */}
                        <button
                          onClick={() => toggleSection(group.name)}
                          className="w-full flex items-center gap-2 px-3 py-2 text-xs font-bold uppercase tracking-wider text-muted-foreground hover:text-white transition-colors"
                        >
                          {collapsedSections.has(group.name) ? (
                            <ChevronRight className="w-4 h-4" />
                          ) : (
                            <ChevronDown className="w-4 h-4" />
                          )}
                          {group.name}
                          <span className="text-[10px] bg-white/10 px-1.5 py-0.5 rounded-full">
                            {group.exercises.length}
                          </span>
                        </button>

                        {/* Exercises in Section */}
                        <AnimatePresence>
                          {!collapsedSections.has(group.name) && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: "auto", opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              className="overflow-hidden"
                            >
                              {group.exercises.map((exercise) => (
                                <motion.button
                                  key={exercise.id}
                                  whileTap={{ scale: 0.98 }}
                                  onClick={() => handleSelectExercise(exercise)}
                                  className="w-full p-3 rounded-xl flex items-center gap-3 text-left hover:bg-white/5 transition-colors"
                                >
                                  <div
                                    className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                                    style={{ background: "rgba(255, 71, 87, 0.15)" }}
                                  >
                                    <Dumbbell className="w-5 h-5 text-primary" />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="font-semibold truncate">{exercise.name}</p>
                                    {exercise.est1RM > 0 ? (
                                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                                        <Trophy className="w-3 h-3 text-yellow-500" />
                                        PR: {exercise.prWeight}×{exercise.prReps}
                                        <span className="text-[10px] text-muted-foreground/60">
                                          ({exercise.est1RM} est 1RM)
                                        </span>
                                      </p>
                                    ) : (
                                      <p className="text-xs text-muted-foreground capitalize">
                                        {exercise.equipment} • No data yet
                                      </p>
                                    )}
                                  </div>
                                </motion.button>
                              ))}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Weigh-In Modal */}
      <Modal open={showWeighInModal} onClose={() => setShowWeighInModal(false)} title="Log Weight">
        <div className="space-y-4">
          <div>
            <label className="block text-[10px] text-muted-foreground uppercase mb-1">
              Current Weight (lbs)
            </label>
            <input
              type="number"
              inputMode="decimal"
              value={weighInValue}
              onChange={(e) => setWeighInValue(e.target.value)}
              placeholder="e.g., 175"
              className="w-full bg-background/50 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary min-h-[44px] text-lg font-semibold"
              autoFocus
            />
          </div>
          <p className="text-xs text-muted-foreground text-center">
            This updates your profile weight for nutrition calculations
          </p>
          <Button onClick={handleSaveWeighIn} loading={savingWeighIn} disabled={!weighInValue.trim()}>
            Save Weight
          </Button>
        </div>
      </Modal>

      {/* Spacer for nav dock */}
      <div className="h-24 w-full shrink-0" />
    </div>
  );
}

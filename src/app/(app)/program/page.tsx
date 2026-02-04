"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Circle,
  CheckCircle2,
  Square,
  CheckSquare,
  Loader2,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  AlertTriangle,
  Info,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import {
  generateWeekSchedule,
  formatWarmupSets,
  getWeeklyTargets,
  type LiftMaxes,
  type WeekSchedule,
  type DaySchedule,
} from "@/lib/baechle-engine";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/components/auth-provider";
import { UserMenu } from "@/components/user-menu";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { Popover } from "@/components/ui/popover";
import type { ProgramSettings, ProgramProgress } from "@/lib/supabase/types";

const INTENSITY_COLORS = {
  heavy: {
    bg: "bg-primary/20",
    text: "text-primary",
    border: "border-primary/30",
  },
  light: {
    bg: "bg-success/20",
    text: "text-success",
    border: "border-success/30",
  },
  medium: {
    bg: "bg-orange-500/20",
    text: "text-orange-500",
    border: "border-orange-500/30",
  },
};

const PHASE_COLORS: Record<string, string> = {
  Strength: "text-primary",
  Unloading: "text-success",
  Power: "text-orange-500",
};

export default function ProgramPage() {
  const { user } = useAuth();
  const supabase = createClient();
  const [maxes, setMaxes] = useState<LiftMaxes>({
    squat: 0,
    bench: 0,
    deadlift: 0,
  });
  const [currentWeek, setCurrentWeek] = useState(1);
  const [schedule, setSchedule] = useState<WeekSchedule | null>(null);
  const [loading, setLoading] = useState(true);
  const [showMaxesInput, setShowMaxesInput] = useState(false);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);

  // Progress state
  const [completedDays, setCompletedDays] = useState<Map<string, boolean>>(new Map());
  const [weekCompleted, setWeekCompleted] = useState(false);

  // UI state
  const [expandedDay, setExpandedDay] = useState<string | null>(null);

  // Debounce ref for auto-save
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const weeklyTargets = getWeeklyTargets();

  // Load saved data on mount
  useEffect(() => {
    if (user) {
      loadSavedData();
    } else {
      setLoading(false);
    }
  }, [user]);

  // Regenerate schedule when maxes or week changes
  useEffect(() => {
    if (maxes.squat > 0 && maxes.bench > 0 && maxes.deadlift > 0) {
      setSchedule(generateWeekSchedule(maxes, currentWeek));
    }
  }, [currentWeek, maxes]);

  // Update week completion status when completedDays changes
  useEffect(() => {
    const weekKey = (day: string) => `${currentWeek}-${day}`;
    const allDaysComplete =
      completedDays.get(weekKey("MON")) &&
      completedDays.get(weekKey("WED")) &&
      completedDays.get(weekKey("FRI"));
    setWeekCompleted(!!allDaysComplete);
  }, [completedDays, currentWeek]);

  const loadSavedData = async () => {
    if (!user) return;

    try {
      // Load program settings (maxes)
      const { data: settings } = await supabase
        .from("program_settings")
        .select("*")
        .eq("user_id", user.id)
        .single();

      const savedSettings = settings as ProgramSettings | null;

      if (savedSettings) {
        setMaxes({
          squat: savedSettings.squat_max,
          bench: savedSettings.bench_max,
          deadlift: savedSettings.deadlift_max,
        });
        setCurrentWeek(savedSettings.current_week);

        // Show input form if maxes are all 0 (e.g., after a reset)
        if (savedSettings.squat_max === 0 && savedSettings.bench_max === 0 && savedSettings.deadlift_max === 0) {
          setShowMaxesInput(true);
        }
      } else {
        setShowMaxesInput(true);
      }

      // Load progress (completed days)
      const { data: progress } = await supabase
        .from("program_progress")
        .select("*")
        .eq("user_id", user.id);

      const savedProgress = (progress || []) as ProgramProgress[];
      const progressMap = new Map<string, boolean>();

      savedProgress.forEach((p) => {
        progressMap.set(`${p.week_number}-${p.day}`, p.is_complete);
      });

      setCompletedDays(progressMap);
    } catch (error) {
      console.error("Error loading saved data:", error);
      setShowMaxesInput(true);
    }

    setLoading(false);
  };

  // Debounced auto-save for maxes
  const autoSaveMaxes = useCallback(
    (newMaxes: LiftMaxes, week: number) => {
      if (!user) return;

      // Clear existing timeout
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      // Set new timeout (500ms debounce)
      saveTimeoutRef.current = setTimeout(async () => {
        setSaving(true);
        try {
          await supabase.from("program_settings").upsert({
            user_id: user.id,
            squat_max: newMaxes.squat,
            bench_max: newMaxes.bench,
            deadlift_max: newMaxes.deadlift,
            current_week: week,
          });
        } catch (error) {
          console.error("Error saving maxes:", error);
        }
        setSaving(false);
      }, 500);
    },
    [user, supabase]
  );

  // Save week change immediately
  const saveWeekChange = useCallback(
    async (week: number) => {
      if (!user) return;

      try {
        await supabase.from("program_settings").upsert({
          user_id: user.id,
          squat_max: maxes.squat,
          bench_max: maxes.bench,
          deadlift_max: maxes.deadlift,
          current_week: week,
        });
      } catch (error) {
        console.error("Error saving week:", error);
      }
    },
    [user, supabase, maxes]
  );

  // Instant save for progress checkmarks
  const saveProgress = useCallback(
    async (weekNumber: number, day: string, isComplete: boolean) => {
      if (!user) return;

      try {
        await supabase.from("program_progress").upsert({
          user_id: user.id,
          week_number: weekNumber,
          day,
          is_complete: isComplete,
          completed_at: isComplete ? new Date().toISOString() : null,
        });
      } catch (error) {
        console.error("Error saving progress:", error);
      }
    },
    [user, supabase]
  );

  const handleInputChange = (lift: keyof LiftMaxes, value: string) => {
    const numValue = parseInt(value) || 0;
    const newMaxes = { ...maxes, [lift]: numValue };
    setMaxes(newMaxes);
    autoSaveMaxes(newMaxes, currentWeek);
  };

  const handleSaveMaxes = async () => {
    if (maxes.squat > 0 && maxes.bench > 0 && maxes.deadlift > 0) {
      setSaving(true);
      if (user) {
        await supabase.from("program_settings").upsert({
          user_id: user.id,
          squat_max: maxes.squat,
          bench_max: maxes.bench,
          deadlift_max: maxes.deadlift,
          current_week: currentWeek,
        });
      }
      setSchedule(generateWeekSchedule(maxes, currentWeek));
      setShowMaxesInput(false);
      setSaving(false);
    }
  };

  const toggleDayExpanded = (dayShort: string) => {
    setExpandedDay(expandedDay === dayShort ? null : dayShort);
  };

  const toggleDayCompleted = (dayShort: string) => {
    const key = `${currentWeek}-${dayShort}`;
    const newValue = !completedDays.get(key);

    setCompletedDays((prev) => {
      const next = new Map(prev);
      next.set(key, newValue);
      return next;
    });

    // Instant save to database
    saveProgress(currentWeek, dayShort, newValue);
  };

  const toggleWeekCompleted = () => {
    const newValue = !weekCompleted;
    const days = ["MON", "WED", "FRI"];

    setCompletedDays((prev) => {
      const next = new Map(prev);
      days.forEach((day) => {
        next.set(`${currentWeek}-${day}`, newValue);
      });
      return next;
    });

    // Save all days
    days.forEach((day) => {
      saveProgress(currentWeek, day, newValue);
    });
  };

  const goToPrevWeek = () => {
    if (currentWeek > 1) {
      const newWeek = currentWeek - 1;
      setCurrentWeek(newWeek);
      saveWeekChange(newWeek);
    }
  };

  const goToNextWeek = () => {
    if (currentWeek < 8) {
      const newWeek = currentWeek + 1;
      setCurrentWeek(newWeek);
      saveWeekChange(newWeek);
    }
  };

  const selectWeek = (week: number) => {
    setCurrentWeek(week);
    saveWeekChange(week);
  };

  // Show reset confirmation modal
  const handleResetCycle = () => {
    if (!user) return;
    setShowResetModal(true);
  };

  // Confirm reset - performs a FULL wipe (progress + maxes)
  const handleConfirmReset = async () => {
    if (!user) return;

    setResetting(true);
    try {
      // Delete all progress for this user (clears checkboxes)
      await supabase
        .from("program_progress")
        .delete()
        .eq("user_id", user.id);

      // Reset maxes to 0 and week to 1 (full wipe)
      await supabase.from("program_settings").upsert({
        user_id: user.id,
        squat_max: 0,
        bench_max: 0,
        deadlift_max: 0,
        current_week: 1,
      });

      // Clear ALL local state immediately
      setCompletedDays(new Map());
      setCurrentWeek(1);
      setMaxes({ squat: 0, bench: 0, deadlift: 0 });
      setSchedule(null);
      setShowMaxesInput(true); // Show input form for new numbers
      setShowResetModal(false);
    } catch (error) {
      console.error("Error resetting cycle:", error);
    }
    setResetting(false);
  };

  const isDayCompleted = (dayShort: string) => {
    return completedDays.get(`${currentWeek}-${dayShort}`) || false;
  };

  const isValid = maxes.squat > 0 && maxes.bench > 0 && maxes.deadlift > 0;

  if (loading) {
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
            Program
          </h1>
          <Popover trigger={<Info className="w-4 h-4 text-muted-foreground" />}>
            <div className="space-y-2">
              <p className="font-semibold text-white">Your 8-Week Master Plan.</p>
              <ul className="text-sm text-gray-400 space-y-1">
                <li>• <span className="text-gray-300">The Goal:</span> Two 4-week blocks to build raw strength.</li>
                <li>• <span className="text-gray-300">The Flow:</span> Weeks 1-3 are for building. Week 4 is for recovery. Weeks 5-7 raise the intensity. Week 8 is a test.</li>
                <li>• <span className="text-gray-300">Training Max:</span> All numbers are based on 90% of your true max to ensure perfect form.</li>
              </ul>
            </div>
          </Popover>
        </div>
        <div className="flex items-center gap-2">
          {saving && (
            <span className="text-xs text-muted-foreground">Saving...</span>
          )}
          <UserMenu />
        </div>
      </div>

      {/* Maxes Input Section */}
      <AnimatePresence>
        {showMaxesInput && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden mb-6"
          >
            <GlassCard>
              <h2 className="text-sm font-bold uppercase tracking-wide mb-4 text-muted-foreground">
                Enter Your 1RM (lbs)
              </h2>

              <div className="space-y-4">
                {(["squat", "bench", "deadlift"] as const).map((lift) => (
                  <div key={lift}>
                    <label className="block text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">
                      {lift}
                    </label>
                    <input
                      type="number"
                      inputMode="numeric"
                      value={maxes[lift] || ""}
                      onChange={(e) => handleInputChange(lift, e.target.value)}
                      placeholder="0"
                      className="w-full bg-background/50 rounded-xl px-4 py-3 text-lg font-mono focus:outline-none focus:ring-2 focus:ring-primary min-h-[44px]"
                    />
                  </div>
                ))}

                <Button onClick={handleSaveMaxes} disabled={!isValid} loading={saving}>
                  Generate 8-Week Program
                </Button>
              </div>
            </GlassCard>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Week Card */}
      {schedule && !showMaxesInput && (
        <div className="space-y-4">
          {/* Week Navigation */}
          <div className="flex items-center justify-between">
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={goToPrevWeek}
              disabled={currentWeek === 1}
              className={`w-11 h-11 flex items-center justify-center min-w-[44px] min-h-[44px] rounded-xl ${
                currentWeek === 1
                  ? "text-muted-foreground/30"
                  : "text-foreground bg-muted/30"
              }`}
            >
              <ChevronLeft className="w-6 h-6" />
            </motion.button>

            <div className="text-center">
              <p className={`text-xs uppercase tracking-wide ${PHASE_COLORS[schedule.phase] || "text-muted-foreground"}`}>
                {schedule.phase} Phase
              </p>
              <p className="text-2xl font-black uppercase tracking-tight">
                Week {schedule.week}
                <span className="text-muted-foreground font-normal text-lg">
                  {" "}
                  / 8
                </span>
              </p>
            </div>

            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={goToNextWeek}
              disabled={currentWeek === 8}
              className={`w-11 h-11 flex items-center justify-center min-w-[44px] min-h-[44px] rounded-xl ${
                currentWeek === 8
                  ? "text-muted-foreground/30"
                  : "text-foreground bg-muted/30"
              }`}
            >
              <ChevronRight className="w-6 h-6" />
            </motion.button>
          </div>

          {/* Week Card */}
          <div
            className="rounded-2xl overflow-hidden"
            style={{
              background: "#1a1a24",
              border: "1px solid rgba(255, 255, 255, 0.05)",
            }}
          >
            {/* Week Header */}
            <div className="flex items-center justify-between p-4 border-b border-white/5">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
                  Weekly Target
                </p>
                <p className="font-black text-lg">
                  {Math.round(schedule.weeklyTargetPercent * 100)}% of 1RM
                  <span className="text-muted-foreground font-normal text-sm ml-2">
                    ({weeklyTargets[currentWeek - 1]?.scheme})
                  </span>
                </p>
              </div>
              <motion.button
                whileTap={{ scale: 0.9 }}
                onClick={toggleWeekCompleted}
                className="w-11 h-11 flex items-center justify-center min-w-[44px] min-h-[44px]"
              >
                {weekCompleted ? (
                  <CheckSquare className="w-7 h-7 text-success" />
                ) : (
                  <Square className="w-7 h-7 text-muted-foreground" />
                )}
              </motion.button>
            </div>

            {/* Days */}
            <div className="divide-y divide-white/5">
              {schedule.days.map((day) => (
                <DayRow
                  key={day.shortDay}
                  day={day}
                  isExpanded={expandedDay === day.shortDay}
                  isCompleted={isDayCompleted(day.shortDay)}
                  onToggleExpand={() => toggleDayExpanded(day.shortDay)}
                  onToggleComplete={() => toggleDayCompleted(day.shortDay)}
                />
              ))}
            </div>
          </div>

          {/* Week Selector Pills */}
          <div className="flex gap-1 justify-center flex-wrap">
            {weeklyTargets.map((target) => {
              // Check if any day in this week is complete
              const hasProgress =
                completedDays.get(`${target.week}-MON`) ||
                completedDays.get(`${target.week}-WED`) ||
                completedDays.get(`${target.week}-FRI`);
              const isFullyComplete =
                completedDays.get(`${target.week}-MON`) &&
                completedDays.get(`${target.week}-WED`) &&
                completedDays.get(`${target.week}-FRI`);

              return (
                <motion.button
                  key={target.week}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => selectWeek(target.week)}
                  className={`
                    w-9 h-9 rounded-lg text-sm font-bold transition-colors min-h-[36px] relative
                    ${
                      currentWeek === target.week
                        ? "bg-primary text-primary-foreground"
                        : isFullyComplete
                        ? "bg-success/30 text-success"
                        : hasProgress
                        ? "bg-orange-500/30 text-orange-500"
                        : "bg-muted/30 text-muted-foreground hover:text-foreground"
                    }
                  `}
                >
                  {target.week}
                </motion.button>
              );
            })}
          </div>

          {/* Action Buttons */}
          <div className="space-y-2">
            <Button
              variant="ghost"
              onClick={() => setShowMaxesInput(true)}
              className="!bg-muted/30"
            >
              Update 1RM Maxes
            </Button>

            <Button
              variant="outline"
              onClick={handleResetCycle}
              loading={resetting}
              icon={<RotateCcw className="w-5 h-5" />}
              className="!border-primary/50 !text-primary hover:!bg-primary/10"
            >
              Reset Cycle
            </Button>
          </div>

          {/* Spacer to ensure content scrolls above floating nav dock */}
          <div className="h-48 w-full shrink-0" />
        </div>
      )}

      {/* Reset Confirmation Modal */}
      <AnimatePresence>
        {showResetModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
            onClick={() => setShowResetModal(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm rounded-2xl p-6 border border-gray-800"
              style={{
                background: "#1a1a24",
              }}
            >
              {/* Icon */}
              <div className="flex justify-center mb-4">
                <div
                  className="w-16 h-16 rounded-full flex items-center justify-center"
                  style={{ background: "rgba(239, 68, 68, 0.15)" }}
                >
                  <AlertTriangle className="w-8 h-8 text-red-500" />
                </div>
              </div>

              {/* Title */}
              <h2 className="text-xl font-bold text-center text-white mb-2">
                Start New Cycle?
              </h2>

              {/* Message */}
              <p className="text-sm text-gray-400 text-center mb-6">
                This will clear all your progress AND your current maxes. You will need to enter new numbers.
              </p>

              {/* Buttons */}
              <div className="flex gap-3">
                <button
                  onClick={() => setShowResetModal(false)}
                  className="flex-1 py-3 rounded-xl font-semibold text-white transition-colors"
                  style={{ background: "rgba(55, 55, 65, 0.8)" }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmReset}
                  disabled={resetting}
                  className="flex-1 py-3 rounded-xl font-semibold text-white bg-red-500 hover:bg-red-600 transition-colors disabled:opacity-50"
                >
                  {resetting ? "Resetting..." : "Reset Everything"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

interface DayRowProps {
  day: DaySchedule;
  isExpanded: boolean;
  isCompleted: boolean;
  onToggleExpand: () => void;
  onToggleComplete: () => void;
}

function DayRow({
  day,
  isExpanded,
  isCompleted,
  onToggleExpand,
  onToggleComplete,
}: DayRowProps) {
  const colors = INTENSITY_COLORS[day.intensity];

  return (
    <div>
      {/* Main Row */}
      <div className="flex items-center gap-3 p-4">
        {/* Circle Checkbox */}
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={(e) => {
            e.stopPropagation();
            onToggleComplete();
          }}
          className="w-11 h-11 flex items-center justify-center min-w-[44px] min-h-[44px] flex-shrink-0"
        >
          {isCompleted ? (
            <CheckCircle2 className="w-7 h-7 text-success" />
          ) : (
            <Circle className="w-7 h-7 text-muted-foreground" />
          )}
        </motion.button>

        {/* Day Content - Clickable for expand */}
        <motion.button
          whileTap={{ scale: 0.98 }}
          onClick={onToggleExpand}
          className="flex-1 text-left min-h-[44px]"
        >
          <div className="flex items-start justify-between">
            <div>
              {/* Day Name */}
              <p className={`font-black text-lg uppercase tracking-tight mb-1 ${isCompleted ? "text-muted-foreground" : ""}`}>
                {day.shortDay}
              </p>
              {/* Lifts */}
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                {day.lifts.map((lift) => (
                  <span
                    key={lift.shortName}
                    className={`text-sm font-mono ${
                      isCompleted ? "text-muted-foreground line-through" : ""
                    }`}
                  >
                    <span className={`font-semibold ${isCompleted ? "text-muted-foreground" : "text-foreground"}`}>
                      {lift.shortName}:
                    </span>{" "}
                    {lift.weight}{" "}
                    <span className="text-muted-foreground">
                      ({lift.sets}x{lift.reps})
                    </span>
                  </span>
                ))}
              </div>
            </div>

            {/* Intensity Badge with Percentage */}
            <span
              className={`px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wide flex-shrink-0 whitespace-nowrap ${colors.bg} ${colors.text}`}
            >
              {day.intensityLabel}
            </span>
          </div>
        </motion.button>
      </div>

      {/* Expandable Warmup Section */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 pl-[72px]">
              <div
                className={`rounded-xl p-3 ${colors.bg} border ${colors.border}`}
              >
                <h4 className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-2">
                  Warmup Sets (NSCA Protocol)
                </h4>
                <div className="space-y-1">
                  {day.warmups.map((warmup) => (
                    <div key={warmup.shortName} className="text-sm font-mono">
                      <span className={`font-semibold ${colors.text}`}>
                        {warmup.shortName}:
                      </span>{" "}
                      <span className="text-foreground">
                        {formatWarmupSets(warmup)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

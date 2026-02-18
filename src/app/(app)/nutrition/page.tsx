"use client";

import { useState, useEffect } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Check,
  Sparkles,
  X,
  Wand2,
  Loader2,
  Clock,
  Copy,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { motion, PanInfo } from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/components/auth-provider";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { NutritionOnboarding } from "@/components/nutrition-onboarding";

interface Meal {
  id: string;
  date: string;
  meal_type: "meal" | "snack";
  food_name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  serving_size?: string;
  ai_generated: boolean;
  consumed: boolean;
  created_at: string;
}

interface NutritionGoals {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

interface WeekData {
  date: Date;
  calories: number;
  goal: number;
}

const DEFAULT_GOALS: NutritionGoals = {
  calories: 2000,
  protein: 150,
  carbs: 200,
  fat: 65,
};

interface RecentFood {
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  serving: string;
}

function formatDate(date: Date): string {
  // Use local time, not UTC (toISOString gives UTC which can shift dates)
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDisplayDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}

function getDayName(date: Date): string {
  return date.toLocaleDateString("en-US", { weekday: "short" }).charAt(0);
}

function getWeekDates(centerDate: Date): Date[] {
  const dates: Date[] = [];
  const start = new Date(centerDate);
  start.setDate(start.getDate() - start.getDay());
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    dates.push(d);
  }
  return dates;
}

function formatTime(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
}

// Compact Circular Progress Ring
function CalorieRing({
  consumed,
  goal,
  size = 160,
  strokeWidth = 12
}: {
  consumed: number;
  goal: number;
  size?: number;
  strokeWidth?: number;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const progress = Math.min(consumed / goal, 1);
  const offset = circumference - (progress * circumference);
  const remaining = Math.max(goal - consumed, 0);

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)' }}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(255, 255, 255, 0.1)"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--primary)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 1s ease-out' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-black text-white">{consumed.toLocaleString()}</span>
        <span className="text-xs text-muted-foreground">/ {goal.toLocaleString()}</span>
      </div>
    </div>
  );
}

// Horizontal Macro Bar
function MacroBar({ label, current, goal, color }: { label: string; current: number; goal: number; color: string }) {
  const progress = Math.min((current / goal) * 100, 100);

  return (
    <div className="flex-1">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
        <span className="text-xs font-semibold">
          <span style={{ color }}>{current}</span>
          <span className="text-muted-foreground">/{goal}g</span>
        </span>
      </div>
      <div className="h-2 rounded-full bg-white/5 overflow-hidden">
        <motion.div
          className="h-full rounded-full"
          style={{ background: color }}
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.8, ease: "easeOut" }}
        />
      </div>
    </div>
  );
}

export default function NutritionPage() {
  const { user } = useAuth();
  const supabase = createClient();
  const router = useRouter();

  const [selectedDate, setSelectedDate] = useState(new Date());
  const [meals, setMeals] = useState<Meal[]>([]);
  const [goals, setGoals] = useState<NutritionGoals>(DEFAULT_GOALS);
  const [weekData, setWeekData] = useState<WeekData[]>([]);
  const [loading, setLoading] = useState(true);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [hasCheckedOnboarding, setHasCheckedOnboarding] = useState(false);

  // Add food modal
  const [showAddFood, setShowAddFood] = useState(false);
  const [addFoodType, setAddFoodType] = useState<"meal" | "snack">("meal");
  const [foodName, setFoodName] = useState("");
  const [foodCalories, setFoodCalories] = useState("");
  const [foodProtein, setFoodProtein] = useState("");
  const [foodCarbs, setFoodCarbs] = useState("");
  const [foodFat, setFoodFat] = useState("");
  const [foodServing, setFoodServing] = useState("");
  const [savingFood, setSavingFood] = useState(false);
  const [estimating, setEstimating] = useState(false);
  const [isAiEstimate, setIsAiEstimate] = useState(false);

  const [swipeDirection, setSwipeDirection] = useState(0);
  const [recentFoods, setRecentFoods] = useState<RecentFood[]>([]);

  // Goals editor modal
  const [showGoalsEditor, setShowGoalsEditor] = useState(false);
  const [editCalories, setEditCalories] = useState("");
  const [editProtein, setEditProtein] = useState("");
  const [editCarbs, setEditCarbs] = useState("");
  const [editFat, setEditFat] = useState("");
  const [savingGoals, setSavingGoals] = useState(false);


  // Always start on today's date when page loads
  useEffect(() => {
    setSelectedDate(new Date());
  }, []);

  useEffect(() => {
    if (!user) return;
    loadData();
    loadWeekData();
    loadRecentFoods();
  }, [user, selectedDate]);

  const loadData = async () => {
    if (!user) return;
    setLoading(true);

    const dateStr = formatDate(selectedDate);

    // Fetch meals, goals, and profile in parallel
    const [mealsResult, goalsResult, profileResult] = await Promise.all([
      supabase
        .from("meals")
        .select("*")
        .eq("user_id", user.id)
        .eq("date", dateStr)
        .order("created_at", { ascending: true }),
      supabase
        .from("nutrition_goals")
        .select("*")
        .eq("user_id", user.id)
        .single(),
      supabase
        .from("profiles")
        .select("nutrition_onboarding_complete, onboarding_complete")
        .eq("id", user.id)
        .single(),
    ]);

    const mealsData = mealsResult.data || [];
    setMeals(mealsData as Meal[]);

    if (goalsResult.data) {
      setGoals(goalsResult.data as NutritionGoals);
    }

    // Check if we need to show nutrition onboarding
    // Show if: main onboarding complete, nutrition onboarding NOT complete, and no meals logged
    if (!hasCheckedOnboarding && profileResult.data) {
      const profile = profileResult.data;
      console.log("[Nutrition Onboarding] Profile check:", {
        onboarding_complete: profile.onboarding_complete,
        nutrition_onboarding_complete: profile.nutrition_onboarding_complete,
      });

      const needsOnboarding =
        profile.onboarding_complete === true &&
        profile.nutrition_onboarding_complete !== true;

      console.log("[Nutrition Onboarding] Needs onboarding:", needsOnboarding);

      // Also check if they have ANY meals ever (not just today)
      if (needsOnboarding) {
        const { count } = await supabase
          .from("meals")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id);

        console.log("[Nutrition Onboarding] Meal count:", count);

        if (count === 0) {
          console.log("[Nutrition Onboarding] Showing onboarding!");
          setShowOnboarding(true);
        }
      }
      setHasCheckedOnboarding(true);
    }

    setLoading(false);
  };

  const loadWeekData = async () => {
    if (!user) return;

    const weekDates = getWeekDates(selectedDate);
    const startDate = formatDate(weekDates[0]);
    const endDate = formatDate(weekDates[6]);

    const { data: weekMeals } = await supabase
      .from("meals")
      .select("date, calories, consumed")
      .eq("user_id", user.id)
      .gte("date", startDate)
      .lte("date", endDate);

    const weekDataMap = new Map<string, number>();
    (weekMeals || []).forEach((meal: { date: string; calories: number; consumed: boolean }) => {
      if (meal.consumed) {
        const current = weekDataMap.get(meal.date) || 0;
        weekDataMap.set(meal.date, current + meal.calories);
      }
    });

    setWeekData(weekDates.map((date) => ({
      date,
      calories: weekDataMap.get(formatDate(date)) || 0,
      goal: goals.calories,
    })));
  };

  const loadRecentFoods = async () => {
    if (!user) return;

    // Get distinct recent foods from the last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { data: recentMeals } = await supabase
      .from("meals")
      .select("food_name, calories, protein, carbs, fat, serving_size")
      .eq("user_id", user.id)
      .gte("date", formatDate(thirtyDaysAgo))
      .order("created_at", { ascending: false })
      .limit(50);

    if (recentMeals) {
      // Get unique foods by name (keep most recent)
      const uniqueFoods = new Map<string, RecentFood>();
      recentMeals.forEach((meal) => {
        if (!uniqueFoods.has(meal.food_name)) {
          uniqueFoods.set(meal.food_name, {
            name: meal.food_name,
            calories: meal.calories,
            protein: meal.protein,
            carbs: meal.carbs,
            fat: meal.fat,
            serving: meal.serving_size || "",
          });
        }
      });
      setRecentFoods(Array.from(uniqueFoods.values()).slice(0, 5));
    }
  };

  const handleNutritionOnboardingComplete = (newGoals: NutritionGoals) => {
    setGoals(newGoals);
    setShowOnboarding(false);
    // Reload week data with new goals
    loadWeekData();
  };

  const goToPreviousDay = () => {
    setSwipeDirection(-1);
    const prev = new Date(selectedDate);
    prev.setDate(prev.getDate() - 1);
    setSelectedDate(prev);
  };

  const goToNextDay = () => {
    setSwipeDirection(1);
    const next = new Date(selectedDate);
    next.setDate(next.getDate() + 1);
    setSelectedDate(next);
  };

  const goToDate = (date: Date) => {
    setSwipeDirection(date > selectedDate ? 1 : -1);
    setSelectedDate(date);
  };

  const handleDragEnd = (_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    if (info.offset.x > 100) goToPreviousDay();
    else if (info.offset.x < -100) goToNextDay();
  };

  const totals = meals
    .filter((m) => m.consumed)
    .reduce(
      (acc, meal) => ({
        calories: acc.calories + meal.calories,
        protein: acc.protein + meal.protein,
        carbs: acc.carbs + meal.carbs,
        fat: acc.fat + meal.fat,
      }),
      { calories: 0, protein: 0, carbs: 0, fat: 0 }
    );

  // Get meal/snack labels with numbers
  const getMealLabel = (meal: Meal, index: number): string => {
    const sameTypeMeals = meals.filter((m) => m.meal_type === meal.meal_type);
    const mealIndex = sameTypeMeals.findIndex((m) => m.id === meal.id) + 1;
    return meal.meal_type === "meal" ? `Meal ${mealIndex}` : `Snack ${mealIndex}`;
  };

  const openWithFood = (food: RecentFood) => {
    setFoodName(food.name);
    setFoodCalories(food.calories.toString());
    setFoodProtein(food.protein.toString());
    setFoodCarbs(food.carbs.toString());
    setFoodFat(food.fat.toString());
    setFoodServing(food.serving);
    setShowAddFood(true);
  };

  const handleEstimateMacros = async () => {
    if (!foodName.trim()) return;

    setEstimating(true);
    try {
      const response = await fetch("/api/nutrition/estimate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ foodDescription: foodName }),
      });

      if (response.ok) {
        const data = await response.json();
        setFoodName(data.food_name || foodName);
        setFoodCalories(data.calories?.toString() || "");
        setFoodProtein(data.protein?.toString() || "");
        setFoodCarbs(data.carbs?.toString() || "");
        setFoodFat(data.fat?.toString() || "");
        setFoodServing(data.serving_size || "");
        setIsAiEstimate(true);
      }
    } catch (error) {
      console.error("Failed to estimate:", error);
    }
    setEstimating(false);
  };

  const handleSaveFood = async () => {
    if (!user || !foodName.trim()) return;

    setSavingFood(true);

    await supabase.from("meals").insert({
      user_id: user.id,
      date: formatDate(selectedDate),
      meal_type: addFoodType,
      food_name: foodName.trim(),
      calories: parseInt(foodCalories) || 0,
      protein: parseInt(foodProtein) || 0,
      carbs: parseInt(foodCarbs) || 0,
      fat: parseInt(foodFat) || 0,
      serving_size: foodServing.trim() || null,
      ai_generated: false,
      consumed: true,
    });

    setSavingFood(false);
    setShowAddFood(false);
    setFoodName("");
    setFoodCalories("");
    setFoodProtein("");
    setFoodCarbs("");
    setFoodFat("");
    setFoodServing("");
    setIsAiEstimate(false);
    loadData();
    loadWeekData();
    loadRecentFoods();
  };

  const markAsConsumed = async (mealId: string) => {
    await supabase.from("meals").update({ consumed: true }).eq("id", mealId);
    setMeals((prev) => prev.map((m) => (m.id === mealId ? { ...m, consumed: true } : m)));
    loadWeekData();
  };

  const deleteMeal = async (mealId: string) => {
    await supabase.from("meals").delete().eq("id", mealId);
    setMeals((prev) => prev.filter((m) => m.id !== mealId));
    loadWeekData();
  };

  const copyMeal = async (meal: Meal) => {
    if (!user) return;

    const today = new Date();
    const todayStr = formatDate(today);
    const isViewingToday = formatDate(selectedDate) === todayStr;

    const { data } = await supabase
      .from("meals")
      .insert({
        user_id: user.id,
        date: todayStr, // Always copy to today
        meal_type: meal.meal_type,
        food_name: meal.food_name,
        calories: meal.calories,
        protein: meal.protein,
        carbs: meal.carbs,
        fat: meal.fat,
        serving_size: meal.serving_size,
        ai_generated: false,
        consumed: true,
      })
      .select()
      .single();

    if (data) {
      // Only add to local state if viewing today
      if (isViewingToday) {
        setMeals((prev) => [...prev, data as Meal]);
      }
      loadWeekData();
    }
  };

  const openGoalsEditor = () => {
    setEditCalories(goals.calories.toString());
    setEditProtein(goals.protein.toString());
    setEditCarbs(goals.carbs.toString());
    setEditFat(goals.fat.toString());
    setShowGoalsEditor(true);
  };

  const handleSaveGoals = async () => {
    if (!user) return;

    setSavingGoals(true);

    const newGoals = {
      calories: parseInt(editCalories) || goals.calories,
      protein: parseInt(editProtein) || goals.protein,
      carbs: parseInt(editCarbs) || goals.carbs,
      fat: parseInt(editFat) || goals.fat,
    };

    // Upsert goals (insert or update)
    const { error } = await supabase
      .from("nutrition_goals")
      .upsert({
        user_id: user.id,
        ...newGoals,
      }, { onConflict: "user_id" });

    if (!error) {
      setGoals(newGoals);
      setShowGoalsEditor(false);
      loadWeekData();
    }

    setSavingGoals(false);
  };

  const weekDates = getWeekDates(selectedDate);

  return (
    <div className="min-h-screen pb-32" style={{ background: "#0f0f13" }}>
      {/* Header */}
      <div className="sticky top-0 z-20 pt-4 pb-2 px-4" style={{ background: "#0f0f13" }}>
        <div className="flex items-center justify-between">
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={goToPreviousDay}
            className="w-10 h-10 rounded-full flex items-center justify-center"
            style={{ background: "rgba(255, 255, 255, 0.05)" }}
          >
            <ChevronLeft className="w-5 h-5" />
          </motion.button>

          <motion.h1
            key={formatDate(selectedDate)}
            initial={{ opacity: 0, y: swipeDirection * 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-lg font-bold"
          >
            {formatDisplayDate(selectedDate)}
          </motion.h1>

          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={goToNextDay}
            className="w-10 h-10 rounded-full flex items-center justify-center"
            style={{ background: "rgba(255, 255, 255, 0.05)" }}
          >
            <ChevronRight className="w-5 h-5" />
          </motion.button>
        </div>

        {/* Week View */}
        <div className="flex items-end justify-between mt-4 px-2">
          {weekDates.map((date, i) => {
            const dayData = weekData[i];
            const percentage = dayData ? Math.min((dayData.calories / dayData.goal) * 100, 100) : 0;
            const isSelected = formatDate(date) === formatDate(selectedDate);
            const isTodayDate = formatDate(date) === formatDate(new Date());

            return (
              <motion.button
                key={formatDate(date)}
                whileTap={{ scale: 0.95 }}
                onClick={() => goToDate(date)}
                className="flex flex-col items-center gap-1 flex-1"
              >
                <div
                  className="w-5 rounded-full overflow-hidden flex items-end"
                  style={{ height: 32, background: "rgba(255, 255, 255, 0.05)" }}
                >
                  <motion.div
                    className="w-full rounded-full"
                    style={{ background: isSelected ? "var(--primary)" : "rgba(255, 255, 255, 0.2)" }}
                    initial={{ height: 0 }}
                    animate={{ height: `${percentage}%` }}
                    transition={{ duration: 0.5, delay: i * 0.05 }}
                  />
                </div>
                <span className={`text-[10px] font-semibold ${isSelected ? "text-primary" : isTodayDate ? "text-white" : "text-muted-foreground"}`}>
                  {getDayName(date)}
                </span>
              </motion.button>
            );
          })}
        </div>
      </div>

      {/* Nutrition Onboarding */}
      {showOnboarding && (
        <div className="mx-4 mb-4 rounded-2xl overflow-hidden" style={{ background: "#1a1a24", border: "1px solid rgba(255, 255, 255, 0.05)" }}>
          <NutritionOnboarding onComplete={handleNutritionOnboardingComplete} />
        </div>
      )}

      {/* Main Content */}
      <motion.div
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.1}
        onDragEnd={handleDragEnd}
        className="px-4 pt-4"
      >
        {/* Ring + Macros Row */}
        <div className="flex items-start gap-4 mb-6">
          {/* Calorie Ring - Left (tap to edit goals) */}
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={openGoalsEditor}
            className="flex flex-col items-center"
          >
            <CalorieRing consumed={totals.calories} goal={goals.calories} />
            <span className="text-[9px] text-muted-foreground mt-1">
              tap to edit
            </span>
          </motion.button>

          {/* Macro Bars - Right (horizontal, stacked) */}
          <div className="flex-1 flex flex-col gap-3 pt-4">
            <MacroBar label="Protein" current={totals.protein} goal={goals.protein} color="var(--macro-protein)" />
            <MacroBar label="Carbs" current={totals.carbs} goal={goals.carbs} color="var(--macro-carbs)" />
            <MacroBar label="Fat" current={totals.fat} goal={goals.fat} color="var(--macro-fat)" />
          </div>
        </div>

        {/* Recent Foods */}
        {recentFoods.length > 0 && (
          <div className="mb-6">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Recent</p>
            <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-hide">
              {recentFoods.map((food) => (
                <motion.button
                  key={food.name}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => openWithFood(food)}
                  className="flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium"
                  style={{ background: "rgba(255, 255, 255, 0.05)", border: "1px solid rgba(255, 255, 255, 0.1)" }}
                >
                  {food.name}
                </motion.button>
              ))}
            </div>
          </div>
        )}

        {/* Meals/Snacks List */}
        <div className="space-y-2">
          {meals.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              No meals logged yet today
            </div>
          ) : (
            meals.map((meal, index) => (
              <motion.div
                key={meal.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className={`rounded-xl p-3 flex items-center gap-3 ${
                  meal.ai_generated && !meal.consumed
                    ? "border border-dashed border-purple-500/30 bg-purple-500/5"
                    : ""
                }`}
                style={{ background: meal.ai_generated && !meal.consumed ? undefined : "rgba(26, 26, 36, 0.6)" }}
              >
                {/* Time */}
                <div className="flex flex-col items-center text-muted-foreground w-12 shrink-0">
                  <Clock className="w-3 h-3 mb-0.5" />
                  <span className="text-[10px]">{formatTime(meal.created_at)}</span>
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">{getMealLabel(meal, index)}</span>
                    {meal.ai_generated && !meal.consumed && (
                      <span className="text-[9px] uppercase font-bold text-purple-400 bg-purple-500/20 px-1 py-0.5 rounded">
                        Planned
                      </span>
                    )}
                  </div>
                  <p className="font-medium text-sm truncate">{meal.food_name}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {meal.calories} cal • {meal.protein}g P • {meal.carbs}g C • {meal.fat}g F
                  </p>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1">
                  {meal.ai_generated && !meal.consumed && (
                    <motion.button
                      whileTap={{ scale: 0.9 }}
                      onClick={() => markAsConsumed(meal.id)}
                      className="w-8 h-8 rounded-lg flex items-center justify-center bg-green-500/20 text-green-400"
                    >
                      <Check className="w-4 h-4" />
                    </motion.button>
                  )}
                  <motion.button
                    whileTap={{ scale: 0.9 }}
                    onClick={() => copyMeal(meal)}
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-primary"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </motion.button>
                  <motion.button
                    whileTap={{ scale: 0.9 }}
                    onClick={() => deleteMeal(meal.id)}
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-red-400"
                  >
                    <X className="w-3.5 h-3.5" />
                  </motion.button>
                </div>
              </motion.div>
            ))
          )}

          {/* Add Food Button - Below Meals */}
          <motion.button
            whileTap={{ scale: 0.98 }}
            onClick={() => setShowAddFood(true)}
            className="w-full py-3 rounded-xl flex items-center justify-center gap-2 text-sm font-medium mt-4"
            style={{ background: "rgba(255, 255, 255, 0.05)", border: "1px dashed rgba(255, 255, 255, 0.15)" }}
          >
            <Plus className="w-4 h-4 text-primary" />
            <span className="text-muted-foreground">Add Food</span>
          </motion.button>
        </div>
      </motion.div>

      {/* Floating Coach Button */}
      <motion.button
        whileTap={{ scale: 0.9 }}
        onClick={() => router.push("/coach")}
        className="fixed bottom-32 right-4 z-40 w-12 h-12 rounded-full flex items-center justify-center shadow-lg"
        style={{ background: "rgba(26, 26, 36, 0.9)", border: "1px solid rgba(255, 255, 255, 0.1)" }}
      >
        <Sparkles className="w-5 h-5 text-primary" />
      </motion.button>

      {/* Add Food Modal */}
      <Modal open={showAddFood} onClose={() => setShowAddFood(false)} title="Add Food">
        <div className="space-y-4">
          {/* Meal or Snack Toggle */}
          <div className="flex gap-2">
            <button
              onClick={() => setAddFoodType("meal")}
              className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                addFoodType === "meal" ? "bg-primary text-primary-foreground" : "bg-white/5 text-muted-foreground"
              }`}
            >
              Meal
            </button>
            <button
              onClick={() => setAddFoodType("snack")}
              className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                addFoodType === "snack" ? "bg-primary text-primary-foreground" : "bg-white/5 text-muted-foreground"
              }`}
            >
              Snack
            </button>
          </div>

          {/* Food Name + Estimate */}
          <div className="space-y-2">
            <input
              type="text"
              value={foodName}
              onChange={(e) => { setFoodName(e.target.value); setIsAiEstimate(false); }}
              placeholder="e.g., chicken breast 6oz, 2 eggs"
              className="w-full bg-background/50 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary min-h-[44px]"
              autoFocus
            />
            <motion.button
              whileTap={{ scale: 0.98 }}
              onClick={handleEstimateMacros}
              disabled={!foodName.trim() || estimating}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50"
              style={{ background: "rgba(147, 51, 234, 0.15)", border: "1px solid rgba(147, 51, 234, 0.3)" }}
            >
              {estimating ? <Loader2 className="w-4 h-4 animate-spin text-purple-400" /> : <Wand2 className="w-4 h-4 text-purple-400" />}
              <span className="text-purple-400">{estimating ? "Estimating..." : "Estimate Macros"}</span>
            </motion.button>
          </div>

          {isAiEstimate && (
            <motion.p initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} className="text-xs text-purple-400 text-center">
              AI estimate — adjust if needed
            </motion.p>
          )}

          {/* Macros Grid */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] text-muted-foreground uppercase mb-1">Calories</label>
              <input
                type="number"
                inputMode="numeric"
                value={foodCalories}
                onChange={(e) => setFoodCalories(e.target.value)}
                placeholder="0"
                className="w-full bg-background/50 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary min-h-[44px]"
              />
            </div>
            <div>
              <label className="block text-[10px] text-muted-foreground uppercase mb-1">Protein (g)</label>
              <input
                type="number"
                inputMode="numeric"
                value={foodProtein}
                onChange={(e) => setFoodProtein(e.target.value)}
                placeholder="0"
                className="w-full bg-background/50 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary min-h-[44px]"
              />
            </div>
            <div>
              <label className="block text-[10px] text-muted-foreground uppercase mb-1">Carbs (g)</label>
              <input
                type="number"
                inputMode="numeric"
                value={foodCarbs}
                onChange={(e) => setFoodCarbs(e.target.value)}
                placeholder="0"
                className="w-full bg-background/50 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary min-h-[44px]"
              />
            </div>
            <div>
              <label className="block text-[10px] text-muted-foreground uppercase mb-1">Fat (g)</label>
              <input
                type="number"
                inputMode="numeric"
                value={foodFat}
                onChange={(e) => setFoodFat(e.target.value)}
                placeholder="0"
                className="w-full bg-background/50 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary min-h-[44px]"
              />
            </div>
          </div>

          <input
            type="text"
            value={foodServing}
            onChange={(e) => setFoodServing(e.target.value)}
            placeholder="Serving size (optional)"
            className="w-full bg-background/50 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary min-h-[44px]"
          />

          <Button onClick={handleSaveFood} loading={savingFood} disabled={!foodName.trim()}>
            Add Food
          </Button>
        </div>
      </Modal>

      {/* Goals Editor Modal */}
      <Modal open={showGoalsEditor} onClose={() => setShowGoalsEditor(false)} title="Daily Goals">
        <div className="space-y-4">
          <div>
            <label className="block text-[10px] text-muted-foreground uppercase mb-1">Calories</label>
            <input
              type="number"
              inputMode="numeric"
              value={editCalories}
              onChange={(e) => setEditCalories(e.target.value)}
              placeholder="2000"
              className="w-full bg-background/50 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary min-h-[44px]"
              autoFocus
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-[10px] text-muted-foreground uppercase mb-1">Protein (g)</label>
              <input
                type="number"
                inputMode="numeric"
                value={editProtein}
                onChange={(e) => setEditProtein(e.target.value)}
                placeholder="150"
                className="w-full bg-background/50 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary min-h-[44px]"
              />
            </div>
            <div>
              <label className="block text-[10px] text-muted-foreground uppercase mb-1">Carbs (g)</label>
              <input
                type="number"
                inputMode="numeric"
                value={editCarbs}
                onChange={(e) => setEditCarbs(e.target.value)}
                placeholder="200"
                className="w-full bg-background/50 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary min-h-[44px]"
              />
            </div>
            <div>
              <label className="block text-[10px] text-muted-foreground uppercase mb-1">Fat (g)</label>
              <input
                type="number"
                inputMode="numeric"
                value={editFat}
                onChange={(e) => setEditFat(e.target.value)}
                placeholder="65"
                className="w-full bg-background/50 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary min-h-[44px]"
              />
            </div>
          </div>

          <Button onClick={handleSaveGoals} loading={savingGoals}>
            Save Goals
          </Button>
        </div>
      </Modal>

    </div>
  );
}

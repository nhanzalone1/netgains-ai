"use client";

import { useState, useEffect, useRef } from "react";
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Plus,
  Check,
  Sparkles,
  X,
  Wand2,
  Loader2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence, PanInfo } from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/components/auth-provider";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";

interface Meal {
  id: string;
  date: string;
  meal_type: "breakfast" | "lunch" | "dinner" | "snack";
  food_name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  serving_size?: string;
  ai_generated: boolean;
  consumed: boolean;
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

const MEAL_TYPES = ["breakfast", "lunch", "dinner", "snack"] as const;
const MEAL_LABELS: Record<string, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snack: "Snacks",
};

const QUICK_FOODS = [
  { name: "Chicken Breast", calories: 165, protein: 31, carbs: 0, fat: 4, serving: "4oz" },
  { name: "Rice", calories: 205, protein: 4, carbs: 45, fat: 0, serving: "1 cup" },
  { name: "Eggs", calories: 155, protein: 13, carbs: 1, fat: 11, serving: "2 large" },
  { name: "Protein Shake", calories: 120, protein: 25, carbs: 3, fat: 1, serving: "1 scoop" },
  { name: "Banana", calories: 105, protein: 1, carbs: 27, fat: 0, serving: "1 medium" },
  { name: "Greek Yogurt", calories: 100, protein: 17, carbs: 6, fat: 1, serving: "170g" },
];

function formatDate(date: Date): string {
  return date.toISOString().split("T")[0];
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
  start.setDate(start.getDate() - start.getDay()); // Start from Sunday

  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    dates.push(d);
  }
  return dates;
}

// Circular Progress Ring Component
function CalorieRing({
  consumed,
  goal,
  size = 240,
  strokeWidth = 16
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
      {/* SVG Ring */}
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        style={{ transform: 'rotate(-90deg)' }}
      >
        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(255, 255, 255, 0.1)"
          strokeWidth={strokeWidth}
        />
        {/* Progress circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#ff4757"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={offset}
          style={{
            transition: 'stroke-dashoffset 1s ease-out',
          }}
        />
      </svg>
      {/* Center text - positioned absolutely */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-5xl font-black text-white">
          {remaining.toLocaleString()}
        </span>
        <span className="text-sm text-muted-foreground mt-1">remaining</span>
        <span className="text-xs text-muted-foreground mt-3">
          {consumed.toLocaleString()} / {goal.toLocaleString()} kcal
        </span>
      </div>
    </div>
  );
}

// Macro Progress Bar Component
function MacroBar({
  label,
  current,
  goal,
  color
}: {
  label: string;
  current: number;
  goal: number;
  color: string;
}) {
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
  const containerRef = useRef<HTMLDivElement>(null);

  const [selectedDate, setSelectedDate] = useState(new Date());
  const [meals, setMeals] = useState<Meal[]>([]);
  const [goals, setGoals] = useState<NutritionGoals>(DEFAULT_GOALS);
  const [weekData, setWeekData] = useState<WeekData[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedMeals, setExpandedMeals] = useState<Set<string>>(new Set());

  // Add food modal
  const [showAddFood, setShowAddFood] = useState(false);
  const [addFoodMealType, setAddFoodMealType] = useState<string>("lunch");
  const [foodName, setFoodName] = useState("");
  const [foodCalories, setFoodCalories] = useState("");
  const [foodProtein, setFoodProtein] = useState("");
  const [foodCarbs, setFoodCarbs] = useState("");
  const [foodFat, setFoodFat] = useState("");
  const [foodServing, setFoodServing] = useState("");
  const [savingFood, setSavingFood] = useState(false);
  const [estimating, setEstimating] = useState(false);
  const [isAiEstimate, setIsAiEstimate] = useState(false);

  // Swipe direction for animation
  const [swipeDirection, setSwipeDirection] = useState(0);

  // Load data
  useEffect(() => {
    if (!user) return;
    loadData();
    loadWeekData();
  }, [user, selectedDate]);

  const loadData = async () => {
    if (!user) return;
    setLoading(true);

    const dateStr = formatDate(selectedDate);

    const { data: mealsData } = await supabase
      .from("meals")
      .select("*")
      .eq("user_id", user.id)
      .eq("date", dateStr)
      .order("created_at", { ascending: true });

    setMeals((mealsData || []) as Meal[]);

    const { data: goalsData } = await supabase
      .from("nutrition_goals")
      .select("*")
      .eq("user_id", user.id)
      .single();

    if (goalsData) {
      setGoals(goalsData as NutritionGoals);
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

    const data: WeekData[] = weekDates.map((date) => ({
      date,
      calories: weekDataMap.get(formatDate(date)) || 0,
      goal: goals.calories,
    }));

    setWeekData(data);
  };

  // Navigation
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

  // Handle swipe
  const handleDragEnd = (_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    if (info.offset.x > 100) {
      goToPreviousDay();
    } else if (info.offset.x < -100) {
      goToNextDay();
    }
  };

  // Calculate totals
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

  // Toggle meal section
  const toggleMealSection = (mealType: string) => {
    setExpandedMeals((prev) => {
      const next = new Set(prev);
      if (next.has(mealType)) {
        next.delete(mealType);
      } else {
        next.add(mealType);
      }
      return next;
    });
  };

  // Quick add food
  const quickAddFood = async (food: typeof QUICK_FOODS[0]) => {
    if (!user) return;

    await supabase.from("meals").insert({
      user_id: user.id,
      date: formatDate(selectedDate),
      meal_type: addFoodMealType,
      food_name: food.name,
      calories: food.calories,
      protein: food.protein,
      carbs: food.carbs,
      fat: food.fat,
      serving_size: food.serving,
      ai_generated: false,
      consumed: true,
    });

    loadData();
    loadWeekData();
  };

  // Estimate macros using AI
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

  // Save custom food
  const handleSaveFood = async () => {
    if (!user || !foodName.trim()) return;

    setSavingFood(true);

    await supabase.from("meals").insert({
      user_id: user.id,
      date: formatDate(selectedDate),
      meal_type: addFoodMealType,
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
  };

  // Mark as consumed
  const markAsConsumed = async (mealId: string) => {
    await supabase
      .from("meals")
      .update({ consumed: true })
      .eq("id", mealId);

    setMeals((prev) =>
      prev.map((m) => (m.id === mealId ? { ...m, consumed: true } : m))
    );
    loadWeekData();
  };

  // Delete meal
  const deleteMeal = async (mealId: string) => {
    await supabase.from("meals").delete().eq("id", mealId);
    setMeals((prev) => prev.filter((m) => m.id !== mealId));
    loadWeekData();
  };

  const weekDates = getWeekDates(selectedDate);
  const isToday = formatDate(selectedDate) === formatDate(new Date());

  return (
    <div
      ref={containerRef}
      className="min-h-screen pb-32"
      style={{ background: "#0f0f13" }}
    >
      {/* Header - Date Navigation */}
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
                  className="w-6 rounded-full overflow-hidden"
                  style={{
                    height: 40,
                    background: "rgba(255, 255, 255, 0.05)",
                  }}
                >
                  <motion.div
                    className="w-full rounded-full"
                    style={{
                      background: isSelected ? "#ff4757" : "rgba(255, 255, 255, 0.2)",
                    }}
                    initial={{ height: 0 }}
                    animate={{ height: `${percentage}%` }}
                    transition={{ duration: 0.5, delay: i * 0.05 }}
                  />
                </div>
                <span
                  className={`text-[10px] font-semibold ${
                    isSelected
                      ? "text-primary"
                      : isTodayDate
                        ? "text-white"
                        : "text-muted-foreground"
                  }`}
                >
                  {getDayName(date)}
                </span>
              </motion.button>
            );
          })}
        </div>
      </div>

      {/* Main Content - Swipeable */}
      <motion.div
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.1}
        onDragEnd={handleDragEnd}
        className="px-4"
      >
        {/* Calorie Ring */}
        <motion.div
          key={formatDate(selectedDate)}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3 }}
          className="flex justify-center py-6"
        >
          <CalorieRing consumed={totals.calories} goal={goals.calories} />
        </motion.div>

        {/* Macro Bars */}
        <div className="flex gap-4 mb-6">
          <MacroBar label="Protein" current={totals.protein} goal={goals.protein} color="#22c55e" />
          <MacroBar label="Carbs" current={totals.carbs} goal={goals.carbs} color="#3b82f6" />
          <MacroBar label="Fat" current={totals.fat} goal={goals.fat} color="#eab308" />
        </div>

        {/* Quick Add Section */}
        <div className="mb-6">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            Quick Add
          </h3>
          <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-hide">
            {QUICK_FOODS.map((food) => (
              <motion.button
                key={food.name}
                whileTap={{ scale: 0.95 }}
                onClick={() => quickAddFood(food)}
                className="flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium"
                style={{
                  background: "rgba(255, 255, 255, 0.05)",
                  border: "1px solid rgba(255, 255, 255, 0.1)",
                }}
              >
                {food.name}
              </motion.button>
            ))}
          </div>
        </div>

        {/* Meals List - Collapsed by Default */}
        <div className="space-y-2">
          {MEAL_TYPES.map((mealType) => {
            const mealItems = meals.filter((m) => m.meal_type === mealType);
            const isExpanded = expandedMeals.has(mealType);
            const mealCalories = mealItems
              .filter((m) => m.consumed)
              .reduce((acc, m) => acc + m.calories, 0);

            return (
              <div
                key={mealType}
                className="rounded-xl overflow-hidden"
                style={{ background: "rgba(26, 26, 36, 0.6)" }}
              >
                <button
                  onClick={() => toggleMealSection(mealType)}
                  className="w-full flex items-center justify-between p-3"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{MEAL_LABELS[mealType]}</span>
                    {mealItems.length > 0 && (
                      <span className="text-xs text-muted-foreground">
                        ({mealItems.length})
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {mealCalories > 0 && (
                      <span className="text-sm text-muted-foreground">
                        {mealCalories} cal
                      </span>
                    )}
                    <ChevronDown
                      className={`w-4 h-4 text-muted-foreground transition-transform ${
                        isExpanded ? "" : "-rotate-90"
                      }`}
                    />
                  </div>
                </button>

                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                    >
                      <div className="px-3 pb-3 space-y-2">
                        {mealItems.map((meal) => (
                          <div
                            key={meal.id}
                            className={`rounded-lg p-2.5 flex items-center justify-between ${
                              meal.ai_generated && !meal.consumed
                                ? "border border-dashed border-purple-500/30 bg-purple-500/5"
                                : "bg-background/30"
                            }`}
                          >
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="font-medium text-sm truncate">
                                  {meal.food_name}
                                </p>
                                {meal.ai_generated && !meal.consumed && (
                                  <span className="text-[9px] uppercase font-bold text-purple-400 bg-purple-500/20 px-1 py-0.5 rounded">
                                    Planned
                                  </span>
                                )}
                              </div>
                              <p className="text-[11px] text-muted-foreground">
                                {meal.calories} cal • {meal.protein}g P
                              </p>
                            </div>

                            <div className="flex items-center gap-1 ml-2">
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
                                onClick={() => deleteMeal(meal.id)}
                                className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-red-400"
                              >
                                <X className="w-3.5 h-3.5" />
                              </motion.button>
                            </div>
                          </div>
                        ))}

                        {mealItems.length === 0 && (
                          <p className="text-xs text-muted-foreground text-center py-2">
                            No foods logged
                          </p>
                        )}

                        <button
                          onClick={() => {
                            setAddFoodMealType(mealType);
                            setShowAddFood(true);
                          }}
                          className="w-full py-2 text-xs font-semibold text-primary uppercase tracking-wide hover:bg-primary/5 transition-colors rounded-lg"
                        >
                          + Add
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </motion.div>

      {/* Floating Action Buttons */}
      <div className="fixed bottom-32 right-4 z-40 flex flex-col gap-3">
        {/* Ask Coach Button */}
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={() => router.push("/coach")}
          className="w-12 h-12 rounded-full flex items-center justify-center shadow-lg"
          style={{
            background: "rgba(26, 26, 36, 0.9)",
            border: "1px solid rgba(255, 255, 255, 0.1)",
          }}
        >
          <Sparkles className="w-5 h-5 text-primary" />
        </motion.button>

        {/* Add Food Button */}
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={() => setShowAddFood(true)}
          className="w-14 h-14 rounded-full flex items-center justify-center shadow-lg"
          style={{
            background: "linear-gradient(135deg, #ff4757 0%, #ff6b81 100%)",
            boxShadow: "0 4px 20px rgba(255, 71, 87, 0.4)",
          }}
        >
          <Plus className="w-6 h-6 text-white" />
        </motion.button>
      </div>

      {/* Add Food Modal */}
      <Modal
        open={showAddFood}
        onClose={() => setShowAddFood(false)}
        title="Add Food"
      >
        <div className="space-y-4">
          {/* Meal Type Selector */}
          <div className="flex gap-2">
            {MEAL_TYPES.map((type) => (
              <button
                key={type}
                onClick={() => setAddFoodMealType(type)}
                className={`flex-1 py-2 rounded-lg text-xs font-semibold uppercase transition-colors ${
                  addFoodMealType === type
                    ? "bg-primary text-primary-foreground"
                    : "bg-white/5 text-muted-foreground"
                }`}
              >
                {MEAL_LABELS[type].slice(0, 5)}
              </button>
            ))}
          </div>

          {/* Food Name + Estimate Button */}
          <div className="space-y-2">
            <input
              type="text"
              value={foodName}
              onChange={(e) => {
                setFoodName(e.target.value);
                setIsAiEstimate(false);
              }}
              placeholder="e.g., chicken breast 6oz, 2 eggs, protein shake"
              className="w-full bg-background/50 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary min-h-[44px]"
              autoFocus
            />
            <motion.button
              whileTap={{ scale: 0.98 }}
              onClick={handleEstimateMacros}
              disabled={!foodName.trim() || estimating}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50"
              style={{
                background: "rgba(147, 51, 234, 0.15)",
                border: "1px solid rgba(147, 51, 234, 0.3)",
              }}
            >
              {estimating ? (
                <Loader2 className="w-4 h-4 animate-spin text-purple-400" />
              ) : (
                <Wand2 className="w-4 h-4 text-purple-400" />
              )}
              <span className="text-purple-400">
                {estimating ? "Estimating..." : "Estimate Macros"}
              </span>
            </motion.button>
          </div>

          {/* AI Estimate Note */}
          {isAiEstimate && (
            <motion.p
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-xs text-purple-400 text-center"
            >
              AI estimate — adjust if needed
            </motion.p>
          )}

          {/* Macros Grid */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] text-muted-foreground uppercase mb-1">
                Calories
              </label>
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
              <label className="block text-[10px] text-muted-foreground uppercase mb-1">
                Protein (g)
              </label>
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
              <label className="block text-[10px] text-muted-foreground uppercase mb-1">
                Carbs (g)
              </label>
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
              <label className="block text-[10px] text-muted-foreground uppercase mb-1">
                Fat (g)
              </label>
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

          {/* Serving Size */}
          <input
            type="text"
            value={foodServing}
            onChange={(e) => setFoodServing(e.target.value)}
            placeholder="Serving size (optional)"
            className="w-full bg-background/50 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary min-h-[44px]"
          />

          {/* Save Button */}
          <Button
            onClick={handleSaveFood}
            loading={savingFood}
            disabled={!foodName.trim()}
          >
            Add Food
          </Button>
        </div>
      </Modal>
    </div>
  );
}

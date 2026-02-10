"use client";

import { useState, useEffect } from "react";
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Plus,
  Check,
  Sparkles,
  Info,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/components/auth-provider";
import { UserMenu } from "@/components/user-menu";
import { Popover } from "@/components/ui/popover";
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

function formatDate(date: Date): string {
  return date.toISOString().split("T")[0];
}

function formatDisplayDate(date: Date): string {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  if (formatDate(date) === formatDate(today)) return "Today";
  if (formatDate(date) === formatDate(yesterday)) return "Yesterday";
  if (formatDate(date) === formatDate(tomorrow)) return "Tomorrow";

  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export default function NutritionPage() {
  const { user } = useAuth();
  const supabase = createClient();
  const router = useRouter();

  const [selectedDate, setSelectedDate] = useState(new Date());
  const [meals, setMeals] = useState<Meal[]>([]);
  const [goals, setGoals] = useState<NutritionGoals>(DEFAULT_GOALS);
  const [loading, setLoading] = useState(true);
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());

  // Add food modal
  const [showAddFood, setShowAddFood] = useState(false);
  const [addFoodMealType, setAddFoodMealType] = useState<string>("breakfast");
  const [foodName, setFoodName] = useState("");
  const [foodCalories, setFoodCalories] = useState("");
  const [foodProtein, setFoodProtein] = useState("");
  const [foodCarbs, setFoodCarbs] = useState("");
  const [foodFat, setFoodFat] = useState("");
  const [foodServing, setFoodServing] = useState("");
  const [savingFood, setSavingFood] = useState(false);

  // Load data on mount and date change
  useEffect(() => {
    if (!user) return;
    loadData();
  }, [user, selectedDate]);

  const loadData = async () => {
    if (!user) return;
    setLoading(true);

    const dateStr = formatDate(selectedDate);

    // Load meals for the selected date
    const { data: mealsData } = await supabase
      .from("meals")
      .select("*")
      .eq("user_id", user.id)
      .eq("date", dateStr)
      .order("created_at", { ascending: true });

    setMeals((mealsData || []) as Meal[]);

    // Load nutrition goals
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

  // Navigate date
  const goToPreviousDay = () => {
    const prev = new Date(selectedDate);
    prev.setDate(prev.getDate() - 1);
    setSelectedDate(prev);
  };

  const goToNextDay = () => {
    const next = new Date(selectedDate);
    next.setDate(next.getDate() + 1);
    setSelectedDate(next);
  };

  // Calculate totals (only consumed meals count toward totals)
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

  // Toggle section collapse
  const toggleSection = (mealType: string) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(mealType)) {
        next.delete(mealType);
      } else {
        next.add(mealType);
      }
      return next;
    });
  };

  // Open add food modal
  const openAddFood = (mealType: string) => {
    setAddFoodMealType(mealType);
    setFoodName("");
    setFoodCalories("");
    setFoodProtein("");
    setFoodCarbs("");
    setFoodFat("");
    setFoodServing("");
    setShowAddFood(true);
  };

  // Save food
  const handleSaveFood = async () => {
    if (!user || !foodName.trim()) return;

    setSavingFood(true);

    const { error } = await supabase.from("meals").insert({
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

    if (error) {
      console.error("Failed to save food:", error);
      alert(`Failed to save: ${error.message}`);
      return;
    }

    setShowAddFood(false);
    loadData();
  };

  // Mark meal as consumed
  const markAsConsumed = async (mealId: string) => {
    const { error } = await supabase
      .from("meals")
      .update({ consumed: true })
      .eq("id", mealId);

    if (!error) {
      setMeals((prev) =>
        prev.map((m) => (m.id === mealId ? { ...m, consumed: true } : m))
      );
    }
  };

  // Delete meal
  const deleteMeal = async (mealId: string) => {
    const { error } = await supabase.from("meals").delete().eq("id", mealId);

    if (!error) {
      setMeals((prev) => prev.filter((m) => m.id !== mealId));
    }
  };

  // Calculate progress percentage
  const calorieProgress = Math.min((totals.calories / goals.calories) * 100, 100);

  // Loading state
  if (loading && meals.length === 0) {
    return (
      <div className="p-4 max-w-lg mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-black uppercase tracking-tighter">Nutrition</h1>
          <UserMenu />
        </div>
        <div className="flex items-center justify-center h-64">
          <div className="text-muted-foreground">Loading...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 max-w-lg mx-auto pb-32">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-black uppercase tracking-tighter">Nutrition</h1>
          <Popover trigger={<Info className="w-4 h-4 text-muted-foreground" />}>
            <div className="space-y-2">
              <p className="font-semibold text-white">Track Your Fuel.</p>
              <ul className="text-sm text-gray-400 space-y-1">
                <li>• <span className="text-gray-300">Log meals:</span> Track what you eat each day.</li>
                <li>• <span className="text-gray-300">AI plans:</span> Ask Coach to generate meal plans.</li>
                <li>• <span className="text-gray-300">Mark eaten:</span> Tap the check when you eat a planned meal.</li>
              </ul>
            </div>
          </Popover>
        </div>
        <UserMenu />
      </div>

      {/* Date Navigator */}
      <div className="flex items-center justify-between mb-6">
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={goToPreviousDay}
          className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ background: "rgba(26, 26, 36, 0.6)" }}
        >
          <ChevronLeft className="w-5 h-5" />
        </motion.button>

        <h2 className="text-lg font-bold">{formatDisplayDate(selectedDate)}</h2>

        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={goToNextDay}
          className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ background: "rgba(26, 26, 36, 0.6)" }}
        >
          <ChevronRight className="w-5 h-5" />
        </motion.button>
      </div>

      {/* Daily Totals Card */}
      <div
        className="rounded-2xl p-4 mb-6"
        style={{
          background: "rgba(26, 26, 36, 0.6)",
          border: "1px solid rgba(255, 255, 255, 0.05)",
        }}
      >
        {/* Calorie Progress */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold text-muted-foreground">Calories</span>
            <span className="text-sm font-bold">
              {totals.calories.toLocaleString()} / {goals.calories.toLocaleString()}
            </span>
          </div>
          <div className="h-3 rounded-full bg-background overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${calorieProgress}%` }}
              transition={{ duration: 0.5, ease: "easeOut" }}
              className="h-full rounded-full bg-primary"
            />
          </div>
        </div>

        {/* Macro Row */}
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center">
            <div className="text-xs text-muted-foreground mb-1">Protein</div>
            <div className="text-sm font-bold">
              <span className="text-green-400">{totals.protein}</span>
              <span className="text-muted-foreground">/{goals.protein}g</span>
            </div>
          </div>
          <div className="text-center">
            <div className="text-xs text-muted-foreground mb-1">Carbs</div>
            <div className="text-sm font-bold">
              <span className="text-blue-400">{totals.carbs}</span>
              <span className="text-muted-foreground">/{goals.carbs}g</span>
            </div>
          </div>
          <div className="text-center">
            <div className="text-xs text-muted-foreground mb-1">Fat</div>
            <div className="text-sm font-bold">
              <span className="text-yellow-400">{totals.fat}</span>
              <span className="text-muted-foreground">/{goals.fat}g</span>
            </div>
          </div>
        </div>
      </div>

      {/* Meal Sections */}
      <div className="space-y-4">
        {MEAL_TYPES.map((mealType) => {
          const mealItems = meals.filter((m) => m.meal_type === mealType);
          const isCollapsed = collapsedSections.has(mealType);
          const sectionCalories = mealItems
            .filter((m) => m.consumed)
            .reduce((acc, m) => acc + m.calories, 0);

          return (
            <div
              key={mealType}
              className="rounded-2xl overflow-hidden"
              style={{
                background: "rgba(26, 26, 36, 0.6)",
                border: "1px solid rgba(255, 255, 255, 0.05)",
              }}
            >
              {/* Section Header */}
              <button
                onClick={() => toggleSection(mealType)}
                className="w-full flex items-center justify-between p-4"
              >
                <div className="flex items-center gap-3">
                  <h3 className="font-semibold">{MEAL_LABELS[mealType]}</h3>
                  {mealItems.length > 0 && (
                    <span className="text-xs text-muted-foreground">
                      {mealItems.length} item{mealItems.length !== 1 ? "s" : ""}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {sectionCalories > 0 && (
                    <span className="text-sm text-muted-foreground">
                      {sectionCalories} cal
                    </span>
                  )}
                  <ChevronDown
                    className={`w-4 h-4 text-muted-foreground transition-transform ${
                      isCollapsed ? "-rotate-90" : ""
                    }`}
                  />
                </div>
              </button>

              {/* Section Content */}
              <AnimatePresence>
                {!isCollapsed && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <div className="px-4 pb-4 space-y-2">
                      {/* Meal Items */}
                      {mealItems.map((meal) => (
                        <div
                          key={meal.id}
                          className={`rounded-xl p-3 flex items-center justify-between ${
                            meal.ai_generated && !meal.consumed
                              ? "border border-dashed border-purple-500/30 bg-purple-500/5"
                              : "bg-background/50"
                          }`}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="font-medium text-sm truncate">
                                {meal.food_name}
                              </p>
                              {meal.ai_generated && !meal.consumed && (
                                <span className="text-[10px] uppercase font-bold text-purple-400 bg-purple-500/20 px-1.5 py-0.5 rounded">
                                  Planned
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {meal.calories} cal • {meal.protein}g P
                              {meal.serving_size && ` • ${meal.serving_size}`}
                            </p>
                          </div>

                          {/* Actions */}
                          <div className="flex items-center gap-2 ml-2">
                            {meal.ai_generated && !meal.consumed ? (
                              <motion.button
                                whileTap={{ scale: 0.9 }}
                                onClick={() => markAsConsumed(meal.id)}
                                className="w-9 h-9 rounded-lg flex items-center justify-center bg-green-500/20 text-green-400"
                              >
                                <Check className="w-4 h-4" />
                              </motion.button>
                            ) : null}
                            <motion.button
                              whileTap={{ scale: 0.9 }}
                              onClick={() => deleteMeal(meal.id)}
                              className="w-9 h-9 rounded-lg flex items-center justify-center text-muted-foreground hover:text-red-400 hover:bg-red-500/10"
                            >
                              <span className="text-lg">×</span>
                            </motion.button>
                          </div>
                        </div>
                      ))}

                      {/* Empty state */}
                      {mealItems.length === 0 && (
                        <p className="text-sm text-muted-foreground text-center py-2">
                          No foods logged
                        </p>
                      )}

                      {/* Add Food Button */}
                      <motion.button
                        whileTap={{ scale: 0.98 }}
                        onClick={() => openAddFood(mealType)}
                        className="w-full py-2.5 text-xs font-semibold text-primary uppercase tracking-wide hover:bg-primary/5 transition-colors rounded-xl border border-dashed border-primary/30"
                      >
                        + Add Food
                      </motion.button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>

      {/* Ask Coach Floating Button */}
      <motion.button
        whileTap={{ scale: 0.95 }}
        onClick={() => router.push("/coach")}
        className="fixed bottom-32 right-4 z-40 flex items-center gap-2 px-4 py-3 rounded-full shadow-lg"
        style={{
          background: "linear-gradient(135deg, #ff4757 0%, #ff6b81 100%)",
          boxShadow: "0 4px 20px rgba(255, 71, 87, 0.4)",
        }}
      >
        <Sparkles className="w-5 h-5 text-white" />
        <span className="text-sm font-semibold text-white">Ask Coach</span>
      </motion.button>

      {/* Add Food Modal */}
      <Modal
        open={showAddFood}
        onClose={() => setShowAddFood(false)}
        title={`Add to ${MEAL_LABELS[addFoodMealType]}`}
      >
        <div className="space-y-4">
          {/* Food Name */}
          <div>
            <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Food Name *
            </label>
            <input
              type="text"
              value={foodName}
              onChange={(e) => setFoodName(e.target.value)}
              placeholder="e.g., Chicken Breast"
              className="w-full bg-background/50 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary min-h-[44px]"
              autoFocus
            />
          </div>

          {/* Macros Grid */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
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
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
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
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
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
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
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
          <div>
            <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Serving Size (optional)
            </label>
            <input
              type="text"
              value={foodServing}
              onChange={(e) => setFoodServing(e.target.value)}
              placeholder="e.g., 1 cup, 200g"
              className="w-full bg-background/50 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary min-h-[44px]"
            />
          </div>

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

"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/components/auth-provider";
import { createClient } from "@/lib/supabase/client";
import { AlertTriangle, RefreshCw, Trash2, Play, Eye, EyeOff } from "lucide-react";

// Only allow in development
const IS_DEV = process.env.NODE_ENV === "development";

interface Profile {
  id: string;
  email?: string;
  height_inches?: number;
  weight_lbs?: number;
  goal?: string;
  coaching_mode?: string;
  onboarding_complete?: boolean;
  app_tour_shown?: boolean;
  created_at?: string;
}

interface Memory {
  key: string;
  value: string;
}

export default function DebugPage() {
  const { user } = useAuth();
  const supabase = createClient();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [showRawData, setShowRawData] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [dateOverride, setDateOverride] = useState("");
  const [lastWorkoutOverride, setLastWorkoutOverride] = useState("");

  // Load profile and memories
  const loadData = async () => {
    if (!user) return;
    setLoading(true);

    const [profileRes, memoriesRes] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", user.id).single(),
      supabase.from("coach_memory").select("key, value").eq("user_id", user.id),
    ]);

    if (profileRes.data) setProfile(profileRes.data);
    if (memoriesRes.data) setMemories(memoriesRes.data);
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, [user]);

  const showMessage = (msg: string) => {
    setMessage(msg);
    setTimeout(() => setMessage(""), 3000);
  };

  // Reset flags
  const resetOnboarding = async () => {
    if (!user) return;
    await supabase.from("profiles").update({
      onboarding_complete: false,
      app_tour_shown: false,
      coaching_mode: null,
      goal: null,
      height_inches: null,
      weight_lbs: null,
    }).eq("id", user.id);
    await supabase.from("coach_memory").delete().eq("user_id", user.id);
    showMessage("Onboarding reset");
    loadData();
  };

  const resetAppTour = async () => {
    if (!user) return;
    await supabase.from("profiles").update({ app_tour_shown: false }).eq("id", user.id);
    showMessage("App tour reset");
    loadData();
  };

  const resetOnboardingOnly = async () => {
    if (!user) return;
    await supabase.from("profiles").update({ onboarding_complete: false }).eq("id", user.id);
    showMessage("Onboarding flag reset (data kept)");
    loadData();
  };

  const markOnboardingComplete = async () => {
    if (!user) return;
    await supabase.from("profiles").update({
      onboarding_complete: true,
      app_tour_shown: true, // Also mark tour as shown so we skip that too
    }).eq("id", user.id);
    showMessage("Onboarding marked complete!");
    loadData();
  };

  // Clear chat history
  const clearChatHistory = () => {
    if (!user) return;
    const keys = Object.keys(localStorage).filter(k => k.startsWith("netgains-coach-"));
    keys.forEach(k => localStorage.removeItem(k));
    showMessage(`Cleared ${keys.length} chat storage keys`);
  };

  // Trigger AI opening
  const triggerAIOpening = async () => {
    if (!user) return;
    // Clear the last open date to force regeneration
    localStorage.removeItem(`netgains-coach-last-open-${user.id}`);
    localStorage.removeItem(`netgains-coach-messages-${user.id}`);
    showMessage("Chat cleared, opening will regenerate on Coach tab");
  };

  // State for test response
  const [testResponse, setTestResponse] = useState("");
  const [testLoading, setTestLoading] = useState(false);

  // Direct test of daily summary API
  const testDailySummary = async () => {
    if (!user) return;
    setTestLoading(true);
    setTestResponse("Loading...");

    // Get the effective date (debug override or today)
    const debugOverride = localStorage.getItem("netgains-debug-date-override");
    const effectiveDate = debugOverride || new Date().toISOString().split('T')[0];

    const triggerMessage = `[SYSTEM_TRIGGER] effectiveDate=${effectiveDate} User opened coach tab. Generate greeting.`;

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "user", content: triggerMessage }],
        }),
      });

      if (!response.ok) {
        setTestResponse(`Error: HTTP ${response.status}`);
        setTestLoading(false);
        return;
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let fullText = "";

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value);
          const lines = chunk.split("\n");
          for (const line of lines) {
            if (line.startsWith("0:")) {
              try {
                const text = JSON.parse(line.slice(2));
                fullText += text;
              } catch {
                // Skip
              }
            }
          }
        }
      }

      setTestResponse(fullText || "(empty response)");
    } catch (error) {
      setTestResponse(`Error: ${error}`);
    }

    setTestLoading(false);
  };

  // Set date override (stored in localStorage)
  const setDateOverrideValue = () => {
    if (dateOverride) {
      localStorage.setItem("netgains-debug-date-override", dateOverride);
      showMessage(`Date override set to ${dateOverride}`);
    }
  };

  const clearDateOverride = () => {
    localStorage.removeItem("netgains-debug-date-override");
    setDateOverride("");
    showMessage("Date override cleared");
  };

  // Set last workout override - creates a complete workout with exercises and sets
  const setLastWorkoutOverrideValue = async () => {
    if (!user || !lastWorkoutOverride) return;

    // Create workout entry
    const { data: workout, error: workoutError } = await supabase
      .from("workouts")
      .insert({
        user_id: user.id,
        date: lastWorkoutOverride,
        notes: "[DEBUG] Test workout with exercises",
      })
      .select()
      .single();

    if (workoutError || !workout) {
      showMessage(`Error creating workout: ${workoutError?.message}`);
      return;
    }

    // Create sample exercises
    const exerciseData = [
      { workout_id: workout.id, name: "Bench Press", order_index: 0 },
      { workout_id: workout.id, name: "Incline Dumbbell Press", order_index: 1 },
      { workout_id: workout.id, name: "Cable Flyes", order_index: 2 },
    ];

    const { data: exercises, error: exerciseError } = await supabase
      .from("exercises")
      .insert(exerciseData)
      .select();

    if (exerciseError || !exercises) {
      showMessage(`Error creating exercises: ${exerciseError?.message}`);
      return;
    }

    // Create sample sets for each exercise
    const setData = [
      // Bench Press - 3 sets
      { exercise_id: exercises[0].id, weight: 225, reps: 5, order_index: 0 },
      { exercise_id: exercises[0].id, weight: 225, reps: 5, order_index: 1 },
      { exercise_id: exercises[0].id, weight: 235, reps: 3, order_index: 2 },
      // Incline DB Press - 3 sets
      { exercise_id: exercises[1].id, weight: 70, reps: 10, order_index: 0 },
      { exercise_id: exercises[1].id, weight: 70, reps: 10, order_index: 1 },
      { exercise_id: exercises[1].id, weight: 75, reps: 8, order_index: 2 },
      // Cable Flyes - 2 sets
      { exercise_id: exercises[2].id, weight: 30, reps: 12, order_index: 0 },
      { exercise_id: exercises[2].id, weight: 30, reps: 12, order_index: 1 },
    ];

    const { error: setError } = await supabase.from("sets").insert(setData);

    if (setError) {
      showMessage(`Error creating sets: ${setError.message}`);
      return;
    }

    showMessage(`Created workout on ${lastWorkoutOverride} with 3 exercises and 8 sets`);
  };

  // Create fake nutrition data for a date
  const [nutritionOverrideDate, setNutritionOverrideDate] = useState("");

  const createFakeNutrition = async () => {
    if (!user || !nutritionOverrideDate) return;

    const meals = [
      { meal_type: "breakfast", food_name: "Eggs and Toast", calories: 450, protein: 28, carbs: 35, fat: 22 },
      { meal_type: "lunch", food_name: "Chicken and Rice", calories: 650, protein: 45, carbs: 60, fat: 18 },
      { meal_type: "dinner", food_name: "Salmon with Vegetables", calories: 550, protein: 42, carbs: 25, fat: 28 },
      { meal_type: "snack", food_name: "Protein Shake", calories: 280, protein: 40, carbs: 15, fat: 5 },
    ];

    const mealData = meals.map((meal) => ({
      user_id: user.id,
      date: nutritionOverrideDate,
      ...meal,
      consumed: true,
      ai_generated: false,
    }));

    const { error } = await supabase.from("meals").insert(mealData);

    if (error) {
      showMessage(`Error creating meals: ${error.message}`);
    } else {
      const totalCal = meals.reduce((sum, m) => sum + m.calories, 0);
      const totalPro = meals.reduce((sum, m) => sum + m.protein, 0);
      showMessage(`Created ${meals.length} meals for ${nutritionOverrideDate} (${totalCal} cal, ${totalPro}g protein)`);
    }
  };

  // Delete all workouts
  const clearAllWorkouts = async () => {
    if (!user) return;
    if (!confirm("Delete ALL workouts? This cannot be undone.")) return;

    // Get workout IDs
    const { data: workouts } = await supabase
      .from("workouts")
      .select("id")
      .eq("user_id", user.id);

    if (workouts && workouts.length > 0) {
      const workoutIds = workouts.map(w => w.id);

      // Get exercise IDs
      const { data: exercises } = await supabase
        .from("exercises")
        .select("id")
        .in("workout_id", workoutIds);

      if (exercises && exercises.length > 0) {
        const exerciseIds = exercises.map(e => e.id);
        await supabase.from("sets").delete().in("exercise_id", exerciseIds);
        await supabase.from("exercises").delete().in("workout_id", workoutIds);
      }

      await supabase.from("workouts").delete().eq("user_id", user.id);
      showMessage(`Deleted ${workouts.length} workouts`);
    } else {
      showMessage("No workouts to delete");
    }
  };

  // Create test account
  const createTestAccount = async () => {
    const timestamp = Date.now();
    const email = `test${timestamp}@test.local`;
    const password = "test123456";

    const { error } = await supabase.auth.signUp({
      email,
      password,
    });

    if (error) {
      showMessage(`Error: ${error.message}`);
    } else {
      showMessage(`Created: ${email} / ${password}`);
    }
  };

  if (!IS_DEV) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center">
          <AlertTriangle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-red-500">Debug Panel Disabled</h1>
          <p className="text-muted-foreground mt-2">Only available in development mode</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 pb-32" style={{ background: "#0f0f13" }}>
      {/* DEV MODE Banner */}
      <div className="fixed top-0 left-0 right-0 bg-red-600 text-white text-center py-1 text-sm font-bold z-50">
        ⚠️ DEV MODE - DEBUG PANEL ⚠️
      </div>

      <div className="mt-10 max-w-lg mx-auto space-y-6">
        {/* Header */}
        <div className="border-2 border-red-500 rounded-xl p-4 bg-red-500/10">
          <h1 className="text-xl font-bold text-red-400 flex items-center gap-2">
            <AlertTriangle className="w-6 h-6" />
            Debug Panel
          </h1>
          <p className="text-sm text-red-300 mt-1">Development testing tools</p>
        </div>

        {/* Status Message */}
        {message && (
          <div className="bg-green-500/20 border border-green-500 rounded-xl p-3 text-green-400 text-sm">
            {message}
          </div>
        )}

        {/* Current User */}
        <Section title="Current User">
          <p className="text-sm text-muted-foreground mb-2">{user?.email || "Not logged in"}</p>
          <p className="text-xs text-muted-foreground">ID: {user?.id || "N/A"}</p>
          <button
            onClick={createTestAccount}
            className="mt-3 w-full bg-blue-600 text-white rounded-lg py-2 text-sm font-medium"
          >
            Create New Test Account
          </button>
        </Section>

        {/* Reset Flags */}
        <Section title="Reset Flags">
          <div className="space-y-2">
            <DebugButton onClick={resetOnboarding} variant="danger">
              <Trash2 className="w-4 h-4" /> Full Reset (onboarding + data + memories)
            </DebugButton>
            <DebugButton onClick={resetOnboardingOnly} variant="warning">
              <RefreshCw className="w-4 h-4" /> Reset onboarding_complete flag only
            </DebugButton>
            <DebugButton onClick={markOnboardingComplete} variant="default">
              <Play className="w-4 h-4" /> Mark onboarding COMPLETE (skip setup)
            </DebugButton>
            <DebugButton onClick={resetAppTour} variant="warning">
              <RefreshCw className="w-4 h-4" /> Reset app_tour_shown flag
            </DebugButton>
          </div>
        </Section>

        {/* Chat Controls */}
        <Section title="AI Coach">
          <div className="space-y-2">
            <DebugButton onClick={clearChatHistory} variant="danger">
              <Trash2 className="w-4 h-4" /> Clear all chat history
            </DebugButton>
            <DebugButton onClick={triggerAIOpening} variant="default">
              <Play className="w-4 h-4" /> Trigger new opening message
            </DebugButton>
            <DebugButton onClick={testDailySummary} variant="default">
              <Play className="w-4 h-4" /> {testLoading ? "Testing..." : "Test Daily Summary API"}
            </DebugButton>
            {testResponse && (
              <div className="mt-2 p-3 bg-black/50 rounded-lg text-xs whitespace-pre-wrap max-h-48 overflow-y-auto">
                <p className="text-muted-foreground mb-1">API Response:</p>
                <p className="text-white">{testResponse}</p>
              </div>
            )}
          </div>
        </Section>

        {/* Date Override */}
        <Section title="Date/Time Override">
          <p className="text-xs text-muted-foreground mb-2">
            Note: Requires app code to check localStorage for override
          </p>
          <div className="flex gap-2">
            <input
              type="date"
              value={dateOverride}
              onChange={(e) => setDateOverride(e.target.value)}
              className="flex-1 bg-white/10 rounded-lg px-3 py-2 text-sm"
            />
            <button
              onClick={setDateOverrideValue}
              className="bg-blue-600 text-white rounded-lg px-4 py-2 text-sm"
            >
              Set
            </button>
          </div>
          <button
            onClick={clearDateOverride}
            className="mt-2 text-sm text-red-400 underline"
          >
            Clear override
          </button>
        </Section>

        {/* Last Workout Override */}
        <Section title="Create Test Workout">
          <p className="text-xs text-muted-foreground mb-2">
            Creates a workout with Bench Press, Incline DB, Cable Flyes + sets
          </p>
          <div className="flex gap-2">
            <input
              type="date"
              value={lastWorkoutOverride}
              onChange={(e) => setLastWorkoutOverride(e.target.value)}
              className="flex-1 bg-white/10 rounded-lg px-3 py-2 text-sm"
            />
            <button
              onClick={setLastWorkoutOverrideValue}
              className="bg-blue-600 text-white rounded-lg px-4 py-2 text-sm"
            >
              Create
            </button>
          </div>
          <DebugButton onClick={clearAllWorkouts} variant="danger" className="mt-2">
            <Trash2 className="w-4 h-4" /> Delete ALL workouts
          </DebugButton>
        </Section>

        {/* Nutrition Override */}
        <Section title="Create Test Nutrition">
          <p className="text-xs text-muted-foreground mb-2">
            Creates 4 meals: ~1,930 cal, 155g protein
          </p>
          <div className="flex gap-2">
            <input
              type="date"
              value={nutritionOverrideDate}
              onChange={(e) => setNutritionOverrideDate(e.target.value)}
              className="flex-1 bg-white/10 rounded-lg px-3 py-2 text-sm"
            />
            <button
              onClick={createFakeNutrition}
              className="bg-green-600 text-white rounded-lg px-4 py-2 text-sm"
            >
              Create
            </button>
          </div>
        </Section>

        {/* Raw Profile Data */}
        <Section title="Raw Profile Data">
          <DebugButton onClick={() => setShowRawData(!showRawData)} variant="default">
            {showRawData ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            {showRawData ? "Hide" : "Show"} raw data
          </DebugButton>
          <DebugButton onClick={loadData} variant="default" className="mt-2">
            <RefreshCw className="w-4 h-4" /> Refresh data
          </DebugButton>

          {showRawData && (
            <div className="mt-4 space-y-4">
              <div>
                <h4 className="text-sm font-medium text-muted-foreground mb-2">Profile:</h4>
                <pre className="bg-black/50 rounded-lg p-3 text-xs overflow-x-auto">
                  {JSON.stringify(profile, null, 2)}
                </pre>
              </div>
              <div>
                <h4 className="text-sm font-medium text-muted-foreground mb-2">Memories:</h4>
                <pre className="bg-black/50 rounded-lg p-3 text-xs overflow-x-auto">
                  {JSON.stringify(memories, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </Section>

        {/* Quick Links */}
        <Section title="Quick Links">
          <div className="grid grid-cols-2 gap-2">
            <a href="/coach" className="bg-white/10 rounded-lg py-3 text-center text-sm">Coach</a>
            <a href="/log" className="bg-white/10 rounded-lg py-3 text-center text-sm">Log</a>
            <a href="/nutrition" className="bg-white/10 rounded-lg py-3 text-center text-sm">Nutrition</a>
            <a href="/stats" className="bg-white/10 rounded-lg py-3 text-center text-sm">Stats</a>
          </div>
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border border-red-500/30 rounded-xl p-4 bg-red-500/5">
      <h2 className="text-sm font-bold text-red-400 mb-3 uppercase tracking-wide">{title}</h2>
      {children}
    </div>
  );
}

function DebugButton({
  onClick,
  children,
  variant = "default",
  className = "",
}: {
  onClick: () => void;
  children: React.ReactNode;
  variant?: "default" | "warning" | "danger";
  className?: string;
}) {
  const variants = {
    default: "bg-white/10 text-white hover:bg-white/20",
    warning: "bg-yellow-600/20 text-yellow-400 hover:bg-yellow-600/30 border border-yellow-600/50",
    danger: "bg-red-600/20 text-red-400 hover:bg-red-600/30 border border-red-600/50",
  };

  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium transition-colors ${variants[variant]} ${className}`}
    >
      {children}
    </button>
  );
}

"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, ArrowRight, Check } from "lucide-react";

interface NutritionOnboardingProps {
  onComplete: (goals: { calories: number; protein: number; carbs: number; fat: number }) => void;
}

type Step = 0 | 1 | 2 | 3 | 4; // 0=Q1, 1=Q1b (calorie input), 2=Q2, 3=Q3, 4=results

interface Answers {
  calorieAwareness: "knows" | "fresh" | null;
  statedCalories: number | null;
  trackingStyle: "scale_app" | "eyeballing" | "no_tracking" | null;
  restrictions: string;
}

export function NutritionOnboarding({ onComplete }: NutritionOnboardingProps) {
  const [step, setStep] = useState<Step>(0);
  const [answers, setAnswers] = useState<Answers>({
    calorieAwareness: null,
    statedCalories: null,
    trackingStyle: null,
    restrictions: "",
  });
  const [calorieInput, setCalorieInput] = useState("");
  const [restrictionsInput, setRestrictionsInput] = useState("");
  const [isCalculating, setIsCalculating] = useState(false);
  const [calculatedGoals, setCalculatedGoals] = useState<{
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    suggestedCalories: number;
    message: string;
  } | null>(null);
  const [useUserCalories, setUseUserCalories] = useState<boolean | null>(null);

  const handleCalorieAwareness = (value: "knows" | "fresh") => {
    setAnswers((prev) => ({ ...prev, calorieAwareness: value }));
    if (value === "knows") {
      setStep(1); // Go to calorie input
    } else {
      setStep(2); // Skip to tracking style
    }
  };

  const handleCalorieSubmit = () => {
    const calories = parseInt(calorieInput);
    if (calories && calories > 0) {
      setAnswers((prev) => ({ ...prev, statedCalories: calories }));
      setStep(2);
    }
  };

  const handleTrackingStyle = (value: "scale_app" | "eyeballing" | "no_tracking") => {
    setAnswers((prev) => ({ ...prev, trackingStyle: value }));
    setStep(3);
  };

  const handleRestrictionsSubmit = async () => {
    const finalAnswers = {
      ...answers,
      restrictions: restrictionsInput.trim(),
    };
    setAnswers(finalAnswers);
    setIsCalculating(true);

    try {
      const response = await fetch("/api/nutrition-onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          calorieAwareness: finalAnswers.calorieAwareness,
          statedCalories: finalAnswers.statedCalories,
          trackingStyle: finalAnswers.trackingStyle,
          restrictions: finalAnswers.restrictions,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to calculate goals");
      }

      const data = await response.json();
      setCalculatedGoals(data);
      setStep(4);

      // If user provided calories and they differ from suggested, let them choose
      if (finalAnswers.statedCalories && finalAnswers.statedCalories !== data.suggestedCalories) {
        setUseUserCalories(null); // Will show choice buttons
      } else {
        setUseUserCalories(false); // Use suggested
      }
    } catch (error) {
      console.error("Nutrition onboarding error:", error);
      // Fallback to defaults
      setCalculatedGoals({
        calories: 2000,
        protein: 150,
        carbs: 200,
        fat: 65,
        suggestedCalories: 2000,
        message: "Here are some starting targets. You can adjust them anytime.",
      });
      setStep(4);
    }

    setIsCalculating(false);
  };

  const handleSaveGoals = async () => {
    if (!calculatedGoals) return;

    const finalCalories =
      useUserCalories && answers.statedCalories
        ? answers.statedCalories
        : calculatedGoals.suggestedCalories;

    // Recalculate macros if using user's calories
    let finalGoals = { ...calculatedGoals.goals };
    if (useUserCalories && answers.statedCalories) {
      const protein = calculatedGoals.goals.protein; // Keep protein the same
      const fat = Math.round((answers.statedCalories * 0.25) / 9);
      const carbs = Math.round((answers.statedCalories - protein * 4 - fat * 9) / 4);
      finalGoals = {
        calories: answers.statedCalories,
        protein,
        carbs,
        fat,
      };
    }

    // Save to database via API
    try {
      await fetch("/api/nutrition-onboarding/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goals: finalGoals }),
      });
    } catch (error) {
      console.error("Failed to save goals:", error);
    }

    onComplete(finalGoals);
  };

  const CoachBubble = ({ children }: { children: React.ReactNode }) => (
    <div className="flex gap-3">
      <div
        className="w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center"
        style={{ background: "rgba(255, 71, 87, 0.15)" }}
      >
        <Sparkles className="w-5 h-5 text-primary" />
      </div>
      <div
        className="flex-1 rounded-2xl px-4 py-3"
        style={{ background: "#1a1a24" }}
      >
        {children}
      </div>
    </div>
  );

  const QuickReplyButton = ({
    children,
    onClick,
    selected,
  }: {
    children: React.ReactNode;
    onClick: () => void;
    selected?: boolean;
  }) => (
    <motion.button
      whileTap={{ scale: 0.95 }}
      onClick={onClick}
      className={`px-4 py-2 rounded-full text-sm font-medium transition-colors min-h-[44px] ${
        selected
          ? "bg-primary text-primary-foreground"
          : "bg-white/10 text-white hover:bg-white/20"
      }`}
    >
      {children}
    </motion.button>
  );

  return (
    <div className="p-4 space-y-4">
      <AnimatePresence mode="wait">
        {/* Question 1: Calorie awareness */}
        {step === 0 && (
          <motion.div
            key="q1"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-4"
          >
            <CoachBubble>
              <p className="text-sm text-white">
                First time tracking food with me. Do you know roughly how many
                calories you eat per day, or are we starting fresh?
              </p>
            </CoachBubble>
            <div className="flex gap-2 pl-13 ml-[52px]">
              <QuickReplyButton onClick={() => handleCalorieAwareness("knows")}>
                I know my calories
              </QuickReplyButton>
              <QuickReplyButton onClick={() => handleCalorieAwareness("fresh")}>
                Starting fresh
              </QuickReplyButton>
            </div>
          </motion.div>
        )}

        {/* Question 1b: Calorie input */}
        {step === 1 && (
          <motion.div
            key="q1b"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-4"
          >
            <CoachBubble>
              <p className="text-sm text-white">
                Nice! About how many calories do you usually eat?
              </p>
            </CoachBubble>
            <div className="flex gap-2 ml-[52px]">
              <input
                type="number"
                value={calorieInput}
                onChange={(e) => setCalorieInput(e.target.value)}
                placeholder="e.g., 2000"
                className="flex-1 px-4 py-3 rounded-xl text-sm bg-[#1a1a24] text-white focus:outline-none focus:ring-2 focus:ring-primary min-h-[44px]"
              />
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={handleCalorieSubmit}
                disabled={!calorieInput}
                className="px-4 py-3 rounded-xl bg-primary text-primary-foreground disabled:opacity-50 min-h-[44px]"
              >
                <ArrowRight className="w-5 h-5" />
              </motion.button>
            </div>
          </motion.div>
        )}

        {/* Question 2: Tracking style */}
        {step === 2 && (
          <motion.div
            key="q2"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-4"
          >
            <CoachBubble>
              <p className="text-sm text-white">
                How do you usually track food?
              </p>
            </CoachBubble>
            <div className="flex flex-wrap gap-2 ml-[52px]">
              <QuickReplyButton onClick={() => handleTrackingStyle("scale_app")}>
                Scale & app
              </QuickReplyButton>
              <QuickReplyButton onClick={() => handleTrackingStyle("eyeballing")}>
                Eyeballing it
              </QuickReplyButton>
              <QuickReplyButton onClick={() => handleTrackingStyle("no_tracking")}>
                Don&apos;t really track
              </QuickReplyButton>
            </div>
          </motion.div>
        )}

        {/* Question 3: Restrictions */}
        {step === 3 && (
          <motion.div
            key="q3"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-4"
          >
            <CoachBubble>
              <p className="text-sm text-white">
                Any foods you avoid? Allergies, restrictions, or stuff you just
                hate?
              </p>
            </CoachBubble>
            <div className="flex gap-2 ml-[52px]">
              <input
                type="text"
                value={restrictionsInput}
                onChange={(e) => setRestrictionsInput(e.target.value)}
                placeholder="e.g., dairy-free, no shellfish, hate cilantro"
                className="flex-1 px-4 py-3 rounded-xl text-sm bg-[#1a1a24] text-white focus:outline-none focus:ring-2 focus:ring-primary min-h-[44px]"
              />
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={handleRestrictionsSubmit}
                disabled={isCalculating}
                className="px-4 py-3 rounded-xl bg-primary text-primary-foreground disabled:opacity-50 min-h-[44px]"
              >
                {isCalculating ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <ArrowRight className="w-5 h-5" />
                )}
              </motion.button>
            </div>
            <p className="text-xs text-muted-foreground ml-[52px]">
              Leave blank if none
            </p>
          </motion.div>
        )}

        {/* Results */}
        {step === 4 && calculatedGoals && (
          <motion.div
            key="results"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-4"
          >
            <CoachBubble>
              <p className="text-sm text-white mb-4">{calculatedGoals.message}</p>

              {/* Show choice if user provided calories */}
              {answers.statedCalories &&
                answers.statedCalories !== calculatedGoals.suggestedCalories &&
                useUserCalories === null && (
                  <div className="mb-4 p-3 rounded-xl bg-white/5">
                    <p className="text-xs text-muted-foreground mb-2">
                      You mentioned {answers.statedCalories} cal. I&apos;d suggest{" "}
                      {calculatedGoals.suggestedCalories} based on your goal.
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setUseUserCalories(true)}
                        className="flex-1 px-3 py-2 rounded-lg text-xs bg-white/10 hover:bg-white/20"
                      >
                        Use {answers.statedCalories}
                      </button>
                      <button
                        onClick={() => setUseUserCalories(false)}
                        className="flex-1 px-3 py-2 rounded-lg text-xs bg-primary/20 hover:bg-primary/30 text-primary"
                      >
                        Use {calculatedGoals.suggestedCalories}
                      </button>
                    </div>
                  </div>
                )}

              {/* Macro display */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-xl bg-white/5">
                  <p className="text-xs text-muted-foreground">Calories</p>
                  <p className="text-lg font-bold text-white">
                    {useUserCalories && answers.statedCalories
                      ? answers.statedCalories.toLocaleString()
                      : calculatedGoals.suggestedCalories.toLocaleString()}
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-white/5">
                  <p className="text-xs text-muted-foreground">Protein</p>
                  <p className="text-lg font-bold text-white">
                    {calculatedGoals.goals.protein}g
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-white/5">
                  <p className="text-xs text-muted-foreground">Carbs</p>
                  <p className="text-lg font-bold text-white">
                    {useUserCalories && answers.statedCalories
                      ? Math.round(
                          (answers.statedCalories -
                            calculatedGoals.goals.protein * 4 -
                            Math.round((answers.statedCalories * 0.25) / 9) * 9) /
                            4
                        )
                      : calculatedGoals.goals.carbs}
                    g
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-white/5">
                  <p className="text-xs text-muted-foreground">Fat</p>
                  <p className="text-lg font-bold text-white">
                    {useUserCalories && answers.statedCalories
                      ? Math.round((answers.statedCalories * 0.25) / 9)
                      : calculatedGoals.goals.fat}
                    g
                  </p>
                </div>
              </div>
            </CoachBubble>

            {/* Save button - only show after choice is made or if no choice needed */}
            {(useUserCalories !== null ||
              !answers.statedCalories ||
              answers.statedCalories === calculatedGoals.suggestedCalories) && (
              <div className="ml-[52px]">
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={handleSaveGoals}
                  className="w-full px-4 py-3 rounded-xl bg-primary text-primary-foreground font-medium flex items-center justify-center gap-2 min-h-[44px]"
                >
                  <Check className="w-5 h-5" />
                  Save & Start Tracking
                </motion.button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

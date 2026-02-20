"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, ArrowRight, Check, AlertTriangle } from "lucide-react";

// Define these outside the component to prevent re-creation on every render
function CoachBubble({ children }: { children: React.ReactNode }) {
  return (
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
}

function QuickReplyButton({
  children,
  onClick,
  selected,
}: {
  children: React.ReactNode;
  onClick: () => void;
  selected?: boolean;
}) {
  return (
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
}

interface NutritionOnboardingProps {
  onComplete: (goals: { calories: number; protein: number; carbs: number; fat: number }) => void;
}

// 0=Q1 (knows/fresh), 1=Q1b (macro inputs), 2=Q2 (tracking style), 3=Q3 (restrictions), 4=validation, 5=results
type Step = 0 | 1 | 2 | 3 | 4 | 5;

interface UserMacros {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

interface ValidationIssue {
  type: "protein_low" | "protein_high" | "macros_mismatch";
  message: string;
}

interface Answers {
  calorieAwareness: "knows" | "fresh" | null;
  userMacros: UserMacros | null;
  trackingStyle: "scale_app" | "eyeballing" | "no_tracking" | null;
  restrictions: string;
}

export function NutritionOnboarding({ onComplete }: NutritionOnboardingProps) {
  const [step, setStep] = useState<Step>(0);
  const [answers, setAnswers] = useState<Answers>({
    calorieAwareness: null,
    userMacros: null,
    trackingStyle: null,
    restrictions: "",
  });

  // Macro input fields
  const [calorieInput, setCalorieInput] = useState("");
  const [proteinInput, setProteinInput] = useState("");
  const [carbsInput, setCarbsInput] = useState("");
  const [fatInput, setFatInput] = useState("");

  const [restrictionsInput, setRestrictionsInput] = useState("");
  const [isCalculating, setIsCalculating] = useState(false);

  // Calculated goals from API
  const [calculatedGoals, setCalculatedGoals] = useState<{
    goals: {
      calories: number;
      protein: number;
      carbs: number;
      fat: number;
    };
    suggestedCalories: number;
    weightLbs: number;
    message: string;
  } | null>(null);

  // Validation
  const [validationIssue, setValidationIssue] = useState<ValidationIssue | null>(null);
  const [useUserNumbers, setUseUserNumbers] = useState<boolean | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const handleCalorieAwareness = (value: "knows" | "fresh") => {
    setAnswers((prev) => ({ ...prev, calorieAwareness: value }));
    if (value === "knows") {
      setStep(1); // Go to macro inputs
    } else {
      setStep(2); // Skip to tracking style
    }
  };

  const handleMacrosSubmit = () => {
    const calories = parseInt(calorieInput);
    const protein = parseInt(proteinInput);
    const carbs = parseInt(carbsInput);
    const fat = parseInt(fatInput);

    if (calories > 0 && protein >= 0 && carbs >= 0 && fat >= 0) {
      setAnswers((prev) => ({
        ...prev,
        userMacros: { calories, protein, carbs, fat },
      }));
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
          userMacros: finalAnswers.userMacros,
          trackingStyle: finalAnswers.trackingStyle,
          restrictions: finalAnswers.restrictions,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to calculate goals");
      }

      const data = await response.json();
      setCalculatedGoals(data);

      // If user provided their own numbers, validate them
      if (finalAnswers.userMacros) {
        const userMacros = finalAnswers.userMacros;
        const weightLbs = data.weightLbs || 170;

        // Check protein: should be between 0.7g and 1.5g per lb
        const minProtein = weightLbs * 0.7;
        const maxProtein = weightLbs * 1.5;

        if (userMacros.protein < minProtein) {
          setValidationIssue({
            type: "protein_low",
            message: `Heads up — your protein (${userMacros.protein}g) is a bit low for your weight. I'd suggest at least ${Math.round(minProtein)}g.`,
          });
          setStep(4); // Go to validation step
          setIsCalculating(false);
          return;
        }

        if (userMacros.protein > maxProtein) {
          setValidationIssue({
            type: "protein_high",
            message: `Heads up — your protein (${userMacros.protein}g) is quite high. ${Math.round(data.goals.protein)}g would be plenty for your weight.`,
          });
          setStep(4);
          setIsCalculating(false);
          return;
        }

        // Check if macros add up to stated calories (within 10% tolerance)
        const calculatedCals = userMacros.protein * 4 + userMacros.carbs * 4 + userMacros.fat * 9;
        const calorieDiff = Math.abs(calculatedCals - userMacros.calories);
        const tolerancePercent = calorieDiff / userMacros.calories;

        if (tolerancePercent > 0.1) {
          setValidationIssue({
            type: "macros_mismatch",
            message: `Your macros add up to ~${calculatedCals} cal, but you entered ${userMacros.calories}. Want me to adjust?`,
          });
          setStep(4);
          setIsCalculating(false);
          return;
        }

        // Numbers look good - go straight to results with user's numbers
        setUseUserNumbers(true);
        setStep(5);
      } else {
        // Fresh start - show calculated results
        setUseUserNumbers(false);
        setStep(5);
      }
    } catch (error) {
      console.error("Nutrition onboarding error:", error);
      setCalculatedGoals({
        goals: {
          calories: 2000,
          protein: 150,
          carbs: 200,
          fat: 65,
        },
        suggestedCalories: 2000,
        weightLbs: 170,
        message: "Here are some starting targets. You can adjust them anytime.",
      });
      setStep(5);
    }

    setIsCalculating(false);
  };

  const handleValidationChoice = (keepUserNumbers: boolean) => {
    setUseUserNumbers(keepUserNumbers);
    setStep(5);
  };

  const handleSaveGoals = async () => {
    let finalGoals: UserMacros;

    if (useUserNumbers && answers.userMacros) {
      finalGoals = answers.userMacros;
    } else if (calculatedGoals) {
      finalGoals = {
        calories: calculatedGoals.suggestedCalories,
        protein: calculatedGoals.goals.protein,
        carbs: calculatedGoals.goals.carbs,
        fat: calculatedGoals.goals.fat,
      };
    } else {
      return;
    }

    setIsSaving(true);
    setSaveError(null);

    try {
      const response = await fetch("/api/nutrition-onboarding/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goals: finalGoals }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to save goals');
      }

      onComplete(finalGoals);
    } catch (error) {
      console.error("Failed to save goals:", error);
      setSaveError(error instanceof Error ? error.message : 'Failed to save. Please try again.');
      setIsSaving(false);
    }
  };

  const currentGoals = useUserNumbers && answers.userMacros
    ? answers.userMacros
    : calculatedGoals
    ? {
        calories: calculatedGoals.suggestedCalories,
        protein: calculatedGoals.goals.protein,
        carbs: calculatedGoals.goals.carbs,
        fat: calculatedGoals.goals.fat,
      }
    : null;

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
                First time tracking food with me. Do you already have your macro
                targets, or should I calculate them for you?
              </p>
            </CoachBubble>
            <div className="flex gap-2 ml-[52px]">
              <QuickReplyButton onClick={() => handleCalorieAwareness("knows")}>
                I know my numbers
              </QuickReplyButton>
              <QuickReplyButton onClick={() => handleCalorieAwareness("fresh")}>
                Calculate for me
              </QuickReplyButton>
            </div>
          </motion.div>
        )}

        {/* Question 1b: Full macro inputs */}
        {step === 1 && (
          <motion.div
            key="q1b"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-4"
          >
            <CoachBubble>
              <p className="text-sm text-white mb-4">
                Enter your daily targets:
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground">Calories</label>
                  <input
                    type="number"
                    value={calorieInput}
                    onChange={(e) => setCalorieInput(e.target.value)}
                    placeholder="2000"
                    className="w-full mt-1 px-3 py-2 rounded-lg text-sm bg-white/10 text-white focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Protein (g)</label>
                  <input
                    type="number"
                    value={proteinInput}
                    onChange={(e) => setProteinInput(e.target.value)}
                    placeholder="150"
                    className="w-full mt-1 px-3 py-2 rounded-lg text-sm bg-white/10 text-white focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Carbs (g)</label>
                  <input
                    type="number"
                    value={carbsInput}
                    onChange={(e) => setCarbsInput(e.target.value)}
                    placeholder="200"
                    className="w-full mt-1 px-3 py-2 rounded-lg text-sm bg-white/10 text-white focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Fat (g)</label>
                  <input
                    type="number"
                    value={fatInput}
                    onChange={(e) => setFatInput(e.target.value)}
                    placeholder="65"
                    className="w-full mt-1 px-3 py-2 rounded-lg text-sm bg-white/10 text-white focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
              </div>
            </CoachBubble>
            <div className="ml-[52px]">
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={handleMacrosSubmit}
                disabled={!calorieInput || !proteinInput}
                className="w-full px-4 py-3 rounded-xl bg-primary text-primary-foreground disabled:opacity-50 min-h-[44px] font-medium flex items-center justify-center gap-2"
              >
                Continue
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

        {/* Validation step */}
        {step === 4 && validationIssue && calculatedGoals && (
          <motion.div
            key="validation"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-4"
          >
            <CoachBubble>
              <div className="flex items-start gap-2 mb-3">
                <AlertTriangle className="w-4 h-4 text-yellow-500 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-white">{validationIssue.message}</p>
              </div>
              <p className="text-xs text-muted-foreground mb-3">
                Want to use my suggestion or keep yours?
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => handleValidationChoice(true)}
                  className="flex-1 px-3 py-2 rounded-lg text-sm bg-white/10 hover:bg-white/20"
                >
                  Keep mine
                </button>
                <button
                  onClick={() => handleValidationChoice(false)}
                  className="flex-1 px-3 py-2 rounded-lg text-sm bg-primary/20 hover:bg-primary/30 text-primary"
                >
                  Use suggested
                </button>
              </div>
            </CoachBubble>
          </motion.div>
        )}

        {/* Results */}
        {step === 5 && currentGoals && (
          <motion.div
            key="results"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-4"
          >
            <CoachBubble>
              <p className="text-sm text-white mb-4">
                {useUserNumbers
                  ? "Got it! Here are your targets:"
                  : calculatedGoals?.message || "Here are your calculated targets:"}
              </p>

              {/* Macro display */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-xl bg-white/5">
                  <p className="text-xs text-muted-foreground">Calories</p>
                  <p className="text-lg font-bold text-white">
                    {currentGoals.calories.toLocaleString()}
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-white/5">
                  <p className="text-xs text-muted-foreground">Protein</p>
                  <p className="text-lg font-bold text-white">
                    {currentGoals.protein}g
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-white/5">
                  <p className="text-xs text-muted-foreground">Carbs</p>
                  <p className="text-lg font-bold text-white">
                    {currentGoals.carbs}g
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-white/5">
                  <p className="text-xs text-muted-foreground">Fat</p>
                  <p className="text-lg font-bold text-white">
                    {currentGoals.fat}g
                  </p>
                </div>
              </div>
            </CoachBubble>

            <div className="ml-[52px] space-y-2">
              {saveError && (
                <div className="px-4 py-2 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  {saveError}
                </div>
              )}
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={handleSaveGoals}
                disabled={isSaving}
                className="w-full px-4 py-3 rounded-xl bg-primary text-primary-foreground font-medium flex items-center justify-center gap-2 min-h-[44px] disabled:opacity-50"
              >
                {isSaving ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Check className="w-5 h-5" />
                    Save & Start Tracking
                  </>
                )}
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, Check, AlertTriangle, Send } from "lucide-react";

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

function UserBubble({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[85%] rounded-2xl px-4 py-3 bg-primary text-primary-foreground">
        <p className="text-sm">{children}</p>
      </div>
    </div>
  );
}

interface CoachOnboardingProps {
  onComplete: () => void;
}

// Steps: 0=name, 1=measurements, 2=goal, 3=coaching mode, 4=split, 5=injuries, 6=summary
type Step = 0 | 1 | 2 | 3 | 4 | 5 | 6;

type Goal = "bulking" | "cutting" | "maintaining";
type CoachingMode = "full" | "assist";
type Split = "ppl" | "upper_lower" | "bro" | "full_body" | "other";

const SPLIT_LABELS: Record<Split, string> = {
  ppl: "PPL",
  upper_lower: "Upper/Lower",
  bro: "Bro Split",
  full_body: "Full Body",
  other: "Custom",
};

const SPLIT_ROTATIONS: Record<Split, string[]> = {
  ppl: ["Push", "Pull", "Legs", "Rest", "Push", "Pull", "Legs"],
  upper_lower: ["Upper", "Lower", "Rest", "Upper", "Lower", "Rest"],
  bro: ["Chest", "Back", "Shoulders", "Arms", "Legs", "Rest", "Rest"],
  full_body: ["Full Body", "Rest", "Full Body", "Rest", "Full Body", "Rest"],
  other: ["Workout", "Rest"],
};

interface OnboardingData {
  name: string;
  age: string;
  heightFeet: string;
  heightInches: string;
  weight: string;
  goal: Goal | null;
  coachingMode: CoachingMode | null;
  split: Split | null;
  splitText: string;
  injuries: string;
}

// Message history for the conversation
interface Message {
  role: "coach" | "user";
  content: string;
}

export function CoachOnboarding({ onComplete }: CoachOnboardingProps) {
  const [step, setStep] = useState<Step>(0);
  const [inputValue, setInputValue] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [data, setData] = useState<OnboardingData>({
    name: "",
    age: "",
    heightFeet: "",
    heightInches: "",
    weight: "",
    goal: null,
    coachingMode: null,
    split: null,
    splitText: "",
    injuries: "",
  });
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Parse measurements from natural text like "25, 5'10, 180" or "25 years old, 5 foot 10, 180 lbs"
  const parseMeasurements = (text: string): { age?: string; heightFeet?: string; heightInches?: string; weight?: string } => {
    const result: { age?: string; heightFeet?: string; heightInches?: string; weight?: string } = {};

    // Extract age (first 2-digit number or number followed by "year")
    const ageMatch = text.match(/(\d{1,2})\s*(?:years?|yrs?|yo)?/i);
    if (ageMatch) result.age = ageMatch[1];

    // Extract height - various formats
    const heightMatch = text.match(/(\d)'?\s*(?:ft|foot|feet)?\s*(\d{1,2})?(?:"|''|in|inch)?/i) ||
                        text.match(/(\d)\s*(?:'|ft|foot)\s*(\d{1,2})/i);
    if (heightMatch) {
      result.heightFeet = heightMatch[1];
      result.heightInches = heightMatch[2] || "0";
    }

    // Extract weight (3-digit number or number followed by "lb/lbs/pounds")
    const weightMatch = text.match(/(\d{2,3})\s*(?:lbs?|pounds?)?/i);
    if (weightMatch && parseInt(weightMatch[1]) > 50) {
      result.weight = weightMatch[1];
    }

    return result;
  };

  // Parse goal from natural text
  const parseGoal = (text: string): Goal | null => {
    const lower = text.toLowerCase();
    if (lower.includes("bulk") || lower.includes("muscle") || lower.includes("gain") || lower.includes("bigger") || lower.includes("mass") || lower.includes("size")) {
      return "bulking";
    }
    if (lower.includes("cut") || lower.includes("lean") || lower.includes("lose") || lower.includes("fat") || lower.includes("shred") || lower.includes("weight")) {
      return "cutting";
    }
    if (lower.includes("maintain") || lower.includes("same") || lower.includes("keep") || lower.includes("stay")) {
      return "maintaining";
    }
    return null;
  };

  // Parse coaching mode from natural text
  const parseCoachingMode = (text: string): CoachingMode | null => {
    const lower = text.toLowerCase();
    if (lower.includes("own") || lower.includes("my") || lower.includes("myself") || lower.includes("have") || lower.includes("already") || lower.includes("follow")) {
      return "assist";
    }
    if (lower.includes("guide") || lower.includes("help") || lower.includes("tell") || lower.includes("coach") || lower.includes("you") || lower.includes("need")) {
      return "full";
    }
    return null;
  };

  // Parse split from natural text
  const parseSplit = (text: string): Split | null => {
    const lower = text.toLowerCase();
    if (lower.includes("ppl") || lower.includes("push pull leg")) {
      return "ppl";
    }
    if (lower.includes("upper") && lower.includes("lower")) {
      return "upper_lower";
    }
    if (lower.includes("bro") || lower.includes("body part") || lower.includes("one muscle")) {
      return "bro";
    }
    if (lower.includes("full body") || lower.includes("fullbody") || lower.includes("whole body")) {
      return "full_body";
    }
    return "other";
  };

  const handleSubmit = () => {
    if (!inputValue.trim()) return;

    const userMessage = inputValue.trim();
    setMessages(prev => [...prev, { role: "user", content: userMessage }]);
    setInputValue("");

    switch (step) {
      case 0: // Name
        setData(prev => ({ ...prev, name: userMessage }));
        setStep(1);
        break;

      case 1: // Measurements
        const measurements = parseMeasurements(userMessage);
        if (measurements.age && measurements.heightFeet && measurements.weight) {
          setData(prev => ({
            ...prev,
            age: measurements.age!,
            heightFeet: measurements.heightFeet!,
            heightInches: measurements.heightInches || "0",
            weight: measurements.weight!,
          }));
          setStep(2);
        } else {
          // Couldn't parse, ask again
          setTimeout(() => {
            setMessages(prev => [...prev, {
              role: "coach",
              content: "i didn't catch all of that. can you give me your age, height, and weight? something like \"25, 5'10, 180 lbs\""
            }]);
          }, 300);
        }
        break;

      case 2: // Goal
        const goal = parseGoal(userMessage);
        if (goal) {
          setData(prev => ({ ...prev, goal }));
          setStep(3);
        } else {
          setTimeout(() => {
            setMessages(prev => [...prev, {
              role: "coach",
              content: "are you looking to build muscle, lose fat, or maintain where you're at?"
            }]);
          }, 300);
        }
        break;

      case 3: // Coaching mode
        const mode = parseCoachingMode(userMessage);
        if (mode) {
          setData(prev => ({ ...prev, coachingMode: mode }));
          setStep(4);
        } else {
          setTimeout(() => {
            setMessages(prev => [...prev, {
              role: "coach",
              content: "no worries — do you already have a program you follow, or do you want me to guide your training?"
            }]);
          }, 300);
        }
        break;

      case 4: // Split
        const split = parseSplit(userMessage);
        setData(prev => ({ ...prev, split, splitText: userMessage }));
        setStep(5);
        break;

      case 5: // Injuries
        setData(prev => ({ ...prev, injuries: userMessage }));
        setStep(6);
        break;
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    setSaveError(null);

    try {
      const heightInches =
        parseInt(data.heightFeet) * 12 + (parseInt(data.heightInches) || 0);

      const response = await fetch("/api/coach-onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: data.name.trim(),
          age: parseInt(data.age),
          heightInches,
          weightLbs: parseInt(data.weight),
          goal: data.goal,
          coachingMode: data.coachingMode,
          trainingSplit: data.split === "other" ? data.splitText : SPLIT_LABELS[data.split!],
          splitRotation: SPLIT_ROTATIONS[data.split!],
          injuries: data.injuries.trim() || "none",
        }),
      });

      if (!response.ok) {
        const errorData: { error?: string } = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to save");
      }

      onComplete();
    } catch (error) {
      console.error("Coach onboarding save error:", error);
      setSaveError(
        error instanceof Error ? error.message : "Failed to save. Please try again."
      );
      setIsSaving(false);
    }
  };

  const formatHeight = () => {
    const feet = data.heightFeet || "?";
    const inches = data.heightInches || "0";
    return `${feet}'${inches}"`;
  };

  // Get current coach message based on step
  const getCurrentCoachMessage = (): string => {
    switch (step) {
      case 0:
        return "i'm your ai coach. i'll track your workouts, nutrition, and help you hit your goals. let's get you set up — what should i call you?";
      case 1:
        return `${data.name}, nice to meet you. what's your age, height, and weight?`;
      case 2:
        return "got it. what's your main goal right now — building muscle, losing fat, or maintaining?";
      case 3:
        return "do you have your own training program, or do you want me to guide your workouts?";
      case 4:
        return "what kind of split do you run? PPL, upper/lower, bro split, full body, or something else?";
      case 5:
        return "any injuries or limitations i should know about? if not, just say \"none\" or \"nope\"";
      case 6:
        return `you're all set. here's what i've got: ${data.age} years old, ${formatHeight()} at ${data.weight} lbs, ${
          data.goal === "bulking" ? "building muscle" : data.goal === "cutting" ? "losing fat" : "maintaining"
        }, running ${data.split === "other" ? data.splitText : SPLIT_LABELS[data.split!]}.${
          data.injuries.trim() && data.injuries.trim().toLowerCase() !== "none" && data.injuries.trim().toLowerCase() !== "nope"
            ? ` watching out for ${data.injuries.trim()}.`
            : ""
        }\n\nbottom nav: Log for workouts, Nutrition for meals, Stats for your PRs, and Coach is me. tap Log and hit + to start your first workout.`;
      default:
        return "";
    }
  };

  // Get placeholder text for current step
  const getPlaceholder = (): string => {
    switch (step) {
      case 0:
        return "Your name";
      case 1:
        return "e.g., 25, 5'10, 180 lbs";
      case 2:
        return "e.g., build muscle, get lean...";
      case 3:
        return "e.g., I have my own, guide me...";
      case 4:
        return "e.g., PPL, upper/lower, bro split...";
      case 5:
        return "e.g., bad shoulder, none...";
      default:
        return "";
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Messages Area - scrollable, takes remaining space */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Show conversation history */}
        {messages.map((msg, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
          >
            {msg.role === "coach" ? (
              <CoachBubble>
                <p className="text-sm text-white whitespace-pre-wrap">{msg.content}</p>
              </CoachBubble>
            ) : (
              <UserBubble>{msg.content}</UserBubble>
            )}
          </motion.div>
        ))}

        {/* Current coach message */}
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
          >
            <CoachBubble>
              <p className="text-sm text-white whitespace-pre-wrap">{getCurrentCoachMessage()}</p>
              {step === 6 && (
                <p className="text-sm text-muted-foreground italic mt-3">
                  you&apos;re one of the first people using netgains — if anything&apos;s
                  confusing, broken, or you have ideas, tell noah. you&apos;re helping build
                  this.
                </p>
              )}
            </CoachBubble>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Input Area - pinned at bottom */}
      <div
        className="flex-shrink-0 p-4 border-t border-white/5"
        style={{
          background: "#0f0f13",
          paddingBottom: "env(safe-area-inset-bottom, 8px)",
        }}
      >
        {step < 6 ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSubmit();
            }}
            className="flex gap-2 max-w-lg mx-auto items-end"
          >
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder={getPlaceholder()}
              autoFocus
              className="flex-1 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary min-h-[48px]"
              style={{ background: "#1a1a24" }}
            />
            <motion.button
              whileTap={{ scale: 0.9 }}
              type="submit"
              disabled={!inputValue.trim()}
              className="w-12 h-12 rounded-xl flex items-center justify-center bg-primary text-primary-foreground disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
            >
              <Send className="w-5 h-5" />
            </motion.button>
          </form>
        ) : (
          <div className="max-w-lg mx-auto space-y-2">
            {saveError && (
              <div className="px-4 py-2 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                {saveError}
              </div>
            )}
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={handleSave}
              disabled={isSaving}
              className="w-full px-4 py-3 rounded-xl bg-primary text-primary-foreground font-medium flex items-center justify-center gap-2 min-h-[48px] disabled:opacity-50"
            >
              {isSaving ? (
                <>
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Check className="w-5 h-5" />
                  Let&apos;s Go
                </>
              )}
            </motion.button>
          </div>
        )}
      </div>
    </div>
  );
}

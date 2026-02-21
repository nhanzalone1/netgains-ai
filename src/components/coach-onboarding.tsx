"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, ArrowRight, Check, AlertTriangle, Send } from "lucide-react";

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

interface CoachOnboardingProps {
  onComplete: () => void;
}

// Steps: 0=name, 1=age/height/weight, 2=goal, 3=coaching mode, 4=split, 5=injuries, 6=summary
type Step = 0 | 1 | 2 | 3 | 4 | 5 | 6;

type Goal = "bulking" | "cutting" | "maintaining";
type CoachingMode = "full" | "assist";
type Split = "ppl" | "upper_lower" | "bro" | "full_body";

const SPLIT_LABELS: Record<Split, string> = {
  ppl: "PPL",
  upper_lower: "Upper/Lower",
  bro: "Bro Split",
  full_body: "Full Body",
};

const SPLIT_ROTATIONS: Record<Split, string[]> = {
  ppl: ["Push", "Pull", "Legs", "Rest", "Push", "Pull", "Legs"],
  upper_lower: ["Upper", "Lower", "Rest", "Upper", "Lower", "Rest"],
  bro: ["Chest", "Back", "Shoulders", "Arms", "Legs", "Rest", "Rest"],
  full_body: ["Full Body", "Rest", "Full Body", "Rest", "Full Body", "Rest"],
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
  injuries: string;
}

export function CoachOnboarding({ onComplete }: CoachOnboardingProps) {
  const [step, setStep] = useState<Step>(0);
  const [data, setData] = useState<OnboardingData>({
    name: "",
    age: "",
    heightFeet: "",
    heightInches: "",
    weight: "",
    goal: null,
    coachingMode: null,
    split: null,
    injuries: "",
  });
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const handleNameSubmit = () => {
    if (data.name.trim()) {
      setStep(1);
    }
  };

  const handleMeasurementsSubmit = () => {
    if (data.age && data.heightFeet && data.weight) {
      setStep(2);
    }
  };

  const handleGoalSelect = (goal: Goal) => {
    setData((prev) => ({ ...prev, goal }));
    setStep(3);
  };

  const handleCoachingModeSelect = (mode: CoachingMode) => {
    setData((prev) => ({ ...prev, coachingMode: mode }));
    setStep(4);
  };

  const handleSplitSelect = (split: Split) => {
    setData((prev) => ({ ...prev, split }));
    setStep(5);
  };

  const handleInjuriesSubmit = () => {
    setStep(6);
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
          trainingSplit: SPLIT_LABELS[data.split!],
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

  // Render the coach bubble content for current step
  const renderBubble = () => {
    switch (step) {
      case 0:
        return (
          <CoachBubble>
            <p className="text-sm text-white">
              i&apos;m your ai coach. i&apos;ll track your workouts, nutrition, and help
              you hit your goals. let&apos;s get you set up — what should i call you?
            </p>
          </CoachBubble>
        );
      case 1:
        return (
          <CoachBubble>
            <p className="text-sm text-white">
              got it, {data.name}. what&apos;s your age, height, and weight?
            </p>
          </CoachBubble>
        );
      case 2:
        return (
          <CoachBubble>
            <p className="text-sm text-white">
              what&apos;s your main goal right now?
            </p>
          </CoachBubble>
        );
      case 3:
        return (
          <CoachBubble>
            <p className="text-sm text-white">
              do you have your own program, or want me to guide your training?
            </p>
          </CoachBubble>
        );
      case 4:
        return (
          <CoachBubble>
            <p className="text-sm text-white">what split do you run?</p>
          </CoachBubble>
        );
      case 5:
        return (
          <CoachBubble>
            <p className="text-sm text-white">
              any injuries or limitations i should know about?
            </p>
          </CoachBubble>
        );
      case 6:
        return (
          <CoachBubble>
            <p className="text-sm text-white mb-3">
              you&apos;re all set. here&apos;s what i&apos;ve got: {data.age} years old,{" "}
              {formatHeight()} at {data.weight} lbs,{" "}
              {data.goal === "bulking"
                ? "building muscle"
                : data.goal === "cutting"
                ? "losing fat"
                : "maintaining"}
              , running {SPLIT_LABELS[data.split!]}.
              {data.injuries.trim() && data.injuries.trim().toLowerCase() !== "none"
                ? ` watching out for ${data.injuries.trim()}.`
                : ""}
            </p>
            <p className="text-sm text-white mb-3">
              bottom nav: Log for workouts, Nutrition for meals, Stats for your PRs, and
              Coach is me. tap Log and hit + to start your first workout. tap Nutrition
              to set up your meal targets.
            </p>
            <p className="text-sm text-muted-foreground italic">
              you&apos;re one of the first people using netgains — if anything&apos;s
              confusing, broken, or you have ideas, tell noah. you&apos;re helping build
              this.
            </p>
          </CoachBubble>
        );
    }
  };

  // Render the input area for current step
  const renderInput = () => {
    switch (step) {
      case 0:
        return (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleNameSubmit();
            }}
            className="flex gap-2 max-w-lg mx-auto items-end"
          >
            <input
              type="text"
              value={data.name}
              onChange={(e) => setData((prev) => ({ ...prev, name: e.target.value }))}
              placeholder="Your name"
              autoFocus
              className="flex-1 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary min-h-[48px]"
              style={{ background: "#1a1a24" }}
            />
            <motion.button
              whileTap={{ scale: 0.9 }}
              type="submit"
              disabled={!data.name.trim()}
              className="w-12 h-12 rounded-xl flex items-center justify-center bg-primary text-primary-foreground disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
            >
              <Send className="w-5 h-5" />
            </motion.button>
          </form>
        );

      case 1:
        return (
          <div className="max-w-lg mx-auto space-y-3">
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="text-xs text-muted-foreground mb-1 block">Age</label>
                <input
                  type="number"
                  value={data.age}
                  onChange={(e) => setData((prev) => ({ ...prev, age: e.target.value }))}
                  placeholder="25"
                  className="w-full rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary min-h-[48px]"
                  style={{ background: "#1a1a24" }}
                />
              </div>
              <div className="flex-1">
                <label className="text-xs text-muted-foreground mb-1 block">Height (ft)</label>
                <input
                  type="number"
                  value={data.heightFeet}
                  onChange={(e) => setData((prev) => ({ ...prev, heightFeet: e.target.value }))}
                  placeholder="5"
                  className="w-full rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary min-h-[48px]"
                  style={{ background: "#1a1a24" }}
                />
              </div>
              <div className="flex-1">
                <label className="text-xs text-muted-foreground mb-1 block">Height (in)</label>
                <input
                  type="number"
                  value={data.heightInches}
                  onChange={(e) => setData((prev) => ({ ...prev, heightInches: e.target.value }))}
                  placeholder="10"
                  className="w-full rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary min-h-[48px]"
                  style={{ background: "#1a1a24" }}
                />
              </div>
            </div>
            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <label className="text-xs text-muted-foreground mb-1 block">Weight (lbs)</label>
                <input
                  type="number"
                  value={data.weight}
                  onChange={(e) => setData((prev) => ({ ...prev, weight: e.target.value }))}
                  placeholder="180"
                  className="w-full rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary min-h-[48px]"
                  style={{ background: "#1a1a24" }}
                />
              </div>
              <motion.button
                whileTap={{ scale: 0.9 }}
                onClick={handleMeasurementsSubmit}
                disabled={!data.age || !data.heightFeet || !data.weight}
                className="w-12 h-12 rounded-xl flex items-center justify-center bg-primary text-primary-foreground disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
              >
                <Send className="w-5 h-5" />
              </motion.button>
            </div>
          </div>
        );

      case 2:
        return (
          <div className="flex flex-wrap gap-2 justify-center max-w-lg mx-auto">
            <QuickReplyButton onClick={() => handleGoalSelect("bulking")}>
              Build muscle
            </QuickReplyButton>
            <QuickReplyButton onClick={() => handleGoalSelect("cutting")}>
              Lose fat
            </QuickReplyButton>
            <QuickReplyButton onClick={() => handleGoalSelect("maintaining")}>
              Maintain
            </QuickReplyButton>
          </div>
        );

      case 3:
        return (
          <div className="flex flex-wrap gap-2 justify-center max-w-lg mx-auto">
            <QuickReplyButton onClick={() => handleCoachingModeSelect("assist")}>
              I have my own program
            </QuickReplyButton>
            <QuickReplyButton onClick={() => handleCoachingModeSelect("full")}>
              Guide me
            </QuickReplyButton>
          </div>
        );

      case 4:
        return (
          <div className="flex flex-wrap gap-2 justify-center max-w-lg mx-auto">
            <QuickReplyButton onClick={() => handleSplitSelect("ppl")}>
              PPL
            </QuickReplyButton>
            <QuickReplyButton onClick={() => handleSplitSelect("upper_lower")}>
              Upper/Lower
            </QuickReplyButton>
            <QuickReplyButton onClick={() => handleSplitSelect("bro")}>
              Bro Split
            </QuickReplyButton>
            <QuickReplyButton onClick={() => handleSplitSelect("full_body")}>
              Full Body
            </QuickReplyButton>
          </div>
        );

      case 5:
        return (
          <div className="max-w-lg mx-auto">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleInjuriesSubmit();
              }}
              className="flex gap-2 items-end"
            >
              <input
                type="text"
                value={data.injuries}
                onChange={(e) => setData((prev) => ({ ...prev, injuries: e.target.value }))}
                placeholder="e.g., bad shoulder (or leave blank)"
                className="flex-1 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary min-h-[48px]"
                style={{ background: "#1a1a24" }}
              />
              <motion.button
                whileTap={{ scale: 0.9 }}
                type="submit"
                className="w-12 h-12 rounded-xl flex items-center justify-center bg-primary text-primary-foreground flex-shrink-0"
              >
                <Send className="w-5 h-5" />
              </motion.button>
            </form>
          </div>
        );

      case 6:
        return (
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
        );
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Messages Area - scrollable, takes remaining space */}
      <div className="flex-1 overflow-y-auto p-4">
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
          >
            {renderBubble()}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Input Area - pinned at bottom, matches regular chat styling */}
      <div
        className="flex-shrink-0 p-4 border-t border-white/5"
        style={{
          background: "#0f0f13",
          paddingBottom: "env(safe-area-inset-bottom, 8px)",
        }}
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={`input-${step}`}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            {renderInput()}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

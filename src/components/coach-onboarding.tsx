"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Send, Sparkles } from "lucide-react";
import { motion } from "framer-motion";

interface CoachOnboardingProps {
  onComplete: () => void;
}

interface Message {
  id: string;
  role: "coach" | "user";
  content: string;
}

// The 7 fixed onboarding questions - coach never improvises
const COACH_QUESTIONS = [
  "i'm your ai coach. i'll track your workouts, nutrition, and help you hit your goals. let's get you set up — what should i call you?",
  "what's your age, height, and weight?",
  "what's your main goal right now — building muscle, losing fat, or maintaining?",
  "do you want me to build your program, or do you already have one?",
  "what split do you run? ppl, upper/lower, bro split, full body?",
  "how many days a week can you realistically train?",
  "any injuries or limitations i should know about?",
];

// Map step index to parse step type
type StepType = 'name' | 'stats' | 'goal' | 'coaching_mode' | 'split' | 'days' | 'injuries';
const STEP_TYPES: StepType[] = ['name', 'stats', 'goal', 'coaching_mode', 'split', 'days', 'injuries'];

// Collected data throughout onboarding
interface OnboardingData {
  name?: string;
  age?: number;
  height_inches?: number;
  weight_lbs?: number;
  goal?: 'bulking' | 'cutting' | 'maintaining';
  coaching_mode?: 'full' | 'assist';
  training_split?: string;
  split_rotation?: string[];
  days_per_week?: number;
  injuries?: string;
}

export function CoachOnboarding({ onComplete }: CoachOnboardingProps) {
  const [messages, setMessages] = useState<Message[]>([
    { id: '0', role: 'coach', content: COACH_QUESTIONS[0] }
  ]);
  const [currentStep, setCurrentStep] = useState(0);
  const [inputValue, setInputValue] = useState("");
  const [isParsing, setIsParsing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [data, setData] = useState<OnboardingData>({});
  const [error, setError] = useState<string | null>(null);
  const [viewportHeight, setViewportHeight] = useState<number | null>(null);
  const [keyboardOpen, setKeyboardOpen] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const keyboardScrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const orientationTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Scroll to bottom helper
  const scrollToBottom = useCallback((force = false) => {
    if (force) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, []);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Focus input after coach message
  useEffect(() => {
    if (!isParsing && !isSaving) {
      inputRef.current?.focus();
    }
  }, [messages.length, isParsing, isSaving]);

  // iOS keyboard handling using Visual Viewport API
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;

    let initialHeight = window.innerHeight;

    const updateViewport = () => {
      if (!viewport) return;

      const currentHeight = viewport.height;
      const heightDiff = initialHeight - currentHeight;

      // Keyboard is open if viewport shrunk significantly (>150px for iOS bars)
      const isOpen = heightDiff > 150;
      setKeyboardOpen(isOpen);

      if (isOpen) {
        // Subtract extra space for iOS keyboard accessory bar (~44px)
        setViewportHeight(currentHeight - 44);
        if (keyboardScrollTimeoutRef.current) {
          clearTimeout(keyboardScrollTimeoutRef.current);
        }
        keyboardScrollTimeoutRef.current = setTimeout(() => scrollToBottom(true), 50);
      } else {
        setViewportHeight(null);
      }

      // Keep page scrolled to top to prevent iOS from pushing it up
      if (isOpen && containerRef.current) {
        window.scrollTo(0, 0);
      }
    };

    const onOrientationChange = () => {
      if (orientationTimeoutRef.current) {
        clearTimeout(orientationTimeoutRef.current);
      }
      orientationTimeoutRef.current = setTimeout(() => {
        initialHeight = window.innerHeight;
        updateViewport();
      }, 300);
    };

    updateViewport();

    viewport.addEventListener("resize", updateViewport);
    window.addEventListener("orientationchange", onOrientationChange);

    return () => {
      viewport.removeEventListener("resize", updateViewport);
      window.removeEventListener("orientationchange", onOrientationChange);
      if (keyboardScrollTimeoutRef.current) {
        clearTimeout(keyboardScrollTimeoutRef.current);
      }
      if (orientationTimeoutRef.current) {
        clearTimeout(orientationTimeoutRef.current);
      }
    };
  }, [scrollToBottom]);

  const addMessage = (role: "coach" | "user", content: string) => {
    const id = Date.now().toString();
    setMessages(prev => [...prev, { id, role, content }]);
  };

  const parseResponse = async (userResponse: string): Promise<Record<string, string | number> | null> => {
    const stepType = STEP_TYPES[currentStep];

    console.log('[onboarding] Parsing step:', stepType, 'response:', userResponse);

    try {
      const response = await fetch('/api/onboarding-parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          step: stepType,
          userResponse,
          context: data, // Pass collected data for context
        }),
      });

      console.log('[onboarding] API response status:', response.status);

      if (!response.ok) {
        console.error('[onboarding] API error:', response.status, response.statusText);
        return null;
      }

      const result = await response.json();
      console.log('[onboarding] API result:', result);

      if (!result.success) {
        console.error('[onboarding] Parse failed:', result.error);
        return null;
      }

      return result.data;
    } catch (err) {
      console.error('[onboarding] Parse error:', err);
      return null;
    }
  };

  const saveOnboarding = async (finalData: OnboardingData): Promise<boolean> => {
    try {
      const response = await fetch('/api/coach-onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: finalData.name,
          age: finalData.age,
          heightInches: finalData.height_inches,
          weightLbs: finalData.weight_lbs,
          goal: finalData.goal,
          coachingMode: finalData.coaching_mode,
          trainingSplit: finalData.training_split,
          splitRotation: finalData.split_rotation,
          injuries: finalData.injuries,
          daysPerWeek: finalData.days_per_week,
        }),
      });

      return response.ok;
    } catch (err) {
      console.error('[onboarding] Save error:', err);
      return false;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || isParsing || isSaving) return;

    const userResponse = inputValue.trim();
    setInputValue("");
    setError(null);

    // Reset textarea height
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
    }

    // Add user's message to chat
    addMessage("user", userResponse);

    // Parse the response with Haiku
    setIsParsing(true);
    const parsed = await parseResponse(userResponse);
    setIsParsing(false);

    if (!parsed) {
      // Parsing failed - ask user to try again
      setError("i didn't quite catch that. could you rephrase?");
      return;
    }

    // Merge parsed data into collected data
    const updatedData = { ...data, ...parsed } as OnboardingData;
    setData(updatedData);

    const nextStep = currentStep + 1;

    // Check if we've completed all questions
    if (nextStep >= COACH_QUESTIONS.length) {
      // All questions answered - save and show closing message
      setIsSaving(true);

      const saved = await saveOnboarding(updatedData);

      if (!saved) {
        setIsSaving(false);
        setError("something went wrong saving your info. tap send to try again.");
        // Don't advance step so they can retry
        return;
      }

      // Show closing message
      const closingMessage = buildClosingMessage(updatedData);
      addMessage("coach", closingMessage);
      setIsSaving(false);

      // Give user time to read closing message, then transition to normal chat
      setTimeout(() => {
        onComplete();
      }, 4000);
    } else {
      // Move to next question
      setCurrentStep(nextStep);
      addMessage("coach", COACH_QUESTIONS[nextStep]);
    }
  };

  const buildClosingMessage = (finalData: OnboardingData): string => {
    const heightFeet = Math.floor((finalData.height_inches || 0) / 12);
    const heightInches = (finalData.height_inches || 0) % 12;
    const heightStr = `${heightFeet}'${heightInches}"`;

    const goalMap: Record<string, string> = {
      bulking: 'building muscle',
      cutting: 'losing fat',
      maintaining: 'maintaining',
    };
    const goalStr = goalMap[finalData.goal || 'maintaining'] || finalData.goal;

    const injuryStr = finalData.injuries && finalData.injuries !== 'none'
      ? ` watching out for ${finalData.injuries}.`
      : '';

    return `you're all set, ${finalData.name}. here's what i've got: ${finalData.age} years old, ${heightStr} at ${finalData.weight_lbs} lbs, ${goalStr}, running ${finalData.training_split}, training ${finalData.days_per_week} days a week.${injuryStr}

bottom nav: Log for workouts, Nutrition for meals, Stats for your PRs, and Coach is me. tap Log and hit + to start your first workout. tap Nutrition to set up your meal targets.

you're one of the first people using netgains — if anything's confusing, broken, or you have ideas, tell noah. you're helping build this.`;
  };

  return (
    <div
      ref={containerRef}
      className="flex flex-col"
      style={{
        height: keyboardOpen && viewportHeight ? viewportHeight : '100%',
      }}
    >
      {/* Messages Area */}
      <div
        ref={messagesContainerRef}
        className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-hide"
        style={{
          WebkitOverflowScrolling: 'touch',
          scrollbarWidth: 'none',
        }}
      >
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
          >
            {message.role === "coach" && (
              <div
                className="w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center mr-3"
                style={{ background: "rgba(255, 71, 87, 0.15)" }}
              >
                <Sparkles className="w-5 h-5 text-primary" />
              </div>
            )}
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                message.role === "user"
                  ? "bg-primary text-primary-foreground"
                  : ""
              }`}
              style={message.role === "coach" ? { background: "#1a1a24" } : undefined}
            >
              <p className="text-sm whitespace-pre-wrap">{message.content}</p>
            </div>
          </div>
        ))}

        {/* Parsing indicator */}
        {isParsing && (
          <div className="flex justify-start">
            <div
              className="w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center mr-3"
              style={{ background: "rgba(255, 71, 87, 0.15)" }}
            >
              <Sparkles className="w-5 h-5 text-primary" />
            </div>
            <div
              className="rounded-2xl px-4 py-3 flex items-center gap-2"
              style={{ background: "#1a1a24" }}
            >
              <div className="flex gap-1">
                <span className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          </div>
        )}

        {/* Saving indicator */}
        {isSaving && (
          <div className="flex justify-start">
            <div
              className="w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center mr-3"
              style={{ background: "rgba(255, 71, 87, 0.15)" }}
            >
              <Sparkles className="w-5 h-5 text-primary" />
            </div>
            <div
              className="rounded-2xl px-4 py-3 flex items-center gap-2"
              style={{ background: "#1a1a24" }}
            >
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              <span className="text-sm text-muted-foreground">saving your info...</span>
            </div>
          </div>
        )}

        {/* Error message */}
        {error && (
          <div className="flex justify-start">
            <div
              className="w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center mr-3"
              style={{ background: "rgba(255, 71, 87, 0.15)" }}
            >
              <Sparkles className="w-5 h-5 text-primary" />
            </div>
            <div
              className="rounded-2xl px-4 py-3"
              style={{ background: "#1a1a24" }}
            >
              <p className="text-sm text-red-400">{error}</p>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} className="h-4" />
      </div>

      {/* Input Area */}
      <div
        className="flex-shrink-0 p-4 border-t border-white/5"
        style={{
          background: "#0f0f13",
          // Extra padding when keyboard open to account for iOS keyboard accessory bar (~44px)
          paddingBottom: keyboardOpen ? 52 : "env(safe-area-inset-bottom, 8px)",
        }}
      >
        <form onSubmit={handleSubmit} className="flex gap-2 max-w-lg mx-auto items-end">
          <textarea
            ref={inputRef}
            value={inputValue}
            onChange={(e) => {
              setInputValue(e.target.value);
              // Auto-expand textarea
              e.target.style.height = "auto";
              e.target.style.height = Math.min(e.target.scrollHeight, 150) + "px";
            }}
            onKeyDown={(e) => {
              // Submit on Enter (without Shift)
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(e);
              }
            }}
            placeholder="Type your answer..."
            rows={1}
            disabled={isParsing || isSaving}
            className="flex-1 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary min-h-[48px] max-h-[150px] resize-none overflow-y-auto disabled:opacity-50"
            style={{ background: "#1a1a24" }}
          />
          <motion.button
            whileTap={{ scale: 0.9 }}
            type="submit"
            disabled={!inputValue.trim() || isParsing || isSaving}
            className="w-12 h-12 rounded-xl flex items-center justify-center bg-primary text-primary-foreground disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
          >
            <Send className="w-5 h-5" />
          </motion.button>
        </form>
      </div>
    </div>
  );
}

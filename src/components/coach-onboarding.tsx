"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Send, Sparkles } from "lucide-react";
import { motion } from "framer-motion";
import { createClient } from "@/lib/supabase/client";

interface CoachOnboardingProps {
  onComplete: () => void;
}

interface Message {
  id: string;
  role: "coach" | "user";
  content: string;
}

// Questions mapped to the fields they're asking about
const ONBOARDING_QUESTIONS: { question: string; fields: string[]; defaults: Record<string, unknown> }[] = [
  {
    question: "i'm your ai coach. i'll track your workouts, nutrition, and help you hit your goals. let's get you set up — what should i call you?",
    fields: ['name'],
    defaults: { name: 'there' }
  },
  {
    question: "cool. how old are you, and what's your height and weight? ballpark is fine.",
    fields: ['age', 'height_inches', 'weight_lbs'],
    defaults: { age: 25, height_inches: 70, weight_lbs: 170 }
  },
  {
    question: "what are you going for right now — trying to put on size, lean out, or just maintain where you're at?",
    fields: ['goal'],
    defaults: { goal: 'cutting' }
  },
  {
    question: "you running your own program or want me to set one up?",
    fields: ['coaching_mode'],
    defaults: { coaching_mode: 'assist' }
  },
  {
    question: "what's your split look like? ppl, upper/lower, bro split, whatever you're running.",
    fields: ['training_split', 'split_rotation'],
    defaults: { training_split: 'PPL', split_rotation: ['Push', 'Pull', 'Legs', 'Rest', 'Push', 'Pull', 'Legs'] }
  },
  {
    question: "how many days a week are you actually getting in the gym?",
    fields: ['days_per_week'],
    defaults: { days_per_week: 4 }
  },
  {
    question: "any injuries or stuff i should work around? bad shoulder, knee issues, anything like that?",
    fields: ['injuries'],
    defaults: { injuries: 'none' }
  },
];

// All required fields for onboarding
const REQUIRED_FIELDS = ['name', 'age', 'height_inches', 'weight_lbs', 'goal', 'coaching_mode', 'training_split', 'split_rotation', 'days_per_week', 'injuries'];

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

// Get list of fields we already have
function getCollectedFields(data: OnboardingData): string[] {
  const fields: string[] = [];
  if (data.name) fields.push('name');
  if (data.age) fields.push('age');
  if (data.height_inches) fields.push('height_inches');
  if (data.weight_lbs) fields.push('weight_lbs');
  if (data.goal) fields.push('goal');
  if (data.coaching_mode) fields.push('coaching_mode');
  if (data.training_split) fields.push('training_split');
  if (data.split_rotation) fields.push('split_rotation');
  if (data.days_per_week) fields.push('days_per_week');
  if (data.injuries) fields.push('injuries');
  return fields;
}

// Find next question that asks for fields we're missing
function getNextQuestion(data: OnboardingData): { question: string; index: number } | null {
  const collected = getCollectedFields(data);

  for (let i = 0; i < ONBOARDING_QUESTIONS.length; i++) {
    const q = ONBOARDING_QUESTIONS[i];
    // Check if any of the fields for this question are missing
    const needsAny = q.fields.some(field => !collected.includes(field));
    if (needsAny) {
      return { question: q.question, index: i };
    }
  }
  return null; // All fields collected
}

// Check if we have all required fields
function hasAllFields(data: OnboardingData): boolean {
  return REQUIRED_FIELDS.every(field => {
    const value = data[field as keyof OnboardingData];
    return value !== undefined && value !== null && value !== '';
  });
}

export function CoachOnboarding({ onComplete }: CoachOnboardingProps) {
  const [messages, setMessages] = useState<Message[]>([
    { id: '0', role: 'coach', content: ONBOARDING_QUESTIONS[0].question }
  ]);
  const [inputValue, setInputValue] = useState("");
  const [isParsing, setIsParsing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [data, setData] = useState<OnboardingData>({});
  const [error, setError] = useState<string | null>(null);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [retryCount, setRetryCount] = useState(0);
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
        // Subtract extra space for iOS keyboard accessory bar
        setViewportHeight(currentHeight - 88);
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

  const parseResponse = async (userResponse: string): Promise<Record<string, unknown> | null> => {
    const alreadyHave = getCollectedFields(data);

    console.log('[onboarding] Parsing response:', userResponse, 'Already have:', alreadyHave);

    try {
      const response = await fetch('/api/onboarding-parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userResponse,
          alreadyHave,
        }),
      });

      console.log('[onboarding] Parse API response status:', response.status);

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'no body');
        console.error('[onboarding] Parse API error:', response.status, response.statusText, errorText);
        return null;
      }

      const result = await response.json();
      console.log('[onboarding] Parse API result:', result);

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

  // Client-side parsing for simple responses (skip API call)
  const tryClientParse = (questionIndex: number, response: string): Record<string, unknown> | null => {
    const lower = response.toLowerCase().trim();

    // Question 0: Name - single word or short name, just accept it
    if (questionIndex === 0) {
      // Accept if it's 1-3 words and no numbers
      const words = response.trim().split(/\s+/);
      if (words.length <= 3 && !/\d/.test(response)) {
        return { name: response.trim() };
      }
    }

    // Question 6: Injuries - handle "no" variations
    if (questionIndex === 6) {
      const noVariations = ['no', 'nope', 'nah', 'none', 'nothing', 'n/a', 'na', 'all good', 'im good', "i'm good", 'good', 'negative'];
      if (noVariations.includes(lower) || lower.startsWith('no ') || lower.startsWith('nope ')) {
        return { injuries: 'none' };
      }
    }

    // Question 3: Coaching mode - handle clear yes/no for "want me to set one up?"
    if (questionIndex === 3) {
      const assistVariations = ['i have my own', 'have my own', 'my own', 'own program', 'i have one', 'have one', 'already have', 'got one', 'yes i have', 'running my own'];
      const fullVariations = ['build one', 'set one up', 'make one', 'create one', 'you build', 'yes please', 'please', 'yeah', 'yes', 'sure'];

      if (assistVariations.some(v => lower.includes(v))) {
        return { coaching_mode: 'assist' };
      }
      if (fullVariations.some(v => lower.includes(v)) && !lower.includes('have')) {
        return { coaching_mode: 'full' };
      }
    }

    return null; // Fall back to API parsing
  };

  // Save closing message to DB so it persists in regular chat
  const saveClosingMessageToDb = async (message: string): Promise<void> => {
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      await supabase.from('chat_messages').insert({
        user_id: user.id,
        role: 'assistant',
        content: message,
      });
      console.log('[onboarding] Closing message saved to DB');
    } catch (err) {
      console.error('[onboarding] Failed to save closing message:', err);
      // Don't block onboarding completion if this fails
    }
  };

  const saveOnboarding = async (finalData: OnboardingData): Promise<boolean> => {
    const payload = {
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
    };

    console.log('[onboarding] Saving with payload:', payload);

    try {
      const response = await fetch('/api/coach-onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('[onboarding] Save failed:', response.status, errorData);
        return false;
      }

      console.log('[onboarding] Save successful');
      return true;
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

    // Try client-side parsing first for simple responses
    const clientParsed = tryClientParse(currentQuestionIndex, userResponse);

    let parsed: Record<string, unknown> | null;
    if (clientParsed) {
      // Client-side parsing succeeded, skip API call
      console.log('[onboarding] Client-side parsed:', clientParsed);
      parsed = clientParsed;
    } else {
      // Call API for complex responses
      setIsParsing(true);
      parsed = await parseResponse(userResponse);
      setIsParsing(false);
    }

    // Get current question's defaults
    const currentQuestion = ONBOARDING_QUESTIONS[currentQuestionIndex];
    const nextQuestionIndex = currentQuestionIndex + 1;
    const isLastQuestion = nextQuestionIndex >= ONBOARDING_QUESTIONS.length;

    // Check if parsing failed OR returned empty data (both are failures)
    const parseFailed = !parsed || Object.keys(parsed).length === 0;

    if (parseFailed) {
      // Parsing failed
      if (retryCount >= 1) {
        // Already retried once - use defaults and move on
        console.log('[onboarding] Parse failed twice, using defaults:', currentQuestion?.defaults);
        const updatedData = { ...data, ...(currentQuestion?.defaults || {}) } as OnboardingData;
        setData(updatedData);
        setRetryCount(0);

        // Move to next question or finish
        if (isLastQuestion) {
          // Fill in any remaining defaults and save
          const finalData = applyAllDefaults(updatedData);
          console.log('[onboarding] Last question, saving with defaults:', finalData);
          setIsSaving(true);
          const saved = await saveOnboarding(finalData);
          if (!saved) {
            setIsSaving(false);
            setError("something went wrong saving your info. tap send to try again.");
            return;
          }
          const closingMessage = buildClosingMessage(finalData);
          addMessage("coach", closingMessage);
          setIsSaving(false);
          setTimeout(() => onComplete(), 4000);
        } else {
          setCurrentQuestionIndex(nextQuestionIndex);
          addMessage("coach", ONBOARDING_QUESTIONS[nextQuestionIndex].question);
        }
        return;
      }

      // First failure - increment retry and let user try again
      setRetryCount(retryCount + 1);
      setError("didn't catch that. give it one more shot.");
      return;
    }

    // Parsing succeeded - reset retry count
    setRetryCount(0);

    // Merge parsed data into collected data
    const updatedData = { ...data, ...parsed } as OnboardingData;
    setData(updatedData);
    console.log('[onboarding] Updated data:', updatedData, 'Question index:', currentQuestionIndex, '→', nextQuestionIndex);

    // Move to next question or save if done
    if (isLastQuestion) {
      // Fill in any remaining defaults and save
      const finalData = applyAllDefaults(updatedData);
      console.log('[onboarding] All questions answered, saving:', finalData);
      setIsSaving(true);

      const saved = await saveOnboarding(finalData);

      if (!saved) {
        setIsSaving(false);
        setError("something went wrong saving your info. tap send to try again.");
        console.error('[onboarding] Save failed');
        return;
      }

      // Show closing message and save to DB so it persists after transition
      const closingMessage = buildClosingMessage(finalData);
      addMessage("coach", closingMessage);

      // Save closing message to chat_messages table
      await saveClosingMessageToDb(closingMessage);
      setIsSaving(false);

      // Give user time to read closing message, then transition to normal chat
      setTimeout(() => {
        onComplete();
      }, 4000);
    } else {
      // Advance to next question
      setCurrentQuestionIndex(nextQuestionIndex);
      addMessage("coach", ONBOARDING_QUESTIONS[nextQuestionIndex].question);
    }
  };

  // Apply defaults for any missing fields
  const applyAllDefaults = (partialData: OnboardingData): OnboardingData => {
    const result = { ...partialData };
    for (const q of ONBOARDING_QUESTIONS) {
      for (const [key, defaultValue] of Object.entries(q.defaults)) {
        if (result[key as keyof OnboardingData] === undefined) {
          (result as Record<string, unknown>)[key] = defaultValue;
        }
      }
    }
    return result;
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
        overflow: 'hidden',
      }}
    >
      {/* Messages Area - only this area scrolls */}
      <div
        ref={messagesContainerRef}
        className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-hide min-h-0"
        style={{
          WebkitOverflowScrolling: 'touch',
          scrollbarWidth: 'none',
          overscrollBehavior: 'contain',
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

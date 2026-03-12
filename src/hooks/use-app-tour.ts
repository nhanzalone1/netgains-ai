"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/components/auth-provider";

export interface TourStep {
  id: string;
  target: string; // data-tour attribute value
  title: string;
  description: string;
}

// Coach-voice tour steps - punchy and direct
export const tourSteps: TourStep[] = [
  {
    id: "log",
    target: "log",
    title: "Your gym lives here",
    description: "Every rep you log feeds my brain. I'll spot patterns you'd miss and tell you when you're due for a PR.",
  },
  {
    id: "nutrition",
    target: "nutrition",
    title: "Track what you eat",
    description: "I need the full picture to dial in your calories and macros. Log meals here or just tell me what you ate in chat.",
  },
  {
    id: "coach",
    target: "coach",
    title: "Home base",
    description: "Ask me anything — form checks, plateau advice, meal ideas, or just vent about leg day. I'm always here.",
  },
  {
    id: "stats",
    target: "stats",
    title: "Proof of progress",
    description: "PRs, volume trends, everything that shows the work is working. This is where doubts come to die.",
  },
];

interface UseAppTourReturn {
  isActive: boolean;
  currentStep: number;
  currentStepData: TourStep | null;
  totalSteps: number;
  startTour: () => void;
  nextStep: () => void;
  skipTour: () => void;
  completeTour: () => void;
}

export function useAppTour(): UseAppTourReturn {
  const [isActive, setIsActive] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const { user } = useAuth();
  const router = useRouter();
  const supabase = createClient();

  // Listen for tour start event (from coach page after onboarding)
  useEffect(() => {
    const handleStartTour = () => {
      setCurrentStep(0);
      setIsActive(true);
    };

    window.addEventListener("start-app-tour", handleStartTour);
    return () => window.removeEventListener("start-app-tour", handleStartTour);
  }, []);

  const startTour = useCallback(() => {
    setCurrentStep(0);
    setIsActive(true);
  }, []);

  const markTourComplete = useCallback(async () => {
    if (!user?.id) return;

    await supabase
      .from("profiles")
      .update({ app_tour_shown: true })
      .eq("id", user.id);
  }, [user, supabase]);

  const nextStep = useCallback(() => {
    if (currentStep < tourSteps.length - 1) {
      setCurrentStep((prev) => prev + 1);
    } else {
      // Last step - complete the tour
      setIsActive(false);
      markTourComplete();
      // Navigate to Log tab with the CTA
      router.push("/log");
    }
  }, [currentStep, markTourComplete, router]);

  const skipTour = useCallback(() => {
    setIsActive(false);
    markTourComplete();
  }, [markTourComplete]);

  const completeTour = useCallback(() => {
    setIsActive(false);
    markTourComplete();
    router.push("/log");
  }, [markTourComplete, router]);

  return {
    isActive,
    currentStep,
    currentStepData: isActive ? tourSteps[currentStep] : null,
    totalSteps: tourSteps.length,
    startTour,
    nextStep,
    skipTour,
    completeTour,
  };
}

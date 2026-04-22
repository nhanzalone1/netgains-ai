"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronRight, X } from "lucide-react";
import { useAppTour, tourSteps } from "@/hooks/use-app-tour";

interface SpotlightPosition {
  top: number;
  left: number;
  width: number;
  height: number;
}

export function AppTour() {
  const {
    isActive,
    currentStep,
    currentStepData,
    totalSteps,
    nextStep,
    skipTour,
    completeTour,
  } = useAppTour();

  const [spotlightPos, setSpotlightPos] = useState<SpotlightPosition | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ left: number; arrowLeft: number } | null>(null);

  // Calculate spotlight position for current step
  const updatePositions = useCallback(() => {
    if (!currentStepData) return;

    const target = document.querySelector(`[data-tour="${currentStepData.target}"]`);
    if (!target) return;

    const rect = target.getBoundingClientRect();
    const padding = 8; // Padding around the spotlight

    setSpotlightPos({
      top: rect.top - padding,
      left: rect.left - padding,
      width: rect.width + padding * 2,
      height: rect.height + padding * 2,
    });

    // Calculate tooltip position - centered on the target, but clamped to screen
    const tooltipWidth = 280;
    const screenPadding = 16;
    const targetCenterX = rect.left + rect.width / 2;

    // Ideal position: centered on target
    let tooltipLeft = targetCenterX - tooltipWidth / 2;

    // Clamp to screen bounds
    tooltipLeft = Math.max(screenPadding, Math.min(tooltipLeft, window.innerWidth - tooltipWidth - screenPadding));

    // Arrow should point to target center
    const arrowLeft = targetCenterX - tooltipLeft;

    setTooltipPos({ left: tooltipLeft, arrowLeft });
  }, [currentStepData]);

  // Update positions when step changes or window resizes
  useEffect(() => {
    if (!isActive) return;

    updatePositions();

    const handleResize = () => updatePositions();
    window.addEventListener("resize", handleResize);

    // Small delay to ensure DOM is ready
    const timeout = setTimeout(updatePositions, 50);

    return () => {
      window.removeEventListener("resize", handleResize);
      clearTimeout(timeout);
    };
  }, [isActive, currentStep, updatePositions]);

  if (!isActive || !currentStepData || !spotlightPos || !tooltipPos) return null;

  const isLastStep = currentStep === totalSteps - 1;

  // Calculate clip path to create spotlight hole
  const clipPath = `polygon(
    0% 0%,
    0% 100%,
    ${spotlightPos.left}px 100%,
    ${spotlightPos.left}px ${spotlightPos.top}px,
    ${spotlightPos.left + spotlightPos.width}px ${spotlightPos.top}px,
    ${spotlightPos.left + spotlightPos.width}px ${spotlightPos.top + spotlightPos.height}px,
    ${spotlightPos.left}px ${spotlightPos.top + spotlightPos.height}px,
    ${spotlightPos.left}px 100%,
    100% 100%,
    100% 0%
  )`;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[9998] pointer-events-auto">
        {/* Dark overlay with spotlight cutout */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-black/85"
          style={{ clipPath }}
          onClick={skipTour}
        />

        {/* Glow ring around spotlight */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          transition={{ duration: 0.3 }}
          className="absolute rounded-2xl pointer-events-none"
          style={{
            top: spotlightPos.top - 4,
            left: spotlightPos.left - 4,
            width: spotlightPos.width + 8,
            height: spotlightPos.height + 8,
            boxShadow: "0 0 0 4px rgba(6, 182, 212, 0.4), 0 0 30px rgba(6, 182, 212, 0.3), 0 0 60px rgba(6, 182, 212, 0.2)",
          }}
        />

        {/* Tooltip card */}
        <motion.div
          key={currentStep}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          transition={{ duration: 0.3, delay: 0.1 }}
          className="absolute w-[280px]"
          style={{
            bottom: `calc(100% - ${spotlightPos.top - 16}px)`,
            left: tooltipPos.left,
          }}
        >
          {/* Card content */}
          <div
            className="relative rounded-2xl p-4"
            style={{
              background: "rgba(26, 26, 36, 0.98)",
              backdropFilter: "blur(24px)",
              WebkitBackdropFilter: "blur(24px)",
              border: "1px solid rgba(255, 255, 255, 0.1)",
              boxShadow: "0 16px 48px rgba(0, 0, 0, 0.5), 0 0 30px rgba(6, 182, 212, 0.1)",
            }}
          >
            {/* Skip button */}
            <button
              onClick={skipTour}
              className="absolute top-3 right-3 w-6 h-6 flex items-center justify-center rounded-full text-muted-foreground hover:text-white hover:bg-white/10 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Step indicator */}
            <div className="flex items-center gap-1.5 mb-3">
              {tourSteps.map((_, index) => (
                <div
                  key={index}
                  className="h-1 rounded-full transition-all duration-300"
                  style={{
                    width: index === currentStep ? 20 : 8,
                    background: index === currentStep
                      ? "linear-gradient(135deg, #06b6d4 0%, #22d3ee 100%)"
                      : index < currentStep
                        ? "#06b6d4"
                        : "rgba(255, 255, 255, 0.2)",
                  }}
                />
              ))}
            </div>

            {/* Title */}
            <h3 className="text-lg font-bold text-white mb-2">
              {currentStepData.title}
            </h3>

            {/* Description */}
            <p className="text-sm text-muted-foreground leading-relaxed mb-4">
              {currentStepData.description}
            </p>

            {/* Action button */}
            <motion.button
              whileTap={{ scale: 0.98 }}
              onClick={isLastStep ? completeTour : nextStep}
              className="w-full py-3 px-4 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 btn-primary"
            >
              {isLastStep ? (
                "Log your first workout"
              ) : (
                <>
                  Next
                  <ChevronRight className="w-4 h-4" />
                </>
              )}
            </motion.button>
          </div>

          {/* Arrow pointing down to target */}
          <div
            className="absolute -bottom-2 w-4 h-4 rotate-45"
            style={{
              left: tooltipPos.arrowLeft - 8,
              background: "rgba(26, 26, 36, 0.98)",
              borderRight: "1px solid rgba(255, 255, 255, 0.1)",
              borderBottom: "1px solid rgba(255, 255, 255, 0.1)",
            }}
          />
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

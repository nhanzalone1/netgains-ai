"use client";

import { cn } from "@/lib/utils";

interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-lg bg-muted/40",
        className
      )}
    />
  );
}

// Pre-built skeleton patterns for common UI elements

export function SkeletonCard({ className }: SkeletonProps) {
  return (
    <div className={cn("p-4 rounded-2xl bg-card", className)}>
      <div className="flex items-center gap-3">
        <Skeleton className="w-10 h-10 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      </div>
    </div>
  );
}

export function SkeletonList({ count = 3, className }: SkeletonProps & { count?: number }) {
  return (
    <div className={cn("space-y-3", className)}>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}

export function SkeletonExercise() {
  return (
    <div className="p-4 rounded-2xl bg-card">
      <div className="flex items-center justify-between mb-3">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-6 w-6 rounded-full" />
      </div>
      <div className="space-y-2">
        <div className="flex gap-2">
          <Skeleton className="h-10 flex-1 rounded-lg" />
          <Skeleton className="h-10 flex-1 rounded-lg" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-10 flex-1 rounded-lg" />
          <Skeleton className="h-10 flex-1 rounded-lg" />
        </div>
      </div>
    </div>
  );
}

export function SkeletonMeal() {
  return (
    <div className="p-4 rounded-2xl bg-card">
      <div className="flex items-center gap-3">
        <Skeleton className="w-12 h-12 rounded-xl" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-3 w-1/3" />
        </div>
        <Skeleton className="w-8 h-8 rounded-full" />
      </div>
    </div>
  );
}

export function SkeletonStats() {
  return (
    <div className="space-y-4">
      {/* Chart skeleton */}
      <div className="p-4 rounded-2xl bg-card">
        <Skeleton className="h-5 w-24 mb-4" />
        <Skeleton className="h-48 w-full rounded-lg" />
      </div>
      {/* List skeleton */}
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-card">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="h-4 w-12" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function SkeletonGymList() {
  return (
    <div className="space-y-4 p-4">
      {Array.from({ length: 2 }).map((_, i) => (
        <div key={i} className="space-y-3">
          <div className="flex items-center gap-2">
            <Skeleton className="w-5 h-5 rounded" />
            <Skeleton className="h-5 w-24" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            {Array.from({ length: 4 }).map((_, j) => (
              <Skeleton key={j} className="h-24 rounded-2xl" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function SkeletonNutrition() {
  return (
    <div className="space-y-6 p-4">
      {/* Calorie ring skeleton */}
      <div className="flex justify-center">
        <Skeleton className="w-48 h-48 rounded-full" />
      </div>
      {/* Macro bars skeleton */}
      <div className="flex gap-4">
        <Skeleton className="h-16 flex-1 rounded-xl" />
        <Skeleton className="h-16 flex-1 rounded-xl" />
        <Skeleton className="h-16 flex-1 rounded-xl" />
      </div>
      {/* Meals skeleton */}
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <SkeletonMeal key={i} />
        ))}
      </div>
    </div>
  );
}

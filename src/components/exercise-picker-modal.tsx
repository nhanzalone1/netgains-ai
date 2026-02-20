"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { Search, Plus, X, Dumbbell, ChevronRight, ChevronDown } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import type { ExerciseTemplate } from "@/lib/supabase/types";

// Equipment badge colors
const EQUIPMENT_COLORS: Record<string, { bg: string; text: string }> = {
  barbell: { bg: "rgba(99, 102, 241, 0.2)", text: "#818cf8" },
  dumbbell: { bg: "rgba(34, 197, 94, 0.2)", text: "#4ade80" },
  cable: { bg: "rgba(249, 115, 22, 0.2)", text: "#fb923c" },
  machine: { bg: "rgba(14, 165, 233, 0.2)", text: "#38bdf8" },
  smith: { bg: "rgba(255, 71, 87, 0.2)", text: "#ff4757" },
  bodyweight: { bg: "rgba(168, 85, 247, 0.2)", text: "#a855f7" },
  plate: { bg: "rgba(234, 179, 8, 0.2)", text: "#eab308" },
};

// Equipment order for section display
const EQUIPMENT_ORDER = ["barbell", "dumbbell", "cable", "machine", "plate", "bodyweight", "smith"];

// All muscle groups
const ALL_MUSCLE_GROUPS = ["Chest", "Back", "Shoulders", "Arms", "Legs", "Core"];

// Keywords for muscle group categorization
const MUSCLE_KEYWORDS: Record<string, string[]> = {
  Chest: ["bench", "fly", "chest", "pec", "pushup", "push-up", "incline press", "decline press"],
  Back: ["row", "pull", "lat", "pulldown", "pullup", "pull-up", "deadlift", "back", "shrug"],
  Shoulders: ["shoulder", "ohp", "overhead press", "lateral raise", "front raise", "rear delt", "delt", "military"],
  Legs: ["squat", "leg", "lunge", "calf", "quad", "hamstring", "glute", "hip", "rdl"],
  Arms: ["curl", "tricep", "bicep", "arm", "pushdown", "hammer", "preacher", "skull", "dip", "extension"],
  Core: ["ab", "core", "plank", "crunch", "sit-up", "situp", "oblique", "hanging leg", "cable crunch"],
};

// Parse workout name to determine relevant muscle groups
const getContextualTabs = (workoutName: string): string[] => {
  const name = workoutName.toLowerCase();
  const relevantGroups: string[] = [];

  // Check for specific patterns
  if (name.includes("push")) {
    relevantGroups.push("Chest", "Shoulders", "Arms");
  } else if (name.includes("pull")) {
    relevantGroups.push("Back", "Arms");
  } else if (name.includes("upper")) {
    relevantGroups.push("Chest", "Back", "Shoulders", "Arms");
  } else if (name.includes("lower")) {
    relevantGroups.push("Legs", "Core");
  } else {
    // Check for individual muscle group keywords
    if (name.includes("chest") || name.includes("pec")) {
      relevantGroups.push("Chest");
    }
    if (name.includes("back") || name.includes("lat")) {
      relevantGroups.push("Back");
    }
    if (name.includes("shoulder") || name.includes("delt")) {
      relevantGroups.push("Shoulders");
    }
    if (name.includes("arm") || name.includes("bicep") || name.includes("tricep")) {
      relevantGroups.push("Arms");
    }
    if (name.includes("leg") || name.includes("quad") || name.includes("hamstring") || name.includes("glute")) {
      relevantGroups.push("Legs");
    }
    if (name.includes("core") || name.includes("ab")) {
      relevantGroups.push("Core");
    }
    // Add Legs -> Core association (common pairing)
    if (relevantGroups.includes("Legs") && !relevantGroups.includes("Core")) {
      relevantGroups.push("Core");
    }
  }

  // If no specific groups found, show all
  if (relevantGroups.length === 0) {
    return ["Recent", ...ALL_MUSCLE_GROUPS, "All"];
  }

  // Return: Recent + relevant groups + All
  return ["Recent", ...relevantGroups, "All"];
};

const categorizeExercise = (name: string): string => {
  const lowerName = name.toLowerCase();
  for (const [group, keywords] of Object.entries(MUSCLE_KEYWORDS)) {
    if (keywords.some(kw => lowerName.includes(kw))) {
      return group;
    }
  }
  return "Other";
};

interface ExercisePickerModalProps {
  open: boolean;
  onClose: () => void;
  onSelect: (template: ExerciseTemplate) => void;
  onCreateNew: (data: { name: string; equipment: string }) => Promise<ExerciseTemplate | null>;
  userId: string;
  folderId: string;
  folderName?: string;
  title?: string;
  accentColor?: "purple" | "red";
}

export function ExercisePickerModal({
  open,
  onClose,
  onSelect,
  onCreateNew,
  userId,
  folderId,
  folderName = "",
}: ExercisePickerModalProps) {
  const supabase = createClient();
  const tabsRef = useRef<HTMLDivElement>(null);
  const isMountedRef = useRef(true);

  // Get contextual tabs based on folder name
  const contextualTabs = useMemo(() => getContextualTabs(folderName), [folderName]);

  // State
  const [exercises, setExercises] = useState<ExerciseTemplate[]>([]);
  const [recentExercises, setRecentExercises] = useState<ExerciseTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("Recent");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  // Create form state
  const [newName, setNewName] = useState("");
  const [newEquipment, setNewEquipment] = useState("barbell");
  const [creating, setCreating] = useState(false);

  // Track mount state for async operations
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Load exercises on mount
  useEffect(() => {
    if (open) {
      loadExercises();
      loadRecentExercises();
      setActiveTab("Recent");
      setSearchQuery("");
      setShowCreateForm(false);
      setNewName("");
      setNewEquipment("barbell");
    }
  }, [open, folderId]);

  const loadExercises = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("exercise_templates")
      .select("*")
      .eq("folder_id", folderId)
      .order("name", { ascending: true });

    // Check if component is still mounted before updating state
    if (!isMountedRef.current) return;
    setExercises((data || []) as ExerciseTemplate[]);
    setLoading(false);
  };

  const loadRecentExercises = async () => {
    // Get recent exercises from workout history
    const { data: recentWorkouts } = await supabase
      .from("exercises")
      .select(`
        name,
        workouts!inner (
          user_id,
          date
        )
      `)
      .eq("workouts.user_id", userId)
      .order("workouts(date)", { ascending: false })
      .limit(50);

    if (recentWorkouts) {
      // Get unique exercise names (most recent first)
      const uniqueNames = new Set<string>();
      const recentNames: string[] = [];
      recentWorkouts.forEach((ex) => {
        const nameLower = ex.name.toLowerCase();
        if (!uniqueNames.has(nameLower)) {
          uniqueNames.add(nameLower);
          recentNames.push(ex.name);
        }
      });

      // Match with templates
      const { data: templates } = await supabase
        .from("exercise_templates")
        .select("*")
        .eq("folder_id", folderId);

      if (templates && isMountedRef.current) {
        const matched = recentNames.slice(0, 8).map(name =>
          templates.find(t => t.name.toLowerCase() === name.toLowerCase())
        ).filter(Boolean) as ExerciseTemplate[];
        setRecentExercises(matched);
      }
    }
  };

  // Filter and group exercises
  const filteredExercises = useMemo(() => {
    let filtered = exercises;

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = exercises.filter((ex) =>
        ex.name.toLowerCase().includes(query) ||
        ex.equipment.toLowerCase().includes(query)
      );
    }

    // Apply muscle group filter
    if (activeTab === "Recent") {
      return recentExercises;
    } else if (activeTab !== "All") {
      filtered = filtered.filter(ex => categorizeExercise(ex.name) === activeTab);
    }

    return filtered;
  }, [exercises, recentExercises, searchQuery, activeTab]);

  // Group exercises by equipment (for single muscle group tabs)
  const groupedExercises = useMemo(() => {
    const groups: Record<string, ExerciseTemplate[]> = {};

    filteredExercises.forEach(ex => {
      const equip = ex.equipment.toLowerCase();
      if (!groups[equip]) groups[equip] = [];
      groups[equip].push(ex);
    });

    // Sort by equipment order
    return EQUIPMENT_ORDER
      .filter(eq => groups[eq]?.length > 0)
      .map(eq => ({
        equipment: eq,
        exercises: groups[eq].sort((a, b) => a.name.localeCompare(b.name))
      }));
  }, [filteredExercises]);

  // Group exercises by muscle group (for "All" tab)
  const groupedByMuscle = useMemo(() => {
    if (activeTab !== "All") return [];

    let filtered = exercises;

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = exercises.filter((ex) =>
        ex.name.toLowerCase().includes(query) ||
        ex.equipment.toLowerCase().includes(query)
      );
    }

    const muscleGroups: Record<string, ExerciseTemplate[]> = {};

    filtered.forEach(ex => {
      const group = categorizeExercise(ex.name);
      if (!muscleGroups[group]) muscleGroups[group] = [];
      muscleGroups[group].push(ex);
    });

    // Return in order, including "Other"
    return [...ALL_MUSCLE_GROUPS, "Other"]
      .filter(group => muscleGroups[group]?.length > 0)
      .map(group => ({
        muscleGroup: group,
        exercises: muscleGroups[group].sort((a, b) => a.name.localeCompare(b.name))
      }));
  }, [exercises, searchQuery, activeTab]);

  // Toggle muscle group collapse
  const toggleMuscleGroup = (group: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(group)) {
        next.delete(group);
      } else {
        next.add(group);
      }
      return next;
    });
  };

  // Handle selecting an exercise
  const handleSelect = (template: ExerciseTemplate) => {
    onSelect(template);
    onClose();
  };

  // Handle creating new exercise
  const handleCreate = async () => {
    if (!newName.trim()) return;

    setCreating(true);
    const result = await onCreateNew({
      name: newName.trim(),
      equipment: newEquipment,
    });

    setCreating(false);

    if (result) {
      setExercises((prev) => [...prev, result]);
      onSelect(result);
      onClose();
    }
  };

  const getEquipmentStyle = (equipment: string) => {
    return EQUIPMENT_COLORS[equipment.toLowerCase()] || EQUIPMENT_COLORS.barbell;
  };

  const formatEquipment = (equipment: string) => {
    if (equipment === "bodyweight") return "BW";
    return equipment.charAt(0).toUpperCase() + equipment.slice(1);
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[200]"
          style={{ background: "#0d1117" }}
        >
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            className="h-full flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-4 border-b border-white/10">
              <button
                onClick={onClose}
                className="text-[#22d3ee] font-medium min-w-[60px]"
              >
                Cancel
              </button>
              <h1 className="text-lg font-bold text-white">Exercise Library</h1>
              <button className="text-[#22d3ee] font-medium min-w-[60px] text-right">
                Edit
              </button>
            </div>

            {/* Hidden focus capture */}
            <button className="sr-only" tabIndex={0} aria-hidden="true" />

            {/* Search Bar */}
            <div className="px-4 py-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search exercises..."
                  className="w-full rounded-xl pl-10 pr-10 py-3 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#22d3ee] min-h-[44px]"
                  style={{ background: "rgba(255, 255, 255, 0.08)" }}
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            {/* Filter Tabs */}
            <div
              ref={tabsRef}
              className="flex gap-2 px-4 pb-3 overflow-x-auto scrollbar-hide"
              style={{ WebkitOverflowScrolling: "touch" }}
            >
              {contextualTabs.map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                    activeTab === tab
                      ? "bg-[#22d3ee] text-black"
                      : "bg-white/10 text-gray-400 hover:text-white"
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>

            {/* Exercise List */}
            <div className="flex-1 overflow-y-auto px-4">
              {loading ? (
                <div className="flex items-center justify-center py-16">
                  <div className="w-8 h-8 border-2 border-[#22d3ee] border-t-transparent rounded-full animate-spin" />
                </div>
              ) : showCreateForm ? (
                /* Create Form */
                <div className="py-4 space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-400 mb-2 uppercase tracking-wide">
                      Exercise Name
                    </label>
                    <input
                      type="text"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      placeholder="e.g., Incline Press"
                      className="w-full rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#22d3ee] min-h-[44px]"
                      style={{ background: "rgba(255, 255, 255, 0.08)" }}
                      autoFocus
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-400 mb-3 uppercase tracking-wide">
                      Equipment
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {EQUIPMENT_ORDER.map((equip) => {
                        const style = getEquipmentStyle(equip);
                        const isActive = newEquipment === equip;
                        return (
                          <button
                            key={equip}
                            onClick={() => setNewEquipment(equip)}
                            className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
                              isActive ? "ring-2 ring-offset-2 ring-offset-[#0d1117]" : ""
                            }`}
                            style={{
                              background: style.bg,
                              color: style.text,
                              ringColor: isActive ? style.text : undefined,
                            }}
                          >
                            {formatEquipment(equip)}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="flex gap-3 pt-2">
                    <button
                      onClick={() => setShowCreateForm(false)}
                      className="flex-1 py-3 rounded-xl font-semibold text-gray-400 bg-white/10"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleCreate}
                      disabled={!newName.trim() || creating}
                      className="flex-1 py-3 rounded-xl font-semibold text-black bg-[#22d3ee] disabled:opacity-50"
                    >
                      {creating ? "Creating..." : "Create & Add"}
                    </button>
                  </div>
                </div>
              ) : filteredExercises.length === 0 ? (
                <div className="text-center py-16">
                  <Dumbbell className="w-12 h-12 mx-auto mb-3 text-gray-600" />
                  <p className="text-gray-400 mb-1">
                    {searchQuery ? "No exercises match your search" : activeTab === "Recent" ? "No recent exercises" : "No exercises in this category"}
                  </p>
                  <button
                    onClick={() => setShowCreateForm(true)}
                    className="mt-2 text-[#22d3ee] font-medium"
                  >
                    Create one →
                  </button>
                </div>
              ) : activeTab === "Recent" ? (
                /* Recent - flat list */
                <div className="space-y-2 pb-4">
                  {filteredExercises.map((exercise) => {
                    const equipStyle = getEquipmentStyle(exercise.equipment);
                    return (
                      <button
                        key={exercise.id}
                        onClick={() => handleSelect(exercise)}
                        className="w-full p-4 rounded-xl flex items-center justify-between text-left transition-colors hover:bg-white/5"
                        style={{ background: "rgba(255, 255, 255, 0.03)" }}
                      >
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-white truncate">{exercise.name}</p>
                          <p className="text-xs text-gray-500 capitalize">{exercise.equipment}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span
                            className="px-2.5 py-1 rounded-full text-xs font-semibold"
                            style={{ background: equipStyle.bg, color: equipStyle.text }}
                          >
                            {formatEquipment(exercise.equipment)}
                          </span>
                          <ChevronRight className="w-4 h-4 text-gray-600" />
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : activeTab === "All" ? (
                /* All - grouped by muscle group with collapsible sections */
                <div className="space-y-4 pb-4">
                  {groupedByMuscle.map(({ muscleGroup, exercises: muscleExercises }) => {
                    const isCollapsed = collapsedGroups.has(muscleGroup);
                    return (
                      <div key={muscleGroup}>
                        <button
                          onClick={() => toggleMuscleGroup(muscleGroup)}
                          className="w-full flex items-center justify-between py-2 px-1"
                        >
                          <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                            {muscleGroup}
                            <span className="ml-2 text-xs font-normal text-gray-500">
                              ({muscleExercises.length})
                            </span>
                          </h3>
                          <ChevronDown
                            className={`w-4 h-4 text-gray-500 transition-transform ${
                              isCollapsed ? "-rotate-90" : ""
                            }`}
                          />
                        </button>
                        {!isCollapsed && (
                          <div className="space-y-2 mt-1">
                            {muscleExercises.map(exercise => {
                              const equipStyle = getEquipmentStyle(exercise.equipment);
                              return (
                                <button
                                  key={exercise.id}
                                  onClick={() => handleSelect(exercise)}
                                  className="w-full p-4 rounded-xl flex items-center justify-between text-left transition-colors hover:bg-white/5"
                                  style={{ background: "rgba(255, 255, 255, 0.03)" }}
                                >
                                  <div className="flex-1 min-w-0">
                                    <p className="font-semibold text-white truncate">{exercise.name}</p>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span
                                      className="px-2.5 py-1 rounded-full text-xs font-semibold"
                                      style={{ background: equipStyle.bg, color: equipStyle.text }}
                                    >
                                      {formatEquipment(exercise.equipment)}
                                    </span>
                                    <ChevronRight className="w-4 h-4 text-gray-600" />
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                /* Grouped by equipment (single muscle group tab) */
                <div className="space-y-6 pb-4">
                  {groupedExercises.map(group => {
                    const equipStyle = getEquipmentStyle(group.equipment);
                    return (
                      <div key={group.equipment}>
                        <h3
                          className="text-xs font-bold uppercase tracking-wider mb-2 px-1"
                          style={{ color: equipStyle.text }}
                        >
                          {formatEquipment(group.equipment)}
                        </h3>
                        <div className="space-y-2">
                          {group.exercises.map(exercise => (
                            <button
                              key={exercise.id}
                              onClick={() => handleSelect(exercise)}
                              className="w-full p-4 rounded-xl flex items-center justify-between text-left transition-colors hover:bg-white/5"
                              style={{ background: "rgba(255, 255, 255, 0.03)" }}
                            >
                              <div className="flex-1 min-w-0">
                                <p className="font-semibold text-white truncate">{exercise.name}</p>
                              </div>
                              <div className="flex items-center gap-2">
                                <span
                                  className="px-2.5 py-1 rounded-full text-xs font-semibold"
                                  style={{ background: equipStyle.bg, color: equipStyle.text }}
                                >
                                  {formatEquipment(exercise.equipment)}
                                </span>
                                <ChevronRight className="w-4 h-4 text-gray-600" />
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Create New Exercise Button */}
            {!showCreateForm && (
              <div className="px-4 py-4 border-t border-white/10">
                <button
                  onClick={() => setShowCreateForm(true)}
                  className="w-full py-4 rounded-xl flex items-center justify-center gap-2 font-semibold text-[#22d3ee] transition-colors hover:bg-white/5"
                  style={{
                    border: "2px dashed rgba(34, 211, 238, 0.3)",
                    background: "rgba(34, 211, 238, 0.05)"
                  }}
                >
                  <Plus className="w-5 h-5" />
                  Create New Exercise
                </button>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

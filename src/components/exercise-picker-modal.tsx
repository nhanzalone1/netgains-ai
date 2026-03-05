"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { Search, Plus, X, Dumbbell, ChevronRight, ChevronDown, Trash2, Pencil } from "lucide-react";
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

// Detailed muscle groups for categorization
const DETAILED_MUSCLE_GROUPS = [
  "chest",
  "front_delt",
  "side_delt",
  "rear_delt",
  "lats",
  "upper_back",
  "biceps",
  "triceps",
  "quads",
  "hamstrings",
  "glutes",
  "calves",
  "core",
  "other",
] as const;

type MuscleGroup = typeof DETAILED_MUSCLE_GROUPS[number];

// Display names for muscle groups
const MUSCLE_GROUP_DISPLAY: Record<MuscleGroup, string> = {
  chest: "Chest",
  front_delt: "Front Delt",
  side_delt: "Side Delt",
  rear_delt: "Rear Delt",
  lats: "Lats",
  upper_back: "Upper Back",
  biceps: "Biceps",
  triceps: "Triceps",
  quads: "Quads",
  hamstrings: "Hamstrings",
  glutes: "Glutes",
  calves: "Calves",
  core: "Core",
  other: "Other",
};

// Extended exercise template type with muscle_group
interface ExerciseWithMuscleGroup extends ExerciseTemplate {
  muscle_group?: MuscleGroup | null;
}

interface ExercisePickerModalProps {
  open: boolean;
  onClose: () => void;
  onSelect: (template: ExerciseTemplate) => void;
  onCreateNew: (data: { name: string; equipment: string; muscle_group?: string }) => Promise<ExerciseTemplate | null>;
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

  // State
  const [exercises, setExercises] = useState<ExerciseWithMuscleGroup[]>([]);
  const [recentExercises, setRecentExercises] = useState<ExerciseWithMuscleGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("Recent");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  // Split-based tabs
  const [splitTabs, setSplitTabs] = useState<string[]>(["Recent", "All"]);
  const [splitMapping, setSplitMapping] = useState<Record<string, MuscleGroup[]>>({});

  // Create form state
  const [newName, setNewName] = useState("");
  const [newEquipment, setNewEquipment] = useState("barbell");
  const [newMuscleGroup, setNewMuscleGroup] = useState<MuscleGroup | "">("");
  const [aiSuggestedGroup, setAiSuggestedGroup] = useState<MuscleGroup | null>(null);
  const [creating, setCreating] = useState(false);
  const [categorizingNew, setCategorizingNew] = useState(false);

  // Edit mode state
  const [editMode, setEditMode] = useState(false);
  const [editingExercise, setEditingExercise] = useState<ExerciseWithMuscleGroup | null>(null);
  const [editName, setEditName] = useState("");
  const [editEquipment, setEditEquipment] = useState("");
  const [editMuscleGroup, setEditMuscleGroup] = useState<MuscleGroup | "">("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Track mount state for async operations
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Load split rotation and parse into tabs
  useEffect(() => {
    if (open) {
      loadSplitTabs();
    }
  }, [open, userId]);

  const loadSplitTabs = async () => {
    // Fetch user's split rotation from coach_memory
    const { data: splitData } = await supabase
      .from("coach_memory")
      .select("value")
      .eq("user_id", userId)
      .eq("key", "split_rotation")
      .single();

    if (!splitData?.value) {
      // No split defined, use folder name for context
      setSplitTabs(["Recent", folderName || "All", "All"]);
      return;
    }

    try {
      const splitRotation = JSON.parse(splitData.value) as string[];
      // Filter out "Rest" days
      const trainingDays = splitRotation.filter(day => day.toLowerCase() !== "rest");

      if (trainingDays.length === 0) {
        setSplitTabs(["Recent", "All"]);
        return;
      }

      // Call API to parse split days into muscle groups
      const response = await fetch("/api/exercise/parse-split", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ splitDays: trainingDays }),
      });

      if (response.ok) {
        const { mapping } = await response.json();
        setSplitMapping(mapping);
        setSplitTabs(["Recent", ...trainingDays, "All"]);
      } else {
        // Fallback to simple tabs
        setSplitTabs(["Recent", ...trainingDays, "All"]);
      }
    } catch {
      setSplitTabs(["Recent", "All"]);
    }
  };

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
      setNewMuscleGroup("");
      setAiSuggestedGroup(null);
      setEditMode(false);
      setEditingExercise(null);
    }
  }, [open, folderId]);

  const loadExercises = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("exercise_templates")
      .select("*")
      .eq("folder_id", folderId)
      .order("name", { ascending: true });

    if (!isMountedRef.current) return;
    setExercises((data || []) as ExerciseWithMuscleGroup[]);
    setLoading(false);
  };

  const loadRecentExercises = async () => {
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
      const uniqueNames = new Set<string>();
      const recentNames: string[] = [];
      recentWorkouts.forEach((ex) => {
        const nameLower = ex.name.toLowerCase();
        if (!uniqueNames.has(nameLower)) {
          uniqueNames.add(nameLower);
          recentNames.push(ex.name);
        }
      });

      const { data: templates } = await supabase
        .from("exercise_templates")
        .select("*")
        .eq("folder_id", folderId);

      if (templates && isMountedRef.current) {
        const matched = recentNames.slice(0, 8).map(name =>
          templates.find(t => t.name.toLowerCase() === name.toLowerCase())
        ).filter(Boolean) as ExerciseWithMuscleGroup[];
        setRecentExercises(matched);
      }
    }
  };

  // Get muscle groups for the active tab
  const getActiveMuscleGroups = (): MuscleGroup[] | null => {
    if (activeTab === "Recent" || activeTab === "All") return null;
    return splitMapping[activeTab] || null;
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

    // Apply muscle group filter based on tab
    if (activeTab === "Recent") {
      return recentExercises;
    } else if (activeTab !== "All") {
      const muscleGroups = getActiveMuscleGroups();
      if (muscleGroups && muscleGroups.length > 0) {
        filtered = filtered.filter(ex =>
          ex.muscle_group && muscleGroups.includes(ex.muscle_group)
        );
      }
    }

    return filtered;
  }, [exercises, recentExercises, searchQuery, activeTab, splitMapping]);

  // Group exercises by equipment (for single muscle group tabs)
  const groupedExercises = useMemo(() => {
    const groups: Record<string, ExerciseWithMuscleGroup[]> = {};

    filteredExercises.forEach(ex => {
      const equip = ex.equipment.toLowerCase();
      if (!groups[equip]) groups[equip] = [];
      groups[equip].push(ex);
    });

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

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = exercises.filter((ex) =>
        ex.name.toLowerCase().includes(query) ||
        ex.equipment.toLowerCase().includes(query)
      );
    }

    const muscleGroups: Record<string, ExerciseWithMuscleGroup[]> = {};

    filtered.forEach(ex => {
      const group = ex.muscle_group || "other";
      if (!muscleGroups[group]) muscleGroups[group] = [];
      muscleGroups[group].push(ex);
    });

    return DETAILED_MUSCLE_GROUPS
      .filter(group => muscleGroups[group]?.length > 0)
      .map(group => ({
        muscleGroup: group,
        displayName: MUSCLE_GROUP_DISPLAY[group],
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

  // AI categorization when typing exercise name
  const handleNameChange = async (name: string) => {
    setNewName(name);
    setAiSuggestedGroup(null);

    // Debounce: only categorize if name is long enough
    if (name.trim().length >= 3) {
      setCategorizingNew(true);
      try {
        const response = await fetch("/api/exercise/categorize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ exerciseName: name.trim() }),
        });

        if (response.ok) {
          const { muscleGroup } = await response.json();
          if (isMountedRef.current) {
            setAiSuggestedGroup(muscleGroup);
            // Auto-select if user hasn't manually chosen
            if (!newMuscleGroup) {
              setNewMuscleGroup(muscleGroup);
            }
          }
        }
      } catch (error) {
        console.error("Failed to categorize exercise:", error);
      }
      if (isMountedRef.current) {
        setCategorizingNew(false);
      }
    }
  };

  // Handle creating new exercise
  const handleCreate = async () => {
    if (!newName.trim()) return;

    setCreating(true);
    const result = await onCreateNew({
      name: newName.trim(),
      equipment: newEquipment,
      muscle_group: newMuscleGroup || aiSuggestedGroup || undefined,
    });

    setCreating(false);

    if (result) {
      setExercises((prev) => [...prev, result as ExerciseWithMuscleGroup]);
      onSelect(result);
      onClose();
    }
  };

  // Handle deleting an exercise
  const handleDelete = async (exerciseId: string) => {
    setDeletingId(exerciseId);
    try {
      const { error } = await supabase
        .from("exercise_templates")
        .delete()
        .eq("id", exerciseId);

      if (!error) {
        setExercises((prev) => prev.filter((e) => e.id !== exerciseId));
        setRecentExercises((prev) => prev.filter((e) => e.id !== exerciseId));
      }
    } catch (error) {
      console.error("Failed to delete exercise:", error);
    }
    setDeletingId(null);
  };

  // Handle opening edit modal for an exercise
  const handleEditExercise = (exercise: ExerciseWithMuscleGroup) => {
    setEditingExercise(exercise);
    setEditName(exercise.name);
    setEditEquipment(exercise.equipment);
    setEditMuscleGroup(exercise.muscle_group || "");
  };

  // Handle saving edited exercise
  const handleSaveEdit = async () => {
    if (!editingExercise || !editName.trim()) return;

    setSavingEdit(true);
    try {
      const { error } = await supabase
        .from("exercise_templates")
        .update({
          name: editName.trim(),
          equipment: editEquipment,
          muscle_group: editMuscleGroup || null,
        })
        .eq("id", editingExercise.id);

      if (!error) {
        setExercises((prev) =>
          prev.map((e) =>
            e.id === editingExercise.id
              ? { ...e, name: editName.trim(), equipment: editEquipment, muscle_group: editMuscleGroup || null }
              : e
          )
        );
        setRecentExercises((prev) =>
          prev.map((e) =>
            e.id === editingExercise.id
              ? { ...e, name: editName.trim(), equipment: editEquipment, muscle_group: editMuscleGroup || null }
              : e
          )
        );
        setEditingExercise(null);
      }
    } catch (error) {
      console.error("Failed to update exercise:", error);
    }
    setSavingEdit(false);
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
                onClick={() => {
                  if (editMode) {
                    setEditMode(false);
                  } else {
                    onClose();
                  }
                }}
                className="text-[#22d3ee] font-medium min-w-[60px]"
              >
                {editMode ? "Done" : "Cancel"}
              </button>
              <h1 className="text-lg font-bold text-white">Exercise Library</h1>
              <button
                onClick={() => setEditMode(!editMode)}
                className="text-[#22d3ee] font-medium min-w-[60px] text-right"
              >
                {editMode ? "Cancel" : "Edit"}
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

            {/* Filter Tabs - Dynamic from split rotation */}
            <div
              ref={tabsRef}
              className="flex gap-2 px-4 pb-3 overflow-x-auto scrollbar-hide"
              style={{ WebkitOverflowScrolling: "touch" }}
            >
              {splitTabs.map(tab => (
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
                      onChange={(e) => handleNameChange(e.target.value)}
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

                  {/* Muscle Group Selection */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-400 mb-3 uppercase tracking-wide">
                      Muscle Group
                      {categorizingNew && (
                        <span className="ml-2 text-[#22d3ee]">detecting...</span>
                      )}
                      {aiSuggestedGroup && !categorizingNew && (
                        <span className="ml-2 text-green-400">
                          AI suggests: {MUSCLE_GROUP_DISPLAY[aiSuggestedGroup]}
                        </span>
                      )}
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {DETAILED_MUSCLE_GROUPS.map((group) => {
                        const isActive = newMuscleGroup === group;
                        const isSuggested = aiSuggestedGroup === group && !newMuscleGroup;
                        return (
                          <button
                            key={group}
                            onClick={() => setNewMuscleGroup(group)}
                            className={`px-3 py-2 rounded-full text-sm font-medium transition-all ${
                              isActive
                                ? "bg-[#22d3ee] text-black"
                                : isSuggested
                                ? "bg-green-500/20 text-green-400 ring-1 ring-green-500/50"
                                : "bg-white/10 text-gray-400 hover:text-white"
                            }`}
                          >
                            {MUSCLE_GROUP_DISPLAY[group]}
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
                      <div
                        key={exercise.id}
                        className="w-full p-4 rounded-xl flex items-center justify-between text-left transition-colors hover:bg-white/5"
                        style={{ background: "rgba(255, 255, 255, 0.03)" }}
                      >
                        {editMode && (
                          <button
                            onClick={() => handleDelete(exercise.id)}
                            disabled={deletingId === exercise.id}
                            className="mr-3 w-8 h-8 rounded-full flex items-center justify-center bg-red-500/20 text-red-400 hover:bg-red-500/30 disabled:opacity-50"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          onClick={() => editMode ? handleEditExercise(exercise) : handleSelect(exercise)}
                          className="flex-1 min-w-0 text-left flex items-center justify-between"
                        >
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-white truncate">{exercise.name}</p>
                            <p className="text-xs text-gray-500 capitalize">
                              {exercise.equipment}
                              {exercise.muscle_group && ` · ${MUSCLE_GROUP_DISPLAY[exercise.muscle_group]}`}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span
                              className="px-2.5 py-1 rounded-full text-xs font-semibold"
                              style={{ background: equipStyle.bg, color: equipStyle.text }}
                            >
                              {formatEquipment(exercise.equipment)}
                            </span>
                            {editMode ? (
                              <Pencil className="w-4 h-4 text-gray-500" />
                            ) : (
                              <ChevronRight className="w-4 h-4 text-gray-600" />
                            )}
                          </div>
                        </button>
                      </div>
                    );
                  })}
                </div>
              ) : activeTab === "All" ? (
                /* All - grouped by muscle group with collapsible sections */
                <div className="space-y-4 pb-4">
                  {groupedByMuscle.map(({ muscleGroup, displayName, exercises: muscleExercises }) => {
                    const isCollapsed = collapsedGroups.has(muscleGroup);
                    return (
                      <div key={muscleGroup}>
                        <button
                          onClick={() => toggleMuscleGroup(muscleGroup)}
                          className="w-full flex items-center justify-between py-2 px-1"
                        >
                          <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                            {displayName}
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
                                <div
                                  key={exercise.id}
                                  className="w-full p-4 rounded-xl flex items-center justify-between text-left transition-colors hover:bg-white/5"
                                  style={{ background: "rgba(255, 255, 255, 0.03)" }}
                                >
                                  {editMode && (
                                    <button
                                      onClick={() => handleDelete(exercise.id)}
                                      disabled={deletingId === exercise.id}
                                      className="mr-3 w-8 h-8 rounded-full flex items-center justify-center bg-red-500/20 text-red-400 hover:bg-red-500/30 disabled:opacity-50"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  )}
                                  <button
                                    onClick={() => editMode ? handleEditExercise(exercise) : handleSelect(exercise)}
                                    className="flex-1 min-w-0 text-left flex items-center justify-between"
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
                                      {editMode ? (
                                        <Pencil className="w-4 h-4 text-gray-500" />
                                      ) : (
                                        <ChevronRight className="w-4 h-4 text-gray-600" />
                                      )}
                                    </div>
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                /* Split day tab - grouped by equipment */
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
                            <div
                              key={exercise.id}
                              className="w-full p-4 rounded-xl flex items-center justify-between text-left transition-colors hover:bg-white/5"
                              style={{ background: "rgba(255, 255, 255, 0.03)" }}
                            >
                              {editMode && (
                                <button
                                  onClick={() => handleDelete(exercise.id)}
                                  disabled={deletingId === exercise.id}
                                  className="mr-3 w-8 h-8 rounded-full flex items-center justify-center bg-red-500/20 text-red-400 hover:bg-red-500/30 disabled:opacity-50"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                              <button
                                onClick={() => editMode ? handleEditExercise(exercise) : handleSelect(exercise)}
                                className="flex-1 min-w-0 text-left flex items-center justify-between"
                              >
                                <div className="flex-1 min-w-0">
                                  <p className="font-semibold text-white truncate">{exercise.name}</p>
                                  {exercise.muscle_group && (
                                    <p className="text-xs text-gray-500">
                                      {MUSCLE_GROUP_DISPLAY[exercise.muscle_group]}
                                    </p>
                                  )}
                                </div>
                                <div className="flex items-center gap-2">
                                  <span
                                    className="px-2.5 py-1 rounded-full text-xs font-semibold"
                                    style={{ background: equipStyle.bg, color: equipStyle.text }}
                                  >
                                    {formatEquipment(exercise.equipment)}
                                  </span>
                                  {editMode ? (
                                    <Pencil className="w-4 h-4 text-gray-500" />
                                  ) : (
                                    <ChevronRight className="w-4 h-4 text-gray-600" />
                                  )}
                                </div>
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Create New Exercise Button */}
            {!showCreateForm && !editMode && (
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

            {/* Edit Exercise Modal */}
            <AnimatePresence>
              {editingExercise && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
                  onClick={() => setEditingExercise(null)}
                >
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 10 }}
                    onClick={(e) => e.stopPropagation()}
                    className="w-full max-w-sm rounded-2xl p-6 border border-gray-800 max-h-[90vh] overflow-y-auto"
                    style={{ background: "#1a1a24" }}
                  >
                    <h2 className="text-lg font-bold text-white mb-4">Edit Exercise</h2>

                    {/* Exercise Name */}
                    <div className="mb-4">
                      <label className="block text-xs font-semibold text-gray-400 mb-2 uppercase tracking-wide">
                        Name
                      </label>
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="w-full rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#22d3ee] min-h-[44px]"
                        style={{ background: "rgba(255, 255, 255, 0.08)" }}
                      />
                    </div>

                    {/* Equipment Selection */}
                    <div className="mb-4">
                      <label className="block text-xs font-semibold text-gray-400 mb-3 uppercase tracking-wide">
                        Equipment
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {EQUIPMENT_ORDER.map((equip) => {
                          const style = getEquipmentStyle(equip);
                          const isActive = editEquipment === equip;
                          return (
                            <button
                              key={equip}
                              onClick={() => setEditEquipment(equip)}
                              className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
                                isActive ? "ring-2 ring-offset-2 ring-offset-[#1a1a24]" : ""
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

                    {/* Muscle Group Selection */}
                    <div className="mb-6">
                      <label className="block text-xs font-semibold text-gray-400 mb-3 uppercase tracking-wide">
                        Muscle Group
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {DETAILED_MUSCLE_GROUPS.map((group) => {
                          const isActive = editMuscleGroup === group;
                          return (
                            <button
                              key={group}
                              onClick={() => setEditMuscleGroup(group)}
                              className={`px-3 py-2 rounded-full text-sm font-medium transition-all ${
                                isActive
                                  ? "bg-[#22d3ee] text-black"
                                  : "bg-white/10 text-gray-400 hover:text-white"
                              }`}
                            >
                              {MUSCLE_GROUP_DISPLAY[group]}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Buttons */}
                    <div className="flex gap-3">
                      <button
                        onClick={() => setEditingExercise(null)}
                        className="flex-1 py-3 rounded-xl font-semibold text-gray-400 bg-white/10"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleSaveEdit}
                        disabled={!editName.trim() || savingEdit}
                        className="flex-1 py-3 rounded-xl font-semibold text-black bg-[#22d3ee] disabled:opacity-50"
                      >
                        {savingEdit ? "Saving..." : "Save"}
                      </button>
                    </div>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

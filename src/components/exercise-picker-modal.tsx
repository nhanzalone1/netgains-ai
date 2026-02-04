"use client";

import { useState, useEffect, useMemo } from "react";
import { Search, Plus, X, Dumbbell } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Modal } from "./ui/modal";
import { Button } from "./ui/button";
import { Chip } from "./ui/chip";
import { createClient } from "@/lib/supabase/client";
import type { ExerciseTemplate } from "@/lib/supabase/types";

// Equipment badge colors
const EQUIPMENT_COLORS: Record<string, { bg: string; text: string }> = {
  barbell: { bg: "rgba(99, 102, 241, 0.2)", text: "#818cf8" },
  dumbbell: { bg: "rgba(34, 197, 94, 0.2)", text: "#4ade80" },
  cable: { bg: "rgba(249, 115, 22, 0.2)", text: "#fb923c" },
  machine: { bg: "rgba(14, 165, 233, 0.2)", text: "#38bdf8" },
  smith: { bg: "rgba(255, 71, 87, 0.2)", text: "#ff4757" },
};

const DEFAULT_EQUIPMENT = [
  { value: "barbell", label: "Barbell" },
  { value: "dumbbell", label: "Dumbbell" },
  { value: "cable", label: "Cable" },
  { value: "machine", label: "Machine" },
  { value: "smith", label: "Smith" },
];

interface ExercisePickerModalProps {
  open: boolean;
  onClose: () => void;
  onSelect: (template: ExerciseTemplate) => void;
  onCreateNew: (data: { name: string; equipment: string }) => Promise<ExerciseTemplate | null>;
  userId: string;
  folderId: string;
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
  title = "Select Exercise",
  accentColor = "purple",
}: ExercisePickerModalProps) {
  const supabase = createClient();

  // Tabs: "library" or "create"
  const [activeTab, setActiveTab] = useState<"library" | "create">("library");

  // Library state
  const [exercises, setExercises] = useState<ExerciseTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  // Create form state
  const [newName, setNewName] = useState("");
  const [newEquipment, setNewEquipment] = useState("barbell");
  const [creating, setCreating] = useState(false);

  // Accent colors
  const colors = accentColor === "purple"
    ? { bg: "rgba(168, 85, 247, 0.15)", border: "#a855f7", text: "#a855f7" }
    : { bg: "rgba(239, 68, 68, 0.15)", border: "#ef4444", text: "#ef4444" };

  // Load exercises on mount
  useEffect(() => {
    if (open) {
      loadExercises();
      setActiveTab("library");
      setSearchQuery("");
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

    setExercises((data || []) as ExerciseTemplate[]);
    setLoading(false);
  };

  // Filtered exercises based on search
  const filteredExercises = useMemo(() => {
    if (!searchQuery.trim()) return exercises;
    const query = searchQuery.toLowerCase();
    return exercises.filter((ex) =>
      ex.name.toLowerCase().includes(query) ||
      ex.equipment.toLowerCase().includes(query)
    );
  }, [exercises, searchQuery]);

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
      // Add to local list
      setExercises((prev) => [...prev, result]);
      // Select it
      onSelect(result);
      onClose();
    }
  };

  const getEquipmentStyle = (equipment: string) => {
    return EQUIPMENT_COLORS[equipment] || EQUIPMENT_COLORS.barbell;
  };

  return (
    <Modal open={open} onClose={onClose} title={title}>
      <div className="space-y-4">
        {/* Tab Switcher */}
        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab("library")}
            className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
              activeTab === "library"
                ? "text-white"
                : "bg-muted/30 text-muted-foreground"
            }`}
            style={activeTab === "library" ? { background: colors.bg, color: colors.text } : undefined}
          >
            Library
          </button>
          <button
            onClick={() => setActiveTab("create")}
            className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
              activeTab === "create"
                ? "text-white"
                : "bg-muted/30 text-muted-foreground"
            }`}
            style={activeTab === "create" ? { background: colors.bg, color: colors.text } : undefined}
          >
            Create New
          </button>
        </div>

        {/* Library Tab */}
        {activeTab === "library" && (
          <div className="space-y-3">
            {/* Search Bar */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search exercises..."
                className="w-full bg-background/50 rounded-xl pl-10 pr-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary min-h-[44px]"
                autoFocus
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Exercise List */}
            <div className="max-h-[300px] overflow-y-auto space-y-2 -mx-1 px-1">
              {loading ? (
                <div className="text-center py-8 text-muted-foreground">
                  Loading...
                </div>
              ) : filteredExercises.length === 0 ? (
                <div className="text-center py-8">
                  <Dumbbell className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                  <p className="text-muted-foreground text-sm">
                    {searchQuery ? "No exercises match your search" : "No exercises in library"}
                  </p>
                  <button
                    onClick={() => setActiveTab("create")}
                    className="mt-2 text-sm font-semibold"
                    style={{ color: colors.text }}
                  >
                    Create one →
                  </button>
                </div>
              ) : (
                <AnimatePresence>
                  {filteredExercises.map((exercise) => {
                    const equipStyle = getEquipmentStyle(exercise.equipment);
                    return (
                      <motion.button
                        key={exercise.id}
                        initial={{ opacity: 0, y: -5 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        onClick={() => handleSelect(exercise)}
                        className="w-full p-3 rounded-xl flex items-center gap-3 text-left transition-colors hover:bg-white/5"
                        style={{
                          background: "rgba(26, 26, 36, 0.6)",
                          border: "1px solid rgba(255, 255, 255, 0.05)",
                        }}
                      >
                        <div
                          className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                          style={{ background: equipStyle.bg }}
                        >
                          <Dumbbell className="w-5 h-5" style={{ color: equipStyle.text }} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold truncate">{exercise.name}</p>
                          <p className="text-xs text-muted-foreground capitalize">
                            {exercise.equipment}
                          </p>
                        </div>
                        <Plus className="w-5 h-5 text-muted-foreground" />
                      </motion.button>
                    );
                  })}
                </AnimatePresence>
              )}
            </div>
          </div>
        )}

        {/* Create Tab */}
        {activeTab === "create" && (
          <div className="space-y-4">
            {/* Name Input */}
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">
                Exercise Name
              </label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g., Fly"
                className="w-full bg-background/50 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary min-h-[44px]"
                autoFocus
              />
            </div>

            {/* Equipment Chips */}
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wide">
                Equipment
              </label>
              <div className="flex flex-wrap gap-2">
                {DEFAULT_EQUIPMENT.map((opt) => (
                  <Chip
                    key={opt.value}
                    label={opt.label}
                    active={newEquipment === opt.value}
                    onClick={() => setNewEquipment(opt.value)}
                  />
                ))}
              </div>
            </div>

            {/* Create Button */}
            <Button
              onClick={handleCreate}
              loading={creating}
              disabled={!newName.trim()}
            >
              Create & Add
            </Button>
          </div>
        )}
      </div>
    </Modal>
  );
}

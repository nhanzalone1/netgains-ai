"use client";

import { useState } from "react";
import { Plus, Check, X } from "lucide-react";
import { motion } from "framer-motion";
import { Modal } from "./ui/modal";
import { Button } from "./ui/button";
import { Chip } from "./ui/chip";

// Default equipment options
const DEFAULT_EQUIPMENT = [
  { value: "barbell", label: "Barbell" },
  { value: "dumbbell", label: "Dumbbell" },
  { value: "cable", label: "Cable" },
  { value: "machine", label: "Machine" },
  { value: "smith", label: "Smith" },
];

// Helper to get display label for equipment
const getEquipmentLabel = (value: string): string => {
  const found = DEFAULT_EQUIPMENT.find((opt) => opt.value === value);
  if (found) return found.label;
  // For custom equipment, capitalize first letter
  return value.charAt(0).toUpperCase() + value.slice(1);
};

// Helper to remove any equipment tag from name
const removeEquipmentTag = (name: string, allEquipment: { value: string; label: string }[]): string => {
  const labels = allEquipment.map((o) => o.label).join("|");
  const tagPattern = new RegExp(`\\s*\\((${labels})\\)\\s*$`, "i");
  return name.replace(tagPattern, "").trim();
};

interface NewExerciseModalProps {
  open: boolean;
  onClose: () => void;
  onSave: (data: {
    name: string;
    equipment: string;
    exerciseType: "strength";
  }) => void;
  loading?: boolean;
}

export function NewExerciseModal({
  open,
  onClose,
  onSave,
  loading = false,
}: NewExerciseModalProps) {
  const [name, setName] = useState("");
  const [equipment, setEquipment] = useState("barbell");
  const [customEquipment, setCustomEquipment] = useState<{ value: string; label: string }[]>([]);
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [customTagInput, setCustomTagInput] = useState("");

  // Combined equipment list (default + custom)
  const allEquipment = [...DEFAULT_EQUIPMENT, ...customEquipment];

  const handleEquipmentClick = (newEquipment: string) => {
    const oldEquipment = equipment;
    setEquipment(newEquipment);

    // Get the base name without any equipment tag
    const baseName = removeEquipmentTag(name, allEquipment);

    if (!baseName) return; // Don't add tag if name is empty

    if (newEquipment === oldEquipment) {
      // Clicking the same chip - toggle off the tag
      setName(baseName);
    } else {
      // Clicking a different chip - update the tag
      const newLabel = getEquipmentLabel(newEquipment);
      setName(`${baseName} (${newLabel})`);
    }
  };

  const handleAddCustomTag = () => {
    const trimmed = customTagInput.trim();
    if (!trimmed) return;

    // Create value (lowercase, no spaces) and label (capitalized)
    const value = trimmed.toLowerCase().replace(/\s+/g, "-");
    const label = trimmed.charAt(0).toUpperCase() + trimmed.slice(1);

    // Check if already exists
    const exists = allEquipment.some(
      (e) => e.value === value || e.label.toLowerCase() === label.toLowerCase()
    );

    if (!exists) {
      setCustomEquipment((prev) => [...prev, { value, label }]);
    }

    // Select the new/existing tag
    setEquipment(value);
    setCustomTagInput("");
    setShowCustomInput(false);

    // Update name with tag if name exists
    const baseName = removeEquipmentTag(name, allEquipment);
    if (baseName) {
      setName(`${baseName} (${label})`);
    }
  };

  const handleCustomInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAddCustomTag();
    } else if (e.key === "Escape") {
      setShowCustomInput(false);
      setCustomTagInput("");
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    // Send with whatever equipment is selected (default or custom)
    onSave({ name: name.trim(), equipment, exerciseType: "strength" });
    setName("");
    setEquipment("barbell");
  };

  const handleClose = () => {
    setName("");
    setEquipment("barbell");
    setShowCustomInput(false);
    setCustomTagInput("");
    onClose();
  };

  return (
    <Modal open={open} onClose={handleClose} title="New Exercise">
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Name Input */}
        <div>
          <label className="block text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">
            Exercise Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Incline Press"
            className="w-full bg-background/50 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary min-h-[44px]"
            autoFocus
          />
        </div>

        {/* Equipment Chips */}
        <div>
          <label className="block text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wide">
            Equipment
          </label>

          {showCustomInput ? (
            /* Custom Tag Input Mode */
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={customTagInput}
                onChange={(e) => setCustomTagInput(e.target.value)}
                onKeyDown={handleCustomInputKeyDown}
                placeholder="Custom tag..."
                className="flex-1 bg-background/50 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary min-h-[44px]"
                autoFocus
              />
              <motion.button
                type="button"
                whileTap={{ scale: 0.95 }}
                onClick={handleAddCustomTag}
                disabled={!customTagInput.trim()}
                className="w-11 h-11 rounded-xl flex items-center justify-center bg-primary text-primary-foreground disabled:opacity-50"
              >
                <Check className="w-5 h-5" />
              </motion.button>
              <motion.button
                type="button"
                whileTap={{ scale: 0.95 }}
                onClick={() => {
                  setShowCustomInput(false);
                  setCustomTagInput("");
                }}
                className="w-11 h-11 rounded-xl flex items-center justify-center bg-muted/50 text-muted-foreground"
              >
                <X className="w-5 h-5" />
              </motion.button>
            </div>
          ) : (
            /* Normal Chip Selection Mode */
            <div className="flex flex-wrap gap-2">
              {allEquipment.map((opt) => (
                <Chip
                  key={opt.value}
                  label={opt.label}
                  active={equipment === opt.value}
                  onClick={() => handleEquipmentClick(opt.value)}
                />
              ))}
              {/* Add Custom Tag Button */}
              <motion.button
                type="button"
                whileTap={{ scale: 0.95 }}
                onClick={() => setShowCustomInput(true)}
                className="w-10 h-10 rounded-full flex items-center justify-center border-2 border-dashed border-muted-foreground/30 text-muted-foreground hover:border-primary hover:text-primary transition-colors"
              >
                <Plus className="w-4 h-4" />
              </motion.button>
            </div>
          )}

          <p className="text-xs text-muted-foreground mt-2">
            {showCustomInput
              ? "Type a custom tag and press Enter"
              : "Tap to auto-tag • Tap + for custom"}
          </p>
        </div>

        {/* Submit Button */}
        <Button type="submit" loading={loading} disabled={!name.trim()}>
          Add Exercise
        </Button>
      </form>
    </Modal>
  );
}

"use client";

import { useState, useEffect } from "react";
import { Brain, Activity, Apple, AlertTriangle, Heart, History, Loader2, Dumbbell } from "lucide-react";
import { motion } from "framer-motion";
import { Sheet } from "./ui/sheet";
import { MEMORY_CATEGORIES, MemoryCategory } from "@/lib/constants";
import { apiFetch } from "@/lib/capacitor";

interface Memory {
  id: string;
  fact: string;
  category: MemoryCategory;
  importance: number;
  extracted_at: string;
}

interface CoachMemoriesSheetProps {
  isOpen: boolean;
  onClose: () => void;
}

const categoryIcons: Record<MemoryCategory, typeof Brain> = {
  training: Dumbbell,
  nutrition: Apple,
  injuries: AlertTriangle,
  preferences: Heart,
  biometrics: Activity,
  history: History,
};

const categoryLabels: Record<MemoryCategory, string> = {
  training: "Training",
  nutrition: "Nutrition",
  injuries: "Injuries",
  preferences: "Preferences",
  biometrics: "Body Data",
  history: "History",
};

export function CoachMemoriesSheet({ isOpen, onClose }: CoachMemoriesSheetProps) {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState<MemoryCategory | 'all'>('all');
  const [categoryCounts, setCategoryCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    if (isOpen) {
      loadMemories();
    }
  }, [isOpen]);

  const loadMemories = async () => {
    setLoading(true);
    try {
      const response = await apiFetch('/api/memory/list');
      if (response.ok) {
        const data = await response.json();
        setMemories(data.memories || []);
        setCategoryCounts(data.categories || {});
      }
    } catch (error) {
      console.error('Failed to load memories:', error);
    }
    setLoading(false);
  };

  const filteredMemories = activeCategory === 'all'
    ? memories
    : memories.filter(m => m.category === activeCategory);

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const totalCount = memories.length;

  return (
    <Sheet isOpen={isOpen} onClose={onClose} title="What Coach Remembers">
      <div className="flex flex-col h-full">
        {/* Category tabs */}
        <div className="flex gap-2 p-4 overflow-x-auto border-b border-white/10 scrollbar-hide">
          <button
            onClick={() => setActiveCategory('all')}
            className={`px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
              activeCategory === 'all'
                ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                : 'bg-white/5 text-zinc-400 hover:bg-white/10'
            }`}
          >
            All ({totalCount})
          </button>
          {MEMORY_CATEGORIES.map(cat => {
            const Icon = categoryIcons[cat];
            const count = categoryCounts[cat] || 0;
            if (count === 0 && memories.length > 0) return null;
            return (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                  activeCategory === cat
                    ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                    : 'bg-white/5 text-zinc-400 hover:bg-white/10'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {categoryLabels[cat]}
                {count > 0 && ` (${count})`}
              </button>
            );
          })}
        </div>

        {/* Memory list */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-cyan-500" />
            </div>
          ) : filteredMemories.length === 0 ? (
            <div className="text-center py-12">
              <Brain className="w-12 h-12 mx-auto text-zinc-600 mb-3" />
              <p className="text-zinc-400 text-sm">
                {totalCount === 0
                  ? "Coach hasn't learned anything yet. Keep chatting and I'll remember what matters."
                  : `No ${categoryLabels[activeCategory as MemoryCategory]} memories yet.`}
              </p>
              {totalCount === 0 && (
                <p className="text-zinc-500 text-xs mt-2">
                  Memories are extracted when you leave the Coach tab
                </p>
              )}
            </div>
          ) : (
            filteredMemories.map((memory, index) => {
              const Icon = categoryIcons[memory.category] || Brain;
              return (
                <motion.div
                  key={memory.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.03, duration: 0.2 }}
                  className="p-3 rounded-xl bg-white/5 border border-white/10"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg bg-cyan-500/10 flex items-center justify-center flex-shrink-0">
                      <Icon className="w-4 h-4 text-cyan-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white leading-relaxed">{memory.fact}</p>
                      <div className="flex items-center gap-2 mt-1.5">
                        <span className="text-xs text-zinc-500">
                          {formatDate(memory.extracted_at)}
                        </span>
                        {memory.importance >= 4 && (
                          <span className="text-xs px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400">
                            Important
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </motion.div>
              );
            })
          )}
        </div>
      </div>
    </Sheet>
  );
}

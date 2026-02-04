"use client";

import { useState } from "react";
import { ChevronDown, MapPin, Plus } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Location } from "@/lib/supabase/types";

interface LocationSelectorProps {
  locations: Location[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAddNew: () => void;
}

export function LocationSelector({
  locations,
  selectedId,
  onSelect,
  onAddNew,
}: LocationSelectorProps) {
  const [open, setOpen] = useState(false);
  const selected = locations.find((l) => l.id === selectedId);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="w-full rounded-2xl p-4 flex items-center justify-between min-h-[44px]"
        style={{
          background: "rgba(26, 26, 36, 0.6)",
          backdropFilter: "blur(16px)",
          border: "1px solid rgba(255, 255, 255, 0.05)",
        }}
      >
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold mb-1">
            Current Location
          </p>
          <p className="text-primary font-black uppercase tracking-tight text-lg">
            {selected?.name || "Select Location"}
          </p>
        </div>
        <motion.div
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.2 }}
        >
          <ChevronDown className="w-5 h-5 text-muted-foreground" />
        </motion.div>
      </button>

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-10"
              onClick={() => setOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.15 }}
              className="absolute left-0 right-0 top-full mt-2 z-20 rounded-2xl overflow-hidden"
              style={{
                background: "rgba(26, 26, 36, 0.95)",
                backdropFilter: "blur(24px)",
                WebkitBackdropFilter: "blur(24px)",
                border: "1px solid rgba(255, 255, 255, 0.05)",
                boxShadow: "0 8px 32px rgba(0, 0, 0, 0.4)",
              }}
            >
              {locations.map((location) => (
                <motion.button
                  key={location.id}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => {
                    onSelect(location.id);
                    setOpen(false);
                  }}
                  className={`
                    w-full flex items-center gap-3 p-4 text-left transition-colors min-h-[44px]
                    ${location.id === selectedId ? "bg-primary/10" : "hover:bg-white/5"}
                  `}
                >
                  <MapPin
                    className={`w-4 h-4 ${
                      location.id === selectedId
                        ? "text-primary"
                        : "text-muted-foreground"
                    }`}
                  />
                  <span
                    className={`font-semibold uppercase tracking-wide ${
                      location.id === selectedId ? "text-primary" : ""
                    }`}
                  >
                    {location.name}
                  </span>
                </motion.button>
              ))}
              <motion.button
                whileTap={{ scale: 0.98 }}
                onClick={() => {
                  onAddNew();
                  setOpen(false);
                }}
                className="w-full flex items-center gap-3 p-4 text-left border-t border-white/5 hover:bg-white/5 transition-colors min-h-[44px]"
              >
                <Plus className="w-4 h-4 text-success" />
                <span className="font-semibold text-success uppercase tracking-wide">
                  Add Location
                </span>
              </motion.button>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

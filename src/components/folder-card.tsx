"use client";

import { motion } from "framer-motion";
import { FolderOpen, Tag, X } from "lucide-react";
import { IconButton } from "./ui/icon-button";

interface FolderCardProps {
  name: string;
  exerciseCount: number;
  onClick: () => void;
  onRename?: () => void;
  onDelete?: () => void;
}

export function FolderCard({
  name,
  exerciseCount,
  onClick,
  onRename,
  onDelete,
}: FolderCardProps) {
  return (
    <motion.div
      whileTap={{ scale: 0.98 }}
      className="rounded-2xl p-4 flex items-center justify-between min-h-[72px]"
      style={{
        background: "rgba(26, 26, 36, 0.6)",
        backdropFilter: "blur(16px)",
        border: "1px solid rgba(255, 255, 255, 0.05)",
      }}
    >
      <button onClick={onClick} className="flex-1 text-left min-h-[44px] flex flex-col justify-center">
        <p className="font-black uppercase tracking-tight text-lg">{name}</p>
        <p className="text-xs text-muted-foreground">
          {exerciseCount} {exerciseCount === 1 ? "Ex" : "Ex"}
        </p>
      </button>

      <div className="flex items-center gap-1">
        {onRename && (
          <IconButton onClick={onRename}>
            <FolderOpen className="w-4 h-4" />
          </IconButton>
        )}
        {onRename && (
          <IconButton onClick={onRename}>
            <Tag className="w-4 h-4" />
          </IconButton>
        )}
        {onDelete && (
          <IconButton onClick={onDelete}>
            <X className="w-4 h-4" />
          </IconButton>
        )}
      </div>
    </motion.div>
  );
}

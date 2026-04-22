-- Add variant column to sets table
-- Tracks set types: normal, assisted-parent, assisted-child, drop, drop-parent, left, right

ALTER TABLE public.sets
ADD COLUMN IF NOT EXISTS variant text DEFAULT 'normal';

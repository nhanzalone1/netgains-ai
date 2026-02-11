"use client";

import { useState, useEffect } from "react";
import {
  Plus,
  ChevronLeft,
  MapPin,
  Dumbbell,
  MoreVertical,
  Trash2,
  CheckCircle,
  Info,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/components/auth-provider";
import { UserMenu } from "@/components/user-menu";
import { PageHeader } from "@/components/ui/page-header";
import { Popover } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { WorkoutSession } from "@/components/workout-session";
import type {
  Location,
  Folder,
  FolderWithCount,
} from "@/lib/supabase/types";

const MAX_LOCATIONS = 5;

export default function LogPage() {
  const { user } = useAuth();
  const supabase = createClient();
  const router = useRouter();

  // Core state — restore from sessionStorage immediately on mount
  const [locations, setLocations] = useState<Location[]>([]);
  const [selectedLocation, setSelectedLocation] = useState<Location | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const stored = sessionStorage.getItem("netgains-selected-location-obj");
      return stored ? JSON.parse(stored) : null;
    } catch { return null; }
  });
  const [folders, setFolders] = useState<FolderWithCount[]>([]);
  const [selectedFolder, setSelectedFolder] = useState<FolderWithCount | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const stored = sessionStorage.getItem("netgains-selected-folder-obj");
      return stored ? JSON.parse(stored) : null;
    } catch { return null; }
  });
  const [loading, setLoading] = useState(true);

  // Modal states
  const [showNewLocation, setShowNewLocation] = useState(false);
  const [newLocationName, setNewLocationName] = useState("");
  const [savingLocation, setSavingLocation] = useState(false);

  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [savingFolder, setSavingFolder] = useState(false);

  // Context menu for location
  const [locationMenuId, setLocationMenuId] = useState<string | null>(null);

  // Success modal
  const [showSuccessModal, setShowSuccessModal] = useState(false);

  // Load locations on mount
  useEffect(() => {
    if (!user) return;
    loadLocations();
  }, [user]);

  // Persist selectedLocation to sessionStorage
  useEffect(() => {
    if (selectedLocation) {
      sessionStorage.setItem("netgains-selected-location-obj", JSON.stringify(selectedLocation));
    } else {
      sessionStorage.removeItem("netgains-selected-location-obj");
    }
  }, [selectedLocation]);

  // Load folders when location is selected
  useEffect(() => {
    if (!selectedLocation) {
      setFolders([]);
      return;
    }
    loadFolders(selectedLocation.id);
  }, [selectedLocation]);

  // Persist selectedFolder to sessionStorage
  useEffect(() => {
    if (selectedFolder) {
      sessionStorage.setItem("netgains-selected-folder-obj", JSON.stringify(selectedFolder));
    } else {
      sessionStorage.removeItem("netgains-selected-folder-obj");
    }
  }, [selectedFolder]);

  const loadLocations = async () => {
    if (!user) return;

    const { data } = await supabase
      .from("locations")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true });

    setLocations((data || []) as Location[]);
    setLoading(false);
  };

  const loadFolders = async (locationId: string) => {
    if (!user) return;

    // Fetch folders and exercise counts in 2 queries instead of N+1
    const { data: foldersData } = await supabase
      .from("folders")
      .select("*")
      .eq("location_id", locationId)
      .order("order_index", { ascending: true });

    const rawFolders = (foldersData || []) as Folder[];

    if (rawFolders.length === 0) {
      setFolders([]);
      return;
    }

    // Get all exercise templates for these folders in one query
    const folderIds = rawFolders.map((f) => f.id);
    const { data: templates } = await supabase
      .from("exercise_templates")
      .select("folder_id")
      .in("folder_id", folderIds);

    // Count exercises per folder
    const countMap = new Map<string, number>();
    (templates || []).forEach((t: { folder_id: string }) => {
      countMap.set(t.folder_id, (countMap.get(t.folder_id) || 0) + 1);
    });

    const foldersWithCounts: FolderWithCount[] = rawFolders.map((folder) => ({
      ...folder,
      exercise_count: countMap.get(folder.id) || 0,
    }));

    setFolders(foldersWithCounts);
  };

  const handleAddLocation = async () => {
    if (!user || !newLocationName.trim()) return;

    setSavingLocation(true);
    const isFirst = locations.length === 0;

    try {
      const { data, error } = await supabase
        .from("locations")
        .insert({
          user_id: user.id,
          name: newLocationName.trim().toUpperCase(),
          is_default: isFirst,
        })
        .select()
        .single();

      if (error) {
        console.error("Failed to create location:", error);
        alert(`Failed to create location: ${error.message}`);
        setSavingLocation(false);
        return;
      }

      const newLocation = data as Location;
      setLocations((prev) => [...prev, newLocation]);
      setNewLocationName("");
      setShowNewLocation(false);
    } catch (err) {
      console.error("Unexpected error creating location:", err);
      alert("An unexpected error occurred. Check console for details.");
    } finally {
      setSavingLocation(false);
    }
  };

  const handleDeleteLocation = async (locationId: string) => {
    if (!confirm("Delete this gym and all its splits?")) return;

    await supabase.from("locations").delete().eq("id", locationId);
    setLocations((prev) => prev.filter((l) => l.id !== locationId));
    setLocationMenuId(null);
  };

  const handleAddFolder = async () => {
    if (!user || !selectedLocation || !newFolderName.trim()) return;

    setSavingFolder(true);

    try {
      const { data, error } = await supabase
        .from("folders")
        .insert({
          user_id: user.id,
          location_id: selectedLocation.id,
          name: newFolderName.trim(),
          order_index: folders.length,
        })
        .select()
        .single();

      if (error) {
        console.error("Failed to create split:", error);
        alert(`Failed to create split: ${error.message}`);
        setSavingFolder(false);
        return;
      }

      const newFolder = data as Folder;
      setFolders((prev) => [...prev, { ...newFolder, exercise_count: 0 }]);
      setNewFolderName("");
      setShowNewFolder(false);
    } catch (err) {
      console.error("Unexpected error creating split:", err);
    } finally {
      setSavingFolder(false);
    }
  };

  const handleDeleteFolder = async (folderId: string) => {
    if (!confirm("Delete this split and all its exercises?")) return;

    await supabase.from("folders").delete().eq("id", folderId);
    setFolders((prev) => prev.filter((f) => f.id !== folderId));
  };

  // Open workout session for a folder
  const openWorkoutSession = (folder: FolderWithCount) => {
    setSelectedFolder(folder);
  };

  // Handle saving workout from session
  const handleSaveWorkout = async (exercises: {
    id: string;
    name: string;
    equipment: string;
    templateId: string | null;
    sets: { id: string; weight: string; reps: string; variant: string }[];
  }[]) => {
    if (!user) return;

    // Pre-validate: filter exercises with at least one valid set
    const validExercises = exercises
      .map((ex, i) => ({
        ...ex,
        orderIndex: i,
        validSets: ex.sets.filter((s) => s.weight && s.reps),
      }))
      .filter((ex) => ex.validSets.length > 0);

    if (validExercises.length === 0) {
      alert("No valid sets to save. Add at least one complete set.");
      return;
    }

    let workoutId: string | null = null;

    try {
      // Create workout entry
      const { data: workout, error: workoutError } = await supabase
        .from("workouts")
        .insert({
          user_id: user.id,
          date: new Date().toISOString().split("T")[0],
          notes: `${selectedFolder?.name} session`,
        })
        .select()
        .single();

      if (workoutError || !workout) {
        console.error("Failed to create workout:", workoutError);
        alert("Failed to save workout. Please try again.");
        return;
      }

      workoutId = workout.id;

      // Batch insert all exercises
      const exerciseInserts = validExercises.map((ex) => ({
        workout_id: workout.id,
        name: ex.name,
        order_index: ex.orderIndex,
      }));

      const { data: exercisesData, error: exercisesError } = await supabase
        .from("exercises")
        .insert(exerciseInserts)
        .select();

      if (exercisesError || !exercisesData || exercisesData.length === 0) {
        throw new Error("Failed to create exercises");
      }

      // Build all sets for batch insert
      const setInserts: { exercise_id: string; weight: number; reps: number; order_index: number; variant: string }[] = [];

      for (let i = 0; i < validExercises.length; i++) {
        const exercise = validExercises[i];
        const exerciseRecord = exercisesData[i];

        exercise.validSets.forEach((set, j) => {
          setInserts.push({
            exercise_id: exerciseRecord.id,
            weight: parseFloat(set.weight),
            reps: parseInt(set.reps, 10),
            order_index: j,
            variant: set.variant || "normal",
          });
        });
      }

      if (setInserts.length > 0) {
        const { error: setsError } = await supabase
          .from("sets")
          .insert(setInserts);

        if (setsError) {
          throw new Error("Failed to create sets");
        }
      }

      // Success - show modal
      setShowSuccessModal(true);
    } catch (err) {
      console.error("Error saving workout:", err);

      // Cleanup: delete the workout if it was created (cascades to exercises/sets via FK)
      if (workoutId) {
        await supabase.from("workouts").delete().eq("id", workoutId);
      }

      alert("Failed to save workout. Please try again.");
    }
  };

  // Handle success modal close - return to gym selection
  const handleSuccessClose = () => {
    setShowSuccessModal(false);
    setSelectedFolder(null);
    setSelectedLocation(null);
    sessionStorage.removeItem("netgains-selected-location-obj");
    sessionStorage.removeItem("netgains-selected-folder-obj");
  };

  // Loading state
  if (loading) {
    return (
      <div className="p-4 max-w-lg mx-auto">
        <PageHeader title="Log" action={<UserMenu />} />
        <div className="flex items-center justify-center h-64">
          <div className="text-muted-foreground">Loading...</div>
        </div>
      </div>
    );
  }

  // ========================================
  // STATE 3: Workout Session View
  // ========================================
  if (selectedFolder && user) {
    return (
      <div className="max-w-lg mx-auto">
        <WorkoutSession
          userId={user.id}
          folderId={selectedFolder.id}
          folderName={selectedFolder.name}
          onBack={() => setSelectedFolder(null)}
          onSave={handleSaveWorkout}
        />

        {/* Success Modal */}
        <AnimatePresence>
          {showSuccessModal && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                className="w-full max-w-sm rounded-2xl p-8 text-center"
                style={{
                  background: "#1a1a24",
                  border: "1px solid rgba(255, 255, 255, 0.1)",
                }}
              >
                {/* Animated Checkmark */}
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
                  className="w-20 h-20 rounded-full mx-auto mb-6 flex items-center justify-center"
                  style={{ background: "rgba(34, 197, 94, 0.15)" }}
                >
                  <CheckCircle className="w-12 h-12 text-green-500" />
                </motion.div>

                {/* Title */}
                <h2 className="text-2xl font-bold text-white mb-2">
                  Workout Logged
                </h2>

                {/* Subtitle */}
                <p className="text-sm text-gray-400 mb-8">
                  Great session. Your stats have been updated.
                </p>

                {/* Return Button */}
                <Button onClick={handleSuccessClose}>
                  Back to Gyms
                </Button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  // ========================================
  // STATE 2: Gym Detail View (Active Location)
  // ========================================
  if (selectedLocation) {
    return (
      <div className="p-4 max-w-lg mx-auto pb-32">
        {/* Header with Back Button */}
        <div className="flex items-center gap-3 mb-6">
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={() => setSelectedLocation(null)}
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{
              background: "rgba(26, 26, 36, 0.6)",
              border: "1px solid rgba(255, 255, 255, 0.05)",
            }}
          >
            <ChevronLeft className="w-5 h-5" />
          </motion.button>
          <div className="flex-1">
            <h1 className="text-xl font-bold tracking-tight">
              {selectedLocation.name}
            </h1>
            <p className="text-xs text-muted-foreground">
              {folders.length} split{folders.length !== 1 ? "s" : ""}
            </p>
          </div>
          <UserMenu />
        </div>

        {/* Current Split Section */}
        <div className="mb-4">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">
            Current Split
          </h2>

          {/* 2-Column Grid of Split Boxes */}
          <div className="grid grid-cols-2 gap-3">
            <AnimatePresence>
              {folders.map((folder) => (
                <motion.div
                  key={folder.id}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => openWorkoutSession(folder)}
                  className="aspect-square rounded-2xl p-4 flex flex-col justify-between cursor-pointer relative group"
                  style={{
                    background: "rgba(26, 26, 36, 0.6)",
                    backdropFilter: "blur(16px)",
                    border: "1px solid rgba(255, 255, 255, 0.05)",
                  }}
                >
                  {/* Delete button */}
                  <motion.button
                    initial={{ opacity: 0 }}
                    whileHover={{ scale: 1.1 }}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteFolder(folder.id);
                    }}
                    className="absolute top-2 right-2 w-7 h-7 rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-destructive/20 text-destructive"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </motion.button>

                  {/* Folder Icon */}
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                    <Dumbbell className="w-5 h-5 text-primary" />
                  </div>

                  {/* Folder Info */}
                  <div>
                    <h3 className="font-semibold text-sm leading-tight mb-1 line-clamp-2">
                      {folder.name}
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      {folder.exercise_count} exercise
                      {folder.exercise_count !== 1 ? "s" : ""}
                    </p>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>

            {/* Add Split Day Button */}
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={() => setShowNewFolder(true)}
              className="aspect-square rounded-2xl p-4 flex flex-col items-center justify-center gap-2 cursor-pointer"
              style={{
                background: "rgba(26, 26, 36, 0.3)",
                border: "2px dashed rgba(255, 255, 255, 0.1)",
              }}
            >
              <div className="w-10 h-10 rounded-xl bg-muted/30 flex items-center justify-center">
                <Plus className="w-5 h-5 text-muted-foreground" />
              </div>
              <span className="text-xs font-semibold text-muted-foreground uppercase">
                Add Split
              </span>
            </motion.button>
          </div>
        </div>

        {/* New Split Modal */}
        <Modal
          open={showNewFolder}
          onClose={() => setShowNewFolder(false)}
          title="New Split Day"
        >
          <div className="space-y-4">
            <input
              type="text"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="e.g., Chest & Tri"
              className="w-full bg-background/50 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary min-h-[44px]"
              autoFocus
            />
            <Button
              onClick={handleAddFolder}
              loading={savingFolder}
              disabled={!newFolderName.trim()}
            >
              Create Split
            </Button>
          </div>
        </Modal>
      </div>
    );
  }

  // ========================================
  // STATE 1: Location List (Default View)
  // ========================================
  const atMaxLocations = locations.length >= MAX_LOCATIONS;

  return (
    <div className="p-4 max-w-lg mx-auto pb-32">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-black uppercase tracking-tighter">
            Log
          </h1>
          <Popover trigger={<Info className="w-4 h-4 text-muted-foreground" />}>
            <div className="space-y-2">
              <p className="font-semibold text-white">The Daily Grind.</p>
              <ul className="text-sm text-gray-400 space-y-1">
                <li>• <span className="text-gray-300">Flexibility:</span> Make or choose a gym split that fits you.</li>
                <li>• <span className="text-gray-300">Build:</span> Add your specific exercises for the session.</li>
                <li>• <span className="text-gray-300">Track:</span> Record every set and rep precisely.</li>
                <li>• <span className="text-gray-300">Finish:</span> Always click 'Finish & Save' to lock in your data.</li>
              </ul>
            </div>
          </Popover>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground font-semibold uppercase">
            LBS
          </span>
          <UserMenu />
        </div>
      </div>

      {/* Section Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Your Gyms
        </h2>
        {atMaxLocations && (
          <span className="text-xs text-orange-500 font-medium">
            Max Limit ({MAX_LOCATIONS})
          </span>
        )}
      </div>

      {/* Gym Location Cards */}
      <div className="space-y-3 mb-6">
        <AnimatePresence>
          {locations.map((location) => (
            <motion.div
              key={location.id}
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, height: 0 }}
              className="relative"
            >
              <motion.button
                whileTap={{ scale: 0.98 }}
                onClick={() => setSelectedLocation(location)}
                className="w-full rounded-2xl p-4 flex items-center gap-4 text-left"
                style={{
                  background: "rgba(26, 26, 36, 0.6)",
                  backdropFilter: "blur(16px)",
                  border: "1px solid rgba(255, 255, 255, 0.05)",
                }}
              >
                {/* Location Icon */}
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <MapPin className="w-6 h-6 text-primary" />
                </div>

                {/* Location Info */}
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-base truncate">
                    {location.name}
                  </h3>
                  {location.is_default && (
                    <span className="text-xs text-primary">Default</span>
                  )}
                </div>

                {/* More Menu */}
                <motion.div
                  whileTap={{ scale: 0.9 }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setLocationMenuId(
                      locationMenuId === location.id ? null : location.id
                    );
                  }}
                  className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-muted/30"
                >
                  <MoreVertical className="w-4 h-4 text-muted-foreground" />
                </motion.div>
              </motion.button>

              {/* Context Menu */}
              <AnimatePresence>
                {locationMenuId === location.id && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: -5 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: -5 }}
                    className="absolute right-0 top-14 z-10 rounded-xl overflow-hidden"
                    style={{
                      background: "rgba(26, 26, 36, 0.95)",
                      backdropFilter: "blur(16px)",
                      border: "1px solid rgba(255, 255, 255, 0.1)",
                    }}
                  >
                    <button
                      onClick={() => handleDeleteLocation(location.id)}
                      className="flex items-center gap-2 px-4 py-3 text-sm text-destructive hover:bg-destructive/10 w-full"
                    >
                      <Trash2 className="w-4 h-4" />
                      Delete Gym
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ))}
        </AnimatePresence>

        {/* Empty State */}
        {locations.length === 0 && (
          <div className="text-center py-12">
            <div className="w-16 h-16 rounded-2xl bg-muted/30 flex items-center justify-center mx-auto mb-4">
              <MapPin className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="font-semibold mb-1">No Gyms Yet</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Add your first gym to start logging workouts
            </p>
          </div>
        )}
      </div>

      {/* Add New Gym Button */}
      {!atMaxLocations && (
        <Button
          onClick={() => setShowNewLocation(true)}
          icon={<Plus className="w-5 h-5" />}
          variant="ghost"
          className="!bg-muted/30"
        >
          Add New Gym
        </Button>
      )}

      {/* Click outside to close menu */}
      {locationMenuId && (
        <div
          className="fixed inset-0 z-0"
          onClick={() => setLocationMenuId(null)}
        />
      )}

      {/* New Location Modal */}
      <Modal
        open={showNewLocation}
        onClose={() => setShowNewLocation(false)}
        title="New Gym"
      >
        <div className="space-y-4">
          <input
            type="text"
            value={newLocationName}
            onChange={(e) => setNewLocationName(e.target.value)}
            placeholder="e.g., Main Gym"
            className="w-full bg-background/50 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary min-h-[44px] uppercase"
            autoFocus
          />
          <Button
            onClick={handleAddLocation}
            loading={savingLocation}
            disabled={!newLocationName.trim()}
          >
            Add Gym
          </Button>
        </div>
      </Modal>
    </div>
  );
}

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      maxes: {
        Row: {
          id: string;
          user_id: string;
          squat: number;
          bench: number;
          deadlift: number;
          overhead: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          squat?: number;
          bench?: number;
          deadlift?: number;
          overhead?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          squat?: number;
          bench?: number;
          deadlift?: number;
          overhead?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "maxes_user_id_fkey";
            columns: ["user_id"];
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      workouts: {
        Row: {
          id: string;
          user_id: string;
          date: string;
          notes: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          date?: string;
          notes?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          date?: string;
          notes?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "workouts_user_id_fkey";
            columns: ["user_id"];
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      exercises: {
        Row: {
          id: string;
          workout_id: string;
          name: string;
          order_index: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          workout_id: string;
          name: string;
          order_index?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          workout_id?: string;
          name?: string;
          order_index?: number;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "exercises_workout_id_fkey";
            columns: ["workout_id"];
            referencedRelation: "workouts";
            referencedColumns: ["id"];
          }
        ];
      };
      sets: {
        Row: {
          id: string;
          exercise_id: string;
          weight: number;
          reps: number;
          order_index: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          exercise_id: string;
          weight: number;
          reps: number;
          order_index?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          exercise_id?: string;
          weight?: number;
          reps?: number;
          order_index?: number;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "sets_exercise_id_fkey";
            columns: ["exercise_id"];
            referencedRelation: "exercises";
            referencedColumns: ["id"];
          }
        ];
      };
      locations: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          is_default: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          is_default?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          is_default?: boolean;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "locations_user_id_fkey";
            columns: ["user_id"];
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      folders: {
        Row: {
          id: string;
          user_id: string;
          location_id: string;
          name: string;
          order_index: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          location_id: string;
          name: string;
          order_index?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          location_id?: string;
          name?: string;
          order_index?: number;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "folders_user_id_fkey";
            columns: ["user_id"];
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "folders_location_id_fkey";
            columns: ["location_id"];
            referencedRelation: "locations";
            referencedColumns: ["id"];
          }
        ];
      };
      exercise_templates: {
        Row: {
          id: string;
          user_id: string;
          folder_id: string;
          name: string;
          equipment: string;
          exercise_type: string;
          order_index: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          folder_id: string;
          name: string;
          equipment?: string;
          exercise_type?: string;
          order_index?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          folder_id?: string;
          name?: string;
          equipment?: string;
          exercise_type?: string;
          order_index?: number;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "exercise_templates_user_id_fkey";
            columns: ["user_id"];
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "exercise_templates_folder_id_fkey";
            columns: ["folder_id"];
            referencedRelation: "folders";
            referencedColumns: ["id"];
          }
        ];
      };
      program_cycles: {
        Row: {
          id: string;
          user_id: string;
          current_week: number;
          started_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          current_week?: number;
          started_at?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          current_week?: number;
          started_at?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "program_cycles_user_id_fkey";
            columns: ["user_id"];
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      program_settings: {
        Row: {
          user_id: string;
          squat_max: number;
          bench_max: number;
          deadlift_max: number;
          current_week: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          squat_max?: number;
          bench_max?: number;
          deadlift_max?: number;
          current_week?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          squat_max?: number;
          bench_max?: number;
          deadlift_max?: number;
          current_week?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "program_settings_user_id_fkey";
            columns: ["user_id"];
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      program_progress: {
        Row: {
          id: string;
          user_id: string;
          week_number: number;
          day: string;
          is_complete: boolean;
          completed_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          week_number: number;
          day: string;
          is_complete?: boolean;
          completed_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          week_number?: number;
          day?: string;
          is_complete?: boolean;
          completed_at?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "program_progress_user_id_fkey";
            columns: ["user_id"];
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

// Convenience types
export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type Maxes = Database["public"]["Tables"]["maxes"]["Row"];
export type Workout = Database["public"]["Tables"]["workouts"]["Row"];
export type Exercise = Database["public"]["Tables"]["exercises"]["Row"];
export type Set = Database["public"]["Tables"]["sets"]["Row"];
export type Location = Database["public"]["Tables"]["locations"]["Row"];
export type Folder = Database["public"]["Tables"]["folders"]["Row"];
export type ExerciseTemplate = Database["public"]["Tables"]["exercise_templates"]["Row"];
export type ProgramCycle = Database["public"]["Tables"]["program_cycles"]["Row"];

// Insert types
export type MaxesInsert = Database["public"]["Tables"]["maxes"]["Insert"];
export type WorkoutInsert = Database["public"]["Tables"]["workouts"]["Insert"];
export type ExerciseInsert = Database["public"]["Tables"]["exercises"]["Insert"];
export type SetInsert = Database["public"]["Tables"]["sets"]["Insert"];
export type LocationInsert = Database["public"]["Tables"]["locations"]["Insert"];
export type FolderInsert = Database["public"]["Tables"]["folders"]["Insert"];
export type ExerciseTemplateInsert = Database["public"]["Tables"]["exercise_templates"]["Insert"];

// Equipment types
export type EquipmentType = "barbell" | "dumbbell" | "cable" | "machine" | "smith";
export type ExerciseType = "strength" | "cardio";

// Workout with nested exercises and sets
export type WorkoutWithExercises = Workout & {
  exercises: (Exercise & { sets: Set[] })[];
};

// Folder with exercise count
export type FolderWithCount = Folder & {
  exercise_count: number;
};

// Program persistence types
export type ProgramSettings = Database["public"]["Tables"]["program_settings"]["Row"];
export type ProgramSettingsInsert = Database["public"]["Tables"]["program_settings"]["Insert"];
export type ProgramProgress = Database["public"]["Tables"]["program_progress"]["Row"];
export type ProgramProgressInsert = Database["public"]["Tables"]["program_progress"]["Insert"];

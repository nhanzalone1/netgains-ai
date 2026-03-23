export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

// Key memories structure for coach profile
export interface KeyMemories {
  supplements: string;
  food_available: string;
  preferences: string;
  injuries: string;
}

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          created_at: string;
          updated_at: string;
          muscle_group_mode: string;
          height_inches: number | null;
          weight_lbs: number | null;
          goal: string | null;
          coaching_mode: string | null;
          coaching_intensity: string | null;
          onboarding_complete: boolean;
          nutrition_onboarding_complete: boolean;
          app_tour_shown: boolean;
          beta_welcome_shown: boolean;
          is_admin: boolean | null;
          consent_ai_data: boolean | null;
          key_memories: KeyMemories | null;
        };
        Insert: {
          id: string;
          created_at?: string;
          updated_at?: string;
          muscle_group_mode?: string;
          height_inches?: number | null;
          weight_lbs?: number | null;
          goal?: string | null;
          coaching_mode?: string | null;
          coaching_intensity?: string | null;
          onboarding_complete?: boolean;
          nutrition_onboarding_complete?: boolean;
          app_tour_shown?: boolean;
          beta_welcome_shown?: boolean;
          is_admin?: boolean | null;
          consent_ai_data?: boolean | null;
          key_memories?: KeyMemories | null;
        };
        Update: {
          id?: string;
          created_at?: string;
          updated_at?: string;
          muscle_group_mode?: string;
          height_inches?: number | null;
          weight_lbs?: number | null;
          goal?: string | null;
          coaching_mode?: string | null;
          coaching_intensity?: string | null;
          onboarding_complete?: boolean;
          nutrition_onboarding_complete?: boolean;
          app_tour_shown?: boolean;
          beta_welcome_shown?: boolean;
          is_admin?: boolean | null;
          consent_ai_data?: boolean | null;
          key_memories?: KeyMemories | null;
        };
        Relationships: [];
      };
      subscriptions: {
        Row: {
          id: string;
          user_id: string;
          tier: string;
          apple_transaction_id: string | null;
          apple_original_transaction_id: string | null;
          product_id: string | null;
          expires_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          tier?: string;
          apple_transaction_id?: string | null;
          apple_original_transaction_id?: string | null;
          product_id?: string | null;
          expires_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          tier?: string;
          apple_transaction_id?: string | null;
          apple_original_transaction_id?: string | null;
          product_id?: string | null;
          expires_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "subscriptions_user_id_fkey";
            columns: ["user_id"];
            referencedRelation: "users";
            referencedColumns: ["id"];
          }
        ];
      };
      coach_memory: {
        Row: {
          id: string;
          user_id: string;
          key: string;
          value: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          key: string;
          value: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          key?: string;
          value?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "coach_memory_user_id_fkey";
            columns: ["user_id"];
            referencedRelation: "users";
            referencedColumns: ["id"];
          }
        ];
      };
      chat_messages: {
        Row: {
          id: string;
          user_id: string;
          role: string;
          content: string;
          hidden: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          role: string;
          content: string;
          hidden?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          role?: string;
          content?: string;
          hidden?: boolean;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "chat_messages_user_id_fkey";
            columns: ["user_id"];
            referencedRelation: "users";
            referencedColumns: ["id"];
          }
        ];
      };
      meals: {
        Row: {
          id: string;
          user_id: string;
          date: string;
          meal_type: string;
          food_name: string;
          calories: number;
          protein: number;
          carbs: number;
          fat: number;
          serving_size: string | null;
          consumed: boolean;
          ai_generated: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          date?: string;
          meal_type?: string;
          food_name: string;
          calories?: number;
          protein?: number;
          carbs?: number;
          fat?: number;
          serving_size?: string | null;
          consumed?: boolean;
          ai_generated?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          date?: string;
          meal_type?: string;
          food_name?: string;
          calories?: number;
          protein?: number;
          carbs?: number;
          fat?: number;
          serving_size?: string | null;
          consumed?: boolean;
          ai_generated?: boolean;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "meals_user_id_fkey";
            columns: ["user_id"];
            referencedRelation: "users";
            referencedColumns: ["id"];
          }
        ];
      };
      nutrition_goals: {
        Row: {
          id: string;
          user_id: string;
          calories: number;
          protein: number;
          carbs: number;
          fat: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          calories?: number;
          protein?: number;
          carbs?: number;
          fat?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          calories?: number;
          protein?: number;
          carbs?: number;
          fat?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "nutrition_goals_user_id_fkey";
            columns: ["user_id"];
            referencedRelation: "users";
            referencedColumns: ["id"];
          }
        ];
      };
      allowed_testers: {
        Row: {
          id: string;
          email: string;
          added_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          email: string;
          added_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          added_by?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      waitlist: {
        Row: {
          id: string;
          email: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          email: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          created_at?: string;
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
          folder_id: string | null;
          location_id: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          date?: string;
          notes?: string | null;
          folder_id?: string | null;
          location_id?: number | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          date?: string;
          notes?: string | null;
          folder_id?: string | null;
          location_id?: number | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "workouts_user_id_fkey";
            columns: ["user_id"];
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "workouts_folder_id_fkey";
            columns: ["folder_id"];
            referencedRelation: "folders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "workouts_location_id_fkey";
            columns: ["location_id"];
            referencedRelation: "locations";
            referencedColumns: ["id"];
          }
        ];
      };
      exercises: {
        Row: {
          id: string;
          workout_id: string;
          name: string;
          equipment: string;
          gym_id: number | null;
          is_gym_specific: boolean;
          order_index: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          workout_id: string;
          name: string;
          equipment?: string;
          gym_id?: number | null;
          is_gym_specific?: boolean;
          order_index?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          workout_id?: string;
          name?: string;
          equipment?: string;
          gym_id?: number | null;
          is_gym_specific?: boolean;
          order_index?: number;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "exercises_workout_id_fkey";
            columns: ["workout_id"];
            referencedRelation: "workouts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "exercises_gym_id_fkey";
            columns: ["gym_id"];
            referencedRelation: "locations";
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
          variant: string;
          measure_type: string;
          order_index: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          exercise_id: string;
          weight: number;
          reps: number;
          variant?: string;
          measure_type?: string;
          order_index?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          exercise_id?: string;
          weight?: number;
          reps?: number;
          variant?: string;
          measure_type?: string;
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
          id: number;
          user_id: string;
          name: string;
          is_default: boolean;
          created_at: string;
        };
        Insert: {
          id?: number;
          user_id: string;
          name: string;
          is_default?: boolean;
          created_at?: string;
        };
        Update: {
          id?: number;
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
          location_id: number;
          name: string;
          order_index: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          location_id: number;
          name: string;
          order_index?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          location_id?: number;
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
          default_measure_type: string;
          muscle_group: string[] | null;
          gym_id: number | null;
          is_gym_specific: boolean;
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
          default_measure_type?: string;
          muscle_group?: string[] | null;
          gym_id?: number | null;
          is_gym_specific?: boolean;
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
          default_measure_type?: string;
          muscle_group?: string[] | null;
          gym_id?: number | null;
          is_gym_specific?: boolean;
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
          },
          {
            foreignKeyName: "exercise_templates_gym_id_fkey";
            columns: ["gym_id"];
            referencedRelation: "locations";
            referencedColumns: ["id"];
          }
        ];
      };
      split_muscle_groups: {
        Row: {
          id: number;
          user_id: string;
          folder_id: number;
          muscle_groups: string[];
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: number;
          user_id: string;
          folder_id: number;
          muscle_groups?: string[];
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: number;
          user_id?: string;
          folder_id?: number;
          muscle_groups?: string[];
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "split_muscle_groups_user_id_fkey";
            columns: ["user_id"];
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "split_muscle_groups_folder_id_fkey";
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
      weigh_ins: {
        Row: {
          id: string;
          user_id: string;
          weight_lbs: number;
          date: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          weight_lbs: number;
          date?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          weight_lbs?: number;
          date?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "weigh_ins_user_id_fkey";
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
export type Subscription = Database["public"]["Tables"]["subscriptions"]["Row"];
export type CoachMemory = Database["public"]["Tables"]["coach_memory"]["Row"];
export type ChatMessage = Database["public"]["Tables"]["chat_messages"]["Row"];
export type Meal = Database["public"]["Tables"]["meals"]["Row"];
export type NutritionGoals = Database["public"]["Tables"]["nutrition_goals"]["Row"];
export type Maxes = Database["public"]["Tables"]["maxes"]["Row"];
export type Workout = Database["public"]["Tables"]["workouts"]["Row"];
export type Exercise = Database["public"]["Tables"]["exercises"]["Row"];
export type Set = Database["public"]["Tables"]["sets"]["Row"];
export type Location = Database["public"]["Tables"]["locations"]["Row"];
export type Folder = Database["public"]["Tables"]["folders"]["Row"];
export type ExerciseTemplate = Database["public"]["Tables"]["exercise_templates"]["Row"];
export type ProgramCycle = Database["public"]["Tables"]["program_cycles"]["Row"];
export type WeighIn = Database["public"]["Tables"]["weigh_ins"]["Row"];

// Insert types
export type ProfileInsert = Database["public"]["Tables"]["profiles"]["Insert"];
export type SubscriptionInsert = Database["public"]["Tables"]["subscriptions"]["Insert"];
export type CoachMemoryInsert = Database["public"]["Tables"]["coach_memory"]["Insert"];
export type ChatMessageInsert = Database["public"]["Tables"]["chat_messages"]["Insert"];
export type MealInsert = Database["public"]["Tables"]["meals"]["Insert"];
export type NutritionGoalsInsert = Database["public"]["Tables"]["nutrition_goals"]["Insert"];
export type MaxesInsert = Database["public"]["Tables"]["maxes"]["Insert"];
export type WorkoutInsert = Database["public"]["Tables"]["workouts"]["Insert"];
export type ExerciseInsert = Database["public"]["Tables"]["exercises"]["Insert"];
export type SetInsert = Database["public"]["Tables"]["sets"]["Insert"];
export type LocationInsert = Database["public"]["Tables"]["locations"]["Insert"];
export type FolderInsert = Database["public"]["Tables"]["folders"]["Insert"];
export type ExerciseTemplateInsert = Database["public"]["Tables"]["exercise_templates"]["Insert"];

// Equipment types
export type EquipmentType = "barbell" | "dumbbell" | "cable" | "machine" | "smith" | "bodyweight" | "plate";
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

// Split muscle groups types
export type SplitMuscleGroups = Database["public"]["Tables"]["split_muscle_groups"]["Row"];
export type SplitMuscleGroupsInsert = Database["public"]["Tables"]["split_muscle_groups"]["Insert"];
export type SplitMuscleGroupsUpdate = Database["public"]["Tables"]["split_muscle_groups"]["Update"];

// Muscle group type (13 groups)
export type MuscleGroup =
  | "chest"
  | "back"
  | "biceps"
  | "triceps"
  | "front_delt"
  | "side_delt"
  | "rear_delt"
  | "quads"
  | "hamstrings"
  | "glutes"
  | "calves"
  | "abs"
  | "forearms";

// Muscle group display names
export const MUSCLE_GROUP_LABELS: Record<MuscleGroup, string> = {
  chest: "Chest",
  back: "Back",
  biceps: "Biceps",
  triceps: "Triceps",
  front_delt: "Front Delt",
  side_delt: "Side Delt",
  rear_delt: "Rear Delt",
  quads: "Quads",
  hamstrings: "Hamstrings",
  glutes: "Glutes",
  calves: "Calves",
  abs: "Abs",
  forearms: "Forearms",
};

// All valid muscle groups array
export const MUSCLE_GROUPS: MuscleGroup[] = [
  "chest",
  "back",
  "biceps",
  "triceps",
  "front_delt",
  "side_delt",
  "rear_delt",
  "quads",
  "hamstrings",
  "glutes",
  "calves",
  "abs",
  "forearms",
];

// Equipment that is gym-specific (varies by location)
export const GYM_SPECIFIC_EQUIPMENT: EquipmentType[] = ["machine", "cable", "smith"];

// Equipment that is universal (available at any gym)
export const UNIVERSAL_EQUIPMENT: EquipmentType[] = ["barbell", "dumbbell", "bodyweight", "plate"];

// Helper to check if equipment is gym-specific
export function isGymSpecificEquipment(equipment: string): boolean {
  return GYM_SPECIFIC_EQUIPMENT.includes(equipment as EquipmentType);
}

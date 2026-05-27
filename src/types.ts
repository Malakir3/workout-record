export type WorkoutRecord = {
  userId?: string;
  recordId: string;
  date: string;
  exercise: string;
  weight: number;
  reps: number[];
  createdAt: string;
};

export type NewWorkoutRecord = {
  date: string;
  exercise: string;
  weight: number;
  reps: number[];
};

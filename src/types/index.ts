export type ActivityType =
  | 'question'
  | 'lab'
  | 'lesson'
  | 'task'
  | 'mock_exam'
  | 'other';

export interface LearningActivity {
  id: string;
  courseId: string;
  courseName: string;
  type: ActivityType;
  title: string;
  module?: string;
  quantity: number; // e.g. 1 for individual, N for quick count
  questionsAttempted?: number;
  correctAnswers?: number;
  durationMinutes: number; // time spent in minutes
  notes?: string;
  completedAt: string; // ISO 8601 string
  createdAt: string;
  updatedAt: string;
}

export interface Course {
  id: string;
  name: string;
  category?: string;
  createdAt: string;
  archived?: boolean;
}

export interface LearningGoals {
  dailyQuestions: number;
  dailyLabs: number;
  dailyLessons: number;
  dailyLearningMinutes: number;
  weeklyQuestions: number;
  weeklyLabs: number;
}

export interface AppSettings {
  theme: 'dark' | 'light';
  showBadge: boolean;
  notificationsEnabled: boolean;
  streakFreezeDays: number;
}

export interface DailyStats {
  questionsSolved: number;
  labsCompleted: number;
  lessonsCompleted: number;
  tasksCompleted: number;
  mockExamsCompleted: number;
  learningTimeMinutes: number;
  dailyGoal: number;
  progressPercent: number;
  remainingQuestions: number;
}

export interface WeeklyDayStat {
  dateStr: string; // YYYY-MM-DD
  dayLetter: string; // M, T, W, T, F, S, S
  dayName: string; // Mon, Tue, etc.
  questions: number;
  labs: number;
  lessons: number;
  durationMinutes: number;
  totalActivities: number;
  isToday: boolean;
}

export interface StreakInfo {
  currentStreak: number;
  longestStreak: number;
  activeToday: boolean;
  lastActiveDate: string | null;
}

export interface HeatmapDay {
  date: string; // YYYY-MM-DD
  count: number;
  questions: number;
  labs: number;
  level: 0 | 1 | 2 | 3 | 4; // 0, 1-3, 4-7, 8-12, 13+
}

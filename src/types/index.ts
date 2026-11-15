export type ActivityType =
  | 'task'
  | 'lab'
  | 'lesson'
  | 'question'
  | 'mock_exam'
  | 'other';

export type ActivitySource = 'manual' | 'verified_platform';

export interface DailyActivity {
  id: string;
  trackId: string;
  courseId?: string; // Backwards-compatible alias for trackId
  courseName: string;
  activityType: ActivityType;
  type?: ActivityType; // Backwards-compatible alias for activityType
  quantity: number; // Count of completions
  completedAt: string; // ISO 8601 string
  source: ActivitySource;
  module?: string;
  title?: string;
  durationMinutes?: number; // Time in minutes
  notes?: string;
  questionsAttempted?: number;
  correctAnswers?: number;
  createdAt?: string;
  updatedAt?: string;
}

// Backwards compatibility alias
export type LearningActivity = DailyActivity;

export interface TrackProgress {
  trackId: string;
  trackName: string;
  completedTasks: number;
  totalTasks: number;
  pendingTasks: number;
  lastSyncedAt: string;
}

export interface TrackSnapshot {
  trackId: string;
  completedTasks: number;
  observedAt: string;
}

export interface SyncResult {
  status: 'successful' | 'failed' | 'waiting_for_data';
  lastSyncedAt: string;
  newActivitiesCount: number;
  coursesUpdated: number;
  message?: string;
  tracks: TrackProgress[];
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
  autoSync: boolean;
}

export interface DailyStats {
  tasksCompleted: number; // KodeKloud verified tasks
  questionsSolved: number; // Questions solved
  labsCompleted: number;
  lessonsCompleted: number;
  mockExamsCompleted: number;
  learningTimeMinutes: number;
  dailyGoal: number;
  progressPercent: number;
  remainingQuestions: number;
  totalActivitiesCount: number;
}

export interface WeeklyDayStat {
  dateStr: string; // YYYY-MM-DD
  dayLetter: string; // M, T, W, T, F, S, S
  dayName: string; // Mon, Tue, etc.
  tasks: number;
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
  tasks: number;
  questions: number;
  labs: number;
  level: 0 | 1 | 2 | 3 | 4; // 0, 1-3, 4-7, 8-12, 13+
}

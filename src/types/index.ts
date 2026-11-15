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
  courseId?: string;
  trackId: string;
  courseName: string;
  taskId?: string;
  taskName?: string;
  activityType: ActivityType;
  type?: ActivityType; // Backwards-compatible alias for activityType
  quantity: number; // Count of completions
  observedAt?: string; // Timestamp when activity was observed
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

export interface ExtractionDiagnostics {
  stage?: 'TAB_DETECTION' | 'CONTENT_SCRIPT_INJECTION' | 'DOM_EXTRACTION' | 'COURSE_VALIDATION' | 'BACKGROUND_SYNC' | 'COMPLETED';
  status?: 'SUCCESS' | 'FAILED' | 'PARTIAL' | 'WAITING_FOR_DATA';
  reason?: string;
  activeTabUrl?: string;
  url: string;
  contentScriptInjected?: boolean;
  contentScriptReady?: boolean;
  domReady?: boolean;
  practicePageDetected?: boolean;
  courseCardsFound?: number;
  validCourseCards?: number;
  invalidCourseCards?: number;
  progressValuesExtracted?: number;
  backgroundResponseReceived?: boolean;
  elementsScanned: number;
  cardsDiscovered: number;
  strategiesUsed: string[];
  extractionDurationMs: number;
  validationWarnings: string[];
  timestamp: string;
}

export interface TrackProgress {
  trackId: string;
  trackName: string;
  completedTasks: number;
  totalTasks: number;
  pendingTasks: number;
  unlockedTasks?: number;
  lockedTasks?: number;
  courseId?: string;
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
  diagnostics?: ExtractionDiagnostics;
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

export interface GitHubUser {
  login: string;
  id: number;
  avatar_url: string;
  name: string | null;
  html_url: string;
  public_repos: number;
  total_private_repos?: number;
}

export interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  html_url: string;
  default_branch: string;
  description: string | null;
}

export interface GitHubConfig {
  token: string;
  user: GitHubUser | null;
  selectedRepo: GitHubRepo | null;
  branch: string;
  autoSync: boolean;
  lastSyncAt: string | null;
  lastSyncCommitSha: string | null;
  lastSyncCommitUrl: string | null;
}

export interface GitHubCommitRecord {
  id: string;
  timestamp: string;
  commitSha: string;
  commitUrl: string;
  commitMessage: string;
  filesChanged: string[];
  status: 'success' | 'failed';
  error?: string;
}

export interface GitHubRateLimitInfo {
  limit: number;
  remaining: number;
  resetTime: string; // ISO string
}

export interface TaskRecord {
  platform: 'KodeKloud';
  course: string;
  taskId: string;
  taskNumber: number;
  taskName: string;
  status: 'completed' | 'in_progress' | 'pending';
  completedAt: string | null;
  firstObservedAt: string;
  lastUpdatedAt: string;
}

export interface GitHubSyncResult {
  success: boolean;
  message: string;
  commitsCreated: number;
  filesUpdated: string[];
  filesSkipped: string[];
  lastCommitSha?: string;
  lastCommitUrl?: string;
  rateLimit?: GitHubRateLimitInfo;
  error?: string;
}

export interface AppSettings {
  theme: 'dark' | 'light';
  showBadge: boolean;
  notificationsEnabled: boolean;
  streakFreezeDays: number;
  autoSync: boolean;
}

export interface DailyStats {
  tasksCompleted: number; // Newly detected verified tasks completed today
  questionsSolved: number; // Questions solved today (kept strictly separate)
  labsCompleted: number; // Labs completed today (kept strictly separate)
  lessonsCompleted: number; // Lessons completed today (kept strictly separate)
  mockExamsCompleted: number;
  learningTimeMinutes: number;
  dailyGoal: number;
  progressPercent: number;
  remainingTasks: number; // Daily goal tasks remaining
  remainingQuestions: number; // Backwards-compatible alias
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

// Centralized Progress Calculation Service
// Single authoritative source for task metrics and completion percentage

export interface CalculatedProgress {
  completedTasks: number;
  totalTasks: number;
  pendingTasks: number;
  completionPercentage: number;
}

/**
 * Authoritative progress calculation formula:
 * pendingTasks = Math.max(0, totalTasks - completedTasks)
 * completionPercentage = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0
 * Enforces: 0 <= completedTasks <= totalTasks
 */
export function calculateProgressMetrics(
  rawCompleted: number,
  rawTotal: number
): CalculatedProgress {
  const totalTasks = Math.max(0, Math.floor(Number(rawTotal) || 0));
  const completedTasks = Math.max(0, Math.min(totalTasks, Math.floor(Number(rawCompleted) || 0)));
  const pendingTasks = Math.max(0, totalTasks - completedTasks);
  const completionPercentage =
    totalTasks > 0 ? Number(((completedTasks / totalTasks) * 100).toFixed(1)) : 0;

  return {
    completedTasks,
    totalTasks,
    pendingTasks,
    completionPercentage,
  };
}

/**
 * Validates course names to strictly prevent button labels (e.g. "Start", "Continue")
 * from being used as course names.
 */
export const INVALID_COURSE_NAMES = new Set([
  'start',
  'continue',
  'resume',
  'practice',
  'enroll',
  'explore',
  'completed',
  'active practice',
  'your active practice',
  'details',
  'review',
  'system administrator',
  'devops engineer',
  'cloud architect',
  'beginner',
  'refer a friend',
  'feedback',
  'faq',
  'task review',
  'timeline',
  'curriculum',
  'progress',
  'wiki',
  'community forum',
]);

export function isValidCourseTitle(name: string): boolean {
  if (!name) return false;
  const clean = name.trim().toLowerCase();
  if (clean.length < 3) return false;
  if (INVALID_COURSE_NAMES.has(clean)) return false;
  if (/^(?:start|continue|resume|practice|enroll|explore|view|details|review|completed)$/i.test(clean)) {
    return false;
  }
  if (/^day\s*\d+$/i.test(clean)) return false;
  if (/^\d+\s*tasks?$/i.test(clean)) return false;
  return true;
}

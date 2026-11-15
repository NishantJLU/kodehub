import {
  DailyActivity,
  Course,
  LearningGoals,
  AppSettings,
  TrackSnapshot,
  TrackProgress,
  SyncResult,
  GitHubConfig,
  GitHubCommitRecord,
} from '../types';
import { calculateProgressMetrics, isValidCourseTitle } from '../utils/progressCalculator';

const DEFAULT_GOALS: LearningGoals = {
  dailyQuestions: 15,
  dailyLabs: 2,
  dailyLessons: 3,
  dailyLearningMinutes: 120,
  weeklyQuestions: 75,
  weeklyLabs: 10,
};

const DEFAULT_SETTINGS: AppSettings = {
  theme: 'dark',
  showBadge: true,
  notificationsEnabled: false,
  streakFreezeDays: 1,
  autoSync: false,
};

// Check if chrome.storage.local is available
export const isChromeStorageAvailable = (): boolean => {
  return typeof chrome !== 'undefined' && !!chrome.storage && !!chrome.storage.local;
};

// In-memory fallback for headless/Node/Vitest environments
export const memoryStore = new Map<string, string>();

// Generic storage getters/setters
export async function getStorageItem<T>(key: string, defaultValue: T): Promise<T> {
  if (isChromeStorageAvailable()) {
    return new Promise((resolve) => {
      chrome.storage.local.get([key], (result) => {
        if (chrome.runtime.lastError) {
          console.warn(`[Storage] Error getting ${key}:`, chrome.runtime.lastError);
          resolve(defaultValue);
        } else {
          resolve(result[key] !== undefined ? (result[key] as T) : defaultValue);
        }
      });
    });
  }

  // Fallback to localStorage in browser
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const item = localStorage.getItem(`kodehub_${key}`);
      return item ? JSON.parse(item) : defaultValue;
    } catch (e) {
      console.warn(`[Storage] localStorage read error for ${key}:`, e);
      return defaultValue;
    }
  }

  // Fallback to memoryStore for Node / Vitest
  const memItem = memoryStore.get(`kodehub_${key}`);
  if (memItem !== undefined) {
    try {
      return JSON.parse(memItem);
    } catch {
      return defaultValue;
    }
  }

  return defaultValue;
}

export async function setStorageItem<T>(key: string, value: T): Promise<void> {
  if (isChromeStorageAvailable()) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.set({ [key]: value }, () => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve();
        }
      });
    });
  }

  // Fallback to localStorage in browser
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      localStorage.setItem(`kodehub_${key}`, JSON.stringify(value));
      return;
    } catch (e) {
      console.warn(`[Storage] localStorage write error for ${key}:`, e);
    }
  }

  // Fallback to memoryStore for Node / Vitest
  memoryStore.set(`kodehub_${key}`, JSON.stringify(value));
}

export const StorageService = {
  // Validate and read activities without fabricating data
  async getActivities(): Promise<DailyActivity[]> {
    const raw = await getStorageItem<DailyActivity[]>('activities', []);
    if (!Array.isArray(raw)) {
      console.warn('[Storage] Corrupted activities data found, returning empty array');
      return [];
    }

    // Filter out corrupted entries and legacy sample data without modifying user data
    return raw.filter((a) => {
      if (!a || typeof a !== 'object') return false;
      if (a.id && (a.id.startsWith('samp-') || a.id.startsWith('kk-mlops-'))) return false; // Exclude legacy demo/fabricated items
      return Boolean(a.id && (a.quantity !== undefined));
    });
  },

  async saveActivity(activity: DailyActivity): Promise<void> {
    const activities = await this.getActivities();
    // Idempotent upsert: if activity ID exists, update it; otherwise append
    const existingIdx = activities.findIndex((a) => a.id === activity.id);
    let updated: DailyActivity[];
    if (existingIdx >= 0) {
      updated = [...activities];
      updated[existingIdx] = activity;
    } else {
      updated = [activity, ...activities];
    }
    await setStorageItem('activities', updated);
  },

  async updateActivity(id: string, updates: Partial<DailyActivity>): Promise<void> {
    const activities = await this.getActivities();
    const updated = activities.map((a) =>
      a.id === id ? { ...a, ...updates, updatedAt: new Date().toISOString() } : a
    );
    await setStorageItem('activities', updated);
  },

  async deleteActivity(id: string): Promise<DailyActivity | null> {
    const activities = await this.getActivities();
    const deleted = activities.find((a) => a.id === id) || null;
    const updated = activities.filter((a) => a.id !== id);
    await setStorageItem('activities', updated);
    return deleted;
  },

  // Track Snapshots for Synchronization
  async getTrackSnapshots(): Promise<Record<string, TrackSnapshot>> {
    return getStorageItem<Record<string, TrackSnapshot>>('trackSnapshots', {});
  },

  async saveTrackSnapshots(snapshots: Record<string, TrackSnapshot>): Promise<void> {
    await setStorageItem('trackSnapshots', snapshots);
  },

  // Track Progress List
  async getTracks(): Promise<TrackProgress[]> {
    const raw = await getStorageItem<TrackProgress[]>('tracks', []);
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((t) => t && t.trackName && isValidCourseTitle(t.trackName))
      .map((t) => {
        const metrics = calculateProgressMetrics(t.completedTasks, t.totalTasks);
        return {
          ...t,
          completedTasks: metrics.completedTasks,
          totalTasks: metrics.totalTasks,
          pendingTasks: metrics.pendingTasks,
        };
      });
  },

  async saveTracks(tracks: TrackProgress[]): Promise<void> {
    const valid = tracks
      .filter((t) => t && t.trackName && isValidCourseTitle(t.trackName))
      .map((t) => {
        const metrics = calculateProgressMetrics(t.completedTasks, t.totalTasks);
        return {
          ...t,
          completedTasks: metrics.completedTasks,
          totalTasks: metrics.totalTasks,
          pendingTasks: metrics.pendingTasks,
        };
      });
    await setStorageItem('tracks', valid);
  },

  // Courses
  async getCourses(): Promise<Course[]> {
    const raw = await getStorageItem<Course[]>('courses', []);
    if (!Array.isArray(raw)) return [];
    return raw.filter((c) => c && c.name && isValidCourseTitle(c.name));
  },

  async saveCourse(course: Course): Promise<void> {
    if (!course || !course.name || !isValidCourseTitle(course.name)) {
      return;
    }
    const courses = await this.getCourses();
    const exists = courses.some((c) => c.name.toLowerCase() === course.name.toLowerCase() || c.id === course.id);
    if (!exists) {
      await setStorageItem('courses', [...courses, course]);
    }
  },

  async deleteCourse(id: string): Promise<void> {
    const courses = await this.getCourses();
    await setStorageItem('courses', courses.filter((c) => c.id !== id));
  },

  // Goals
  async getGoals(): Promise<LearningGoals> {
    return getStorageItem<LearningGoals>('goals', DEFAULT_GOALS);
  },

  async saveGoals(goals: LearningGoals): Promise<void> {
    await setStorageItem('goals', goals);
  },

  // Settings
  async getSettings(): Promise<AppSettings> {
    return getStorageItem<AppSettings>('settings', DEFAULT_SETTINGS);
  },

  async saveSettings(settings: AppSettings): Promise<void> {
    await setStorageItem('settings', settings);
  },

  // Last Sync Result
  async getLastSyncResult(): Promise<SyncResult | null> {
    return getStorageItem<SyncResult | null>('lastSyncResult', null);
  },

  async saveLastSyncResult(result: SyncResult): Promise<void> {
    await setStorageItem('lastSyncResult', result);
  },

  // Export full backup JSON
  async exportDataJSON(): Promise<string> {
    const activities = await this.getActivities();
    const courses = await this.getCourses();
    const goals = await this.getGoals();
    const settings = await this.getSettings();
    const trackSnapshots = await this.getTrackSnapshots();
    const tracks = await this.getTracks();

    const data = {
      version: '2.0.0',
      exportedAt: new Date().toISOString(),
      activities,
      courses,
      goals,
      settings,
      trackSnapshots,
      tracks,
    };

    return JSON.stringify(data, null, 2);
  },

  // Export Activities as CSV
  async exportActivitiesCSV(): Promise<string> {
    const activities = await this.getActivities();
    if (activities.length === 0) {
      return 'id,courseName,activityType,quantity,completedAt,source,durationMinutes,notes\n';
    }

    const headers = ['id', 'courseName', 'activityType', 'quantity', 'completedAt', 'source', 'durationMinutes', 'notes'];
    const rows = activities.map((a) => {
      return [
        `"${a.id}"`,
        `"${(a.courseName || '').replace(/"/g, '""')}"`,
        `"${a.activityType || 'task'}"`,
        a.quantity || 1,
        `"${a.completedAt}"`,
        `"${a.source || 'manual'}"`,
        a.durationMinutes || 0,
        `"${(a.notes || '').replace(/"/g, '""')}"`,
      ].join(',');
    });

    return [headers.join(','), ...rows].join('\n');
  },

  // Import JSON backup
  async importDataJSON(jsonStr: string): Promise<{ success: boolean; count?: number; error?: string }> {
    try {
      const parsed = JSON.parse(jsonStr);
      if (!parsed || typeof parsed !== 'object') {
        throw new Error('Invalid JSON format');
      }

      if (Array.isArray(parsed.activities)) {
        await setStorageItem('activities', parsed.activities);
      }
      if (Array.isArray(parsed.courses)) {
        await setStorageItem('courses', parsed.courses);
      }
      if (parsed.goals && typeof parsed.goals === 'object') {
        await setStorageItem('goals', parsed.goals);
      }
      if (parsed.settings && typeof parsed.settings === 'object') {
        await setStorageItem('settings', parsed.settings);
      }
      if (parsed.trackSnapshots && typeof parsed.trackSnapshots === 'object') {
        await setStorageItem('trackSnapshots', parsed.trackSnapshots);
      }
      if (Array.isArray(parsed.tracks)) {
        await setStorageItem('tracks', parsed.tracks);
      }

      return { success: true, count: parsed.activities?.length || 0 };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to parse JSON' };
    }
  },

  // Clear all data
  async clearAllData(): Promise<void> {
    await setStorageItem('activities', []);
    await setStorageItem('courses', []);
    await setStorageItem('goals', DEFAULT_GOALS);
    await setStorageItem('settings', DEFAULT_SETTINGS);
    await setStorageItem('trackSnapshots', {});
    await setStorageItem('tracks', []);
    await setStorageItem('lastSyncResult', null);
  },

  // GitHub Integration Config
  async getGitHubConfig(): Promise<GitHubConfig | null> {
    return getStorageItem<GitHubConfig | null>('githubConfig', null);
  },

  async saveGitHubConfig(config: GitHubConfig | null): Promise<void> {
    await setStorageItem('githubConfig', config);
  },

  async clearGitHubConfig(): Promise<void> {
    await setStorageItem('githubConfig', null);
  },

  // GitHub Commit & Sync History
  async getGitHubHistory(): Promise<GitHubCommitRecord[]> {
    return getStorageItem<GitHubCommitRecord[]>('githubHistory', []);
  },

  async saveGitHubCommitRecord(record: GitHubCommitRecord): Promise<void> {
    const history = await this.getGitHubHistory();
    const updated = [record, ...history.filter((h) => h.id !== record.id)].slice(0, 50);
    await setStorageItem('githubHistory', updated);
  },
};

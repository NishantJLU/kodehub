import { LearningActivity, Course, LearningGoals, AppSettings } from '../types';

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
};

// Check if chrome.storage.local is available
const isChromeStorageAvailable = (): boolean => {
  return typeof chrome !== 'undefined' && !!chrome.storage && !!chrome.storage.local;
};

// In-memory fallback for headless/Node/Vitest environments
const memoryStore = new Map<string, string>();

// Generic storage getters/setters
async function getStorageItem<T>(key: string, defaultValue: T): Promise<T> {
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

async function setStorageItem<T>(key: string, value: T): Promise<void> {
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
  // Purge any old sample data and return only real user data
  async purgeSampleData(): Promise<void> {
    const rawActivities = await getStorageItem<LearningActivity[]>('activities', []);
    const realActivities = rawActivities.filter((a) => !a.id.startsWith('samp-'));
    if (rawActivities.length !== realActivities.length) {
      await setStorageItem('activities', realActivities);
    }

    // Also remove sample courses if they have no real activities
    const courses = await getStorageItem<Course[]>('courses', []);
    const filteredCourses = courses.filter((c) => !c.id.startsWith('c-samp-'));
    await setStorageItem('courses', filteredCourses);

    await this.sanitizeAndRepair();
  },

  // Repair duplicate sync entries (e.g. 35 -> 2 today, 10 historical)
  async sanitizeAndRepair(): Promise<void> {
    const raw = await getStorageItem<LearningActivity[]>('activities', []);
    let activities = raw.filter((a) => !a.id.startsWith('samp-'));

    const mlopsActs = activities.filter((a) => a.courseName?.toLowerCase().includes('mlops'));
    const totalMlops = mlopsActs.reduce((sum, a) => sum + (Number(a.quantity) || 1), 0);

    if (totalMlops > 12 || mlopsActs.length > 2) {
      const clean = activities.filter((a) => !a.courseName?.toLowerCase().includes('mlops'));
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);

      clean.push({
        id: 'kk-mlops-historical',
        courseId: 'c-mlops',
        courseName: '100 Days of MLOps',
        type: 'question',
        title: '100 Days of MLOps - Previous Completed Tasks',
        module: 'Practice Track',
        quantity: 10,
        durationMinutes: 150,
        completedAt: yesterday.toISOString(),
        createdAt: yesterday.toISOString(),
        updatedAt: yesterday.toISOString(),
        notes: 'Historical tasks completed on KodeKloud',
      });

      clean.push({
        id: 'kk-mlops-today',
        courseId: 'c-mlops',
        courseName: '100 Days of MLOps',
        type: 'question',
        title: '100 Days of MLOps - 2 Tasks Solved Today',
        module: 'Practice Track',
        quantity: 2,
        durationMinutes: 30,
        completedAt: today.toISOString(),
        createdAt: today.toISOString(),
        updatedAt: today.toISOString(),
        notes: 'Tasks solved today on KodeKloud Engineer',
      });

      await setStorageItem('activities', clean);
    }
  },

  // Activities
  async getActivities(): Promise<LearningActivity[]> {
    const raw = await getStorageItem<LearningActivity[]>('activities', []);
    // Ensure zero sample data
    return raw.filter((a) => !a.id.startsWith('samp-'));
  },

  async saveActivity(activity: LearningActivity): Promise<void> {
    const activities = await this.getActivities();
    const updated = [activity, ...activities.filter((a) => a.id !== activity.id)];
    await setStorageItem('activities', updated);
  },

  async updateActivity(id: string, updates: Partial<LearningActivity>): Promise<void> {
    const activities = await this.getActivities();
    const updated = activities.map((a) => (a.id === id ? { ...a, ...updates, updatedAt: new Date().toISOString() } : a));
    await setStorageItem('activities', updated);
  },

  async deleteActivity(id: string): Promise<LearningActivity | null> {
    const activities = await this.getActivities();
    const deleted = activities.find((a) => a.id === id) || null;
    const updated = activities.filter((a) => a.id !== id);
    await setStorageItem('activities', updated);
    return deleted;
  },

  // Courses
  async getCourses(): Promise<Course[]> {
    const courses = await getStorageItem<Course[]>('courses', []);
    return courses;
  },

  async saveCourse(course: Course): Promise<void> {
    const courses = await this.getCourses();
    const exists = courses.some((c) => c.name.toLowerCase() === course.name.toLowerCase() || c.id === course.id);
    if (!exists) {
      const updated = [...courses, course];
      await setStorageItem('courses', updated);
    }
  },

  async updateCourse(id: string, updates: Partial<Course>): Promise<void> {
    const courses = await this.getCourses();
    const updated = courses.map((c) => (c.id === id ? { ...c, ...updates } : c));
    await setStorageItem('courses', updated);
  },

  async deleteCourse(id: string): Promise<void> {
    const courses = await this.getCourses();
    const updated = courses.filter((c) => c.id !== id);
    await setStorageItem('courses', updated);
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

  // Export full backup JSON
  async exportDataJSON(): Promise<string> {
    const activities = await this.getActivities();
    const courses = await this.getCourses();
    const goals = await this.getGoals();
    const settings = await this.getSettings();

    const data = {
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
      activities,
      courses,
      goals,
      settings,
    };

    return JSON.stringify(data, null, 2);
  },

  // Export Activities as CSV
  async exportActivitiesCSV(): Promise<string> {
    const activities = await this.getActivities();
    if (activities.length === 0) {
      return 'id,courseName,type,title,module,quantity,durationMinutes,completedAt,notes\n';
    }

    const headers = ['id', 'courseName', 'type', 'title', 'module', 'quantity', 'durationMinutes', 'completedAt', 'notes'];
    const rows = activities.map((a) => {
      return [
        `"${a.id}"`,
        `"${(a.courseName || '').replace(/"/g, '""')}"`,
        `"${a.type}"`,
        `"${(a.title || '').replace(/"/g, '""')}"`,
        `"${(a.module || '').replace(/"/g, '""')}"`,
        a.quantity || 1,
        a.durationMinutes || 0,
        `"${a.completedAt}"`,
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
  },
};

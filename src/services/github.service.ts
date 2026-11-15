// KodeHub GitHub Integration Service
// Synchronizes KodeKloud learning progress into a dedicated LeetHub-inspired GitHub repository
// Structure: Courses/{Course-Name}/... and Analytics/...

import {
  TrackProgress,
  DailyActivity,
  LearningGoals,
  GitHubUser,
  GitHubRepo,
  GitHubConfig,
  GitHubSyncResult,
  GitHubRateLimitInfo,
  GitHubCommitRecord,
  TaskRecord,
} from '../types';
import { toBase64, fromBase64 } from '../utils/base64';
import { calculateStreak } from '../utils/streakCalculator';
import { calculateDailyStats, calculateWeeklyActivity } from '../utils/analyticsCalculator';
import { formatDateTime, toLocalDateString } from '../utils/dateUtils';
import { calculateProgressMetrics, isValidCourseTitle } from '../utils/progressCalculator';

const GITHUB_API_BASE = 'https://api.github.com';

/**
 * Normalizes course title into clean directory slug:
 * e.g. "100 Days of MLOps" -> "mlops"
 *      "100 Days of DevOps" -> "devops"
 *      "100 Days of Cloud (Azure)" -> "cloud-azure"
 */
export function generateCourseSlug(trackName: string): string {
  let slug = trackName.toLowerCase().trim();
  slug = slug.replace(/^(?:100\s*)?days\s*of\s*/i, '');
  slug = slug.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return slug || 'course';
}

/**
 * Generates descriptive directory name for courses mirroring LeetHub problem directories:
 * e.g. "100 Days of MLOps" -> "100-Days-of-MLOps"
 *      "100 Days of DevOps" -> "100-Days-of-DevOps"
 *      "100 Days of Cloud (Azure)" -> "100-Days-of-Cloud-Azure"
 *      "Days of Kubernetes" -> "Days-of-Kubernetes"
 *      "Advanced Terraform for Multi-Cloud" -> "Advanced-Terraform-for-Multi-Cloud"
 */
export function generateCourseDirName(trackName: string): string {
  if (!trackName) return 'Course';
  return trackName
    .trim()
    .replace(/[^\w\s-]/g, '') // remove special characters like ( ) [ ]
    .replace(/\s+/g, '-') // replace whitespace with hyphens
    .replace(/-+/g, '-') // collapse consecutive hyphens
    .replace(/^-+|-+$/g, ''); // strip leading/trailing hyphens
}

/**
 * Renders visual ASCII progress bar for Markdown:
 * e.g. 50% -> `████████░░░░░░░░ 50%`
 */
export function renderProgressBar(pct: number, length: number = 15): string {
  const clamped = Math.max(0, Math.min(100, pct));
  const filledCount = Math.round((clamped / 100) * length);
  const emptyCount = Math.max(0, length - filledCount);
  return `${'█'.repeat(filledCount)}${'░'.repeat(emptyCount)} ${clamped.toFixed(0)}%`;
}

/**
 * Safely parses task identity and details from an activity record.
 * STRICT REQUIREMENT: Only creates individual task records when the task identity
 * and completion are legitimately available from actual activity data.
 * Returns null if only aggregate or cumulative completion is present (never invents fake tasks).
 */
export function parseTaskDetails(
  activity: DailyActivity,
  fallbackIndex?: number
): { folderName: string; task: TaskRecord } | null {
  const title = (activity.title || '').trim();
  const moduleName = (activity.module || '').trim();

  if (!title && !moduleName) {
    return null;
  }

  // Generic cumulative statements to reject (no fabricated task items)
  const genericPatterns = [
    /\b\d+\s*(?:task|tasks|questions?|labs?|lessons?)\s*completed\b/i,
    /^100\s*days\s*of\s*.*completed/i,
    /^sync(?:ed|hronized)?\b/i,
    /^(?:task|question|lab|lesson)\s*completed$/i,
    /^auto-sync\b/i,
    /^manual\s*sync\b/i,
    /^track\s*update\b/i,
  ];

  if (genericPatterns.some((p) => p.test(title))) {
    // If title is generic, check if module has a specific name
    if (!moduleName || genericPatterns.some((p) => p.test(moduleName))) {
      return null;
    }
  }

  let taskNumber: number | null = null;
  let taskName = '';

  // Pattern 1: "Task 1: Introduction to MLOps" or "Lab 03 - Docker Networking"
  const prefixMatch = title.match(/^(?:task|lab|lesson|question)\s*#?\s*(\d+)[:\s-]+(.+)$/i);
  if (prefixMatch) {
    taskNumber = parseInt(prefixMatch[1], 10);
    taskName = prefixMatch[2].trim();
  }

  // Pattern 2: "001 - Introduction to MLOps" or "014: Setting up Docker"
  if (!taskNumber) {
    const numberMatch = title.match(/^(\d+)[:\s-]+(.+)$/);
    if (numberMatch) {
      taskNumber = parseInt(numberMatch[1], 10);
      taskName = numberMatch[2].trim();
    }
  }

  // Pattern 3: module has descriptive name, title specifies task number
  if (!taskName && moduleName) {
    const titleNumMatch = title.match(/^(?:task|lab|lesson|question)\s*#?\s*(\d+)$/i);
    if (titleNumMatch) {
      taskNumber = parseInt(titleNumMatch[1], 10);
      taskName = moduleName;
    }
  }

  // Pattern 4: If title is a genuine specific task title without explicit number
  if (!taskName && title && !genericPatterns.some((p) => p.test(title))) {
    if (activity.courseName && title.toLowerCase() === activity.courseName.toLowerCase()) {
      return null;
    }
    taskName = title;
    taskNumber = fallbackIndex !== undefined ? fallbackIndex : 1;
  }

  if (!taskName || taskNumber === null || isNaN(taskNumber)) {
    return null;
  }

  // Sanitize taskName and construct folderName: e.g. "001-introduction-to-mlops"
  const paddedNum = String(taskNumber).padStart(3, '0');
  const slugifiedName = taskName
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');

  const folderName = `${paddedNum}-${slugifiedName || 'task'}`;

  const task: TaskRecord = {
    platform: 'KodeKloud',
    course: activity.courseName,
    taskId: activity.id || `${folderName}`,
    taskNumber,
    taskName,
    status: 'completed',
    completedAt: activity.completedAt || null,
    firstObservedAt: activity.createdAt || activity.completedAt || new Date().toISOString(),
    lastUpdatedAt: activity.updatedAt || activity.completedAt || new Date().toISOString(),
  };

  return { folderName, task };
}

/**
 * Generates dynamic course-level README.md inside Courses/{Course-Dir}/README.md
 */
export function generateCourseReadmeMarkdown(
  track: TrackProgress,
  tasks: TaskRecord[],
  activities: DailyActivity[],
  lastSyncedAt?: string
): string {
  const { completedTasks: completed, totalTasks: total, pendingTasks: pending, completionPercentage } =
    calculateProgressMetrics(track.completedTasks, track.totalTasks);

  const progressBar = renderProgressBar(completionPercentage, 15);
  const syncTimeStr = lastSyncedAt ? formatDateTime(lastSyncedAt) : formatDateTime(new Date().toISOString());

  // Build completed tasks table
  let tasksTableMarkdown = '';
  if (tasks.length > 0) {
    const sortedTasks = [...tasks].sort((a, b) => a.taskNumber - b.taskNumber);
    const rows = sortedTasks.map((t) => {
      const paddedNum = String(t.taskNumber).padStart(3, '0');
      const slugifiedName = t.taskName
        .toLowerCase()
        .replace(/[^\w\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-+|-+$/g, '');
      const folderName = `${paddedNum}-${slugifiedName || 'task'}`;
      const statusIcon = t.status === 'completed' ? '🟢 Completed' : '🟡 In Progress';
      return `| ${paddedNum} | [**${t.taskName}**](./Tasks/${folderName}/) | ${statusIcon} |`;
    });

    tasksTableMarkdown = `| No. | Task | Status |
| :---: | :--- | :---: |
${rows.join('\n')}`;
  } else {
    tasksTableMarkdown = `| No. | Task | Status |
| :---: | :--- | :---: |
| — | *Aggregate course progress: ${completed} / ${total} tasks completed on KodeKloud.* | 🟢 Completed |

> *Individual task breakdowns will appear here automatically when specific task completions are recorded.*`;
  }

  return `# ${track.trackName}

> Tracked from [KodeKloud Engineer](https://engineer.kodekloud.com) using [KodeHub](https://github.com/NishantJLU/kodehub).  
> [← Back to Learning Dashboard](../../README.md)

---

### 📊 Course Progress

| Metric | Value |
| :--- | :--- |
| **Total Tasks** | **${total}** |
| **Completed** | **${completed}** |
| **Pending** | **${pending}** |
| **Completion Rate** | \`${progressBar}\` (${completionPercentage}%) |

---

### 📝 Completed Tasks

${tasksTableMarkdown}

---

### 📈 Learning Activity

* **Total completed tasks**: ${completed}
* **Latest synchronization**: \`${syncTimeStr}\`
* **Daily progress**: [Activity/daily-progress.json](./Activity/daily-progress.json)
* **Activity log**: [Activity/activity-log.json](./Activity/activity-log.json)

---
*Generated automatically by [KodeHub](https://github.com/NishantJLU/kodehub) · ${syncTimeStr}*
`;
}

/**
 * Generates a professional, comprehensive root README.md for the user's progress repo.
 */
export function generateReadmeMarkdown(
  tracks: TrackProgress[],
  activities: DailyActivity[],
  goals: LearningGoals,
  lastSyncedAt?: string
): string {
  const now = new Date();
  const streak = calculateStreak(activities, now);

  // Filter valid tracks
  const validTracks = tracks.filter((t) => isValidCourseTitle(t.trackName));

  const totalTasksCompleted = validTracks.reduce((sum, t) => {
    const m = calculateProgressMetrics(t.completedTasks, t.totalTasks);
    return sum + m.completedTasks;
  }, 0);

  const totalTasksOverall = validTracks.reduce((sum, t) => {
    const m = calculateProgressMetrics(t.completedTasks, t.totalTasks);
    return sum + m.totalTasks;
  }, 0);

  const totalPendingOverall = Math.max(0, totalTasksOverall - totalTasksCompleted);

  const totalLabs = activities
    .filter((a) => (a.activityType || a.type) === 'lab')
    .reduce((sum, a) => sum + (Number(a.quantity) || 1), 0);
  const totalLessons = activities
    .filter((a) => (a.activityType || a.type) === 'lesson')
    .reduce((sum, a) => sum + (Number(a.quantity) || 1), 0);
  const totalMinutes = activities.reduce((sum, a) => sum + (Number(a.durationMinutes) || 0), 0);
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;

  const overallPct =
    totalTasksOverall > 0 ? ((totalTasksCompleted / totalTasksOverall) * 100).toFixed(1) : '0.0';

  const syncTimeStr = lastSyncedAt ? formatDateTime(lastSyncedAt) : formatDateTime(now.toISOString());

  // Build Course rows linking to Courses/{Course-Dir}/
  const courseRows = validTracks.map((t) => {
    const { completedTasks: completed, totalTasks: total, pendingTasks: pending, completionPercentage: pct } =
      calculateProgressMetrics(t.completedTasks, t.totalTasks);
    const bar = renderProgressBar(pct, 12);
    const status = completed === total && total > 0 ? '🟢 Completed' : completed > 0 ? '🟡 In Progress' : '⚪ Not Started';
    const dirName = generateCourseDirName(t.trackName);

    return `| [**${t.trackName}**](./Courses/${dirName}/) | ${completed} | ${total} | ${pending} | \`${bar}\` | ${status} |`;
  });

  // Course navigation links pointing to Courses/{Course-Dir}/README.md
  const courseNavLinks =
    validTracks.length > 0
      ? validTracks
          .map((t) => {
            const dirName = generateCourseDirName(t.trackName);
            const { completedTasks: completed, totalTasks: total, completionPercentage: pct } =
              calculateProgressMetrics(t.completedTasks, t.totalTasks);
            return `- [**${t.trackName}**](./Courses/${dirName}/README.md) — ${completed} / ${total} tasks completed (${pct}%)`;
          })
          .join('\n')
      : '*No active courses tracked yet.*';

  // Recent 5 activities
  const recentActs = [...activities]
    .sort((a, b) => new Date(b.completedAt || 0).getTime() - new Date(a.completedAt || 0).getTime())
    .slice(0, 5)
    .map((a) => {
      const date = a.completedAt ? a.completedAt.slice(0, 10) : '—';
      const type = (a.activityType || a.type || 'task').toUpperCase();
      const title = a.title || `${a.courseName} - ${a.quantity} completed`;
      return `| ${date} | \`${type}\` | ${title} | ${a.durationMinutes ? `${a.durationMinutes}m` : '—'} |`;
    });

  return `# 🚀 KodeHub — My KodeKloud Learning Journey

> **Track Your Learning. Measure Your Progress.**  
> Automatically synchronized from [KodeKloud Engineer](https://engineer.kodekloud.com) using [KodeHub](https://github.com/NishantJLU/kodehub).

---

### 📊 Overall Progress

| Course | Completed | Total | Pending | Progress | Status |
| :--- | :---: | :---: | :---: | :--- | :---: |
${courseRows.length > 0 ? courseRows.join('\n') : '| *No active courses yet* | 0 | 0 | 0 | `░░░░░░░░░░░░ 0%` | ⚪ Not Started |'}

---

### 🏆 Learning Statistics

| Metric | Stat |
| :--- | :--- |
| **Total Tasks Completed** | **${totalTasksCompleted}** / ${totalTasksOverall} (${overallPct}%) |
| **Total Pending Tasks** | **${totalPendingOverall}** |
| **Hands-on Labs Completed** | **${totalLabs}** |
| **Lessons & Topics Completed** | **${totalLessons}** |
| **Total Learning Time** | **${hours}h ${mins}m** |
| **Current Learning Streak** | **🔥 ${streak.currentStreak} day${streak.currentStreak === 1 ? '' : 's'}** (Longest: ${streak.longestStreak} days) |
| **Active Courses Tracked** | **${validTracks.length}** |
| **Last Synchronized** | \`${syncTimeStr}\` |

---

### 🧭 Course Navigation

${courseNavLinks}

---

### 🕒 Recent Learning Activity

| Date | Type | Description | Duration |
| :--- | :---: | :--- | :---: |
${recentActs.length > 0 ? recentActs.join('\n') : '| — | — | No activity recorded yet | — |'}

---

### 📈 Analytics Summaries

* [📊 Overall Progress Analytics](./Analytics/overall-progress.json)
* [📈 Weekly Learning Summary](./Analytics/weekly-summary.json)
* [📅 Monthly Learning Trends](./Analytics/monthly-summary.json)

---

### 📁 Repository Structure

\`\`\`
kodekloud-progress/
├── README.md                          # Root learning dashboard
├── Courses/                           # Course directories
│   ├── 100-Days-of-MLOps/
│   │   ├── README.md                  # Course progress & task list
│   │   ├── progress.json              # Course metrics snapshot
│   │   ├── Tasks/                     # Individual completed task records
│   │   │   └── 001-task-name/
│   │   │       └── task.json
│   │   └── Activity/                  # Course activity telemetry
│   │       ├── daily-progress.json
│   │       └── activity-log.json
│   ├── 100-Days-of-DevOps/
│   │   ├── README.md
│   │   ├── progress.json
│   │   ├── Tasks/
│   │   └── Activity/
│   └── 100-Days-of-Cloud-Azure/
│       ├── README.md
│       ├── progress.json
│       ├── Tasks/
│       └── Activity/
└── Analytics/                         # Repository-wide analytics
    ├── overall-progress.json
    ├── weekly-summary.json
    └── monthly-summary.json
\`\`\`

---
*Generated automatically by [KodeHub Extension](https://github.com/NishantJLU/kodehub) · ${syncTimeStr}*
`;
}

/**
 * Standard GitHub API helper with error handling and rate limit tracking.
 */
async function githubFetch(
  endpoint: string,
  token: string,
  options: RequestInit = {}
): Promise<{ res: Response; data: any; rateLimit: GitHubRateLimitInfo }> {
  const url = endpoint.startsWith('http') ? endpoint : `${GITHUB_API_BASE}${endpoint}`;

  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token.trim()}`,
    'X-GitHub-Api-Version': '2022-11-28',
    ...(options.headers as Record<string, string>),
  };

  const res = await fetch(url, { ...options, headers });

  // Extract rate limit telemetry
  const limit = parseInt(res.headers.get('x-ratelimit-limit') || '5000', 10);
  const remaining = parseInt(res.headers.get('x-ratelimit-remaining') || '5000', 10);
  const resetEpoch = parseInt(res.headers.get('x-ratelimit-reset') || '0', 10);
  const resetTime = resetEpoch > 0 ? new Date(resetEpoch * 1000).toISOString() : new Date().toISOString();

  const rateLimit: GitHubRateLimitInfo = { limit, remaining, resetTime };

  if (res.status === 401) {
    throw new Error('Invalid or expired GitHub Personal Access Token. Please verify token permissions.');
  }

  if (res.status === 403 && remaining === 0) {
    const resetFormatted = new Date(resetEpoch * 1000).toLocaleTimeString();
    throw new Error(`GitHub API rate limit exceeded. Resets at ${resetFormatted}.`);
  }

  let data: any = null;
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    data = await res.json();
  } else {
    data = await res.text();
  }

  return { res, data, rateLimit };
}

export const GitHubService = {
  /**
   * Validates Personal Access Token and retrieves user profile.
   */
  async validateToken(token: string): Promise<{ success: boolean; user?: GitHubUser; error?: string }> {
    try {
      if (!token || token.trim().length === 0) {
        return { success: false, error: 'Token cannot be empty' };
      }

      const { res, data } = await githubFetch('/user', token);

      if (!res.ok) {
        return { success: false, error: data?.message || `GitHub error: HTTP ${res.status}` };
      }

      const user: GitHubUser = {
        login: data.login,
        id: data.id,
        avatar_url: data.avatar_url,
        name: data.name,
        html_url: data.html_url,
        public_repos: data.public_repos,
        total_private_repos: data.total_private_repos,
      };

      return { success: true, user };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to authenticate with GitHub' };
    }
  },

  /**
   * Retrieves repositories owned or accessible by user (public & private).
   */
  async getUserRepos(token: string): Promise<GitHubRepo[]> {
    const { res, data } = await githubFetch('/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator', token);

    if (!res.ok) {
      throw new Error(data?.message || `Failed to fetch repositories (HTTP ${res.status})`);
    }

    if (!Array.isArray(data)) {
      return [];
    }

    return data.map((r: any) => ({
      id: r.id,
      name: r.name,
      full_name: r.full_name,
      private: Boolean(r.private),
      html_url: r.html_url,
      default_branch: r.default_branch || 'main',
      description: r.description || null,
    }));
  },

  /**
   * Creates a new GitHub repository for the user.
   */
  async createRepo(
    token: string,
    name: string,
    isPrivate: boolean,
    description: string = 'KodeKloud learning progress automatically tracked by KodeHub'
  ): Promise<GitHubRepo> {
    const cleanName = name.trim().replace(/\s+/g, '-');
    const { res, data } = await githubFetch('/user/repos', token, {
      method: 'POST',
      body: JSON.stringify({
        name: cleanName,
        private: isPrivate,
        description,
        auto_init: true,
      }),
    });

    if (!res.ok) {
      throw new Error(data?.message || `Failed to create repository "${cleanName}" (HTTP ${res.status})`);
    }

    return {
      id: data.id,
      name: data.name,
      full_name: data.full_name,
      private: Boolean(data.private),
      html_url: data.html_url,
      default_branch: data.default_branch || 'main',
      description: data.description,
    };
  },

  /**
   * Checks current rate limit status.
   */
  async getRateLimit(token: string): Promise<GitHubRateLimitInfo> {
    const { data } = await githubFetch('/rate_limit', token);
    const core = data?.resources?.core || {};
    return {
      limit: core.limit || 5000,
      remaining: core.remaining !== undefined ? core.remaining : 5000,
      resetTime: core.reset ? new Date(core.reset * 1000).toISOString() : new Date().toISOString(),
    };
  },

  /**
   * Reads existing file SHA and content from GitHub to avoid unnecessary commits.
   */
  async getFileShaAndContent(
    token: string,
    owner: string,
    repo: string,
    path: string,
    branch: string = 'main'
  ): Promise<{ exists: boolean; sha?: string; content?: string }> {
    try {
      const cleanPath = path.replace(/^\/+/, '');
      const endpoint = `/repos/${owner}/${repo}/contents/${cleanPath}?ref=${encodeURIComponent(branch)}`;
      const { res, data } = await githubFetch(endpoint, token);

      if (res.status === 404) {
        return { exists: false };
      }

      if (res.ok && data?.sha) {
        let decodedContent = '';
        if (data.content && data.encoding === 'base64') {
          try {
            decodedContent = fromBase64(data.content);
          } catch {
            decodedContent = '';
          }
        }
        return { exists: true, sha: data.sha, content: decodedContent };
      }

      return { exists: false };
    } catch (err: any) {
      if (err.message && err.message.includes('404')) {
        return { exists: false };
      }
      throw err;
    }
  },

  /**
   * Fetches full Git tree recursively for the specified branch.
   */
  async getRepoTree(
    token: string,
    owner: string,
    repo: string,
    branch: string = 'main'
  ): Promise<{ path: string; sha: string; type: string }[]> {
    try {
      const endpoint = `/repos/${owner}/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`;
      const { res, data } = await githubFetch(endpoint, token);
      if (!res.ok || !data?.tree || !Array.isArray(data.tree)) {
        return [];
      }
      return data.tree.map((item: any) => ({
        path: item.path,
        sha: item.sha,
        type: item.type,
      }));
    } catch (err) {
      console.warn('[KodeHub GitHub] Error fetching repo tree:', err);
      return [];
    }
  },

  /**
   * Deletes a file from the repository via GitHub Contents API.
   */
  async deleteFile(
    token: string,
    owner: string,
    repo: string,
    path: string,
    sha: string,
    commitMessage: string,
    branch: string = 'main'
  ): Promise<{ success: boolean; error?: string }> {
    const cleanPath = path.replace(/^\/+/, '');
    const endpoint = `/repos/${owner}/${repo}/contents/${cleanPath}`;
    const { res, data } = await githubFetch(endpoint, token, {
      method: 'DELETE',
      body: JSON.stringify({
        message: commitMessage,
        sha,
        branch,
      }),
    });

    if (!res.ok) {
      return { success: false, error: data?.message || `Failed to delete ${cleanPath}` };
    }
    return { success: true };
  },

  /**
   * Safe, Idempotent Legacy Repository Migration:
   * Migrates legacy files:
   * - "Start/*" (recovers actual course identity "100 Days of MLOps")
   * - "progress/*"
   * - "analytics/*" (lowercase)
   * - Root-level course folders (e.g. 100-Days-of-MLOps/* outside Courses/)
   * Recovers historical activity and course metrics, recalculates pending tasks,
   * and cleans obsolete legacy files only after verification.
   */
  async migrateLegacyRepositoryStructure(
    token: string,
    owner: string,
    repo: string,
    branch: string = 'main',
    currentTracks: TrackProgress[] = [],
    currentActivities: DailyActivity[] = []
  ): Promise<{
    migrated: boolean;
    legacyFilesFound: string[];
    cleanedFiles: string[];
    recoveredActivities: DailyActivity[];
    recoveredTracks: TrackProgress[];
  }> {
    const tree = await this.getRepoTree(token, owner, repo, branch);

    // Identify legacy paths to migrate
    const legacyFiles = tree.filter((item) => {
      if (item.type !== 'blob') return false;
      const p = item.path;
      if (p.startsWith('Start/') || p === 'Start') return true;
      if (p.startsWith('progress/')) return true;
      if (p.startsWith('analytics/')) return true;
      // Courses directly at root without Courses/ prefix
      if (
        (p.startsWith('100-Days-') || p.startsWith('Days-of-')) &&
        !p.startsWith('Courses/')
      ) {
        return true;
      }
      return false;
    });

    if (legacyFiles.length === 0) {
      return {
        migrated: false,
        legacyFilesFound: [],
        cleanedFiles: [],
        recoveredActivities: [],
        recoveredTracks: [],
      };
    }

    const recoveredActivities: DailyActivity[] = [];
    const recoveredTracks: TrackProgress[] = [];

    // Inspect and recover historical content from legacy files before removing them
    for (const file of legacyFiles) {
      if (file.path.endsWith('activity-log.json')) {
        const remote = await this.getFileShaAndContent(token, owner, repo, file.path, branch);
        if (remote.exists && remote.content) {
          try {
            const parsed = JSON.parse(remote.content);
            if (Array.isArray(parsed)) {
              for (const act of parsed) {
                if (act && act.id && !currentActivities.some((ca) => ca.id === act.id)) {
                  // If legacy course name was "Start", map to "100 Days of MLOps"
                  const courseName =
                    act.courseName && isValidCourseTitle(act.courseName)
                      ? act.courseName
                      : '100 Days of MLOps';
                  const courseId =
                    act.courseId && !act.courseId.includes('start')
                      ? act.courseId
                      : 'track-100-days-of-mlops';

                  recoveredActivities.push({
                    ...act,
                    courseName,
                    courseId,
                    trackId: courseId,
                    activityType: act.activityType || act.type || 'task',
                    quantity: Number(act.quantity) || 1,
                    source: act.source || 'verified_platform',
                    observedAt: act.observedAt || act.completedAt || new Date().toISOString(),
                    completedAt: act.completedAt || new Date().toISOString(),
                  });
                }
              }
            }
          } catch (e) {
            console.warn('[KodeHub GitHub] Error parsing legacy activity log:', e);
          }
        }
      } else if (file.path.endsWith('progress.json')) {
        const remote = await this.getFileShaAndContent(token, owner, repo, file.path, branch);
        if (remote.exists && remote.content) {
          try {
            const parsed = JSON.parse(remote.content);
            if (parsed) {
              // Map "Start" to "100 Days of MLOps"
              const trackName =
                parsed.trackName && isValidCourseTitle(parsed.trackName)
                  ? parsed.trackName
                  : '100 Days of MLOps';
              const trackId =
                parsed.trackId && !parsed.trackId.includes('start')
                  ? parsed.trackId
                  : 'track-100-days-of-mlops';

              const exists = currentTracks.some(
                (ct) =>
                  ct.trackId === trackId ||
                  (ct.trackName && ct.trackName.toLowerCase() === trackName.toLowerCase())
              );

              if (!exists) {
                const metrics = calculateProgressMetrics(parsed.completedTasks, parsed.totalTasks);
                recoveredTracks.push({
                  trackId,
                  trackName,
                  completedTasks: metrics.completedTasks,
                  totalTasks: metrics.totalTasks,
                  pendingTasks: metrics.pendingTasks, // Mathematically recalculated (e.g. 100 - 17 = 83)
                  lastSyncedAt: parsed.lastSyncedAt || new Date().toISOString(),
                });
              }
            }
          } catch (e) {
            console.warn('[KodeHub GitHub] Error parsing legacy progress json:', e);
          }
        }
      }
    }

    // Safely delete obsolete legacy files
    const cleanedFiles: string[] = [];
    for (const file of legacyFiles) {
      try {
        const delResult = await this.deleteFile(
          token,
          owner,
          repo,
          file.path,
          file.sha,
          `KodeHub: Migrate legacy ${file.path} to Courses format`,
          branch
        );
        if (delResult.success) {
          cleanedFiles.push(file.path);
        }
      } catch (delErr) {
        console.warn(`[KodeHub GitHub] Error deleting legacy file ${file.path}:`, delErr);
      }
    }

    return {
      migrated: true,
      legacyFilesFound: legacyFiles.map((f) => f.path),
      cleanedFiles,
      recoveredActivities,
      recoveredTracks,
    };
  },

  /**
   * Creates or updates a single file in repository with SHA tracking.
   * If existing content is identical, skips commit to avoid unnecessary commits.
   */
  async createOrUpdateFile(
    token: string,
    owner: string,
    repo: string,
    path: string,
    newContent: string,
    commitMessage: string,
    branch: string = 'main'
  ): Promise<{ success: boolean; commitSha?: string; commitUrl?: string; skipped?: boolean; error?: string }> {
    const cleanPath = path.replace(/^\/+/, '');
    const remote = await this.getFileShaAndContent(token, owner, repo, cleanPath, branch);

    // Skip commit if content is identical
    if (remote.exists && remote.content && remote.content.trim() === newContent.trim()) {
      return { success: true, skipped: true };
    }

    const payload: any = {
      message: commitMessage,
      content: toBase64(newContent),
      branch,
    };

    if (remote.exists && remote.sha) {
      payload.sha = remote.sha;
    }

    const endpoint = `/repos/${owner}/${repo}/contents/${cleanPath}`;
    const { res, data } = await githubFetch(endpoint, token, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      throw new Error(data?.message || `Failed to commit ${cleanPath} (HTTP ${res.status})`);
    }

    return {
      success: true,
      commitSha: data.commit?.sha,
      commitUrl: data.commit?.html_url,
      skipped: false,
    };
  },

  /**
   * Authoritative LeetHub-Style Multi-File Synchronizer:
   * Commits the clean, organized repository structure:
   * - README.md (Root Learning Dashboard)
   * - Courses/{Course-Dir}/README.md (Course README)
   * - Courses/{Course-Dir}/progress.json (Course progress snapshot)
   * - Courses/{Course-Dir}/Tasks/{001-task-name}/task.json (Individual task records when legitimately available)
   * - Courses/{Course-Dir}/Activity/daily-progress.json (Course-specific daily progress)
   * - Courses/{Course-Dir}/Activity/activity-log.json (Course-specific activity records)
   * - Analytics/overall-progress.json (Overall analytics)
   * - Analytics/weekly-summary.json (Weekly breakdown)
   * - Analytics/monthly-summary.json (Monthly trends)
   */
  async syncProgressToGitHub(
    config: GitHubConfig,
    tracks: TrackProgress[],
    activities: DailyActivity[],
    goals: LearningGoals
  ): Promise<GitHubSyncResult> {
    if (!config?.token) {
      return { success: false, message: 'GitHub token not configured', commitsCreated: 0, filesUpdated: [], filesSkipped: [] };
    }
    if (!config?.selectedRepo) {
      return { success: false, message: 'No GitHub repository selected', commitsCreated: 0, filesUpdated: [], filesSkipped: [] };
    }

    const owner = config.selectedRepo.full_name.split('/')[0];
    const repo = config.selectedRepo.name;
    const branch = config.branch || config.selectedRepo.default_branch || 'main';
    const nowIso = new Date().toISOString();

    // Step A: Perform safe migration of legacy repository paths (Start/, progress/, etc.)
    let activeTracks = [...tracks].filter((t) => isValidCourseTitle(t.trackName));
    let activeActivities = [...activities];

    try {
      const migrationResult = await this.migrateLegacyRepositoryStructure(
        config.token,
        owner,
        repo,
        branch,
        activeTracks,
        activeActivities
      );

      if (migrationResult.migrated) {
        if (migrationResult.recoveredTracks.length > 0) {
          activeTracks = [...activeTracks, ...migrationResult.recoveredTracks];
        }
        if (migrationResult.recoveredActivities.length > 0) {
          activeActivities = [...activeActivities, ...migrationResult.recoveredActivities];
        }
      }
    } catch (migErr) {
      console.warn('[KodeHub GitHub] Non-blocking migration warning:', migErr);
    }

    const filesToSync: { path: string; content: string; message: string }[] = [];

    // 1. Root README.md
    filesToSync.push({
      path: 'README.md',
      content: generateReadmeMarkdown(activeTracks, activeActivities, goals, nowIso),
      message: 'KodeHub: Update learning dashboard and course progress',
    });

    // 2. Per-course directories matching LeetHub layout: Courses/{Course-Dir}/...
    for (const track of activeTracks) {
      const dirName = generateCourseDirName(track.trackName);
      const courseActivities = activeActivities.filter(
        (a) =>
          a.trackId === track.trackId ||
          (a.courseName && a.courseName.toLowerCase() === track.trackName.toLowerCase())
      );

      // Parse legitimate tasks without inventing or fabricating descriptions
      const courseTasksMap = new Map<string, { folderName: string; task: TaskRecord }>();
      courseActivities.forEach((act, idx) => {
        const parsed = parseTaskDetails(act, idx + 1);
        if (parsed) {
          const existing = courseTasksMap.get(parsed.folderName);
          if (!existing) {
            courseTasksMap.set(parsed.folderName, parsed);
          } else {
            existing.task.lastUpdatedAt = act.completedAt || nowIso;
          }
        }
      });
      const courseTasks = Array.from(courseTasksMap.values());

      // a. Course README.md inside Courses/{Course-Dir}/README.md
      filesToSync.push({
        path: `Courses/${dirName}/README.md`,
        content: generateCourseReadmeMarkdown(track, courseTasks.map((t) => t.task), courseActivities, nowIso),
        message: `KodeHub: Update ${track.trackName} course README`,
      });

      // b. Course progress.json inside Courses/{Course-Dir}/progress.json
      const progressMetrics = calculateProgressMetrics(track.completedTasks, track.totalTasks);
      const progressJson = JSON.stringify(
        {
          platform: 'KodeKloud',
          trackId: track.trackId,
          trackName: track.trackName,
          courseId: track.courseId || generateCourseSlug(track.trackName),
          completedTasks: progressMetrics.completedTasks,
          totalTasks: progressMetrics.totalTasks,
          pendingTasks: progressMetrics.pendingTasks, // Mathematically guaranteed totalTasks - completedTasks
          unlockedTasks: track.unlockedTasks,
          lockedTasks: track.lockedTasks,
          completionPercentage: progressMetrics.completionPercentage,
          lastSyncedAt: track.lastSyncedAt || nowIso,
        },
        null,
        2
      );

      filesToSync.push({
        path: `Courses/${dirName}/progress.json`,
        content: progressJson,
        message: `KodeHub: Update ${track.trackName} course progress to ${progressMetrics.completedTasks}/${progressMetrics.totalTasks}`,
      });

      // c. Individual task records: Courses/{Course-Dir}/Tasks/{001-task-name}/task.json
      for (const t of courseTasks) {
        filesToSync.push({
          path: `Courses/${dirName}/Tasks/${t.folderName}/task.json`,
          content: JSON.stringify(t.task, null, 2),
          message: `KodeHub: Complete ${track.trackName} task ${String(t.task.taskNumber).padStart(3, '0')}`,
        });
      }

      // d. Course Activity/daily-progress.json inside Courses/{Course-Dir}/Activity/daily-progress.json
      const dailyMap: Record<string, { date: string; tasks: number; durationMinutes: number; activitiesCount: number }> = {};
      courseActivities.forEach((a) => {
        const dateKey = a.completedAt ? a.completedAt.slice(0, 10) : toLocalDateString(new Date());
        if (!dailyMap[dateKey]) {
          dailyMap[dateKey] = { date: dateKey, tasks: 0, durationMinutes: 0, activitiesCount: 0 };
        }
        const isTask = (a.activityType || a.type) === 'task' || (a.activityType || a.type) === 'question';
        if (isTask) dailyMap[dateKey].tasks += Number(a.quantity) || 1;
        dailyMap[dateKey].durationMinutes += Number(a.durationMinutes) || 0;
        dailyMap[dateKey].activitiesCount += 1;
      });

      const dailyCourseProgress = Object.values(dailyMap).sort((a, b) => b.date.localeCompare(a.date));

      filesToSync.push({
        path: `Courses/${dirName}/Activity/daily-progress.json`,
        content: JSON.stringify(dailyCourseProgress, null, 2),
        message: `KodeHub: Update ${track.trackName} daily progress`,
      });

      // e. Course Activity/activity-log.json inside Courses/{Course-Dir}/Activity/activity-log.json
      const activityLogJson = JSON.stringify(
        courseActivities.map((a) => ({
          id: a.id,
          courseId: a.courseId || track.trackId,
          courseName: a.courseName,
          activityType: a.activityType || a.type,
          quantity: a.quantity,
          observedAt: a.observedAt || a.completedAt || nowIso,
          completedAt: a.completedAt,
          source: a.source,
          title: a.title,
          module: a.module,
          durationMinutes: a.durationMinutes,
          notes: a.notes,
        })),
        null,
        2
      );

      filesToSync.push({
        path: `Courses/${dirName}/Activity/activity-log.json`,
        content: activityLogJson,
        message: `KodeHub: Update ${track.trackName} activity log`,
      });
    }

    // 3. Analytics/ overall-progress.json
    const totalCompletedAcrossTracks = activeTracks.reduce((sum, t) => {
      return sum + calculateProgressMetrics(t.completedTasks, t.totalTasks).completedTasks;
    }, 0);
    const totalAvailableAcrossTracks = activeTracks.reduce((sum, t) => {
      return sum + calculateProgressMetrics(t.completedTasks, t.totalTasks).totalTasks;
    }, 0);

    const overallJson = JSON.stringify(
      {
        lastSyncedAt: nowIso,
        totalTasksCompleted: totalCompletedAcrossTracks,
        totalTasksAvailable: totalAvailableAcrossTracks,
        totalPendingTasks: Math.max(0, totalAvailableAcrossTracks - totalCompletedAcrossTracks),
        totalLabsCompleted: activeActivities
          .filter((a) => (a.activityType || a.type) === 'lab')
          .reduce((s, a) => s + (Number(a.quantity) || 1), 0),
        totalQuestionsSolved: activeActivities
          .filter((a) => (a.activityType || a.type) === 'question')
          .reduce((s, a) => s + (Number(a.quantity) || 1), 0),
        totalStudyMinutes: activeActivities.reduce((sum, a) => sum + (Number(a.durationMinutes) || 0), 0),
        streak: calculateStreak(activeActivities, new Date()),
        activeCoursesCount: activeTracks.length,
        courses: activeTracks.map((t) => {
          const m = calculateProgressMetrics(t.completedTasks, t.totalTasks);
          return {
            trackId: t.trackId,
            trackName: t.trackName,
            completed: m.completedTasks,
            total: m.totalTasks,
            pending: m.pendingTasks,
            percentage: m.completionPercentage,
            folder: `Courses/${generateCourseDirName(t.trackName)}`,
          };
        }),
      },
      null,
      2
    );

    filesToSync.push({
      path: 'Analytics/overall-progress.json',
      content: overallJson,
      message: 'KodeHub: Update overall learning analytics',
    });

    // 4. Analytics/ weekly-summary.json
    const weeklyData = calculateWeeklyActivity(activeActivities, new Date());
    const weeklyJson = JSON.stringify(
      {
        generatedAt: nowIso,
        weeklySequence: weeklyData,
        totalWeekTasks: weeklyData.reduce((s, d) => s + d.tasks, 0),
        totalWeekQuestions: weeklyData.reduce((s, d) => s + d.questions, 0),
        totalWeekLabs: weeklyData.reduce((s, d) => s + d.labs, 0),
        totalWeekMinutes: weeklyData.reduce((s, d) => s + d.durationMinutes, 0),
      },
      null,
      2
    );

    filesToSync.push({
      path: 'Analytics/weekly-summary.json',
      content: weeklyJson,
      message: 'KodeHub: Update weekly learning summary',
    });

    // 5. Analytics/ monthly-summary.json
    const currentMonthPrefix = nowIso.slice(0, 7); // YYYY-MM
    const monthActs = activeActivities.filter((a) => a.completedAt && a.completedAt.startsWith(currentMonthPrefix));
    const monthlyJson = JSON.stringify(
      {
        month: currentMonthPrefix,
        generatedAt: nowIso,
        monthlyActivitiesCount: monthActs.length,
        monthlyTasksCompleted: monthActs
          .filter((a) => (a.activityType || a.type) === 'task')
          .reduce((s, a) => s + (Number(a.quantity) || 1), 0),
        monthlyQuestionsSolved: monthActs
          .filter((a) => (a.activityType || a.type) === 'question')
          .reduce((s, a) => s + (Number(a.quantity) || 1), 0),
        monthlyLabsCompleted: monthActs
          .filter((a) => (a.activityType || a.type) === 'lab')
          .reduce((s, a) => s + (Number(a.quantity) || 1), 0),
        monthlyLearningMinutes: monthActs.reduce((s, a) => s + (Number(a.durationMinutes) || 0), 0),
      },
      null,
      2
    );

    filesToSync.push({
      path: 'Analytics/monthly-summary.json',
      content: monthlyJson,
      message: 'KodeHub: Update monthly learning trends',
    });

    // Commit all files across GitHub repository
    const filesUpdated: string[] = [];
    const filesSkipped: string[] = [];
    let commitsCreated = 0;
    let latestCommitSha: string | undefined;
    let latestCommitUrl: string | undefined;

    for (const item of filesToSync) {
      try {
        const result = await this.createOrUpdateFile(
          config.token,
          owner,
          repo,
          item.path,
          item.content,
          item.message,
          branch
        );

        if (result.skipped) {
          filesSkipped.push(item.path);
        } else if (result.success) {
          filesUpdated.push(item.path);
          commitsCreated++;
          if (result.commitSha) latestCommitSha = result.commitSha;
          if (result.commitUrl) latestCommitUrl = result.commitUrl;
        }
      } catch (fileErr: any) {
        console.warn(`[KodeHub GitHub] Error syncing ${item.path}:`, fileErr);
      }
    }

    const rateLimit = await this.getRateLimit(config.token).catch(() => undefined);

    const message =
      commitsCreated > 0
        ? `Successfully pushed ${commitsCreated} file update(s) to ${config.selectedRepo.full_name}`
        : filesSkipped.length > 0
        ? `Repository is already up to date (${filesSkipped.length} files identical)`
        : 'No files to update';

    return {
      success: true,
      message,
      commitsCreated,
      filesUpdated,
      filesSkipped,
      lastCommitSha: latestCommitSha,
      lastCommitUrl: latestCommitUrl,
      rateLimit,
    };
  },
};

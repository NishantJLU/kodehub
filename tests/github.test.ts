import { describe, it, expect, beforeEach } from 'vitest';
import {
  generateCourseSlug,
  generateCourseDirName,
  renderProgressBar,
  parseTaskDetails,
  generateCourseReadmeMarkdown,
  generateReadmeMarkdown,
  GitHubService,
} from '../src/services/github.service';
import { StorageService } from '../src/services/storage.service';
import { toBase64, fromBase64 } from '../src/utils/base64';
import {
  TrackProgress,
  DailyActivity,
  LearningGoals,
  GitHubConfig,
  GitHubCommitRecord,
  TaskRecord,
} from '../src/types';

describe('KodeHub GitHub Integration & Repository Layout Suite', () => {
  beforeEach(async () => {
    await StorageService.clearAllData();
  });

  // 1. Dynamic Course Directory Name Generation (LeetHub style)
  it('generates descriptive course directory names matching LeetHub format', () => {
    expect(generateCourseDirName('100 Days of MLOps')).toBe('100-Days-of-MLOps');
    expect(generateCourseDirName('100 Days of DevOps')).toBe('100-Days-of-DevOps');
    expect(generateCourseDirName('100 Days of Cloud (Azure)')).toBe('100-Days-of-Cloud-Azure');
    expect(generateCourseDirName('Days of Kubernetes')).toBe('Days-of-Kubernetes');
    expect(generateCourseDirName('Advanced Terraform for Multi-Cloud')).toBe('Advanced-Terraform-for-Multi-Cloud');
    expect(generateCourseDirName('CKA & CKAD: Kubernetes Masterclass')).toBe('CKA-CKAD-Kubernetes-Masterclass');
  });

  // 2. ASCII Progress Bar
  it('renders accurate ASCII progress bars for Markdown output', () => {
    const zero = renderProgressBar(0, 10);
    expect(zero).toBe('░░░░░░░░░░ 0%');

    const half = renderProgressBar(50, 10);
    expect(half).toBe('█████░░░░░ 50%');

    const full = renderProgressBar(100, 10);
    expect(full).toBe('██████████ 100%');

    const fourteen = renderProgressBar(14, 10);
    expect(fourteen).toBe('█░░░░░░░░░ 14%');
  });

  // 3. Task Parsing & Strict No-Fabrication Rules
  it('correctly parses legitimate task details into structured task records', () => {
    const taskActivity: DailyActivity = {
      id: 'act-101',
      trackId: 'track-100-days-of-mlops',
      courseName: '100 Days of MLOps',
      activityType: 'task',
      quantity: 1,
      completedAt: '2026-11-15T10:30:00.000Z',
      source: 'verified_platform',
      title: 'Task 1: Introduction to MLOps',
      durationMinutes: 25,
    };

    const parsed = parseTaskDetails(taskActivity);
    expect(parsed).not.toBeNull();
    expect(parsed?.folderName).toBe('001-introduction-to-mlops');
    expect(parsed?.task.taskNumber).toBe(1);
    expect(parsed?.task.taskName).toBe('Introduction to MLOps');
    expect(parsed?.task.platform).toBe('KodeKloud');
    expect(parsed?.task.course).toBe('100 Days of MLOps');
    expect(parsed?.task.status).toBe('completed');
  });

  it('correctly parses numbered prefixes like "014: Docker Containerization for ML"', () => {
    const taskActivity: DailyActivity = {
      id: 'act-102',
      trackId: 'track-100-days-of-mlops',
      courseName: '100 Days of MLOps',
      activityType: 'task',
      quantity: 1,
      completedAt: '2026-11-15T11:00:00.000Z',
      source: 'verified_platform',
      title: '014: Docker Containerization for ML',
      durationMinutes: 30,
    };

    const parsed = parseTaskDetails(taskActivity);
    expect(parsed).not.toBeNull();
    expect(parsed?.folderName).toBe('014-docker-containerization-for-ml');
    expect(parsed?.task.taskNumber).toBe(14);
    expect(parsed?.task.taskName).toBe('Docker Containerization for ML');
  });

  it('strictly rejects generic cumulative updates and never fabricates fake tasks', () => {
    const generic1: DailyActivity = {
      id: 'act-gen-1',
      trackId: 'track-100-days-of-mlops',
      courseName: '100 Days of MLOps',
      activityType: 'task',
      quantity: 1,
      completedAt: '2026-11-15T09:00:00.000Z',
      source: 'verified_platform',
      title: '100 Days of MLOps - 1 Task Completed',
    };

    const generic2: DailyActivity = {
      id: 'act-gen-2',
      trackId: 'track-100-days-of-devops',
      courseName: '100 Days of DevOps',
      activityType: 'task',
      quantity: 2,
      completedAt: '2026-11-15T09:00:00.000Z',
      source: 'verified_platform',
      title: '2 Tasks Completed',
    };

    const generic3: DailyActivity = {
      id: 'act-gen-3',
      trackId: 'track-cloud',
      courseName: '100 Days of Cloud (Azure)',
      activityType: 'task',
      quantity: 1,
      completedAt: '2026-11-15T09:00:00.000Z',
      source: 'verified_platform',
      title: 'Sync completed',
    };

    expect(parseTaskDetails(generic1)).toBeNull();
    expect(parseTaskDetails(generic2)).toBeNull();
    expect(parseTaskDetails(generic3)).toBeNull();
  });

  // 4. Course-Level README Generation
  it('generates course README with progress table, tasks list, and activity links', () => {
    const track: TrackProgress = {
      trackId: 'track-100-days-of-mlops',
      trackName: '100 Days of MLOps',
      completedTasks: 14,
      totalTasks: 100,
      pendingTasks: 86,
      unlockedTasks: 100,
      lockedTasks: 0,
      lastSyncedAt: '2026-11-15T10:00:00.000Z',
    };

    const tasks: TaskRecord[] = [
      {
        platform: 'KodeKloud',
        course: '100 Days of MLOps',
        taskId: 'task-1',
        taskNumber: 1,
        taskName: 'Introduction to MLOps',
        status: 'completed',
        completedAt: '2026-11-15T09:00:00.000Z',
        firstObservedAt: '2026-11-15T09:00:00.000Z',
        lastUpdatedAt: '2026-11-15T09:00:00.000Z',
      },
      {
        platform: 'KodeKloud',
        course: '100 Days of MLOps',
        taskId: 'task-2',
        taskNumber: 2,
        taskName: 'Python Fundamentals for ML',
        status: 'completed',
        completedAt: '2026-11-15T09:30:00.000Z',
        firstObservedAt: '2026-11-15T09:30:00.000Z',
        lastUpdatedAt: '2026-11-15T09:30:00.000Z',
      },
    ];

    const activities: DailyActivity[] = [
      {
        id: 'act-1',
        trackId: 'track-100-days-of-mlops',
        courseName: '100 Days of MLOps',
        activityType: 'task',
        quantity: 1,
        completedAt: '2026-11-15T09:00:00.000Z',
        source: 'verified_platform',
        title: 'Task 1: Introduction to MLOps',
      },
    ];

    const courseReadme = generateCourseReadmeMarkdown(track, tasks, activities, '2026-11-15T10:00:00.000Z');

    expect(courseReadme).toContain('# 100 Days of MLOps');
    expect(courseReadme).toContain('[← Back to Learning Dashboard](../../README.md)');
    expect(courseReadme).toContain('Course Progress');
    expect(courseReadme).toContain('Total Tasks');
    expect(courseReadme).toContain('100');
    expect(courseReadme).toContain('14');
    expect(courseReadme).toContain('86');
    expect(courseReadme).toContain('Completed Tasks');
    expect(courseReadme).toContain('./Tasks/001-introduction-to-mlops/');
    expect(courseReadme).toContain('./Tasks/002-python-fundamentals-for-ml/');
    expect(courseReadme).toContain('Activity/daily-progress.json');
    expect(courseReadme).toContain('Activity/activity-log.json');
  });

  // 5. Course README with zero individual tasks (handles aggregate-only safely)
  it('generates course README with informative aggregate status when individual tasks are not present', () => {
    const track: TrackProgress = {
      trackId: 'track-100-days-of-devops',
      trackName: '100 Days of DevOps',
      completedTasks: 0,
      totalTasks: 100,
      pendingTasks: 100,
      lastSyncedAt: '2026-11-15T10:00:00.000Z',
    };

    const courseReadme = generateCourseReadmeMarkdown(track, [], []);
    expect(courseReadme).toContain('# 100 Days of DevOps');
    expect(courseReadme).toContain('Aggregate course progress');
    expect(courseReadme).toContain('0 / 100 tasks completed');
  });

  // 6. Professional Root README.md Generation
  it('generates a professional root README containing overall progress table, stats, and course links', () => {
    const tracks: TrackProgress[] = [
      {
        trackId: 'track-100-days-of-mlops',
        trackName: '100 Days of MLOps',
        completedTasks: 14,
        totalTasks: 100,
        pendingTasks: 86,
        unlockedTasks: 100,
        lockedTasks: 0,
        lastSyncedAt: '2026-11-15T10:00:00.000Z',
      },
      {
        trackId: 'track-100-days-of-devops',
        trackName: '100 Days of DevOps',
        completedTasks: 0,
        totalTasks: 100,
        pendingTasks: 100,
        unlockedTasks: 100,
        lockedTasks: 0,
        lastSyncedAt: '2026-11-15T10:00:00.000Z',
      },
      {
        trackId: 'track-100-days-of-cloud-azure',
        trackName: '100 Days of Cloud (Azure)',
        completedTasks: 0,
        totalTasks: 50,
        pendingTasks: 50,
        lastSyncedAt: '2026-11-15T10:00:00.000Z',
      },
    ];

    const activities: DailyActivity[] = [
      {
        id: 'act-1',
        trackId: 'track-100-days-of-mlops',
        courseName: '100 Days of MLOps',
        activityType: 'task',
        quantity: 1,
        completedAt: '2026-11-15T09:30:00.000Z',
        source: 'verified_platform',
        title: 'Task 14: Docker Containerization',
        durationMinutes: 20,
      },
    ];

    const goals: LearningGoals = {
      dailyQuestions: 15,
      dailyLabs: 2,
      dailyLessons: 3,
      dailyLearningMinutes: 120,
      weeklyQuestions: 75,
      weeklyLabs: 10,
    };

    const readme = generateReadmeMarkdown(tracks, activities, goals, '2026-11-15T10:00:00.000Z');

    expect(readme).toContain('# 🚀 KodeHub — My KodeKloud Learning Journey');
    expect(readme).toContain('> **Track Your Learning. Measure Your Progress.**');
    expect(readme).toContain('Overall Progress');
    expect(readme).toContain('./Courses/100-Days-of-MLOps/');
    expect(readme).toContain('./Courses/100-Days-of-DevOps/');
    expect(readme).toContain('./Courses/100-Days-of-Cloud-Azure/');
    expect(readme).toContain('Learning Statistics');
    expect(readme).toContain('Course Navigation');
    expect(readme).toContain('./Courses/100-Days-of-MLOps/README.md');
    expect(readme).toContain('Analytics/overall-progress.json');
    expect(readme).toContain('Analytics/weekly-summary.json');
    expect(readme).toContain('Analytics/monthly-summary.json');
    expect(readme).toContain('Repository Structure');
  });

  // 7. Base64 UTF-8 Encoding & Decoding
  it('encodes and decodes UTF-8 text with emojis and formatting seamlessly', () => {
    const original = 'KodeHub: 100 Days of MLOps 🚀 · Progress: 14/100 Tasks · 🎉 Goal Achieved!';
    const encoded = toBase64(original);
    const decoded = fromBase64(encoded);

    expect(decoded).toBe(original);
  });

  // 8. Config & Commit History Storage
  it('stores and retrieves GitHub configuration and commit history', async () => {
    const config: GitHubConfig = {
      token: 'ghp_test_token_1234567890',
      user: {
        login: 'NishantJLU',
        id: 12345,
        avatar_url: 'https://avatars.githubusercontent.com/u/12345',
        name: 'Nishant Singh',
        html_url: 'https://github.com/NishantJLU',
        public_repos: 10,
      },
      selectedRepo: {
        id: 98765,
        name: 'KodeKloud-Progress',
        full_name: 'NishantJLU/KodeKloud-Progress',
        private: true,
        html_url: 'https://github.com/NishantJLU/KodeKloud-Progress',
        default_branch: 'main',
        description: 'KodeKloud learning progress',
      },
      branch: 'main',
      autoSync: true,
      lastSyncAt: '2026-11-15T10:00:00.000Z',
      lastSyncCommitSha: 'a1b2c3d4e5f6',
      lastSyncCommitUrl: 'https://github.com/NishantJLU/KodeKloud-Progress/commit/a1b2c3d4e5f6',
    };

    await StorageService.saveGitHubConfig(config);
    const loadedConfig = await StorageService.getGitHubConfig();

    expect(loadedConfig).toBeDefined();
    expect(loadedConfig?.user?.login).toBe('NishantJLU');
    expect(loadedConfig?.selectedRepo?.full_name).toBe('NishantJLU/KodeKloud-Progress');
    expect(loadedConfig?.autoSync).toBe(true);

    const record: GitHubCommitRecord = {
      id: 'rec-1',
      timestamp: '2026-11-15T10:00:00.000Z',
      commitSha: 'a1b2c3d4e5f6',
      commitUrl: 'https://github.com/NishantJLU/KodeKloud-Progress/commit/a1b2c3d4e5f6',
      commitMessage: 'KodeHub: Complete MLOps task 014',
      filesChanged: ['README.md', 'Courses/100-Days-of-MLOps/progress.json', 'Courses/100-Days-of-MLOps/Tasks/014-docker/task.json'],
      status: 'success',
    };

    await StorageService.saveGitHubCommitRecord(record);
    const history = await StorageService.getGitHubHistory();

    expect(history.length).toBe(1);
    expect(history[0].commitSha).toBe('a1b2c3d4e5f6');
    expect(history[0].filesChanged).toContain('Courses/100-Days-of-MLOps/progress.json');
  });

  // 9. Token validation error handling
  it('handles empty or whitespace tokens gracefully without unhandled exceptions', async () => {
    const emptyResult = await GitHubService.validateToken('');
    expect(emptyResult.success).toBe(false);
    expect(emptyResult.error).toContain('Token cannot be empty');

    const wsResult = await GitHubService.validateToken('   ');
    expect(wsResult.success).toBe(false);
  });

  // 10. Avoid unnecessary commits when content is unchanged
  it('skips commit when remote file content is identical to local content', async () => {
    const originalFetch = global.fetch;
    let putCalled = false;

    global.fetch = (async (url: any, options: any) => {
      if (options?.method === 'GET' || !options?.method) {
        return new Response(
          JSON.stringify({
            sha: 'existing-sha-same',
            content: toBase64('{"completedTasks": 14}'),
            encoding: 'base64',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );
      }
      if (options?.method === 'PUT') {
        putCalled = true;
        return new Response('', { status: 200 });
      }
      return new Response('', { status: 400 });
    }) as any;

    try {
      const res = await GitHubService.createOrUpdateFile(
        'mock_token',
        'NishantJLU',
        'KodeKloud-Progress',
        '100-Days-of-MLOps/progress.json',
        '{"completedTasks": 14}',
        'KodeHub: Update 100 Days of MLOps course progress to 14/100'
      );

      expect(res.success).toBe(true);
      expect(res.skipped).toBe(true);
      expect(putCalled).toBe(false); // Unnecessary commit avoided
    } finally {
      global.fetch = originalFetch;
    }
  });

  // 11. Safe Legacy Migration
  it('safely migrates legacy repository files, preserves historical content, and cleans obsolete paths', async () => {
    const originalFetch = global.fetch;
    const deletedPaths: string[] = [];

    global.fetch = (async (url: any, options: any) => {
      const urlStr = String(url);

      // 1. Repo tree query
      if (urlStr.includes('/git/trees/')) {
        return new Response(
          JSON.stringify({
            tree: [
              { path: 'README.md', sha: 'sha-root-readme', type: 'blob' },
              { path: 'progress/mlops/progress.json', sha: 'sha-leg-prog', type: 'blob' },
              { path: 'progress/mlops/activity-log.json', sha: 'sha-leg-act', type: 'blob' },
              { path: 'analytics/overall-progress.json', sha: 'sha-leg-ana', type: 'blob' },
            ],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );
      }

      // 2. Read legacy activity-log.json
      // 1. Delete obsolete files
      if (options?.method === 'DELETE') {
        const cleanPath = urlStr.split('/contents/')[1] || '';
        deletedPaths.push(cleanPath);
        return new Response(JSON.stringify({ commit: { sha: 'del-commit-sha' } }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }

      // 2. Read legacy activity-log.json
      if (urlStr.includes('contents/progress/mlops/activity-log.json')) {
        return new Response(
          JSON.stringify({
            sha: 'sha-leg-act',
            content: toBase64(
              JSON.stringify([
                {
                  id: 'legacy-act-99',
                  courseName: '100 Days of MLOps',
                  quantity: 1,
                  title: 'Task 1: Introduction to MLOps',
                  completedAt: '2026-11-10T12:00:00Z',
                },
              ])
            ),
            encoding: 'base64',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );
      }

      return new Response(JSON.stringify({ exists: false }), { status: 404 });
    }) as any;

    try {
      const migration = await GitHubService.migrateLegacyRepositoryStructure(
        'mock_token',
        'NishantJLU',
        'KodeKloud-Progress',
        'main',
        [],
        []
      );

      expect(migration.migrated).toBe(true);
      expect(migration.legacyFilesFound).toContain('progress/mlops/progress.json');
      expect(migration.legacyFilesFound).toContain('progress/mlops/activity-log.json');
      expect(migration.legacyFilesFound).toContain('analytics/overall-progress.json');
      expect(migration.recoveredActivities.length).toBe(1);
      expect(migration.recoveredActivities[0].id).toBe('legacy-act-99');
      expect(deletedPaths).toContain('progress/mlops/progress.json');
      expect(deletedPaths).toContain('progress/mlops/activity-log.json');
      expect(deletedPaths).toContain('analytics/overall-progress.json');
    } finally {
      global.fetch = originalFetch;
    }
  });

  // 12. Full Multi-Course Sync (LeetHub Structure)
  it('creates complete LeetHub-inspired file structure during synchronization', async () => {
    const originalFetch = global.fetch;
    const committedFiles: Record<string, string> = {};

    global.fetch = (async (url: any, options: any) => {
      const urlStr = String(url);

      if (urlStr.includes('/git/trees/')) {
        return new Response(JSON.stringify({ tree: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }

      if (urlStr.includes('/rate_limit')) {
        return new Response(
          JSON.stringify({ resources: { core: { limit: 5000, remaining: 4990, reset: 1800000000 } } }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );
      }

      if (options?.method === 'GET' || !options?.method) {
        return new Response(JSON.stringify({ message: 'Not Found' }), { status: 404 });
      }

      if (options?.method === 'PUT') {
        const payload = JSON.parse(options.body);
        const filePath = urlStr.split('/contents/')[1] || '';
        committedFiles[decodeURIComponent(filePath)] = fromBase64(payload.content);
        return new Response(
          JSON.stringify({
            commit: { sha: `sha-${Object.keys(committedFiles).length}`, html_url: 'https://github.com/commit/test' },
          }),
          { status: 201, headers: { 'content-type': 'application/json' } }
        );
      }

      return new Response('', { status: 400 });
    }) as any;

    try {
      const config: GitHubConfig = {
        token: 'mock-token',
        user: { login: 'NishantJLU', id: 1, avatar_url: '', name: 'Nishant', html_url: '', public_repos: 5 },
        selectedRepo: {
          id: 101,
          name: 'KodeKloud-Progress',
          full_name: 'NishantJLU/KodeKloud-Progress',
          private: true,
          html_url: 'https://github.com/NishantJLU/KodeKloud-Progress',
          default_branch: 'main',
          description: '',
        },
        branch: 'main',
        autoSync: true,
        lastSyncAt: null,
        lastSyncCommitSha: null,
        lastSyncCommitUrl: null,
      };

      const tracks: TrackProgress[] = [
        {
          trackId: 'track-100-days-of-mlops',
          trackName: '100 Days of MLOps',
          completedTasks: 14,
          totalTasks: 100,
          pendingTasks: 86,
          lastSyncedAt: '2026-11-15T10:00:00Z',
        },
        {
          trackId: 'track-100-days-of-devops',
          trackName: '100 Days of DevOps',
          completedTasks: 0,
          totalTasks: 100,
          pendingTasks: 100,
          lastSyncedAt: '2026-11-15T10:00:00Z',
        },
      ];

      const activities: DailyActivity[] = [
        {
          id: 'act-mlops-1',
          trackId: 'track-100-days-of-mlops',
          courseName: '100 Days of MLOps',
          activityType: 'task',
          quantity: 1,
          completedAt: '2026-11-15T09:00:00Z',
          source: 'verified_platform',
          title: 'Task 1: Introduction to MLOps',
          durationMinutes: 20,
        },
      ];

      const goals: LearningGoals = {
        dailyQuestions: 15,
        dailyLabs: 2,
        dailyLessons: 3,
        dailyLearningMinutes: 120,
        weeklyQuestions: 75,
        weeklyLabs: 10,
      };

      const syncResult = await GitHubService.syncProgressToGitHub(config, tracks, activities, goals);

      expect(syncResult.success).toBe(true);
      expect(syncResult.commitsCreated).toBeGreaterThan(0);

      // Verify Root Files
      expect(committedFiles).toHaveProperty('README.md');
      expect(committedFiles['README.md']).toContain('# 🚀 KodeHub — My KodeKloud Learning Journey');

      // Verify MLOps Course Files inside Courses/
      expect(committedFiles).toHaveProperty('Courses/100-Days-of-MLOps/README.md');
      expect(committedFiles).toHaveProperty('Courses/100-Days-of-MLOps/progress.json');
      expect(committedFiles).toHaveProperty('Courses/100-Days-of-MLOps/Activity/daily-progress.json');
      expect(committedFiles).toHaveProperty('Courses/100-Days-of-MLOps/Activity/activity-log.json');
      expect(committedFiles).toHaveProperty('Courses/100-Days-of-MLOps/Tasks/001-introduction-to-mlops/task.json');

      const taskJson = JSON.parse(committedFiles['Courses/100-Days-of-MLOps/Tasks/001-introduction-to-mlops/task.json']);
      expect(taskJson.platform).toBe('KodeKloud');
      expect(taskJson.course).toBe('100 Days of MLOps');
      expect(taskJson.taskNumber).toBe(1);
      expect(taskJson.taskName).toBe('Introduction to MLOps');

      // Verify DevOps Course Files inside Courses/
      expect(committedFiles).toHaveProperty('Courses/100-Days-of-DevOps/README.md');
      expect(committedFiles).toHaveProperty('Courses/100-Days-of-DevOps/progress.json');

      // Verify Analytics Files
      expect(committedFiles).toHaveProperty('Analytics/overall-progress.json');
      expect(committedFiles).toHaveProperty('Analytics/weekly-summary.json');
      expect(committedFiles).toHaveProperty('Analytics/monthly-summary.json');
    } finally {
      global.fetch = originalFetch;
    }
  });
});

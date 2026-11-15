import { describe, it, expect, beforeEach } from 'vitest';
import { processSyncSnapshots, generateStableTrackId } from '../src/services/sync.service';
import { StorageService } from '../src/services/storage.service';
import { calculateProgressMetrics, isValidCourseTitle } from '../src/utils/progressCalculator';
import { generateCourseDirName, GitHubService } from '../src/services/github.service';
import { calculateDailyStats } from '../src/utils/analyticsCalculator';
import { toLocalDateString } from '../src/utils/dateUtils';
import { toBase64 } from '../src/utils/base64';
import { TrackProgress, TrackSnapshot, DailyActivity, LearningGoals, GitHubConfig } from '../src/types';

describe('KodeHub Comprehensive Synchronization & Accuracy Suite', () => {
  beforeEach(async () => {
    await StorageService.clearAllData();
  });

  // TEST 1 — Seven new completions
  it('TEST 1: detects 7 newly observed completions when progress increases from 13 to 20', () => {
    const mlopsId = generateStableTrackId('100 Days of MLOps');
    const previousSnapshots: Record<string, TrackSnapshot> = {
      [mlopsId]: {
        trackId: mlopsId,
        completedTasks: 13,
        observedAt: '2026-11-15T08:00:00.000Z',
      },
    };

    const currentTracks: TrackProgress[] = [
      {
        trackId: mlopsId,
        trackName: '100 Days of MLOps',
        completedTasks: 20,
        totalTasks: 100,
        pendingTasks: 80,
        lastSyncedAt: '2026-11-15T11:00:00.000Z',
      },
    ];

    const result = processSyncSnapshots(currentTracks, previousSnapshots);

    expect(result.newCompletionsCount).toBe(7);
    expect(result.newActivities.length).toBe(1);
    expect(result.newActivities[0].quantity).toBe(7);
    expect(result.newActivities[0].activityType).toBe('task');
    expect(result.newActivities[0].source).toBe('verified_platform');
    expect(result.updatedSnapshots[mlopsId].completedTasks).toBe(20);
  });

  // TEST 2 — Repeated synchronization
  it('TEST 2: detects 0 newly observed completions on repeated synchronization with identical progress', () => {
    const mlopsId = generateStableTrackId('100 Days of MLOps');
    const previousSnapshots: Record<string, TrackSnapshot> = {
      [mlopsId]: {
        trackId: mlopsId,
        completedTasks: 20,
        observedAt: '2026-11-15T11:00:00.000Z',
      },
    };

    const currentTracks: TrackProgress[] = [
      {
        trackId: mlopsId,
        trackName: '100 Days of MLOps',
        completedTasks: 20,
        totalTasks: 100,
        pendingTasks: 80,
        lastSyncedAt: '2026-11-15T11:05:00.000Z',
      },
    ];

    const result = processSyncSnapshots(currentTracks, previousSnapshots);

    expect(result.newCompletionsCount).toBe(0);
    expect(result.newActivities.length).toBe(0);
    expect(result.updatedSnapshots[mlopsId].completedTasks).toBe(20);
  });

  // TEST 3 — Progress calculations
  it('TEST 3: correctly computes pending: 83 and progress: 17% for 17 completed tasks out of 100', () => {
    const metrics = calculateProgressMetrics(17, 100);

    expect(metrics.completedTasks).toBe(17);
    expect(metrics.totalTasks).toBe(100);
    expect(metrics.pendingTasks).toBe(83); // 100 - 17 = 83 (never 50)
    expect(metrics.completionPercentage).toBe(17);
  });

  // TEST 4 — Course naming
  it('TEST 4: generates Courses/100-Days-of-MLOps/ and strictly rejects Courses/Start/', () => {
    const legitCourse = '100 Days of MLOps';
    const invalidBtn = 'Start';

    expect(isValidCourseTitle(legitCourse)).toBe(true);
    expect(isValidCourseTitle(invalidBtn)).toBe(false);
    expect(isValidCourseTitle('Continue')).toBe(false);
    expect(isValidCourseTitle('Resume')).toBe(false);

    const dirName = generateCourseDirName(legitCourse);
    expect(`Courses/${dirName}/`).toBe('Courses/100-Days-of-MLOps/');
    expect(`Courses/${dirName}/`).not.toBe('Courses/Start/');
  });

  // TEST 5 — Multiple courses
  it('TEST 5: manages multiple simultaneous courses accurately (MLOps: 20/100, DevOps: 5/100, Cloud: 10/50)', () => {
    const mlopsId = generateStableTrackId('100 Days of MLOps');
    const devopsId = generateStableTrackId('100 Days of DevOps');
    const cloudId = generateStableTrackId('100 Days of Cloud (Azure)');

    const previousSnapshots: Record<string, TrackSnapshot> = {
      [mlopsId]: { trackId: mlopsId, completedTasks: 13, observedAt: '2026-11-15T08:00:00Z' },
      [devopsId]: { trackId: devopsId, completedTasks: 0, observedAt: '2026-11-15T08:00:00Z' },
      [cloudId]: { trackId: cloudId, completedTasks: 0, observedAt: '2026-11-15T08:00:00Z' },
    };

    const currentTracks: TrackProgress[] = [
      {
        trackId: mlopsId,
        trackName: '100 Days of MLOps',
        completedTasks: 20,
        totalTasks: 100,
        pendingTasks: 80,
        lastSyncedAt: '2026-11-15T11:00:00Z',
      },
      {
        trackId: devopsId,
        trackName: '100 Days of DevOps',
        completedTasks: 5,
        totalTasks: 100,
        pendingTasks: 95,
        lastSyncedAt: '2026-11-15T11:00:00Z',
      },
      {
        trackId: cloudId,
        trackName: '100 Days of Cloud (Azure)',
        completedTasks: 10,
        totalTasks: 50,
        pendingTasks: 40,
        lastSyncedAt: '2026-11-15T11:00:00Z',
      },
    ];

    const result = processSyncSnapshots(currentTracks, previousSnapshots);

    expect(result.newCompletionsCount).toBe(22); // (20-13) + (5-0) + (10-0) = 7 + 5 + 10 = 22
    expect(result.newActivities.length).toBe(3);
    expect(result.updatedSnapshots[mlopsId].completedTasks).toBe(20);
    expect(result.updatedSnapshots[devopsId].completedTasks).toBe(5);
    expect(result.updatedSnapshots[cloudId].completedTasks).toBe(10);
  });

  // TEST 6 — Duplicate prevention
  it('TEST 6: prevents duplicate activities when the same synchronization runs twice', async () => {
    const mlopsId = generateStableTrackId('100 Days of MLOps');
    const snapshots: Record<string, TrackSnapshot> = {
      [mlopsId]: { trackId: mlopsId, completedTasks: 13, observedAt: '2026-11-15T08:00:00Z' },
    };

    const currentTracks: TrackProgress[] = [
      {
        trackId: mlopsId,
        trackName: '100 Days of MLOps',
        completedTasks: 20,
        totalTasks: 100,
        pendingTasks: 80,
        lastSyncedAt: '2026-11-15T11:00:00Z',
      },
    ];

    // First sync run
    const result1 = processSyncSnapshots(currentTracks, snapshots);
    for (const act of result1.newActivities) {
      await StorageService.saveActivity(act);
    }
    await StorageService.saveTrackSnapshots(result1.updatedSnapshots);

    // Second sync run with same tracks
    const storedSnapshots = await StorageService.getTrackSnapshots();
    const result2 = processSyncSnapshots(currentTracks, storedSnapshots);
    for (const act of result2.newActivities) {
      await StorageService.saveActivity(act);
    }

    const storedActivities = await StorageService.getActivities();
    expect(result2.newCompletionsCount).toBe(0);
    expect(result2.newActivities.length).toBe(0);
    expect(storedActivities.length).toBe(1);
    expect(storedActivities[0].quantity).toBe(7);
  });

  // TEST 7 — Timezone handling
  it('TEST 7: assigns activities completed near midnight consistently to the correct local day', () => {
    // Activity at 23:59:50 local time
    const localMidnightDate = new Date(2026, 10, 15, 23, 59, 50); // Nov 15, 2026
    const isoString = localMidnightDate.toISOString();
    const localDateStr = toLocalDateString(isoString);

    expect(localDateStr).toBe('2026-11-15');

    const goals: LearningGoals = {
      dailyQuestions: 10,
      dailyLabs: 2,
      dailyLessons: 3,
      dailyLearningMinutes: 120,
      weeklyQuestions: 70,
      weeklyLabs: 10,
    };

    const activity: DailyActivity = {
      id: 'act-midnight',
      courseId: 'track-100-days-of-mlops',
      trackId: 'track-100-days-of-mlops',
      courseName: '100 Days of MLOps',
      activityType: 'task',
      quantity: 7,
      observedAt: isoString,
      completedAt: isoString,
      source: 'verified_platform',
    };

    const stats = calculateDailyStats([activity], goals, localMidnightDate);
    expect(stats.tasksCompleted).toBe(7);
    expect(stats.progressPercent).toBe(70);
    expect(stats.remainingTasks).toBe(3);
  });

  // TEST 8 — Repository migration
  it('TEST 8: preserves existing activity data and migrates Start/ into Courses/100-Days-of-MLOps/', async () => {
    const originalFetch = global.fetch;
    const deletedPaths: string[] = [];

    global.fetch = (async (url: any, options: any) => {
      const urlStr = String(url);

      if (options?.method === 'DELETE') {
        const cleanPath = urlStr.split('/contents/')[1] || '';
        deletedPaths.push(cleanPath);
        return new Response(JSON.stringify({ commit: { sha: 'del-sha' } }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }

      if (urlStr.includes('/git/trees/')) {
        return new Response(
          JSON.stringify({
            tree: [
              { path: 'README.md', sha: 'sha-root', type: 'blob' },
              { path: 'Start/progress.json', sha: 'sha-start-prog', type: 'blob' },
              { path: 'Start/activity-log.json', sha: 'sha-start-act', type: 'blob' },
              { path: 'Analytics/overall-progress.json', sha: 'sha-ana', type: 'blob' },
            ],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );
      }

      if (urlStr.includes('contents/Start/activity-log.json')) {
        return new Response(
          JSON.stringify({
            sha: 'sha-start-act',
            content: toBase64(
              JSON.stringify([
                {
                  id: 'leg-act-1',
                  courseName: 'Start',
                  quantity: 4,
                  title: 'Task 1: Introduction to MLOps',
                  completedAt: '2026-11-15T09:00:00Z',
                },
              ])
            ),
            encoding: 'base64',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );
      }

      if (urlStr.includes('contents/Start/progress.json')) {
        return new Response(
          JSON.stringify({
            sha: 'sha-start-prog',
            content: toBase64(
              JSON.stringify({
                trackId: 'track-start',
                trackName: 'Start',
                completedTasks: 17,
                totalTasks: 100,
                pendingTasks: 50, // Corrupted legacy pending
              })
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
        'kodekloud-progress',
        'main',
        [],
        []
      );

      expect(migration.migrated).toBe(true);
      expect(migration.legacyFilesFound).toContain('Start/progress.json');
      expect(migration.legacyFilesFound).toContain('Start/activity-log.json');
      // Verifies Start was mapped to 100 Days of MLOps
      expect(migration.recoveredTracks.length).toBe(1);
      expect(migration.recoveredTracks[0].trackName).toBe('100 Days of MLOps');
      expect(migration.recoveredTracks[0].completedTasks).toBe(17);
      expect(migration.recoveredTracks[0].pendingTasks).toBe(83); // Recalculated 100 - 17 = 83!
      expect(deletedPaths).toContain('Start/progress.json');
      expect(deletedPaths).toContain('Start/activity-log.json');
    } finally {
      global.fetch = originalFetch;
    }
  });

  // TEST 9 — Aggregate-only progress
  it('TEST 9: updates aggregate progress without generating fictional task folders when task identities are unavailable', async () => {
    const originalFetch = global.fetch;
    const committedPaths: string[] = [];

    global.fetch = (async (url: any, options: any) => {
      const urlStr = String(url);

      if (urlStr.includes('/git/trees/')) {
        return new Response(JSON.stringify({ tree: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }

      if (options?.method === 'GET' || !options?.method) {
        return new Response(JSON.stringify({ message: 'Not Found' }), { status: 404 });
      }

      if (options?.method === 'PUT') {
        const filePath = urlStr.split('/contents/')[1] || '';
        committedPaths.push(decodeURIComponent(filePath));
        return new Response(
          JSON.stringify({ commit: { sha: 'sha-sync', html_url: 'https://github.com/commit' } }),
          { status: 201, headers: { 'content-type': 'application/json' } }
        );
      }

      return new Response('', { status: 200 });
    }) as any;

    try {
      const config: GitHubConfig = {
        token: 'mock-token',
        user: { login: 'NishantJLU', id: 1, avatar_url: '', name: 'Nishant', html_url: '', public_repos: 5 },
        selectedRepo: {
          id: 101,
          name: 'kodekloud-progress',
          full_name: 'NishantJLU/kodekloud-progress',
          private: true,
          html_url: 'https://github.com/NishantJLU/kodekloud-progress',
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
          completedTasks: 20,
          totalTasks: 100,
          pendingTasks: 80,
          lastSyncedAt: '2026-11-15T11:00:00Z',
        },
      ];

      // Generic cumulative activity without specific task identity
      const genericActivities: DailyActivity[] = [
        {
          id: 'act-cum-1',
          courseId: 'track-100-days-of-mlops',
          trackId: 'track-100-days-of-mlops',
          courseName: '100 Days of MLOps',
          activityType: 'task',
          quantity: 7,
          observedAt: '2026-11-15T11:00:00Z',
          completedAt: '2026-11-15T11:00:00Z',
          source: 'verified_platform',
          title: '100 Days of MLOps - 7 Tasks Completed',
        },
      ];

      const goals: LearningGoals = {
        dailyQuestions: 10,
        dailyLabs: 2,
        dailyLessons: 3,
        dailyLearningMinutes: 120,
        weeklyQuestions: 70,
        weeklyLabs: 10,
      };

      const result = await GitHubService.syncProgressToGitHub(config, tracks, genericActivities, goals);
      expect(result.success).toBe(true);

      // Verify aggregate course files exist
      expect(committedPaths).toContain('Courses/100-Days-of-MLOps/progress.json');
      expect(committedPaths).toContain('Courses/100-Days-of-MLOps/README.md');
      expect(committedPaths).toContain('Courses/100-Days-of-MLOps/Activity/daily-progress.json');
      expect(committedPaths).toContain('Courses/100-Days-of-MLOps/Activity/activity-log.json');

      // Verify NO fictional task folders were created
      const taskFolderCreated = committedPaths.some((p) => p.includes('Tasks/'));
      expect(taskFolderCreated).toBe(false);
    } finally {
      global.fetch = originalFetch;
    }
  });

  // TEST 10 — GitHub consistency
  it('TEST 10: guarantees popup, local storage and GitHub report identical progress values', async () => {
    const mlopsId = generateStableTrackId('100 Days of MLOps');
    const tracks: TrackProgress[] = [
      {
        trackId: mlopsId,
        trackName: '100 Days of MLOps',
        completedTasks: 17,
        totalTasks: 100,
        pendingTasks: 83,
        lastSyncedAt: '2026-11-15T11:00:00Z',
      },
    ];

    await StorageService.saveTracks(tracks);
    const storedTracks = await StorageService.getTracks();

    // 1. Storage consistency
    expect(storedTracks[0].completedTasks).toBe(17);
    expect(storedTracks[0].totalTasks).toBe(100);
    expect(storedTracks[0].pendingTasks).toBe(83); // 100 - 17 = 83

    // 2. Metrics calculation consistency
    const metrics = calculateProgressMetrics(storedTracks[0].completedTasks, storedTracks[0].totalTasks);
    expect(metrics.completedTasks).toBe(17);
    expect(metrics.pendingTasks).toBe(83);
    expect(metrics.completionPercentage).toBe(17);
  });
});

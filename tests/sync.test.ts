import { describe, it, expect, beforeEach } from 'vitest';
import { processSyncSnapshots, generateStableTrackId } from '../src/services/sync.service';
import { StorageService } from '../src/services/storage.service';
import { TrackProgress, TrackSnapshot } from '../src/types';

describe('KodeHub Synchronization Engine - Verified Test Cases', () => {
  beforeEach(async () => {
    await StorageService.clearAllData();
  });

  // TEST 1: Initial snapshot MLOps: 13, New snapshot MLOps: 14 -> 1 newly observed task
  it('TEST 1: detects 1 newly observed task when MLOps increases from 13 to 14', () => {
    const previousSnapshots: Record<string, TrackSnapshot> = {
      [generateStableTrackId('100 Days of MLOps')]: {
        trackId: generateStableTrackId('100 Days of MLOps'),
        completedTasks: 13,
        observedAt: '2026-11-15T09:00:00.000Z',
      },
    };

    const incomingTracks: TrackProgress[] = [
      {
        trackId: generateStableTrackId('100 Days of MLOps'),
        trackName: '100 Days of MLOps',
        completedTasks: 14,
        totalTasks: 100,
        pendingTasks: 86,
        lastSyncedAt: '2026-11-15T10:00:00.000Z',
      },
    ];

    const result = processSyncSnapshots(incomingTracks, previousSnapshots);

    expect(result.newCompletionsCount).toBe(1);
    expect(result.newActivities.length).toBe(1);
    expect(result.newActivities[0].quantity).toBe(1);
    expect(result.newActivities[0].activityType).toBe('task');
    expect(result.newActivities[0].source).toBe('verified_platform');
    expect(result.updatedSnapshots[generateStableTrackId('100 Days of MLOps')].completedTasks).toBe(14);
  });

  // TEST 2: Sync again with MLOps: 14 -> 0 newly observed tasks
  it('TEST 2: detects 0 newly observed tasks when syncing again with same completed count', () => {
    const previousSnapshots: Record<string, TrackSnapshot> = {
      [generateStableTrackId('100 Days of MLOps')]: {
        trackId: generateStableTrackId('100 Days of MLOps'),
        completedTasks: 14,
        observedAt: '2026-11-15T10:00:00.000Z',
      },
    };

    const incomingTracks: TrackProgress[] = [
      {
        trackId: generateStableTrackId('100 Days of MLOps'),
        trackName: '100 Days of MLOps',
        completedTasks: 14,
        totalTasks: 100,
        pendingTasks: 86,
        lastSyncedAt: '2026-11-15T10:05:00.000Z',
      },
    ];

    const result = processSyncSnapshots(incomingTracks, previousSnapshots);

    expect(result.newCompletionsCount).toBe(0);
    expect(result.newActivities.length).toBe(0);
  });

  // TEST 3: New snapshot MLOps: 15 -> 1 newly observed task
  it('TEST 3: detects 1 newly observed task when MLOps increases to 15', () => {
    const previousSnapshots: Record<string, TrackSnapshot> = {
      [generateStableTrackId('100 Days of MLOps')]: {
        trackId: generateStableTrackId('100 Days of MLOps'),
        completedTasks: 14,
        observedAt: '2026-11-15T10:05:00.000Z',
      },
    };

    const incomingTracks: TrackProgress[] = [
      {
        trackId: generateStableTrackId('100 Days of MLOps'),
        trackName: '100 Days of MLOps',
        completedTasks: 15,
        totalTasks: 100,
        pendingTasks: 85,
        lastSyncedAt: '2026-11-15T10:15:00.000Z',
      },
    ];

    const result = processSyncSnapshots(incomingTracks, previousSnapshots);

    expect(result.newCompletionsCount).toBe(1);
    expect(result.newActivities.length).toBe(1);
    expect(result.newActivities[0].quantity).toBe(1);
    expect(result.updatedSnapshots[generateStableTrackId('100 Days of MLOps')].completedTasks).toBe(15);
  });

  // TEST 4: Previous MLOps: 13, DevOps: 5 -> Current MLOps: 14, DevOps: 6 -> 2 newly observed tasks
  it('TEST 4: detects 2 newly observed tasks across multiple tracks (MLOps +1, DevOps +1)', () => {
    const mlopsId = generateStableTrackId('100 Days of MLOps');
    const devopsId = generateStableTrackId('100 Days of DevOps');

    const previousSnapshots: Record<string, TrackSnapshot> = {
      [mlopsId]: {
        trackId: mlopsId,
        completedTasks: 13,
        observedAt: '2026-11-15T08:00:00.000Z',
      },
      [devopsId]: {
        trackId: devopsId,
        completedTasks: 5,
        observedAt: '2026-11-15T08:00:00.000Z',
      },
    };

    const incomingTracks: TrackProgress[] = [
      {
        trackId: mlopsId,
        trackName: '100 Days of MLOps',
        completedTasks: 14,
        totalTasks: 100,
        pendingTasks: 86,
        lastSyncedAt: '2026-11-15T10:00:00.000Z',
      },
      {
        trackId: devopsId,
        trackName: '100 Days of DevOps',
        completedTasks: 6,
        totalTasks: 100,
        pendingTasks: 94,
        lastSyncedAt: '2026-11-15T10:00:00.000Z',
      },
    ];

    const result = processSyncSnapshots(incomingTracks, previousSnapshots);

    expect(result.newCompletionsCount).toBe(2);
    expect(result.newActivities.length).toBe(2);
    expect(result.coursesUpdatedCount).toBe(2);
  });

  // TEST 5: A newly introduced course appears dynamically without predefined array
  it('TEST 5: newly introduced course is discovered dynamically without fabricating history', () => {
    const newCourseTitle = 'Advanced Kubernetes Operator Framework Course';
    const newTrackId = generateStableTrackId(newCourseTitle);

    const incomingTracks: TrackProgress[] = [
      {
        trackId: newTrackId,
        trackName: newCourseTitle,
        completedTasks: 7,
        totalTasks: 40,
        pendingTasks: 33,
        lastSyncedAt: new Date().toISOString(),
      },
    ];

    // First observation: baseline snapshot is stored, 0 tasks fabricated for today
    const result = processSyncSnapshots(incomingTracks, {});

    expect(result.newCompletionsCount).toBe(0);
    expect(result.newActivities.length).toBe(0);
    expect(result.updatedSnapshots[newTrackId]).toBeDefined();
    expect(result.updatedSnapshots[newTrackId].completedTasks).toBe(7);

    // Subsequent sync when user completes a task in this new course
    const subsequentTracks: TrackProgress[] = [
      {
        trackId: newTrackId,
        trackName: newCourseTitle,
        completedTasks: 8,
        totalTasks: 40,
        pendingTasks: 32,
        lastSyncedAt: new Date().toISOString(),
      },
    ];

    const subsequentResult = processSyncSnapshots(subsequentTracks, result.updatedSnapshots);
    expect(subsequentResult.newCompletionsCount).toBe(1);
    expect(subsequentResult.newActivities.length).toBe(1);
    expect(subsequentResult.newActivities[0].courseName).toBe(newCourseTitle);
  });

  // TEST 6: User restarts Chrome / extension: stored progress remains unchanged
  it('TEST 6: persistent storage preserves snapshots and activities across reloads', async () => {
    const mlopsId = generateStableTrackId('100 Days of MLOps');

    const snapshots: Record<string, TrackSnapshot> = {
      [mlopsId]: { trackId: mlopsId, completedTasks: 12, observedAt: new Date().toISOString() },
    };

    await StorageService.saveTrackSnapshots(snapshots);
    await StorageService.saveActivity({
      id: 'act-1',
      trackId: mlopsId,
      courseName: '100 Days of MLOps',
      activityType: 'task',
      quantity: 2,
      completedAt: new Date().toISOString(),
      source: 'verified_platform',
    });

    // Simulate reload / read
    const reloadedSnapshots = await StorageService.getTrackSnapshots();
    const reloadedActivities = await StorageService.getActivities();

    expect(reloadedSnapshots[mlopsId].completedTasks).toBe(12);
    expect(reloadedActivities.length).toBe(1);
    expect(reloadedActivities[0].quantity).toBe(2);
  });

  // TEST 7: User syncs without completing anything -> No new activity is created
  it('TEST 7: syncing without completing anything creates zero new activities', () => {
    const mlopsId = generateStableTrackId('100 Days of MLOps');
    const existingSnapshots: Record<string, TrackSnapshot> = {
      [mlopsId]: { trackId: mlopsId, completedTasks: 12, observedAt: '2026-11-15T09:00:00.000Z' },
    };

    const unchangedTracks: TrackProgress[] = [
      {
        trackId: mlopsId,
        trackName: '100 Days of MLOps',
        completedTasks: 12,
        totalTasks: 100,
        pendingTasks: 88,
        lastSyncedAt: '2026-11-15T09:30:00.000Z',
      },
    ];

    const result = processSyncSnapshots(unchangedTracks, existingSnapshots);

    expect(result.newCompletionsCount).toBe(0);
    expect(result.newActivities.length).toBe(0);
  });
});

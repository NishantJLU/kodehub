import { describe, it, expect, beforeEach } from 'vitest';
import { StorageService } from '../src/services/storage.service';
import { formatDuration, getGreeting, toLocalDateString } from '../src/utils/dateUtils';
import { LearningActivity } from '../src/types';

describe('Date and Duration Utils', () => {
  it('formats durations properly', () => {
    expect(formatDuration(0)).toBe('0m');
    expect(formatDuration(45)).toBe('45m');
    expect(formatDuration(60)).toBe('1h');
    expect(formatDuration(135)).toBe('2h 15m');
    expect(formatDuration(150)).toBe('2h 30m');
  });

  it('determines appropriate greeting by hour', () => {
    const morningDate = new Date('2026-11-15T09:00:00');
    expect(getGreeting(morningDate)).toBe('Good morning!');

    const afternoonDate = new Date('2026-11-15T14:00:00');
    expect(getGreeting(afternoonDate)).toBe('Good afternoon!');

    const eveningDate = new Date('2026-11-15T20:00:00');
    expect(getGreeting(eveningDate)).toBe('Good evening!');
  });

  it('formats local date string as YYYY-MM-DD', () => {
    const d = new Date(2026, 10, 15); // Month is 0-indexed: 10 is November
    expect(toLocalDateString(d)).toBe('2026-11-15');
  });
});

describe('Storage and Data Export', () => {
  beforeEach(async () => {
    await StorageService.clearAllData();
  });

  it('saves real activities and exports valid JSON and CSV', async () => {
    const act: LearningActivity = {
      id: 'kk-1',
      courseId: 'c-mlops',
      courseName: '100 Days of MLOps',
      type: 'question',
      title: 'MLOps Task 11 Completed',
      quantity: 11,
      durationMinutes: 165,
      completedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await StorageService.saveActivity(act);
    const activities = await StorageService.getActivities();
    expect(activities.length).toBe(1);
    expect(activities[0].quantity).toBe(11);

    // Test JSON export
    const jsonStr = await StorageService.exportDataJSON();
    const parsed = JSON.parse(jsonStr);
    expect(parsed.version).toBe('1.0.0');
    expect(parsed.activities.length).toBe(1);

    // Test CSV export
    const csvStr = await StorageService.exportActivitiesCSV();
    expect(csvStr).toContain('courseName');
    expect(csvStr).toContain('100 Days of MLOps');

    // Test JSON import
    await StorageService.clearAllData();
    const cleared = await StorageService.getActivities();
    expect(cleared.length).toBe(0);

    const importRes = await StorageService.importDataJSON(jsonStr);
    expect(importRes.success).toBe(true);

    const restored = await StorageService.getActivities();
    expect(restored.length).toBe(1);
    expect(restored[0].courseName).toBe('100 Days of MLOps');
  });

  it('purges any sample data starting with samp-', async () => {
    const sampleAct: any = {
      id: 'samp-99',
      courseName: 'Sample Mock Course',
      type: 'question',
      quantity: 10,
    };
    const realAct: any = {
      id: 'kk-real-1',
      courseName: '100 Days of MLOps',
      type: 'question',
      quantity: 11,
    };

    await StorageService.saveActivity(sampleAct);
    await StorageService.saveActivity(realAct);

    await StorageService.purgeSampleData();
    const activities = await StorageService.getActivities();
    expect(activities.some((a) => a.id.startsWith('samp-'))).toBe(false);
    expect(activities.some((a) => a.id === 'kk-real-1')).toBe(true);
  });
});

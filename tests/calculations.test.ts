import { describe, it, expect } from 'vitest';
import { calculateStreak } from '../src/utils/streakCalculator';
import {
  calculateDailyStats,
  calculateWeeklyActivity,
  calculateHeatmap,
  calculateCourseDistribution,
} from '../src/utils/analyticsCalculator';
import { calculateProgressMetrics } from '../src/utils/progressCalculator';
import { LearningActivity, LearningGoals } from '../src/types';

describe('Streak Calculation', () => {
  it('returns 0 for empty activities', () => {
    const res = calculateStreak([]);
    expect(res.currentStreak).toBe(0);
    expect(res.longestStreak).toBe(0);
    expect(res.activeToday).toBe(false);
  });

  it('calculates current streak when active today', () => {
    const today = new Date('2026-11-15T10:00:00Z');
    const yesterday = new Date('2026-11-14T10:00:00Z');
    const dayBefore = new Date('2026-11-13T10:00:00Z');

    const activities: Partial<LearningActivity>[] = [
      { id: '1', completedAt: today.toISOString(), quantity: 5, type: 'question' },
      { id: '2', completedAt: yesterday.toISOString(), quantity: 3, type: 'question' },
      { id: '3', completedAt: dayBefore.toISOString(), quantity: 2, type: 'question' },
    ];

    const res = calculateStreak(activities as LearningActivity[], today);
    expect(res.currentStreak).toBe(3);
    expect(res.longestStreak).toBe(3);
    expect(res.activeToday).toBe(true);
  });

  it('preserves streak if active yesterday but not yet today', () => {
    const today = new Date('2026-11-15T10:00:00Z');
    const yesterday = new Date('2026-11-14T10:00:00Z');
    const dayBefore = new Date('2026-11-13T10:00:00Z');

    const activities: Partial<LearningActivity>[] = [
      { id: '1', completedAt: yesterday.toISOString(), quantity: 5, type: 'question' },
      { id: '2', completedAt: dayBefore.toISOString(), quantity: 3, type: 'question' },
    ];

    const res = calculateStreak(activities as LearningActivity[], today);
    expect(res.currentStreak).toBe(2);
    expect(res.activeToday).toBe(false);
  });

  it('resets streak to 0 if gap is 2 days or more', () => {
    const today = new Date('2026-11-15T10:00:00Z');
    const threeDaysAgo = new Date('2026-11-12T10:00:00Z');

    const activities: Partial<LearningActivity>[] = [
      { id: '1', completedAt: threeDaysAgo.toISOString(), quantity: 5, type: 'question' },
    ];

    const res = calculateStreak(activities as LearningActivity[], today);
    expect(res.currentStreak).toBe(0);
    expect(res.longestStreak).toBe(1);
    expect(res.activeToday).toBe(false);
  });
});

describe('Daily Stats Calculation', () => {
  it('correctly aggregates questions, labs, lessons and time', () => {
    const today = new Date('2026-11-15T12:00:00');
    const goals: LearningGoals = {
      dailyQuestions: 15,
      dailyLabs: 2,
      dailyLessons: 3,
      dailyLearningMinutes: 120,
      weeklyQuestions: 75,
      weeklyLabs: 10,
    };

    const activities: Partial<LearningActivity>[] = [
      { id: '1', completedAt: '2026-11-15T09:00:00', type: 'question', quantity: 8, durationMinutes: 45 },
      { id: '2', completedAt: '2026-11-15T10:00:00', type: 'question', quantity: 4, durationMinutes: 20 },
      { id: '3', completedAt: '2026-11-15T11:00:00', type: 'lab', quantity: 2, durationMinutes: 50 },
      { id: '4', completedAt: '2026-11-15T14:00:00', type: 'lesson', quantity: 4, durationMinutes: 20 },
    ];

    const stats = calculateDailyStats(activities as LearningActivity[], goals, today);

    expect(stats.questionsSolved).toBe(12);
    expect(stats.labsCompleted).toBe(2);
    expect(stats.lessonsCompleted).toBe(4);
    expect(stats.learningTimeMinutes).toBe(135); // 45 + 20 + 50 + 20 = 135 (2h 15m)
    expect(stats.dailyGoal).toBe(15);
    expect(stats.progressPercent).toBe(80); // 12 / 15 = 80%
    expect(stats.remainingQuestions).toBe(3);
  });

  it('keeps questions solved separate from tasks completed while calculating goals', () => {
    const today = new Date('2026-11-15T12:00:00');
    const goals: LearningGoals = {
      dailyQuestions: 15,
      dailyLabs: 2,
      dailyLessons: 3,
      dailyLearningMinutes: 120,
      weeklyQuestions: 75,
      weeklyLabs: 10,
    };

    const activities: Partial<LearningActivity>[] = [
      { id: '1', completedAt: '2026-11-15T09:00:00', activityType: 'task', quantity: 2, durationMinutes: 30 },
      { id: '2', completedAt: '2026-11-15T10:00:00', activityType: 'question', quantity: 3, durationMinutes: 20 },
    ];

    const stats = calculateDailyStats(activities as LearningActivity[], goals, today);

    expect(stats.tasksCompleted).toBe(2);
    expect(stats.questionsSolved).toBe(3);
    expect(stats.progressPercent).toBe(13); // 2 tasks / 15 goal = 13% (questions never mixed into task goals)
    expect(stats.remainingTasks).toBe(13); // 15 - 2 = 13
  });
});

describe('Weekly Activity & Heatmap Analytics', () => {
  it('calculates weekly 7-day breakdown matching Monday through Sunday', () => {
    const sunday = new Date('2026-11-15T12:00:00'); // Sunday Nov 15, 2026

    const activities: Partial<LearningActivity>[] = [
      { id: '1', completedAt: '2026-11-09T09:00:00', activityType: 'task', quantity: 2, durationMinutes: 30 }, // Monday
      { id: '2', completedAt: '2026-11-11T10:00:00', activityType: 'lab', quantity: 1, durationMinutes: 45 },  // Wednesday
      { id: '3', completedAt: '2026-11-15T11:00:00', activityType: 'question', quantity: 5, durationMinutes: 60 }, // Sunday (today)
    ];

    const weekly = calculateWeeklyActivity(activities as LearningActivity[], sunday);

    expect(weekly.length).toBe(7);
    expect(weekly[0].dayName).toBe('Mon');
    expect(weekly[0].tasks).toBe(2);
    expect(weekly[2].dayName).toBe('Wed');
    expect(weekly[2].labs).toBe(1);
    expect(weekly[6].dayName).toBe('Sun');
    expect(weekly[6].questions).toBe(5);
    expect(weekly[6].isToday).toBe(true);
  });

  it('calculates 16-week contribution heatmap days and intensity levels', () => {
    const today = new Date('2026-11-15T12:00:00');

    const activities: Partial<LearningActivity>[] = [
      { id: '1', completedAt: '2026-11-15T09:00:00', activityType: 'task', quantity: 12 }, // High intensity
      { id: '2', completedAt: '2026-11-14T09:00:00', activityType: 'question', quantity: 2 }, // Low intensity
      { id: '3', completedAt: '2026-11-10T09:00:00', activityType: 'lab', quantity: 5 }, // Medium intensity
    ];

    const heatmap = calculateHeatmap(activities as LearningActivity[], 16, today);

    // 16 weeks * 7 days = 112 days
    expect(heatmap.length).toBe(112);

    const todayCell = heatmap[heatmap.length - 1];
    expect(todayCell.count).toBe(12);
    expect(todayCell.level).toBeGreaterThanOrEqual(3);

    const yesterdayCell = heatmap[heatmap.length - 2];
    expect(yesterdayCell.count).toBe(2);
    expect(yesterdayCell.level).toBe(1);
  });

  it('calculates course distribution percentages correctly', () => {
    const activities: Partial<LearningActivity>[] = [
      { id: '1', trackId: 'mlops', courseName: '100 Days of MLOps', activityType: 'task', quantity: 6 },
      { id: '2', trackId: 'devops', courseName: '100 Days of DevOps', activityType: 'task', quantity: 4 },
    ];

    const dist = calculateCourseDistribution(activities as LearningActivity[]);

    expect(dist.length).toBe(2);
    const mlops = dist.find((d) => d.courseName === '100 Days of MLOps');
    expect(mlops?.tasks).toBe(6);
    expect(mlops?.percentage).toBe(60);

    const devops = dist.find((d) => d.courseName === '100 Days of DevOps');
    expect(devops?.tasks).toBe(4);
    expect(devops?.percentage).toBe(40);
  });
});

describe('Centralized Progress Metrics (calculateProgressMetrics)', () => {
  it('TEST 3: correctly computes pending and progress for 17 completed out of 100', () => {
    const res = calculateProgressMetrics(17, 100);
    expect(res.completedTasks).toBe(17);
    expect(res.totalTasks).toBe(100);
    expect(res.pendingTasks).toBe(83); // 100 - 17 = 83 (never 50)
    expect(res.completionPercentage).toBe(17);
  });

  it('correctly handles zero completed tasks', () => {
    const res = calculateProgressMetrics(0, 100);
    expect(res.completedTasks).toBe(0);
    expect(res.totalTasks).toBe(100);
    expect(res.pendingTasks).toBe(100);
    expect(res.completionPercentage).toBe(0);
  });

  it('bounds completed count to total count and prevents impossible numbers', () => {
    const over = calculateProgressMetrics(150, 100);
    expect(over.completedTasks).toBe(100);
    expect(over.pendingTasks).toBe(0);
    expect(over.completionPercentage).toBe(100);

    const negative = calculateProgressMetrics(-10, 100);
    expect(negative.completedTasks).toBe(0);
    expect(negative.pendingTasks).toBe(100);
    expect(negative.completionPercentage).toBe(0);
  });
});

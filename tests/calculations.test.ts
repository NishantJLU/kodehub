import { describe, it, expect } from 'vitest';
import { calculateStreak } from '../src/utils/streakCalculator';
import { calculateDailyStats, calculateWeeklyActivity, calculateCourseDistribution } from '../src/utils/analyticsCalculator';
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
    expect(stats.progressPercent).toBe(33); // (2 tasks + 3 questions) / 15 = 33%
    expect(stats.remainingQuestions).toBe(10);
  });
});

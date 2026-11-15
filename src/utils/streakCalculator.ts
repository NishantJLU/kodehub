import { LearningActivity, StreakInfo } from '../types';
import { toLocalDateString } from './dateUtils';

/**
 * Calculates current streak and longest streak accurately in the user's local timezone.
 */
export function calculateStreak(activities: LearningActivity[], baseDate: Date = new Date()): StreakInfo {
  if (!activities || activities.length === 0) {
    return {
      currentStreak: 0,
      longestStreak: 0,
      activeToday: false,
      lastActiveDate: null,
    };
  }

  // Extract unique active local dates (sorted descending: latest first)
  const activeDatesSet = new Set<string>();
  activities.forEach((a) => {
    if (a.completedAt) {
      activeDatesSet.add(toLocalDateString(a.completedAt));
    }
  });

  const uniqueDates = Array.from(activeDatesSet).sort().reverse();
  if (uniqueDates.length === 0) {
    return {
      currentStreak: 0,
      longestStreak: 0,
      activeToday: false,
      lastActiveDate: null,
    };
  }

  const todayStr = toLocalDateString(baseDate);

  const yesterday = new Date(baseDate);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = toLocalDateString(yesterday);

  const activeToday = activeDatesSet.has(todayStr);
  const activeYesterday = activeDatesSet.has(yesterdayStr);

  // Calculate current streak
  let currentStreak = 0;

  if (activeToday || activeYesterday) {
    let checkDate = new Date(baseDate);
    if (!activeToday) {
      // If not active today yet, begin checking consecutive days from yesterday
      checkDate = new Date(yesterday);
    }

    while (true) {
      const checkStr = toLocalDateString(checkDate);
      if (activeDatesSet.has(checkStr)) {
        currentStreak++;
        // Go back 1 day
        checkDate.setDate(checkDate.getDate() - 1);
      } else {
        break;
      }
    }
  }

  // Calculate longest streak across entire history
  // Sort dates chronologically ascending
  const sortedAsc = Array.from(activeDatesSet).sort();
  let longestStreak = 0;
  let runningStreak = 0;
  let previousDate: Date | null = null;

  for (const dateStr of sortedAsc) {
    const currentDate = new Date(`${dateStr}T12:00:00`); // Noon to avoid daylight saving shifts
    if (!previousDate) {
      runningStreak = 1;
    } else {
      const diffMs = currentDate.getTime() - previousDate.getTime();
      const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
      if (diffDays === 1) {
        runningStreak++;
      } else {
        runningStreak = 1;
      }
    }

    if (runningStreak > longestStreak) {
      longestStreak = runningStreak;
    }
    previousDate = currentDate;
  }

  if (currentStreak > longestStreak) {
    longestStreak = currentStreak;
  }

  return {
    currentStreak,
    longestStreak,
    activeToday,
    lastActiveDate: uniqueDates[0] || null,
  };
}

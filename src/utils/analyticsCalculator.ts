import { LearningActivity, LearningGoals, DailyStats, WeeklyDayStat, HeatmapDay } from '../types';
import { toLocalDateString } from './dateUtils';

export function calculateDailyStats(
  activities: LearningActivity[],
  goals: LearningGoals,
  baseDate: Date = new Date()
): DailyStats {
  const targetDateStr = toLocalDateString(baseDate);

  const dayActivities = activities.filter((a) => {
    return a.completedAt && toLocalDateString(a.completedAt) === targetDateStr;
  });

  let questionsSolved = 0;
  let labsCompleted = 0;
  let lessonsCompleted = 0;
  let tasksCompleted = 0;
  let mockExamsCompleted = 0;
  let learningTimeMinutes = 0;

  for (const act of dayActivities) {
    const qty = Number(act.quantity) || 1;
    const duration = Number(act.durationMinutes) || 0;
    learningTimeMinutes += duration;

    switch (act.type) {
      case 'question':
        questionsSolved += qty;
        break;
      case 'lab':
        labsCompleted += qty;
        break;
      case 'lesson':
        lessonsCompleted += qty;
        break;
      case 'task':
        tasksCompleted += qty;
        break;
      case 'mock_exam':
        mockExamsCompleted += qty;
        break;
      default:
        break;
    }
  }

  const dailyGoal = goals?.dailyQuestions || 15;
  const progressPercent = dailyGoal > 0 ? Math.min(100, Math.round((questionsSolved / dailyGoal) * 100)) : 0;
  const remainingQuestions = Math.max(0, dailyGoal - questionsSolved);

  return {
    questionsSolved,
    labsCompleted,
    lessonsCompleted,
    tasksCompleted,
    mockExamsCompleted,
    learningTimeMinutes,
    dailyGoal,
    progressPercent,
    remainingQuestions,
  };
}

/**
 * Returns the 7-day activity sequence matching the screenshot.
 * Displays Monday through Sunday of current week (or rolling last 7 days ending today).
 */
export function calculateWeeklyActivity(
  activities: LearningActivity[],
  baseDate: Date = new Date()
): WeeklyDayStat[] {
  // We compute the current week's Monday through Sunday
  // or rolling last 7 days. Looking at the screenshot, the labels are "M", "T", "W", "T", "F", "S", "S".
  // This corresponds directly to Monday -> Sunday!
  const currentDayOfWeek = baseDate.getDay(); // 0 is Sunday, 1 is Monday ...
  // Calculate distance back to Monday (Monday = 1)
  const distToMonday = (currentDayOfWeek + 6) % 7; // Monday -> 0, Tuesday -> 1 ... Sunday -> 6
  
  const monday = new Date(baseDate);
  monday.setDate(monday.getDate() - distToMonday);

  const dayLetters = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const todayStr = toLocalDateString(baseDate);

  const result: WeeklyDayStat[] = [];

  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const dateStr = toLocalDateString(d);

    const dayActs = activities.filter((a) => a.completedAt && toLocalDateString(a.completedAt) === dateStr);

    let questions = 0;
    let labs = 0;
    let lessons = 0;
    let durationMinutes = 0;

    for (const act of dayActs) {
      const qty = Number(act.quantity) || 1;
      durationMinutes += Number(act.durationMinutes) || 0;
      if (act.type === 'question') questions += qty;
      else if (act.type === 'lab') labs += qty;
      else if (act.type === 'lesson') lessons += qty;
    }

    result.push({
      dateStr,
      dayLetter: dayLetters[i],
      dayName: dayNames[i],
      questions,
      labs,
      lessons,
      durationMinutes,
      totalActivities: dayActs.length,
      isToday: dateStr === todayStr,
    });
  }

  return result;
}

/**
 * Returns GitHub-style contribution heatmap days for the last N weeks (e.g. 16 weeks ~ 4 months)
 */
export function calculateHeatmap(
  activities: LearningActivity[],
  weeksCount: number = 16,
  baseDate: Date = new Date()
): HeatmapDay[] {
  const days: HeatmapDay[] = [];
  const totalDays = weeksCount * 7;

  // Activity counts mapped by local date string
  const countsByDate = new Map<string, { total: number; questions: number; labs: number }>();
  activities.forEach((a) => {
    if (!a.completedAt) return;
    const d = toLocalDateString(a.completedAt);
    const curr = countsByDate.get(d) || { total: 0, questions: 0, labs: 0 };
    const qty = Number(a.quantity) || 1;
    curr.total += qty;
    if (a.type === 'question') curr.questions += qty;
    if (a.type === 'lab') curr.labs += qty;
    countsByDate.set(d, curr);
  });

  for (let i = totalDays - 1; i >= 0; i--) {
    const d = new Date(baseDate);
    d.setDate(d.getDate() - i);
    const dateStr = toLocalDateString(d);
    const data = countsByDate.get(dateStr) || { total: 0, questions: 0, labs: 0 };

    let level: 0 | 1 | 2 | 3 | 4 = 0;
    if (data.total >= 13) level = 4;
    else if (data.total >= 8) level = 3;
    else if (data.total >= 4) level = 2;
    else if (data.total >= 1) level = 1;

    days.push({
      date: dateStr,
      count: data.total,
      questions: data.questions,
      labs: data.labs,
      level,
    });
  }

  return days;
}

export interface CourseDistribution {
  courseName: string;
  questions: number;
  labs: number;
  durationMinutes: number;
  totalActivities: number;
  percentage: number;
}

export function calculateCourseDistribution(activities: LearningActivity[]): CourseDistribution[] {
  const map = new Map<string, { questions: number; labs: number; duration: number; count: number }>();

  let totalQuestions = 0;

  activities.forEach((a) => {
    const course = a.courseName?.trim() || 'General / Unassigned';
    const entry = map.get(course) || { questions: 0, labs: 0, duration: 0, count: 0 };
    const qty = Number(a.quantity) || 1;
    const dur = Number(a.durationMinutes) || 0;

    entry.count += 1;
    entry.duration += dur;
    if (a.type === 'question') {
      entry.questions += qty;
      totalQuestions += qty;
    } else if (a.type === 'lab') {
      entry.labs += qty;
    }
    map.set(course, entry);
  });

  const list: CourseDistribution[] = [];
  map.forEach((val, name) => {
    const pct = totalQuestions > 0 ? Math.round((val.questions / totalQuestions) * 100) : 0;
    list.push({
      courseName: name,
      questions: val.questions,
      labs: val.labs,
      durationMinutes: val.duration,
      totalActivities: val.count,
      percentage: pct,
    });
  });

  return list.sort((a, b) => b.questions - a.questions);
}

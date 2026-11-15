import { DailyActivity, LearningGoals, DailyStats, WeeklyDayStat, HeatmapDay } from '../types';
import { toLocalDateString } from './dateUtils';

export function calculateDailyStats(
  activities: DailyActivity[],
  goals: LearningGoals,
  baseDate: Date = new Date()
): DailyStats {
  const targetDateStr = toLocalDateString(baseDate);

  const dayActivities = activities.filter((a) => {
    return a.completedAt && toLocalDateString(a.completedAt) === targetDateStr;
  });

  let tasksCompleted = 0;
  let questionsSolved = 0;
  let labsCompleted = 0;
  let lessonsCompleted = 0;
  let mockExamsCompleted = 0;
  let learningTimeMinutes = 0;

  for (const act of dayActivities) {
    const qty = Number(act.quantity) || 1;
    const duration = Number(act.durationMinutes) || 0;
    learningTimeMinutes += duration;

    const type = act.activityType || (act as any).type;

    switch (type) {
      case 'task':
        tasksCompleted += qty;
        break;
      case 'question':
        questionsSolved += qty;
        break;
      case 'lab':
        labsCompleted += qty;
        break;
      case 'lesson':
        lessonsCompleted += qty;
        break;
      case 'mock_exam':
        mockExamsCompleted += qty;
        break;
      default:
        break;
    }
  }

  const dailyGoal = goals?.dailyQuestions || 15;
  // Progress towards daily goal considers verified tasks and questions solved
  const primaryProgressCount = tasksCompleted + questionsSolved;
  const progressPercent = dailyGoal > 0 ? Math.min(100, Math.round((primaryProgressCount / dailyGoal) * 100)) : 0;
  const remainingQuestions = Math.max(0, dailyGoal - primaryProgressCount);

  return {
    tasksCompleted,
    questionsSolved,
    labsCompleted,
    lessonsCompleted,
    mockExamsCompleted,
    learningTimeMinutes,
    dailyGoal,
    progressPercent,
    remainingQuestions,
    totalActivitiesCount: dayActivities.length,
  };
}

/**
 * Returns the 7-day activity sequence matching Monday -> Sunday.
 */
export function calculateWeeklyActivity(
  activities: DailyActivity[],
  baseDate: Date = new Date()
): WeeklyDayStat[] {
  const currentDayOfWeek = baseDate.getDay(); // 0 is Sunday, 1 is Monday ...
  const distToMonday = (currentDayOfWeek + 6) % 7;

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

    let tasks = 0;
    let questions = 0;
    let labs = 0;
    let lessons = 0;
    let durationMinutes = 0;

    for (const act of dayActs) {
      const qty = Number(act.quantity) || 1;
      durationMinutes += Number(act.durationMinutes) || 0;
      const type = act.activityType || (act as any).type;

      if (type === 'task') tasks += qty;
      else if (type === 'question') questions += qty;
      else if (type === 'lab') labs += qty;
      else if (type === 'lesson') lessons += qty;
    }

    result.push({
      dateStr,
      dayLetter: dayLetters[i],
      dayName: dayNames[i],
      tasks,
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
  activities: DailyActivity[],
  weeksCount: number = 16,
  baseDate: Date = new Date()
): HeatmapDay[] {
  const days: HeatmapDay[] = [];
  const totalDays = weeksCount * 7;

  const countsByDate = new Map<string, { total: number; tasks: number; questions: number; labs: number }>();
  activities.forEach((a) => {
    if (!a.completedAt) return;
    const d = toLocalDateString(a.completedAt);
    const curr = countsByDate.get(d) || { total: 0, tasks: 0, questions: 0, labs: 0 };
    const qty = Number(a.quantity) || 1;
    curr.total += qty;

    const type = a.activityType || (a as any).type;
    if (type === 'task') curr.tasks += qty;
    if (type === 'question') curr.questions += qty;
    if (type === 'lab') curr.labs += qty;
    countsByDate.set(d, curr);
  });

  for (let i = totalDays - 1; i >= 0; i--) {
    const d = new Date(baseDate);
    d.setDate(d.getDate() - i);
    const dateStr = toLocalDateString(d);
    const data = countsByDate.get(dateStr) || { total: 0, tasks: 0, questions: 0, labs: 0 };

    let level: 0 | 1 | 2 | 3 | 4 = 0;
    if (data.total >= 13) level = 4;
    else if (data.total >= 8) level = 3;
    else if (data.total >= 4) level = 2;
    else if (data.total >= 1) level = 1;

    days.push({
      date: dateStr,
      count: data.total,
      tasks: data.tasks,
      questions: data.questions,
      labs: data.labs,
      level,
    });
  }

  return days;
}

export interface CourseDistribution {
  courseName: string;
  tasks: number;
  questions: number;
  labs: number;
  durationMinutes: number;
  totalActivities: number;
  percentage: number;
}

export function calculateCourseDistribution(activities: DailyActivity[]): CourseDistribution[] {
  const map = new Map<string, { tasks: number; questions: number; labs: number; duration: number; count: number }>();

  let totalCompletions = 0;

  activities.forEach((a) => {
    const course = a.courseName?.trim() || 'General / Unassigned';
    const entry = map.get(course) || { tasks: 0, questions: 0, labs: 0, duration: 0, count: 0 };
    const qty = Number(a.quantity) || 1;
    const dur = Number(a.durationMinutes) || 0;

    entry.count += 1;
    entry.duration += dur;

    const type = a.activityType || (a as any).type;
    if (type === 'task') {
      entry.tasks += qty;
      totalCompletions += qty;
    } else if (type === 'question') {
      entry.questions += qty;
      totalCompletions += qty;
    } else if (type === 'lab') {
      entry.labs += qty;
    }
    map.set(course, entry);
  });

  const list: CourseDistribution[] = [];
  map.forEach((val, name) => {
    const totalForCourse = val.tasks + val.questions;
    const pct = totalCompletions > 0 ? Math.round((totalForCourse / totalCompletions) * 100) : 0;
    list.push({
      courseName: name,
      tasks: val.tasks,
      questions: val.questions,
      labs: val.labs,
      durationMinutes: val.duration,
      totalActivities: val.count,
      percentage: pct,
    });
  });

  return list.sort((a, b) => b.tasks + b.questions - (a.tasks + a.questions));
}

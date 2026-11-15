import React, { useState, useEffect } from 'react';
import {
  LayoutDashboard,
  History,
  BarChart3,
  GraduationCap,
  Target,
  Settings,
  Plus,
  Flame,
  Code2,
  FlaskConical,
  BookOpen,
  Clock,
  Search,
  Filter,
  Trash2,
  Edit2,
  Download,
  Upload,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import {
  LearningActivity,
  Course,
  LearningGoals,
  DailyStats,
  WeeklyDayStat,
  StreakInfo,
  HeatmapDay,
  ActivityType,
} from '../types';
import { StorageService } from '../services/storage.service';
import {
  calculateDailyStats,
  calculateWeeklyActivity,
  calculateHeatmap,
  calculateCourseDistribution,
} from '../utils/analyticsCalculator';
import { calculateStreak } from '../utils/streakCalculator';
import { getGreeting, formatHeaderDate, formatDuration, formatDateTime, toLocalDateString } from '../utils/dateUtils';
import { ActivityLogModal } from '../components/ActivityLogModal';
import { EditActivityModal } from '../components/EditActivityModal';
import { StudyTimer } from '../components/StudyTimer';
import { HeatmapGrid } from '../components/HeatmapGrid';

type Tab = 'overview' | 'log' | 'analytics' | 'courses' | 'goals' | 'settings';

export const DashboardApp: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [activities, setActivities] = useState<LearningActivity[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [goals, setGoals] = useState<LearningGoals>({
    dailyQuestions: 15,
    dailyLabs: 2,
    dailyLessons: 3,
    dailyLearningMinutes: 120,
    weeklyQuestions: 75,
    weeklyLabs: 10,
  });

  // Modals & UI states
  const [isLogModalOpen, setIsLogModalOpen] = useState<boolean>(false);
  const [editingActivity, setEditingActivity] = useState<LearningActivity | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState<boolean>(false);
  const [undoDeletedActivity, setUndoDeletedActivity] = useState<LearningActivity | null>(null);
  const [undoToastVisible, setUndoToastVisible] = useState<boolean>(false);
  const [notification, setNotification] = useState<string | null>(null);

  // Filters for Activity Log
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<string>('all');
  const [selectedCourseFilter, setSelectedCourseFilter] = useState<string>('all');

  // Load state
  const loadAllData = async () => {
    try {
      await StorageService.purgeSampleData();
      const [storedActivities, storedCourses, storedGoals] = await Promise.all([
        StorageService.getActivities(),
        StorageService.getCourses(),
        StorageService.getGoals(),
      ]);

      setActivities(storedActivities);
      setCourses(storedCourses);
      setGoals(storedGoals);
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
    }
  };

  useEffect(() => {
    loadAllData();
  }, []);

  const showNotification = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 3000);
  };

  // Activity Actions
  const handleDeleteActivity = async (id: string) => {
    const deleted = await StorageService.deleteActivity(id);
    if (deleted) {
      setUndoDeletedActivity(deleted);
      setUndoToastVisible(true);
      setTimeout(() => setUndoToastVisible(false), 6000);
    }
    await loadAllData();
  };

  const handleUndoDelete = async () => {
    if (undoDeletedActivity) {
      await StorageService.saveActivity(undoDeletedActivity);
      setUndoDeletedActivity(null);
      setUndoToastVisible(false);
      await loadAllData();
      showNotification('Activity restored successfully!');
    }
  };

  const handleExportJSON = async () => {
    const json = await StorageService.exportDataJSON();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kodehub-backup-${toLocalDateString()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showNotification('Backup exported as JSON');
  };

  const handleExportCSV = async () => {
    const csv = await StorageService.exportActivitiesCSV();
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kodehub-activities-${toLocalDateString()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showNotification('Activities exported as CSV');
  };

  const handleImportJSON = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      const content = event.target?.result as string;
      const res = await StorageService.importDataJSON(content);
      if (res.success) {
        await loadAllData();
        showNotification(`Successfully restored ${res.count} activities!`);
      } else {
        alert(`Import error: ${res.error}`);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleClearData = async () => {
    if (window.confirm('Are you sure you want to reset all data? This cannot be undone.')) {
      await StorageService.clearAllData();
      await loadAllData();
      showNotification('All data cleared.');
    }
  };

  // Calculations
  const now = new Date();
  const dailyStats: DailyStats = calculateDailyStats(activities, goals, now);
  const weeklyData: WeeklyDayStat[] = calculateWeeklyActivity(activities, now);
  const streakInfo: StreakInfo = calculateStreak(activities, now);
  const heatmapData: HeatmapDay[] = calculateHeatmap(activities, 16, now);
  const courseDist = calculateCourseDistribution(activities);

  // Overall totals
  const totalQuestionsAllTime = activities
    .filter((a) => a.type === 'question')
    .reduce((sum, a) => sum + (Number(a.quantity) || 1), 0);
  const totalLabsAllTime = activities
    .filter((a) => a.type === 'lab')
    .reduce((sum, a) => sum + (Number(a.quantity) || 1), 0);
  const totalStudyMinutesAllTime = activities.reduce((sum, a) => sum + (Number(a.durationMinutes) || 0), 0);

  // Filtered activities
  const filteredActivities = activities.filter((act) => {
    const matchesSearch =
      searchQuery === '' ||
      act.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (act.courseName && act.courseName.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (act.module && act.module.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (act.notes && act.notes.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesType = selectedTypeFilter === 'all' || act.type === selectedTypeFilter;
    const matchesCourse = selectedCourseFilter === 'all' || act.courseId === selectedCourseFilter;

    return matchesSearch && matchesType && matchesCourse;
  });

  return (
    <div className="flex h-screen bg-[#0d131f] text-slate-100 font-sans overflow-hidden">
      {/* 1. Left Navigation Sidebar */}
      <aside className="w-64 bg-[#111827] border-r border-[#1f293d] flex flex-col justify-between shrink-0">
        <div>
          {/* Logo & Brand */}
          <div className="p-5 border-b border-[#1f293d] flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-indigo-600/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400">
                <Code2 className="w-5 h-5 text-indigo-300" />
              </div>
              <div>
                <h1 className="text-base font-bold text-white tracking-tight">KodeHub</h1>
                <p className="text-[11px] text-slate-400">Learning Progress Tracker</p>
              </div>
            </div>
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" title="Extension Active" />
          </div>

          {/* Nav Links */}
          <nav className="p-3 space-y-1">
            <button
              onClick={() => setActiveTab('overview')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium transition ${
                activeTab === 'overview'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-[#182234]'
              }`}
            >
              <LayoutDashboard className="w-4 h-4" />
              <span>Overview</span>
            </button>

            <button
              onClick={() => setActiveTab('log')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium transition ${
                activeTab === 'log'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-[#182234]'
              }`}
            >
              <History className="w-4 h-4" />
              <span>Activity Log</span>
              <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded-md bg-[#1f2b42] text-slate-300 font-mono">
                {activities.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('analytics')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium transition ${
                activeTab === 'analytics'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-[#182234]'
              }`}
            >
              <BarChart3 className="w-4 h-4" />
              <span>Analytics & Trends</span>
            </button>

            <button
              onClick={() => setActiveTab('courses')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium transition ${
                activeTab === 'courses'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-[#182234]'
              }`}
            >
              <GraduationCap className="w-4 h-4" />
              <span>Courses & Tracks</span>
              <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded-md bg-[#1f2b42] text-slate-300 font-mono">
                {courses.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('goals')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium transition ${
                activeTab === 'goals'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-[#182234]'
              }`}
            >
              <Target className="w-4 h-4" />
              <span>Goals & Targets</span>
            </button>

            <button
              onClick={() => setActiveTab('settings')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium transition ${
                activeTab === 'settings'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-[#182234]'
              }`}
            >
              <Settings className="w-4 h-4" />
              <span>Data & Settings</span>
            </button>
          </nav>
        </div>

        {/* Bottom Streak & Quick Action */}
        <div className="p-4 border-t border-[#1f293d] space-y-3">
          <div className="bg-[#161f30] border border-[#233047] p-3 rounded-xl flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 text-slate-200 font-semibold">
              <Flame className="w-4 h-4 text-orange-400 fill-orange-400" />
              <span>{streakInfo.currentStreak}-Day Streak</span>
            </div>
            <span className="text-[11px] text-slate-400">Max: {streakInfo.longestStreak}d</span>
          </div>

          <button
            onClick={() => setIsLogModalOpen(true)}
            className="w-full flex items-center justify-center gap-2 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl text-xs shadow-lg shadow-indigo-600/25 transition active:scale-[0.98]"
          >
            <Plus className="w-4 h-4" />
            <span>+ Log Learning</span>
          </button>
        </div>
      </aside>

      {/* 2. Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        {/* Top Header */}
        <header className="px-8 py-5 border-b border-[#1f293d] flex items-center justify-between bg-[#0d131f]/90 backdrop-blur sticky top-0 z-20">
          <div>
            <h2 className="text-xl font-bold text-white tracking-tight">
              {activeTab === 'overview' && 'Personal Learning Dashboard'}
              {activeTab === 'log' && 'Learning Activity Log'}
              {activeTab === 'analytics' && 'Learning Analytics & Trends'}
              {activeTab === 'courses' && 'Active Courses & Certifications'}
              {activeTab === 'goals' && 'Learning Goals & Targets'}
              {activeTab === 'settings' && 'Data Management & Extension Settings'}
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">{formatHeaderDate(now)}</p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsLogModalOpen(true)}
              className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold shadow-md transition"
            >
              <Plus className="w-4 h-4" />
              <span>Quick Log</span>
            </button>
          </div>
        </header>

        {/* Tab Body */}
        <div className="p-8 space-y-6 flex-1">
          {/* Notification Toast */}
          {notification && (
            <div className="fixed bottom-6 right-6 z-50 bg-indigo-600 text-white px-4 py-2.5 rounded-xl shadow-xl flex items-center gap-2 text-xs font-medium animate-slide-up">
              <CheckCircle2 className="w-4 h-4" />
              <span>{notification}</span>
            </div>
          )}

          {/* Undo Toast */}
          {undoToastVisible && undoDeletedActivity && (
            <div className="fixed bottom-6 right-6 z-50 bg-[#1e293b] border border-slate-700 text-white px-4 py-3 rounded-xl shadow-2xl flex items-center gap-4 text-xs">
              <span>Activity deleted</span>
              <button
                onClick={handleUndoDelete}
                className="text-indigo-400 hover:text-indigo-300 font-semibold underline flex items-center gap-1"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Undo</span>
              </button>
            </div>
          )}

          {/* ===================== TAB 1: OVERVIEW ===================== */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* Top 4 Stat Cards */}
              <div className="grid grid-cols-4 gap-4">
                <div className="bg-[#161f30] border border-[#233047] rounded-2xl p-5 shadow-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-400 font-medium">Questions Solved Today</span>
                    <div className="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-400 flex items-center justify-center">
                      <Code2 className="w-4 h-4" />
                    </div>
                  </div>
                  <div className="text-3xl font-bold text-white mt-2 tracking-tight">
                    {dailyStats.questionsSolved}
                  </div>
                  <div className="text-xs text-indigo-300 mt-1">
                    Goal: {dailyStats.dailyGoal} questions ({dailyStats.progressPercent}%)
                  </div>
                </div>

                <div className="bg-[#161f30] border border-[#233047] rounded-2xl p-5 shadow-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-400 font-medium">Labs Completed Today</span>
                    <div className="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-400 flex items-center justify-center">
                      <FlaskConical className="w-4 h-4" />
                    </div>
                  </div>
                  <div className="text-3xl font-bold text-white mt-2 tracking-tight">
                    {dailyStats.labsCompleted}
                  </div>
                  <div className="text-xs text-slate-400 mt-1">Target: {goals.dailyLabs} labs</div>
                </div>

                <div className="bg-[#161f30] border border-[#233047] rounded-2xl p-5 shadow-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-400 font-medium">Lessons Completed</span>
                    <div className="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-400 flex items-center justify-center">
                      <BookOpen className="w-4 h-4" />
                    </div>
                  </div>
                  <div className="text-3xl font-bold text-white mt-2 tracking-tight">
                    {dailyStats.lessonsCompleted}
                  </div>
                  <div className="text-xs text-slate-400 mt-1">Target: {goals.dailyLessons} topics</div>
                </div>

                <div className="bg-[#161f30] border border-[#233047] rounded-2xl p-5 shadow-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-400 font-medium">Learning Time Today</span>
                    <div className="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-400 flex items-center justify-center">
                      <Clock className="w-4 h-4" />
                    </div>
                  </div>
                  <div className="text-3xl font-bold text-white mt-2 tracking-tight">
                    {formatDuration(dailyStats.learningTimeMinutes)}
                  </div>
                  <div className="text-xs text-slate-400 mt-1">Target: {goals.dailyLearningMinutes}m</div>
                </div>
              </div>

              {/* Goal Progress Banner */}
              <div className="bg-[#161f30] border border-[#233047] rounded-2xl p-5 shadow-sm flex items-center justify-between gap-6">
                <div className="flex-1">
                  <div className="flex items-center justify-between text-xs mb-2">
                    <span className="font-semibold text-white">Daily Question Target Progress</span>
                    <span className="text-slate-400 font-medium">
                      {dailyStats.questionsSolved} of {dailyStats.dailyGoal} questions completed
                    </span>
                  </div>
                  <div className="h-2.5 w-full bg-[#1f2b42] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#818cf8] rounded-full transition-all duration-700"
                      style={{ width: `${dailyStats.progressPercent}%` }}
                    />
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-2xl font-bold text-indigo-300">{dailyStats.progressPercent}%</div>
                  <div className="text-xs text-slate-400">
                    {dailyStats.remainingQuestions > 0
                      ? `${dailyStats.remainingQuestions} more to reach target`
                      : 'Daily Target Met! 🔥'}
                  </div>
                </div>
              </div>

              {/* Grid: Left = Timer & Weekly Chart, Right = Recent Activity */}
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-6">
                  {/* Study Timer */}
                  <StudyTimer courses={courses} onSessionLogged={loadAllData} />

                  {/* Weekly Chart */}
                  <div className="bg-[#161f30] border border-[#233047] rounded-2xl p-5 shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                      <h4 className="text-sm font-semibold text-white">Weekly Activity (Questions)</h4>
                      <span className="text-xs text-slate-400">Current Week</span>
                    </div>
                    <div className="h-48 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={weeklyData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#233047" vertical={false} />
                          <XAxis dataKey="dayName" stroke="#64748b" fontSize={11} tickLine={false} />
                          <YAxis stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: '#111827',
                              borderColor: '#334155',
                              borderRadius: '8px',
                              fontSize: '12px',
                            }}
                          />
                          <Bar dataKey="questions" name="Questions" fill="#818cf8" radius={[6, 6, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>

                {/* Right: Recent Activities List */}
                <div className="bg-[#161f30] border border-[#233047] rounded-2xl p-5 shadow-sm flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h4 className="text-sm font-semibold text-white">Recent Learning Activities</h4>
                        <p className="text-xs text-slate-400">Latest manual activity entries</p>
                      </div>
                      <button
                        onClick={() => setActiveTab('log')}
                        className="text-xs text-indigo-400 hover:text-indigo-300 font-medium"
                      >
                        View all &rarr;
                      </button>
                    </div>

                    <div className="space-y-3">
                      {activities.slice(0, 5).map((act) => (
                        <div
                          key={act.id}
                          className="p-3 bg-[#0f172a] border border-[#1f293d] rounded-xl flex items-center justify-between hover:border-slate-700 transition"
                        >
                          <div className="flex items-start gap-3">
                            <div className="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-300 flex items-center justify-center shrink-0 mt-0.5">
                              {act.type === 'question' && <Code2 className="w-4 h-4" />}
                              {act.type === 'lab' && <FlaskConical className="w-4 h-4" />}
                              {act.type === 'lesson' && <BookOpen className="w-4 h-4" />}
                              {act.type === 'other' && <Clock className="w-4 h-4" />}
                            </div>
                            <div>
                              <div className="text-xs font-semibold text-white">{act.title}</div>
                              <div className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-2">
                                <span>{act.courseName}</span>
                                <span>•</span>
                                <span>{formatDateTime(act.completedAt)}</span>
                              </div>
                            </div>
                          </div>

                          <div className="text-right shrink-0">
                            {act.type === 'question' && (
                              <div className="text-xs font-bold text-indigo-300">+{act.quantity} Q</div>
                            )}
                            <div className="text-[11px] text-slate-400">{formatDuration(act.durationMinutes)}</div>
                          </div>
                        </div>
                      ))}

                      {activities.length === 0 && (
                        <div className="text-center py-8 text-slate-500 text-xs">
                          No activities logged yet. Click "+ Log Learning" to get started!
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="pt-4 border-t border-[#1f293d] flex items-center justify-between text-xs text-slate-400">
                    <span>Total {activities.length} logged activities</span>
                    <span className="text-slate-500 font-mono text-[11px]">Real Data Mode</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ===================== TAB 2: ACTIVITY LOG ===================== */}
          {activeTab === 'log' && (
            <div className="space-y-4">
              {/* Filters */}
              <div className="bg-[#161f30] border border-[#233047] rounded-2xl p-4 shadow-sm flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 flex-1">
                  <div className="relative flex-1 max-w-md">
                    <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      placeholder="Search activities by title, notes, module..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full bg-[#0f172a] border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  <select
                    value={selectedTypeFilter}
                    onChange={(e) => setSelectedTypeFilter(e.target.value)}
                    className="bg-[#0f172a] border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
                  >
                    <option value="all">All Activity Types</option>
                    <option value="question">Questions Solved</option>
                    <option value="lab">Labs Completed</option>
                    <option value="lesson">Lessons Completed</option>
                    <option value="task">Tasks</option>
                    <option value="mock_exam">Mock Exams</option>
                    <option value="other">Other / Timed Study</option>
                  </select>

                  <select
                    value={selectedCourseFilter}
                    onChange={(e) => setSelectedCourseFilter(e.target.value)}
                    className="bg-[#0f172a] border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
                  >
                    <option value="all">All Courses</option>
                    {courses.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="text-xs text-slate-400 font-mono">
                  Showing {filteredActivities.length} of {activities.length}
                </div>
              </div>

              {/* Table */}
              <div className="bg-[#161f30] border border-[#233047] rounded-2xl overflow-hidden shadow-sm">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-[#0f172a] text-slate-400 uppercase text-[10px] tracking-wider border-b border-[#233047]">
                    <tr>
                      <th className="py-3 px-4">Date & Time</th>
                      <th className="py-3 px-4">Type</th>
                      <th className="py-3 px-4">Course</th>
                      <th className="py-3 px-4">Title & Details</th>
                      <th className="py-3 px-4 text-center">Count</th>
                      <th className="py-3 px-4 text-center">Duration</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1f293d]">
                    {filteredActivities.map((act) => (
                      <tr key={act.id} className="hover:bg-[#182234] transition">
                        <td className="py-3.5 px-4 font-mono text-[11px] text-slate-400">
                          {formatDateTime(act.completedAt)}
                        </td>
                        <td className="py-3.5 px-4">
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold ${
                              act.type === 'question'
                                ? 'bg-indigo-950/80 text-indigo-300 border border-indigo-800/80'
                                : act.type === 'lab'
                                ? 'bg-cyan-950/80 text-cyan-300 border border-cyan-800/80'
                                : act.type === 'lesson'
                                ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-800/80'
                                : 'bg-slate-800 text-slate-300 border border-slate-700'
                            }`}
                          >
                            {act.type.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 font-medium text-white max-w-[200px] truncate">
                          {act.courseName}
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="font-semibold text-slate-200">{act.title}</div>
                          {act.module && (
                            <div className="text-[11px] text-slate-500">Module: {act.module}</div>
                          )}
                          {act.notes && (
                            <div className="text-[11px] text-slate-400 italic line-clamp-1">"{act.notes}"</div>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-center font-bold text-white">
                          {act.quantity || 1}
                        </td>
                        <td className="py-3.5 px-4 text-center text-slate-400">
                          {formatDuration(act.durationMinutes)}
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => {
                                setEditingActivity(act);
                                setIsEditModalOpen(true);
                              }}
                              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
                              title="Edit Activity"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDeleteActivity(act.id)}
                              className="p-1.5 text-slate-400 hover:text-rose-400 rounded-lg hover:bg-rose-950/50"
                              title="Delete Activity"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}

                    {filteredActivities.length === 0 && (
                      <tr>
                        <td colSpan={7} className="py-12 text-center text-slate-500 text-xs">
                          No activities match your filters.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ===================== TAB 3: ANALYTICS & TRENDS ===================== */}
          {activeTab === 'analytics' && (
            <div className="space-y-6">
              {/* All-time summary row */}
              <div className="grid grid-cols-4 gap-4">
                <div className="bg-[#161f30] border border-[#233047] rounded-2xl p-5">
                  <span className="text-xs text-slate-400">Total Questions Solved</span>
                  <div className="text-3xl font-bold text-white mt-1">{totalQuestionsAllTime}</div>
                </div>
                <div className="bg-[#161f30] border border-[#233047] rounded-2xl p-5">
                  <span className="text-xs text-slate-400">Total Labs Completed</span>
                  <div className="text-3xl font-bold text-white mt-1">{totalLabsAllTime}</div>
                </div>
                <div className="bg-[#161f30] border border-[#233047] rounded-2xl p-5">
                  <span className="text-xs text-slate-400">Total Study Time</span>
                  <div className="text-3xl font-bold text-white mt-1">
                    {formatDuration(totalStudyMinutesAllTime)}
                  </div>
                </div>
                <div className="bg-[#161f30] border border-[#233047] rounded-2xl p-5">
                  <span className="text-xs text-slate-400">Longest Study Streak</span>
                  <div className="text-3xl font-bold text-orange-400 mt-1">
                    {streakInfo.longestStreak} days
                  </div>
                </div>
              </div>

              {/* GitHub-style Heatmap */}
              <HeatmapGrid data={heatmapData} />

              {/* Course Distribution & Weekly Comparison */}
              <div className="grid grid-cols-2 gap-6">
                {/* Course Distribution */}
                <div className="bg-[#161f30] border border-[#233047] rounded-2xl p-5 shadow-sm">
                  <h4 className="text-sm font-semibold text-white mb-1">Course Progress Breakdown</h4>
                  <p className="text-xs text-slate-400 mb-4">Questions solved per course</p>

                  <div className="space-y-4">
                    {courseDist.map((course, idx) => (
                      <div key={idx} className="space-y-1.5">
                        <div className="flex justify-between text-xs">
                          <span className="font-medium text-white truncate max-w-[260px]">
                            {course.courseName}
                          </span>
                          <span className="text-slate-400">
                            {course.questions} questions ({course.percentage}%)
                          </span>
                        </div>
                        <div className="h-2 w-full bg-[#1f2b42] rounded-full overflow-hidden">
                          <div
                            className="h-full bg-indigo-500 rounded-full"
                            style={{ width: `${course.percentage}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Weekly Bar Chart */}
                <div className="bg-[#161f30] border border-[#233047] rounded-2xl p-5 shadow-sm">
                  <h4 className="text-sm font-semibold text-white mb-1">Weekly Questions Distribution</h4>
                  <p className="text-xs text-slate-400 mb-4">Questions solved per day (Mon-Sun)</p>
                  <div className="h-56 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={weeklyData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#233047" vertical={false} />
                        <XAxis dataKey="dayName" stroke="#64748b" fontSize={11} tickLine={false} />
                        <YAxis stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: '#111827',
                            borderColor: '#334155',
                            borderRadius: '8px',
                            fontSize: '12px',
                          }}
                        />
                        <Bar dataKey="questions" fill="#818cf8" radius={[6, 6, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ===================== TAB 4: COURSES ===================== */}
          {activeTab === 'courses' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                {courses.map((course) => {
                  const courseActivities = activities.filter((a) => a.courseId === course.id);
                  const questions = courseActivities
                    .filter((a) => a.type === 'question')
                    .reduce((sum, a) => sum + (Number(a.quantity) || 1), 0);
                  const labs = courseActivities
                    .filter((a) => a.type === 'lab')
                    .reduce((sum, a) => sum + (Number(a.quantity) || 1), 0);

                  return (
                    <div
                      key={course.id}
                      className="bg-[#161f30] border border-[#233047] rounded-2xl p-5 shadow-sm flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-indigo-950/80 text-indigo-300 border border-indigo-800/80">
                            {course.category || 'Certification'}
                          </span>
                          <span className="text-xs text-slate-500 font-mono">
                            {courseActivities.length} logs
                          </span>
                        </div>
                        <h4 className="text-sm font-bold text-white mb-2">{course.name}</h4>
                      </div>

                      <div className="grid grid-cols-2 gap-2 pt-3 border-t border-[#1f293d] text-xs">
                        <div>
                          <span className="text-slate-400 block text-[11px]">Questions Solved</span>
                          <span className="text-base font-bold text-indigo-300">{questions}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[11px]">Labs Completed</span>
                          <span className="text-base font-bold text-cyan-300">{labs}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ===================== TAB 5: GOALS ===================== */}
          {activeTab === 'goals' && (
            <div className="max-w-xl bg-[#161f30] border border-[#233047] rounded-2xl p-6 shadow-sm space-y-5">
              <div>
                <h4 className="text-base font-bold text-white">Daily & Weekly Targets</h4>
                <p className="text-xs text-slate-400">
                  Configure target metrics for questions, labs, and daily study time
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Daily Questions Target (Primary Metric)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="200"
                    value={goals.dailyQuestions}
                    onChange={(e) => setGoals({ ...goals, dailyQuestions: parseInt(e.target.value) || 15 })}
                    className="w-full bg-[#0f172a] border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                  />
                  <p className="text-[11px] text-slate-500 mt-1">
                    Used for progress bar & extension icon badge count.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Daily Labs Target</label>
                    <input
                      type="number"
                      min="1"
                      max="20"
                      value={goals.dailyLabs}
                      onChange={(e) => setGoals({ ...goals, dailyLabs: parseInt(e.target.value) || 2 })}
                      className="w-full bg-[#0f172a] border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Daily Study Time (Minutes)
                    </label>
                    <input
                      type="number"
                      min="15"
                      max="720"
                      value={goals.dailyLearningMinutes}
                      onChange={(e) =>
                        setGoals({ ...goals, dailyLearningMinutes: parseInt(e.target.value) || 120 })
                      }
                      className="w-full bg-[#0f172a] border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
                    />
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-800">
                  <button
                    onClick={async () => {
                      await StorageService.saveGoals(goals);
                      showNotification('Goals saved successfully!');
                    }}
                    className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold shadow-lg shadow-indigo-600/30 transition"
                  >
                    Save Goals
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ===================== TAB 6: SETTINGS ===================== */}
          {activeTab === 'settings' && (
            <div className="max-w-xl space-y-6">
              {/* Backup & Export */}
              <div className="bg-[#161f30] border border-[#233047] rounded-2xl p-6 shadow-sm space-y-4">
                <h4 className="text-sm font-bold text-white">Data Export & Backup</h4>
                <p className="text-xs text-slate-400">
                  All your data is stored locally in your browser. Export backups for safekeeping.
                </p>

                <div className="flex gap-3">
                  <button
                    onClick={handleExportJSON}
                    className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-medium border border-slate-700 transition"
                  >
                    <Download className="w-4 h-4 text-indigo-400" />
                    <span>Export JSON Backup</span>
                  </button>

                  <button
                    onClick={handleExportCSV}
                    className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-medium border border-slate-700 transition"
                  >
                    <Download className="w-4 h-4 text-emerald-400" />
                    <span>Export CSV (Activities)</span>
                  </button>
                </div>
              </div>

              {/* Import */}
              <div className="bg-[#161f30] border border-[#233047] rounded-2xl p-6 shadow-sm space-y-4">
                <h4 className="text-sm font-bold text-white">Restore from Backup</h4>
                <p className="text-xs text-slate-400">Import a previously saved JSON backup file.</p>
                <div>
                  <input
                    type="file"
                    accept=".json"
                    onChange={handleImportJSON}
                    className="text-xs text-slate-400 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-indigo-600 file:text-white hover:file:bg-indigo-500 cursor-pointer"
                  />
                </div>
              </div>

              {/* Reset Data */}
              <div className="bg-[#161f30] border border-[#233047] rounded-2xl p-6 shadow-sm space-y-4">
                <h4 className="text-sm font-bold text-white">Reset & Clear Data</h4>
                <p className="text-xs text-slate-400">Permanently erase all local learning records and tracks.</p>
                <div className="flex items-center justify-between pt-2">
                  <button
                    onClick={handleClearData}
                    className="flex items-center gap-2 px-4 py-2 bg-rose-950/40 text-rose-300 border border-rose-800/40 hover:bg-rose-900/60 rounded-xl text-xs font-medium transition"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>Clear All Local Data</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Activity Log Modal */}
      <ActivityLogModal
        isOpen={isLogModalOpen}
        onClose={() => setIsLogModalOpen(false)}
        onActivitySaved={loadAllData}
        courses={courses}
      />

      {/* Edit Activity Modal */}
      <EditActivityModal
        activity={editingActivity}
        isOpen={isEditModalOpen}
        onClose={() => {
          setIsEditModalOpen(false);
          setEditingActivity(null);
        }}
        onSaved={loadAllData}
        courses={courses}
      />
    </div>
  );
};

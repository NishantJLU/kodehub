import React, { useEffect, useState } from 'react';
import {
  Code2,
  FlaskConical,
  BookOpen,
  Clock,
  Plus,
  ExternalLink,
  Flame,
  LayoutDashboard,
  RefreshCw,
  CheckCircle2,
} from 'lucide-react';
import { LearningActivity, Course, LearningGoals, DailyStats, WeeklyDayStat, StreakInfo } from '../types';
import { StorageService } from '../services/storage.service';
import { calculateDailyStats, calculateWeeklyActivity } from '../utils/analyticsCalculator';
import { calculateStreak } from '../utils/streakCalculator';
import { getGreeting, formatHeaderDate, formatDuration, toLocalDateString } from '../utils/dateUtils';
import { ActivityLogModal } from '../components/ActivityLogModal';

export const PopupApp: React.FC = () => {
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

  const [isLogModalOpen, setIsLogModalOpen] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isKodeKloudActive, setIsKodeKloudActive] = useState<boolean>(false);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);

  // Load real data from storage
  const loadData = async () => {
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
      console.error('Failed to load popup data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Check if active tab is on KodeKloud and auto-sync real progress
  const checkActiveTabAndSync = async () => {
    if (typeof chrome === 'undefined' || !chrome.tabs) return;

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab && tab.url && (tab.url.includes('kodekloud.com') || tab.url.includes('engineer.kodekloud.com'))) {
        setIsKodeKloudActive(true);
        triggerSyncFromTab(tab);
      }
    } catch (err) {
      console.warn('Tab detection error:', err);
    }
  };

  // Single authoritative sync path delegating to background worker
  const triggerSyncFromTab = async (tab?: chrome.tabs.Tab) => {
    if (typeof chrome === 'undefined' || !chrome.tabs || isSyncing) return;
    setIsSyncing(true);

    try {
      let targetTab = tab;
      if (!targetTab) {
        const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
        targetTab = active;
      }

      if (!targetTab || !targetTab.id) {
        setIsSyncing(false);
        return;
      }

      // Query content script for latest parsed DOM numbers
      chrome.tabs.sendMessage(targetTab.id, { type: 'EXTRACT_PROGRESS' }, (response) => {
        if (!chrome.runtime.lastError && response && response.data) {
          // Send to background service worker to atomically process and save!
          chrome.runtime.sendMessage({ type: 'KODEKLOUD_PROGRESS_SYNC', payload: response.data }, () => {
            loadData();
            setIsSyncing(false);
            setSyncStatus('Synced accurately from KodeKloud!');
            setTimeout(() => setSyncStatus(null), 3000);
          });
        } else {
          setIsSyncing(false);
        }
      });
    } catch (e) {
      console.warn('Sync error:', e);
      setIsSyncing(false);
    }
  };

  // Quick adjust today's questions
  const adjustTodayQuestions = async (delta: number) => {
    const currentToday = dailyStats.questionsSolved;
    const newCount = Math.max(0, currentToday + delta);

    if (typeof chrome !== 'undefined' && chrome.runtime) {
      chrome.runtime.sendMessage({ type: 'SET_TODAY_QUESTIONS', count: newCount }, () => {
        loadData();
      });
    } else {
      const todayStr = toLocalDateString();
      const existing = activities.find(
        (a) => a.id === 'kk-mlops-today' || (a.completedAt && a.completedAt.slice(0, 10) === todayStr)
      );
      if (existing) {
        await StorageService.updateActivity(existing.id, {
          quantity: newCount,
          durationMinutes: newCount * 15,
        });
      }
      await loadData();
    }
  };

  useEffect(() => {
    loadData();
    checkActiveTabAndSync();

    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
      const listener = (changes: any, area: string) => {
        if (area === 'local' && (changes.activities || changes.goals || changes.courses)) {
          loadData();
        }
      };
      chrome.storage.onChanged.addListener(listener);
      return () => chrome.storage.onChanged.removeListener(listener);
    }
  }, []);

  const openDashboard = () => {
    if (typeof chrome !== 'undefined' && chrome.tabs) {
      const dashboardUrl = chrome.runtime.getURL('dashboard.html');
      chrome.tabs.create({ url: dashboardUrl });
    } else {
      window.open('/dashboard.html', '_blank');
    }
  };

  const now = new Date();
  const dailyStats: DailyStats = calculateDailyStats(activities, goals, now);
  const weeklyData: WeeklyDayStat[] = calculateWeeklyActivity(activities, now);
  const streakInfo: StreakInfo = calculateStreak(activities, now);
  const maxWeeklyCount = Math.max(...weeklyData.map((d) => d.questions || d.totalActivities || 1), 16);

  if (isLoading) {
    return (
      <div className="w-[380px] h-[520px] bg-[#0d131f] flex items-center justify-center text-slate-400">
        <div className="flex flex-col items-center gap-2">
          <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-xs">Loading KodeHub...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="w-[380px] max-h-[580px] overflow-y-auto bg-[#0d131f] text-slate-100 p-3.5 font-sans select-none antialiased">
      {/* 1. Header Bar */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-[#1e2638] border border-[#2d3a54] flex items-center justify-center text-indigo-400 shadow-inner">
            <LayoutDashboard className="w-3.5 h-3.5 text-indigo-300" />
          </div>
          <div>
            <div className="text-xs font-bold text-white tracking-tight leading-none">KodeHub</div>
            <div className="text-[10px] text-slate-400 font-medium">Learning dashboard</div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Sync Button */}
          {isKodeKloudActive && (
            <button
              onClick={() => triggerSyncFromTab()}
              disabled={isSyncing}
              className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-semibold transition active:scale-95 shadow-sm"
              title="Sync latest progress from KodeKloud"
            >
              <RefreshCw className={`w-2.5 h-2.5 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>{isSyncing ? 'Syncing...' : 'Sync'}</span>
            </button>
          )}

          {/* Active Status Badge */}
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-950/70 border border-emerald-800/80 text-emerald-400 text-[10px] font-medium shadow-sm">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span>Active</span>
          </div>
        </div>
      </div>

      {/* Sync Status Banner */}
      {syncStatus && (
        <div className="mb-2.5 px-2.5 py-1.5 bg-indigo-950/80 border border-indigo-700/80 rounded-xl flex items-center gap-1.5 text-[11px] text-indigo-200 animate-fade-in">
          <CheckCircle2 className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
          <span>{syncStatus}</span>
        </div>
      )}

      {/* 2. Greeting Section */}
      <div className="mb-3">
        <h2 className="text-lg font-bold text-white tracking-tight leading-snug">{getGreeting(now)}</h2>
        <p className="text-[11px] text-slate-400">{formatHeaderDate(now)}</p>
      </div>

      {/* 3. 2x2 Stat Cards Grid */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        {/* Card 1: Questions Solved with quick adjuster */}
        <div className="bg-[#161f30] border border-[#233047] rounded-xl p-3 shadow-sm hover:border-[#2f405e] transition group">
          <div className="flex items-center justify-between text-indigo-300">
            <Code2 className="w-3.5 h-3.5 text-indigo-300/90" />
            <div className="flex items-center gap-1 opacity-70 group-hover:opacity-100 transition">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  adjustTodayQuestions(-1);
                }}
                className="w-4 h-4 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center text-[10px] font-bold"
                title="Decrease today's questions"
              >
                -
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  adjustTodayQuestions(1);
                }}
                className="w-4 h-4 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center text-[10px] font-bold"
                title="Increase today's questions"
              >
                +
              </button>
            </div>
          </div>
          <div className="text-2xl font-bold text-white mt-1 tracking-tight">
            {dailyStats.questionsSolved}
          </div>
          <div className="text-[11px] text-slate-400">Questions solved</div>
        </div>

        {/* Card 2: Labs Completed */}
        <div className="bg-[#161f30] border border-[#233047] rounded-xl p-3 shadow-sm hover:border-[#2f405e] transition">
          <div className="text-indigo-300">
            <FlaskConical className="w-3.5 h-3.5 text-indigo-300/90" />
          </div>
          <div className="text-2xl font-bold text-white mt-1 tracking-tight">
            {dailyStats.labsCompleted}
          </div>
          <div className="text-[11px] text-slate-400">Labs completed</div>
        </div>

        {/* Card 3: Lessons Completed */}
        <div className="bg-[#161f30] border border-[#233047] rounded-xl p-3 shadow-sm hover:border-[#2f405e] transition">
          <div className="text-indigo-300">
            <BookOpen className="w-3.5 h-3.5 text-indigo-300/90" />
          </div>
          <div className="text-2xl font-bold text-white mt-1 tracking-tight">
            {dailyStats.lessonsCompleted}
          </div>
          <div className="text-[11px] text-slate-400">Lessons completed</div>
        </div>

        {/* Card 4: Learning Time */}
        <div className="bg-[#161f30] border border-[#233047] rounded-xl p-3 shadow-sm hover:border-[#2f405e] transition">
          <div className="text-indigo-300">
            <Clock className="w-3.5 h-3.5 text-indigo-300/90" />
          </div>
          <div className="text-2xl font-bold text-white mt-1 tracking-tight">
            {formatDuration(dailyStats.learningTimeMinutes)}
          </div>
          <div className="text-[11px] text-slate-400">Learning time</div>
        </div>
      </div>

      {/* 4. Daily Question Goal Card */}
      <div className="bg-[#161f30] border border-[#233047] rounded-xl p-3 mb-3 shadow-sm">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold text-white">Daily question goal</span>
          <span className="text-slate-400 font-medium">
            {dailyStats.questionsSolved} / {dailyStats.dailyGoal}
          </span>
        </div>

        {/* Goal Progress Bar */}
        <div className="h-2 w-full bg-[#1f2b42] rounded-full my-2 overflow-hidden">
          <div
            className="h-full bg-[#818cf8] rounded-full transition-all duration-700 ease-out"
            style={{ width: `${dailyStats.progressPercent}%` }}
          />
        </div>

        <div className="text-[10px] text-slate-400">
          {dailyStats.progressPercent}% completed ·{' '}
          {dailyStats.remainingQuestions > 0
            ? `${dailyStats.remainingQuestions} more to go`
            : 'Goal achieved! 🎉'}
        </div>
      </div>

      {/* 5. Weekly Activity Card */}
      <div className="bg-[#161f30] border border-[#233047] rounded-xl p-3 mb-3 shadow-sm">
        <div className="flex items-center justify-between text-xs mb-2">
          <span className="font-semibold text-white">Weekly activity</span>
          <span className="text-slate-400 text-[11px]">Last 7 days</span>
        </div>

        {/* 7-Day Bar Chart */}
        <div className="grid grid-cols-7 gap-1.5 items-end h-[56px] pt-1 px-0.5">
          {weeklyData.map((day, idx) => {
            const count = day.questions || (day.totalActivities > 0 ? 1 : 0);
            const heightPercent = count > 0 ? Math.max(16, Math.min(100, Math.round((count / maxWeeklyCount) * 100))) : 8;

            return (
              <div key={idx} className="flex flex-col items-center h-full justify-end group">
                <div
                  className={`w-full rounded-md transition-all duration-500 hover:brightness-110 ${
                    count > 0 ? 'bg-[#818cf8]' : 'bg-[#1c2536]'
                  }`}
                  style={{ height: `${heightPercent}%` }}
                  title={`${day.dayName}: ${day.questions} questions (${formatDuration(day.durationMinutes)})`}
                />
                <span className="text-[10px] text-slate-400 font-medium mt-1">{day.dayLetter}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* 6. Streak Footer */}
      <div className="flex items-center justify-between text-xs px-1 mb-3 text-slate-400">
        <div className="flex items-center gap-1.5 text-slate-200 font-medium">
          <Flame className="w-3.5 h-3.5 text-orange-400 fill-orange-400" />
          <span>{streakInfo.currentStreak}-day streak</span>
        </div>
        <div className="text-[11px]">Longest: {streakInfo.longestStreak} days</div>
      </div>

      {/* 7. Action Buttons */}
      <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-800/80">
        <button
          onClick={() => setIsLogModalOpen(true)}
          className="flex items-center justify-center gap-1.5 py-2 px-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold shadow-lg shadow-indigo-600/25 transition active:scale-[0.98]"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>+ Log Activity</span>
        </button>

        <button
          onClick={openDashboard}
          className="flex items-center justify-center gap-1.5 py-2 px-3 bg-[#161f30] hover:bg-[#1e293f] text-slate-300 hover:text-white border border-[#233047] rounded-xl text-xs font-medium transition active:scale-[0.98]"
        >
          <span>Dashboard</span>
          <ExternalLink className="w-3 h-3 text-slate-400" />
        </button>
      </div>

      {/* Activity Log Modal */}
      <ActivityLogModal
        isOpen={isLogModalOpen}
        onClose={() => setIsLogModalOpen(false)}
        onActivitySaved={loadData}
        courses={courses}
      />
    </div>
  );
};

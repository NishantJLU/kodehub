import React, { useEffect, useState } from 'react';
import {
  CheckSquare,
  FlaskConical,
  BookOpen,
  Clock,
  Plus,
  ExternalLink,
  Flame,
  LayoutDashboard,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Clock3,
  Github,
} from 'lucide-react';
import {
  DailyActivity,
  Course,
  LearningGoals,
  DailyStats,
  WeeklyDayStat,
  StreakInfo,
  SyncResult,
  GitHubConfig,
} from '../types';
import { StorageService } from '../services/storage.service';
import { calculateDailyStats, calculateWeeklyActivity } from '../utils/analyticsCalculator';
import { calculateStreak } from '../utils/streakCalculator';
import { getGreeting, formatHeaderDate, formatDuration } from '../utils/dateUtils';
import { ActivityLogModal } from '../components/ActivityLogModal';

export const PopupApp: React.FC = () => {
  const [activities, setActivities] = useState<DailyActivity[]>([]);
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
  const [isKodeKloudTab, setIsKodeKloudTab] = useState<boolean>(false);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [lastSync, setLastSync] = useState<SyncResult | null>(null);
  const [gitHubConfig, setGitHubConfig] = useState<GitHubConfig | null>(null);
  const [isGitHubSyncing, setIsGitHubSyncing] = useState<boolean>(false);

  // Load real data from storage
  const loadData = async () => {
    try {
      const [storedActivities, storedCourses, storedGoals, storedLastSync, storedGitHub] = await Promise.all([
        StorageService.getActivities(),
        StorageService.getCourses(),
        StorageService.getGoals(),
        StorageService.getLastSyncResult(),
        StorageService.getGitHubConfig(),
      ]);

      setActivities(storedActivities);
      setCourses(storedCourses);
      setGoals(storedGoals);
      setLastSync(storedLastSync);
      setGitHubConfig(storedGitHub);
    } catch (err) {
      console.error('[KodeHub Popup] Failed to load popup data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Inspect if current active tab is KodeKloud
  const checkActiveTab = async () => {
    if (typeof chrome === 'undefined' || !chrome.tabs) return;

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.url && (tab.url.includes('engineer.kodekloud.com') || tab.url.includes('kodekloud.com'))) {
        setIsKodeKloudTab(true);
      } else {
        setIsKodeKloudTab(false);
      }
    } catch (err) {
      console.warn('[KodeHub Popup] Tab detection error:', err);
    }
  };

  // Helper to send message to tab as Promise
  const sendTabMessage = (tabId: number, message: any): Promise<any> => {
    return new Promise((resolve, reject) => {
      chrome.tabs.sendMessage(tabId, message, (response) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(response);
        }
      });
    });
  };

  // Helper to send message to background worker as Promise
  const executeBackgroundSync = (payload: any): Promise<any> => {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type: 'EXECUTE_SYNC', payload }, (bgResponse) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(bgResponse);
        }
      });
    });
  };

  // User-initiated synchronization with resilient dynamic script injection
  const triggerSync = async () => {
    if (typeof chrome === 'undefined' || !chrome.tabs || isSyncing) return;
    setIsSyncing(true);

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

      if (!tab?.id || !tab.url || (!tab.url.includes('engineer.kodekloud.com') && !tab.url.includes('kodekloud.com'))) {
        setIsSyncing(false);
        setLastSync({
          status: 'waiting_for_data',
          lastSyncedAt: new Date().toISOString(),
          newActivitiesCount: 0,
          coursesUpdated: 0,
          message: 'Open engineer.kodekloud.com to sync',
          tracks: [],
        });
        return;
      }

      console.log('[KodeHub Popup] Requesting progress from tab:', tab.id, tab.url);

      let response: any = null;
      try {
        response = await sendTabMessage(tab.id, { type: 'EXTRACT_PROGRESS' });
      } catch (err: any) {
        console.warn('[KodeHub Popup] Initial sendMessage failed, attempting programmatic injection:', err);
        // Script may not be running in this tab (e.g. tab opened before extension installed/updated)
        if (chrome.scripting && tab.id) {
          try {
            await chrome.scripting.executeScript({
              target: { tabId: tab.id },
              files: ['content.js'],
            });
            console.log('[KodeHub Popup] Content script injected dynamically. Retrying extraction...');
            // Small pause to allow content script registration
            await new Promise((res) => setTimeout(res, 150));
            response = await sendTabMessage(tab.id, { type: 'EXTRACT_PROGRESS' });
          } catch (injectErr: any) {
            console.error('[KodeHub Popup] Dynamic script injection failed:', injectErr);
            throw new Error('Unable to connect to KodeKloud page. Refresh the page.');
          }
        } else {
          throw new Error('Unable to connect to KodeKloud page. Refresh the page.');
        }
      }

      if (response?.status === 'ok' && Array.isArray(response?.data?.tracks)) {
        const tracks = response.data.tracks;
        console.log(`[KodeHub Popup] Content script returned ${tracks.length} tracks:`, tracks);

        if (tracks.length === 0) {
          setIsSyncing(false);
          const emptyResult: SyncResult = {
            status: 'waiting_for_data',
            lastSyncedAt: new Date().toISOString(),
            newActivitiesCount: 0,
            coursesUpdated: 0,
            message: 'No practice courses detected. Go to Practice tab.',
            tracks: [],
          };
          setLastSync(emptyResult);
          await StorageService.saveLastSyncResult(emptyResult);
          return;
        }

        // Delegate authoritative snapshot diffing to background worker
        const bgResponse = await executeBackgroundSync({
          tracks,
          diagnostics: response.data.diagnostics,
        });
        if (bgResponse?.result) {
          setLastSync(bgResponse.result);
        }
        await loadData();
        setIsSyncing(false);
      } else {
        throw new Error(response?.error || 'Unable to read practice courses from page.');
      }
    } catch (e: any) {
      console.error('[KodeHub Popup] Sync failure:', e);
      setIsSyncing(false);
      const failResult: SyncResult = {
        status: 'failed',
        lastSyncedAt: new Date().toISOString(),
        newActivitiesCount: 0,
        coursesUpdated: 0,
        message: e?.message || 'Sync failed. Refresh page.',
        tracks: [],
      };
      setLastSync(failResult);
      await StorageService.saveLastSyncResult(failResult);
    }
  };

  useEffect(() => {
    loadData();
    checkActiveTab();

    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
      const listener = (changes: any, area: string) => {
        if (area === 'local' && (changes.activities || changes.goals || changes.lastSyncResult)) {
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

  const handlePushGitHub = () => {
    if (typeof chrome === 'undefined' || isGitHubSyncing) return;
    setIsGitHubSyncing(true);
    chrome.runtime.sendMessage({ type: 'SYNC_GITHUB' }, () => {
      setIsGitHubSyncing(false);
      loadData();
    });
  };

  const now = new Date();
  const dailyStats: DailyStats = calculateDailyStats(activities, goals, now);
  const weeklyData: WeeklyDayStat[] = calculateWeeklyActivity(activities, now);
  const streakInfo: StreakInfo = calculateStreak(activities, now);
  const maxWeeklyCount = Math.max(...weeklyData.map((d) => d.tasks + d.questions || d.totalActivities || 1), 16);

  // Format last sync time display
  const formatSyncTime = (isoString?: string) => {
    if (!isoString) return '--:--';
    try {
      const d = new Date(isoString);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '--:--';
    }
  };

  if (isLoading) {
    return (
      <div className="w-[380px] h-[480px] bg-[#0d131f] flex flex-col items-center justify-center text-slate-400 gap-3">
        <RefreshCw className="w-6 h-6 animate-spin text-indigo-400" />
        <span className="text-xs">Loading learning data...</span>
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
          <button
            onClick={triggerSync}
            disabled={isSyncing}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold transition active:scale-95 shadow-sm ${
              isKodeKloudTab
                ? 'bg-indigo-600 hover:bg-indigo-500 text-white'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
            }`}
            title={isKodeKloudTab ? 'Sync progress from active KodeKloud page' : 'Open KodeKloud Engineer to sync'}
          >
            <RefreshCw className={`w-2.5 h-2.5 ${isSyncing ? 'animate-spin' : ''}`} />
            <span>{isSyncing ? 'Syncing...' : 'Sync'}</span>
          </button>

          {/* Verification Status Badge */}
          <div
            className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium border shadow-sm ${
              lastSync?.status === 'successful'
                ? 'bg-emerald-950/70 border-emerald-800/80 text-emerald-400'
                : lastSync?.status === 'failed'
                ? 'bg-rose-950/70 border-rose-800/80 text-rose-400'
                : 'bg-slate-900 border-slate-700 text-slate-400'
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                lastSync?.status === 'successful'
                  ? 'bg-emerald-400 animate-pulse'
                  : lastSync?.status === 'failed'
                  ? 'bg-rose-400'
                  : 'bg-slate-500'
              }`}
            />
            <span>
              {lastSync?.status === 'successful'
                ? 'Synced'
                : lastSync?.status === 'failed'
                ? 'Sync Failed'
                : 'Waiting Data'}
            </span>
          </div>
        </div>
      </div>

      {/* Sync Status Banner */}
      {lastSync && (
        <div className="mb-2.5 px-2.5 py-1.5 bg-[#161f30] border border-[#233047] rounded-xl flex items-center justify-between text-[11px] text-slate-300">
          <div className="flex items-center gap-1.5 truncate">
            {lastSync.status === 'successful' ? (
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            ) : lastSync.status === 'failed' ? (
              <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
            ) : (
              <Clock3 className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            )}
            <span className="truncate">{lastSync.message || 'Ready to sync'}</span>
          </div>
          <span className="text-[10px] text-slate-400 font-mono shrink-0 ml-2">
            {formatSyncTime(lastSync.lastSyncedAt)}
          </span>
        </div>
      )}

      {/* GitHub Sync Status Bar */}
      {gitHubConfig?.selectedRepo && (
        <div className="mb-2.5 px-2.5 py-1.5 bg-[#121a28] border border-[#1e2a3e] rounded-xl flex items-center justify-between text-[10px] text-slate-300">
          <div className="flex items-center gap-1.5 truncate">
            <Github className="w-3 h-3 text-slate-400 shrink-0" />
            <span className="truncate text-slate-300 font-mono">
              {gitHubConfig.selectedRepo.name}
            </span>
            {gitHubConfig.autoSync && (
              <span className="text-[8px] px-1 rounded bg-indigo-950/90 text-indigo-400 border border-indigo-800/80">
                Auto
              </span>
            )}
          </div>
          <button
            onClick={handlePushGitHub}
            disabled={isGitHubSyncing}
            className="text-indigo-400 hover:text-indigo-300 flex items-center gap-1 shrink-0 font-medium hover:underline disabled:opacity-50"
            title="Push verified progress to GitHub"
          >
            <RefreshCw className={`w-2.5 h-2.5 ${isGitHubSyncing ? 'animate-spin' : ''}`} />
            <span>{isGitHubSyncing ? 'Pushing...' : 'Push'}</span>
          </button>
        </div>
      )}

      {/* 2. Greeting Section */}
      <div className="mb-3">
        <h2 className="text-lg font-bold text-white tracking-tight leading-snug">{getGreeting(now)}</h2>
        <p className="text-[11px] text-slate-400">{formatHeaderDate(now)}</p>
      </div>

      {/* 3. 2x2 Stat Cards Grid */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        {/* Card 1: Tasks Completed (Verified from Platform) */}
        <div className="bg-[#161f30] border border-[#233047] rounded-xl p-3 shadow-sm hover:border-[#2f405e] transition">
          <div className="text-indigo-300 flex items-center justify-between">
            <CheckSquare className="w-3.5 h-3.5 text-indigo-300/90" />
            <span className="text-[10px] text-slate-400 font-medium">Verified</span>
          </div>
          <div className="text-2xl font-bold text-white mt-1 tracking-tight">
            {dailyStats.tasksCompleted}
          </div>
          <div className="text-[11px] text-slate-400">Tasks completed today</div>
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

      {/* 4. Daily Learning Goal Card */}
      <div className="bg-[#161f30] border border-[#233047] rounded-xl p-3 mb-3 shadow-sm">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold text-white">Daily target goal</span>
          <span className="text-slate-400 font-medium">
            {dailyStats.tasksCompleted} / {dailyStats.dailyGoal}
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
          {dailyStats.remainingTasks > 0
            ? `${dailyStats.remainingTasks} more to go`
            : 'Goal achieved! 🎉'}
        </div>
      </div>

      {/* 5. Weekly Activity Card */}
      <div className="bg-[#161f30] border border-[#233047] rounded-xl p-3 mb-3 shadow-sm">
        <div className="flex items-center justify-between text-xs mb-2">
          <span className="font-semibold text-white">Weekly activity</span>
          <span className="text-[10px] text-slate-400">Last 7 days</span>
        </div>

        <div className="h-20 flex items-end justify-between gap-1 pt-2">
          {weeklyData.map((d, index) => {
            const count = d.tasks + d.questions || d.totalActivities || 0;
            const barHeight = count > 0 ? Math.min(100, Math.max(14, Math.round((count / maxWeeklyCount) * 100))) : 4;
            const isToday = index === 6;

            return (
              <div key={d.dateStr} className="flex-1 flex flex-col items-center gap-1 group">
                <div
                  className="w-full relative flex items-end justify-center rounded-sm"
                  style={{ height: '56px' }}
                >
                  <div
                    className={`w-full rounded-sm transition-all duration-300 ${
                      count > 0
                        ? isToday
                          ? 'bg-[#818cf8]'
                          : 'bg-[#6366f1]/80 hover:bg-[#818cf8]'
                        : 'bg-[#1f2b42]'
                    }`}
                    style={{ height: `${barHeight}%` }}
                  />
                  {count > 0 && (
                    <span className="absolute -top-4 text-[9px] text-slate-300 opacity-0 group-hover:opacity-100 transition whitespace-nowrap bg-slate-900/90 px-1 rounded pointer-events-none z-10">
                      {count}
                    </span>
                  )}
                </div>
                <span
                  className={`text-[9px] ${
                    isToday ? 'text-indigo-400 font-bold' : 'text-slate-400'
                  }`}
                >
                  {d.dayLetter}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* 6. Streak Bar */}
      <div className="bg-[#161f30] border border-[#233047] rounded-xl px-3 py-2 flex items-center justify-between text-xs mb-3 shadow-sm">
        <div className="flex items-center gap-1.5 font-medium text-slate-200">
          <Flame className="w-4 h-4 text-amber-500 fill-amber-500 animate-pulse" />
          <span>{streakInfo.currentStreak}-day streak</span>
        </div>
        <div className="text-[10px] text-slate-400">
          Longest: {streakInfo.longestStreak} days
        </div>
      </div>

      {/* 7. Action Footer */}
      <div className="flex items-center gap-2 pt-1 border-t border-[#1e2a3f]">
        <button
          onClick={() => setIsLogModalOpen(true)}
          className="flex-1 bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white font-semibold py-2 px-3 rounded-xl text-xs flex items-center justify-center gap-1.5 transition active:scale-98 shadow-sm"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Log Activity</span>
        </button>

        <button
          onClick={openDashboard}
          className="bg-[#161f30] hover:bg-[#1f2a3f] text-slate-300 hover:text-white p-2 rounded-xl border border-[#233047] transition flex items-center justify-center"
          title="Open Full Analytics Dashboard"
        >
          <ExternalLink className="w-4 h-4" />
        </button>
      </div>

      {/* Modal for Manual Activity Logging */}
      <ActivityLogModal
        isOpen={isLogModalOpen}
        onClose={() => setIsLogModalOpen(false)}
        courses={courses}
        onActivitySaved={loadData}
      />
    </div>
  );
};

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

  // Helper to send message to tab as Promise with timeout
  const sendTabMessage = (tabId: number, message: any, timeoutMs = 5000): Promise<any> => {
    return new Promise((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          reject(new Error('Timed out waiting for KodeKloud page response.'));
        }
      }, timeoutMs);

      chrome.tabs.sendMessage(tabId, message, (response) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message || 'Tab communication error'));
        } else {
          resolve(response);
        }
      });
    });
  };

  // Helper to send message to background worker as Promise with timeout
  const executeBackgroundSync = (payload: any, timeoutMs = 8000): Promise<any> => {
    return new Promise((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          reject(new Error('Timed out waiting for background synchronization.'));
        }
      }, timeoutMs);

      chrome.runtime.sendMessage({ type: 'EXECUTE_SYNC', payload }, (bgResponse) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message || 'Background worker error'));
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
    const syncId = `sync-${Date.now()}`;
    console.log(`[KodeHub Popup][${syncId}] SYNC_STARTED`);

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

      if (!tab?.id || !tab.url || (!tab.url.includes('engineer.kodekloud.com') && !tab.url.includes('kodekloud.com'))) {
        setIsSyncing(false);
        const existingTracks = await StorageService.getTracks();
        console.warn(`[KodeHub Popup][${syncId}] TAB_DETECTION_FAILED: Not on KodeKloud practice page`);
        setLastSync({
          syncId,
          status: 'waiting_for_data',
          lastSyncedAt: new Date().toISOString(),
          newActivitiesCount: 0,
          coursesUpdated: 0,
          message: 'Open engineer.kodekloud.com/practice to sync',
          tracks: existingTracks,
          diagnostics: {
            stage: 'TAB_DETECTION',
            status: 'FAILED',
            reason: 'NOT_KODEKLOUD_TAB',
            url: tab?.url || '',
            activeTabUrl: tab?.url || '',
            elementsScanned: 0,
            cardsDiscovered: 0,
            strategiesUsed: [],
            extractionDurationMs: 0,
            validationWarnings: ['Active tab is not a KodeKloud page'],
            timestamp: new Date().toISOString(),
          },
        });
        return;
      }

      console.log(`[KodeHub Popup][${syncId}] TAB_DETECTED:`, tab.id, tab.url);

      let response: any = null;
      let contentScriptInjected = false;
      let contentScriptReady = false;

      // Ping to check if content script is active
      try {
        const ping = await sendTabMessage(tab.id, { type: 'PING' }, 1000);
        if (ping?.ready || ping?.status === 'ok') {
          contentScriptReady = true;
        }
      } catch {
        contentScriptReady = false;
      }

      // If not ready, dynamically inject content script
      if (!contentScriptReady && chrome.scripting && tab.id) {
        try {
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['content.js'],
          });
          contentScriptInjected = true;
          console.log(`[KodeHub Popup][${syncId}] CONTENT_SCRIPT_INJECTED dynamically.`);
          await new Promise((res) => setTimeout(res, 200));
        } catch (injectErr: any) {
          console.warn(`[KodeHub Popup][${syncId}] CONTENT_SCRIPT_INJECTION warning:`, injectErr);
        }
      }

      // Request live extraction
      console.log(`[KodeHub Popup][${syncId}] CONTENT_SCRIPT_REQUESTED`);
      try {
        response = await sendTabMessage(tab.id, { type: 'EXTRACT_PROGRESS' }, 5000);
      } catch (err: any) {
        console.error(`[KodeHub Popup][${syncId}] CONTENT_SCRIPT_REQUEST_FAILED:`, err);
        throw new Error('Unable to connect to KodeKloud page. Refresh the page.');
      }
      console.log(`[KodeHub Popup][${syncId}] CONTENT_SCRIPT_RESPONDED:`, response?.status);

      // Handle page loading state gracefully
      if (response?.status === 'waiting_for_data') {
        setIsSyncing(false);
        const existingTracks = await StorageService.getTracks();
        const waitResult: SyncResult = {
          syncId,
          status: 'waiting_for_data',
          lastSyncedAt: new Date().toISOString(),
          newActivitiesCount: 0,
          coursesUpdated: 0,
          message: response.message || 'Page elements are still loading...',
          tracks: existingTracks,
          diagnostics: response.diagnostics,
        };
        setLastSync(waitResult);
        await StorageService.saveLastSyncResult(waitResult);
        return;
      }

      const tracks = response?.data?.tracks || response?.tracks;
      const diagnostics = response?.data?.diagnostics || response?.diagnostics;
      const isSuccess =
        response &&
        (response.status === 'ok' || response.status === 'success' || response.success === true) &&
        Array.isArray(tracks);

      if (isSuccess) {
        console.log(`[KodeHub Popup][${syncId}] COURSES_EXTRACTED: ${tracks.length} tracks found`);

        if (tracks.length === 0) {
          setIsSyncing(false);
          const existingTracks = await StorageService.getTracks();
          const emptyResult: SyncResult = {
            syncId,
            status: 'waiting_for_data',
            lastSyncedAt: new Date().toISOString(),
            newActivitiesCount: 0,
            coursesUpdated: 0,
            message: 'No practice courses detected. Go to Practice tab.',
            tracks: existingTracks,
            diagnostics: {
              ...(diagnostics || {}),
              stage: 'DOM_EXTRACTION',
              status: 'WAITING_FOR_DATA',
              reason: 'NO_COURSES_DETECTED',
              activeTabUrl: tab.url,
            },
          };
          setLastSync(emptyResult);
          await StorageService.saveLastSyncResult(emptyResult);
          return;
        }

        // Delegate authoritative snapshot diffing to background worker
        console.log(`[KodeHub Popup][${syncId}] LOCAL_SYNC_REQUESTED in background worker`);
        const bgResponse = await executeBackgroundSync({
          syncId,
          tracks,
          diagnostics: {
            ...(diagnostics || {}),
            stage: 'BACKGROUND_SYNC',
            status: 'SUCCESS',
            contentScriptInjected,
            contentScriptReady: true,
            activeTabUrl: tab.url,
            backgroundResponseReceived: true,
          },
        });

        if (bgResponse?.result) {
          setLastSync(bgResponse.result);
          console.log(`[KodeHub Popup][${syncId}] LOCAL_SYNC_COMPLETED:`, bgResponse.result.message);
        }
        await loadData();
        setIsSyncing(false);
      } else {
        const errorMsg = response?.error || response?.message || 'Unable to read practice courses from page.';
        throw new Error(errorMsg);
      }
    } catch (e: any) {
      console.error(`[KodeHub Popup][${syncId}] SYNC_FAILED:`, e);
      setIsSyncing(false);
      // Preserve existing tracks on failure - NEVER wipe them!
      const existingTracks = await StorageService.getTracks();
      const failResult: SyncResult = {
        syncId,
        status: 'failed',
        lastSyncedAt: new Date().toISOString(),
        newActivitiesCount: 0,
        coursesUpdated: 0,
        message: e?.message || 'Sync failed. Refresh page.',
        tracks: existingTracks,
        diagnostics: {
          stage: 'DOM_EXTRACTION',
          status: 'FAILED',
          reason: e?.message || 'EXTRACTION_FAILURE',
          url: typeof window !== 'undefined' && window.location ? window.location.href : '',
          elementsScanned: 0,
          cardsDiscovered: existingTracks.length,
          strategiesUsed: [],
          extractionDurationMs: 0,
          validationWarnings: [e?.message || 'Unknown failure'],
          timestamp: new Date().toISOString(),
        },
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

      {/* GitHub Sync Status Bar (Decoupled from local sync) */}
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
            {gitHubConfig.lastSyncStatus === 'syncing' && (
              <span className="text-[8px] px-1.5 py-0.5 rounded bg-amber-950/90 text-amber-300 border border-amber-800/80 flex items-center gap-1">
                <RefreshCw className="w-2 h-2 animate-spin" />
                Pushing...
              </span>
            )}
            {gitHubConfig.lastSyncStatus === 'failed' && (
              <span
                className="text-[8px] px-1.5 py-0.5 rounded bg-rose-950/90 text-rose-300 border border-rose-800/80"
                title={gitHubConfig.lastSyncError || 'GitHub push failed'}
              >
                Push Failed
              </span>
            )}
          </div>
          <button
            onClick={handlePushGitHub}
            disabled={isGitHubSyncing || gitHubConfig.lastSyncStatus === 'syncing'}
            className="text-indigo-400 hover:text-indigo-300 flex items-center gap-1 shrink-0 font-medium hover:underline disabled:opacity-50"
            title="Push verified progress to GitHub"
          >
            <RefreshCw className={`w-2.5 h-2.5 ${isGitHubSyncing || gitHubConfig.lastSyncStatus === 'syncing' ? 'animate-spin' : ''}`} />
            <span>{isGitHubSyncing || gitHubConfig.lastSyncStatus === 'syncing' ? 'Pushing...' : 'Push'}</span>
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

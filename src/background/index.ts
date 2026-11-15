// KodeHub Background Service Worker (Manifest V3)
import { TrackProgress, SyncResult, GitHubConfig } from '../types';
import { StorageService } from '../services/storage.service';
import { processSyncSnapshots } from '../services/sync.service';
import { GitHubService } from '../services/github.service';
import { toLocalDateString } from '../utils/dateUtils';

if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onInstalled) {
  chrome.runtime.onInstalled.addListener(async (details) => {
    console.log('[KodeHub] Extension initialized / updated:', details.reason);

    try {
      const goals = await StorageService.getGoals();
      const settings = await StorageService.getSettings();

      if (!goals) {
        await StorageService.saveGoals({
          dailyQuestions: 15,
          dailyLabs: 2,
          dailyLessons: 3,
          dailyLearningMinutes: 120,
          weeklyQuestions: 75,
          weeklyLabs: 10,
        });
      }

      if (!settings) {
        await StorageService.saveSettings({
          theme: 'dark',
          showBadge: true,
          notificationsEnabled: false,
          streakFreezeDays: 1,
          autoSync: false,
        });
      }

      await updateBadge();
    } catch (err) {
      console.error('[KodeHub] Initialization error:', err);
    }
  });
}

// Update badge count with today's verified completed tasks
export async function updateBadge() {
  if (typeof chrome === 'undefined' || !chrome.action) return;
  try {
    const todayStr = toLocalDateString(new Date());
    const settings = await StorageService.getSettings();

    if (settings && settings.showBadge === false) {
      chrome.action.setBadgeText({ text: '' });
      return;
    }

    const activities = await StorageService.getActivities();
    const goals = await StorageService.getGoals();

    const todayCount = activities
      .filter((a) => a.completedAt && toLocalDateString(a.completedAt) === todayStr)
      .reduce((sum, a) => sum + (Number(a.quantity) || 1), 0);

    if (todayCount > 0) {
      chrome.action.setBadgeText({ text: String(todayCount) });
      const target = goals?.dailyQuestions || 15;
      if (todayCount >= target) {
        chrome.action.setBadgeBackgroundColor({ color: '#10b981' }); // Emerald
      } else {
        chrome.action.setBadgeBackgroundColor({ color: '#6366f1' }); // Indigo
      }
    } else {
      chrome.action.setBadgeText({ text: '' });
    }
  } catch (err) {
    console.warn('[KodeHub] Badge update skipped:', err);
  }
}

// Mutex lock to prevent overlapping sync operations with automatic expiration
let activeSyncId: string | null = null;
let syncLockTime = 0;
const SYNC_LOCK_TIMEOUT_MS = 15000; // Auto-release lock after 15s if interrupted

export function acquireSyncLock(syncId: string): boolean {
  const now = Date.now();
  if (activeSyncId && now - syncLockTime < SYNC_LOCK_TIMEOUT_MS) {
    return false; // Active lock held
  }
  activeSyncId = syncId;
  syncLockTime = now;
  return true;
}

export function releaseSyncLock(syncId: string): void {
  if (activeSyncId === syncId) {
    activeSyncId = null;
    syncLockTime = 0;
  }
}

// Authoritative Local Synchronization Handler (Completely decoupled from GitHub push delays)
export async function handleVerifiedSync(
  incomingTracks: TrackProgress[],
  diagnostics?: any,
  syncId = `sync-${Date.now()}`
): Promise<SyncResult> {
  const now = new Date().toISOString();
  console.log(`[KodeHub Background][${syncId}] LOCAL_SYNC_STARTED with ${incomingTracks?.length || 0} tracks`);

  if (!incomingTracks || incomingTracks.length === 0) {
    const failedResult: SyncResult = {
      syncId,
      status: 'waiting_for_data',
      lastSyncedAt: now,
      newActivitiesCount: 0,
      coursesUpdated: 0,
      message: 'No visible tracks detected on page',
      tracks: [],
      diagnostics,
    };
    await StorageService.saveLastSyncResult(failedResult);
    return failedResult;
  }

  if (!acquireSyncLock(syncId)) {
    console.warn(`[KodeHub Background][${syncId}] Concurrent sync prevented; existing lock active.`);
    const prev = await StorageService.getLastSyncResult();
    return (
      prev || {
        syncId,
        status: 'successful',
        lastSyncedAt: now,
        newActivitiesCount: 0,
        coursesUpdated: 0,
        tracks: incomingTracks,
        diagnostics,
      }
    );
  }

  try {
    const previousSnapshots = await StorageService.getTrackSnapshots();
    const syncOutcome = processSyncSnapshots(incomingTracks, previousSnapshots, { timestamp: now });

    // Save updated snapshots
    await StorageService.saveTrackSnapshots(syncOutcome.updatedSnapshots);

    // Save tracks list
    await StorageService.saveTracks(incomingTracks);

    // Ensure discovered courses exist in Course catalog dynamically
    for (const track of incomingTracks) {
      await StorageService.saveCourse({
        id: track.trackId,
        name: track.trackName,
        category: 'Certification Track',
        createdAt: now,
      });
    }

    // Save any newly observed activities
    for (const act of syncOutcome.newActivities) {
      await StorageService.saveActivity(act);
    }

    const localSyncResult: SyncResult = {
      syncId,
      status: 'successful',
      lastSyncedAt: now,
      newActivitiesCount: syncOutcome.newCompletionsCount,
      coursesUpdated: syncOutcome.coursesUpdatedCount,
      tracks: incomingTracks,
      diagnostics,
      message:
        syncOutcome.newCompletionsCount > 0
          ? `${syncOutcome.newCompletionsCount} new task completion(s) recorded`
          : 'Up to date. No new completions.',
    };

    await StorageService.saveLastSyncResult(localSyncResult);
    await updateBadge();
    console.log(`[KodeHub Background][${syncId}] LOCAL_SYNC_COMPLETED successfully:`, localSyncResult.message);

    // Trigger GitHub auto-sync ASYNCHRONOUSLY in the background without blocking local sync response!
    triggerGitHubAutoSync(incomingTracks, syncId).catch((ghErr) => {
      console.warn(`[KodeHub Background][${syncId}] GitHub auto-sync background error:`, ghErr);
    });

    return localSyncResult;
  } catch (err: any) {
    console.error(`[KodeHub Background][${syncId}] LOCAL_SYNC_FAILED:`, err);
    const errorResult: SyncResult = {
      syncId,
      status: 'failed',
      lastSyncedAt: now,
      newActivitiesCount: 0,
      coursesUpdated: 0,
      message: err.message || 'Synchronization failed',
      tracks: incomingTracks,
      diagnostics,
    };
    await StorageService.saveLastSyncResult(errorResult);
    return errorResult;
  } finally {
    releaseSyncLock(syncId);
  }
}

// Asynchronous GitHub Auto-Push Handler (Decoupled from local sync)
export async function triggerGitHubAutoSync(
  incomingTracks: TrackProgress[],
  syncId: string
): Promise<void> {
  const ghConfig = await StorageService.getGitHubConfig();
  if (!ghConfig || !ghConfig.token || !ghConfig.selectedRepo || !ghConfig.autoSync) {
    return; // Auto-sync disabled or not configured
  }

  console.log(`[KodeHub Background][${syncId}] GITHUB_PUSH_STARTED to ${ghConfig.selectedRepo.full_name}`);
  const now = new Date().toISOString();

  // Mark GitHub status as syncing in storage
  await StorageService.saveGitHubConfig({
    ...ghConfig,
    lastSyncStatus: 'syncing',
    lastSyncError: null,
  });

  try {
    const goals = (await StorageService.getGoals()) || {
      dailyQuestions: 15,
      dailyLabs: 2,
      dailyLessons: 3,
      dailyLearningMinutes: 120,
      weeklyQuestions: 75,
      weeklyLabs: 10,
    };
    const allActivities = await StorageService.getActivities();

    const ghResult = await GitHubService.syncProgressToGitHub(
      ghConfig,
      incomingTracks,
      allActivities,
      goals
    );

    if (ghResult.success) {
      const updatedConfig: GitHubConfig = {
        ...ghConfig,
        lastSyncAt: now,
        lastSyncCommitSha: ghResult.lastCommitSha || ghConfig.lastSyncCommitSha,
        lastSyncCommitUrl: ghResult.lastCommitUrl || ghConfig.lastSyncCommitUrl,
        lastSyncStatus: 'success',
        lastSyncError: null,
      };
      await StorageService.saveGitHubConfig(updatedConfig);

      if (ghResult.commitsCreated > 0) {
        await StorageService.saveGitHubCommitRecord({
          id: `gh-auto-${Date.now()}`,
          timestamp: now,
          commitSha: ghResult.lastCommitSha || 'auto-sync',
          commitUrl: ghResult.lastCommitUrl || ghConfig.selectedRepo.html_url,
          commitMessage: ghResult.message || 'KodeHub: Auto-sync progress',
          filesChanged: ghResult.filesUpdated,
          status: 'success',
        });
      }
      console.log(`[KodeHub Background][${syncId}] GITHUB_PUSH_COMPLETED: ${ghResult.filesUpdated.length} files updated`);
    } else {
      await StorageService.saveGitHubConfig({
        ...ghConfig,
        lastSyncStatus: 'failed',
        lastSyncError: ghResult.error || 'GitHub push failed',
      });
      console.warn(`[KodeHub Background][${syncId}] GITHUB_PUSH_FAILED:`, ghResult.error);
    }
  } catch (err: any) {
    console.error(`[KodeHub Background][${syncId}] GITHUB_PUSH_EXCEPTION:`, err);
    await StorageService.saveGitHubConfig({
      ...ghConfig,
      lastSyncStatus: 'failed',
      lastSyncError: err?.message || 'GitHub network error',
    });
  }
}

// Storage change listener
if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && (changes.activities || changes.goals || changes.settings)) {
      updateBadge();
    }
  });
}

// Extension Message Listener
if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'OPEN_DASHBOARD') {
    const url = chrome.runtime.getURL('dashboard.html');
    chrome.tabs.create({ url });
    sendResponse({ status: 'ok' });
    return false;
  }
  
  if (message.type === 'REFRESH_BADGE') {
    updateBadge();
    sendResponse({ status: 'ok' });
    return false;
  }
  
  if (message.type === 'EXECUTE_SYNC') {
    const tracks = Array.isArray(message.payload) ? message.payload : message.payload?.tracks || [];
    const diagnostics = message.payload?.diagnostics;
    const syncId = message.payload?.syncId || `sync-${Date.now()}`;
    console.log(`[KodeHub Background][${syncId}] Received EXECUTE_SYNC request for tracks:`, tracks.length);
    handleVerifiedSync(tracks, diagnostics, syncId)
      .then((result) => {
        console.log(`[KodeHub Background][${syncId}] EXECUTE_SYNC completed with status:`, result.status);
        sendResponse({ status: 'ok', result });
      })
      .catch((err) => {
        console.error(`[KodeHub Background][${syncId}] EXECUTE_SYNC failed:`, err);
        sendResponse({
          status: 'error',
          error: err?.message || 'Sync failed in background worker',
        });
      });
    return true; // Keep channel open for async response
  }
  
  if (message.type === 'SYNC_GITHUB') {
    (async () => {
      try {
        const ghConfig = await StorageService.getGitHubConfig();
        if (!ghConfig || !ghConfig.token || !ghConfig.selectedRepo) {
          sendResponse({ status: 'error', error: 'GitHub repository not configured' });
          return;
        }

        await StorageService.saveGitHubConfig({
          ...ghConfig,
          lastSyncStatus: 'syncing',
          lastSyncError: null,
        });

        const tracks = await StorageService.getTracks();
        const activities = await StorageService.getActivities();
        const goals = (await StorageService.getGoals()) || {
          dailyQuestions: 15,
          dailyLabs: 2,
          dailyLessons: 3,
          dailyLearningMinutes: 120,
          weeklyQuestions: 75,
          weeklyLabs: 10,
        };

        const ghResult = await GitHubService.syncProgressToGitHub(ghConfig, tracks, activities, goals);
        const now = new Date().toISOString();

        if (ghResult.success) {
          const updatedConfig: GitHubConfig = {
            ...ghConfig,
            lastSyncAt: now,
            lastSyncCommitSha: ghResult.lastCommitSha || ghConfig.lastSyncCommitSha,
            lastSyncCommitUrl: ghResult.lastCommitUrl || ghConfig.lastSyncCommitUrl,
            lastSyncStatus: 'success',
            lastSyncError: null,
          };
          await StorageService.saveGitHubConfig(updatedConfig);

          if (ghResult.commitsCreated > 0) {
            await StorageService.saveGitHubCommitRecord({
              id: `gh-sync-${Date.now()}`,
              timestamp: now,
              commitSha: ghResult.lastCommitSha || 'manual-sync',
              commitUrl: ghResult.lastCommitUrl || ghConfig.selectedRepo.html_url,
              commitMessage: ghResult.message,
              filesChanged: ghResult.filesUpdated,
              status: 'success',
            });
          }
        } else {
          await StorageService.saveGitHubConfig({
            ...ghConfig,
            lastSyncStatus: 'failed',
            lastSyncError: ghResult.error || 'GitHub sync failed',
          });
        }

        sendResponse({ status: 'ok', result: ghResult });
      } catch (err: any) {
        console.error('[KodeHub Background] SYNC_GITHUB failed:', err);
        const ghConfig = await StorageService.getGitHubConfig();
        if (ghConfig) {
          await StorageService.saveGitHubConfig({
            ...ghConfig,
            lastSyncStatus: 'failed',
            lastSyncError: err?.message || 'GitHub sync failed',
          });
        }
        sendResponse({ status: 'error', error: err?.message || 'GitHub sync failed' });
      }
    })();
    return true;
  }
  return false;
});
}

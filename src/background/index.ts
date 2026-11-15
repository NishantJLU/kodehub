// KodeHub Background Service Worker (Manifest V3)
import { TrackProgress, SyncResult, GitHubConfig } from '../types';
import { StorageService } from '../services/storage.service';
import { processSyncSnapshots } from '../services/sync.service';
import { GitHubService } from '../services/github.service';
import { toLocalDateString } from '../utils/dateUtils';

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

// Update badge count with today's verified completed tasks
export async function updateBadge() {
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

// Mutex lock to prevent overlapping sync operations
let isSyncInProgress = false;

// Authoritative Synchronization Handler
export async function handleVerifiedSync(
  incomingTracks: TrackProgress[],
  diagnostics?: any
): Promise<SyncResult> {
  const now = new Date().toISOString();

  if (!incomingTracks || incomingTracks.length === 0) {
    const failedResult: SyncResult = {
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

  if (isSyncInProgress) {
    const prev = await StorageService.getLastSyncResult();
    return (
      prev || {
        status: 'successful',
        lastSyncedAt: now,
        newActivitiesCount: 0,
        coursesUpdated: 0,
        tracks: incomingTracks,
        diagnostics,
      }
    );
  }

  isSyncInProgress = true;

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

    const syncResult: SyncResult = {
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

    await StorageService.saveLastSyncResult(syncResult);
    await updateBadge();

    // Trigger GitHub auto-sync if enabled and configured
    try {
      const ghConfig = await StorageService.getGitHubConfig();
      if (ghConfig && ghConfig.token && ghConfig.selectedRepo && ghConfig.autoSync) {
        console.log('[KodeHub Background] Triggering automatic GitHub sync...');
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
          };
          await StorageService.saveGitHubConfig(updatedConfig);
          if (ghResult.commitsCreated > 0) {
            await StorageService.saveGitHubCommitRecord({
              id: `gh-auto-${Date.now()}`,
              timestamp: now,
              commitSha: ghResult.lastCommitSha || 'auto-sync',
              commitUrl: ghResult.lastCommitUrl || ghConfig.selectedRepo.html_url,
              commitMessage: syncResult.message || 'KodeHub: Auto-sync progress',
              filesChanged: ghResult.filesUpdated,
              status: 'success',
            });
          }
        }
      }
    } catch (ghErr) {
      console.warn('[KodeHub Background] GitHub auto-sync skipped / error:', ghErr);
    }

    return syncResult;
  } catch (err: any) {
    console.error('[KodeHub] Sync failed:', err);
    const errorResult: SyncResult = {
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
    isSyncInProgress = false;
  }
}

// Storage change listener
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local' && (changes.activities || changes.goals || changes.settings)) {
    updateBadge();
  }
});

// Extension Message Listener
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'OPEN_DASHBOARD') {
    const url = chrome.runtime.getURL('dashboard.html');
    chrome.tabs.create({ url });
    sendResponse({ status: 'ok' });
  } else if (message.type === 'REFRESH_BADGE') {
    updateBadge();
    sendResponse({ status: 'ok' });
  } else if (message.type === 'EXECUTE_SYNC') {
    const tracks = Array.isArray(message.payload) ? message.payload : message.payload?.tracks || [];
    const diagnostics = message.payload?.diagnostics;
    console.log('[KodeHub Background] Received EXECUTE_SYNC request for tracks:', tracks.length);
    handleVerifiedSync(tracks, diagnostics)
      .then((result) => {
        console.log('[KodeHub Background] EXECUTE_SYNC completed with status:', result.status);
        sendResponse({ status: 'ok', result });
      })
      .catch((err) => {
        console.error('[KodeHub Background] EXECUTE_SYNC failed:', err);
        sendResponse({
          status: 'error',
          error: err?.message || 'Sync failed in background worker',
        });
      });
    return true; // Keep channel open for async response
  } else if (message.type === 'SYNC_GITHUB') {
    (async () => {
      try {
        const ghConfig = await StorageService.getGitHubConfig();
        if (!ghConfig || !ghConfig.token || !ghConfig.selectedRepo) {
          sendResponse({ status: 'error', error: 'GitHub repository not configured' });
          return;
        }

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
        }

        sendResponse({ status: 'ok', result: ghResult });
      } catch (err: any) {
        console.error('[KodeHub Background] SYNC_GITHUB failed:', err);
        sendResponse({ status: 'error', error: err?.message || 'GitHub sync failed' });
      }
    })();
    return true;
  }
  return true;
});

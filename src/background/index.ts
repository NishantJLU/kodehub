// KodeHub Background Service Worker (Manifest V3)
import { TrackProgress, SyncResult } from '../types';
import { StorageService } from '../services/storage.service';
import { processSyncSnapshots } from '../services/sync.service';

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

// Update badge count with today's completed tasks + questions
export async function updateBadge() {
  try {
    const todayStr = new Date().toISOString().slice(0, 10);
    const settings = await StorageService.getSettings();

    if (settings && settings.showBadge === false) {
      chrome.action.setBadgeText({ text: '' });
      return;
    }

    const activities = await StorageService.getActivities();
    const goals = await StorageService.getGoals();

    const todayCount = activities
      .filter((a) => a.completedAt && a.completedAt.slice(0, 10) === todayStr)
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

/**
 * Authoritative Synchronization Handler:
 * 1. Reads incoming fresh snapshots from verified tab.
 * 2. Compares against previously stored snapshots.
 * 3. Identifies true delta increase in completed tasks.
 * 4. Stores updated snapshots & records new activities without fabrication.
 */
export async function handleVerifiedSync(incomingTracks: TrackProgress[]): Promise<SyncResult> {
  const now = new Date().toISOString();

  if (!incomingTracks || incomingTracks.length === 0) {
    const failedResult: SyncResult = {
      status: 'waiting_for_data',
      lastSyncedAt: now,
      newActivitiesCount: 0,
      coursesUpdated: 0,
      message: 'No visible tracks detected on page',
      tracks: [],
    };
    await StorageService.saveLastSyncResult(failedResult);
    return failedResult;
  }

  if (isSyncInProgress) {
    const prev = await StorageService.getLastSyncResult();
    return prev || {
      status: 'successful',
      lastSyncedAt: now,
      newActivitiesCount: 0,
      coursesUpdated: 0,
      tracks: incomingTracks,
    };
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
      message:
        syncOutcome.newCompletionsCount > 0
          ? `${syncOutcome.newCompletionsCount} new task completion(s) recorded`
          : 'Up to date. No new completions.',
    };

    await StorageService.saveLastSyncResult(syncResult);
    await updateBadge();

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
    handleVerifiedSync(message.payload).then((result) => {
      sendResponse({ status: 'ok', result });
    });
    return true; // Keep channel open for async response
  }
  return true;
});

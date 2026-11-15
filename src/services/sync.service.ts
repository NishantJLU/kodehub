import { TrackProgress, TrackSnapshot, DailyActivity, SyncResult } from '../types';

export function generateStableTrackId(trackName: string): string {
  const normalized = trackName
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `track-${normalized || 'unnamed'}`;
}

export interface SyncProcessResult {
  newActivities: DailyActivity[];
  updatedSnapshots: Record<string, TrackSnapshot>;
  newCompletionsCount: number;
  coursesUpdatedCount: number;
  tracks: TrackProgress[];
}

/**
 * Pure synchronization processor:
 * Compares incoming track progress snapshots against previously stored snapshots.
 * Only records newly observed completions (deltas).
 * Never assumes historical tasks were completed today.
 * Never fabricates learning history.
 */
export function processSyncSnapshots(
  incomingTracks: TrackProgress[],
  previousSnapshots: Record<string, TrackSnapshot>,
  options: { timestamp?: string } = {}
): SyncProcessResult {
  const now = options.timestamp || new Date().toISOString();
  const updatedSnapshots: Record<string, TrackSnapshot> = { ...previousSnapshots };
  const newActivities: DailyActivity[] = [];
  let newCompletionsCount = 0;
  let coursesUpdatedCount = 0;

  for (const track of incomingTracks) {
    const trackId = track.trackId || generateStableTrackId(track.trackName);
    const currCount = Number(track.completedTasks) || 0;
    const prevSnapshot = previousSnapshots[trackId];

    if (!prevSnapshot) {
      // First time observing this track:
      // Store initial snapshot baseline.
      // Do NOT assume past cumulative completions happened today.
      updatedSnapshots[trackId] = {
        trackId,
        completedTasks: currCount,
        observedAt: now,
      };
      coursesUpdatedCount++;
      // No delta on first observation
      continue;
    }

    const prevCount = Number(prevSnapshot.completedTasks) || 0;
    const delta = currCount - prevCount;

    if (delta > 0) {
      // Newly observed completion!
      newCompletionsCount += delta;
      coursesUpdatedCount++;

      // Create stable idempotent activity record
      newActivities.push({
        id: `act-sync-${trackId}-${prevCount}-to-${currCount}`,
        trackId,
        courseName: track.trackName,
        activityType: 'task',
        quantity: delta,
        completedAt: now,
        source: 'verified_platform',
        title: `${track.trackName} - ${delta} Task${delta > 1 ? 's' : ''} Completed`,
        durationMinutes: delta * 15, // Estimate 15 mins per task
        notes: `Verified on KodeKloud (${currCount}/${track.totalTasks} total completed)`,
      });

      // Update stored snapshot
      updatedSnapshots[trackId] = {
        trackId,
        completedTasks: currCount,
        observedAt: now,
      };
    } else if (delta < 0) {
      // Total decreased (e.g. task reset or re-evaluation)
      updatedSnapshots[trackId] = {
        trackId,
        completedTasks: currCount,
        observedAt: now,
      };
    }
  }

  return {
    newActivities,
    updatedSnapshots,
    newCompletionsCount,
    coursesUpdatedCount,
    tracks: incomingTracks,
  };
}

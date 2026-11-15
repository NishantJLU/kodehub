// KodeHub Content Script for KodeKloud Engineer
// Extracts visible learning progress dynamically upon user request

import { TrackProgress } from '../types';
import { generateStableTrackId } from '../services/sync.service';

export interface ScrapedPlatformData {
  url: string;
  userName?: string;
  rank?: string;
  coins?: number;
  tracks: TrackProgress[];
  scrapedAt: string;
}

/**
 * Dynamically discovers all visible course cards on the page.
 * Extracts title, completed tasks, total tasks, and pending tasks.
 * Does NOT rely on hardcoded course names.
 */
export function discoverVisibleTracks(): TrackProgress[] {
  const tracksMap = new Map<string, TrackProgress>();
  const now = new Date().toISOString();

  // Find all elements that contain a progress pattern like "Progress: 12/100 Tasks"
  const candidates = Array.from(document.querySelectorAll('div, section, article'));

  for (const el of candidates) {
    const text = (el as HTMLElement).innerText || '';

    // Check if this element directly contains "Progress: X/Y"
    const progressMatch = text.match(/Progress:\s*(\d+)\s*\/\s*(\d+)\s*(?:Tasks?)?/i);
    if (!progressMatch) continue;

    // Avoid matching parent wrapper containers that contain multiple cards
    // A card container should only have one "Progress:" line
    const progressOccurrences = (text.match(/Progress:/gi) || []).length;
    if (progressOccurrences > 1) {
      continue; // Skip outer container; inner elements will be processed
    }

    const completedTasks = parseInt(progressMatch[1], 10);
    const totalTasks = parseInt(progressMatch[2], 10);

    // Extract pending tasks count if visible, e.g. "88 Pending"
    const pendingMatch = text.match(/(\d+)\s*Pending/i);
    const pendingTasks = pendingMatch ? parseInt(pendingMatch[1], 10) : Math.max(0, totalTasks - completedTasks);

    // Extract title from headings inside this card, or text preceding "Progress:"
    let trackName = '';
    const heading = el.querySelector('h1, h2, h3, h4, h5, [class*="title"], [class*="name"]');
    if (heading && heading.textContent?.trim()) {
      trackName = heading.textContent.trim();
    } else {
      // Look at lines before "Progress:"
      const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
      const progressLineIdx = lines.findIndex((l) => l.startsWith('Progress:'));
      if (progressLineIdx > 0) {
        trackName = lines[progressLineIdx - 1];
      }
    }

    // Clean up track title
    trackName = trackName
      .replace(/^Your Active Practice\s*/i, '')
      .replace(/\s*Completed$/i, '')
      .trim();

    if (trackName && trackName.length > 2) {
      const trackId = generateStableTrackId(trackName);
      if (!tracksMap.has(trackId)) {
        tracksMap.set(trackId, {
          trackId,
          trackName,
          completedTasks,
          totalTasks,
          pendingTasks,
          lastSyncedAt: now,
        });
      }
    }
  }

  // Fallback: If no structured cards matched, check regex across page text
  if (tracksMap.size === 0 && document.body) {
    const bodyText = document.body.innerText || '';
    // Look for patterns like "100 Days of MLOps\nProgress: 12/100 Tasks"
    const regex = /([A-Za-z0-9\s()\-]{4,50})\s*\n?\s*Progress:\s*(\d+)\s*\/\s*(\d+)/gi;
    let m;
    while ((m = regex.exec(bodyText)) !== null) {
      const title = m[1].trim();
      const done = parseInt(m[2], 10);
      const tot = parseInt(m[3], 10);
      if (title && !title.toLowerCase().includes('progress')) {
        const trackId = generateStableTrackId(title);
        if (!tracksMap.has(trackId)) {
          tracksMap.set(trackId, {
            trackId,
            trackName: title,
            completedTasks: done,
            totalTasks: tot,
            pendingTasks: Math.max(0, tot - done),
            lastSyncedAt: now,
          });
        }
      }
    }
  }

  return Array.from(tracksMap.values());
}

/**
 * Extracts student metadata (user name, rank, coins) if visible.
 */
export function extractStudentMetadata() {
  const text = document.body ? document.body.innerText || '' : '';
  let userName: string | undefined;
  let rank: string | undefined;
  let coins: number | undefined;

  const coinsMatch = text.match(/(\d{2,5})\s*(?:coins?|gold)?/i);
  if (coinsMatch) coins = parseInt(coinsMatch[1], 10);

  const ranks = ['System Administrator', 'DevOps Engineer', 'Cloud Architect', 'Beginner'];
  for (const r of ranks) {
    if (text.includes(r)) {
      rank = r;
      break;
    }
  }

  return { userName, rank, coins };
}

/**
 * Collect full platform snapshot.
 */
export function getPlatformSnapshot(): ScrapedPlatformData {
  const tracks = discoverVisibleTracks();
  const meta = extractStudentMetadata();

  return {
    url: window.location.href,
    userName: meta.userName,
    rank: meta.rank,
    coins: meta.coins,
    tracks,
    scrapedAt: new Date().toISOString(),
  };
}

// Listen for sync extraction requests from the extension popup / background worker
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'EXTRACT_PROGRESS') {
    const data = getPlatformSnapshot();
    sendResponse({ status: 'ok', data });
  }
  return true;
});

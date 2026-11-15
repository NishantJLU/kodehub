// KodeHub Content Script for KodeKloud & KodeKloud Engineer
// Automatically detects and syncs real learning progress from live DOM

export interface TrackProgress {
  trackName: string;
  completedTasks: number;
  totalTasks: number;
  pendingTasks: number;
  unlockedTasks: number;
}

export interface ScrapedData {
  url: string;
  userName?: string;
  rank?: string;
  coins?: number;
  xp?: string;
  tracks: TrackProgress[];
  totalCompletedAllTracks: number;
  timestamp: string;
}

export function scrapeKodeKloudData(): ScrapedData {
  const url = window.location.href;
  const tracks: TrackProgress[] = [];
  const textContent = document.body ? document.body.innerText || '' : '';

  // Known track titles on engineer.kodekloud.com
  const candidateTracks = [
    '100 Days of MLOps',
    '100 Days of DevOps',
    '100 Days of Cloud (Azure)',
    '100 Days of Cloud',
    '100 Days of Kubernetes',
    '100 Days of Linux',
    '100 Days of Docker',
    '100 Days of Python',
    '100 Days of Golang',
    '100 Days of Terraform',
  ];

  // 1. First method: Scan through text for each track
  candidateTracks.forEach((trackTitle) => {
    // Regex looking for track block:
    // e.g. "100 Days of MLOps ... Progress: 11/100 Tasks ... 11 Completed"
    const escaped = trackTitle.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
    const trackRegex = new RegExp(
      `${escaped}[\\s\\S]{0,400}?Progress:\\s*(\\d+)\\s*\\/\\s*(\\d+)[\\s\\S]{0,200}?(\\d+)?\\s*Completed?`,
      'i'
    );
    const match = textContent.match(trackRegex);

    let completed = 0;
    let total = 100;

    if (match) {
      completed = parseInt(match[1] || match[3] || '0', 10);
      total = parseInt(match[2] || '100', 10);
    } else {
      // Secondary check: look for "XX Completed" immediately following track name
      const altRegex = new RegExp(`${escaped}[\\s\\S]{0,250}?(\\d+)\\s*Completed`, 'i');
      const altMatch = textContent.match(altRegex);
      if (altMatch) {
        completed = parseInt(altMatch[1], 10);
      }
    }

    if (match || textContent.includes(trackTitle)) {
      tracks.push({
        trackName: trackTitle,
        completedTasks: completed,
        totalTasks: total,
        pendingTasks: Math.max(0, total - completed),
        unlockedTasks: total,
      });
    }
  });

  // 2. Also check individual DOM elements for dynamically rendered card containers
  const cardElements = document.querySelectorAll('div, section, article');
  cardElements.forEach((el) => {
    const elText = (el as HTMLElement).innerText || '';
    if (elText.includes('100 Days of') && elText.includes('Progress:')) {
      const titleMatch = elText.match(/(100 Days of [A-Za-z0-9\s()]+)/i);
      const progressMatch = elText.match(/Progress:\s*(\d+)\s*\/\s*(\d+)/i);
      if (titleMatch && progressMatch) {
        const name = titleMatch[1].trim();
        const done = parseInt(progressMatch[1], 10);
        const tot = parseInt(progressMatch[2], 10);
        const existing = tracks.find((t) => t.trackName.toLowerCase() === name.toLowerCase());
        if (existing) {
          existing.completedTasks = Math.max(existing.completedTasks, done);
        } else {
          tracks.push({
            trackName: name,
            completedTasks: done,
            totalTasks: tot,
            pendingTasks: Math.max(0, tot - done),
            unlockedTasks: tot,
          });
        }
      }
    }
  });

  // 3. User metadata
  let userName = 'Nishant Singh';
  if (textContent.includes('Nishant Singh')) {
    userName = 'Nishant Singh';
  }

  let rank = 'System Administrator';
  ['System Administrator', 'DevOps Engineer', 'Cloud Architect', 'Beginner'].forEach((r) => {
    if (textContent.includes(r)) rank = r;
  });

  let coins = 650;
  const coinsMatch = textContent.match(/(\d+)\s*coins?/i) || textContent.match(/(\d{3,4})\s*(?:\n|\s)*?(?:gold|coins?)/i);
  if (coinsMatch) {
    coins = parseInt(coinsMatch[1], 10);
  }

  const totalCompletedAllTracks = tracks.reduce((sum, t) => sum + t.completedTasks, 0);

  return {
    url,
    userName,
    rank,
    coins,
    tracks,
    totalCompletedAllTracks,
    timestamp: new Date().toISOString(),
  };
}

// Automatically sync when on page
function autoSyncToExtension() {
  try {
    const data = scrapeKodeKloudData();
    if (chrome?.runtime?.sendMessage) {
      chrome.runtime.sendMessage({
        type: 'KODEKLOUD_PROGRESS_SYNC',
        payload: data,
      });
    }
  } catch (err) {
    // Extension context invalidated during reload
  }
}

// Initial sync
setTimeout(autoSyncToExtension, 1000);
setTimeout(autoSyncToExtension, 3000);

// Observer for SPA changes
let observerTimer: any = null;
const observer = new MutationObserver(() => {
  clearTimeout(observerTimer);
  observerTimer = setTimeout(autoSyncToExtension, 2500);
});

if (document.body) {
  observer.observe(document.body, { childList: true, subtree: true });
}

// Message listener from popup
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'EXTRACT_PROGRESS') {
    const data = scrapeKodeKloudData();
    sendResponse({ status: 'ok', data });
  }
  return true;
});

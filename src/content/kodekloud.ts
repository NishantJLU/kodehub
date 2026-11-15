// KodeHub Content Script for KodeKloud Engineer
// Extracts visible learning progress dynamically upon user request
// Completely self-contained classic script (no external module imports or exports)

import type { TrackProgress, ExtractionDiagnostics } from '../types';
import { calculateProgressMetrics, isValidCourseTitle } from '../utils/progressCalculator';

export { isValidCourseTitle };

export interface ScrapedPlatformData {
  url: string;
  userName?: string;
  rank?: string;
  coins?: number;
  tracks: TrackProgress[];
  scrapedAt: string;
  diagnostics?: ExtractionDiagnostics;
}

export interface ValidatedTrackResult {
  valid: boolean;
  track?: TrackProgress;
  warnings: string[];
}

/**
 * Stable ID generator matching background & sync service.
 * Inlined to eliminate external module chunk imports in content script.
 */
export function generateStableTrackId(trackName: string): string {
  const normalized = trackName
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `track-${normalized || 'unnamed'}`;
}

/**
 * Cleans course title of navigation headers and state labels.
 */
export function cleanTrackTitle(raw: string): string {
  return raw
    .replace(/^Your Active Practice\s*(Completed)?\s*/i, '')
    .replace(/\s*Completed$/i, '')
    .replace(/^Day\s*\d+\s*/i, '')
    .trim();
}

/**
 * Validates extracted numbers and enforces mathematical consistency.
 * Prevents negative values, invalid NaNs, and bounds completed to total.
 */
export function validateTrackNumbers(
  trackName: string,
  rawCompleted: number,
  rawTotal: number,
  rawPending?: number,
  rawUnlocked?: number,
  rawLocked?: number,
  courseId?: string
): ValidatedTrackResult {
  const warnings: string[] = [];

  if (!isValidCourseTitle(trackName)) {
    warnings.push(`Course "${trackName}": Invalid course name (button label or navigation item rejected)`);
    return { valid: false, warnings };
  }

  let completed = Number(rawCompleted);
  let total = Number(rawTotal);
  let pending = rawPending !== undefined ? Number(rawPending) : undefined;
  let unlocked = rawUnlocked !== undefined ? Number(rawUnlocked) : undefined;
  let locked = rawLocked !== undefined ? Number(rawLocked) : undefined;

  if (isNaN(completed) || completed < 0) {
    warnings.push(`Course "${trackName}": Invalid completed count (${rawCompleted}), defaulting to 0`);
    completed = 0;
  }

  if (isNaN(total) || total < 0) {
    warnings.push(`Course "${trackName}": Invalid total count (${rawTotal}), skipping track`);
    return { valid: false, warnings };
  }

  // Bound completed tasks to total tasks
  if (completed > total) {
    warnings.push(`Course "${trackName}": Completed tasks (${completed}) exceed total tasks (${total})`);
    completed = total;
  }

  // Calculate or validate pending tasks
  if (pending === undefined || isNaN(pending) || pending < 0) {
    pending = Math.max(0, total - completed);
  } else if (completed + pending !== total) {
    warnings.push(
      `Course "${trackName}": Inconsistent task arithmetic (Completed ${completed} + Pending ${pending} != Total ${total}). Adjusting pending.`
    );
    pending = Math.max(0, total - completed);
  }

  // Validate unlocked / locked tasks if present
  if (unlocked !== undefined && (isNaN(unlocked) || unlocked < 0)) {
    warnings.push(`Course "${trackName}": Invalid unlocked count (${rawUnlocked}), ignoring`);
    unlocked = undefined;
  }

  if (locked !== undefined && (isNaN(locked) || locked < 0)) {
    warnings.push(`Course "${trackName}": Invalid locked count (${rawLocked}), ignoring`);
    locked = undefined;
  }

  const trackId = generateStableTrackId(trackName);

  const track: TrackProgress = {
    trackId,
    trackName,
    completedTasks: completed,
    totalTasks: total,
    pendingTasks: pending,
    unlockedTasks: unlocked,
    lockedTasks: locked,
    courseId: courseId || undefined,
    lastSyncedAt: new Date().toISOString(),
  };

  return { valid: true, track, warnings };
}

/**
 * Extracts platform course ID or slug from element attributes or anchors if available.
 */
export function extractCourseId(el: HTMLElement, trackName: string): string | undefined {
  if (!el || typeof el.getAttribute !== 'function') return undefined;

  // Check data attributes
  const dataId =
    el.getAttribute('data-course-id') ||
    el.getAttribute('data-track-id') ||
    el.getAttribute('data-id') ||
    el.getAttribute('id');
  if (dataId && dataId.length > 2 && !dataId.startsWith('root') && !dataId.startsWith('app')) {
    return dataId;
  }

  // Check link anchors
  if (typeof el.querySelector === 'function') {
    const anchor = el.querySelector('a[href*="/practice/"], a[href*="/course/"], a[href*="/track/"]');
    if (anchor) {
      const href = anchor.getAttribute('href') || '';
      const match = href.match(/\/(?:practice|course|track)\/([a-zA-Z0-9_\-]+)/i);
      if (match && match[1]) {
        return match[1];
      }
    }
  }

  return undefined;
}

/**
 * Checks whether the page is currently in a loading or skeleton state.
 * If progress elements are already rendered and visible, the page is not in a blocking loading state.
 */
export function isPageLoading(): boolean {
  if (typeof document === 'undefined') return false;
  if (typeof document.querySelector !== 'function') return false;

  const bodyText = document.body ? (document.body.innerText || document.body.textContent || '') : '';
  if (/Progress:\s*\d+/i.test(bodyText)) {
    return false;
  }

  const loader = document.querySelector(
    '[aria-busy="true"], [class*="skeleton"], [class*="loading-spinner"], [class*="shimmer"]'
  );
  return !!loader;
}

/**
 * Dynamically discovers all visible course cards on the page.
 * Extracts title, courseId, completed tasks, total tasks, pending tasks,
 * locked tasks, unlocked tasks, and compiles extraction diagnostics.
 */
export function discoverVisibleTracksWithDiagnostics(): {
  tracks: TrackProgress[];
  diagnostics: ExtractionDiagnostics;
} {
  const startTime = Date.now();
  const tracksMap = new Map<string, TrackProgress>();
  const validationWarnings: string[] = [];
  const strategiesUsed: string[] = [];
  let elementsScanned = 0;

  if (typeof document === 'undefined' || typeof document.querySelectorAll !== 'function') {
    return {
      tracks: [],
      diagnostics: {
        elementsScanned: 0,
        cardsDiscovered: 0,
        strategiesUsed: [],
        extractionDurationMs: 0,
        validationWarnings: [],
        url: '',
        timestamp: new Date().toISOString(),
      },
    };
  }

  // STRATEGY 1: Structured Card DOM Analysis
  const candidates = Array.from(
    document.querySelectorAll('div, section, article, [class*="card"], [class*="practice"]')
  );
  elementsScanned = candidates.length;

  for (const el of candidates) {
    const htmlEl = el as any;
    const text = htmlEl.innerText || htmlEl.textContent || '';

    // Match progress pattern: e.g. "Progress: 12/100 Tasks" or "Progress: 0/50"
    const progressMatch = text.match(/Progress:\s*(\d+)\s*\/\s*(\d+)\s*(?:Tasks?)?/i);
    if (!progressMatch) continue;

    // Filter outer list containers containing multiple progress indicators
    const progressOccurrences = (text.match(/Progress:\s*\d+/gi) || []).length;
    if (progressOccurrences > 1) {
      continue;
    }

    const rawCompleted = parseInt(progressMatch[1], 10);
    const rawTotal = parseInt(progressMatch[2], 10);

    // Extract sub-box metrics (Completed, Pending, Unlocked, Locked)
    const completedMatch = text.match(/(\d+)\s*Completed/i);
    const pendingMatch = text.match(/(\d+)\s*Pending/i);
    const unlockedMatch = text.match(/(\d+)\s*Unlocked/i);
    const lockedMatch = text.match(/(\d+)\s*Locked/i);

    const completed = completedMatch ? parseInt(completedMatch[1], 10) : rawCompleted;
    const pending = pendingMatch ? parseInt(pendingMatch[1], 10) : Math.max(0, rawTotal - completed);
    const unlocked = unlockedMatch ? parseInt(unlockedMatch[1], 10) : undefined;
    const locked = lockedMatch ? parseInt(lockedMatch[1], 10) : undefined;

    // Extract track title from headings, strictly excluding buttons and button-like controls
    let trackName = '';
    const headingElements: Element[] = typeof htmlEl.querySelectorAll === 'function'
      ? Array.from(htmlEl.querySelectorAll('h1, h2, h3, h4, h5, h6, [class*="title"], [class*="name"], [class*="header"], [class*="heading"], [class*="font-bold"], [class*="font-semibold"], [class*="text-lg"], [class*="text-xl"], [class*="text-2xl"]'))
      : typeof htmlEl.querySelector === 'function'
      ? [htmlEl.querySelector('h1, h2, h3, h4, h5, h6, [class*="title"], [class*="name"], [class*="header"], [class*="heading"], [class*="font-bold"], [class*="font-semibold"], [class*="text-lg"], [class*="text-xl"], [class*="text-2xl"]')].filter(Boolean) as Element[]
      : [];

    for (const h of headingElements) {
      if (typeof (h as any).closest === 'function' && (h as any).closest('button, [role="button"], a.btn, [class*="btn"], [class*="button"]')) {
        continue;
      }
      const raw = h.textContent?.trim() || '';
      const cleaned = cleanTrackTitle(raw);
      if (isValidCourseTitle(cleaned) && !cleaned.toLowerCase().includes('progress')) {
        trackName = cleaned;
        break;
      }
    }

    // Traverse upwards to parent card container if title not found locally
    if (!trackName) {
      let parent: any = htmlEl.parentElement;
      let depth = 0;
      while (parent && parent !== document.body && depth < 5) {
        if (((parent.innerText || parent.textContent || '').match(/Progress:\s*\d+/gi) || []).length > 1) {
          break;
        }
        const pHeadingElements: Element[] = typeof parent.querySelectorAll === 'function'
          ? Array.from(parent.querySelectorAll('h1, h2, h3, h4, h5, h6, [class*="title"], [class*="name"], [class*="header"], [class*="heading"], [class*="font-bold"], [class*="font-semibold"], [class*="text-lg"], [class*="text-xl"], [class*="text-2xl"]'))
          : typeof parent.querySelector === 'function'
          ? [parent.querySelector('h1, h2, h3, h4, h5, h6, [class*="title"], [class*="name"], [class*="header"], [class*="heading"], [class*="font-bold"], [class*="font-semibold"], [class*="text-lg"], [class*="text-xl"], [class*="text-2xl"]')].filter(Boolean) as Element[]
          : [];

        for (const ph of pHeadingElements) {
          if (typeof (ph as any).closest === 'function' && (ph as any).closest('button, [role="button"], a.btn, [class*="btn"], [class*="button"]')) {
            continue;
          }
          const raw = ph.textContent?.trim() || '';
          const cleaned = cleanTrackTitle(raw);
          if (isValidCourseTitle(cleaned) && !cleaned.toLowerCase().includes('progress')) {
            trackName = cleaned;
            break;
          }
        }
        if (trackName) break;
        parent = parent.parentElement;
        depth++;
      }
    }

    // Fallback to lines before "Progress:"
    if (!trackName) {
      const lines = text.split('\n').map((l: string) => l.trim()).filter(Boolean);
      const pIdx = lines.findIndex((l: string) => /Progress:\s*\d+/i.test(l));
      if (pIdx > 0) {
        for (let j = pIdx - 1; j >= Math.max(0, pIdx - 6); j--) {
          const cleaned = cleanTrackTitle(lines[j]);
          if (isValidCourseTitle(cleaned) && !cleaned.toLowerCase().includes('progress')) {
            trackName = cleaned;
            break;
          }
        }
      }
    }

    if (trackName && isValidCourseTitle(trackName)) {
      if (!strategiesUsed.includes('structured_dom')) {
        strategiesUsed.push('structured_dom');
      }

      const courseId = extractCourseId(htmlEl, trackName);
      const validated = validateTrackNumbers(
        trackName,
        completed,
        rawTotal,
        pending,
        unlocked,
        locked,
        courseId
      );

      if (validated.warnings.length > 0) {
        validationWarnings.push(...validated.warnings);
      }

      if (validated.valid && validated.track) {
        const t = validated.track;
        // Deduplication & record enrichment using centralized progress calculation
        const existing = tracksMap.get(t.trackId);
        if (!existing) {
          tracksMap.set(t.trackId, t);
          console.log(`[KodeHub Content] Discovered track via DOM: "${t.trackName}" (${t.completedTasks}/${t.totalTasks} completed)`);
        } else {
          // Merge with richer data using authoritative calculateProgressMetrics
          const mergedCompleted = Math.max(existing.completedTasks, t.completedTasks);
          const mergedTotal = Math.max(existing.totalTasks, t.totalTasks);
          const metrics = calculateProgressMetrics(mergedCompleted, mergedTotal);

          tracksMap.set(t.trackId, {
            ...existing,
            completedTasks: metrics.completedTasks,
            totalTasks: metrics.totalTasks,
            pendingTasks: metrics.pendingTasks,
            unlockedTasks: existing.unlockedTasks !== undefined ? existing.unlockedTasks : t.unlockedTasks,
            lockedTasks: existing.lockedTasks !== undefined ? existing.lockedTasks : t.lockedTasks,
            courseId: existing.courseId || t.courseId,
          });
        }
      }
    }
  }

  // STRATEGY 2: Line-by-Line Scanner Fallback (Discovers any remaining courses)
  if (document.body) {
    const fullText = document.body.innerText || document.body.textContent || '';
    const lines = fullText.split('\n').map((l) => l.trim()).filter(Boolean);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const match = line.match(/Progress:\s*(\d+)\s*\/\s*(\d+)\s*(?:Tasks?)?/i);
      if (match) {
        const completed = parseInt(match[1], 10);
        const total = parseInt(match[2], 10);
        let title = '';

        for (let j = i - 1; j >= Math.max(0, i - 6); j--) {
          const cleaned = cleanTrackTitle(lines[j]);
          if (isValidCourseTitle(cleaned) && !cleaned.toLowerCase().includes('progress')) {
            title = cleaned;
            break;
          }
        }

        if (title && isValidCourseTitle(title)) {
          const trackId = generateStableTrackId(title);
          if (!tracksMap.has(trackId)) {
            if (!strategiesUsed.includes('line_scan_fallback')) {
              strategiesUsed.push('line_scan_fallback');
            }

            // Check surrounding lines for sub-box metrics
            const contextLines = lines.slice(i, Math.min(lines.length, i + 8)).join(' ');
            const pendingMatch = contextLines.match(/(\d+)\s*Pending/i);
            const unlockedMatch = contextLines.match(/(\d+)\s*Unlocked/i);
            const lockedMatch = contextLines.match(/(\d+)\s*Locked/i);

            const pending = pendingMatch ? parseInt(pendingMatch[1], 10) : Math.max(0, total - completed);
            const unlocked = unlockedMatch ? parseInt(unlockedMatch[1], 10) : undefined;
            const locked = lockedMatch ? parseInt(lockedMatch[1], 10) : undefined;

            const validated = validateTrackNumbers(
              title,
              completed,
              total,
              pending,
              unlocked,
              locked
            );

            if (validated.warnings.length > 0) {
              validationWarnings.push(...validated.warnings);
            }

            if (validated.valid && validated.track) {
              const t = validated.track;
              tracksMap.set(t.trackId, t);
              console.log(`[KodeHub Content] Discovered track via line scan: "${t.trackName}" (${t.completedTasks}/${t.totalTasks} completed)`);
            }
          }
        }
      }
    }
  }

  const result = Array.from(tracksMap.values());
  const elapsed = Date.now() - startTime;
  const isPracticePage = typeof window !== 'undefined' && window.location ? (window.location.href.includes('engineer.kodekloud.com') || window.location.href.includes('practice')) : false;

  const diagnostics: ExtractionDiagnostics = {
    stage: 'DOM_EXTRACTION',
    status: result.length > 0 ? 'SUCCESS' : 'FAILED',
    reason: result.length > 0 ? undefined : 'COURSE_CARDS_NOT_FOUND',
    elementsScanned,
    cardsDiscovered: result.length,
    courseCardsFound: result.length + (validationWarnings.length > 0 ? 1 : 0),
    validCourseCards: result.length,
    invalidCourseCards: validationWarnings.length,
    progressValuesExtracted: result.length,
    strategiesUsed,
    extractionDurationMs: elapsed,
    validationWarnings,
    practicePageDetected: isPracticePage,
    domReady: typeof document !== 'undefined' && document.readyState === 'complete',
    contentScriptReady: true,
    url: typeof window !== 'undefined' && window.location ? window.location.href : '',
    timestamp: new Date().toISOString(),
  };

  console.log(`[KodeHub Content] Discovery completed in ${elapsed}ms: ${result.length} tracks found.`);
  return { tracks: result, diagnostics };
}

/**
 * Backwards compatible convenience wrapper.
 */
export function discoverVisibleTracks(): TrackProgress[] {
  return discoverVisibleTracksWithDiagnostics().tracks;
}

/**
 * Extracts student metadata (user name, rank, coins) if visible.
 */
export function extractStudentMetadata() {
  if (typeof document === 'undefined') {
    return { userName: undefined, rank: undefined, coins: undefined };
  }

  const text = document.body ? document.body.innerText || document.body.textContent || '' : '';
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
 * Collect full platform snapshot with diagnostics.
 */
export function getPlatformSnapshot(): ScrapedPlatformData {
  const { tracks, diagnostics } = discoverVisibleTracksWithDiagnostics();
  const meta = extractStudentMetadata();

  return {
    url: typeof window !== 'undefined' && window.location ? window.location.href : '',
    userName: meta.userName,
    rank: meta.rank,
    coins: meta.coins,
    tracks,
    scrapedAt: new Date().toISOString(),
    diagnostics,
  };
}

/**
 * Retries extraction until content is dynamically loaded or timeout occurs.
 */
export async function extractPlatformSnapshotWithRetry(
  timeoutMs: number = 3000,
  intervalMs: number = 100
): Promise<ScrapedPlatformData> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const snap = getPlatformSnapshot();
    if (!isPageLoading() && snap.tracks.length > 0) {
      return snap;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return getPlatformSnapshot();
}

/**
 * Listens for synchronization extraction requests from popup or background worker.
 */
const globalScope: any = typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null);
const currentUrl = typeof window !== 'undefined' && window.location ? window.location.href : '';

if (globalScope && typeof globalScope.__KODEHUB_CONTENT_SCRIPT_INITIALIZED === 'undefined') {
  globalScope.__KODEHUB_CONTENT_SCRIPT_INITIALIZED = true;

  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.type === 'PING') {
        sendResponse({
          status: 'ok',
          success: true,
          ready: true,
          url: currentUrl,
        });
        return false;
      }

      if (request.type === 'EXTRACT_PROGRESS') {
        try {
          if (isPageLoading()) {
            sendResponse({
              status: 'waiting_for_data',
              success: false,
              message: 'KodeKloud page is still loading elements...',
              tracks: [],
              data: { tracks: [] },
              diagnostics: {
                stage: 'DOM_EXTRACTION',
                status: 'WAITING_FOR_DATA',
                reason: 'PAGE_IS_LOADING',
                url: currentUrl,
                timestamp: new Date().toISOString(),
                elementsScanned: 0,
                cardsDiscovered: 0,
                strategiesUsed: [],
                extractionDurationMs: 0,
                validationWarnings: ['Page is currently displaying loading skeletons'],
              },
            });
            return false;
          }

          const snapshot = getPlatformSnapshot();
          const hasTracks = snapshot.tracks.length > 0;

          sendResponse({
            status: 'ok',
            success: true,
            data: snapshot,
            tracks: snapshot.tracks,
            diagnostics: snapshot.diagnostics,
            message: hasTracks
              ? `Discovered ${snapshot.tracks.length} course(s)`
              : 'No practice courses found on page',
          });
        } catch (err: any) {
          sendResponse({
            status: 'error',
            success: false,
            error: err?.message || 'Error extracting learning metrics',
            data: { tracks: [] },
            tracks: [],
            diagnostics: {
              stage: 'DOM_EXTRACTION',
              status: 'FAILED',
              reason: err?.message || 'EXTRACTION_EXCEPTION',
              url: currentUrl,
              timestamp: new Date().toISOString(),
              elementsScanned: 0,
              cardsDiscovered: 0,
              strategiesUsed: [],
              extractionDurationMs: 0,
              validationWarnings: [err?.message || 'Unknown extraction error'],
            },
          });
        }
        return false;
      }

      return false;
    });
  }
}

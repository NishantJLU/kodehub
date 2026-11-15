import { describe, it, expect, afterEach } from 'vitest';
import {
  discoverVisibleTracks,
  discoverVisibleTracksWithDiagnostics,
  generateStableTrackId,
  cleanTrackTitle,
  validateTrackNumbers,
  extractCourseId,
  extractPlatformSnapshotWithRetry,
} from '../src/content/kodekloud';

describe('KodeKloud Content Script - Dynamic Course Discovery & Validation', () => {
  const originalDocument = global.document;

  afterEach(() => {
    global.document = originalDocument;
  });

  // 1. Stable ID generation
  it('generates consistent stable track IDs', () => {
    expect(generateStableTrackId('100 Days of MLOps')).toBe('track-100-days-of-mlops');
    expect(generateStableTrackId('100 Days of DevOps')).toBe('track-100-days-of-devops');
    expect(generateStableTrackId('100 Days of Cloud (Azure)')).toBe('track-100-days-of-cloud-azure');
    expect(generateStableTrackId('  Special @# Characters & Spaces  ')).toBe('track-special-characters-spaces');
  });

  // 2. Title cleanup
  it('cleans track titles properly across various header formats', () => {
    expect(cleanTrackTitle('Your Active Practice Completed 100 Days of MLOps')).toBe('100 Days of MLOps');
    expect(cleanTrackTitle('100 Days of DevOps Completed')).toBe('100 Days of DevOps');
    expect(cleanTrackTitle('Day 1 100 Days of MLOps')).toBe('100 Days of MLOps');
    expect(cleanTrackTitle('Your Active Practice 100 Days of Cloud (Azure)')).toBe('100 Days of Cloud (Azure)');
  });

  // 3. Multi-course extraction with all metrics (Completed, Pending, Total, Unlocked, Locked)
  it('discovers multiple courses with unlocked, locked, and pending metrics', () => {
    const samplePageText = `
      KodeKloud Engineer
      System Administrator 6000/25000 700 coins 0 medals

      Your Active Practice Completed
      100 Days of MLOps
      Progress: 12/100 Tasks
      12 Completed 88 Pending 100 Unlocked 0 Locked

      100 Days of DevOps
      Progress: 0/100 Tasks
      0 Completed 100 Pending 100 Unlocked 0 Locked

      100 Days of Cloud (Azure)
      Progress: 0/50 Tasks
      Start
    `;

    (global as any).document = {
      querySelectorAll: () => [],
      body: {
        innerText: samplePageText,
      },
    };

    const { tracks, diagnostics } = discoverVisibleTracksWithDiagnostics();

    expect(tracks.length).toBe(3);
    expect(diagnostics.cardsDiscovered).toBe(3);
    expect(diagnostics.strategiesUsed).toContain('line_scan_fallback');

    // MLOps
    const mlops = tracks.find((t) => t.trackId === 'track-100-days-of-mlops');
    expect(mlops).toBeDefined();
    expect(mlops?.trackName).toBe('100 Days of MLOps');
    expect(mlops?.completedTasks).toBe(12);
    expect(mlops?.totalTasks).toBe(100);
    expect(mlops?.pendingTasks).toBe(88);
    expect(mlops?.unlockedTasks).toBe(100);
    expect(mlops?.lockedTasks).toBe(0);

    // DevOps (Zero-progress with unlocked & locked)
    const devops = tracks.find((t) => t.trackId === 'track-100-days-of-devops');
    expect(devops).toBeDefined();
    expect(devops?.trackName).toBe('100 Days of DevOps');
    expect(devops?.completedTasks).toBe(0);
    expect(devops?.totalTasks).toBe(100);
    expect(devops?.pendingTasks).toBe(100);
    expect(devops?.unlockedTasks).toBe(100);
    expect(devops?.lockedTasks).toBe(0);

    // Cloud Azure (Zero-progress, no sub-boxes)
    const cloud = tracks.find((t) => t.trackId === 'track-100-days-of-cloud-azure');
    expect(cloud).toBeDefined();
    expect(cloud?.trackName).toBe('100 Days of Cloud (Azure)');
    expect(cloud?.completedTasks).toBe(0);
    expect(cloud?.totalTasks).toBe(50);
    expect(cloud?.pendingTasks).toBe(50);
  });

  // 4. Number Validation & Mathematical Consistency
  it('validates and corrects numbers, bounding completed to total and adjusting pending', () => {
    // Normal valid case
    const valid = validateTrackNumbers('MLOps', 12, 100, 88, 100, 0);
    expect(valid.valid).toBe(true);
    expect(valid.track?.completedTasks).toBe(12);
    expect(valid.track?.pendingTasks).toBe(88);
    expect(valid.warnings.length).toBe(0);

    // Case where completed > total (swapped or out-of-bounds)
    const outOfBounds = validateTrackNumbers('MLOps', 120, 100);
    expect(outOfBounds.valid).toBe(true);
    expect(outOfBounds.track?.completedTasks).toBe(100);
    expect(outOfBounds.track?.pendingTasks).toBe(0);
    expect(outOfBounds.warnings.some((w) => w.includes('exceed total tasks'))).toBe(true);

    // Case where completed + pending != total
    const arithmeticMismatch = validateTrackNumbers('MLOps', 10, 100, 50);
    expect(arithmeticMismatch.valid).toBe(true);
    expect(arithmeticMismatch.track?.completedTasks).toBe(10);
    expect(arithmeticMismatch.track?.pendingTasks).toBe(90); // Adjusted to 100 - 10
    expect(arithmeticMismatch.warnings.some((w) => w.includes('Inconsistent task arithmetic'))).toBe(true);

    // Case with invalid total (NaN)
    const invalidTotal = validateTrackNumbers('MLOps', 10, NaN);
    expect(invalidTotal.valid).toBe(false);
  });

  // 5. Course ID extraction
  it('extracts courseId from data attributes and anchor links when available', () => {
    // Mock element with data-course-id
    const elWithDataId = {
      getAttribute: (attr: string) => (attr === 'data-course-id' ? 'course-mlops-100' : null),
      querySelector: () => null,
    };
    expect(extractCourseId(elWithDataId as any, '100 Days of MLOps')).toBe('course-mlops-100');

    // Mock element with anchor href
    const elWithAnchor = {
      getAttribute: () => null,
      querySelector: (selector: string) => ({
        getAttribute: (attr: string) => (attr === 'href' ? '/practice/100-days-of-devops' : null),
      }),
    };
    expect(extractCourseId(elWithAnchor as any, '100 Days of DevOps')).toBe('100-days-of-devops');
  });

  // 6. Dynamic Course Discovery (No hardcoded course names)
  it('discovers newly introduced courses dynamically without predefined lists', () => {
    const newCourseText = `
      Your Active Practice
      Advanced Kubernetes Security & GitOps
      Progress: 17/40 Tasks
      17 Completed 23 Pending 40 Unlocked
    `;

    (global as any).document = {
      querySelectorAll: () => [],
      body: {
        innerText: newCourseText,
      },
    };

    const tracks = discoverVisibleTracks();
    expect(tracks.length).toBe(1);
    expect(tracks[0].trackName).toBe('Advanced Kubernetes Security & GitOps');
    expect(tracks[0].trackId).toBe('track-advanced-kubernetes-security-gitops');
    expect(tracks[0].completedTasks).toBe(17);
    expect(tracks[0].totalTasks).toBe(40);
    expect(tracks[0].pendingTasks).toBe(23);
  });

  // 7. Deduplication of course cards
  it('prevents duplicate course detection when multiple responsive elements exist', () => {
    // Two mock DOM cards for the same course (e.g. mobile vs desktop)
    const desktopCard = {
      innerText: '100 Days of MLOps\nProgress: 12/100 Tasks\n12 Completed 88 Pending 100 Unlocked 0 Locked',
      querySelector: (s: string) => (s.includes('title') ? { textContent: '100 Days of MLOps' } : null),
      parentElement: null,
      getAttribute: () => null,
    };

    const mobileCard = {
      innerText: '100 Days of MLOps\nProgress: 12/100 Tasks\n12 Completed',
      querySelector: (s: string) => (s.includes('title') ? { textContent: '100 Days of MLOps' } : null),
      parentElement: null,
      getAttribute: () => null,
    };

    (global as any).document = {
      querySelectorAll: () => [desktopCard, mobileCard],
      body: { innerText: '' },
    };

    const tracks = discoverVisibleTracks();
    // Must be deduplicated into 1 course
    expect(tracks.length).toBe(1);
    expect(tracks[0].trackName).toBe('100 Days of MLOps');
    expect(tracks[0].completedTasks).toBe(12);
    expect(tracks[0].totalTasks).toBe(100);
    // Preserves richer metadata from desktop card
    expect(tracks[0].unlockedTasks).toBe(100);
    expect(tracks[0].lockedTasks).toBe(0);
  });

  // 8. Collapsed course cards
  it('handles collapsed course cards using textContent fallback', () => {
    const collapsedCard = {
      innerText: '', // innerText can be empty for hidden/collapsed nodes
      textContent: '100 Days of DevOps Progress: 0/100 Tasks 0 Completed 100 Pending',
      querySelector: (s: string) => (s.includes('title') ? { textContent: '100 Days of DevOps' } : null),
      parentElement: null,
      getAttribute: (attr: string) => (attr === 'aria-expanded' ? 'false' : null),
    };

    (global as any).document = {
      querySelectorAll: () => [collapsedCard],
      body: { innerText: '' },
    };

    const tracks = discoverVisibleTracks();
    expect(tracks.length).toBe(1);
    expect(tracks[0].trackName).toBe('100 Days of DevOps');
    expect(tracks[0].completedTasks).toBe(0);
    expect(tracks[0].totalTasks).toBe(100);
  });

  // 9. Loading delay and retry polling
  it('retries when content is dynamically rendered after a brief delay', async () => {
    let callCount = 0;

    (global as any).document = {
      querySelectorAll: () => {
        callCount++;
        if (callCount < 2) {
          // First call: initial loading state, 0 cards
          return [];
        }
        // Second call: loaded cards appear
        return [
          {
            innerText: '100 Days of MLOps\nProgress: 14/100 Tasks\n14 Completed 86 Pending',
            querySelector: (s: string) => (s.includes('title') ? { textContent: '100 Days of MLOps' } : null),
            parentElement: null,
            getAttribute: () => null,
          },
        ];
      },
      querySelector: () => (callCount < 2 ? { className: 'skeleton-loader' } : null),
      body: { innerText: '' },
    };

    const snapshot = await extractPlatformSnapshotWithRetry(500, 50);
    expect(snapshot.tracks.length).toBe(1);
    expect(snapshot.tracks[0].trackName).toBe('100 Days of MLOps');
    expect(snapshot.tracks[0].completedTasks).toBe(14);
  });

  // 10. Accurate extraction of the 3 real courses with description paragraph & Start button
  it('accurately extracts MLOps (17/100), DevOps (0/100), and Cloud Azure (0/50) with description text and buttons', () => {
    const pageText = `
      KodeKloud Engineer
      System Administrator 6000/25000 700 coins 0 medals
      Your Active Practice Completed

      100 Days of MLOps
      Progress: 17/100 Tasks
      17 Completed 83 Pending 100 Unlocked 0 Locked

      100 Days of DevOps
      Progress: 0/100 Tasks
      0 Completed 100 Pending 100 Unlocked 0 Locked

      100 Days of Cloud (Azure)
      Basic familiarity with the Azure Portal is required.
      Beginners are recommended to complete the AZ900: Microsoft Azure Fundamentals first.
      Start
      Progress: 0/50 Tasks
    `;

    (global as any).document = {
      querySelectorAll: () => [],
      body: {
        innerText: pageText,
      },
    };

    const { tracks, diagnostics } = discoverVisibleTracksWithDiagnostics();

    expect(tracks.length).toBe(3);
    expect(diagnostics.stage).toBe('DOM_EXTRACTION');
    expect(diagnostics.status).toBe('SUCCESS');
    expect(diagnostics.cardsDiscovered).toBe(3);
    expect(diagnostics.validCourseCards).toBe(3);

    const mlops = tracks.find((t) => t.trackName === '100 Days of MLOps');
    expect(mlops).toBeDefined();
    expect(mlops?.completedTasks).toBe(17);
    expect(mlops?.totalTasks).toBe(100);
    expect(mlops?.pendingTasks).toBe(83);

    const devops = tracks.find((t) => t.trackName === '100 Days of DevOps');
    expect(devops).toBeDefined();
    expect(devops?.completedTasks).toBe(0);
    expect(devops?.totalTasks).toBe(100);
    expect(devops?.pendingTasks).toBe(100);

    const azure = tracks.find((t) => t.trackName === '100 Days of Cloud (Azure)');
    expect(azure).toBeDefined();
    expect(azure?.completedTasks).toBe(0);
    expect(azure?.totalTasks).toBe(50);
    expect(azure?.pendingTasks).toBe(50);
  });

  // 11. Button labels and descriptions are never used as course titles
  it('strictly rejects button labels (Start, Continue, Resume) and description sentences', () => {
    const invalidNames = [
      'Start',
      'Continue',
      'Resume',
      'Practice',
      'Enroll',
      'Completed',
      'Basic familiarity with the Azure Portal is required.',
      'Beginners are recommended to complete the AZ900: Microsoft Azure Fundamentals first.',
      'Day 25',
      '100 Tasks',
    ];

    for (const name of invalidNames) {
      const res = validateTrackNumbers(name, 5, 10);
      expect(res.valid).toBe(false);
      expect(res.warnings.length).toBeGreaterThan(0);
    }
  });
});

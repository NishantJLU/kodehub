# KodeHub 🚀

> **Track Your Learning. Measure Your Progress. Sync Directly to GitHub.**  
> A high-performance Chrome Extension (Manifest V3) for KodeKloud learners with automatic LeetHub-style GitHub synchronization.

---

## 🌟 Overview

**KodeHub** automatically detects and tracks your learning progress across [KodeKloud Engineer](https://engineer.kodekloud.com/practice) certification tracks (e.g. *100 Days of MLOps*, *100 Days of DevOps*, *100 Days of Cloud*), computes verified daily completion deltas, visualizes learning streaks and heatmaps, and synchronizes your verified achievements directly to a personal GitHub progress repository.

---

## ✨ Key Features

### 1. Reliable & Dynamic Course Extraction
- **Dual-Strategy Discovery**: Combines structured DOM analysis with contextual line-by-line fallback scanning. Discovers any visible track dynamically without hardcoded course lists.
- **Button & Description Filtering**: Strictly rejects button text (`Start`, `Continue`, `Resume`) and prerequisite paragraphs, extracting only verified course titles.
- **Multi-Course Support**: Accurately handles multiple active, zero-progress, and collapsed courses on the same page (e.g., MLOps, DevOps, and Azure).
- **Mathematical Consistency**: Authoritative progress calculator guarantees $0 \le \text{completed} \le \text{total}$ and $\text{pending} = \text{total} - \text{completed}$ (e.g., $17/100 \implies 83$ pending).

### 2. Decoupled Synchronization Engine
- **Lightning-Fast Local Sync (<50ms)**: When clicking **Sync**, the extension extracts the DOM, diffs against stored snapshots, saves data locally, updates badge counts, and reports **Synced** immediately without waiting on network API delays.
- **Asynchronous GitHub Auto-Push**: If GitHub auto-sync is enabled, GitHub commits run in a detached background worker thread. Slow network responses or API rate limits never cause local sync to time out.
- **Self-Expiring Mutex Lock**: Automatic 15-second timestamp expiration prevents service worker deadlocks across Manifest V3 worker suspensions.
- **No Fabricated History**: The initial sync sets an authentic cumulative baseline; only true deltas achieved after installation count toward today's goal.

### 3. LeetHub-Style GitHub Synchronization
Automatically structures your progress repository (e.g. [NishantJLU/kodekloud-progress](https://github.com/NishantJLU/kodekloud-progress)) into clean, professional directories:

```text
kodekloud-progress/
├── README.md                                  # Repository overview, course summary table & badges
│
├── Courses/
│   ├── 100-Days-of-MLOps/
│   │   ├── README.md                          # Course metrics, progress bar & backlink
│   │   ├── progress.json                      # Machine-readable track completion metadata
│   │   ├── Tasks/                             # Dedicated task solutions and notes
│   │   └── Activity/
│   │       ├── daily-progress.json            # Cumulative timeline of verified completions
│   │       └── activity-log.json              # Historical activity logs
│   ├── 100-Days-of-DevOps/
│   └── 100-Days-of-Cloud-Azure/
│
└── Analytics/
    ├── overall-progress.json                  # Global metrics across all courses
    ├── weekly-summary.json                    # Rolling 7-day activity volume
    └── monthly-summary.json                   # Month-by-month completion summary
```

- **Smart SHA Caching**: Only commits files when underlying data changes, avoiding empty or spam commits.
- **Safe Migration**: Automatically migrates legacy flat structures (`Start/`, `progress/`, `analytics/`) into `Courses/` without data loss.

### 4. Modern Extension Popup (`popup.html`)
- **Quick Status Bar**: One-click **Sync** button, active tab indicator, and real-time verification badge.
- **Decoupled GitHub Bar**: Displays connected repository name, `Auto` badge, real-time `Pushing...` spinner, and manual `Push` button.
- **Verified Metric Cards**:
  - **Tasks completed today** (Verified from KodeKloud practice tracks)
  - **Labs completed** (Hands-on lab exercises)
  - **Lessons completed** (Modules and courses)
  - **Learning time** (Tracked study minutes)
- **Daily Target Goal**: Visual progress bar tracking verified tasks toward your daily target.
- **Weekly Activity Chart**: 7-day bar chart showing activity volume from Monday through Sunday (`M`, `T`, `W`, `T`, `F`, `S`, `S`).
- **Streak Tracker**: Consecutive daily learning streak counter with longest-streak record.

### 5. Full-Screen Dashboard (`dashboard.html`)
- **Focus Study Timer**: Interactive Pomodoro-style timer with customizable durations and automatic session logging.
- **Interactive Activity Log**: Searchable and filterable table (by type, course, title, notes), edit modal, and delete with undo toast.
- **Analytics & Trends**: Recharts bar charts, 16-week GitHub-style contribution heatmap (5 activity intensity levels), and course distribution breakdown.
- **GitHub Settings**: Authenticate with a personal access token (PAT), select an existing repository, create a new repository directly from the extension, and toggle automatic synchronization.
- **Data Management**: Full JSON backup export/import, CSV activity export for Excel/Google Sheets, and reset tools.

---

## 🏗️ Architecture & Pipeline

```text
[Popup "Sync" Button]
         │
         ▼
1. Active Tab Validation (*://*.kodekloud.com/*)
         │
         ▼
2. Dynamic Script Injection (IIFE content.js if not yet initialized)
         │
         ▼
3. Dual-Strategy DOM Extraction & Arithmetic Validation
         │
         ▼
4. chrome.runtime.sendMessage({ type: 'EXECUTE_SYNC', payload: { tracks, syncId } })
         │
    ┌────┴────────────────────────────────────────┐
    │                                             │
    ▼ (<50ms)                                     ▼ (Async Background Worker)
[Phase A: Local Storage Sync]             [Phase B: GitHub Auto-Push]
• Diff against baseline snapshots         • Check if autoSync is enabled
• Save tracks, courses & deltas           • Read verified progress
• Update badge count in browser           • Update Courses/ and Analytics/
• Send immediate response to Popup        • Record commit SHA & history
    │                                             │
    ▼                                             ▼
[Popup UI Updates Instantly]              [GitHub Status Updates via chrome.storage]
Status: "Synced" (Emerald Badge)          Status: "Pushing..." ➔ "Pushed"
```

---

## 📦 Installation & Setup

### 1. Build from Source
Ensure you have [Node.js](https://nodejs.org/) (v18+) installed:

```bash
git clone https://github.com/NishantJLU/kodehub.git
cd kodehub
npm install
npm run build
```

This generates production-ready bundles inside the `dist/` directory:
- `dist/content.js`: Self-contained IIFE script with zero external dependencies.
- `dist/background.js`: Manifest V3 service worker.
- `dist/popup.html` and `dist/dashboard.html`: React application bundles.

### 2. Load the Extension in Chrome / Brave
1. Open Google Chrome or Brave and navigate to `chrome://extensions/` (or `brave://extensions/`).
2. Toggle **Developer mode** on (top-right switch).
3. Click **Load unpacked**.
4. Select the `dist/` directory inside your `kodehub` project folder.
5. Pin **KodeHub** to your browser toolbar.

### 3. Connect GitHub (Optional for Cloud Sync)
1. Open the **KodeHub Dashboard** by clicking the dashboard icon in the popup.
2. Navigate to **GitHub Integration** in the left sidebar.
3. Generate a GitHub Personal Access Token (classic) with `repo` scope at [github.com/settings/tokens](https://github.com/settings/tokens).
4. Paste your token and click **Connect**.
5. Select an existing progress repository (e.g. `kodekloud-progress`) or create a new public/private repository in one click.
6. Toggle **Automatic Sync** on to upload progress in the background whenever you sync.

---

## 🧪 Testing

KodeHub includes an automated test suite with **55 unit and integration tests** covering:
- Mathematical boundary conditions and metric separation
- Dual-strategy dynamic course discovery and collapsed card extraction
- Sentence description and button label rejection
- Streak and weekly distribution calculations
- Manifest V3 messaging, timeout prevention, and mutex lock management
- LeetHub-style GitHub tree generation and idempotent updates

Run the test suite with Vitest:

```bash
npm test
```

---

## 🛠️ Tech Stack

- **Extension Framework**: Chrome Extension Manifest V3, Vite
- **UI & Components**: React 18, TypeScript, Tailwind CSS, Lucide React
- **Data Visualization**: Recharts, SVG Heatmaps
- **Storage**: Chrome Storage Local API (`chrome.storage.local`)
- **API Integration**: GitHub REST API (v3)
- **Testing**: Vitest, JSDOM

---

## 📄 License

MIT © [Nishant Singh](https://github.com/NishantJLU)

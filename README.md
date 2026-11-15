# KodeHub 🚀
> **Track Your Learning. Measure Your Progress.**  
> A personal progress-tracking Chrome Extension (Manifest V3) for KodeKloud learners.

---

## 🌟 Highlights & Features

- **Accurate Progress Snapshot Synchronization**:
  - **Snapshot-Based Diffing**: Compares verified course snapshots against previously stored baselines to detect newly completed tasks.
  - **No Fabricated History**: Initial sync establishes a true baseline without falsely assuming historical completions occurred today.
  - **Dynamic Course Discovery**: Automatically discovers any visible track on `engineer.kodekloud.com/practice` without hardcoded course name lists.
  - **User-Initiated & Safe**: Operates directly on the user's active page upon request without intercepting private APIs, scraping behind gates, or reading cookies.
  - **Separate Metrics**: Keeps **Tasks Completed** (verified platform tasks) strictly separate from **Questions Solved** (manually logged or verified questions).

- **Quick Extension Popup**:
  - Header with app brand, last sync status timestamp, and active status indicator.
  - Dynamic greeting based on current local hour (e.g. *Good morning!*, *Sunday, November 15 · Your daily progress*).
  - 4 Real-time Metric Cards:
    - **Tasks completed** (Verified from KodeKloud practice tracks)
    - **Labs completed** (Hands-on labs)
    - **Lessons completed** (Topics and modules)
    - **Learning time** (Tracked study minutes)
  - **Daily Target Goal Progress Bar**: Target tracking with percentage completion and remaining count.
  - **Weekly Activity Chart**: 7-day bar chart showing activity volume for Mon through Sun (`M`, `T`, `W`, `T`, `F`, `S`, `S`).
  - **Streak Tracker**: Consecutive day streak counter with flame indicator and all-time longest streak.

- **Fast Activity Logger**:
  - Support for **Question Solved**, **Lab Completed**, **Lesson Completed**, **Task**, and **Mock Exam**.
  - **Quick Count Mode** or **Single Detailed Question Mode**.
  - Course selector with inline "+ Add New Course" capability.
  - Duration timer, notes, and topic fields.

- **Full-Page Learning Dashboard (`dashboard.html`)**:
  - **Overview**: Daily summary, interactive Focus Study Timer with real-time tracking, recent activity feed, and weekly charts.
  - **Activity Log**: Searchable and filterable table (by type, course, title, notes), edit modal, and delete with undo toast.
  - **Analytics & Trends**: Recharts weekly bar charts, 16-week GitHub-style contribution heatmap (5 activity intensity levels), and course distribution breakdown.
  - **Courses & Tracks**: Shows real completed, pending, and total task counts per discovered track.
  - **Goals & Targets**: Customize daily question target, daily labs, and study duration.
  - **Data Management**: Full JSON backup export/import, CSV activity export for Excel/Google Sheets, and reset tools.

---

## 📦 How to Install and Run in Google Chrome / Brave

1. **Build the extension**:
   ```bash
   cd /Users/nishantsingh/Documents/Projects/kodehub
   npm run build
   ```
   This compiles the extension into the `dist/` directory.

2. **Load into Browser**:
   - Open Google Chrome or Brave and go to `chrome://extensions/` (or `brave://extensions/`).
   - Enable **Developer mode** in the top right corner.
   - Click **Load unpacked**.
   - Select the `/Users/nishantsingh/Documents/Projects/kodehub/dist` folder.
   - Pin **KodeHub** to your browser toolbar.

3. **Run Tests**:
   ```bash
   npm test
   ```
   Runs Vitest test suites verifying snapshot diffing, streak calculation, and storage persistence.

---

## 🛠️ Tech Stack
- **Extension Framework**: Chrome Extension Manifest V3, Vite
- **UI & Components**: React 18, TypeScript, Tailwind CSS, Lucide React
- **Data Visualization**: Recharts, SVG Heatmaps
- **Storage**: Chrome Storage Local API (`chrome.storage.local`)
- **Testing**: Vitest

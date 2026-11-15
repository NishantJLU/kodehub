# KodeHub 🚀
> **Track Your Learning. Measure Your Progress.**  
> A personal progress-tracking Chrome Extension (Manifest V3) designed for KodeKloud learners.

---

## 🌟 Highlights & Features

- **Quick Extension Popup (Matching UI Design)**:
  - Header with app brand, "Learning dashboard" and "Active" status indicator.
  - Dynamic greeting based on current local hour (e.g. *Good morning!*, *Sunday, November 15 · Your daily progress*).
  - 4 Real-time Metric Cards:
    - **Questions solved** (`</>` icon)
    - **Labs completed** (Flask icon)
    - **Lessons completed** (Book icon)
    - **Learning time** (Clock icon)
  - **Daily Question Goal Progress Bar**: Target tracking with percentage completion and remaining question count.
  - **Weekly Activity Chart**: 7-day bar chart showing activity volume for Mon through Sun (`M`, `T`, `W`, `T`, `F`, `S`, `S`).
  - **Streak Tracker**: Consecutive day streak counter with flame indicator and all-time longest streak.
  - Quick action buttons to open log modal and launch the full dashboard.

- **Fast Activity Logger**:
  - Support for **Question Solved**, **Lab Completed**, **Lesson Completed**, **Task**, and **Mock Exam**.
  - **Quick Count Mode** (log batch of solved questions in seconds) or **Individual Detailed Question Mode**.
  - Course selector with inline "+ Add New Course" capability.
  - Duration timer, notes, and topic fields.

- **Full-Page Learning Dashboard (`dashboard.html`)**:
  - **Overview**: Daily summary, interactive Focus Study Timer with real-time tracking, recent activity feed, and weekly charts.
  - **Activity Log**: Searchable and filterable table (by type, course, title, notes), edit modal, and delete with 5-second undo toast.
  - **Analytics & Trends**: Recharts weekly bar charts, 16-week GitHub-style contribution heatmap (5 activity intensity levels), and course distribution breakdown.
  - **Courses Manager**: Track progress per certification track (e.g., CKA, DCA, Terraform, Linux Basics).
  - **Goals & Targets**: Customize daily question target, daily labs, and study duration.
  - **Data Management**: Full JSON backup export/import, CSV activity export for Excel/Google Sheets, realistic sample dataset loader, and reset tools.

- **Architecture & Privacy**:
  - **Zero Scraping / Safe Manifest V3**: Operates locally without injecting DOM scripts or reading private credentials.
  - **Local-First Storage**: Uses `chrome.storage.local` with fallback for development and testing.
  - **Extension Icon Badge**: Automatically reflects today's questions solved count on the Chrome toolbar.

---

## 📦 How to Install and Run in Google Chrome

1. **Build the extension**:
   ```bash
   cd /Users/nishantsingh/Documents/Projects/kodehub
   npm run build
   ```
   This generates the production-ready extension in the `dist/` folder.

2. **Load into Chrome**:
   - Open Google Chrome and navigate to `chrome://extensions/`.
   - Enable **Developer mode** in the top right corner.
   - Click **Load unpacked**.
   - Select the `/Users/nishantsingh/Documents/Projects/kodehub/dist` folder.
   - Pin **KodeHub** to your browser toolbar!

3. **Development Mode**:
   ```bash
   npm run dev
   ```
   Opens Vite dev server for rapid UI development and testing.

4. **Run Tests**:
   ```bash
   npm test
   ```
   Runs Vitest calculation, streak, and storage unit tests.

---

## 🛠️ Tech Stack
- **Extension Framework**: Chrome Extension Manifest V3, Vite
- **UI & Components**: React 18, TypeScript, Tailwind CSS, Lucide React
- **Data Visualization**: Recharts, SVG Heatmaps
- **Storage**: Chrome Storage Local API (`chrome.storage.local`)
- **Testing**: Vitest

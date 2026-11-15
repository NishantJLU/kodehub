import React, { useState, useEffect } from 'react';
import {
  Github,
  KeyRound,
  CheckCircle2,
  AlertCircle,
  FolderGit2,
  Plus,
  RefreshCw,
  ExternalLink,
  Shield,
  Clock,
  Sparkles,
  Lock,
  Globe,
  Radio,
  FileCode2,
} from 'lucide-react';
import {
  GitHubConfig,
  GitHubRepo,
  GitHubCommitRecord,
  TrackProgress,
  DailyActivity,
  LearningGoals,
} from '../types';
import { GitHubService } from '../services/github.service';
import { StorageService } from '../services/storage.service';
import { formatDateTime } from '../utils/dateUtils';

interface Props {
  tracks: TrackProgress[];
  activities: DailyActivity[];
  goals: LearningGoals;
  onNotification?: (msg: string) => void;
}

export const GitHubIntegrationView: React.FC<Props> = ({
  tracks,
  activities,
  goals,
  onNotification,
}) => {
  const [config, setConfig] = useState<GitHubConfig | null>(null);
  const [tokenInput, setTokenInput] = useState<string>('');
  const [isAuthenticating, setIsAuthenticating] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Repositories state
  const [repos, setRepos] = useState<GitHubRepo[]>([]);
  const [isLoadingRepos, setIsLoadingRepos] = useState<boolean>(false);
  const [isCreatingRepo, setIsCreatingRepo] = useState<boolean>(false);
  const [newRepoName, setNewRepoName] = useState<string>('KodeHub-Progress');
  const [newRepoPrivate, setNewRepoPrivate] = useState<boolean>(true);
  const [newRepoDesc, setNewRepoDesc] = useState<string>(
    'KodeKloud learning progress automatically tracked by KodeHub'
  );

  // Sync state
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);
  const [history, setHistory] = useState<GitHubCommitRecord[]>([]);

  // Load existing config & history
  const loadData = async () => {
    try {
      const [savedConfig, savedHistory] = await Promise.all([
        StorageService.getGitHubConfig(),
        StorageService.getGitHubHistory(),
      ]);

      setConfig(savedConfig);
      setHistory(savedHistory);

      if (savedConfig?.token) {
        fetchRepos(savedConfig.token);
      }
    } catch (err) {
      console.error('Failed to load GitHub config:', err);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const fetchRepos = async (token: string) => {
    setIsLoadingRepos(true);
    try {
      const userRepos = await GitHubService.getUserRepos(token);
      setRepos(userRepos);
    } catch (err: any) {
      console.warn('Failed to fetch repositories:', err);
    } finally {
      setIsLoadingRepos(false);
    }
  };

  // Connect GitHub with PAT
  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tokenInput.trim()) return;

    setIsAuthenticating(true);
    setAuthError(null);

    try {
      const result = await GitHubService.validateToken(tokenInput.trim());

      if (result.success && result.user) {
        const newConfig: GitHubConfig = {
          token: tokenInput.trim(),
          user: result.user,
          selectedRepo: null,
          branch: 'main',
          autoSync: true,
          lastSyncAt: null,
          lastSyncCommitSha: null,
          lastSyncCommitUrl: null,
        };

        await StorageService.saveGitHubConfig(newConfig);
        setConfig(newConfig);
        setTokenInput('');
        fetchRepos(newConfig.token);
        if (onNotification) onNotification(`Connected as @${result.user.login}!`);
      } else {
        setAuthError(result.error || 'Authentication failed. Please verify token permissions.');
      }
    } catch (err: any) {
      setAuthError(err.message || 'Network error connecting to GitHub');
    } finally {
      setIsAuthenticating(false);
    }
  };

  // Disconnect GitHub
  const handleDisconnect = async () => {
    if (window.confirm('Disconnect GitHub account from KodeHub?')) {
      await StorageService.clearGitHubConfig();
      setConfig(null);
      setRepos([]);
      if (onNotification) onNotification('GitHub disconnected.');
    }
  };

  // Select existing repo
  const handleSelectRepo = async (repoIdStr: string) => {
    if (!config) return;
    const repo = repos.find((r) => String(r.id) === repoIdStr) || null;
    const updated: GitHubConfig = {
      ...config,
      selectedRepo: repo,
      branch: repo?.default_branch || 'main',
    };
    await StorageService.saveGitHubConfig(updated);
    setConfig(updated);
    if (repo && onNotification) {
      onNotification(`Selected target repository: ${repo.full_name}`);
    }
  };

  // Create new repo
  const handleCreateRepo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!config || !newRepoName.trim()) return;

    setIsCreatingRepo(true);
    try {
      const created = await GitHubService.createRepo(
        config.token,
        newRepoName.trim(),
        newRepoPrivate,
        newRepoDesc.trim()
      );

      const updated: GitHubConfig = {
        ...config,
        selectedRepo: created,
        branch: created.default_branch || 'main',
      };

      await StorageService.saveGitHubConfig(updated);
      setConfig(updated);
      setRepos([created, ...repos]);
      setIsCreatingRepo(false);
      setNewRepoName('');
      if (onNotification) {
        onNotification(`Created and linked repository ${created.full_name}!`);
      }
    } catch (err: any) {
      alert(`Failed to create repository: ${err.message}`);
    } finally {
      setIsCreatingRepo(false);
    }
  };

  // Toggle Auto-sync
  const handleToggleAutoSync = async () => {
    if (!config) return;
    const updated: GitHubConfig = {
      ...config,
      autoSync: !config.autoSync,
    };
    await StorageService.saveGitHubConfig(updated);
    setConfig(updated);
    if (onNotification) {
      onNotification(`Auto-sync ${updated.autoSync ? 'enabled' : 'disabled'}`);
    }
  };

  // Manual Trigger Push to GitHub
  const handleManualSync = async () => {
    if (!config || !config.selectedRepo || isSyncing) return;

    setIsSyncing(true);
    setSyncStatus('Synchronizing files to GitHub...');

    try {
      const result = await GitHubService.syncProgressToGitHub(
        config,
        tracks,
        activities,
        goals
      );

      if (result.success) {
        const nowIso = new Date().toISOString();
        const updatedConfig: GitHubConfig = {
          ...config,
          lastSyncAt: nowIso,
          lastSyncCommitSha: result.lastCommitSha || config.lastSyncCommitSha,
          lastSyncCommitUrl: result.lastCommitUrl || config.lastSyncCommitUrl,
        };
        await StorageService.saveGitHubConfig(updatedConfig);
        setConfig(updatedConfig);

        // Record history
        if (result.commitsCreated > 0) {
          const record: GitHubCommitRecord = {
            id: `gh-manual-${Date.now()}`,
            timestamp: nowIso,
            commitSha: result.lastCommitSha || 'sync',
            commitUrl: result.lastCommitUrl || config.selectedRepo.html_url,
            commitMessage: result.message,
            filesChanged: result.filesUpdated,
            status: 'success',
          };
          await StorageService.saveGitHubCommitRecord(record);
          setHistory([record, ...history]);
        }

        setSyncStatus(result.message);
        if (onNotification) onNotification(result.message);
      } else {
        setSyncStatus(`Sync failed: ${result.message}`);
      }
    } catch (err: any) {
      setSyncStatus(`Sync error: ${err.message}`);
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header Banner */}
      <div className="bg-[#111827] border border-[#1f293d] rounded-2xl p-6 shadow-sm flex items-start justify-between">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shrink-0">
            <Github className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
              GitHub Synchronization
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-indigo-950/80 border border-indigo-800/80 text-indigo-400 font-normal">
                LeetHub Style
              </span>
            </h2>
            <p className="text-xs text-slate-400 mt-1 max-w-2xl leading-relaxed">
              Automatically synchronize your verified KodeKloud learning progress, solved questions,
              hands-on labs, and analytics directly into your own GitHub repository.
            </p>
          </div>
        </div>

        {config?.user && (
          <div className="flex items-center gap-3">
            <img
              src={config.user.avatar_url}
              alt={config.user.login}
              className="w-9 h-9 rounded-full border border-indigo-500/50 shadow"
            />
            <div className="text-right">
              <div className="text-xs font-bold text-white">@{config.user.login}</div>
              <button
                onClick={handleDisconnect}
                className="text-[10px] text-rose-400 hover:text-rose-300 underline"
              >
                Disconnect
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 1. If NOT authenticated: Connect View */}
      {!config?.token ? (
        <div className="bg-[#111827] border border-[#1f293d] rounded-2xl p-6 shadow-sm">
          <div className="max-w-xl">
            <h3 className="text-base font-bold text-white mb-2 flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-indigo-400" />
              Connect with GitHub Token
            </h3>
            <p className="text-xs text-slate-400 mb-4 leading-relaxed">
              Generate a GitHub Personal Access Token (PAT) with the{' '}
              <code className="text-indigo-300 bg-[#162032] px-1.5 py-0.5 rounded border border-[#23334f]">
                repo
              </code>{' '}
              scope (or Fine-grained token with <em>Contents: Read and write</em>) to allow KodeHub to
              push your learning commits without hardcoding third-party OAuth secrets.
            </p>

            <form onSubmit={handleConnect} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Personal Access Token
                </label>
                <input
                  type="password"
                  value={tokenInput}
                  onChange={(e) => setTokenInput(e.target.value)}
                  placeholder="ghp_xxxxxxxxxxxxxxxxxxxx or github_pat_xxxx"
                  className="w-full bg-[#162032] border border-[#23334f] rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition font-mono"
                  required
                />
              </div>

              {authError && (
                <div className="p-3 bg-rose-950/60 border border-rose-800/80 rounded-xl text-xs text-rose-300 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                  <span>{authError}</span>
                </div>
              )}

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="submit"
                  disabled={isAuthenticating || !tokenInput.trim()}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-2 px-5 rounded-xl text-xs flex items-center gap-2 transition active:scale-98 disabled:opacity-50 shadow-md shadow-indigo-600/20"
                >
                  {isAuthenticating ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Authenticating...</span>
                    </>
                  ) : (
                    <>
                      <Shield className="w-3.5 h-3.5" />
                      <span>Connect GitHub</span>
                    </>
                  )}
                </button>

                <a
                  href="https://github.com/settings/tokens/new?scopes=repo&description=KodeHub%20Learning%20Tracker"
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1 hover:underline"
                >
                  <span>Generate token on GitHub</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </form>
          </div>
        </div>
      ) : (
        /* 2. Authenticated: Repository Selector & Sync Configuration */
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Controls (2 cols) */}
          <div className="lg:col-span-2 space-y-6">
            {/* Target Repository Selection */}
            <div className="bg-[#111827] border border-[#1f293d] rounded-2xl p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <FolderGit2 className="w-4 h-4 text-indigo-400" />
                  Target Progress Repository
                </h3>
                {config.selectedRepo && (
                  <div className="flex items-center gap-2">
                    <a
                      href={config.selectedRepo.html_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[11px] px-2.5 py-1 rounded-lg bg-indigo-950/80 border border-indigo-700/80 text-indigo-300 hover:text-indigo-200 flex items-center gap-1 transition hover:bg-indigo-900/80 shadow-sm"
                      title="Open repository in GitHub"
                    >
                      <span>Open Repository</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full border flex items-center gap-1 font-medium ${
                        config.selectedRepo.private
                          ? 'bg-amber-950/60 border-amber-800/80 text-amber-300'
                          : 'bg-emerald-950/60 border-emerald-800/80 text-emerald-300'
                      }`}
                    >
                      {config.selectedRepo.private ? <Lock className="w-2.5 h-2.5" /> : <Globe className="w-2.5 h-2.5" />}
                      {config.selectedRepo.private ? 'Private' : 'Public'}
                    </span>
                  </div>
                )}
              </div>

              {/* Repo Selector Dropdown */}
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Select Existing Repository
                </label>
                <div className="flex items-center gap-2">
                  <select
                    value={config.selectedRepo ? String(config.selectedRepo.id) : ''}
                    onChange={(e) => handleSelectRepo(e.target.value)}
                    disabled={isLoadingRepos}
                    className="flex-1 bg-[#162032] border border-[#23334f] rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 transition"
                  >
                    <option value="">-- Choose a repository --</option>
                    {repos.map((r) => (
                      <option key={r.id} value={String(r.id)}>
                        {r.full_name} {r.private ? '(Private)' : '(Public)'}
                      </option>
                    ))}
                  </select>

                  <button
                    onClick={() => fetchRepos(config.token)}
                    disabled={isLoadingRepos}
                    className="p-2 bg-[#162032] hover:bg-[#1e2b42] border border-[#23334f] rounded-xl text-slate-300 transition"
                    title="Refresh repositories"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isLoadingRepos ? 'animate-spin' : ''}`} />
                  </button>
                </div>
              </div>

              {/* OR Create New Repository */}
              <div className="pt-3 border-t border-[#1f293d]">
                <details className="group">
                  <summary className="text-xs text-indigo-400 hover:text-indigo-300 cursor-pointer font-medium flex items-center gap-1 select-none">
                    <Plus className="w-3.5 h-3.5 transition group-open:rotate-45" />
                    <span>Create a new repository for KodeHub progress</span>
                  </summary>

                  <form onSubmit={handleCreateRepo} className="mt-3 space-y-3 bg-[#0d131f] p-4 rounded-xl border border-[#1f293d]">
                    <div>
                      <label className="block text-[11px] font-medium text-slate-300 mb-1">
                        Repository Name
                      </label>
                      <input
                        type="text"
                        value={newRepoName}
                        onChange={(e) => setNewRepoName(e.target.value)}
                        placeholder="KodeHub-Progress"
                        className="w-full bg-[#162032] border border-[#23334f] rounded-lg px-3 py-1.5 text-xs text-white font-mono"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-medium text-slate-300 mb-1">
                        Description (optional)
                      </label>
                      <input
                        type="text"
                        value={newRepoDesc}
                        onChange={(e) => setNewRepoDesc(e.target.value)}
                        placeholder="KodeKloud learning progress"
                        className="w-full bg-[#162032] border border-[#23334f] rounded-lg px-3 py-1.5 text-xs text-white"
                      />
                    </div>

                    <div className="flex items-center gap-4">
                      <label className="flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer">
                        <input
                          type="radio"
                          name="visibility"
                          checked={newRepoPrivate}
                          onChange={() => setNewRepoPrivate(true)}
                          className="accent-indigo-500"
                        />
                        <span>Private repository (Recommended)</span>
                      </label>
                      <label className="flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer">
                        <input
                          type="radio"
                          name="visibility"
                          checked={!newRepoPrivate}
                          onChange={() => setNewRepoPrivate(false)}
                          className="accent-indigo-500"
                        />
                        <span>Public</span>
                      </label>
                    </div>

                    <button
                      type="submit"
                      disabled={isCreatingRepo || !newRepoName.trim()}
                      className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-1.5 px-4 rounded-lg text-xs flex items-center gap-1.5 transition active:scale-98 disabled:opacity-50"
                    >
                      {isCreatingRepo ? (
                        <>
                          <RefreshCw className="w-3 h-3 animate-spin" />
                          <span>Creating repo...</span>
                        </>
                      ) : (
                        <>
                          <Plus className="w-3 h-3" />
                          <span>Create & Link Repository</span>
                        </>
                      )}
                    </button>
                  </form>
                </details>
              </div>
            </div>

            {/* Synchronization Options & Actions */}
            {config.selectedRepo && (
              <div className="bg-[#111827] border border-[#1f293d] rounded-2xl p-6 shadow-sm space-y-4">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Radio className="w-4 h-4 text-emerald-400" />
                  Synchronization Settings
                </h3>

                <div className="flex items-center justify-between p-3.5 bg-[#162032] border border-[#23334f] rounded-xl">
                  <div>
                    <div className="text-xs font-semibold text-white">Automatic GitHub Push</div>
                    <div className="text-[11px] text-slate-400">
                      Whenever new verified task completions are detected on KodeKloud, automatically
                      commit updates to GitHub.
                    </div>
                  </div>
                  <button
                    onClick={handleToggleAutoSync}
                    className={`w-11 h-6 rounded-full transition-colors relative p-0.5 ${
                      config.autoSync ? 'bg-indigo-600' : 'bg-slate-700'
                    }`}
                  >
                    <div
                      className={`w-5 h-5 rounded-full bg-white transition-transform ${
                        config.autoSync ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                <div className="flex items-center gap-3 pt-2">
                  <button
                    onClick={handleManualSync}
                    disabled={isSyncing}
                    className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-2 px-5 rounded-xl text-xs flex items-center gap-2 transition active:scale-98 shadow-md shadow-indigo-600/20 disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                    <span>{isSyncing ? 'Pushing to GitHub...' : 'Push to GitHub Now'}</span>
                  </button>

                  <a
                    href={config.selectedRepo.html_url}
                    target="_blank"
                    rel="noreferrer"
                    className="p-2 bg-[#162032] hover:bg-[#1e2b42] border border-[#23334f] rounded-xl text-xs text-slate-300 hover:text-white flex items-center gap-1.5 transition"
                  >
                    <span>View on GitHub</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>

                {syncStatus && (
                  <div className="text-xs text-slate-300 p-3 bg-[#0d131f] border border-[#1f293d] rounded-xl flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span>{syncStatus}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right Column: Repository Structure & History */}
          <div className="space-y-6">
            {/* Repo Architecture preview */}
            <div className="bg-[#111827] border border-[#1f293d] rounded-2xl p-5 shadow-sm space-y-3">
              <h3 className="text-xs font-bold text-white flex items-center gap-1.5">
                <FileCode2 className="w-3.5 h-3.5 text-indigo-400" />
                Repository Layout
              </h3>
              <div className="font-mono text-[11px] text-slate-300 bg-[#0d131f] p-3 rounded-xl border border-[#1f293d] leading-relaxed">
                <div>📁 kodekloud-progress/</div>
                <div className="text-slate-500 pl-3">├── 📄 README.md</div>
                <div className="text-indigo-400 pl-3">├── 📁 Courses/</div>
                <div className="text-indigo-300 pl-6">├── 📁 100-Days-of-MLOps/</div>
                <div className="text-slate-400 pl-9">├── 📄 README.md</div>
                <div className="text-slate-400 pl-9">├── 📄 progress.json</div>
                <div className="text-amber-400 pl-9">├── 📁 Tasks/ (e.g. 001-intro/)</div>
                <div className="text-cyan-400 pl-9">└── 📁 Activity/ (daily & log)</div>
                <div className="text-indigo-300 pl-6">├── 📁 100-Days-of-DevOps/</div>
                <div className="text-indigo-300 pl-6">└── 📁 100-Days-of-Cloud-Azure/</div>
                <div className="text-emerald-400 pl-3">└── 📁 Analytics/</div>
                <div className="text-slate-400 pl-6">├── overall-progress.json</div>
                <div className="text-slate-400 pl-6">├── weekly-summary.json</div>
                <div className="text-slate-400 pl-6">└── monthly-summary.json</div>
              </div>
            </div>

            {/* Commit History */}
            <div className="bg-[#111827] border border-[#1f293d] rounded-2xl p-5 shadow-sm space-y-3">
              <h3 className="text-xs font-bold text-white flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-indigo-400" />
                  Upload History
                </span>
                <span className="text-[10px] text-slate-500 font-mono font-normal">
                  {history.length} commits
                </span>
              </h3>

              {history.length === 0 ? (
                <div className="text-center py-6 text-xs text-slate-500">
                  No synchronization commits yet.
                </div>
              ) : (
                <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                  {history.map((record) => (
                    <div
                      key={record.id}
                      className="p-2.5 bg-[#0d131f] border border-[#1f293d] rounded-xl text-xs space-y-1 hover:border-[#2f405e] transition"
                    >
                      <div className="flex items-center justify-between text-[10px] text-slate-400">
                        <span>{formatDateTime(record.timestamp)}</span>
                        <span className="text-emerald-400 font-medium">Synced</span>
                      </div>
                      <div className="text-white font-medium truncate text-[11px]">
                        {record.commitMessage}
                      </div>
                      {record.commitUrl && (
                        <a
                          href={record.commitUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[10px] text-indigo-400 hover:text-indigo-300 font-mono flex items-center gap-1 hover:underline"
                        >
                          <span>{record.commitSha.slice(0, 7)}</span>
                          <ExternalLink className="w-2.5 h-2.5" />
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

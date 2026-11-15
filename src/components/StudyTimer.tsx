import React, { useState, useEffect } from 'react';
import { Play, Pause, RotateCcw, Check, Sparkles, Clock, Flame } from 'lucide-react';
import { Course, LearningActivity, DailyActivity } from '../types';
import { StorageService } from '../services/storage.service';

interface Props {
  courses: Course[];
  onSessionLogged: () => void;
}

export const StudyTimer: React.FC<Props> = ({ courses, onSessionLogged }) => {
  const [seconds, setSeconds] = useState<number>(0);
  const [isActive, setIsActive] = useState<boolean>(false);
  const [selectedCourseId, setSelectedCourseId] = useState<string>(courses[0]?.id || '');
  const [sessionTopic, setSessionTopic] = useState<string>('');
  const [isSaved, setIsSaved] = useState<boolean>(false);

  useEffect(() => {
    let interval: any = null;
    if (isActive) {
      interval = setInterval(() => {
        setSeconds((s) => s + 1);
      }, 1000);
    } else {
      clearInterval(interval);
    }
    return () => clearInterval(interval);
  }, [isActive]);

  const toggleTimer = () => {
    setIsActive(!isActive);
    setIsSaved(false);
  };

  const resetTimer = () => {
    setIsActive(false);
    setSeconds(0);
    setIsSaved(false);
  };

  const formatTimerDisplay = (sec: number) => {
    const hrs = Math.floor(sec / 3600);
    const mins = Math.floor((sec % 3600) / 60);
    const remainingSecs = sec % 60;
    if (hrs > 0) {
      return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(remainingSecs).padStart(2, '0')}`;
    }
    return `${String(mins).padStart(2, '0')}:${String(remainingSecs).padStart(2, '0')}`;
  };

  const handleSaveSession = async () => {
    const elapsedMinutes = Math.max(1, Math.round(seconds / 60));
    const selectedCourse = courses.find((c) => c.id === selectedCourseId);
    const courseName = selectedCourse ? selectedCourse.name : 'General Learning';

    const newActivity: DailyActivity = {
      id: `timer-${Date.now()}`,
      trackId: selectedCourseId || 'c-gen',
      courseName,
      activityType: 'other',
      title: sessionTopic.trim() || `Focus Study Session (${elapsedMinutes}m)`,
      quantity: 1,
      durationMinutes: elapsedMinutes,
      source: 'manual',
      notes: `Recorded via KodeHub Study Timer`,
      completedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await StorageService.saveActivity(newActivity);
    setIsSaved(true);
    setIsActive(false);
    onSessionLogged();
    setTimeout(() => {
      setSeconds(0);
      setSessionTopic('');
      setIsSaved(false);
    }, 2500);
  };

  return (
    <div className="bg-[#161f30] border border-[#233047] rounded-2xl p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-indigo-500/20 text-indigo-400 flex items-center justify-center">
            <Clock className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-white">Focus Study Timer</h4>
            <p className="text-[11px] text-slate-400">Track hands-on lab or study sessions in real-time</p>
          </div>
        </div>

        {isActive && (
          <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-950/70 border border-emerald-800/80 text-emerald-400 text-xs">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
            <span>Tracking active</span>
          </span>
        )}
      </div>

      {/* Timer Display */}
      <div className="flex flex-col items-center justify-center py-4 bg-[#0f172a] rounded-xl border border-slate-800/80 mb-4">
        <span className="text-4xl font-mono font-bold text-white tracking-wider">
          {formatTimerDisplay(seconds)}
        </span>
        <span className="text-xs text-slate-400 mt-1">
          {Math.floor(seconds / 60)} minutes elapsed
        </span>
      </div>

      {/* Course & Topic inputs */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div>
          <label className="block text-xs text-slate-400 mb-1">Course</label>
          <select
            value={selectedCourseId}
            onChange={(e) => setSelectedCourseId(e.target.value)}
            disabled={isActive}
            className="w-full bg-[#0f172a] border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs text-white focus:outline-none disabled:opacity-60"
          >
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">Session Focus (Optional)</label>
          <input
            type="text"
            placeholder="e.g. Ingress & Services Lab"
            value={sessionTopic}
            onChange={(e) => setSessionTopic(e.target.value)}
            className="w-full bg-[#0f172a] border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs text-white placeholder-slate-600 focus:outline-none"
          />
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-800/80">
        <div className="flex items-center gap-2">
          <button
            onClick={toggleTimer}
            className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition ${
              isActive
                ? 'bg-amber-600 hover:bg-amber-500 text-white'
                : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/30'
            }`}
          >
            {isActive ? (
              <>
                <Pause className="w-3.5 h-3.5" />
                <span>Pause</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 fill-white" />
                <span>{seconds > 0 ? 'Resume' : 'Start Timer'}</span>
              </>
            )}
          </button>

          <button
            onClick={resetTimer}
            disabled={seconds === 0}
            className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition disabled:opacity-40"
            title="Reset timer"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>

        <button
          onClick={handleSaveSession}
          disabled={seconds < 30 || isSaved}
          className={`px-4 py-2 rounded-xl text-xs font-medium flex items-center gap-1.5 transition ${
            isSaved
              ? 'bg-emerald-600 text-white'
              : seconds >= 30
              ? 'bg-slate-800 hover:bg-slate-700 text-indigo-300 border border-indigo-500/30'
              : 'bg-slate-900 text-slate-600 border border-slate-800 cursor-not-allowed'
          }`}
        >
          {isSaved ? (
            <>
              <Check className="w-3.5 h-3.5" />
              <span>Saved!</span>
            </>
          ) : (
            <>
              <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
              <span>Log as Study Activity</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};

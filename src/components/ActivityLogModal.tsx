import React, { useState } from 'react';
import { X, Check, Plus, BookOpen, Beaker, Code2, CheckSquare, Award, Clock } from 'lucide-react';
import { ActivityType, LearningActivity, DailyActivity, Course } from '../types';
import { StorageService } from '../services/storage.service';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onActivitySaved: () => void;
  courses: Course[];
  initialType?: ActivityType;
}

export const ActivityLogModal: React.FC<Props> = ({
  isOpen,
  onClose,
  onActivitySaved,
  courses,
  initialType = 'question',
}) => {
  const [type, setType] = useState<ActivityType>(initialType);
  const [courseId, setCourseId] = useState<string>(courses[0]?.id || '');
  const [newCourseName, setNewCourseName] = useState<string>('');
  const [isAddingCourse, setIsAddingCourse] = useState<boolean>(false);

  // Form fields
  const [isQuickCount, setIsQuickCount] = useState<boolean>(true);
  const [quantity, setQuantity] = useState<number>(1);
  const [title, setTitle] = useState<string>('');
  const [module, setModule] = useState<string>('');
  const [durationMinutes, setDurationMinutes] = useState<number>(30);
  const [questionsAttempted, setQuestionsAttempted] = useState<string>('');
  const [correctAnswers, setCorrectAnswers] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  if (!isOpen) return null;

  const handleAddNewCourse = async () => {
    if (!newCourseName.trim()) return;
    const newCourse: Course = {
      id: `c-${Date.now()}`,
      name: newCourseName.trim(),
      createdAt: new Date().toISOString(),
    };
    await StorageService.saveCourse(newCourse);
    courses.push(newCourse);
    setCourseId(newCourse.id);
    setNewCourseName('');
    setIsAddingCourse(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const selectedCourse = courses.find((c) => c.id === courseId);
      const courseName = selectedCourse ? selectedCourse.name : 'General Learning';

      const finalQuantity = type === 'question' ? (isQuickCount ? Math.max(1, quantity) : 1) : 1;

      const defaultTitleByType: Record<ActivityType, string> = {
        question: `Solved ${finalQuantity} practice questions`,
        lab: 'Hands-on Lab Exercise',
        lesson: 'Video Lesson & Notes',
        task: 'Productivity & Setup Task',
        mock_exam: 'Mock Exam Assessment',
        other: 'General Learning Session',
      };

      const activity: DailyActivity = {
        id: `act-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        trackId: courseId || 'c-gen',
        courseName,
        activityType: type,
        title: title.trim() || defaultTitleByType[type],
        module: module.trim() || undefined,
        quantity: finalQuantity,
        questionsAttempted: questionsAttempted ? Number(questionsAttempted) : undefined,
        correctAnswers: correctAnswers ? Number(correctAnswers) : undefined,
        durationMinutes: Number(durationMinutes) || 0,
        notes: notes.trim() || undefined,
        completedAt: new Date().toISOString(),
        source: 'manual',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await StorageService.saveActivity(activity);
      onActivitySaved();
      onClose();
    } catch (err) {
      console.error('Failed to save activity:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const typeConfig: { id: ActivityType; label: string; icon: any }[] = [
    { id: 'question', label: 'Question', icon: Code2 },
    { id: 'lab', label: 'Lab', icon: Beaker },
    { id: 'lesson', label: 'Lesson', icon: BookOpen },
    { id: 'task', label: 'Task', icon: CheckSquare },
    { id: 'mock_exam', label: 'Mock Exam', icon: Award },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
      <div
        className="bg-[#161f30] border border-slate-700/80 w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <Plus className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-white">Log Learning Activity</h3>
              <p className="text-xs text-slate-400">Record your progress to update daily streaks & goals</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 overflow-y-auto space-y-4">
          {/* Activity Type Selector */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">Activity Type</label>
            <div className="grid grid-cols-5 gap-1.5 bg-[#0f172a] p-1 rounded-xl border border-slate-800">
              {typeConfig.map((item) => {
                const Icon = item.icon;
                const isSelected = type === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setType(item.id)}
                    className={`flex flex-col items-center justify-center py-2 px-1 rounded-lg text-xs font-medium transition ${
                      isSelected
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                    }`}
                  >
                    <Icon className="w-4 h-4 mb-1" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* If Question: Mode Toggle */}
          {type === 'question' && (
            <div className="flex items-center justify-between bg-slate-900/60 border border-slate-800 p-2.5 rounded-xl">
              <div>
                <span className="text-xs font-medium text-white">Tracking Mode</span>
                <p className="text-[11px] text-slate-400">
                  {isQuickCount ? 'Batch multiple questions in one entry' : 'Log single detailed question'}
                </p>
              </div>
              <div className="flex bg-slate-800 p-0.5 rounded-lg border border-slate-700/60">
                <button
                  type="button"
                  onClick={() => setIsQuickCount(true)}
                  className={`text-xs px-2.5 py-1 rounded-md transition ${
                    isQuickCount ? 'bg-indigo-600 text-white font-medium' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Quick Count
                </button>
                <button
                  type="button"
                  onClick={() => setIsQuickCount(false)}
                  className={`text-xs px-2.5 py-1 rounded-md transition ${
                    !isQuickCount ? 'bg-indigo-600 text-white font-medium' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Single
                </button>
              </div>
            </div>
          )}

          {/* Question Count / Quantity */}
          {type === 'question' && isQuickCount && (
            <div className="bg-indigo-950/20 border border-indigo-800/30 p-3 rounded-xl flex items-center justify-between">
              <div>
                <label className="block text-xs font-semibold text-indigo-300">Questions Solved</label>
                <span className="text-[11px] text-slate-400">Count added to today's goal</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setQuantity(Math.max(1, quantity - 1))}
                  className="w-7 h-7 rounded-lg bg-slate-800 text-slate-200 flex items-center justify-center hover:bg-slate-700 font-bold"
                >
                  -
                </button>
                <input
                  type="number"
                  min="1"
                  max="500"
                  value={quantity}
                  onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
                  className="w-14 text-center bg-slate-900 border border-slate-700 text-white text-base font-bold py-1 rounded-lg focus:outline-none focus:border-indigo-500"
                />
                <button
                  type="button"
                  onClick={() => setQuantity(quantity + 1)}
                  className="w-7 h-7 rounded-lg bg-slate-800 text-slate-200 flex items-center justify-center hover:bg-slate-700 font-bold"
                >
                  +
                </button>
              </div>
            </div>
          )}

          {/* Course Selection */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium text-slate-300">Course / Certification</label>
              <button
                type="button"
                onClick={() => setIsAddingCourse(!isAddingCourse)}
                className="text-[11px] text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
              >
                {isAddingCourse ? 'Cancel' : '+ New Course'}
              </button>
            </div>

            {isAddingCourse ? (
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="e.g. Certified Kubernetes Application Developer (CKAD)"
                  value={newCourseName}
                  onChange={(e) => setNewCourseName(e.target.value)}
                  className="flex-1 bg-[#0f172a] border border-indigo-500/50 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handleAddNewCourse}
                  className="px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium rounded-xl"
                >
                  Add
                </button>
              </div>
            ) : (
              <select
                value={courseId}
                onChange={(e) => setCourseId(e.target.value)}
                className="w-full bg-[#0f172a] border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
              >
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Title / Topic Name */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              {type === 'lab' ? 'Lab Name' : type === 'question' ? 'Topic / Question Title' : 'Activity Title'}
            </label>
            <input
              type="text"
              placeholder={
                type === 'lab'
                  ? 'e.g. Lab: Imperative Pod Commands & Deployments'
                  : type === 'question'
                  ? 'e.g. ConfigMaps & Secrets debugging practice'
                  : 'e.g. Linux Systemd Architecture Deep Dive'
              }
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full bg-[#0f172a] border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* Module / Section & Duration */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">Module / Section (Optional)</label>
              <input
                type="text"
                placeholder="e.g. Core Concepts"
                value={module}
                onChange={(e) => setModule(e.target.value)}
                className="w-full bg-[#0f172a] border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">Time Spent (Minutes)</label>
              <div className="relative">
                <input
                  type="number"
                  min="0"
                  max="1440"
                  value={durationMinutes}
                  onChange={(e) => setDurationMinutes(parseInt(e.target.value) || 0)}
                  className="w-full bg-[#0f172a] border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 pl-8"
                />
                <Clock className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
              </div>
            </div>
          </div>

          {/* Optional Question Stats */}
          {type === 'question' && !isQuickCount && (
            <div className="grid grid-cols-2 gap-3 bg-slate-900/40 p-2.5 rounded-xl border border-slate-800">
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Attempted</label>
                <input
                  type="number"
                  placeholder="e.g. 1"
                  value={questionsAttempted}
                  onChange={(e) => setQuestionsAttempted(e.target.value)}
                  className="w-full bg-[#0f172a] border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Correct Answers</label>
                <input
                  type="number"
                  placeholder="e.g. 1"
                  value={correctAnswers}
                  onChange={(e) => setCorrectAnswers(e.target.value)}
                  className="w-full bg-[#0f172a] border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none"
                />
              </div>
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">Notes / Key Takeaways (Optional)</label>
            <textarea
              rows={2}
              placeholder="e.g. Reviewed kubectl run --dry-run=client -o yaml flag..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full bg-[#0f172a] border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 resize-none"
            />
          </div>

          {/* Submit Actions */}
          <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl shadow-lg shadow-indigo-600/30 flex items-center gap-1.5 transition disabled:opacity-50"
            >
              <Check className="w-4 h-4" />
              <span>{isSubmitting ? 'Saving...' : 'Save Activity'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

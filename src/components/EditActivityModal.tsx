import React, { useState, useEffect } from 'react';
import { X, Check, Clock } from 'lucide-react';
import { LearningActivity, Course } from '../types';
import { StorageService } from '../services/storage.service';

interface Props {
  activity: LearningActivity | null;
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  courses: Course[];
}

export const EditActivityModal: React.FC<Props> = ({
  activity,
  isOpen,
  onClose,
  onSaved,
  courses,
}) => {
  const [courseId, setCourseId] = useState<string>('');
  const [title, setTitle] = useState<string>('');
  const [module, setModule] = useState<string>('');
  const [quantity, setQuantity] = useState<number>(1);
  const [durationMinutes, setDurationMinutes] = useState<number>(30);
  const [notes, setNotes] = useState<string>('');
  const [completedAt, setCompletedAt] = useState<string>('');
  const [isSaving, setIsSaving] = useState<boolean>(false);

  useEffect(() => {
    if (activity) {
      setCourseId(activity.courseId || courses[0]?.id || '');
      setTitle(activity.title || '');
      setModule(activity.module || '');
      setQuantity(activity.quantity || 1);
      setDurationMinutes(activity.durationMinutes || 0);
      setNotes(activity.notes || '');
      setCompletedAt(activity.completedAt ? activity.completedAt.slice(0, 16) : '');
    }
  }, [activity, courses]);

  if (!isOpen || !activity) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);

    try {
      const selectedCourse = courses.find((c) => c.id === courseId);
      const courseName = selectedCourse ? selectedCourse.name : activity.courseName;

      await StorageService.updateActivity(activity.id, {
        courseId,
        courseName,
        title: title.trim(),
        module: module.trim() || undefined,
        quantity: Math.max(1, quantity),
        durationMinutes: Number(durationMinutes) || 0,
        notes: notes.trim() || undefined,
        completedAt: completedAt ? new Date(completedAt).toISOString() : activity.completedAt,
      });

      onSaved();
      onClose();
    } catch (err) {
      console.error('Failed to update activity:', err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
      <div
        className="bg-[#161f30] border border-slate-700/80 w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <div>
            <h3 className="text-base font-semibold text-white">Edit Activity</h3>
            <p className="text-xs text-slate-400">Update activity details and metadata</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">Course</label>
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
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full bg-[#0f172a] border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">Quantity / Questions Count</label>
              <input
                type="number"
                min="1"
                max="500"
                value={quantity}
                onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
                className="w-full bg-[#0f172a] border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
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

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">Module / Section</label>
              <input
                type="text"
                value={module}
                onChange={(e) => setModule(e.target.value)}
                className="w-full bg-[#0f172a] border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">Date & Time</label>
              <input
                type="datetime-local"
                value={completedAt}
                onChange={(e) => setCompletedAt(e.target.value)}
                className="w-full bg-[#0f172a] border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">Notes</label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full bg-[#0f172a] border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 resize-none"
            />
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-white rounded-xl hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="px-5 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl flex items-center gap-1.5"
            >
              <Check className="w-4 h-4" />
              <span>{isSaving ? 'Saving...' : 'Update Activity'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

import React from 'react';
import { HeatmapDay } from '../types';

interface Props {
  data: HeatmapDay[];
}

export const HeatmapGrid: React.FC<Props> = ({ data }) => {
  // Organize days into weeks of 7 days
  const weeks: HeatmapDay[][] = [];
  let currentWeek: HeatmapDay[] = [];

  data.forEach((day, index) => {
    currentWeek.push(day);
    if (currentWeek.length === 7 || index === data.length - 1) {
      weeks.push(currentWeek);
      currentWeek = [];
    }
  });

  const getLevelColor = (level: number) => {
    switch (level) {
      case 4:
        return 'bg-[#a5b4fc] border-[#c7d2fe]'; // 13+ activities
      case 3:
        return 'bg-[#818cf8] border-[#818cf8]'; // 8-12
      case 2:
        return 'bg-[#6366f1] border-[#6366f1]'; // 4-7
      case 1:
        return 'bg-[#4338ca] border-[#4338ca]'; // 1-3
      default:
        return 'bg-[#182234] border-[#222e44]'; // 0
    }
  };

  const dayLabels = ['M', '', 'W', '', 'F', '', 'S'];

  return (
    <div className="bg-[#161f30] border border-[#233047] rounded-2xl p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h4 className="text-sm font-semibold text-white">Learning Consistency Heatmap</h4>
          <p className="text-xs text-slate-400">Contribution intensity across the last 16 weeks</p>
        </div>
        <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
          <span>Less</span>
          <div className="w-3 h-3 rounded-sm bg-[#182234] border border-[#222e44]" />
          <div className="w-3 h-3 rounded-sm bg-[#4338ca]" />
          <div className="w-3 h-3 rounded-sm bg-[#6366f1]" />
          <div className="w-3 h-3 rounded-sm bg-[#818cf8]" />
          <div className="w-3 h-3 rounded-sm bg-[#a5b4fc]" />
          <span>More</span>
        </div>
      </div>

      <div className="overflow-x-auto pb-2">
        <div className="flex gap-1.5 min-w-[500px]">
          {/* Day of week labels */}
          <div className="flex flex-col gap-1.5 pr-1 text-[10px] text-slate-500 font-medium">
            {dayLabels.map((lbl, idx) => (
              <div key={idx} className="w-3 h-3 flex items-center justify-center leading-none">
                {lbl}
              </div>
            ))}
          </div>

          {/* Weeks columns */}
          {weeks.map((week, wIdx) => (
            <div key={wIdx} className="flex flex-col gap-1.5">
              {week.map((day, dIdx) => (
                <div
                  key={dIdx}
                  title={`${day.date}: ${day.count} activities (${day.questions} questions, ${day.labs} labs)`}
                  className={`w-3.5 h-3.5 rounded-sm border ${getLevelColor(
                    day.level
                  )} transition-all hover:scale-125 cursor-pointer`}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

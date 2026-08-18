import React from 'react';
import { Sparkles, CornerDownRight } from 'lucide-react';

interface FollowUpChipsProps {
  suggestionsJson?: string;
  onSelect: (prompt: string) => void;
}

export const FollowUpChips: React.FC<FollowUpChipsProps> = ({ suggestionsJson, onSelect }) => {
  if (!suggestionsJson) return null;

  let suggestions: string[] = [];
  try {
    suggestions = JSON.parse(suggestionsJson);
  } catch {
    return null;
  }

  if (!Array.isArray(suggestions) || suggestions.length === 0) return null;

  return (
    <div className="mt-3.5 pt-2.5 border-t border-slate-100 dark:border-slate-800/80 flex flex-wrap gap-2 items-center animate-in fade-in">
      <div className="flex items-center gap-1 text-[11.5px] font-medium text-slate-400 dark:text-slate-500 mr-1 select-none">
        <Sparkles className="w-3.5 h-3.5 text-amber-500" />
        <span>建议追问:</span>
      </div>
      {suggestions.map((item, idx) => (
        <button
          key={idx}
          onClick={() => onSelect(item)}
          className="group flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 dark:bg-slate-800/80 hover:bg-emerald-50 dark:hover:bg-emerald-950/50 hover:text-emerald-700 dark:hover:text-emerald-300 hover:border-emerald-300 dark:hover:border-emerald-700/80 border border-slate-200/80 dark:border-slate-700/80 rounded-xl text-xs text-slate-600 dark:text-slate-300 transition-all text-left max-w-full truncate active:scale-95 shadow-2xs cursor-pointer"
        >
          <span className="truncate">{item}</span>
          <CornerDownRight className="w-3 h-3 text-slate-400 dark:text-slate-500 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 shrink-0 transition-colors" />
        </button>
      ))}
    </div>
  );
};

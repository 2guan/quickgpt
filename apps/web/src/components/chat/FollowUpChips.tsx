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
    <div className="mt-3.5 pt-2 border-t border-slate-100 flex flex-wrap gap-1.5 items-center">
      <div className="flex items-center gap-1 text-[11px] font-medium text-slate-400 mr-1">
        <Sparkles className="w-3 h-3 text-amber-500" />
        <span>建议追问:</span>
      </div>
      {suggestions.map((item, idx) => (
        <button
          key={idx}
          onClick={() => onSelect(item)}
          className="flex items-center gap-1 px-3 py-1.5 bg-slate-50 hover:bg-emerald-50 hover:text-emerald-800 hover:border-emerald-200 border border-slate-200/80 rounded-full text-xs text-slate-600 transition-all text-left max-w-full truncate active:scale-95 shadow-2xs"
        >
          <span className="truncate">{item}</span>
          <CornerDownRight className="w-3 h-3 text-slate-400 shrink-0" />
        </button>
      ))}
    </div>
  );
};

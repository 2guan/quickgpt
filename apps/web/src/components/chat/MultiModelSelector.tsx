import React, { useState, useRef, useEffect } from 'react';
import { useChatStore } from '../../stores/chatStore.js';
import { Bot, ChevronDown, Check, Sparkles, Image as ImageIcon, BrainCircuit, MessageSquareText } from 'lucide-react';

export const MultiModelSelector: React.FC = () => {
  const { models, selectedModelIds, toggleModelSelection } = useChatStore();
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'all' | 'text' | 'image'>('all');
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedModels = models.filter((m) => selectedModelIds.includes(m.model_id));
  const isImageGroupActive = selectedModels.some((m) => m.capabilities_json.includes('image'));

  const textModels = models.filter((m) => !m.capabilities_json.includes('image'));
  const imageModels = models.filter((m) => m.capabilities_json.includes('image'));

  const getCapabilityBadges = (capsJson: string) => {
    try {
      const caps: string[] = JSON.parse(capsJson || '[]');
      return (
        <div className="flex items-center gap-1">
          {caps.includes('reasoning') && (
            <span className="flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-medium bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 rounded border border-amber-200 dark:border-amber-800">
              <BrainCircuit className="w-2.5 h-2.5" /> 深度思考
            </span>
          )}
          {caps.includes('image') && (
            <span className="flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-medium bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 rounded border border-purple-200 dark:border-purple-800">
              <ImageIcon className="w-2.5 h-2.5" /> 绘画生图
            </span>
          )}
          {caps.includes('vision') && (
            <span className="flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-medium bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 rounded border border-blue-200 dark:border-blue-800">
              视觉
            </span>
          )}
        </div>
      );
    } catch {
      return null;
    }
  };

  return (
    <div className="relative inline-block text-left" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3.5 py-1.5 bg-slate-100/90 dark:bg-slate-800 hover:bg-slate-200/80 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 rounded-full text-sm font-medium transition-all shadow-sm border border-slate-200/60 dark:border-slate-700 active:scale-95"
      >
        {isImageGroupActive ? (
          <ImageIcon className="w-4 h-4 text-purple-600 dark:text-purple-400" />
        ) : (
          <Bot className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
        )}
        <span className="max-w-[180px] sm:max-w-[280px] truncate">
          {selectedModels.length === 0
            ? '选择模型'
            : selectedModels.length === 1
            ? selectedModels[0].display_name
            : `${selectedModels[0].display_name} + ${selectedModels.length - 1} 个对比`}
        </span>
        {selectedModels.length > 1 && (
          <span
            className={`px-1.5 py-0.2 rounded-full text-[11px] font-semibold ${
              isImageGroupActive
                ? 'bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300'
                : 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
            }`}
          >
            {isImageGroupActive ? '生图对比' : '文本对比'}
          </span>
        )}
        <ChevronDown className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
      </button>

      {isOpen && (
        <div className="absolute left-0 top-full mt-2 w-80 sm:w-96 bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200/80 dark:border-slate-800 p-2 z-50 animate-in fade-in zoom-in-95 duration-150 origin-top-left">
          {/* Header Bar */}
          <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 tracking-wide uppercase">
              选择模型 (同类最多选 4 个)
            </span>
            <span
              className={`text-xs font-semibold ${
                isImageGroupActive
                  ? 'text-purple-600 dark:text-purple-400'
                  : 'text-emerald-600 dark:text-emerald-400'
              }`}
            >
              已选 {selectedModelIds.length}/4 ({isImageGroupActive ? '绘画' : '文本'})
            </span>
          </div>

          {/* Type Filter Tabs */}
          <div className="flex gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl my-2 text-xs">
            <button
              onClick={() => setActiveTab('all')}
              className={`flex-1 py-1 px-2 rounded-lg font-medium transition-all ${
                activeTab === 'all'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-2xs'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              全部 ({models.length})
            </button>
            <button
              onClick={() => setActiveTab('text')}
              className={`flex-1 py-1 px-2 rounded-lg font-medium transition-all flex items-center justify-center gap-1 ${
                activeTab === 'text'
                  ? 'bg-white dark:bg-slate-700 text-emerald-700 dark:text-emerald-400 shadow-2xs font-semibold'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <MessageSquareText className="w-3 h-3" />
              文本 ({textModels.length})
            </button>
            <button
              onClick={() => setActiveTab('image')}
              className={`flex-1 py-1 px-2 rounded-lg font-medium transition-all flex items-center justify-center gap-1 ${
                activeTab === 'image'
                  ? 'bg-white dark:bg-slate-700 text-purple-700 dark:text-purple-400 shadow-2xs font-semibold'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <ImageIcon className="w-3 h-3" />
              生图 ({imageModels.length})
            </button>
          </div>

          {/* Model Lists */}
          <div className="max-h-80 overflow-y-auto py-1 space-y-3">
            {/* 1. Text Models Section */}
            {(activeTab === 'all' || activeTab === 'text') && textModels.length > 0 && (
              <div className="space-y-1">
                {activeTab === 'all' && (
                  <div className="px-2 py-1 flex items-center gap-1.5 text-[11px] font-bold text-slate-400 dark:text-slate-500 tracking-wider">
                    <MessageSquareText className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                    <span>文本与推理模型 ({textModels.length})</span>
                  </div>
                )}
                {textModels.map((model) => {
                  const isSelected = selectedModelIds.includes(model.model_id);
                  return (
                    <div
                      key={model.id}
                      onClick={() => toggleModelSelection(model.model_id)}
                      className={`flex items-center justify-between px-3 py-2.5 rounded-xl cursor-pointer transition-all ${
                        isSelected
                          ? 'bg-emerald-50/80 dark:bg-emerald-950/60 text-emerald-950 dark:text-emerald-100 border border-emerald-200/60 dark:border-emerald-800'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 border border-transparent'
                      }`}
                    >
                      <div className="flex flex-col min-w-0 pr-2">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-medium truncate">{model.display_name}</span>
                          {model.capabilities_json.includes('reasoning') && (
                            <Sparkles className="w-3 h-3 text-amber-500 shrink-0" />
                          )}
                        </div>
                        <div className="mt-1 flex items-center gap-1.5">
                          <span className="text-[11px] text-slate-400 dark:text-slate-500 truncate">{model.model_id}</span>
                          {getCapabilityBadges(model.capabilities_json)}
                        </div>
                      </div>

                      <div
                        className={`w-5 h-5 rounded-md flex items-center justify-center border transition-all shrink-0 ${
                          isSelected
                            ? 'bg-emerald-600 border-emerald-600 text-white'
                            : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800'
                        }`}
                      >
                        {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* 2. Image Models Section */}
            {(activeTab === 'all' || activeTab === 'image') && imageModels.length > 0 && (
              <div className="space-y-1">
                {activeTab === 'all' && (
                  <div className="px-2 py-1 flex items-center gap-1.5 text-[11px] font-bold text-slate-400 dark:text-slate-500 tracking-wider">
                    <ImageIcon className="w-3 h-3 text-purple-600 dark:text-purple-400" />
                    <span>绘画与生图模型 ({imageModels.length})</span>
                  </div>
                )}
                {imageModels.map((model) => {
                  const isSelected = selectedModelIds.includes(model.model_id);
                  return (
                    <div
                      key={model.id}
                      onClick={() => toggleModelSelection(model.model_id)}
                      className={`flex items-center justify-between px-3 py-2.5 rounded-xl cursor-pointer transition-all ${
                        isSelected
                          ? 'bg-purple-50/80 dark:bg-purple-950/60 text-purple-950 dark:text-purple-100 border border-purple-200/60 dark:border-purple-800'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 border border-transparent'
                      }`}
                    >
                      <div className="flex flex-col min-w-0 pr-2">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-medium truncate">{model.display_name}</span>
                          <span className="px-1.5 py-0.2 text-[10px] bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300 rounded font-semibold">
                            生图
                          </span>
                        </div>
                        <div className="mt-1 flex items-center gap-1.5">
                          <span className="text-[11px] text-slate-400 dark:text-slate-500 truncate">{model.model_id}</span>
                          {getCapabilityBadges(model.capabilities_json)}
                        </div>
                      </div>

                      <div
                        className={`w-5 h-5 rounded-md flex items-center justify-center border transition-all shrink-0 ${
                          isSelected
                            ? 'bg-purple-600 border-purple-600 text-white'
                            : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800'
                        }`}
                      >
                        {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {models.length === 0 && (
              <div className="text-center py-6 text-xs text-slate-400">暂无可用的模型</div>
            )}
          </div>

          <div className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-800 text-[10px] text-slate-400 dark:text-slate-500 text-center">
            * 提示：多选对比仅支持同类型（全部为文本或全部为生图）
          </div>
        </div>
      )}
    </div>
  );
};

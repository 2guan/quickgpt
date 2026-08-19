import React, { useEffect, useState } from 'react';
import { chatApi } from '../api/client.js';
import { Message } from '../types/index.js';
import { useThemeStore } from '../stores/themeStore.js';
import { useSettingsStore } from '../stores/settingsStore.js';
import { MarkdownRenderer } from '../components/chat/MarkdownRenderer.js';
import { Bot, User, Share2, Loader2, Sun, Moon, Sparkles, ChevronDown, ChevronRight } from 'lucide-react';

function hasPresentationEnabled(message: Message): boolean {
  try { return JSON.parse(message.image_params_json || '{}').presentation === true; } catch { return false; }
}

export const SharePage: React.FC<{ shareCode: string; onBackToHome: () => void }> = ({
  shareCode,
  onBackToHome,
}) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [title, setTitle] = useState('');
  const [createdAt, setCreatedAt] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [showReasoningMap, setShowReasoningMap] = useState<Record<string, boolean>>({});
  const { isDark, toggleTheme, initTheme } = useThemeStore();
  const { settings, fetchPublicSettings } = useSettingsStore();

  useEffect(() => {
    initTheme();
    fetchPublicSettings();
    async function loadShare() {
      try {
        const res = await chatApi.getShare(shareCode);
        setTitle(res.title);
        setCreatedAt(res.createdAt);
        setMessages(res.messages);
      } catch (err: any) {
        setError(err.message || '加载分享内容失败');
      } finally {
        setLoading(false);
      }
    }
    loadShare();
  }, [shareCode]);

  const toggleReasoning = (msgId: string) => {
    setShowReasoningMap((prev) => ({ ...prev, [msgId]: !(prev[msgId] ?? true) }));
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f8fafc] dark:bg-[#131316] transition-colors">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-emerald-600 dark:text-emerald-400" />
          <span className="text-sm text-slate-500 dark:text-slate-400">正在载入分享的对话...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f8fafc] dark:bg-[#131316] p-4 transition-colors">
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-8 max-w-md w-full text-center border border-slate-200 dark:border-slate-800 shadow-xl">
          <div className="w-12 h-12 rounded-2xl bg-red-50 dark:bg-red-950/60 text-red-600 dark:text-red-400 flex items-center justify-center mx-auto mb-4">
            <Share2 className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">分享链接失效</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 mb-6">{error}</p>
          <button
            onClick={onBackToHome}
            className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold shadow-xs transition-all active:scale-98"
          >
            返回首页
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8fafc] dark:bg-[#131316] text-slate-800 dark:text-slate-100 flex flex-col transition-colors duration-150">
      {/* Top Header */}
      <header className="h-14 bg-white/90 dark:bg-[#18181c]/90 backdrop-blur-md border-b border-slate-200/80 dark:border-slate-800 px-4 sm:px-8 flex items-center justify-between sticky top-0 z-20 shadow-2xs">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-emerald-600 text-white font-bold flex items-center justify-center text-xs shadow-xs">
            {settings.site_title ? settings.site_title.charAt(0).toUpperCase() : 'Q'}
          </div>
          <span className="font-bold text-slate-800 dark:text-slate-100 text-sm">
            {settings.site_title || 'QuickGPT'} 公开分享
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Theme Toggle Button */}
          <button
            onClick={toggleTheme}
            className="p-2 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-all active:scale-95"
            title={isDark ? '切换至亮色模式' : '切换至深色模式'}
          >
            {isDark ? (
              <Sun className="w-4 h-4 text-amber-400" />
            ) : (
              <Moon className="w-4 h-4 text-slate-600" />
            )}
          </button>

          <button
            onClick={onBackToHome}
            className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-full text-xs font-medium shadow-xs transition-all active:scale-95"
          >
            体验 {settings.site_title || 'QuickGPT'}
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-4xl mx-auto w-full p-4 sm:p-8 space-y-6">
        {/* Title Bar */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200/80 dark:border-slate-800 shadow-xs">
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">{title}</h1>
          <div className="mt-1 text-xs text-slate-400 dark:text-slate-500">
            分享时间: {new Date(createdAt).toLocaleString()}
          </div>
        </div>

        {/* Message Thread */}
        <div className="space-y-4">
          {messages.map((m, idx) => {
            const isReasoningOpen = showReasoningMap[m.id || idx] ?? true;
            return (
              <div
                key={m.id || idx}
                className={`p-4 sm:p-5 rounded-2xl border transition-all ${
                  m.role === 'user'
                    ? 'bg-slate-50 dark:bg-slate-800/70 border-slate-200/80 dark:border-slate-700'
                    : 'bg-white dark:bg-slate-900 border-slate-200/90 dark:border-slate-800 shadow-xs'
                }`}
              >
                <div className="flex items-center gap-2 mb-3">
                  {m.role === 'user' ? (
                    <div className="w-6 h-6 rounded-full bg-slate-800 dark:bg-emerald-700 text-white flex items-center justify-center text-xs">
                      <User className="w-3.5 h-3.5" />
                    </div>
                  ) : (
                    <div className="w-6 h-6 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 flex items-center justify-center text-xs">
                      <Bot className="w-3.5 h-3.5" />
                    </div>
                  )}
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    {m.role === 'user' ? '提问者' : m.model_id || 'AI 回答'}
                  </span>
                </div>

                {m.role === 'user' ? (
                  <div className="text-[14px] text-slate-800 dark:text-slate-100 whitespace-pre-wrap leading-relaxed">
                    {m.content}
                  </div>
                ) : (
                  <div>
                    {/* Reasoning Process */}
                    {m.reasoning_content && (
                      <div className="mb-3.5 rounded-xl bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200/70 dark:border-amber-900/50 p-3 text-xs">
                        <button
                          onClick={() => toggleReasoning(m.id || String(idx))}
                          className="w-full flex items-center justify-between text-amber-800 dark:text-amber-300 font-medium"
                        >
                          <div className="flex items-center gap-1.5">
                            <Sparkles className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                            <span>思考过程 (Reasoning Process)</span>
                          </div>
                          {isReasoningOpen ? (
                            <ChevronDown className="w-3.5 h-3.5" />
                          ) : (
                            <ChevronRight className="w-3.5 h-3.5" />
                          )}
                        </button>
                        {isReasoningOpen && (
                          <div className="mt-2.5 pt-2.5 border-t border-amber-200/50 dark:border-amber-900/40 text-slate-700 dark:text-slate-300 text-[13px] leading-relaxed">
                            <MarkdownRenderer content={m.reasoning_content} />
                          </div>
                        )}
                      </div>
                    )}

                    {/* Main content */}
                    {m.content && (
                      <div className="text-slate-800 dark:text-slate-100">
                        <MarkdownRenderer content={m.content} enablePptPreview={hasPresentationEnabled(m)} />
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
};

import React, { useEffect, useRef, useState } from 'react';
import { useChatStore } from '../stores/chatStore.js';
import { useAuthStore } from '../stores/authStore.js';
import { useSettingsStore } from '../stores/settingsStore.js';
import { chatApi } from '../api/client.js';
import { Sidebar } from '../components/chat/Sidebar.js';
import { Header } from '../components/chat/Header.js';
import { MessageItem } from '../components/chat/MessageItem.js';
import { MessageInput } from '../components/chat/MessageInput.js';
import { LoginModal, RegisterModal, ChangePasswordModal } from '../components/auth/AuthModals.js';
import { AdminLayout } from './admin/AdminLayout.js';
import { SharePage } from './SharePage.js';
import { Model, Message } from '../types/index.js';
import { Sparkles, ArrowDown, Bot, Copy, Check, X, Share2 } from 'lucide-react';

interface ChatPageProps {
  onOpenAdmin?: () => void;
}

export const ChatPage: React.FC<ChatPageProps> = ({ onOpenAdmin }) => {
  const {
    messages,
    fetchModels,
    fetchConversations,
    sendMessage,
    isStreaming,
    currentConversationId,
    selectedModelIds,
    models,
  } = useChatStore();

  const { user, checkAuth } = useAuthStore();
  const { settings } = useSettingsStore();

  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [isRegisterOpen, setIsRegisterOpen] = useState(false);
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);

  // Share Modal
  const [shareModalData, setShareModalData] = useState<{ url: string; code: string } | null>(null);
  const [copiedShare, setCopiedShare] = useState(false);

  const messageEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [showScrollBottom, setShowScrollBottom] = useState(false);

  // Initialize models and conversations
  useEffect(() => {
    checkAuth();
    fetchModels();
    if (user && user.role !== 'PENDING') {
      fetchConversations();
    }
  }, [user?.role]);

  // Scroll to bottom on streaming or new messages
  useEffect(() => {
    if (!showScrollBottom) {
      messageEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isStreaming]);

  const handleScroll = () => {
    if (!scrollContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
    const isUp = scrollHeight - scrollTop - clientHeight > 120;
    setShowScrollBottom(isUp);
  };

  const scrollToBottom = () => {
    messageEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    setShowScrollBottom(false);
  };

  const handleShareCurrent = async (convId?: string) => {
    const targetId = convId || currentConversationId;
    if (!targetId || messages.length === 0) {
      alert('当前对话暂无内容可供分享，请先发送一条消息。');
      return;
    }
    try {
      const res = await chatApi.createShare(targetId);
      const fullUrl = `${window.location.origin}/share/${res.shareCode}`;
      setShareModalData({ url: fullUrl, code: res.shareCode });
    } catch (err: any) {
      alert(err.message || '生成分享链接失败');
    }
  };

  // Check URL routing for /admin and /share/:code
  const path = window.location.pathname;
  if (path.startsWith('/admin')) {
    return <AdminLayout onBackToChat={() => (window.location.pathname = '/')} />;
  }

  const shareMatch = path.match(/^\/share\/([a-zA-Z0-9_-]+)/);
  if (shareMatch) {
    const shareCode = shareMatch[1];
    return <SharePage shareCode={shareCode} onBackToHome={() => (window.location.pathname = '/')} />;
  }

  // Group messages into turn pairs (User Msg + Multi-model Assistant Msgs)
  const groupedTurns = () => {
    const turns: Array<{ userMessage?: Message; assistantMessages: Message[] }> = [];
    let currentTurn: { userMessage?: Message; assistantMessages: Message[] } | null = null;

    for (const msg of messages) {
      if (msg.role === 'user') {
        if (currentTurn) turns.push(currentTurn);
        currentTurn = { userMessage: msg, assistantMessages: [] };
      } else if (msg.role === 'assistant') {
        if (!currentTurn) {
          currentTurn = { assistantMessages: [msg] };
        } else {
          currentTurn.assistantMessages.push(msg);
        }
      }
    }
    if (currentTurn) turns.push(currentTurn);
    return turns;
  };

  const groupedTurnList = groupedTurns();
  const activeModelsList = models.filter((m) => selectedModelIds.includes(m.model_id));

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-white dark:bg-[#131316] text-slate-800 dark:text-slate-100 transition-colors duration-150">
      {/* 1. Left Sidebar */}
      <Sidebar
        isMobileOpen={isMobileSidebarOpen}
        onCloseMobile={() => setIsMobileSidebarOpen(false)}
        onOpenLogin={() => setIsLoginOpen(true)}
        onOpenRegister={() => setIsRegisterOpen(true)}
        onOpenChangePassword={() => setIsChangePasswordOpen(true)}
        onNavigateAdmin={onOpenAdmin || (() => (window.location.pathname = '/admin'))}
        onShareConversation={(id: string) => handleShareCurrent(id)}
      />

      {/* 2. Main Chat Workspace */}
      <div className="flex-1 flex flex-col min-w-0 h-full relative bg-white dark:bg-[#131316]">
        {/* Top Header */}
        <Header
          onOpenMobileSidebar={() => setIsMobileSidebarOpen(true)}
          onShare={() => handleShareCurrent()}
        />

        {/* Messages Scroll Container */}
        <div
          ref={scrollContainerRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto px-4 sm:px-8 md:px-12 lg:px-16 py-6 relative bg-white dark:bg-[#131316]"
        >
          {messages.length === 0 ? (
            /* Welcome / Hero state */
            <div className="max-w-3xl mx-auto min-h-[60vh] flex flex-col items-center justify-center text-center px-4">
              {settings.welcome_logo || settings.site_logo ? (
                <div className="mb-4 flex items-center justify-center">
                  <img
                    src={settings.welcome_logo || settings.site_logo}
                    alt={settings.site_title || 'Logo'}
                    className="max-h-20 max-w-48 object-contain drop-shadow-xs select-none"
                  />
                </div>
              ) : (
                <div className="w-14 h-14 rounded-3xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 border border-emerald-200/80 dark:border-emerald-800 flex items-center justify-center mb-4 shadow-sm">
                  <Sparkles className="w-7 h-7 animate-pulse" />
                </div>
              )}

              <h1 className="text-2xl sm:text-3xl font-bold text-slate-800 dark:text-slate-100 tracking-tight">
                {settings.site_title ? `欢迎使用 ${settings.site_title}` : '今天有什么可以帮您？'}
              </h1>
              <p className="text-xs sm:text-sm text-slate-400 dark:text-slate-500 mt-1.5 mb-8">
                {settings.site_subtitle || '支持多模型并行对比、文档即时解析、LaTeX 数学公式与实时联网搜索'}
              </p>

              {/* Active models indicator */}
              <div className="flex flex-wrap justify-center gap-2 mb-8">
                {activeModelsList.map((m: Model) => (
                  <div
                    key={m.id}
                    className="flex items-center gap-1.5 px-3.5 py-1.5 bg-slate-100/90 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full text-xs font-semibold text-slate-700 dark:text-slate-200 shadow-2xs"
                  >
                    <Bot className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                    <span>{m.display_name}</span>
                  </div>
                ))}
              </div>

              {/* Prompt Suggestion Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 w-full text-left">
                {[
                  {
                    title: '解析数学公式与推导',
                    desc: '用 LaTeX 格式推导二次方程求根公式或贝叶斯定理',
                    prompt: '请用标准的 LaTeX 公式详细推导并证明二次方程的求根公式。',
                  },
                  {
                    title: 'Python 数据分析脚本',
                    desc: '编写一段 Pandas 清洗数据并生成统计汇总的代码',
                    prompt: '请用 Python 编写一段使用 Pandas 进行多维度分组聚合统计的高性能脚本。',
                  },
                  {
                    title: '多模型并行对比评测',
                    desc: '在顶部勾选多个模型，同屏对比生成质量与速度',
                    prompt: '请分别从逻辑思维、技术架构和用户体验三个维度分析微服务与单体架构的优缺点。',
                  },
                  {
                    title: '联网搜索最新动态',
                    desc: '开启输入栏左侧联网搜索，查询今日 AI 前沿技术突破',
                    prompt: '请联网检索并总结近期人工智能领域最新的开源大模型突破与技术发展。',
                  },
                ].map((item, idx) => (
                  <button
                    key={idx}
                    onClick={() => sendMessage(item.prompt)}
                    className="p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/80 hover:border-slate-300 dark:hover:border-slate-700 shadow-2xs transition-all text-xs group active:scale-[0.99]"
                  >
                    <div className="font-semibold text-slate-800 dark:text-slate-100 group-hover:text-emerald-700 dark:group-hover:text-emerald-400 transition-colors text-[13px]">
                      {item.title}
                    </div>
                    <div className="text-[11px] text-slate-400 dark:text-slate-500 mt-1 leading-relaxed">
                      {item.desc}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            /* Render Grouped Message Turns */
            <div className="space-y-6 pb-6 max-w-4xl lg:max-w-5xl mx-auto w-full">
              {groupedTurnList.map((turn, idx) => (
                <MessageItem
                  key={idx}
                  userMessage={turn.userMessage}
                  assistantMessages={turn.assistantMessages}
                  onFollowUpSelect={(text: string) => sendMessage(text)}
                />
              ))}
              <div ref={messageEndRef} />
            </div>
          )}

          {/* Floating Back to Bottom Button */}
          {showScrollBottom && (
            <button
              onClick={scrollToBottom}
              className="fixed bottom-24 right-6 sm:right-10 p-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white rounded-full shadow-lg transition-all active:scale-95 animate-in fade-in"
              title="回到底部"
            >
              <ArrowDown className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* 3. Bottom Single Unified Input Bar */}
        <MessageInput onSend={(text: string) => sendMessage(text)} />
      </div>

      {/* Auth Modals */}
      <LoginModal
        isOpen={isLoginOpen}
        onClose={() => setIsLoginOpen(false)}
        onSwitchToRegister={() => {
          setIsLoginOpen(false);
          setIsRegisterOpen(true);
        }}
      />
      <RegisterModal
        isOpen={isRegisterOpen}
        onClose={() => setIsRegisterOpen(false)}
        onSwitchToLogin={() => {
          setIsRegisterOpen(false);
          setIsLoginOpen(true);
        }}
      />
      <ChangePasswordModal
        isOpen={isChangePasswordOpen}
        onClose={() => setIsChangePasswordOpen(false)}
      />

      {/* Share Success Modal */}
      {shareModalData && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 max-w-md w-full border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                  <Share2 className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">对话公开分享链接已生成</h3>
              </div>
              <button
                onClick={() => setShareModalData(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              任何拥有此链接的人都可以查看此对话的当前快照。
            </p>

            <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800 p-2 rounded-xl border border-slate-200 dark:border-slate-700">
              <input
                type="text"
                readOnly
                value={shareModalData.url}
                className="bg-transparent text-xs text-slate-700 dark:text-slate-300 w-full outline-hidden truncate font-mono"
              />
              <button
                onClick={() => {
                  navigator.clipboard.writeText(shareModalData.url);
                  setCopiedShare(true);
                  setTimeout(() => setCopiedShare(false), 2000);
                }}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-medium shrink-0 flex items-center gap-1 shadow-2xs transition-all active:scale-95"
              >
                {copiedShare ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>已复制</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>复制</span>
                  </>
                )}
              </button>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <a
                href={shareModalData.url}
                target="_blank"
                rel="noreferrer"
                className="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-medium transition-all"
              >
                在新标签页中打开预览
              </a>
              <button
                onClick={() => setShareModalData(null)}
                className="px-4 py-2 bg-slate-900 dark:bg-emerald-600 hover:bg-slate-800 dark:hover:bg-emerald-500 text-white rounded-xl text-xs font-medium shadow-2xs transition-all"
              >
                完成
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

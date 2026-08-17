import React, { useState } from 'react';
import { useChatStore } from '../../stores/chatStore.js';
import { useAuthStore } from '../../stores/authStore.js';
import { useSettingsStore } from '../../stores/settingsStore.js';
import {
  Plus,
  Search,
  MessageSquare,
  Pin,
  Edit3,
  Trash2,
  Share2,
  LogOut,
  Shield,
  KeyRound,
  X,
} from 'lucide-react';

interface SidebarProps {
  isMobileOpen: boolean;
  onCloseMobile: () => void;
  onOpenLogin: () => void;
  onOpenRegister: () => void;
  onOpenChangePassword: () => void;
  onNavigateAdmin: () => void;
  onShareConversation: (convId: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  isMobileOpen,
  onCloseMobile,
  onOpenLogin,
  onOpenRegister,
  onOpenChangePassword,
  onNavigateAdmin,
  onShareConversation,
}) => {
  const {
    conversations,
    currentConversationId,
    selectConversation,
    createNewConversation,
    deleteConversation,
    updateConversationTitle,
    togglePinConversation,
  } = useChatStore();

  const { user, logout } = useAuthStore();
  const { settings } = useSettingsStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');

  // Filter conversations by title
  const filteredConversations = conversations.filter((c) =>
    c.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Group conversations: Pinned, Today, Previous 7 Days, Older
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const sevenDaysAgo = todayStart - 7 * 24 * 60 * 60 * 1000;

  const pinned = filteredConversations.filter((c) => c.is_pinned);
  const unpinned = filteredConversations.filter((c) => !c.is_pinned);

  const todayList = unpinned.filter((c) => new Date(c.updated_at).getTime() >= todayStart);
  const last7DaysList = unpinned.filter((c) => {
    const t = new Date(c.updated_at).getTime();
    return t < todayStart && t >= sevenDaysAgo;
  });
  const olderList = unpinned.filter((c) => new Date(c.updated_at).getTime() < sevenDaysAgo);

  const groupedConversations = [
    { title: '置顶对话', items: pinned },
    { title: '今天', items: todayList },
    { title: '最近 7 天', items: last7DaysList },
    { title: '更早历史', items: olderList },
  ].filter((g) => g.items.length > 0);

  const handleStartRename = (id: string, currentTitle: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(id);
    setEditingTitle(currentTitle);
  };

  const handleSaveRename = async (id: string) => {
    if (editingTitle.trim()) {
      await updateConversationTitle(id, editingTitle.trim());
    }
    setEditingId(null);
  };

  const getRoleChineseLabel = (role?: string) => {
    if (role === 'ADMIN') return '管理员';
    if (role === 'PENDING') return '待审核';
    return '普通用户';
  };

  return (
    <>
      {/* Mobile Backdrop */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-40 md:hidden backdrop-blur-xs transition-opacity"
          onClick={onCloseMobile}
        />
      )}

      <aside
        className={`fixed md:static inset-y-0 left-0 z-50 w-72 md:w-76 lg:w-80 bg-[#f9f9f9] dark:bg-slate-900 border-r border-slate-200/80 dark:border-slate-800 flex flex-col transition-transform duration-200 ease-in-out ${
          isMobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
      >
        {/* Top Header & New Chat Button */}
        <div className="p-4 space-y-3 border-b border-slate-200/60 dark:border-slate-800">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5 min-w-0">
              {settings.site_logo ? (
                <img
                  src={settings.site_logo}
                  alt={settings.site_title || 'Logo'}
                  className="w-8 h-8 rounded-xl object-contain shrink-0"
                />
              ) : (
                <div className="w-8 h-8 rounded-xl bg-emerald-600 flex items-center justify-center text-white font-bold shadow-sm shrink-0">
                  {(settings.site_title || 'Q').charAt(0).toUpperCase()}
                </div>
              )}
              <span className="font-semibold text-slate-800 dark:text-slate-100 tracking-tight text-base truncate">
                {settings.site_title || 'QuickGPT'}
              </span>
            </div>
            <button
              onClick={onCloseMobile}
              className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg md:hidden"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <button
            onClick={() => {
              createNewConversation();
              onCloseMobile();
            }}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 rounded-xl text-sm font-medium border border-slate-200/80 dark:border-slate-700 shadow-2xs hover:shadow-xs transition-all active:scale-[0.99]"
          >
            <Plus className="w-4 h-4 text-emerald-600" />
            <span>新建对话</span>
          </button>

          {/* Search Box */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              type="text"
              placeholder="搜索历史对话..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs bg-slate-100/80 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 focus:bg-white dark:focus:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-xl border border-transparent focus:border-slate-300 dark:focus:border-slate-600 focus:outline-hidden transition-all"
            />
          </div>
        </div>

        {/* Conversation List */}
        <div className="flex-1 overflow-y-auto px-3 py-3.5 space-y-4">
          {groupedConversations.length === 0 ? (
            <div className="text-center py-12 text-xs text-slate-400">
              {searchQuery ? '未搜到相关对话' : '暂无对话记录，点击上方新建'}
            </div>
          ) : (
            groupedConversations.map((group) => (
              <div key={group.title} className="space-y-1">
                <div className="px-2.5 py-1 text-[11px] font-semibold text-slate-400 dark:text-slate-500 tracking-wider">
                  {group.title}
                </div>
                {group.items.map((conv) => {
                  const isActive = currentConversationId === conv.id;
                  const isEditing = editingId === conv.id;

                  return (
                    <div
                      key={conv.id}
                      onClick={() => {
                        selectConversation(conv.id);
                        onCloseMobile();
                      }}
                      className={`group relative flex items-center justify-between px-3 py-2.5 rounded-xl text-xs cursor-pointer transition-all ${
                        isActive
                          ? 'bg-slate-200/70 dark:bg-slate-800 font-medium text-slate-900 dark:text-slate-100'
                          : 'hover:bg-slate-100 dark:hover:bg-slate-800/60 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0 flex-1 pr-1">
                        {conv.is_pinned ? (
                          <Pin className="w-3.5 h-3.5 text-emerald-600 shrink-0 rotate-45" />
                        ) : (
                          <MessageSquare className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        )}

                        {isEditing ? (
                          <input
                            type="text"
                            autoFocus
                            value={editingTitle}
                            onChange={(e) => setEditingTitle(e.target.value)}
                            onBlur={() => handleSaveRename(conv.id)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSaveRename(conv.id);
                              if (e.key === 'Escape') setEditingId(null);
                            }}
                            className="bg-white dark:bg-slate-800 border border-emerald-500 rounded px-1.5 py-0.5 text-xs text-slate-800 dark:text-slate-100 w-full outline-hidden"
                            onClick={(e) => e.stopPropagation()}
                          />
                        ) : (
                          <span className="truncate">{conv.title}</span>
                        )}
                      </div>

                      {/* Hover action buttons */}
                      {!isEditing && (
                        <div className="hidden group-hover:flex items-center gap-1 shrink-0 bg-transparent pl-1">
                          <button
                            title={conv.is_pinned ? '取消置顶' : '置顶'}
                            onClick={(e) => {
                              e.stopPropagation();
                              togglePinConversation(conv.id);
                            }}
                            className="p-1 hover:text-emerald-600 text-slate-400 rounded transition-colors"
                          >
                            <Pin className="w-3 h-3" />
                          </button>
                          <button
                            title="重命名"
                            onClick={(e) => handleStartRename(conv.id, conv.title, e)}
                            className="p-1 hover:text-slate-800 dark:hover:text-white text-slate-400 rounded transition-colors"
                          >
                            <Edit3 className="w-3 h-3" />
                          </button>
                          <button
                            title="分享"
                            onClick={(e) => {
                              e.stopPropagation();
                              onShareConversation(conv.id);
                            }}
                            className="p-1 hover:text-blue-600 text-slate-400 rounded transition-colors"
                          >
                            <Share2 className="w-3 h-3" />
                          </button>
                          <button
                            title="删除"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (confirm('确定要删除这条对话记录吗？')) {
                                deleteConversation(conv.id);
                              }
                            }}
                            className="p-1 hover:text-red-600 text-slate-400 rounded transition-colors"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>

        {/* Bottom User / Auth Card */}
        <div className="p-3.5 sm:p-4 border-t border-slate-200/80 dark:border-slate-800 bg-white/60 dark:bg-slate-900/60 backdrop-blur-xs">
          {user ? (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 font-bold flex items-center justify-center text-xs shrink-0 border border-emerald-300 dark:border-emerald-800">
                  {user.username.slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-slate-800 dark:text-slate-100 truncate">
                    {user.username}
                  </div>
                  <div className="text-[10px] text-slate-400 dark:text-slate-500 flex items-center gap-1">
                    <span className="px-1.5 py-0.2 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded text-[9px] font-medium border border-slate-200 dark:border-slate-700">
                      {getRoleChineseLabel(user.role)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-0.5">
                {user.role === 'ADMIN' && (
                  <button
                    onClick={onNavigateAdmin}
                    title="管理员后台"
                    className="p-1.5 text-slate-500 hover:text-emerald-700 dark:text-slate-400 dark:hover:text-emerald-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                  >
                    <Shield className="w-4 h-4" />
                  </button>
                )}

                <button
                  onClick={onOpenChangePassword}
                  title="修改密码"
                  className="p-1.5 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                >
                  <KeyRound className="w-4 h-4" />
                </button>

                <button
                  onClick={logout}
                  title="退出登录"
                  className="p-1.5 text-slate-500 hover:text-red-600 dark:text-slate-400 dark:hover:text-red-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={onOpenLogin}
                className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-medium transition-colors shadow-2xs text-center"
              >
                登录
              </button>
              <button
                onClick={onOpenRegister}
                className="flex-1 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-medium transition-colors text-center border border-slate-200 dark:border-slate-700"
              >
                注册
              </button>
            </div>
          )}
        </div>
      </aside>
    </>
  );
};

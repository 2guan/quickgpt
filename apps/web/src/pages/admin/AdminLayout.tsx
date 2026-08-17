import React, { useState, useEffect } from 'react';
import { adminApi } from '../../api/client.js';
import { useThemeStore } from '../../stores/themeStore.js';
import { useSettingsStore } from '../../stores/settingsStore.js';
import { SystemStats } from '../../types/index.js';
import { ChannelsTab } from './ChannelsTab.js';
import { ModelsTab } from './ModelsTab.js';
import { UsersTab } from './UsersTab.js';
import { AnalyticsTab } from './AnalyticsTab.js';
import { LogsTab } from './LogsTab.js';
import { MediaTab } from './MediaTab.js';
import { SettingsTab } from './SettingsTab.js';
import {
  Radio,
  Bot,
  Users,
  BarChart3,
  Activity,
  Image as ImageIcon,
  Settings,
  ArrowLeft,
  Coins,
  ShieldCheck,
  Hourglass,
  Menu,
  X,
  Sun,
  Moon,
} from 'lucide-react';

export const AdminLayout: React.FC<{ onBackToChat: () => void }> = ({ onBackToChat }) => {
  const [activeTab, setActiveTab] = useState<
    'channels' | 'models' | 'users' | 'analytics' | 'logs' | 'media' | 'settings'
  >('channels');
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { isDark, toggleTheme } = useThemeStore();
  const { settings } = useSettingsStore();

  useEffect(() => {
    async function loadStats() {
      try {
        const res = await adminApi.getStats();
        setStats(res);
      } catch {
        // ignore
      }
    }
    loadStats();
  }, [activeTab]);

  const navItems: Array<{
    id: 'channels' | 'models' | 'users' | 'analytics' | 'logs' | 'media' | 'settings';
    label: string;
    icon: any;
    badge?: number;
  }> = [
    { id: 'channels', label: '渠道管理', icon: Radio },
    { id: 'models', label: '模型管理', icon: Bot },
    { id: 'users', label: '人员管理', icon: Users, badge: stats?.pending_users },
    { id: 'analytics', label: '日志统计', icon: BarChart3 },
    { id: 'logs', label: '实时日志', icon: Activity },
    { id: 'media', label: '图片日志', icon: ImageIcon },
    { id: 'settings', label: '基础设置', icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-[#f8fafc] dark:bg-slate-950 flex flex-col md:flex-row text-slate-800 dark:text-slate-100 transition-colors">
      {/* Mobile Drawer Backdrop */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-40 md:hidden backdrop-blur-xs"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Admin Sidebar Navigation */}
      <aside
        className={`fixed md:static inset-y-0 left-0 z-50 w-64 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col justify-between transition-transform duration-200 shrink-0 ${
          isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
      >
        <div className="p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5 min-w-0">
              {settings.site_logo ? (
                <img
                  src={settings.site_logo}
                  alt="Admin Logo"
                  className="w-8 h-8 rounded-xl object-contain shadow-xs border border-emerald-500/20 shrink-0"
                />
              ) : (
                <div className="w-8 h-8 rounded-xl bg-slate-900 dark:bg-emerald-950 text-white flex items-center justify-center font-bold text-sm shadow-xs border border-emerald-500/20 shrink-0">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                </div>
              )}
              <div className="min-w-0">
                <h1 className="font-bold text-slate-900 dark:text-slate-100 text-sm truncate">
                  {settings.site_title ? `${settings.site_title} 控制台` : 'QuickGPT 控制台'}
                </h1>
                <p className="text-[10px] text-slate-400 truncate">
                  {settings.admin_subtitle || '系统综合管控中心'}
                </p>
              </div>
            </div>
            <button
              onClick={() => setIsMobileMenuOpen(false)}
              className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 md:hidden"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <nav className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setActiveTab(item.id);
                    setIsMobileMenuOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                    isActive
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Icon className="w-4 h-4" />
                    <span>{item.label}</span>
                  </div>
                  {item.badge && item.badge > 0 ? (
                    <span className="px-1.5 py-0.2 bg-amber-500 text-white rounded-full text-[10px] font-bold animate-pulse">
                      {item.badge}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Back to Chat Workspace Button */}
        <div className="p-4 border-t border-slate-100 dark:border-slate-800">
          <button
            onClick={onBackToChat}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-3 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 rounded-xl text-xs font-semibold transition-all active:scale-98"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>返回用户对话视窗</span>
          </button>
        </div>
      </aside>

      {/* Main Admin Workspace Area */}
      <main className="flex-1 flex flex-col min-w-0 w-full">
        {/* Top Header & Stats Overview Bar */}
        <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 p-4 sm:p-6 space-y-4 w-full">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsMobileMenuOpen(true)}
                className="p-1.5 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg md:hidden"
              >
                <Menu className="w-5 h-5" />
              </button>
              <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100">
                {navItems.find((n) => n.id === activeTab)?.label}
              </h2>
            </div>

            <div className="flex items-center gap-2">
              {/* Theme toggle button in admin */}
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
                onClick={onBackToChat}
                className="flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 md:hidden"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>回到对话</span>
              </button>
            </div>
          </div>

          {/* Metrics Overview Cards */}
          {stats && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 w-full">
              <div className="bg-slate-50 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700 rounded-2xl p-3.5 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 flex items-center justify-center shrink-0">
                  <Coins className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-[11px] font-medium text-slate-400 dark:text-slate-500">今日 Token 消耗</div>
                  <div className="text-base font-bold text-slate-800 dark:text-slate-100">
                    {stats.total_tokens_today.toLocaleString()}
                  </div>
                </div>
              </div>

              <div className="bg-slate-50 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700 rounded-2xl p-3.5 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-400 flex items-center justify-center shrink-0">
                  <Radio className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-[11px] font-medium text-slate-400 dark:text-slate-500">在线活跃渠道</div>
                  <div className="text-base font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    {stats.active_channels} 个
                  </div>
                </div>
              </div>

              <div className="bg-slate-50 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700 rounded-2xl p-3.5 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 flex items-center justify-center shrink-0">
                  <Hourglass className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-[11px] font-medium text-slate-400 dark:text-slate-500">待审核注册用户</div>
                  <div className="text-base font-bold text-amber-600 dark:text-amber-400">
                    {stats.pending_users} 人
                  </div>
                </div>
              </div>

              <div className="bg-slate-50 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700 rounded-2xl p-3.5 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-400 flex items-center justify-center shrink-0">
                  <Users className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-[11px] font-medium text-slate-400 dark:text-slate-500">全站总用户数</div>
                  <div className="text-base font-bold text-slate-800 dark:text-slate-100">
                    {stats.total_users} 人
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Tab Content Body - Full Width */}
        <div className="flex-1 p-4 sm:p-6 overflow-y-auto w-full">
          {activeTab === 'channels' && <ChannelsTab />}
          {activeTab === 'models' && <ModelsTab />}
          {activeTab === 'users' && <UsersTab />}
          {activeTab === 'analytics' && <AnalyticsTab />}
          {activeTab === 'logs' && <LogsTab />}
          {activeTab === 'media' && <MediaTab />}
          {activeTab === 'settings' && <SettingsTab />}
        </div>
      </main>
    </div>
  );
};

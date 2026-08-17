import React from 'react';
import { useChatStore } from '../../stores/chatStore.js';
import { useThemeStore } from '../../stores/themeStore.js';
import { MultiModelSelector } from './MultiModelSelector.js';
import { Menu, Share2, Plus, Sun, Moon } from 'lucide-react';

interface HeaderProps {
  onOpenMobileSidebar: () => void;
  onShare: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onOpenMobileSidebar, onShare }) => {
  const { createNewConversation } = useChatStore();
  const { isDark, toggleTheme } = useThemeStore();

  return (
    <header className="h-14 border-b border-slate-200/80 dark:border-slate-800 bg-white/90 dark:bg-[#18181c]/90 backdrop-blur-md px-3 sm:px-4 flex items-center justify-between sticky top-0 z-30 transition-colors">
      {/* Left section: Hamburger on mobile + Model Selector */}
      <div className="flex items-center gap-2">
        <button
          onClick={onOpenMobileSidebar}
          className="p-2 -ml-1 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl md:hidden transition-colors"
          title="打开侧边栏"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Model Selector pill */}
        <MultiModelSelector />
      </div>

      {/* Right controls: Share button, Theme switch, New chat */}
      <div className="flex items-center gap-1.5 sm:gap-2">
        {/* Share Button (Always preserved in top right) */}
        <button
          onClick={onShare}
          className="p-2 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-all active:scale-95 flex items-center gap-1.5"
          title="分享此对话"
        >
          <Share2 className="w-4 h-4" />
          <span className="text-xs font-medium hidden sm:inline">分享</span>
        </button>

        {/* Theme Switch Button in Top Right */}
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

        {/* Mobile New Chat quick button */}
        <button
          onClick={() => createNewConversation()}
          className="p-2 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full md:hidden transition-all active:scale-95"
          title="新建对话"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};

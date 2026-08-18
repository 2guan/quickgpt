import React, { useEffect, useState } from 'react';
import { useAuthStore } from './stores/authStore.js';
import { useThemeStore } from './stores/themeStore.js';
import { useSettingsStore } from './stores/settingsStore.js';
import { ChatPage } from './pages/ChatPage.js';
import { AdminLayout } from './pages/admin/AdminLayout.js';
import { PendingApprovalPage } from './pages/PendingApprovalPage.js';
import { SharePage } from './pages/SharePage.js';
import { LoginModal, RegisterModal } from './components/auth/AuthModals.js';
import { Loader2 } from 'lucide-react';

export const App: React.FC = () => {
  const { user, isInitialChecked, checkAuth } = useAuthStore();
  const { initTheme } = useThemeStore();
  const { fetchPublicSettings } = useSettingsStore();
  const [isAdminView, setIsAdminView] = useState(false);
  const [shareCode, setShareCode] = useState<string | null>(null);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false);

  useEffect(() => {
    initTheme();
    fetchPublicSettings();

    // Check if path is /share/:code
    const path = window.location.pathname;
    if (path.startsWith('/share/')) {
      const code = path.replace('/share/', '').trim();
      if (code) {
        setShareCode(code);
        return;
      }
    }

    // Check if path is /admin
    if (path === '/admin') {
      setIsAdminView(true);
    }

    checkAuth();
  }, []);

  // Show Share Page if visiting public share URL
  if (shareCode) {
    return (
      <SharePage
        shareCode={shareCode}
        onBackToHome={() => {
          setShareCode(null);
          window.history.pushState({}, '', '/');
        }}
      />
    );
  }

  // Loading initial auth
  if (!isInitialChecked) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-white dark:bg-slate-900">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-emerald-600 text-white flex items-center justify-center font-bold text-lg shadow-sm">
            Q
          </div>
          <Loader2 className="w-5 h-5 animate-spin text-emerald-600" />
        </div>
      </div>
    );
  }

  // If user is not logged in, show clean standalone Login / Register screen
  if (!user) {
    return (
      <div className="h-screen w-screen bg-[#f8fafc] dark:bg-[#131316] flex items-center justify-center p-4 transition-colors">
        {!isRegisterModalOpen ? (
          <LoginModal
            isOpen={true}
            onClose={() => {}}
            onSwitchToRegister={() => setIsRegisterModalOpen(true)}
          />
        ) : (
          <RegisterModal
            isOpen={true}
            onClose={() => setIsRegisterModalOpen(false)}
            onSwitchToLogin={() => setIsRegisterModalOpen(false)}
          />
        )}
      </div>
    );
  }

  // If user role is PENDING (待审核)
  if (user.role === 'PENDING') {
    return <PendingApprovalPage />;
  }

  // If Admin View activated and user is ADMIN
  if (isAdminView && user.role === 'ADMIN') {
    return (
      <AdminLayout
        onBackToChat={() => {
          setIsAdminView(false);
          window.history.pushState({}, '', '/');
        }}
      />
    );
  }

  // Normal Chat Workspace
  return (
    <ChatPage
      onOpenAdmin={() => {
        setIsAdminView(true);
        window.history.pushState({}, '', '/admin');
      }}
    />
  );
};

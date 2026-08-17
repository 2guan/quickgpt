import { create } from 'zustand';
import { adminApi } from '../api/client.js';

interface SettingsState {
  settings: Record<string, string>;
  isLoading: boolean;
  fetchPublicSettings: () => Promise<void>;
  updateLocalSettings: (newSettings: Record<string, string>) => void;
}

const DEFAULT_SETTINGS: Record<string, string> = {
  site_title: 'QuickGPT',
  site_subtitle: '极速、强大的多模型 AI 对话与创作平台',
  admin_subtitle: '系统综合管控中心',
  site_logo: '',
  welcome_logo: '',
  site_footer: '© 2026 QuickGPT. All rights reserved.',
  registration_mode: 'OPEN',
};

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: DEFAULT_SETTINGS,
  isLoading: false,

  fetchPublicSettings: async () => {
    try {
      set({ isLoading: true });
      const res = await adminApi.getPublicSettings();
      const merged = { ...DEFAULT_SETTINGS, ...(res.settings || {}) };
      set({ settings: merged, isLoading: false });

      if (merged.site_title) {
        document.title = merged.site_title;
      }
    } catch {
      set({ isLoading: false });
    }
  },

  updateLocalSettings: (newSettings: Record<string, string>) => {
    const current = get().settings;
    const merged = { ...current, ...newSettings };
    set({ settings: merged });
    if (merged.site_title) {
      document.title = merged.site_title;
    }
  },
}));

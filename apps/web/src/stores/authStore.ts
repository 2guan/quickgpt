import { create } from 'zustand';
import { User } from '../types/index.js';
import { authApi } from '../api/client.js';

interface AuthState {
  user: User | null;
  isLoading: boolean;
  isInitialChecked: boolean;
  login: (data: any) => Promise<User>;
  register: (data: any) => Promise<User>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
  setUser: (user: User | null) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isLoading: false,
  isInitialChecked: false,

  checkAuth: async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        set({ user: null, isInitialChecked: true });
        return;
      }
      const res = await authApi.me();
      set({ user: res.user, isInitialChecked: true });
    } catch {
      localStorage.removeItem('token');
      set({ user: null, isInitialChecked: true });
    }
  },

  login: async (data: any) => {
    set({ isLoading: true });
    try {
      const res = await authApi.login(data);
      localStorage.setItem('token', res.token);
      set({ user: res.user, isLoading: false });
      return res.user;
    } catch (err) {
      set({ isLoading: false });
      throw err;
    }
  },

  register: async (data: any) => {
    set({ isLoading: true });
    try {
      const res = await authApi.register(data);
      if (res.token) {
        localStorage.setItem('token', res.token);
      }
      set({ user: res.user, isLoading: false });
      return res.user;
    } catch (err) {
      set({ isLoading: false });
      throw err;
    }
  },

  logout: async () => {
    try {
      await authApi.logout();
    } catch {
      // ignore
    }
    localStorage.removeItem('token');
    set({ user: null });
  },

  setUser: (user: User | null) => set({ user }),
}));

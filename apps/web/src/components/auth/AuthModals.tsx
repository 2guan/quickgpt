import React, { useState } from 'react';
import { useAuthStore } from '../../stores/authStore.js';
import { useSettingsStore } from '../../stores/settingsStore.js';
import { authApi } from '../../api/client.js';
import { X, Lock, User as UserIcon, Mail, Loader2, KeyRound } from 'lucide-react';

export const LoginModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onSwitchToRegister: () => void;
}> = ({ isOpen, onClose, onSwitchToRegister }) => {
  const { login } = useAuthStore();
  const { settings } = useSettingsStore();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login({ username, password });
      onClose();
    } catch (err: any) {
      setError(err.message || '登录失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 w-full max-w-md shadow-2xl border border-slate-200 dark:border-slate-800 animate-in fade-in zoom-in-95 duration-150 relative">
        <button
          onClick={onClose}
          className="absolute top-5 right-5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="text-center mb-6">
          {settings.site_logo ? (
            <img
              src={settings.site_logo}
              alt="Site Logo"
              className="w-12 h-12 rounded-2xl object-contain mx-auto mb-3"
            />
          ) : (
            <div className="w-12 h-12 rounded-2xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 flex items-center justify-center mx-auto mb-3 font-bold text-xl">
              {(settings.site_title || 'Q').charAt(0).toUpperCase()}
            </div>
          )}
          <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">
            欢迎登录 {settings.site_title || 'QuickGPT'}
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">登录以开始与多模型智能交互</p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 rounded-xl text-xs border border-red-200 dark:border-red-800">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">用户名</label>
            <div className="relative">
              <UserIcon className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="请输入用户名"
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded-xl text-sm focus:bg-white dark:focus:bg-slate-800 focus:border-emerald-500 focus:outline-hidden transition-all"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">密码</label>
            <div className="relative">
              <Lock className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="请输入密码"
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded-xl text-sm focus:bg-white dark:focus:bg-slate-800 focus:border-emerald-500 focus:outline-hidden transition-all"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-slate-900 dark:bg-emerald-600 hover:bg-slate-800 dark:hover:bg-emerald-500 text-white rounded-xl font-medium text-sm transition-all shadow-md active:scale-98 flex items-center justify-center gap-2"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            <span>登录</span>
          </button>
        </form>

        <div className="text-center mt-5 text-xs text-slate-500 dark:text-slate-400">
          还没有账号？{' '}
          <button
            onClick={onSwitchToRegister}
            className="text-emerald-600 dark:text-emerald-400 font-semibold hover:underline"
          >
            立即注册
          </button>
        </div>
      </div>
    </div>
  );
};

export const RegisterModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onSwitchToLogin: () => void;
}> = ({ isOpen, onClose, onSwitchToLogin }) => {
  const { register } = useAuthStore();
  const { settings } = useSettingsStore();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await register({ username, password, email });
      onClose();
    } catch (err: any) {
      setError(err.message || '注册失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 w-full max-w-md shadow-2xl border border-slate-200 dark:border-slate-800 animate-in fade-in zoom-in-95 duration-150 relative">
        <button
          onClick={onClose}
          className="absolute top-5 right-5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="text-center mb-6">
          {settings.site_logo ? (
            <img
              src={settings.site_logo}
              alt="Site Logo"
              className="w-12 h-12 rounded-2xl object-contain mx-auto mb-3"
            />
          ) : (
            <div className="w-12 h-12 rounded-2xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 flex items-center justify-center mx-auto mb-3 font-bold text-xl">
              {(settings.site_title || 'Q').charAt(0).toUpperCase()}
            </div>
          )}
          <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">
            注册 {settings.site_title || 'QuickGPT'} 新账号
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">注册后默认进入待审核状态，管理员审批后即可畅享</p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 rounded-xl text-xs border border-red-200 dark:border-red-800">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">用户名</label>
            <div className="relative">
              <UserIcon className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="2-32 位字符"
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded-xl text-sm focus:bg-white dark:focus:bg-slate-800 focus:border-emerald-500 focus:outline-hidden transition-all"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">电子邮箱 (选填)</label>
            <div className="relative">
              <Mail className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="用于接收审核通知"
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded-xl text-sm focus:bg-white dark:focus:bg-slate-800 focus:border-emerald-500 focus:outline-hidden transition-all"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">密码</label>
            <div className="relative">
              <Lock className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="至少 6 位密码"
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded-xl text-sm focus:bg-white dark:focus:bg-slate-800 focus:border-emerald-500 focus:outline-hidden transition-all"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-medium text-sm transition-all shadow-md active:scale-98 flex items-center justify-center gap-2"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            <span>注册账号</span>
          </button>
        </form>

        <div className="text-center mt-5 text-xs text-slate-500 dark:text-slate-400">
          已有账号？{' '}
          <button
            onClick={onSwitchToLogin}
            className="text-emerald-600 dark:text-emerald-400 font-semibold hover:underline"
          >
            直接登录
          </button>
        </div>
      </div>
    </div>
  );
};

export const ChangePasswordModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
}> = ({ isOpen, onClose }) => {
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (newPassword !== confirmPassword) {
      setError('两次输入的新密码不一致');
      return;
    }
    if (newPassword.length < 6) {
      setError('新密码至少 6 位');
      return;
    }

    setLoading(true);
    try {
      const res = await authApi.changePassword({ oldPassword, newPassword });
      setSuccess(res.message || '密码修改成功');
      setTimeout(() => {
        onClose();
      }, 1200);
    } catch (err: any) {
      setError(err.message || '修改失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 w-full max-w-md shadow-2xl border border-slate-200 dark:border-slate-800 animate-in fade-in zoom-in-95 duration-150 relative">
        <button
          onClick={onClose}
          className="absolute top-5 right-5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="text-center mb-6">
          <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 flex items-center justify-center mx-auto mb-3">
            <KeyRound className="w-6 h-6" />
          </div>
          <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">修改密码</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">请妥善保管您的登录密码</p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 rounded-xl text-xs border border-red-200 dark:border-red-800">
            {error}
          </div>
        )}
        {success && (
          <div className="mb-4 p-3 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 rounded-xl text-xs border border-emerald-200 dark:border-emerald-800">
            {success}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">原密码</label>
            <input
              type="password"
              required
              value={oldPassword}
              onChange={(e) => setOldPassword(e.target.value)}
              placeholder="请输入当前原密码"
              className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded-xl text-sm focus:bg-white dark:focus:bg-slate-800 focus:border-emerald-500 focus:outline-hidden transition-all"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">新密码</label>
            <input
              type="password"
              required
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="至少 6 位新密码"
              className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded-xl text-sm focus:bg-white dark:focus:bg-slate-800 focus:border-emerald-500 focus:outline-hidden transition-all"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">确认新密码</label>
            <input
              type="password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="再次输入新密码"
              className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded-xl text-sm focus:bg-white dark:focus:bg-slate-800 focus:border-emerald-500 focus:outline-hidden transition-all"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-slate-900 dark:bg-emerald-600 hover:bg-slate-800 dark:hover:bg-emerald-500 text-white rounded-xl font-medium text-sm transition-all shadow-md active:scale-98 flex items-center justify-center gap-2"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            <span>确认修改</span>
          </button>
        </form>
      </div>
    </div>
  );
};

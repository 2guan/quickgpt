import React, { useEffect, useState } from 'react';
import { useAuthStore } from '../stores/authStore.js';
import { Hourglass, CheckCircle2, Circle, RefreshCw, LogOut } from 'lucide-react';

export const PendingApprovalPage: React.FC = () => {
  const { user, checkAuth, logout } = useAuthStore();
  const [countdown, setCountdown] = useState(15);
  const [isChecking, setIsChecking] = useState(false);

  // Auto-polling every 15 seconds
  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          handleCheckStatus();
          return 15;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const handleCheckStatus = async () => {
    setIsChecking(true);
    try {
      await checkAuth();
    } finally {
      setIsChecking(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-lg bg-white rounded-3xl p-8 sm:p-10 shadow-xl border border-slate-200/80 text-center relative animate-in fade-in zoom-in-95 duration-200">
        {/* Hourglass Icon */}
        <div className="w-16 h-16 rounded-3xl bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center mx-auto mb-5 shadow-xs">
          <Hourglass className="w-8 h-8 animate-pulse" />
        </div>

        {/* Title & Badge */}
        <h1 className="text-2xl font-bold text-slate-800 tracking-tight">账号正在审核中</h1>
        <div className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 bg-amber-50 border border-amber-200 text-amber-700 rounded-full text-xs font-semibold">
          <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
          待管理员批准授权
        </div>

        {/* Step Progress Timeline */}
        <div className="mt-8 mb-6 px-4">
          <div className="flex items-center justify-between relative">
            {/* Background Line */}
            <div className="absolute left-0 top-1/2 -translate-y-1/2 w-full h-1 bg-slate-100 -z-0" />
            <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1/2 h-1 bg-emerald-500 -z-0" />

            {/* Step 1: Created */}
            <div className="relative z-10 flex flex-col items-center bg-white px-2">
              <CheckCircle2 className="w-6 h-6 text-emerald-600 fill-emerald-100" />
              <span className="text-[11px] font-medium text-slate-700 mt-1.5">账号已注册</span>
            </div>

            {/* Step 2: Under Review */}
            <div className="relative z-10 flex flex-col items-center bg-white px-2">
              <div className="w-6 h-6 rounded-full bg-amber-500 text-white flex items-center justify-center text-xs font-bold ring-4 ring-amber-100">
                2
              </div>
              <span className="text-[11px] font-semibold text-amber-700 mt-1.5">审核中</span>
            </div>

            {/* Step 3: Activated */}
            <div className="relative z-10 flex flex-col items-center bg-white px-2">
              <Circle className="w-6 h-6 text-slate-300 fill-slate-50" />
              <span className="text-[11px] font-medium text-slate-400 mt-1.5">开启畅聊</span>
            </div>
          </div>
        </div>

        {/* Informative description */}
        <p className="text-xs text-slate-500 leading-relaxed mb-6">
          您的账号已成功创建。为了保障系统资源和服务安全，新注册用户需等待管理员在后台审批通过后方可正式使用。审核通过后系统将自动为您开通全功能权限。
        </p>

        {/* User Info Details Pill */}
        <div className="p-3.5 bg-slate-50 border border-slate-200/80 rounded-2xl text-left text-xs text-slate-600 mb-6 space-y-1.5">
          <div className="flex justify-between">
            <span className="text-slate-400">用户名:</span>
            <span className="font-semibold text-slate-800">{user?.username}</span>
          </div>
          {user?.email && (
            <div className="flex justify-between">
              <span className="text-slate-400">联系邮箱:</span>
              <span className="font-medium text-slate-700">{user.email}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-slate-400">申请状态:</span>
            <span className="text-amber-600 font-medium">审批队列中</span>
          </div>
        </div>

        {/* Auto Refresh indicator & Countdown */}
        <div className="text-xs text-slate-400 mb-6 flex items-center justify-center gap-1.5">
          <RefreshCw className={`w-3.5 h-3.5 ${isChecking ? 'animate-spin text-emerald-600' : ''}`} />
          <span>{countdown} 秒后自动同步审核结果</span>
        </div>

        {/* Buttons */}
        <div className="flex gap-3">
          <button
            onClick={handleCheckStatus}
            disabled={isChecking}
            className="flex-1 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold shadow-sm transition-all active:scale-98 flex items-center justify-center gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isChecking ? 'animate-spin' : ''}`} />
            <span>立即检查状态</span>
          </button>
          <button
            onClick={logout}
            className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition-all active:scale-98 flex items-center gap-1.5"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>退出</span>
          </button>
        </div>
      </div>
    </div>
  );
};

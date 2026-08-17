import React, { useState, useEffect } from 'react';
import { adminApi } from '../../api/client.js';
import { AnalyticsData } from '../../types/index.js';
import {
  Activity,
  Zap,
  TrendingUp,
  Clock,
  Users,
  Image as ImageIcon,
  CheckCircle2,
  AlertTriangle,
  RotateCw,
  BarChart3,
  Bot,
  Layers,
  Award,
  Calendar,
} from 'lucide-react';

export const AnalyticsTab: React.FC = () => {
  const [timeRange, setTimeRange] = useState<'today' | '7d' | '30d' | 'all'>('7d');
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchAnalytics = async () => {
    setLoading(true);
    try {
      const res = await adminApi.getAnalytics(timeRange);
      setData(res);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
  }, [timeRange]);

  const summary = data?.summary || {
    total_requests: 0,
    success_requests: 0,
    success_rate: '100%',
    total_tokens: 0,
    total_prompt_tokens: 0,
    total_completion_tokens: 0,
    avg_duration_ms: 0,
    active_users: 0,
    total_images: 0,
  };

  const dailyTrends = data?.dailyTrends || [];
  const topModels = data?.topModels || [];
  const channels = data?.channelDistribution || [];
  const topUsers = data?.topUsers || [];
  const statusDist = data?.statusDistribution || [];

  // Calculate maximum values for relative bar chart scaling
  const maxDailyRequests = Math.max(...dailyTrends.map((d) => d.requests), 1);
  const maxModelCalls = Math.max(...topModels.map((m) => m.call_count), 1);
  const maxUserCalls = Math.max(...topUsers.map((u) => u.request_count), 1);

  return (
    <div className="space-y-6 animate-in fade-in duration-150">
      {/* Top Header & Range Filter */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-2xs">
        <div>
          <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            <span>日志数据统计与分析 (Analytics)</span>
          </h2>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
            监控系统请求流量、Token 吞吐、渠道健康度及用户活跃分布
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Time Range Selector */}
          <div className="flex items-center p-1 bg-slate-100 dark:bg-slate-800 rounded-xl text-xs font-medium border border-slate-200/60 dark:border-slate-700">
            {(
              [
                { key: 'today', label: '今天' },
                { key: '7d', label: '近 7 天' },
                { key: '30d', label: '近 30 天' },
                { key: 'all', label: '全部时间' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.key}
                onClick={() => setTimeRange(tab.key)}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  timeRange === tab.key
                    ? 'bg-white dark:bg-slate-700 text-emerald-700 dark:text-emerald-400 shadow-2xs font-semibold'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <button
            onClick={fetchAnalytics}
            disabled={loading}
            title="刷新数据"
            className="p-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-xl transition-all active:scale-95 disabled:opacity-50 border border-slate-200/60 dark:border-slate-700"
          >
            <RotateCw className={`w-4 h-4 ${loading ? 'animate-spin text-emerald-600' : ''}`} />
          </button>
        </div>
      </div>

      {/* 6 Key Performance Indicator Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3.5">
        {/* Total Requests */}
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
            <span className="text-xs font-medium">总请求数</span>
            <div className="w-7 h-7 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <Activity className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-2xl font-black text-slate-900 dark:text-slate-100 tracking-tight">
              {summary.total_requests.toLocaleString()}
            </div>
            <div className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-1 flex items-center gap-1 font-medium">
              <CheckCircle2 className="w-3 h-3" />
              <span>成功 {summary.success_requests}</span>
            </div>
          </div>
        </div>

        {/* Success Rate */}
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
            <span className="text-xs font-medium">请求成功率</span>
            <div className="w-7 h-7 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400 tracking-tight">
              {summary.success_rate}
            </div>
            <div className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
              异常 {summary.total_requests - summary.success_requests} 次
            </div>
          </div>
        </div>

        {/* Total Tokens */}
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
            <span className="text-xs font-medium">总 Token 吞吐</span>
            <div className="w-7 h-7 rounded-lg bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 flex items-center justify-center">
              <Zap className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-2xl font-black text-slate-900 dark:text-slate-100 tracking-tight">
              {summary.total_tokens > 1000000
                ? `${(summary.total_tokens / 1000000).toFixed(2)}M`
                : summary.total_tokens > 1000
                ? `${(summary.total_tokens / 1000).toFixed(1)}k`
                : summary.total_tokens}
            </div>
            <div className="text-[11px] text-slate-400 dark:text-slate-500 mt-1 truncate">
              提示 {(summary.total_prompt_tokens / 1000).toFixed(1)}k / 生成 {(summary.total_completion_tokens / 1000).toFixed(1)}k
            </div>
          </div>
        </div>

        {/* Avg Latency */}
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
            <span className="text-xs font-medium">平均响应耗时</span>
            <div className="w-7 h-7 rounded-lg bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-2xl font-black text-slate-900 dark:text-slate-100 tracking-tight">
              {summary.avg_duration_ms > 1000
                ? `${(summary.avg_duration_ms / 1000).toFixed(2)}s`
                : `${summary.avg_duration_ms}ms`}
            </div>
            <div className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
              单次流式端到端延迟
            </div>
          </div>
        </div>

        {/* Active Users */}
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
            <span className="text-xs font-medium">活跃用户数</span>
            <div className="w-7 h-7 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-2xl font-black text-slate-900 dark:text-slate-100 tracking-tight">
              {summary.active_users}
            </div>
            <div className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
              区间内发起调用的用户
            </div>
          </div>
        </div>

        {/* Generated Images */}
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
            <span className="text-xs font-medium">AI 绘画生图</span>
            <div className="w-7 h-7 rounded-lg bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center justify-center">
              <ImageIcon className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-2xl font-black text-slate-900 dark:text-slate-100 tracking-tight">
              {summary.total_images}
            </div>
            <div className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
              画作与多媒体文件
            </div>
          </div>
        </div>
      </div>

      {/* Main Charts Row: Trend vs Top Models */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Daily Activity Trend (2 cols) */}
        <div className="lg:col-span-2 bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-2xs">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">
                请求量与 Token 消耗趋势
              </h3>
            </div>
            <span className="text-xs text-slate-400 dark:text-slate-500">
              {dailyTrends.length} 个时间节点
            </span>
          </div>

          {dailyTrends.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-xs text-slate-400">
              当前时间区间暂无调用记录
            </div>
          ) : (
            <div className="space-y-3 pt-2">
              {dailyTrends.map((trend) => {
                const reqPercent = Math.min(100, Math.max(6, (trend.requests / maxDailyRequests) * 100));
                return (
                  <div key={trend.date} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-mono text-slate-600 dark:text-slate-300 font-medium">
                        {trend.date}
                      </span>
                      <div className="flex items-center gap-3 text-[11px]">
                        <span className="font-semibold text-slate-800 dark:text-slate-200">
                          {trend.requests} 次请求
                        </span>
                        <span className="text-purple-600 dark:text-purple-400">
                          {(trend.tokens / 1000).toFixed(1)}k Tokens
                        </span>
                        <span className="text-slate-400 dark:text-slate-500">
                          均耗 {Math.round(trend.avg_duration)}ms
                        </span>
                      </div>
                    </div>
                    {/* Bar visualization */}
                    <div className="w-full h-3 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden flex">
                      <div
                        className="bg-emerald-500 dark:bg-emerald-400 h-full rounded-full transition-all duration-500"
                        style={{ width: `${reqPercent}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Top Models Distribution (1 col) */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-2xs">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Bot className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">
                模型调用热度榜 (Top 10)
              </h3>
            </div>
          </div>

          {topModels.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-xs text-slate-400">
              暂无模型调用数据
            </div>
          ) : (
            <div className="space-y-3">
              {topModels.map((m, idx) => {
                const percent = Math.min(100, Math.max(5, (m.call_count / maxModelCalls) * 100));
                return (
                  <div key={m.model_id} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1.5 min-w-0 max-w-[65%]">
                        <span className="w-4 text-center font-bold text-[10px] text-slate-400">
                          #{idx + 1}
                        </span>
                        <span className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                          {m.model_id}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                        {m.call_count} 次 ({((m.call_count / summary.total_requests) * 100).toFixed(0)}%)
                      </div>
                    </div>
                    <div className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className="bg-blue-500 h-full rounded-full transition-all duration-500"
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Second Row: Channel Distribution vs User Leaderboard vs Status Distribution */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Channel Health & Distribution */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-2xs">
          <div className="flex items-center gap-2 mb-4">
            <Layers className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">
              渠道负载与成功率
            </h3>
          </div>

          {channels.length === 0 ? (
            <div className="h-40 flex items-center justify-center text-xs text-slate-400">
              暂无渠道调度数据
            </div>
          ) : (
            <div className="space-y-3">
              {channels.map((ch) => {
                const total = ch.call_count || 1;
                const succRate = ((ch.success_count / total) * 100).toFixed(0);
                return (
                  <div
                    key={ch.channel_id}
                    className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60 space-y-1.5"
                  >
                    <div className="flex items-center justify-between text-xs font-semibold text-slate-800 dark:text-slate-200">
                      <span>{ch.channel_name}</span>
                      <span className="text-emerald-600 dark:text-emerald-400">{succRate}% 成功</span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-slate-400 dark:text-slate-500">
                      <span>调用: {ch.call_count} 次</span>
                      <span>异常: {ch.error_count} 次</span>
                      <span>均延: {Math.round(ch.avg_duration)}ms</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* User Leaderboard */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-2xs">
          <div className="flex items-center gap-2 mb-4">
            <Award className="w-4 h-4 text-amber-500" />
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">
              用户活跃排行榜 (Top 10)
            </h3>
          </div>

          {topUsers.length === 0 ? (
            <div className="h-40 flex items-center justify-center text-xs text-slate-400">
              暂无用户调用数据
            </div>
          ) : (
            <div className="space-y-2.5">
              {topUsers.map((u, idx) => (
                <div
                  key={u.username}
                  className="flex items-center justify-between p-2 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors text-xs"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className={`w-5 h-5 rounded-full flex items-center justify-center font-bold text-[10px] ${
                        idx === 0
                          ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                          : idx === 1
                          ? 'bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-200'
                          : idx === 2
                          ? 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300'
                          : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                      }`}
                    >
                      {idx + 1}
                    </span>
                    <span className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                      {u.username}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-[11px] text-slate-500 dark:text-slate-400">
                    <span>{u.request_count} 次</span>
                    <span className="text-purple-600 dark:text-purple-400">
                      {(u.total_tokens / 1000).toFixed(1)}k
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* HTTP Status Code Distribution */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-2xs">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className="w-4 h-4 text-rose-500" />
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">
              响应状态码分布
            </h3>
          </div>

          {statusDist.length === 0 ? (
            <div className="h-40 flex items-center justify-center text-xs text-slate-400">
              暂无状态码统计
            </div>
          ) : (
            <div className="space-y-3">
              {statusDist.map((item) => {
                const is200 = item.status_code === 200;
                return (
                  <div
                    key={item.status_code}
                    className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60 text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={`px-2 py-0.5 rounded font-mono font-bold text-[11px] ${
                          is200
                            ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
                            : 'bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300'
                        }`}
                      >
                        HTTP {item.status_code}
                      </span>
                      <span className="text-slate-600 dark:text-slate-300 font-medium">
                        {is200 ? '正常成功响应' : '调用异常 / 故障转移'}
                      </span>
                    </div>
                    <span className="font-bold text-slate-800 dark:text-slate-200">
                      {item.count} 次
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

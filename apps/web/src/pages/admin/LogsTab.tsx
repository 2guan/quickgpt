import React, { useState, useEffect, useRef } from 'react';
import { adminApi } from '../../api/client.js';
import { AuditLog } from '../../types/index.js';
import {
  Search,
  RotateCw,
  Clock,
  Zap,
  CheckCircle2,
  AlertCircle,
  Filter,
  Download,
  Trash2,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  X,
  Eye,
  Globe,
  Radio,
} from 'lucide-react';

export const LogsTab: React.FC = () => {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const pageSize = 30;

  // Filter State
  const [search, setSearch] = useState('');
  const [modelFilter, setModelFilter] = useState('');
  const [userFilter, setUserFilter] = useState('');
  const [channelFilter, setChannelFilter] = useState('');
  const [statusType, setStatusType] = useState<'all' | 'success' | 'error'>('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Sorting State
  const [sortBy, setSortBy] = useState<'created_at' | 'duration_ms' | 'prompt_tokens' | 'completion_tokens' | 'status_code'>('created_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Available filter options returned from backend
  const [filterOptions, setFilterOptions] = useState<{
    models: string[];
    users: string[];
    channels: Array<{ id: string; name: string }>;
  }>({ models: [], users: [], channels: [] });

  // Auto-refresh state
  const [autoRefresh, setAutoRefresh] = useState(false);
  const autoRefreshTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Selected Log for detail modal
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const res = await adminApi.getLogs({
        search,
        modelId: modelFilter,
        username: userFilter,
        channelId: channelFilter,
        statusType,
        startDate,
        endDate,
        sortBy,
        sortOrder,
        limit: pageSize,
        offset: (page - 1) * pageSize,
      });

      setLogs(res.items || []);
      setTotal(res.total || 0);
      if (res.filters) {
        setFilterOptions(res.filters);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [page, modelFilter, userFilter, channelFilter, statusType, startDate, endDate, sortBy, sortOrder]);

  // Handle Auto Refresh
  useEffect(() => {
    if (autoRefresh) {
      autoRefreshTimerRef.current = setInterval(() => {
        fetchLogs();
      }, 5000);
    } else {
      if (autoRefreshTimerRef.current) clearInterval(autoRefreshTimerRef.current);
    }
    return () => {
      if (autoRefreshTimerRef.current) clearInterval(autoRefreshTimerRef.current);
    };
  }, [autoRefresh, page, modelFilter, userFilter, channelFilter, statusType, sortBy, sortOrder]);

  const handleSort = (column: typeof sortBy) => {
    if (sortBy === column) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortOrder('desc');
    }
  };

  const handleResetFilters = () => {
    setSearch('');
    setModelFilter('');
    setUserFilter('');
    setChannelFilter('');
    setStatusType('all');
    setStartDate('');
    setEndDate('');
    setPage(1);
  };

  const handleExportCSV = () => {
    if (logs.length === 0) {
      alert('当前无日志可导出');
      return;
    }
    const headers = ['ID', '请求时间', '用户', '模型', '渠道', '状态码', '总耗时(ms)', 'Prompt Tokens', 'Completion Tokens', 'IP', '错误信息'];
    const csvRows = [headers.join(',')];

    for (const l of logs) {
      const row = [
        l.id,
        l.created_at,
        `"${l.username}"`,
        `"${l.model_id}"`,
        `"${l.channel_name || l.channel_id}"`,
        l.status_code,
        l.duration_ms,
        l.prompt_tokens,
        l.completion_tokens,
        `"${l.ip}"`,
        `"${(l.error_message || '').replace(/"/g, '""')}"`,
      ];
      csvRows.push(row.join(','));
    }

    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `quickgpt_audit_logs_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  const handleClearOldLogs = async () => {
    const days = prompt('请输入清理多少天前的旧日志（默认 30 天）：', '30');
    if (!days) return;
    const numDays = parseInt(days, 10);
    if (isNaN(numDays) || numDays < 1) {
      alert('请输入有效天数');
      return;
    }
    try {
      const res = await adminApi.clearLogs(numDays);
      alert(res.message);
      fetchLogs();
    } catch (err: any) {
      alert(err.message || '清理日志失败');
    }
  };

  const totalPages = Math.ceil(total / pageSize) || 1;

  const renderSortIcon = (column: typeof sortBy) => {
    if (sortBy !== column) return <ArrowUpDown className="w-3 h-3 text-slate-400 opacity-60" />;
    return sortOrder === 'asc' ? (
      <ArrowUp className="w-3 h-3 text-emerald-600" />
    ) : (
      <ArrowDown className="w-3 h-3 text-emerald-600" />
    );
  };

  return (
    <div className="space-y-4 animate-in fade-in duration-150">
      {/* Top Header & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-2xs">
        <div>
          <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <Clock className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            <span>实时审计日志 (Real-time Logs)</span>
          </h2>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
            记录每一次模型调用、Token 消耗、响应延迟及故障转移详情（共 {total} 条日志）
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Auto Refresh Toggle */}
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border transition-all ${
              autoRefresh
                ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700 shadow-2xs'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'
            }`}
          >
            <Radio className={`w-3.5 h-3.5 ${autoRefresh ? 'text-emerald-600 animate-pulse' : ''}`} />
            <span>{autoRefresh ? '自动刷新中 (5s)' : '开启实时轮询'}</span>
          </button>

          <button
            onClick={fetchLogs}
            disabled={loading}
            className="p-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-xl transition-all active:scale-95 disabled:opacity-50 border border-slate-200/60 dark:border-slate-700"
            title="手动刷新"
          >
            <RotateCw className={`w-4 h-4 ${loading ? 'animate-spin text-emerald-600' : ''}`} />
          </button>

          <button
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-medium border border-slate-200 dark:border-slate-700 transition-all active:scale-95"
            title="导出为 CSV"
          >
            <Download className="w-3.5 h-3.5 text-slate-500" />
            <span>导出 CSV</span>
          </button>

          <button
            onClick={handleClearOldLogs}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/60 text-rose-700 dark:text-rose-300 rounded-xl text-xs font-medium border border-rose-200/80 dark:border-rose-800/80 transition-all active:scale-95"
            title="清理旧日志"
          >
            <Trash2 className="w-3.5 h-3.5 text-rose-500" />
            <span>清理日志</span>
          </button>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-2xs space-y-3">
        <div className="flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-300">
          <div className="flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5 text-emerald-600" />
            <span>多维条件筛选</span>
          </div>
          <button
            onClick={handleResetFilters}
            className="text-xs text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 font-medium hover:underline"
          >
            重置所有筛选
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2.5">
          {/* Keyword Search */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              type="text"
              placeholder="搜索用户/模型/IP..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') fetchLogs();
              }}
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-slate-200 outline-hidden focus:border-emerald-500"
            />
          </div>

          {/* Model Filter */}
          <select
            value={modelFilter}
            onChange={(e) => {
              setModelFilter(e.target.value);
              setPage(1);
            }}
            className="w-full px-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-slate-200 outline-hidden"
          >
            <option value="">全部模型 ({filterOptions.models.length})</option>
            {filterOptions.models.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>

          {/* User Filter */}
          <select
            value={userFilter}
            onChange={(e) => {
              setUserFilter(e.target.value);
              setPage(1);
            }}
            className="w-full px-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-slate-200 outline-hidden"
          >
            <option value="">全部用户 ({filterOptions.users.length})</option>
            {filterOptions.users.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>

          {/* Channel Filter */}
          <select
            value={channelFilter}
            onChange={(e) => {
              setChannelFilter(e.target.value);
              setPage(1);
            }}
            className="w-full px-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-slate-200 outline-hidden"
          >
            <option value="">全部渠道 ({filterOptions.channels.length})</option>
            {filterOptions.channels.map((ch) => (
              <option key={ch.id} value={ch.id}>
                {ch.name}
              </option>
            ))}
          </select>

          {/* Status Type Filter */}
          <select
            value={statusType}
            onChange={(e) => {
              setStatusType(e.target.value as any);
              setPage(1);
            }}
            className="w-full px-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-slate-200 outline-hidden"
          >
            <option value="all">全部调用状态</option>
            <option value="success">✅ 仅成功 (HTTP 200)</option>
            <option value="error">❌ 仅异常报错</option>
          </select>

          {/* Date Picker Start */}
          <input
            type="date"
            value={startDate}
            onChange={(e) => {
              setStartDate(e.target.value);
              setPage(1);
            }}
            className="w-full px-2.5 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-slate-200 outline-hidden"
            title="开始日期"
          />
        </div>
      </div>

      {/* Logs Table with Column Sorting */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600 dark:text-slate-300">
            <thead className="bg-slate-50/90 dark:bg-slate-800/90 border-b border-slate-200/80 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-semibold select-none">
              <tr>
                <th
                  onClick={() => handleSort('created_at')}
                  className="px-4 py-3 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700/60 transition-colors"
                >
                  <div className="flex items-center gap-1.5">
                    <span>请求时间</span>
                    {renderSortIcon('created_at')}
                  </div>
                </th>
                <th className="px-4 py-3">用户</th>
                <th className="px-4 py-3">模型标识</th>
                <th className="px-4 py-3">调度渠道</th>
                <th
                  onClick={() => handleSort('status_code')}
                  className="px-4 py-3 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700/60 transition-colors"
                >
                  <div className="flex items-center gap-1.5">
                    <span>状态</span>
                    {renderSortIcon('status_code')}
                  </div>
                </th>
                <th
                  onClick={() => handleSort('duration_ms')}
                  className="px-4 py-3 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700/60 transition-colors"
                >
                  <div className="flex items-center gap-1.5">
                    <span>耗时</span>
                    {renderSortIcon('duration_ms')}
                  </div>
                </th>
                <th
                  onClick={() => handleSort('prompt_tokens')}
                  className="px-4 py-3 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700/60 transition-colors"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Token 消耗</span>
                    {renderSortIcon('prompt_tokens')}
                  </div>
                </th>
                <th className="px-4 py-3 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-12 text-slate-400 text-xs">
                    {loading ? '正在加载日志...' : '未查询到符合条件的调用日志'}
                  </td>
                </tr>
              ) : (
                logs.map((log) => {
                  const isSuccess = log.status_code === 200;
                  const totalTokens = log.prompt_tokens + log.completion_tokens;

                  return (
                    <tr
                      key={log.id}
                      onClick={() => setSelectedLog(log)}
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors cursor-pointer"
                    >
                      {/* Created At */}
                      <td className="px-4 py-3 font-mono text-[11px] text-slate-500 dark:text-slate-400 whitespace-nowrap">
                        {new Date(log.created_at).toLocaleString()}
                      </td>

                      {/* Username */}
                      <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-200">
                        {log.username || '-'}
                      </td>

                      {/* Model ID */}
                      <td className="px-4 py-3 font-mono text-[11px] text-slate-700 dark:text-slate-300">
                        <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                          {log.model_id}
                        </span>
                      </td>

                      {/* Channel Name */}
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-400 text-[11px]">
                        {log.channel_name || log.channel_id || '-'}
                      </td>

                      {/* Status Code */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            isSuccess
                              ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                              : 'bg-red-50 dark:bg-red-950/60 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800'
                          }`}
                        >
                          {isSuccess ? <CheckCircle2 className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
                          {log.status_code}
                        </span>
                      </td>

                      {/* Latency Duration */}
                      <td className="px-4 py-3 font-mono text-[11px] text-slate-600 dark:text-slate-300 whitespace-nowrap">
                        {log.duration_ms > 1000 ? `${(log.duration_ms / 1000).toFixed(2)}s` : `${log.duration_ms}ms`}
                      </td>

                      {/* Token Consumption */}
                      <td className="px-4 py-3 font-mono text-[11px] text-slate-600 dark:text-slate-300 whitespace-nowrap">
                        {totalTokens > 0 ? (
                          <span className="text-purple-600 dark:text-purple-400 font-semibold">
                            {totalTokens.toLocaleString()}
                          </span>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>

                      {/* View details */}
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedLog(log);
                          }}
                          className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 hover:text-slate-800 dark:hover:text-white rounded-lg transition-colors"
                          title="查看详情"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        <div className="p-3.5 border-t border-slate-200/80 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 bg-slate-50/50 dark:bg-slate-900/50">
          <div>
            显示第 {(page - 1) * pageSize + 1} 至 {Math.min(page * pageSize, total)} 条，共 {total} 条
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1 || loading}
              className="px-3 py-1 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-40 rounded-lg border border-slate-200 dark:border-slate-700 transition-colors"
            >
              上一页
            </button>
            <span className="px-2 font-mono">
              {page} / {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages || loading}
              className="px-3 py-1 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-40 rounded-lg border border-slate-200 dark:border-slate-700 transition-colors"
            >
              下一页
            </button>
          </div>
        </div>
      </div>

      {/* Log Detail Drawer / Modal */}
      {selectedLog && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 max-w-lg w-full border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <div
                  className={`w-7 h-7 rounded-lg flex items-center justify-center ${
                    selectedLog.status_code === 200
                      ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400'
                      : 'bg-red-100 dark:bg-red-950 text-red-600 dark:text-red-400'
                  }`}
                >
                  {selectedLog.status_code === 200 ? (
                    <CheckCircle2 className="w-4 h-4" />
                  ) : (
                    <AlertCircle className="w-4 h-4" />
                  )}
                </div>
                <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">
                  调用审计详情 (HTTP {selectedLog.status_code})
                </h3>
              </div>
              <button
                onClick={() => setSelectedLog(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2.5 text-xs text-slate-700 dark:text-slate-300">
              <div className="grid grid-cols-2 gap-2 bg-slate-50 dark:bg-slate-800/60 p-3 rounded-xl border border-slate-200/60 dark:border-slate-700">
                <div>
                  <span className="text-slate-400 text-[11px] block">日志 ID</span>
                  <span className="font-mono font-medium">{selectedLog.id}</span>
                </div>
                <div>
                  <span className="text-slate-400 text-[11px] block">客户端 IP</span>
                  <span className="font-mono">{selectedLog.ip || '127.0.0.1'}</span>
                </div>
                <div>
                  <span className="text-slate-400 text-[11px] block">请求发起用户</span>
                  <span className="font-semibold">{selectedLog.username || '匿名'}</span>
                </div>
                <div>
                  <span className="text-slate-400 text-[11px] block">请求时间戳</span>
                  <span className="font-mono">{new Date(selectedLog.created_at).toLocaleString()}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 bg-slate-50 dark:bg-slate-800/60 p-3 rounded-xl border border-slate-200/60 dark:border-slate-700">
                <div>
                  <span className="text-slate-400 text-[11px] block">模型标识 (Model ID)</span>
                  <span className="font-mono text-emerald-600 font-semibold">{selectedLog.model_id}</span>
                </div>
                <div>
                  <span className="text-slate-400 text-[11px] block">命中渠道 (Channel)</span>
                  <span className="font-medium">{selectedLog.channel_name || selectedLog.channel_id || '-'}</span>
                </div>
                <div>
                  <span className="text-slate-400 text-[11px] block">流式端到端耗时</span>
                  <span className="font-mono font-semibold">{selectedLog.duration_ms} ms</span>
                </div>
                <div>
                  <span className="text-slate-400 text-[11px] block">Token 消耗详情</span>
                  <span className="font-mono text-purple-600 dark:text-purple-400 font-semibold">
                    {selectedLog.prompt_tokens + selectedLog.completion_tokens} (Prompt: {selectedLog.prompt_tokens} / Comp: {selectedLog.completion_tokens})
                  </span>
                </div>
              </div>

              {selectedLog.error_message && (
                <div className="bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 p-3 rounded-xl space-y-1">
                  <span className="text-red-700 dark:text-red-400 font-semibold block text-[11px]">
                    异常报错 / 故障转移信息
                  </span>
                  <div className="font-mono text-[11px] text-red-600 dark:text-red-300 break-words whitespace-pre-wrap">
                    {selectedLog.error_message}
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setSelectedLog(null)}
                className="px-4 py-2 bg-slate-900 dark:bg-slate-100 hover:bg-slate-800 dark:hover:bg-white text-white dark:text-slate-900 rounded-xl text-xs font-semibold shadow-2xs transition-all"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

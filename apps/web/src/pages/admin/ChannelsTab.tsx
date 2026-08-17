import React, { useState, useEffect } from 'react';
import { adminApi } from '../../api/client.js';
import { Channel } from '../../types/index.js';
import {
  Plus,
  CheckCircle2,
  XCircle,
  Loader2,
  Trash2,
  Edit2,
  Check,
  X,
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  RotateCw,
  Zap,
  Globe,
  Layers,
} from 'lucide-react';

export const ChannelsTab: React.FC = () => {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { success: boolean; latencyMs: number; message: string }>>({});
  const [isBatchTesting, setIsBatchTesting] = useState(false);

  // Filters & Sorting
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | '1' | '0'>('all');
  const [sortBy, setSortBy] = useState<'priority' | 'name' | 'status' | 'type' | 'created_at'>('priority');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Edit / Add modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingChannel, setEditingChannel] = useState<Partial<Channel> | null>(null);

  // Sync models modal
  const [syncModalOpen, setSyncModalOpen] = useState(false);
  const [syncingChannelId, setSyncingChannelId] = useState<string | null>(null);
  const [syncedModels, setSyncedModels] = useState<string[]>([]);
  const [selectedSyncModels, setSelectedSyncModels] = useState<string[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);

  const fetchChannels = async () => {
    setLoading(true);
    try {
      const res = await adminApi.getChannels();
      setChannels(res.channels || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchChannels();
  }, []);

  const handleSort = (column: typeof sortBy) => {
    if (sortBy === column) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortOrder('desc');
    }
  };

  const handleTestConnection = async (id: string) => {
    setTestingId(id);
    try {
      const res = await adminApi.testChannel(id);
      setTestResults((prev) => ({ ...prev, [id]: res }));
    } catch (err: any) {
      setTestResults((prev) => ({
        ...prev,
        [id]: { success: false, latencyMs: 0, message: err.message },
      }));
    } finally {
      setTestingId(null);
    }
  };

  const handleBatchTestAll = async () => {
    setIsBatchTesting(true);
    for (const ch of channels) {
      if (ch.status) {
        await handleTestConnection(ch.id);
      }
    }
    setIsBatchTesting(false);
  };

  const handleOpenSync = async (id: string) => {
    setSyncingChannelId(id);
    setSyncModalOpen(true);
    setIsSyncing(true);
    try {
      const res = await adminApi.syncChannelModels(id);
      setSyncedModels(res.models || []);
      setSelectedSyncModels(res.models || []);
    } catch (err: any) {
      alert(`拉取模型失败: ${err.message}`);
      setSyncModalOpen(false);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleBatchImport = async () => {
    if (!syncingChannelId || selectedSyncModels.length === 0) return;
    try {
      const res = await adminApi.batchImportModels(syncingChannelId, selectedSyncModels);
      alert(`成功导入/同步 ${res.importedCount} 个模型！`);
      setSyncModalOpen(false);
    } catch (err: any) {
      alert(`导入失败: ${err.message}`);
    }
  };

  const handleSaveChannel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingChannel) return;

    try {
      if (editingChannel.id) {
        await adminApi.updateChannel(editingChannel.id, editingChannel);
      } else {
        await adminApi.createChannel(editingChannel);
      }
      setIsModalOpen(false);
      setEditingChannel(null);
      fetchChannels();
    } catch (err: any) {
      alert(`保存失败: ${err.message}`);
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm('确定删除此渠道？关联的模型将失去此渠道供应。')) {
      await adminApi.deleteChannel(id);
      fetchChannels();
    }
  };

  // Filter & Sort Channels
  const filteredAndSortedChannels = channels
    .filter((c) => {
      if (typeFilter && c.type !== typeFilter) return false;
      if (statusFilter !== 'all' && String(c.status) !== statusFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        const matchName = c.name.toLowerCase().includes(q);
        const matchUrl = c.base_url.toLowerCase().includes(q);
        if (!matchName && !matchUrl) return false;
      }
      return true;
    })
    .sort((a, b) => {
      let valA: any = a[sortBy] || '';
      let valB: any = b[sortBy] || '';
      if (sortBy === 'priority' || sortBy === 'status') {
        valA = Number(valA);
        valB = Number(valB);
      }
      if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

  const renderSortIcon = (col: typeof sortBy) => {
    if (sortBy !== col) return <ArrowUpDown className="w-3 h-3 text-slate-400 opacity-60" />;
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
            <Layers className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            <span>渠道管理 (Channels & Failover)</span>
          </h2>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
            配置上游 API 提供商与网关通道，按优先级自动多路故障转移（共 {channels.length} 个渠道）
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleBatchTestAll}
            disabled={isBatchTesting || channels.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-medium border border-slate-200 dark:border-slate-700 transition-all active:scale-95 disabled:opacity-50"
            title="一键测速全部可用渠道"
          >
            <Zap className={`w-3.5 h-3.5 text-amber-500 ${isBatchTesting ? 'animate-bounce' : ''}`} />
            <span>{isBatchTesting ? '批量测速中...' : '全部测速'}</span>
          </button>

          <button
            onClick={() => {
              setEditingChannel({
                name: '',
                base_url: 'https://api.openai.com/v1',
                api_key: '',
                type: 'openai',
                priority: 10,
                status: 1,
              });
              setIsModalOpen(true);
            }}
            className="flex items-center gap-2 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold shadow-2xs transition-all active:scale-95"
          >
            <Plus className="w-4 h-4" />
            <span>添加新渠道</span>
          </button>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-2xs flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            type="text"
            placeholder="搜索渠道名称或接口地址..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-slate-200 outline-hidden focus:border-emerald-500"
          />
        </div>

        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="px-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-slate-200 outline-hidden"
        >
          <option value="">全部渠道协议</option>
          <option value="openai">OpenAI 兼容</option>
          <option value="anthropic">Claude / Anthropic</option>
          <option value="gemini">Google Gemini</option>
          <option value="deepseek">DeepSeek 官方</option>
          <option value="custom">自定义中转</option>
        </select>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as any)}
          className="px-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-slate-200 outline-hidden"
        >
          <option value="all">全部运行状态</option>
          <option value="1">✅ 启用中</option>
          <option value="0">⏸️ 已停用</option>
        </select>

        {(search || typeFilter || statusFilter !== 'all') && (
          <button
            onClick={() => {
              setSearch('');
              setTypeFilter('');
              setStatusFilter('all');
            }}
            className="text-xs text-emerald-600 font-medium hover:underline px-2"
          >
            重置筛选
          </button>
        )}
      </div>

      {/* Channels Table with Column Sorting */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600 dark:text-slate-300">
            <thead className="bg-slate-50/90 dark:bg-slate-800/90 border-b border-slate-200/80 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-semibold select-none">
              <tr>
                <th
                  onClick={() => handleSort('name')}
                  className="px-4 py-3 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700/60 transition-colors"
                >
                  <div className="flex items-center gap-1.5">
                    <span>渠道名称</span>
                    {renderSortIcon('name')}
                  </div>
                </th>
                <th className="px-4 py-3">接口地址 (Base URL)</th>
                <th
                  onClick={() => handleSort('type')}
                  className="px-4 py-3 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700/60 transition-colors"
                >
                  <div className="flex items-center gap-1.5">
                    <span>类型</span>
                    {renderSortIcon('type')}
                  </div>
                </th>
                <th
                  onClick={() => handleSort('priority')}
                  className="px-4 py-3 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700/60 transition-colors"
                >
                  <div className="flex items-center gap-1.5">
                    <span>优先级 (Priority)</span>
                    {renderSortIcon('priority')}
                  </div>
                </th>
                <th
                  onClick={() => handleSort('status')}
                  className="px-4 py-3 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700/60 transition-colors"
                >
                  <div className="flex items-center gap-1.5">
                    <span>状态</span>
                    {renderSortIcon('status')}
                  </div>
                </th>
                <th className="px-4 py-3">连通性测试</th>
                <th className="px-4 py-3 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredAndSortedChannels.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-slate-400 text-xs">
                    {loading ? '正在加载渠道...' : '暂无匹配的渠道'}
                  </td>
                </tr>
              ) : (
                filteredAndSortedChannels.map((chan) => {
                  const isTesting = testingId === chan.id;
                  const testRes = testResults[chan.id];

                  return (
                    <tr key={chan.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors">
                      {/* Name */}
                      <td className="px-4 py-3 font-semibold text-slate-800 dark:text-slate-200">
                        <div className="flex items-center gap-2">
                          <span
                            className={`w-2 h-2 rounded-full shrink-0 ${
                              chan.status ? 'bg-emerald-500' : 'bg-slate-400'
                            }`}
                          />
                          <span>{chan.name}</span>
                        </div>
                      </td>

                      {/* Base URL */}
                      <td className="px-4 py-3 font-mono text-[11px] text-slate-500 dark:text-slate-400 max-w-xs truncate">
                        {chan.base_url}
                      </td>

                      {/* Type */}
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 uppercase">
                          {chan.type}
                        </span>
                      </td>

                      {/* Priority */}
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 rounded-md font-mono font-bold text-xs bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                          {chan.priority}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                            chan.status
                              ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                          }`}
                        >
                          {chan.status ? '已启用' : '已停用'}
                        </span>
                      </td>

                      {/* Test Connection */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleTestConnection(chan.id)}
                            disabled={isTesting}
                            className="px-2.5 py-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg text-[11px] font-medium transition-all active:scale-95 disabled:opacity-50 flex items-center gap-1 border border-slate-200 dark:border-slate-700"
                          >
                            {isTesting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3 text-amber-500" />}
                            <span>测速</span>
                          </button>

                          {testRes && (
                            <span
                              className={`text-[11px] font-mono flex items-center gap-1 ${
                                testRes.success ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
                              }`}
                              title={testRes.message}
                            >
                              {testRes.success ? (
                                <>
                                  <CheckCircle2 className="w-3 h-3" />
                                  <span>{testRes.latencyMs}ms</span>
                                </>
                              ) : (
                                <>
                                  <XCircle className="w-3 h-3" />
                                  <span className="truncate max-w-[100px]">{testRes.message}</span>
                                </>
                              )}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => handleOpenSync(chan.id)}
                            className="px-2 py-1 bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 hover:bg-blue-100 rounded-lg text-[11px] font-medium transition-colors"
                            title="拉取上游模型并批量映射"
                          >
                            同步模型
                          </button>
                          <button
                            onClick={() => {
                              setEditingChannel(chan);
                              setIsModalOpen(true);
                            }}
                            className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 hover:text-slate-800 dark:hover:text-white rounded-lg transition-colors"
                            title="编辑"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDelete(chan.id)}
                            className="p-1.5 hover:bg-red-50 dark:hover:bg-red-950/40 text-red-600 rounded-lg transition-colors"
                            title="删除"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit / Create Channel Modal */}
      {isModalOpen && editingChannel && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 max-w-lg w-full border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">
                {editingChannel.id ? '编辑渠道配置' : '添加新渠道'}
              </h3>
              <button
                onClick={() => {
                  setIsModalOpen(false);
                  setEditingChannel(null);
                }}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveChannel} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  渠道名称
                </label>
                <input
                  type="text"
                  required
                  value={editingChannel.name || ''}
                  onChange={(e) => setEditingChannel({ ...editingChannel, name: e.target.value })}
                  placeholder="如：Any2API 主节点 / DeepSeek 官方"
                  className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-slate-100 outline-hidden focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  接口地址 (Base URL)
                </label>
                <input
                  type="url"
                  required
                  value={editingChannel.base_url || ''}
                  onChange={(e) => setEditingChannel({ ...editingChannel, base_url: e.target.value })}
                  placeholder="如：https://api.openai.com/v1"
                  className="w-full px-3 py-2 text-xs font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-slate-100 outline-hidden focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  API Key / Token
                </label>
                <input
                  type="password"
                  required
                  value={editingChannel.api_key || ''}
                  onChange={(e) => setEditingChannel({ ...editingChannel, api_key: e.target.value })}
                  placeholder="sk-..."
                  className="w-full px-3 py-2 text-xs font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-slate-100 outline-hidden focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    协议类型
                  </label>
                  <select
                    value={editingChannel.type || 'openai'}
                    onChange={(e) => setEditingChannel({ ...editingChannel, type: e.target.value })}
                    className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-slate-100 outline-hidden"
                  >
                    <option value="openai">OpenAI 兼容</option>
                    <option value="anthropic">Claude / Anthropic</option>
                    <option value="gemini">Google Gemini</option>
                    <option value="deepseek">DeepSeek</option>
                    <option value="custom">自定义中转</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    调度优先级 (越大越优先)
                  </label>
                  <input
                    type="number"
                    value={editingChannel.priority ?? 10}
                    onChange={(e) => setEditingChannel({ ...editingChannel, priority: parseInt(e.target.value, 10) || 1 })}
                    className="w-full px-3 py-2 text-xs font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-slate-100 outline-hidden"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="chan_status"
                  checked={Boolean(editingChannel.status)}
                  onChange={(e) => setEditingChannel({ ...editingChannel, status: e.target.checked ? 1 : 0 })}
                  className="rounded text-emerald-600 focus:ring-0"
                />
                <label htmlFor="chan_status" className="text-xs text-slate-700 dark:text-slate-300 select-none">
                  启用此渠道（参与多路路由与故障转移）
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setIsModalOpen(false);
                    setEditingChannel(null);
                  }}
                  className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-medium"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold shadow-2xs"
                >
                  保存配置
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Sync Models Modal */}
      {syncModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 max-w-lg w-full border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">
                从渠道拉取模型列表
              </h3>
              <button
                onClick={() => setSyncModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {isSyncing ? (
              <div className="py-10 text-center space-y-2">
                <Loader2 className="w-6 h-6 animate-spin text-emerald-600 mx-auto" />
                <span className="text-xs text-slate-400">正在与上游渠道建立连接并拉取 /v1/models...</span>
              </div>
            ) : syncedModels.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400">上游未返回任何模型列表</div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500">找到 {syncedModels.length} 个模型</span>
                  <button
                    onClick={() => {
                      if (selectedSyncModels.length === syncedModels.length) {
                        setSelectedSyncModels([]);
                      } else {
                        setSelectedSyncModels([...syncedModels]);
                      }
                    }}
                    className="text-emerald-600 hover:underline"
                  >
                    {selectedSyncModels.length === syncedModels.length ? '取消全选' : '全部勾选'}
                  </button>
                </div>

                <div className="max-h-60 overflow-y-auto space-y-1.5 border border-slate-200 dark:border-slate-700 rounded-xl p-2 bg-slate-50 dark:bg-slate-800">
                  {syncedModels.map((m) => (
                    <label
                      key={m}
                      className="flex items-center gap-2 p-1.5 hover:bg-white dark:hover:bg-slate-700 rounded-lg text-xs cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={selectedSyncModels.includes(m)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedSyncModels([...selectedSyncModels, m]);
                          } else {
                            setSelectedSyncModels(selectedSyncModels.filter((id) => id !== m));
                          }
                        }}
                        className="rounded text-emerald-600 focus:ring-0"
                      />
                      <span className="font-mono text-slate-800 dark:text-slate-200">{m}</span>
                    </label>
                  ))}
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    onClick={() => setSyncModalOpen(false)}
                    className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl text-xs"
                  >
                    取消
                  </button>
                  <button
                    onClick={handleBatchImport}
                    disabled={selectedSyncModels.length === 0}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold disabled:opacity-50 shadow-2xs"
                  >
                    导入已勾选 ({selectedSyncModels.length})
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

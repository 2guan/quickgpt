import React, { useState, useEffect } from 'react';
import { adminApi } from '../../api/client.js';
import { Model, Channel } from '../../types/index.js';
import {
  Plus,
  Bot,
  Loader2,
  Trash2,
  Edit2,
  X,
  Eye,
  EyeOff,
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Sparkles,
  Image as ImageIcon,
  BrainCircuit,
  MessageSquareText,
  RotateCw,
  GripVertical,
  Check,
} from 'lucide-react';

export const ModelsTab: React.FC = () => {
  const [models, setModels] = useState<Model[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingOrder, setSavingOrder] = useState(false);

  // Filters & Sorting
  const [search, setSearch] = useState('');
  const [capabilityFilter, setCapabilityFilter] = useState('');
  const [channelFilter, setChannelFilter] = useState('');
  const [visibilityFilter, setVisibilityFilter] = useState<'all' | '1' | '0'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | '1' | '0'>('all');

  const [sortBy, setSortBy] = useState<'order_index' | 'display_name' | 'model_id' | 'channel_id' | 'is_active'>('order_index');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  // Drag and Drop state
  const [draggedModelId, setDraggedModelId] = useState<string | null>(null);
  const [dragOverModelId, setDragOverModelId] = useState<string | null>(null);

  // Edit / Add modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingModel, setEditingModel] = useState<Partial<Model> | null>(null);

  const fetchModelsAndChannels = async () => {
    setLoading(true);
    try {
      const [mRes, cRes] = await Promise.all([adminApi.getModels(), adminApi.getChannels()]);
      setModels(mRes.models || []);
      setChannels(cRes.channels || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchModelsAndChannels();
  }, []);

  const handleSort = (column: typeof sortBy) => {
    if (sortBy === column) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortOrder('asc');
    }
  };

  const handleToggleVisibility = async (model: Model) => {
    const nextVis = model.is_visible_in_chat ? 0 : 1;
    try {
      await adminApi.updateModel(model.id, { is_visible_in_chat: nextVis });
      setModels(models.map((m) => (m.id === model.id ? { ...m, is_visible_in_chat: nextVis } : m)));
    } catch (err: any) {
      alert(`切换可见性失败: ${err.message}`);
    }
  };

  const handleToggleActive = async (model: Model) => {
    const nextAct = model.is_active ? 0 : 1;
    try {
      await adminApi.updateModel(model.id, { is_active: nextAct });
      setModels(models.map((m) => (m.id === model.id ? { ...m, is_active: nextAct } : m)));
    } catch (err: any) {
      alert(`切换启用状态失败: ${err.message}`);
    }
  };

  const handleSaveModel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingModel) return;

    try {
      if (editingModel.id) {
        await adminApi.updateModel(editingModel.id, editingModel);
      } else {
        await adminApi.createModel(editingModel);
      }
      setIsModalOpen(false);
      setEditingModel(null);
      fetchModelsAndChannels();
    } catch (err: any) {
      alert(`保存失败: ${err.message}`);
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm('确认删除此模型映射？')) {
      await adminApi.deleteModel(id);
      fetchModelsAndChannels();
    }
  };

  const handleClearAll = async () => {
    if (!confirm('⚠️ 警告：确定要清空所有已配置的模型映射吗？此操作将删除全部模型，不可撤销！')) return;
    try {
      const res = await adminApi.clearAllModels();
      alert(res.message);
      fetchModelsAndChannels();
    } catch (err: any) {
      alert(`清空失败: ${err.message}`);
    }
  };

  // Filter & Sort Models
  // Rules:
  // 1. Inactive models (is_active === 0) are automatically placed at the bottom
  // 2. Active models are sorted according to sortBy & sortOrder (default: order_index ASC)
  const filteredAndSortedModels = models
    .filter((m) => {
      if (channelFilter && m.channel_id !== channelFilter) return false;
      if (visibilityFilter !== 'all' && String(m.is_visible_in_chat) !== visibilityFilter) return false;
      if (statusFilter !== 'all' && String(m.is_active) !== statusFilter) return false;

      if (capabilityFilter) {
        try {
          const caps: string[] = JSON.parse(m.capabilities_json || '[]');
          if (!caps.includes(capabilityFilter)) return false;
        } catch {
          return false;
        }
      }

      if (search) {
        const q = search.toLowerCase();
        const matchName = m.display_name.toLowerCase().includes(q);
        const matchId = m.model_id.toLowerCase().includes(q);
        const matchReal = m.real_model_id.toLowerCase().includes(q);
        if (!matchName && !matchId && !matchReal) return false;
      }

      return true;
    })
    .sort((a, b) => {
      // 1. Inactive models always go to the bottom
      if (a.is_active !== b.is_active) {
        return a.is_active ? -1 : 1;
      }

      // 2. Sort within same active status
      let valA: any = a[sortBy] ?? '';
      let valB: any = b[sortBy] ?? '';
      if (sortBy === 'order_index' || sortBy === 'is_active') {
        valA = Number(valA);
        valB = Number(valB);
      }
      if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

  // Drag and Drop Handlers
  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggedModelId(id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
  };

  const handleDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverModelId !== id) {
      setDragOverModelId(id);
    }
  };

  const handleDragEnd = () => {
    setDraggedModelId(null);
    setDragOverModelId(null);
  };

  const handleDrop = async (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (!draggedModelId || draggedModelId === targetId) {
      handleDragEnd();
      return;
    }

    const currentList = [...filteredAndSortedModels];
    const sourceIdx = currentList.findIndex((m) => m.id === draggedModelId);
    const targetIdx = currentList.findIndex((m) => m.id === targetId);

    if (sourceIdx === -1 || targetIdx === -1) {
      handleDragEnd();
      return;
    }

    // Move dragged item
    const [moved] = currentList.splice(sourceIdx, 1);
    currentList.splice(targetIdx, 0, moved);

    // Re-index all active items sequentially (10, 20, 30...)
    const updatedOrders: Array<{ id: string; order_index: number }> = [];
    const newModelsMap = new Map<string, number>();

    currentList.forEach((item, idx) => {
      const newOrder = (idx + 1) * 10;
      updatedOrders.push({ id: item.id, order_index: newOrder });
      newModelsMap.set(item.id, newOrder);
    });

    // Update local state immediately
    setModels((prev) =>
      prev.map((m) => (newModelsMap.has(m.id) ? { ...m, order_index: newModelsMap.get(m.id)! } : m))
    );

    handleDragEnd();

    // Persist to backend
    setSavingOrder(true);
    try {
      await adminApi.reorderModels(updatedOrders);
    } catch (err: any) {
      alert(`保存排序失败: ${err.message}`);
      fetchModelsAndChannels();
    } finally {
      setSavingOrder(false);
    }
  };

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
            <Bot className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            <span>模型管理与映射 (Models & Mapping)</span>
          </h2>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
            配置前台公开模型、上游真实模型映射、AI 绘画与深度思考能力（共 {models.length} 个模型）
          </p>
        </div>

        <div className="flex items-center gap-2">
          {models.length > 0 && (
            <button
              onClick={handleClearAll}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 hover:bg-red-100 dark:bg-red-950/40 dark:hover:bg-red-900/50 text-red-600 dark:text-red-400 rounded-xl text-xs font-semibold border border-red-200 dark:border-red-800 transition-all active:scale-95"
              title="清空所有模型"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>清空模型</span>
            </button>
          )}

          <button
            onClick={fetchModelsAndChannels}
            disabled={loading}
            className="p-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-xl transition-all active:scale-95 disabled:opacity-50 border border-slate-200/60 dark:border-slate-700"
            title="刷新"
          >
            <RotateCw className={`w-4 h-4 ${loading || savingOrder ? 'animate-spin text-emerald-600' : ''}`} />
          </button>

          <button
            onClick={() => {
              setEditingModel({
                model_id: '',
                real_model_id: '',
                display_name: '',
                channel_id: channels[0]?.id || '',
                capabilities_json: JSON.stringify(['text']),
                is_visible_in_chat: 1,
                enable_search_fallback: 1,
                enable_followup: 0,
                is_active: 1,
                order_index: 20, // Default order_index 20
              });
              setIsModalOpen(true);
            }}
            className="flex items-center gap-2 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold shadow-2xs transition-all active:scale-95"
          >
            <Plus className="w-4 h-4" />
            <span>添加模型</span>
          </button>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-2xs flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            type="text"
            placeholder="搜索模型显示名称、标识或真实ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-slate-200 outline-hidden focus:border-emerald-500"
          />
        </div>

        {/* Capability Filter */}
        <select
          value={capabilityFilter}
          onChange={(e) => setCapabilityFilter(e.target.value)}
          className="px-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-slate-200 outline-hidden"
        >
          <option value="">全部模型能力</option>
          <option value="text">💬 文本对话</option>
          <option value="image">🎨 绘画生图</option>
          <option value="reasoning">🧠 深度思考</option>
          <option value="vision">👁️ 视觉理解</option>
        </select>

        {/* Channel Filter */}
        <select
          value={channelFilter}
          onChange={(e) => setChannelFilter(e.target.value)}
          className="px-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-slate-200 outline-hidden"
        >
          <option value="">全部所属渠道 ({channels.length})</option>
          {channels.map((ch) => (
            <option key={ch.id} value={ch.id}>
              {ch.name}
            </option>
          ))}
        </select>

        {/* Visibility Filter */}
        <select
          value={visibilityFilter}
          onChange={(e) => setVisibilityFilter(e.target.value as any)}
          className="px-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-slate-200 outline-hidden"
        >
          <option value="all">全部可见性</option>
          <option value="1">👁️ 前台可见</option>
          <option value="0">🔒 内部隐藏</option>
        </select>

        {/* Status Filter */}
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as any)}
          className="px-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-slate-200 outline-hidden"
        >
          <option value="all">全部状态</option>
          <option value="1">✅ 启用中</option>
          <option value="0">⏸️ 已停用 (置底)</option>
        </select>

        {(search || capabilityFilter || channelFilter || visibilityFilter !== 'all' || statusFilter !== 'all') && (
          <button
            onClick={() => {
              setSearch('');
              setCapabilityFilter('');
              setChannelFilter('');
              setVisibilityFilter('all');
              setStatusFilter('all');
            }}
            className="text-xs text-emerald-600 font-medium hover:underline px-2"
          >
            重置筛选
          </button>
        )}
      </div>

      {/* Drag & Drop Reorder Tip */}
      <div className="flex items-center justify-between px-2 text-[11px] text-slate-400">
        <span>💡 提示：按住左侧 ⠿ 拖动手柄可直接上下拖动更新模型排序；停用模型将自动置于列表最底部</span>
        {savingOrder && <span className="text-emerald-600 animate-pulse font-medium">正在保存最新排序...</span>}
      </div>

      {/* Models Table with Drag-and-Drop and Column Sorting */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600 dark:text-slate-300">
            <thead className="bg-slate-50/90 dark:bg-slate-800/90 border-b border-slate-200/80 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-semibold select-none">
              <tr>
                <th className="w-10 px-3 py-3 text-center">排序</th>
                <th
                  onClick={() => handleSort('display_name')}
                  className="px-4 py-3 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700/60 transition-colors"
                >
                  <div className="flex items-center gap-1.5">
                    <span>显示名称</span>
                    {renderSortIcon('display_name')}
                  </div>
                </th>
                <th
                  onClick={() => handleSort('model_id')}
                  className="px-4 py-3 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700/60 transition-colors"
                >
                  <div className="flex items-center gap-1.5">
                    <span>模型标识 (Model ID)</span>
                    {renderSortIcon('model_id')}
                  </div>
                </th>
                <th className="px-4 py-3">上游映射 (Real ID)</th>
                <th className="px-4 py-3">所属渠道</th>
                <th className="px-4 py-3">功能特性</th>
                <th
                  onClick={() => handleSort('order_index')}
                  className="px-4 py-3 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700/60 transition-colors"
                >
                  <div className="flex items-center gap-1.5">
                    <span>排序序号</span>
                    {renderSortIcon('order_index')}
                  </div>
                </th>
                <th
                  onClick={() => handleSort('is_active')}
                  className="px-4 py-3 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700/60 transition-colors"
                >
                  <div className="flex items-center gap-1.5">
                    <span>状态</span>
                    {renderSortIcon('is_active')}
                  </div>
                </th>
                <th className="px-4 py-3 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredAndSortedModels.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center py-12 text-slate-400 text-xs">
                    {loading ? '正在加载模型...' : '暂无匹配的模型'}
                  </td>
                </tr>
              ) : (
                filteredAndSortedModels.map((m) => {
                  let caps: string[] = [];
                  try {
                    caps = JSON.parse(m.capabilities_json || '[]');
                  } catch {
                    // ignore
                  }

                  const isDragging = draggedModelId === m.id;
                  const isDragOver = dragOverModelId === m.id;

                  return (
                    <tr
                      key={m.id}
                      draggable={!loading}
                      onDragStart={(e) => handleDragStart(e, m.id)}
                      onDragOver={(e) => handleDragOver(e, m.id)}
                      onDragEnd={handleDragEnd}
                      onDrop={(e) => handleDrop(e, m.id)}
                      className={`transition-all ${
                        isDragging ? 'opacity-40 bg-slate-100 dark:bg-slate-800' : ''
                      } ${
                        isDragOver ? 'border-t-2 border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/30' : ''
                      } ${
                        !m.is_active ? 'opacity-60 bg-slate-50/50 dark:bg-slate-900/40' : 'hover:bg-slate-50 dark:hover:bg-slate-800/60'
                      }`}
                    >
                      {/* Drag Handle */}
                      <td className="w-10 px-3 py-3 text-center cursor-grab active:cursor-grabbing text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                        <GripVertical className="w-4 h-4 mx-auto" />
                      </td>

                      {/* Display Name */}
                      <td className="px-4 py-3 font-semibold text-slate-800 dark:text-slate-200">
                        <div className="flex items-center gap-2">
                          <span
                            className={`w-2 h-2 rounded-full shrink-0 ${
                              m.is_active ? 'bg-emerald-500' : 'bg-slate-400'
                            }`}
                          />
                          <span>{m.display_name}</span>
                          {!m.is_active && (
                            <span className="text-[10px] text-slate-400 font-normal">(已停用)</span>
                          )}
                        </div>
                      </td>

                      {/* Public Model ID */}
                      <td className="px-4 py-3 font-mono text-[11px] text-slate-700 dark:text-slate-300">
                        <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                          {m.model_id}
                        </span>
                      </td>

                      {/* Real Model ID */}
                      <td className="px-4 py-3 font-mono text-[11px] text-slate-500 dark:text-slate-400">
                        {m.real_model_id}
                      </td>

                      {/* Channel Name */}
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-400 text-[11px]">
                        {m.channel_name || '-'}
                      </td>

                      {/* Capabilities Badges */}
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-1">
                          {caps.includes('reasoning') && (
                            <span className="px-1.5 py-0.5 text-[10px] font-medium bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 rounded border border-amber-200 dark:border-amber-800 flex items-center gap-0.5">
                              <BrainCircuit className="w-2.5 h-2.5" /> 深度思考
                            </span>
                          )}
                          {caps.includes('image') && (
                            <span className="px-1.5 py-0.5 text-[10px] font-medium bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 rounded border border-purple-200 dark:border-purple-800 flex items-center gap-0.5">
                              <ImageIcon className="w-2.5 h-2.5" /> 绘画生图
                            </span>
                          )}
                          {caps.includes('vision') && (
                            <span className="px-1.5 py-0.5 text-[10px] font-medium bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 rounded border border-blue-200 dark:border-blue-800">
                              视觉
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Order Index */}
                      <td className="px-4 py-3 font-mono text-xs">
                        <span className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-md font-semibold border border-slate-200 dark:border-slate-700">
                          {m.order_index}
                        </span>
                      </td>

                      {/* Active & Visibility Switches */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => handleToggleActive(m)}
                            className={`px-2 py-0.5 rounded-full text-[10px] font-semibold transition-all ${
                              m.is_active
                                ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                            }`}
                          >
                            {m.is_active ? '启用' : '停用'}
                          </button>

                          <button
                            onClick={() => handleToggleVisibility(m)}
                            className={`p-1 rounded-lg transition-colors ${
                              m.is_visible_in_chat
                                ? 'text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/60'
                                : 'text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                            }`}
                            title={m.is_visible_in_chat ? '前台可见（点击隐藏）' : '前台隐藏（点击公开）'}
                          >
                            {m.is_visible_in_chat ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => {
                              setEditingModel(m);
                              setIsModalOpen(true);
                            }}
                            className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 hover:text-slate-800 dark:hover:text-white rounded-lg transition-colors"
                            title="编辑"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDelete(m.id)}
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

      {/* Edit / Create Model Modal */}
      {isModalOpen && editingModel && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 max-w-lg w-full border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">
                {editingModel.id ? '编辑模型映射' : '添加新模型映射'}
              </h3>
              <button
                onClick={() => {
                  setIsModalOpen(false);
                  setEditingModel(null);
                }}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveModel} className="space-y-3.5">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    前台显示名称
                  </label>
                  <input
                    type="text"
                    required
                    value={editingModel.display_name || ''}
                    onChange={(e) => setEditingModel({ ...editingModel, display_name: e.target.value })}
                    placeholder="如：DeepSeek-V3 深度"
                    className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-slate-100 outline-hidden focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    前台公开标识 (Model ID)
                  </label>
                  <input
                    type="text"
                    required
                    value={editingModel.model_id || ''}
                    onChange={(e) => setEditingModel({ ...editingModel, model_id: e.target.value })}
                    placeholder="如：deepseek-chat"
                    className="w-full px-3 py-2 text-xs font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-slate-100 outline-hidden focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    上游真实标识 (Real ID)
                  </label>
                  <input
                    type="text"
                    required
                    value={editingModel.real_model_id || ''}
                    onChange={(e) => setEditingModel({ ...editingModel, real_model_id: e.target.value })}
                    placeholder="转发给渠道的模型名称"
                    className="w-full px-3 py-2 text-xs font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-slate-100 outline-hidden focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    所属渠道
                  </label>
                  <select
                    value={editingModel.channel_id || ''}
                    onChange={(e) => setEditingModel({ ...editingModel, channel_id: e.target.value })}
                    className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-slate-100 outline-hidden"
                  >
                    {channels.map((ch) => (
                      <option key={ch.id} value={ch.id}>
                        {ch.name} ({ch.type})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Capabilities Checkboxes */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  功能特性勾选
                </label>
                <div className="flex flex-wrap gap-2">
                  {(
                    [
                      { id: 'text', label: '💬 文本对话' },
                      { id: 'reasoning', label: '🧠 深度思考 (R1)' },
                      { id: 'image', label: '🎨 绘画生图' },
                      { id: 'vision', label: '👁️ 视觉理解' },
                    ] as const
                  ).map((cap) => {
                    let currentCaps: string[] = [];
                    try {
                      currentCaps = JSON.parse(editingModel.capabilities_json || '[]');
                    } catch {
                      // ignore
                    }
                    const isChecked = currentCaps.includes(cap.id);

                    return (
                      <label
                        key={cap.id}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs cursor-pointer transition-all ${
                          isChecked
                            ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-300 dark:border-emerald-700 text-emerald-800 dark:text-emerald-300 font-semibold'
                            : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            let nextCaps = [...currentCaps];
                            if (e.target.checked) {
                              if (!nextCaps.includes(cap.id)) nextCaps.push(cap.id);
                            } else {
                              nextCaps = nextCaps.filter((c) => c !== cap.id);
                            }
                            setEditingModel({
                              ...editingModel,
                              capabilities_json: JSON.stringify(nextCaps),
                            });
                          }}
                          className="hidden"
                        />
                        <span>{cap.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    排序权重 (默认 20，越小越靠前)
                  </label>
                  <input
                    type="number"
                    value={editingModel.order_index ?? 20}
                    onChange={(e) => setEditingModel({ ...editingModel, order_index: parseInt(e.target.value, 10) || 0 })}
                    className="w-full px-3 py-2 text-xs font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-slate-100 outline-hidden"
                  />
                </div>

                <div className="flex flex-col justify-end space-y-2 pb-1">
                  <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={Boolean(editingModel.is_visible_in_chat)}
                      onChange={(e) => setEditingModel({ ...editingModel, is_visible_in_chat: e.target.checked ? 1 : 0 })}
                      className="rounded text-emerald-600 focus:ring-0"
                    />
                    <span>前台对话选择器可见</span>
                  </label>

                  <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={Boolean(editingModel.is_active)}
                      onChange={(e) => setEditingModel({ ...editingModel, is_active: e.target.checked ? 1 : 0 })}
                      className="rounded text-emerald-600 focus:ring-0"
                    />
                    <span>启用此模型</span>
                  </label>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setIsModalOpen(false);
                    setEditingModel(null);
                  }}
                  className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-medium"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold shadow-2xs"
                >
                  保存模型
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

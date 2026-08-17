import React, { useState, useEffect } from 'react';
import { adminApi } from '../../api/client.js';
import { User, Conversation, Message } from '../../types/index.js';
import {
  Users,
  CheckCircle2,
  XCircle,
  Shield,
  KeyRound,
  Trash2,
  MessageSquare,
  Loader2,
  X,
  Clock,
  Check,
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  RotateCw,
} from 'lucide-react';

export const UsersTab: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterRole, setFilterRole] = useState<'ALL' | 'PENDING' | 'USER' | 'ADMIN'>('ALL');
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Sorting
  const [sortBy, setSortBy] = useState<'username' | 'role' | 'status' | 'created_at'>('created_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Reset password modal
  const [resetModalUserId, setResetModalUserId] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');

  // User chat audit drawer
  const [auditUser, setAuditUser] = useState<User | null>(null);
  const [userConversations, setUserConversations] = useState<Conversation[]>([]);
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null);
  const [convMessages, setConvMessages] = useState<Message[]>([]);
  const [loadingAudit, setLoadingAudit] = useState(false);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await adminApi.getUsers();
      setUsers(res.users || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleSort = (column: typeof sortBy) => {
    if (sortBy === column) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortOrder('desc');
    }
  };

  const handleApproveUser = async (userId: string) => {
    try {
      await adminApi.updateUser(userId, { role: 'USER', status: 'ACTIVE' });
      fetchUsers();
    } catch (err: any) {
      alert(`审批失败: ${err.message}`);
    }
  };

  const handleRoleChange = async (userId: string, role: string) => {
    try {
      await adminApi.updateUser(userId, { role });
      fetchUsers();
    } catch (err: any) {
      alert(`更新角色失败: ${err.message}`);
    }
  };

  const handleStatusChange = async (userId: string, status: string) => {
    try {
      await adminApi.updateUser(userId, { status });
      fetchUsers();
    } catch (err: any) {
      alert(`更新状态失败: ${err.message}`);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetModalUserId || !newPassword) return;

    try {
      await adminApi.resetUserPassword(resetModalUserId, newPassword);
      alert('密码已成功重置！');
      setResetModalUserId(null);
      setNewPassword('');
    } catch (err: any) {
      alert(`重置失败: ${err.message}`);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (confirm('确定删除此用户及其所有数据？')) {
      await adminApi.deleteUser(userId);
      fetchUsers();
    }
  };

  // Open audit drawer
  const handleOpenAudit = async (user: User) => {
    setAuditUser(user);
    setSelectedConvId(null);
    setConvMessages([]);
    setLoadingAudit(true);
    try {
      const res = await adminApi.getUserConversations(user.id);
      setUserConversations(res.conversations || []);
      if (res.conversations && res.conversations.length > 0) {
        handleSelectConversation(res.conversations[0].id);
      }
    } finally {
      setLoadingAudit(false);
    }
  };

  const handleSelectConversation = async (convId: string) => {
    setSelectedConvId(convId);
    try {
      const res = await adminApi.getUserConversationMessages(convId);
      setConvMessages(res.messages || []);
    } catch {
      // ignore
    }
  };

  // Filtering & Sorting logic
  const filteredAndSortedUsers = users
    .filter((u) => {
      if (filterRole !== 'ALL' && u.role !== filterRole) return false;
      if (filterStatus !== 'ALL' && u.status !== filterStatus) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const matchName = u.username.toLowerCase().includes(q);
        const matchEmail = (u.email || '').toLowerCase().includes(q);
        if (!matchName && !matchEmail) return false;
      }
      return true;
    })
    .sort((a, b) => {
      let valA: any = a[sortBy] || '';
      let valB: any = b[sortBy] || '';
      if (sortBy === 'created_at') {
        valA = new Date(valA).getTime() || 0;
        valB = new Date(valB).getTime() || 0;
      }
      if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

  const getRoleChineseText = (role?: string) => {
    if (role === 'ADMIN') return '管理员';
    if (role === 'PENDING') return '待审核';
    return '普通用户';
  };

  const getStatusChineseText = (status?: string) => {
    if (status === 'ACTIVE') return '正常';
    if (status === 'DISABLED') return '已停用';
    if (status === 'BANNED') return '已封禁';
    return '正常';
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
      {/* Header & Main Stats */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-2xs">
        <div>
          <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <Users className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            <span>人员与权限管理 (User Management)</span>
          </h2>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
            审核新注册用户、分配管理员权限、重置密码及合规审计用户历史会话（共 {users.length} 名用户）
          </p>
        </div>

        <button
          onClick={fetchUsers}
          disabled={loading}
          className="p-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-xl transition-all active:scale-95 disabled:opacity-50 border border-slate-200/60 dark:border-slate-700 self-start sm:self-auto"
          title="刷新列表"
        >
          <RotateCw className={`w-4 h-4 ${loading ? 'animate-spin text-emerald-600' : ''}`} />
        </button>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-2xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[240px]">
          {/* Keyword Search */}
          <div className="relative flex-1 min-w-[180px] max-w-sm">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              type="text"
              placeholder="搜索用户名或邮箱..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-slate-200 outline-hidden focus:border-emerald-500"
            />
          </div>

          {/* Status Filter Dropdown */}
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-slate-200 outline-hidden"
          >
            <option value="ALL">全部账号状态</option>
            <option value="ACTIVE">正常 (ACTIVE)</option>
            <option value="DISABLED">已停用 (DISABLED)</option>
            <option value="BANNED">已封禁 (BANNED)</option>
          </select>
        </div>

        {/* Role Filter Tabs */}
        <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl text-xs font-semibold">
          {(['ALL', 'PENDING', 'USER', 'ADMIN'] as const).map((role) => (
            <button
              key={role}
              onClick={() => setFilterRole(role)}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                filterRole === role
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-2xs'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              {role === 'ALL'
                ? '全部'
                : role === 'PENDING'
                ? '待审核'
                : role === 'USER'
                ? '普通用户'
                : '管理员'}
            </button>
          ))}
        </div>
      </div>

      {/* Users Table with Column Sorting */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600 dark:text-slate-300">
            <thead className="bg-slate-50/90 dark:bg-slate-800/90 border-b border-slate-200/80 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-semibold select-none">
              <tr>
                <th
                  onClick={() => handleSort('username')}
                  className="px-4 py-3 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700/60 transition-colors"
                >
                  <div className="flex items-center gap-1.5">
                    <span>用户名</span>
                    {renderSortIcon('username')}
                  </div>
                </th>
                <th className="px-4 py-3">电子邮箱</th>
                <th
                  onClick={() => handleSort('role')}
                  className="px-4 py-3 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700/60 transition-colors"
                >
                  <div className="flex items-center gap-1.5">
                    <span>角色权限</span>
                    {renderSortIcon('role')}
                  </div>
                </th>
                <th
                  onClick={() => handleSort('status')}
                  className="px-4 py-3 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700/60 transition-colors"
                >
                  <div className="flex items-center gap-1.5">
                    <span>账号状态</span>
                    {renderSortIcon('status')}
                  </div>
                </th>
                <th
                  onClick={() => handleSort('created_at')}
                  className="px-4 py-3 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700/60 transition-colors"
                >
                  <div className="flex items-center gap-1.5">
                    <span>注册时间</span>
                    {renderSortIcon('created_at')}
                  </div>
                </th>
                <th className="px-4 py-3 text-right">操作管理</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredAndSortedUsers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-slate-400 text-xs">
                    {loading ? '正在加载用户...' : '暂无匹配的用户'}
                  </td>
                </tr>
              ) : (
                filteredAndSortedUsers.map((u) => {
                  const isPending = u.role === 'PENDING';
                  return (
                    <tr key={u.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors">
                      {/* Username */}
                      <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-200">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center font-bold text-xs text-slate-700 dark:text-slate-300">
                            {u.username.slice(0, 2).toUpperCase()}
                          </div>
                          <span>{u.username}</span>
                        </div>
                      </td>

                      {/* Email */}
                      <td className="px-4 py-3 text-slate-500 dark:text-slate-400">
                        {u.email || '-'}
                      </td>

                      {/* Role */}
                      <td className="px-4 py-3">
                        <select
                          value={u.role}
                          onChange={(e) => handleRoleChange(u.id, e.target.value)}
                          className={`px-2 py-1 rounded-lg text-xs font-semibold border ${
                            u.role === 'ADMIN'
                              ? 'bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800'
                              : u.role === 'PENDING'
                              ? 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800 animate-pulse'
                              : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                          }`}
                        >
                          <option value="USER">普通用户</option>
                          <option value="ADMIN">管理员</option>
                          <option value="PENDING">待审核</option>
                        </select>
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3">
                        <select
                          value={u.status}
                          onChange={(e) => handleStatusChange(u.id, e.target.value)}
                          className={`px-2 py-1 rounded-lg text-xs font-medium border ${
                            u.status === 'ACTIVE'
                              ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                              : 'bg-red-50 dark:bg-red-950/60 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800'
                          }`}
                        >
                          <option value="ACTIVE">正常</option>
                          <option value="DISABLED">停用</option>
                          <option value="BANNED">封禁</option>
                        </select>
                      </td>

                      {/* Created At */}
                      <td className="px-4 py-3 font-mono text-[11px] text-slate-500 dark:text-slate-400 whitespace-nowrap">
                        {u.created_at ? new Date(u.created_at).toLocaleString() : '-'}
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          {isPending && (
                            <button
                              onClick={() => handleApproveUser(u.id)}
                              className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium transition-all shadow-2xs flex items-center gap-1"
                              title="一键审批通过"
                            >
                              <Check className="w-3.5 h-3.5" />
                              <span>通过审核</span>
                            </button>
                          )}

                          <button
                            onClick={() => handleOpenAudit(u)}
                            className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 hover:text-slate-800 dark:hover:text-white rounded-lg transition-colors"
                            title="审计会话记录"
                          >
                            <MessageSquare className="w-3.5 h-3.5" />
                          </button>

                          <button
                            onClick={() => setResetModalUserId(u.id)}
                            className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 hover:text-slate-800 dark:hover:text-white rounded-lg transition-colors"
                            title="重置密码"
                          >
                            <KeyRound className="w-3.5 h-3.5" />
                          </button>

                          <button
                            onClick={() => handleDeleteUser(u.id)}
                            className="p-1.5 hover:bg-red-50 dark:hover:bg-red-950/40 text-red-600 rounded-lg transition-colors"
                            title="删除用户"
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

      {/* Password Reset Modal */}
      {resetModalUserId && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 max-w-md w-full border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-emerald-600" />
                <span>管理员重置用户密码</span>
              </h3>
              <button
                onClick={() => setResetModalUserId(null)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleResetPassword} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  新登录密码
                </label>
                <input
                  type="password"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="请输入 6 位以上新密码..."
                  className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-slate-100 outline-hidden focus:border-emerald-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setResetModalUserId(null)}
                  className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-medium"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold shadow-2xs"
                >
                  确认重置
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* User Chat Audit Drawer */}
      {auditUser && (
        <div className="fixed inset-0 bg-black/50 z-50 flex justify-end animate-in fade-in">
          <div className="w-full max-w-2xl bg-white dark:bg-slate-900 h-full shadow-2xl flex flex-col border-l border-slate-200 dark:border-slate-800 animate-in slide-in-from-right duration-200">
            {/* Drawer Header */}
            <div className="p-4 border-b border-slate-200/80 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-emerald-600" />
                <span className="text-sm font-bold text-slate-800 dark:text-slate-100">
                  用户对话审计 - {auditUser.username}
                </span>
              </div>
              <button
                onClick={() => setAuditUser(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Drawer Body (Conversation list + Messages) */}
            <div className="flex-1 flex overflow-hidden">
              {/* Left: Conversation list */}
              <div className="w-1/3 border-r border-slate-200/80 dark:border-slate-800 overflow-y-auto p-2 space-y-1">
                {loadingAudit ? (
                  <div className="text-center py-8 text-xs text-slate-400">加载会话中...</div>
                ) : userConversations.length === 0 ? (
                  <div className="text-center py-8 text-xs text-slate-400">暂无会话记录</div>
                ) : (
                  userConversations.map((conv) => (
                    <button
                      key={conv.id}
                      onClick={() => handleSelectConversation(conv.id)}
                      className={`w-full text-left p-2.5 rounded-xl text-xs transition-all truncate block ${
                        selectedConvId === conv.id
                          ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 font-medium'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      {conv.title}
                    </button>
                  ))
                )}
              </div>

              {/* Right: Message stream */}
              <div className="w-2/3 overflow-y-auto p-4 space-y-3 bg-slate-50/50 dark:bg-slate-950/30">
                {convMessages.length === 0 ? (
                  <div className="text-center py-12 text-xs text-slate-400">请选择左侧会话查看详情</div>
                ) : (
                  convMessages.map((m) => (
                    <div
                      key={m.id}
                      className={`p-3 rounded-xl text-xs space-y-1 ${
                        m.role === 'user'
                          ? 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700'
                          : 'bg-emerald-50/70 dark:bg-emerald-950/40 border border-emerald-200/60 dark:border-emerald-900/60'
                      }`}
                    >
                      <div className="flex items-center justify-between text-[10px] text-slate-400">
                        <span className="font-semibold">{m.role === 'user' ? '用户提问' : m.model_id || 'AI 回答'}</span>
                        <span>{new Date(m.created_at).toLocaleTimeString()}</span>
                      </div>
                      <div className="text-slate-800 dark:text-slate-200 whitespace-pre-wrap leading-relaxed">
                        {m.content}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

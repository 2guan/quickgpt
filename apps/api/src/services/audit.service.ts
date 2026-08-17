import crypto from 'node:crypto';
import { db } from '../db/sqlite.js';
import fs from 'node:fs';
import path from 'node:path';
import { ENV } from '../config/env.js';

export interface AuditLogItem {
  id: string;
  user_id: string;
  username: string;
  model_id: string;
  channel_id: string;
  prompt_tokens: number;
  completion_tokens: number;
  duration_ms: number;
  status_code: number;
  error_message: string;
  ip: string;
  created_at: string;
}

export interface AuditLogFilterParams {
  search?: string;
  username?: string;
  model_id?: string;
  channel_id?: string;
  status_type?: 'all' | 'success' | 'error';
  start_date?: string;
  end_date?: string;
  sort_by?: 'created_at' | 'duration_ms' | 'prompt_tokens' | 'completion_tokens' | 'status_code';
  sort_order?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

export function recordAuditLog(log: Partial<AuditLogItem>) {
  const id = `log_${crypto.randomBytes(6).toString('hex')}`;
  const now = new Date().toISOString();

  const stmt = db.prepare(`
    INSERT INTO audit_logs (
      id, user_id, username, model_id, channel_id, prompt_tokens, 
      completion_tokens, duration_ms, status_code, error_message, ip, created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    id,
    log.user_id || '',
    log.username || '',
    log.model_id || '',
    log.channel_id || '',
    log.prompt_tokens || 0,
    log.completion_tokens || 0,
    log.duration_ms || 0,
    log.status_code || 200,
    log.error_message || '',
    log.ip || '',
    now
  );
}

export function getFilteredAuditLogs(params: AuditLogFilterParams = {}) {
  const limit = Math.min(params.limit || 50, 200);
  const offset = params.offset || 0;
  const sortBy = params.sort_by || 'created_at';
  const sortOrder = params.sort_order === 'asc' ? 'ASC' : 'DESC';

  const whereClauses: string[] = [];
  const args: any[] = [];

  if (params.search) {
    whereClauses.push('(l.username LIKE ? OR l.model_id LIKE ? OR l.ip LIKE ? OR l.error_message LIKE ?)');
    const term = `%${params.search}%`;
    args.push(term, term, term, term);
  }

  if (params.username) {
    whereClauses.push('l.username = ?');
    args.push(params.username);
  }

  if (params.model_id) {
    whereClauses.push('l.model_id = ?');
    args.push(params.model_id);
  }

  if (params.channel_id) {
    whereClauses.push('l.channel_id = ?');
    args.push(params.channel_id);
  }

  if (params.status_type === 'success') {
    whereClauses.push('l.status_code = 200');
  } else if (params.status_type === 'error') {
    whereClauses.push('l.status_code != 200');
  }

  if (params.start_date) {
    whereClauses.push('l.created_at >= ?');
    args.push(params.start_date);
  }

  if (params.end_date) {
    whereClauses.push('l.created_at <= ?');
    args.push(params.end_date);
  }

  const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

  // Get total count
  const countStmt = db.prepare(`SELECT COUNT(*) as total FROM audit_logs l ${whereSql}`);
  const { total } = (countStmt.get(...args) as any) || { total: 0 };

  // Get filtered items with channel name
  const queryStmt = db.prepare(`
    SELECT l.*, c.name as channel_name 
    FROM audit_logs l
    LEFT JOIN channels c ON l.channel_id = c.id
    ${whereSql}
    ORDER BY l.${sortBy} ${sortOrder}
    LIMIT ? OFFSET ?
  `);

  const items = queryStmt.all(...args, limit, offset) as any[];

  // Get available filter choices
  const modelsList = db.prepare("SELECT DISTINCT model_id FROM audit_logs WHERE model_id != '' AND model_id IS NOT NULL ORDER BY model_id ASC").all().map((r: any) => r.model_id);
  const usersList = db.prepare("SELECT DISTINCT username FROM audit_logs WHERE username != '' AND username IS NOT NULL ORDER BY username ASC").all().map((r: any) => r.username);
  const channelsList = db.prepare(`
    SELECT DISTINCT c.id, c.name 
    FROM channels c 
    JOIN audit_logs l ON c.id = l.channel_id 
    ORDER BY c.name ASC
  `).all();

  return {
    items,
    total,
    limit,
    offset,
    filters: {
      models: modelsList,
      users: usersList,
      channels: channelsList,
    },
  };
}

export function getAnalyticsStats(timeRange: 'today' | '7d' | '30d' | 'all' = '7d') {
  let timeFilterSql = '';
  const now = new Date();

  if (timeRange === 'today') {
    const todayStr = now.toISOString().slice(0, 10);
    timeFilterSql = `WHERE created_at >= '${todayStr}T00:00:00.000Z'`;
  } else if (timeRange === '7d') {
    const d7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    timeFilterSql = `WHERE created_at >= '${d7}'`;
  } else if (timeRange === '30d') {
    const d30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
    timeFilterSql = `WHERE created_at >= '${d30}'`;
  }

  // 1. Overview KPIs
  const overviewStmt = db.prepare(`
    SELECT 
      COUNT(*) as total_requests,
      SUM(CASE WHEN status_code = 200 THEN 1 ELSE 0 END) as success_requests,
      SUM(prompt_tokens) as total_prompt_tokens,
      SUM(completion_tokens) as total_completion_tokens,
      SUM(prompt_tokens + completion_tokens) as total_tokens,
      AVG(duration_ms) as avg_duration_ms,
      COUNT(DISTINCT username) as active_users
    FROM audit_logs
    ${timeFilterSql}
  `);
  const overview = (overviewStmt.get() as any) || {};
  const totalRequests = overview.total_requests || 0;
  const successRequests = overview.success_requests || 0;
  const successRate = totalRequests > 0 ? ((successRequests / totalRequests) * 100).toFixed(1) : '100.0';

  // 2. Total Generated Images
  const imageCountStmt = db.prepare(`
    SELECT COUNT(*) as total_images 
    FROM uploads 
    ${timeFilterSql ? timeFilterSql : ''}
  `);
  const { total_images } = (imageCountStmt.get() as any) || { total_images: 0 };

  // 3. Time Series Trends (Daily breakdown)
  const trendStmt = db.prepare(`
    SELECT 
      substr(created_at, 1, 10) as date,
      COUNT(*) as requests,
      SUM(CASE WHEN status_code = 200 THEN 1 ELSE 0 END) as success_count,
      SUM(prompt_tokens + completion_tokens) as tokens,
      AVG(duration_ms) as avg_duration
    FROM audit_logs
    ${timeFilterSql}
    GROUP BY substr(created_at, 1, 10)
    ORDER BY date ASC
  `);
  const dailyTrends = trendStmt.all() as any[];

  // 4. Model Call Distribution Top 10
  const modelWhere = timeFilterSql ? `${timeFilterSql} AND model_id != ''` : `WHERE model_id != ''`;
  const modelStatsStmt = db.prepare(`
    SELECT 
      model_id,
      COUNT(*) as call_count,
      SUM(prompt_tokens + completion_tokens) as total_tokens,
      AVG(duration_ms) as avg_duration,
      SUM(CASE WHEN status_code = 200 THEN 1 ELSE 0 END) as success_count
    FROM audit_logs
    ${modelWhere}
    GROUP BY model_id
    ORDER BY call_count DESC
    LIMIT 10
  `);
  const topModels = modelStatsStmt.all() as any[];

  // 5. Channel Distribution & Failover Rate
  const channelStatsStmt = db.prepare(`
    SELECT 
      l.channel_id,
      COALESCE(c.name, '未知渠道') as channel_name,
      COUNT(*) as call_count,
      SUM(CASE WHEN l.status_code = 200 THEN 1 ELSE 0 END) as success_count,
      SUM(CASE WHEN l.status_code != 200 THEN 1 ELSE 0 END) as error_count,
      AVG(l.duration_ms) as avg_duration
    FROM audit_logs l
    LEFT JOIN channels c ON l.channel_id = c.id
    ${timeFilterSql ? timeFilterSql.replace('WHERE', 'WHERE l.') : ''}
    GROUP BY l.channel_id
    ORDER BY call_count DESC
  `);
  const channelDistribution = channelStatsStmt.all() as any[];

  // 6. User Activity Leaderboard Top 10
  const userWhere = timeFilterSql ? `${timeFilterSql} AND username != ''` : `WHERE username != ''`;
  const userStatsStmt = db.prepare(`
    SELECT 
      username,
      COUNT(*) as request_count,
      SUM(prompt_tokens + completion_tokens) as total_tokens,
      MAX(created_at) as last_active_at
    FROM audit_logs
    ${userWhere}
    GROUP BY username
    ORDER BY request_count DESC
    LIMIT 10
  `);
  const topUsers = userStatsStmt.all() as any[];

  // 7. Status Code Distribution
  const statusCodeStmt = db.prepare(`
    SELECT 
      status_code,
      COUNT(*) as count
    FROM audit_logs
    ${timeFilterSql}
    GROUP BY status_code
    ORDER BY count DESC
  `);
  const statusDistribution = statusCodeStmt.all() as any[];

  return {
    timeRange,
    summary: {
      total_requests: totalRequests,
      success_requests: successRequests,
      success_rate: `${successRate}%`,
      total_tokens: overview.total_tokens || 0,
      total_prompt_tokens: overview.total_prompt_tokens || 0,
      total_completion_tokens: overview.total_completion_tokens || 0,
      avg_duration_ms: Math.round(overview.avg_duration_ms || 0),
      active_users: overview.active_users || 0,
      total_images,
    },
    dailyTrends,
    topModels,
    channelDistribution,
    topUsers,
    statusDistribution,
  };
}

export function getSystemStats() {
  const today = new Date().toISOString().slice(0, 10);
  
  const tokenStmt = db.prepare(`
    SELECT 
      SUM(prompt_tokens + completion_tokens) as total_tokens_today,
      COUNT(*) as total_requests_today
    FROM audit_logs 
    WHERE created_at LIKE ?
  `);
  const tokenData = (tokenStmt.get(`${today}%`) as any) || { total_tokens_today: 0, total_requests_today: 0 };

  const channelStmt = db.prepare('SELECT COUNT(*) as active_channels FROM channels WHERE status = 1');
  const { active_channels } = (channelStmt.get() as any) || { active_channels: 0 };

  const pendingStmt = db.prepare("SELECT COUNT(*) as pending_users FROM users WHERE role = 'PENDING'");
  const { pending_users } = (pendingStmt.get() as any) || { pending_users: 0 };

  const totalUsersStmt = db.prepare('SELECT COUNT(*) as total_users FROM users');
  const { total_users } = (totalUsersStmt.get() as any) || { total_users: 0 };

  return {
    total_tokens_today: tokenData.total_tokens_today || 0,
    total_requests_today: tokenData.total_requests_today || 0,
    active_channels: active_channels || 0,
    pending_users: pending_users || 0,
    total_users: total_users || 0,
  };
}

export interface MediaFilterParams {
  search?: string;
  username?: string;
  start_date?: string;
  end_date?: string;
  limit?: number;
  offset?: number;
}

export function getFilteredMediaLogs(params: MediaFilterParams = {}) {
  const limit = Math.min(params.limit || 50, 200);
  const offset = params.offset || 0;

  const whereClauses: string[] = [];
  const args: any[] = [];

  if (params.search) {
    whereClauses.push('(u.file_name LIKE ? OR u.extracted_text LIKE ? OR us.username LIKE ?)');
    const term = `%${params.search}%`;
    args.push(term, term, term);
  }

  if (params.username) {
    whereClauses.push('us.username = ?');
    args.push(params.username);
  }

  if (params.start_date) {
    whereClauses.push('u.created_at >= ?');
    args.push(params.start_date);
  }

  if (params.end_date) {
    whereClauses.push('u.created_at <= ?');
    args.push(params.end_date);
  }

  const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

  const countStmt = db.prepare(`
    SELECT COUNT(*) as total, SUM(u.file_size) as total_size_bytes 
    FROM uploads u 
    LEFT JOIN users us ON u.user_id = us.id 
    ${whereSql}
  `);
  const { total, total_size_bytes } = (countStmt.get(...args) as any) || { total: 0, total_size_bytes: 0 };

  const queryStmt = db.prepare(`
    SELECT u.*, us.username 
    FROM uploads u
    LEFT JOIN users us ON u.user_id = us.id
    ${whereSql}
    ORDER BY u.created_at DESC
    LIMIT ? OFFSET ?
  `);

  const items = queryStmt.all(...args, limit, offset);

  return {
    items,
    total,
    total_size_bytes: total_size_bytes || 0,
    limit,
    offset,
  };
}

export function deleteMediaLog(id: string): boolean {
  const getStmt = db.prepare('SELECT * FROM uploads WHERE id = ?');
  const record = getStmt.get(id) as any;
  if (!record) return false;

  // Attempt to delete physical file from disk
  if (record.file_name) {
    const filePath = path.join(ENV.UPLOADS_DIR, record.file_name);
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch {
        // ignore unlink error
      }
    }
  }

  const delStmt = db.prepare('DELETE FROM uploads WHERE id = ?');
  const res = delStmt.run(id);
  return res.changes > 0;
}

export function clearOldAuditLogs(days = 30): number {
  const thresholdDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const stmt = db.prepare('DELETE FROM audit_logs WHERE created_at < ?');
  const res = stmt.run(thresholdDate);
  return Number(res.changes);
}

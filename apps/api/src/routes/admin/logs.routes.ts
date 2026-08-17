import { FastifyInstance } from 'fastify';
import {
  getFilteredAuditLogs,
  getAnalyticsStats,
  getSystemStats,
  getFilteredMediaLogs,
  deleteMediaLog,
  clearOldAuditLogs,
} from '../../services/audit.service.js';

export async function adminLogsRoutes(fastify: FastifyInstance) {
  // 1. Filtered and Sorted Audit Logs
  fastify.get('/api/admin/logs', async (request, reply) => {
    const query = request.query as any;
    const result = getFilteredAuditLogs({
      search: query.search,
      username: query.username,
      model_id: query.modelId,
      channel_id: query.channelId,
      status_type: query.statusType,
      start_date: query.startDate,
      end_date: query.endDate,
      sort_by: query.sortBy,
      sort_order: query.sortOrder,
      limit: query.limit ? parseInt(query.limit, 10) : 50,
      offset: query.offset ? parseInt(query.offset, 10) : 0,
    });
    return reply.send(result);
  });

  // 2. Comprehensive Analytics Dashboard Stats
  fastify.get('/api/admin/logs/stats', async (request, reply) => {
    const query = request.query as any;
    const timeRange = query.timeRange || '7d';
    const stats = getAnalyticsStats(timeRange);
    return reply.send(stats);
  });

  // 3. System Header Overview Stats
  fastify.get('/api/admin/stats', async (request, reply) => {
    const stats = getSystemStats();
    return reply.send(stats);
  });

  // 4. Filtered Media / Image Logs
  fastify.get('/api/admin/logs/media', async (request, reply) => {
    const query = request.query as any;
    const result = getFilteredMediaLogs({
      search: query.search,
      username: query.username,
      start_date: query.startDate,
      end_date: query.endDate,
      limit: query.limit ? parseInt(query.limit, 10) : 50,
      offset: query.offset ? parseInt(query.offset, 10) : 0,
    });
    return reply.send(result);
  });

  // 5. Delete Media Log
  fastify.delete('/api/admin/logs/media/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const success = deleteMediaLog(id);
    if (!success) {
      return reply.code(404).send({ error: '图片记录不存在或已删除' });
    }
    return reply.send({ success: true, message: '图片已成功删除' });
  });

  // 6. Clear Old Audit Logs
  fastify.post('/api/admin/logs/clear', async (request, reply) => {
    const body = (request.body || {}) as { days?: number };
    const days = body.days || 30;
    const count = clearOldAuditLogs(days);
    return reply.send({ success: true, message: `已清理 ${days} 天前的旧日志，共删除 ${count} 条记录。` });
  });
}

export const adminLogRoutes = adminLogsRoutes;


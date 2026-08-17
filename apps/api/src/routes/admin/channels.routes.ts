import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  getAllChannels,
  getChannelById,
  createChannel,
  updateChannel,
  deleteChannel,
  testChannelConnection,
  fetchChannelUpstreamModels,
} from '../../services/channel.service.js';
import { batchImportModels } from '../../services/model.service.js';

export async function adminChannelRoutes(fastify: FastifyInstance) {
  // Admin Guard
  fastify.addHook('preHandler', async (request: any, reply) => {
    try {
      const decoded = (await request.jwtVerify()) as { role: string };
      if (decoded.role !== 'ADMIN') {
        return reply.code(403).send({ error: '权限不足，仅管理员可访问' });
      }
    } catch {
      return reply.code(401).send({ error: '请先以管理员身份登录' });
    }
  });

  // Get Channels
  fastify.get('/api/admin/channels', async () => {
    return { channels: getAllChannels() };
  });

  // Create Channel
  fastify.post('/api/admin/channels', async (request, reply) => {
    const schema = z.object({
      name: z.string().min(1),
      base_url: z.string().url(),
      api_key: z.string(),
      type: z.string().optional(),
      priority: z.number().optional(),
      status: z.number().optional(),
      config_json: z.string().optional(),
    });

    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: '输入参数错误' });
    }

    const created = createChannel(parsed.data);
    return { channel: created };
  });

  // Update Channel
  fastify.put('/api/admin/channels/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const schema = z.object({
      name: z.string().optional(),
      base_url: z.string().url().optional(),
      api_key: z.string().optional(),
      type: z.string().optional(),
      priority: z.number().optional(),
      status: z.number().optional(),
      config_json: z.string().optional(),
    });

    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: '输入参数错误' });
    }

    const updated = updateChannel(id, parsed.data);
    if (!updated) {
      return reply.code(404).send({ error: '渠道未找到' });
    }

    return { channel: updated };
  });

  // Delete Channel
  fastify.delete('/api/admin/channels/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const deleted = deleteChannel(id);
    return { success: deleted };
  });

  // Test Channel Connectivity (support both POST and GET)
  const handleTest = async (request: any, reply: any) => {
    const { id } = request.params as { id: string };
    const channel = getChannelById(id);
    if (!channel) {
      return reply.code(404).send({ error: '渠道未找到' });
    }

    const testResult = await testChannelConnection(channel);
    return testResult;
  };
  fastify.post('/api/admin/channels/:id/test', handleTest);
  fastify.get('/api/admin/channels/:id/test', handleTest);

  // Sync Upstream Models from Channel (support both POST and GET)
  const handleSyncModels = async (request: any, reply: any) => {
    const { id } = request.params as { id: string };
    const channel = getChannelById(id);
    if (!channel) {
      return reply.code(404).send({ error: '渠道未找到' });
    }

    try {
      const models = await fetchChannelUpstreamModels(channel);
      return { models, total: models.length };
    } catch (err: any) {
      return reply.code(500).send({ error: `同步模型失败: ${err.message}` });
    }
  };
  fastify.post('/api/admin/channels/:id/sync-models', handleSyncModels);
  fastify.get('/api/admin/channels/:id/sync-models', handleSyncModels);

  // Batch import models for channel
  fastify.post('/api/admin/channels/:id/batch-import', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { modelIds } = (request.body as { modelIds?: string[] }) || {};

    if (!Array.isArray(modelIds) || modelIds.length === 0) {
      return reply.code(400).send({ error: '请选择要导入的模型' });
    }

    const importedCount = batchImportModels(id, modelIds);
    return { success: true, importedCount };
  });
}

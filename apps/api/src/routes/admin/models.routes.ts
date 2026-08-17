import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  getAllAdminModels,
  createModel,
  updateModel,
  deleteModel,
  clearAllModels,
} from '../../services/model.service.js';

export async function adminModelRoutes(fastify: FastifyInstance) {
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

  // Get All Models for Admin
  fastify.get('/api/admin/models', async () => {
    return { models: getAllAdminModels() };
  });

  // Create Model
  fastify.post('/api/admin/models', async (request, reply) => {
    const schema = z.object({
      model_id: z.string().min(1),
      real_model_id: z.string().optional(),
      display_name: z.string().min(1),
      channel_id: z.string().min(1),
      capabilities_json: z.string().optional(),
      is_visible_in_chat: z.number().optional(),
      enable_search_fallback: z.number().optional(),
      enable_followup: z.number().optional(),
      followup_model_id: z.string().optional(),
      is_active: z.number().optional(),
      order_index: z.number().optional(),
    });

    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: '输入参数错误' });
    }

    const created = createModel(parsed.data);
    return { model: created };
  });

  // Update Model
  fastify.put('/api/admin/models/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const schema = z.object({
      model_id: z.string().optional(),
      real_model_id: z.string().optional(),
      display_name: z.string().optional(),
      channel_id: z.string().optional(),
      capabilities_json: z.string().optional(),
      is_visible_in_chat: z.number().optional(),
      enable_search_fallback: z.number().optional(),
      enable_followup: z.number().optional(),
      followup_model_id: z.string().optional(),
      is_active: z.number().optional(),
      order_index: z.number().optional(),
    });

    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: '输入参数错误' });
    }

    const updated = updateModel(id, parsed.data);
    if (!updated) {
      return reply.code(404).send({ error: '模型未找到' });
    }

    return { model: updated };
  });

  // Clear All Models
  fastify.delete('/api/admin/models/clear-all', async (request, reply) => {
    const count = clearAllModels();
    return { success: true, count, message: `已成功清空所有模型映射（共删除 ${count} 个模型）` };
  });

  fastify.post('/api/admin/models/clear-all', async (request, reply) => {
    const count = clearAllModels();
    return { success: true, count, message: `已成功清空所有模型映射（共删除 ${count} 个模型）` };
  });

  // Delete Single Model
  fastify.delete('/api/admin/models/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const deleted = deleteModel(id);
    return { success: deleted };
  });
}

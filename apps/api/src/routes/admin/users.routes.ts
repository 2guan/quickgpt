import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  getAllUsers,
  adminUpdateUser,
  adminResetUserPassword,
  adminDeleteUser,
} from '../../services/auth.service.js';
import { getUserConversations, getAdminUserMessages } from '../../services/chat.service.js';

export async function adminUserRoutes(fastify: FastifyInstance) {
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

  // 1. Get All Users
  fastify.get('/api/admin/users', async () => {
    return { users: getAllUsers() };
  });

  // 2. Update User (Role, Status, Email)
  fastify.put('/api/admin/users/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const schema = z.object({
      role: z.enum(['PENDING', 'USER', 'ADMIN']).optional(),
      status: z.enum(['ACTIVE', 'DISABLED', 'BANNED']).optional(),
      email: z.string().email().optional().or(z.literal('')),
    });

    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: '输入参数错误' });
    }

    try {
      adminUpdateUser(id, parsed.data);
      return { success: true };
    } catch (err: any) {
      return reply.code(400).send({ error: err.message });
    }
  });

  // 3. Reset User Password
  fastify.post('/api/admin/users/:id/reset-password', async (request, reply) => {
    const { id } = request.params as { id: string };
    const schema = z.object({
      newPassword: z.string().min(6),
    });

    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: '新密码至少 6 位' });
    }

    try {
      adminResetUserPassword(id, parsed.data.newPassword);
      return { success: true, message: '密码已重置' };
    } catch (err: any) {
      return reply.code(400).send({ error: err.message });
    }
  });

  // 4. Delete User
  fastify.delete('/api/admin/users/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    adminDeleteUser(id);
    return { success: true };
  });

  // 5. Audit: Get User Conversations
  fastify.get('/api/admin/users/:id/conversations', async (request) => {
    const { id } = request.params as { id: string };
    const conversations = getUserConversations(id);
    return { conversations };
  });

  // 6. Audit: Get Conversation Messages
  fastify.get('/api/admin/conversations/:id/messages', async (request) => {
    const { id } = request.params as { id: string };
    const messages = getAdminUserMessages(id);
    return { messages };
  });
}

import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getPublicModels } from '../services/model.service.js';
import { db } from '../db/sqlite.js';
import {
  getUserConversations,
  getConversationMessages,
  createConversation,
  updateConversation,
  deleteConversation,
  saveMessage,
  handleStreamChat,
} from '../services/chat.service.js';
import { findUserById } from '../services/auth.service.js';

export async function chatRoutes(fastify: FastifyInstance) {
  // 1. Get Public Models available for chat
  fastify.get('/api/models', async (request, reply) => {
    const models = getPublicModels();
    return { models };
  });

  fastify.get('/api/models/public', async (request, reply) => {
    const models = getPublicModels();
    return { models };
  });

  // Auth Guard Hook for subsequent conversation/chat routes
  const requireAuthUser = async (request: any, reply: any) => {
    try {
      const decoded = (await request.jwtVerify()) as { id: string };
      const user = findUserById(decoded.id);
      if (!user) {
        return reply.code(401).send({ error: '用户不存在' });
      }
      if (user.status === 'BANNED' || user.status === 'DISABLED') {
        return reply.code(403).send({ error: '账号已被停用' });
      }
      if (user.role === 'PENDING') {
        return reply.code(403).send({ error: '账号待管理员审核通过后方可使用对话功能', code: 'PENDING_APPROVAL' });
      }
      request.user = user;
    } catch {
      return reply.code(401).send({ error: '请先登录' });
    }
  };

  // 2. Get User Conversations
  fastify.get('/api/conversations', { preHandler: [requireAuthUser] }, async (request: any, reply) => {
    const conversations = getUserConversations(request.user.id);
    return { conversations };
  });

  // 3. Create Conversation
  fastify.post('/api/conversations', { preHandler: [requireAuthUser] }, async (request: any, reply) => {
    const schema = z.object({
      title: z.string().optional(),
      modelIds: z.array(z.string()).optional(),
    });
    const parsed = schema.safeParse(request.body);
    const conv = createConversation(
      request.user.id,
      parsed.success ? parsed.data.title : undefined,
      parsed.success ? parsed.data.modelIds : undefined
    );
    return { conversation: conv };
  });

  // 4. Update Conversation
  fastify.put('/api/conversations/:id', { preHandler: [requireAuthUser] }, async (request: any, reply) => {
    const { id } = request.params as { id: string };
    const schema = z.object({
      title: z.string().optional(),
      is_pinned: z.number().optional(),
    });
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: '参数不合法' });
    }
    updateConversation(id, request.user.id, parsed.data);
    return { success: true };
  });

  // 5. Delete Conversation
  fastify.delete('/api/conversations/:id', { preHandler: [requireAuthUser] }, async (request: any, reply) => {
    const { id } = request.params as { id: string };
    const deleted = deleteConversation(id, request.user.id);
    return { success: deleted };
  });

  // 6. Get Conversation Messages
  fastify.get('/api/conversations/:id/messages', { preHandler: [requireAuthUser] }, async (request: any, reply) => {
    const { id } = request.params as { id: string };
    const messages = getConversationMessages(id, request.user.id);
    return { messages };
  });

  // 7. Stream Chat (Supports 1 to 4 models concurrently)
  fastify.post('/api/chat/stream', { preHandler: [requireAuthUser] }, async (request: any, reply) => {
    const schema = z.object({
      conversationId: z.string(),
      modelIds: z.array(z.string()).min(1).max(4),
      content: z.string(),
      messages: z.array(
        z.object({
          role: z.string(),
          content: z.string(),
          reasoning_content: z.string().optional(),
        })
      ),
      attachments: z
        .array(
          z.object({
            id: z.string().optional(),
            name: z.string(),
            url: z.string().optional(),
            text: z.string().optional(),
            type: z.string(),
          })
        )
        .optional(),
      enableSearch: z.boolean().optional(),
      imageParams: z
        .object({
          size: z.string().optional(),
          quality: z.string().optional(),
          style: z.string().optional(),
          aspect_ratio: z.string().optional(),
        })
        .optional(),
    });

    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: '请求格式错误', details: parsed.error.format() });
    }

    const { conversationId, modelIds, content, messages, attachments, enableSearch, imageParams } = parsed.data;

    // Ensure conversation exists in DB for this user (auto-create if missing)
    let actualConvId = conversationId;
    const checkConv = db.prepare('SELECT id FROM conversations WHERE id = ? AND user_id = ?').get(conversationId, request.user.id);
    if (!checkConv) {
      const newConv = createConversation(
        request.user.id,
        content.trim().slice(0, 24) || '新建对话',
        modelIds
      );
      actualConvId = newConv.id;
    }

    // 1. Save User Message
    saveMessage({
      conversation_id: actualConvId,
      user_id: request.user.id,
      role: 'user',
      content,
      attachments_json: JSON.stringify(attachments || []),
    });

    // Auto-update conversation title if default
    const existingMessages = getConversationMessages(actualConvId, request.user.id);
    if (existingMessages.length <= 2) {
      const summaryTitle = content.trim().slice(0, 24) || '新对话';
      updateConversation(actualConvId, request.user.id, { title: summaryTitle });
    }

    // Set SSE Headers
    reply.raw.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    reply.raw.setHeader('Cache-Control', 'no-cache, no-transform');
    reply.raw.setHeader('Connection', 'keep-alive');
    reply.raw.setHeader('X-Accel-Buffering', 'no');
    reply.raw.flushHeaders();

    // Send conversationId sync event
    reply.raw.write(`data: ${JSON.stringify({ conversationId: actualConvId })}\n\n`);

    const clientIp = request.ip || '127.0.0.1';

    // 2. Launch Stream tasks concurrently for all selected models (1 ~ 4 models)
    try {
      const tasks = modelIds.map(async (mId) => {
        try {
          await handleStreamChat({
            user: request.user,
            conversationId: actualConvId,
            modelId: mId,
            messages,
            attachments,
            enableSearch,
            imageParams,
            reply,
            clientIp,
          });
        } catch (err: any) {
          reply.raw.write(`data: ${JSON.stringify({ error: err.message, modelId: mId })}\n\n`);
        }
      });

      await Promise.all(tasks);
    } catch (err: any) {
      reply.raw.write(`data: ${JSON.stringify({ error: `全局流式异常: ${err.message}` })}\n\n`);
    } finally {
      reply.raw.write(`data: ${JSON.stringify({ allDone: true })}\n\n`);
      reply.raw.end();
    }
  });
}

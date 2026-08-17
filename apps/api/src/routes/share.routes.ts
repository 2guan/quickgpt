import { FastifyInstance } from 'fastify';
import crypto from 'node:crypto';
import { db } from '../db/sqlite.js';
import { getConversationMessages } from '../services/chat.service.js';
import { findUserById } from '../services/auth.service.js';

export async function shareRoutes(fastify: FastifyInstance) {
  // Create Share
  fastify.post('/api/share', async (request: any, reply) => {
    let user: { id: string };
    try {
      user = (await request.jwtVerify()) as { id: string };
    } catch {
      return reply.code(401).send({ error: '请先登录' });
    }

    const { conversationId } = request.body as { conversationId: string };
    if (!conversationId) {
      return reply.code(400).send({ error: '缺少 conversationId' });
    }

    const convStmt = db.prepare('SELECT * FROM conversations WHERE id = ? AND user_id = ?');
    const conv = convStmt.get(conversationId, user.id) as any;
    if (!conv) {
      return reply.code(404).send({ error: '对话不存在' });
    }

    const messages = getConversationMessages(conversationId, user.id);

    // Sanitize messages for public sharing: retain text and images, strip internal raw attachment text/download
    const sanitizedMessages = messages.map(m => ({
      id: m.id,
      role: m.role,
      model_id: m.model_id,
      content: m.content,
      reasoning_content: m.reasoning_content,
      search_results_json: m.search_results_json,
      created_at: m.created_at,
    }));

    const shareCode = `s_${crypto.randomBytes(6).toString('hex')}`;
    const shareId = `share_${crypto.randomBytes(8).toString('hex')}`;
    const now = new Date().toISOString();

    const insertStmt = db.prepare(`
      INSERT INTO shares (id, conversation_id, user_id, share_code, title, snapshot_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    insertStmt.run(
      shareId,
      conversationId,
      user.id,
      shareCode,
      conv.title,
      JSON.stringify(sanitizedMessages),
      now
    );

    return {
      shareCode,
      shareUrl: `/share/${shareCode}`,
    };
  });

  // Get Public Share Snapshot
  fastify.get('/api/share/:code', async (request, reply) => {
    const { code } = request.params as { code: string };
    const stmt = db.prepare('SELECT * FROM shares WHERE share_code = ?');
    const share = stmt.get(code) as any;

    if (!share) {
      return reply.code(404).send({ error: '分享链接不存在或已失效' });
    }

    return {
      title: share.title,
      createdAt: share.created_at,
      messages: JSON.parse(share.snapshot_json || '[]'),
    };
  });
}

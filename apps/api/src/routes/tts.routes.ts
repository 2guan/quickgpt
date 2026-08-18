import { FastifyInstance } from 'fastify';
import { streamSynthesizeSpeech } from '../services/tts.service.js';

export async function ttsRoutes(fastify: FastifyInstance) {
  // Low-latency streaming speech synthesis endpoint
  fastify.post('/api/chat/tts', async (request, reply) => {
    let user: { id: string; username: string } | null = null;
    try {
      user = (await request.jwtVerify()) as { id: string; username: string };
    } catch {
      return reply.code(401).send({ error: '请先登录' });
    }

    const body = (request.body || {}) as { text?: string; modelId?: string; voice?: string };
    const text = body.text?.trim();

    if (!text) {
      return reply.code(400).send({ error: '文本内容不能为空' });
    }

    try {
      const handled = await streamSynthesizeSpeech(
        {
          text,
          modelId: body.modelId,
          voice: body.voice,
        },
        reply
      );

      if (!handled) {
        // No TTS channel configured - respond with fallback indicator so client can use Web Speech API
        return reply.code(404).send({
          fallback: true,
          message: '未配置后台 TTS 语音渠道，可使用浏览器本地语音合成',
        });
      }
    } catch (err: any) {
      if (!reply.raw.headersSent) {
        return reply.code(500).send({
          fallback: true,
          error: err.message || '语音合成失败',
        });
      }
    }
  });

  // Also support standard OpenAI /v1/audio/speech alias
  fastify.post('/api/audio/speech', async (request, reply) => {
    let user: { id: string; username: string } | null = null;
    try {
      user = (await request.jwtVerify()) as { id: string; username: string };
    } catch {
      return reply.code(401).send({ error: '请先登录' });
    }

    const body = (request.body || {}) as { input?: string; model?: string; voice?: string };
    const text = body.input?.trim();

    if (!text) {
      return reply.code(400).send({ error: '文本内容不能为空' });
    }

    try {
      const handled = await streamSynthesizeSpeech(
        {
          text,
          modelId: body.model,
          voice: body.voice,
        },
        reply
      );

      if (!handled) {
        return reply.code(404).send({ error: 'No active TTS model configured' });
      }
    } catch (err: any) {
      if (!reply.raw.headersSent) {
        return reply.code(500).send({ error: err.message });
      }
    }
  });
}

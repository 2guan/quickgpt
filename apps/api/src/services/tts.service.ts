import { FastifyReply } from 'fastify';
import { db } from '../db/sqlite.js';
import { getChatUrlCandidates } from './chat.service.js';

export interface TTSRequest {
  text: string;
  modelId?: string;
  voice?: string;
}

// Generate a streaming 44-byte WAV header for PCM16 audio (24000Hz, 1 channel, 16-bit)
function createWavHeader(sampleRate = 24000, numChannels = 1, bitsPerSample = 16): Buffer {
  const buffer = Buffer.alloc(44);
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);

  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(0x7fffffff, 4); // Max streaming chunk size
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16); // Subchunk1Size (16 for PCM)
  buffer.writeUInt16LE(1, 20); // AudioFormat 1 (PCM)
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(0x7fffffff, 40); // Max streaming data size

  return buffer;
}

// Clean markdown, code fences, and symbols for clean spoken voice synthesis
export function cleanTextForSpeech(rawText: string): string {
  if (!rawText) return '';

  let text = rawText;

  // 1. Remove thinking / reasoning blocks <think>...</think>
  text = text.replace(/<think[\s\S]*?<\/think>/gi, '');

  // 2. Remove code blocks ```lang ... ```
  text = text.replace(/```[\s\S]*?```/g, ' [代码块已省略] ');

  // 3. Remove inline code `...`
  text = text.replace(/`([^`]+)`/g, '$1');

  // 4. Remove Markdown links [text](url) -> text
  text = text.replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1');

  // 5. Remove Markdown image tags ![alt](url)
  text = text.replace(/!\[([^\]]*)\]\([^\)]+\)/g, '');

  // 6. Remove Markdown headers, bold, italics, strikethrough, blockquotes
  text = text.replace(/^[#>\-\*\+]\s+/gm, '');
  text = text.replace(/(\*\*|__)(.*?)\1/g, '$2');
  text = text.replace(/(\*|_)(.*?)\1/g, '$2');
  text = text.replace(/~~(.*?)~~/g, '$1');

  // 7. Remove LaTeX math blocks $$...$$ and \(...\)
  text = text.replace(/\$\$[\s\S]*?\$\$/g, ' [公式] ');
  text = text.replace(/\$([^\$]+)\$/g, '$1');
  text = text.replace(/\\\[[\s\S]*?\\\]/g, ' [公式] ');
  text = text.replace(/\\\(([^\)]+)\\\)/g, '$1');

  // 8. Collapse excessive whitespace and newlines
  text = text.replace(/\n{2,}/g, '\n').trim();

  // Limit synthesis length to prevent huge payload timeouts (first 5000 characters)
  if (text.length > 5000) {
    text = text.slice(0, 5000) + '...';
  }

  return text;
}

/**
 * Low-latency Streaming Speech Synthesis via Xiaomi MiMo TTS (mimo-v2.5-tts) or OpenAI Audio Speech
 */
export async function streamSynthesizeSpeech(
  req: TTSRequest,
  reply: FastifyReply
): Promise<boolean> {
  const text = cleanTextForSpeech(req.text);
  if (!text) {
    throw new Error('没有可朗读的有效文本内容');
  }

  // 1. Find candidate TTS model and its active channel
  let modelRow: any = null;

  if (req.modelId) {
    const stmt = db.prepare(`
      SELECT m.*, c.base_url as channel_base_url, c.api_key as channel_api_key, c.status as channel_status
      FROM models m
      JOIN channels c ON m.channel_id = c.id
      WHERE m.model_id = ? AND m.is_active = 1 AND c.status = 1
      ORDER BY c.priority DESC
      LIMIT 1
    `);
    modelRow = stmt.get(req.modelId);
  }

  // If no specific model requested or not found, look for any active TTS model (e.g. mimo-v2.5-tts, mimo-*, tts-*)
  if (!modelRow) {
    const stmt = db.prepare(`
      SELECT m.*, c.base_url as channel_base_url, c.api_key as channel_api_key, c.status as channel_status
      FROM models m
      JOIN channels c ON m.channel_id = c.id
      WHERE (m.model_id LIKE '%mimo%tts%' OR m.model_id LIKE '%tts%' OR m.real_model_id LIKE '%mimo%tts%' OR m.real_model_id LIKE '%tts%')
        AND m.is_active = 1 AND c.status = 1
      ORDER BY 
        CASE 
          WHEN m.model_id LIKE '%mimo%tts%' THEN 1
          WHEN m.model_id LIKE '%tts-1%' THEN 2
          ELSE 3
        END,
        c.priority DESC,
        m.order_index ASC
      LIMIT 1
    `);
    modelRow = stmt.get();
  }

  if (!modelRow) {
    // No dedicated TTS model configured in channels
    return false;
  }

  const baseUrl = modelRow.channel_base_url.replace(/\/+$/, '');
  const apiKey = modelRow.channel_api_key;
  const modelName = modelRow.real_model_id || modelRow.model_id;
  const voice = req.voice || 'Chloe';

  const isMimoTTS = modelName.toLowerCase().includes('mimo');

  if (isMimoTTS) {
    // --- Xiaomi MiMo Speech Synthesis v2.5 Low-Latency Streaming ---
    const chatUrls = getChatUrlCandidates(baseUrl);
    let upstreamRes: Response | null = null;
    let lastError: Error | null = null;

    for (const chatUrl of chatUrls) {
      try {
        const payload = {
          model: modelName,
          messages: [
            {
              role: 'user',
              content: '用自然生动的语气朗读。',
            },
            {
              role: 'assistant',
              content: text,
            },
          ],
          audio: {
            format: 'pcm16',
            voice: voice,
          },
          stream: true,
        };

        upstreamRes = await fetch(chatUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'api-key': apiKey,
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(60000),
        });

        if (upstreamRes.ok && upstreamRes.body) {
          break;
        }

        const errText = await upstreamRes.text();
        lastError = new Error(`MiMo TTS API Error [${upstreamRes.status}]: ${errText}`);
      } catch (err: any) {
        lastError = err;
      }
    }

    if (!upstreamRes || !upstreamRes.ok || !upstreamRes.body) {
      throw lastError || new Error('无法连接至小米 MiMo TTS 语音服务');
    }

    // Set streaming headers
    reply.raw.writeHead(200, {
      'Content-Type': 'audio/wav',
      'Transfer-Encoding': 'chunked',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
      'X-TTS-Model': modelName,
      'Access-Control-Allow-Origin': '*',
    });

    // Write standard 44-byte WAV header first so browsers can stream-decode pcm16 bytes as standard WAV
    reply.raw.write(createWavHeader(24000, 1, 16));

    const reader = upstreamRes.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith(':')) continue;

          if (trimmed === 'data: [DONE]') {
            break;
          }

          if (trimmed.startsWith('data: ')) {
            const jsonStr = trimmed.slice(6);
            try {
              const parsed = JSON.parse(jsonStr);
              // Extract streaming base64 audio chunk from delta.audio.data
              const base64Audio = parsed?.choices?.[0]?.delta?.audio?.data;
              if (base64Audio) {
                const chunkBuffer = Buffer.from(base64Audio, 'base64');
                reply.raw.write(chunkBuffer);
              }
            } catch {
              // Ignore partial JSON parse errors in stream
            }
          }
        }
      }
    } finally {
      reply.raw.end();
    }

    return true;
  }

  // --- OpenAI / Standard Audio Speech Protocol Streaming ---
  const speechUrl = baseUrl.endsWith('/v1') ? `${baseUrl}/audio/speech` : `${baseUrl}/v1/audio/speech`;

  try {
    const upstreamRes = await fetch(speechUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: modelName,
        input: text,
        voice: voice === 'default' ? 'alloy' : voice,
        response_format: 'mp3',
      }),
      signal: AbortSignal.timeout(60000),
    });

    if (!upstreamRes.ok || !upstreamRes.body) {
      const errText = await upstreamRes.text();
      throw new Error(`OpenAI TTS Error [${upstreamRes.status}]: ${errText}`);
    }

    reply.raw.writeHead(200, {
      'Content-Type': upstreamRes.headers.get('content-type') || 'audio/mpeg',
      'Transfer-Encoding': 'chunked',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
      'X-TTS-Model': modelName,
      'Access-Control-Allow-Origin': '*',
    });

    const reader = upstreamRes.body.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        reply.raw.write(Buffer.from(value));
      }
    } finally {
      reply.raw.end();
    }

    return true;
  } catch (err: any) {
    throw new Error(`TTS 流式合成失败: ${err.message}`);
  }
}

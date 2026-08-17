import { db } from '../db/sqlite.js';
import crypto from 'node:crypto';

export interface Channel {
  id: string;
  name: string;
  base_url: string;
  api_key: string;
  type: string;
  priority: number;
  status: number;
  config_json: string;
  created_at: string;
  updated_at: string;
}

export function getAllChannels(): Channel[] {
  const stmt = db.prepare('SELECT * FROM channels ORDER BY priority ASC, created_at ASC');
  return stmt.all() as unknown as Channel[];
}

export function getChannelById(id: string): Channel | null {
  const stmt = db.prepare('SELECT * FROM channels WHERE id = ?');
  const row = stmt.get(id);
  return (row as unknown as Channel) || null;
}

export function getActiveChannels(): Channel[] {
  const stmt = db.prepare('SELECT * FROM channels WHERE status = 1 ORDER BY priority ASC, created_at ASC');
  return stmt.all() as unknown as Channel[];
}

export function createChannel(data: {
  name: string;
  base_url: string;
  api_key: string;
  type?: string;
  priority?: number;
  status?: number;
  config_json?: string;
}): Channel {
  const id = `chan_${crypto.randomBytes(6).toString('hex')}`;
  const now = new Date().toISOString();

  const stmt = db.prepare(`
    INSERT INTO channels (id, name, base_url, api_key, type, priority, status, config_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    id,
    data.name,
    data.base_url,
    data.api_key,
    data.type || 'openai',
    data.priority ?? 1,
    data.status ?? 1,
    data.config_json || '{}',
    now,
    now
  );

  return getChannelById(id)!;
}

export function updateChannel(
  id: string,
  data: Partial<Channel>
): Channel | null {
  const channel = getChannelById(id);
  if (!channel) return null;

  const now = new Date().toISOString();
  const stmt = db.prepare(`
    UPDATE channels
    SET name = ?, base_url = ?, api_key = ?, type = ?, priority = ?, status = ?, config_json = ?, updated_at = ?
    WHERE id = ?
  `);

  stmt.run(
    data.name ?? channel.name,
    data.base_url ?? channel.base_url,
    data.api_key ?? channel.api_key,
    data.type ?? channel.type,
    data.priority ?? channel.priority,
    data.status ?? channel.status,
    data.config_json ?? channel.config_json,
    now,
    id
  );

  return getChannelById(id);
}

export function deleteChannel(id: string): boolean {
  const stmt = db.prepare('DELETE FROM channels WHERE id = ?');
  const res = stmt.run(id);
  return res.changes > 0;
}

export async function testChannelConnection(channel: Channel): Promise<{ success: boolean; latencyMs: number; message: string }> {
  const startTime = Date.now();
  let cleanBaseUrl = channel.base_url.replace(/\/+$/, '');

  try {
    const urlsToTry = [
      cleanBaseUrl.endsWith('/models') ? cleanBaseUrl : `${cleanBaseUrl}/models`,
      cleanBaseUrl.endsWith('/v1') ? `${cleanBaseUrl}/models` : `${cleanBaseUrl}/v1/models`,
    ];

    let lastError = '';
    for (const url of urlsToTry) {
      try {
        const res = await fetch(url, {
          headers: {
            Authorization: `Bearer ${channel.api_key}`,
            'User-Agent': 'QuickGPT2-HealthCheck/1.0',
          },
          signal: AbortSignal.timeout(8000),
        });

        const latencyMs = Date.now() - startTime;
        if (res.ok) {
          return { success: true, latencyMs, message: `连接成功 (HTTP ${res.status})` };
        } else {
          const errText = await res.text().catch(() => '');
          lastError = `HTTP ${res.status}: ${errText.slice(0, 100)}`;
        }
      } catch (err: any) {
        lastError = err.message;
      }
    }

    const latencyMs = Date.now() - startTime;
    return { success: false, latencyMs, message: lastError || '上游接口响应异常' };
  } catch (error: any) {
    const latencyMs = Date.now() - startTime;
    return { success: false, latencyMs, message: `网络错误: ${error.message}` };
  }
}

export async function fetchChannelUpstreamModels(channel: Channel): Promise<string[]> {
  let cleanBaseUrl = channel.base_url.replace(/\/+$/, '');
  const urlsToTry = [
    cleanBaseUrl.endsWith('/models') ? cleanBaseUrl : `${cleanBaseUrl}/models`,
    cleanBaseUrl.endsWith('/v1') ? `${cleanBaseUrl}/models` : `${cleanBaseUrl}/v1/models`,
  ];

  let lastStatus = 0;
  let lastErrText = '';

  for (const url of urlsToTry) {
    try {
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${channel.api_key}`,
          'User-Agent': 'QuickGPT2-ModelSync/1.0',
        },
        signal: AbortSignal.timeout(10000),
      });

      if (!res.ok) {
        lastStatus = res.status;
        lastErrText = await res.text().catch(() => '');
        continue;
      }

      const json = (await res.json()) as any;
      if (Array.isArray(json.data)) {
        return json.data.map((item: any) => (typeof item === 'string' ? item : item.id)).filter(Boolean);
      }
      if (Array.isArray(json.models)) {
        return json.models.map((item: any) => (typeof item === 'string' ? item : item.id || item.name)).filter(Boolean);
      }
      if (Array.isArray(json)) {
        return json.map((item: any) => (typeof item === 'string' ? item : item.id || item.name)).filter(Boolean);
      }
      if (json.result && Array.isArray(json.result)) {
        return json.result.map((item: any) => (typeof item === 'string' ? item : item.id || item.name)).filter(Boolean);
      }
      return [];
    } catch (err: any) {
      lastErrText = err.message;
    }
  }

  throw new Error(`上游响应异常 (HTTP ${lastStatus}): ${lastErrText.slice(0, 150) || '无法解析模型列表'}`);
}

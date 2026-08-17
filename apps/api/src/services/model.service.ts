import { db } from '../db/sqlite.js';
import crypto from 'node:crypto';

export interface ModelEntity {
  id: string;
  model_id: string;
  real_model_id: string;
  display_name: string;
  channel_id: string;
  channel_name?: string;
  capabilities_json: string;
  is_visible_in_chat: number;
  enable_search_fallback: number;
  enable_followup: number;
  followup_model_id: string;
  is_active: number;
  order_index: number;
  created_at: string;
  updated_at: string;
}

export function getPublicModels(): ModelEntity[] {
  // Query all active models ordered by channel priority DESC and model order_index ASC
  const stmt = db.prepare(`
    SELECT m.*, c.name as channel_name, c.priority as channel_priority
    FROM models m
    JOIN channels c ON m.channel_id = c.id
    WHERE m.is_active = 1 AND m.is_visible_in_chat = 1 AND c.status = 1
    ORDER BY c.priority DESC, m.order_index ASC, m.created_at ASC
  `);
  const all = stmt.all() as any[];

  // Deduplicate by model_id, preserving the highest-priority channel configuration
  const map = new Map<string, any>();
  for (const item of all) {
    if (!map.has(item.model_id)) {
      map.set(item.model_id, item);
    }
  }
  return Array.from(map.values());
}

export function getAllAdminModels(): ModelEntity[] {
  const stmt = db.prepare(`
    SELECT m.*, c.name as channel_name, c.priority as channel_priority
    FROM models m
    LEFT JOIN channels c ON m.channel_id = c.id
    ORDER BY c.priority DESC, m.order_index ASC, m.created_at DESC
  `);
  return stmt.all() as unknown as ModelEntity[];
}

export function getModelByIdOrModelId(identifier: string): (ModelEntity & { channel_base_url: string; channel_api_key: string }) | undefined {
  const stmt = db.prepare(`
    SELECT m.*, c.base_url as channel_base_url, c.api_key as channel_api_key, c.name as channel_name, c.priority as channel_priority
    FROM models m
    LEFT JOIN channels c ON m.channel_id = c.id
    WHERE (m.id = ? OR m.model_id = ?) AND m.is_active = 1 AND c.status = 1
    ORDER BY c.priority DESC
    LIMIT 1
  `);
  return stmt.get(identifier, identifier) as any;
}

export function createModel(data: Partial<ModelEntity>): ModelEntity {
  const id = `model_${crypto.randomBytes(6).toString('hex')}`;
  const now = new Date().toISOString();
  
  const stmt = db.prepare(`
    INSERT INTO models (
      id, model_id, real_model_id, display_name, channel_id, 
      capabilities_json, is_visible_in_chat, enable_search_fallback, 
      enable_followup, followup_model_id, is_active, order_index, 
      created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    id,
    data.model_id || 'custom-model',
    data.real_model_id || data.model_id || 'custom-model',
    data.display_name || data.model_id || 'Custom Model',
    data.channel_id || '',
    data.capabilities_json || JSON.stringify(['text']),
    data.is_visible_in_chat ?? 1,
    data.enable_search_fallback ?? 1,
    data.enable_followup ?? 0,
    data.followup_model_id || '',
    data.is_active ?? 1,
    data.order_index ?? 0,
    now,
    now
  );

  const getStmt = db.prepare('SELECT * FROM models WHERE id = ?');
  return getStmt.get(id) as unknown as ModelEntity;
}

export function updateModel(id: string, data: Partial<ModelEntity>): ModelEntity | undefined {
  const now = new Date().toISOString();
  const getStmt = db.prepare('SELECT * FROM models WHERE id = ?');
  const existing = getStmt.get(id) as unknown as ModelEntity | undefined;
  if (!existing) return undefined;

  const stmt = db.prepare(`
    UPDATE models
    SET model_id = ?, real_model_id = ?, display_name = ?, channel_id = ?,
        capabilities_json = ?, is_visible_in_chat = ?, enable_search_fallback = ?,
        enable_followup = ?, followup_model_id = ?, is_active = ?, order_index = ?,
        updated_at = ?
    WHERE id = ?
  `);

  stmt.run(
    data.model_id ?? existing.model_id,
    data.real_model_id ?? existing.real_model_id,
    data.display_name ?? existing.display_name,
    data.channel_id ?? existing.channel_id,
    data.capabilities_json ?? existing.capabilities_json,
    data.is_visible_in_chat ?? existing.is_visible_in_chat,
    data.enable_search_fallback ?? existing.enable_search_fallback,
    data.enable_followup ?? existing.enable_followup,
    data.followup_model_id ?? existing.followup_model_id,
    data.is_active ?? existing.is_active,
    data.order_index ?? existing.order_index,
    now,
    id
  );

  return getStmt.get(id) as unknown as ModelEntity;
}

export function deleteModel(id: string): boolean {
  const stmt = db.prepare('DELETE FROM models WHERE id = ?');
  const res = stmt.run(id);
  return res.changes > 0;
}

export function toggleModelStatus(id: string): ModelEntity | undefined {
  const getStmt = db.prepare('SELECT * FROM models WHERE id = ?');
  const existing = getStmt.get(id) as unknown as ModelEntity | undefined;
  if (!existing) return undefined;

  const nextActive = existing.is_active ? 0 : 1;
  const now = new Date().toISOString();

  const stmt = db.prepare('UPDATE models SET is_active = ?, updated_at = ? WHERE id = ?');
  stmt.run(nextActive, now, id);

  return getStmt.get(id) as unknown as ModelEntity;
}

export function detectCapabilities(rawModelId: string, upstreamType?: string): string[] {
  const id = rawModelId.toLowerCase().trim();
  const upType = (upstreamType || '').toLowerCase().trim();

  // 1. Image generation models
  const isImage =
    upType === 'image' ||
    upType.includes('image') ||
    id.startsWith('jimeng') ||
    id.includes('jimeng') ||
    id.includes('dall') ||
    id.includes('flux') ||
    id.includes('wanx') ||
    id.includes('wan-') ||
    id.includes('wan2') ||
    id.includes('t2i') ||
    id.includes('i2i') ||
    id.includes('text2img') ||
    id.includes('img2img') ||
    id.includes('midjourney') ||
    id.startsWith('mj-') ||
    id.includes('stable-diffusion') ||
    id.startsWith('sd-') ||
    id.startsWith('sdxl') ||
    id.startsWith('sd3') ||
    id.includes('cogview') ||
    id.includes('kolors') ||
    id.includes('kling') ||
    id.includes('ideogram') ||
    id.includes('recraft') ||
    id.includes('imagen') ||
    id.includes('image');

  if (isImage) {
    return ['image'];
  }

  // 2. Reasoning models (R1, o1, o3, etc.)
  const isReasoning =
    upType === 'reasoning' ||
    id.includes('r1') ||
    id.includes('reason') ||
    id.includes('think') ||
    id.includes('qwq') ||
    id.includes('o1') ||
    id.includes('o3') ||
    id.includes('o4');

  // 3. Vision / Multimodal models
  const isVision =
    upType === 'vision' ||
    id.includes('vision') ||
    id.includes('vl') ||
    id.includes('4o') ||
    id.includes('omni') ||
    id.includes('gemini-1.5') ||
    id.includes('gemini-2') ||
    id.includes('claude-3');

  const caps = ['text'];
  if (isReasoning) caps.push('reasoning');
  if (isVision) caps.push('vision');

  return caps;
}

export function autoHealModelCapabilities(): void {
  try {
    const models = db.prepare('SELECT id, model_id, capabilities_json FROM models').all() as any[];
    const updateStmt = db.prepare('UPDATE models SET capabilities_json = ? WHERE id = ?');
    for (const m of models) {
      let currentCaps: string[] = [];
      try {
        currentCaps = JSON.parse(m.capabilities_json || '[]');
      } catch {
        currentCaps = ['text'];
      }
      const detected = detectCapabilities(m.model_id);
      const isDetectedImage = detected.includes('image');
      const isCurrentHasImage = currentCaps.includes('image');

      if (isDetectedImage && !isCurrentHasImage) {
        updateStmt.run(JSON.stringify(['image']), m.id);
      }
    }
  } catch (err) {
    console.error('Failed to auto-heal model capabilities:', err);
  }
}

export function batchImportModels(channelId: string, modelIds: string[]): number {
  let importedCount = 0;
  const now = new Date().toISOString();

  for (const rawModelId of modelIds) {
    const trimmed = rawModelId.trim();
    if (!trimmed) continue;

    // Check if model already exists for this channel
    const checkStmt = db.prepare('SELECT id FROM models WHERE channel_id = ? AND (model_id = ? OR real_model_id = ?)');
    const exists = checkStmt.get(channelId, trimmed, trimmed);
    if (!exists) {
      const caps = detectCapabilities(trimmed);

      const id = `model_${crypto.randomBytes(6).toString('hex')}`;
      const stmt = db.prepare(`
        INSERT INTO models (
          id, model_id, real_model_id, display_name, channel_id, 
          capabilities_json, is_visible_in_chat, enable_search_fallback, 
          enable_followup, followup_model_id, is_active, order_index, 
          created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, 1, 1, 0, '', 1, 0, ?, ?)
      `);
      stmt.run(id, trimmed, trimmed, trimmed, channelId, JSON.stringify(caps), now, now);
      importedCount++;
    }
  }

  return importedCount;
}

export function clearAllModels(): number {
  const stmt = db.prepare('DELETE FROM models');
  const res = stmt.run();
  return Number(res.changes);
}



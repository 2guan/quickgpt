import { DatabaseSync } from 'node:sqlite';
import bcrypt from 'bcryptjs';
import { ENV } from '../config/env.js';

export let db: DatabaseSync;

export function initDatabase() {
  db = new DatabaseSync(ENV.DB_PATH);

  // Performance Pragmas
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA synchronous = NORMAL;');
  db.exec('PRAGMA cache_size = -64000;'); // 64MB cache
  db.exec('PRAGMA temp_store = MEMORY;');
  db.exec('PRAGMA foreign_keys = ON;');

  // 1. Users Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      email TEXT,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'PENDING', -- PENDING | USER | ADMIN
      status TEXT NOT NULL DEFAULT 'ACTIVE', -- ACTIVE | DISABLED | BANNED
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  // 2. Channels Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS channels (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      base_url TEXT NOT NULL,
      api_key TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'openai',
      priority INTEGER NOT NULL DEFAULT 1,
      status INTEGER NOT NULL DEFAULT 1, -- 1: enabled, 0: disabled
      config_json TEXT DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  // 3. Models Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS models (
      id TEXT PRIMARY KEY,
      model_id TEXT NOT NULL,                -- Public model identifier exposed to frontend
      real_model_id TEXT NOT NULL,           -- Actual model identifier forwarded to upstream channel
      display_name TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      capabilities_json TEXT DEFAULT '["text"]', -- text, vision, web_search, image, reasoning
      is_visible_in_chat INTEGER NOT NULL DEFAULT 1, -- 1: visible in chat dropdown, 0: internal/followup only
      enable_search_fallback INTEGER NOT NULL DEFAULT 1, -- auto search fallback if model lacks native search
      enable_followup INTEGER NOT NULL DEFAULT 0,        -- auto generate follow-up questions
      followup_model_id TEXT DEFAULT '',                -- specific model for follow-up generation
      is_active INTEGER NOT NULL DEFAULT 1,
      order_index INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE
    );
  `);

  // 4. Conversations Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT '新建对话',
      model_ids_json TEXT NOT NULL DEFAULT '[]',
      is_pinned INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  // 5. Messages Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      parent_id TEXT DEFAULT NULL,
      role TEXT NOT NULL, -- user | assistant | system
      model_id TEXT DEFAULT '',
      content TEXT NOT NULL DEFAULT '',
      reasoning_content TEXT DEFAULT '',
      search_results_json TEXT DEFAULT '[]',
      followup_suggestions_json TEXT DEFAULT '[]',
      image_params_json TEXT DEFAULT '{}',
      attachments_json TEXT DEFAULT '[]',
      token_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  // 6. Shares Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS shares (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      share_code TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      snapshot_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
    );
  `);

  // 7. System Settings Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS system_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  // 8. Audit Logs Table (Live stream & latency/token audit)
  db.exec(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT DEFAULT '',
      username TEXT DEFAULT '',
      model_id TEXT DEFAULT '',
      channel_id TEXT DEFAULT '',
      prompt_tokens INTEGER DEFAULT 0,
      completion_tokens INTEGER DEFAULT 0,
      duration_ms INTEGER DEFAULT 0,
      status_code INTEGER DEFAULT 200,
      error_message TEXT DEFAULT '',
      ip TEXT DEFAULT '',
      created_at TEXT NOT NULL
    );
  `);

  // 9. Uploads & Media Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS uploads (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      file_name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      mime_type TEXT NOT NULL,
      is_generated_image INTEGER DEFAULT 0,
      extracted_text TEXT DEFAULT '',
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  // Create Indexes
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_conversations_user ON conversations(user_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id, created_at ASC);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_uploads_user ON uploads(user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_shares_code ON shares(share_code);
  `);

  seedInitialData();
}

function seedInitialData() {
  // Check if admin exists
  const adminStmt = db.prepare('SELECT id FROM users WHERE username = ?');
  const existingAdmin = adminStmt.get(ENV.DEFAULT_ADMIN_USERNAME);

  const now = new Date().toISOString();

  if (!existingAdmin) {
    const salt = bcrypt.genSaltSync(10);
    const hash = bcrypt.hashSync(ENV.DEFAULT_ADMIN_PASSWORD, salt);
    const insertAdmin = db.prepare(`
      INSERT INTO users (id, username, email, password_hash, role, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'ADMIN', 'ACTIVE', ?, ?)
    `);
    insertAdmin.run(
      'user_admin_root',
      ENV.DEFAULT_ADMIN_USERNAME,
      'admin@quickgpt.local',
      hash,
      now,
      now
    );
    console.log(`[Database] Initial admin created: ${ENV.DEFAULT_ADMIN_USERNAME}`);
  }

  // Seed default system settings if not exists
  const defaultSettings: Record<string, string> = {
    site_title: 'QuickGPT',
    site_subtitle: '轻量高效的多模型 AI 聚合平台',
    site_logo: '',
    site_footer: '© 2026 QuickGPT. All rights reserved.',
    registration_mode: 'OPEN', // OPEN | INVITE | CLOSED
    default_models: '["gpt-4o"]',
    global_system_prompt: 'You are a helpful, brilliant AI assistant.',
    search_provider: 'builtin', // builtin | brave | tavily | searxng | bocha | serpapi
    search_api_key: '',
    search_endpoint: '',
    search_max_results: '4',
    search_enable_deep_read: '1',
    search_deep_read_length: '2000',
  };

  // Clean up legacy search settings keys if present
  try {
    db.exec(`
      DELETE FROM system_settings WHERE key IN (
        'search_query_model_id',
        'search_query_count',
        'search_query_max_length',
        'search_results_per_query',
        'search_max_total_results'
      );
    `);
  } catch {}

  const getSettingStmt = db.prepare('SELECT value FROM system_settings WHERE key = ?');
  const setSettingStmt = db.prepare('INSERT OR REPLACE INTO system_settings (key, value) VALUES (?, ?)');

  for (const [key, val] of Object.entries(defaultSettings)) {
    const existing = getSettingStmt.get(key);
    if (!existing) {
      setSettingStmt.run(key, val);
    }
  }

  // Check if default channel exists, create an example OpenAI compatible channel if none
  const channelCountStmt = db.prepare('SELECT COUNT(*) as count FROM channels');
  const { count } = channelCountStmt.get() as { count: number };
  if (count === 0) {
    const insertChannel = db.prepare(`
      INSERT INTO channels (id, name, base_url, api_key, type, priority, status, config_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insertChannel.run(
      'chan_default_openai',
      'OpenAI 官方/兼容渠道',
      'https://api.openai.com/v1',
      'sk-placeholder',
      'openai',
      1,
      1,
      '{}',
      now,
      now
    );

    const insertModel = db.prepare(`
      INSERT INTO models (id, model_id, real_model_id, display_name, channel_id, capabilities_json, is_visible_in_chat, enable_search_fallback, enable_followup, followup_model_id, is_active, order_index, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertModel.run(
      'model_gpt4o',
      'gpt-4o',
      'gpt-4o',
      'GPT-4o',
      'chan_default_openai',
      JSON.stringify(['text', 'vision', 'reasoning']),
      1,
      1,
      1,
      'gpt-4o-mini',
      1,
      0,
      now,
      now
    );

    insertModel.run(
      'model_gpt4o_mini',
      'gpt-4o-mini',
      'gpt-4o-mini',
      'GPT-4o Mini',
      'chan_default_openai',
      JSON.stringify(['text', 'vision']),
      1,
      1,
      0,
      '',
      1,
      1,
      now,
      now
    );

    insertModel.run(
      'model_dalle3',
      'dall-e-3',
      'dall-e-3',
      'DALL-E 3 (生图)',
      'chan_default_openai',
      JSON.stringify(['image']),
      1,
      0,
      0,
      '',
      1,
      2,
      now,
      now
    );
  }
}

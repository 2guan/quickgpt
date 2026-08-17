import path from 'node:path';
import fs from 'node:fs';

const DATA_DIR = process.env.DATA_DIR || path.resolve(process.cwd(), 'data');
const UPLOADS_DIR = path.resolve(DATA_DIR, 'uploads');
const DB_PATH = path.resolve(DATA_DIR, 'quickgpt.sqlite');

// Ensure directories exist
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

export const ENV = {
  PORT: parseInt(process.env.PORT || '3000', 10),
  HOST: process.env.HOST || '0.0.0.0',
  JWT_SECRET: process.env.JWT_SECRET || 'quickgpt2-super-secret-jwt-key-2026',
  DATA_DIR,
  UPLOADS_DIR,
  DB_PATH,
  DEFAULT_ADMIN_USERNAME: process.env.DEFAULT_ADMIN_USERNAME || 'admin',
  DEFAULT_ADMIN_PASSWORD: process.env.DEFAULT_ADMIN_PASSWORD || 'admin2026',
};

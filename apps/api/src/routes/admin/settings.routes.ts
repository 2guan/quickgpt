import { FastifyInstance } from 'fastify';
import { db } from '../../db/sqlite.js';

export async function adminSettingsRoutes(fastify: FastifyInstance) {
  // Public System Settings (for login/register page and frontend branding)
  fastify.get('/api/settings/public', async () => {
    const stmt = db.prepare(`
      SELECT key, value FROM system_settings 
      WHERE key IN ('site_title', 'site_subtitle', 'admin_subtitle', 'site_logo', 'welcome_logo', 'site_footer', 'registration_mode', 'default_models')
    `);
    const rows = stmt.all() as Array<{ key: string; value: string }>;
    const result: Record<string, string> = {};
    for (const r of rows) {
      result[r.key] = r.value;
    }
    return { settings: result };
  });

  // Admin Guard for modifying/getting all settings
  fastify.register(async function (adminScoped) {
    adminScoped.addHook('preHandler', async (request: any, reply) => {
      try {
        const decoded = (await request.jwtVerify()) as { role: string };
        if (decoded.role !== 'ADMIN') {
          return reply.code(403).send({ error: '权限不足，仅管理员可访问' });
        }
      } catch {
        return reply.code(401).send({ error: '请先以管理员身份登录' });
      }
    });

    // Get All Settings
    adminScoped.get('/api/admin/settings', async () => {
      const stmt = db.prepare('SELECT key, value FROM system_settings');
      const rows = stmt.all() as Array<{ key: string; value: string }>;
      const result: Record<string, string> = {};
      for (const r of rows) {
        result[r.key] = r.value;
      }
      return { settings: result };
    });

    // Update Settings
    adminScoped.put('/api/admin/settings', async (request, reply) => {
      const settings = request.body as Record<string, string>;
      if (!settings || typeof settings !== 'object') {
        return reply.code(400).send({ error: '数据格式错误' });
      }

      const stmt = db.prepare('INSERT OR REPLACE INTO system_settings (key, value) VALUES (?, ?)');
      for (const [key, val] of Object.entries(settings)) {
        stmt.run(key, typeof val === 'string' ? val : JSON.stringify(val));
      }

      return { success: true };
    });
  });
}

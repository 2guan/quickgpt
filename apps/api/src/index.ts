import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import jwt from '@fastify/jwt';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import path from 'node:path';
import fs from 'node:fs';
import { ENV } from './config/env.js';
import { initDatabase } from './db/sqlite.js';
import { autoHealModelCapabilities } from './services/model.service.js';
import { authRoutes } from './routes/auth.routes.js';
import { chatRoutes } from './routes/chat.routes.js';
import { uploadRoutes } from './routes/upload.routes.js';
import { shareRoutes } from './routes/share.routes.js';
import { adminChannelRoutes } from './routes/admin/channels.routes.js';
import { adminModelRoutes } from './routes/admin/models.routes.js';
import { adminUserRoutes } from './routes/admin/users.routes.js';
import { adminSettingsRoutes } from './routes/admin/settings.routes.js';
import { adminLogRoutes } from './routes/admin/logs.routes.js';

async function startServer() {
  try {
    // 1. Initialize SQLite Database (WAL mode)
    initDatabase();
    autoHealModelCapabilities();

    const fastify = Fastify({
      logger: false,
      bodyLimit: 30 * 1024 * 1024, // 30MB
    });

    // 2. Middlewares
    await fastify.register(cors, {
      origin: true,
      credentials: true,
    });

    await fastify.register(cookie);

    await fastify.register(jwt, {
      secret: ENV.JWT_SECRET,
      cookie: {
        cookieName: 'token',
        signed: false,
      },
    });

    await fastify.register(multipart, {
      limits: {
        fileSize: 20 * 1024 * 1024, // 20MB
      },
    });

    // 3. Static: Uploads folder
    await fastify.register(fastifyStatic, {
      root: ENV.UPLOADS_DIR,
      prefix: '/uploads/',
      decorateReply: false,
    });

    // 4. API Routes
    await fastify.register(authRoutes);
    await fastify.register(chatRoutes);
    await fastify.register(uploadRoutes);
    await fastify.register(shareRoutes);
    await fastify.register(adminChannelRoutes);
    await fastify.register(adminModelRoutes);
    await fastify.register(adminUserRoutes);
    await fastify.register(adminSettingsRoutes);
    await fastify.register(adminLogRoutes);

    // Health check
    fastify.get('/api/health', async () => {
      return { status: 'ok', time: new Date().toISOString() };
    });

    // 5. Static: Frontend SPA build
    const possibleDistDirs = [
      path.resolve(process.cwd(), 'apps/web/dist'),
      path.resolve(process.cwd(), '../web/dist'),
      path.resolve(process.cwd(), 'dist'),
    ];

    const distPath = possibleDistDirs.find((d) => fs.existsSync(d) && fs.existsSync(path.join(d, 'index.html')));

    if (distPath) {
      await fastify.register(fastifyStatic, {
        root: distPath,
        prefix: '/',
      });

      fastify.setNotFoundHandler((request, reply) => {
        if (request.url.startsWith('/api') || request.url.startsWith('/uploads')) {
          return reply.code(404).send({ error: 'Endpoint Not Found' });
        }
        return reply.sendFile('index.html');
      });
    }

    // 6. Listen
    const address = await fastify.listen({ port: ENV.PORT, host: ENV.HOST });
    console.log(`[QuickGPT2] Server successfully listening on ${address}`);
  } catch (err: any) {
    console.error('[QuickGPT2] Fatal Startup Error:', err);
    process.exit(1);
  }
}

startServer();

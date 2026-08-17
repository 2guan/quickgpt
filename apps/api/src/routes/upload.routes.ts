import { FastifyInstance } from 'fastify';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { ENV } from '../config/env.js';
import { db } from '../db/sqlite.js';
import { extractTextFromFile } from '../services/parser.service.js';
import { getActiveChannels } from '../services/channel.service.js';

export async function uploadRoutes(fastify: FastifyInstance) {
  // 1. File Upload
  fastify.post('/api/upload', async (request, reply) => {
    let user: { id: string; username: string };
    try {
      user = (await request.jwtVerify()) as { id: string; username: string };
    } catch {
      return reply.code(401).send({ error: '请先登录' });
    }

    const data = await request.file({
      limits: {
        fileSize: 20 * 1024 * 1024, // 20MB limit
      },
    });

    if (!data) {
      return reply.code(400).send({ error: '未找到上传的文件' });
    }

    const originalName = data.filename;
    const ext = path.extname(originalName);
    const mimeType = data.mimetype;
    const fileId = `up_${crypto.randomBytes(8).toString('hex')}`;
    const savedFileName = `${fileId}${ext}`;
    const targetFilePath = path.join(ENV.UPLOADS_DIR, savedFileName);

    // Write file to disk
    const buffer = await data.toBuffer();
    fs.writeFileSync(targetFilePath, buffer);

    const fileSize = buffer.length;
    const isImage = mimeType.startsWith('image/') || /\.(png|jpe?g|webp|gif|svg)$/i.test(originalName);

    // Extract text
    let extractedText = '';
    if (!isImage) {
      extractedText = await extractTextFromFile(targetFilePath, originalName, mimeType);
    }

    const now = new Date().toISOString();
    const insertStmt = db.prepare(`
      INSERT INTO uploads (id, user_id, file_name, file_path, file_size, mime_type, is_generated_image, extracted_text, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertStmt.run(
      fileId,
      user.id,
      originalName,
      savedFileName,
      fileSize,
      mimeType,
      0,
      extractedText,
      now
    );

    const fileUrl = `/uploads/${savedFileName}`;

    return {
      id: fileId,
      fileName: originalName,
      url: fileUrl,
      fileSize,
      mimeType,
      extractedText,
      isImage,
    };
  });

  // 2. Uploads fallback / Aliasing handler for /uploads/:filename
  fastify.get('/uploads/:filename', async (request, reply) => {
    const { filename } = request.params as { filename: string };
    let localFile = path.join(ENV.UPLOADS_DIR, filename);

    if (!fs.existsSync(localFile)) {
      // Look up in database by original file_name or saved file_path
      const row = db
        .prepare('SELECT file_path FROM uploads WHERE file_name = ? OR file_path = ? ORDER BY created_at DESC LIMIT 1')
        .get(filename, filename) as { file_path: string } | undefined;
      if (row?.file_path) {
        localFile = path.join(ENV.UPLOADS_DIR, row.file_path);
      }
    }

    if (fs.existsSync(localFile)) {
      const ext = path.extname(localFile).toLowerCase();
      const contentType =
        ext === '.png' ? 'image/png' :
        ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' :
        ext === '.webp' ? 'image/webp' :
        ext === '.gif' ? 'image/gif' :
        ext === '.svg' ? 'image/svg+xml' :
        'application/octet-stream';
      reply.header('Content-Type', contentType);
      return fs.createReadStream(localFile);
    }

    return reply.code(404).send({ error: 'File not found' });
  });

  // 3. Media Proxy & Fallback handler for /api/media/*
  fastify.get('/api/media/:filename', async (request, reply) => {
    const { filename } = request.params as { filename: string };
    let localFile = path.join(ENV.UPLOADS_DIR, filename);

    if (!fs.existsSync(localFile)) {
      const row = db
        .prepare('SELECT file_path FROM uploads WHERE file_name = ? OR file_path = ? ORDER BY created_at DESC LIMIT 1')
        .get(filename, filename) as { file_path: string } | undefined;
      if (row?.file_path) {
        localFile = path.join(ENV.UPLOADS_DIR, row.file_path);
      }
    }

    // If file exists locally in uploads
    if (fs.existsSync(localFile)) {
      const ext = path.extname(localFile).toLowerCase();
      const contentType =
        ext === '.png' ? 'image/png' :
        ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' :
        ext === '.webp' ? 'image/webp' :
        ext === '.gif' ? 'image/gif' :
        ext === '.svg' ? 'image/svg+xml' :
        'application/octet-stream';
      reply.header('Content-Type', contentType);
      return fs.createReadStream(localFile);
    }

    // Try proxying to active channels (e.g. Any2API / local upstream)
    const activeChannels = getActiveChannels();
    for (const channel of activeChannels) {
      try {
        const origin = new URL(channel.base_url).origin;
        const upstreamMediaUrl = `${origin}/api/media/${filename}`;

        const res = await fetch(upstreamMediaUrl, {
          headers: {
            Authorization: `Bearer ${channel.api_key}`,
          },
          signal: AbortSignal.timeout(6000),
        });

        if (res.ok) {
          const contentType = res.headers.get('content-type') || 'image/png';
          const buffer = Buffer.from(await res.arrayBuffer());

          // Cache locally
          try {
            fs.writeFileSync(localFile, buffer);
          } catch {
            // ignore
          }

          reply.header('Content-Type', contentType);
          return reply.send(buffer);
        }
      } catch {
        // try next channel
      }
    }

    return reply.code(404).send({ error: 'Media not found' });
  });
}

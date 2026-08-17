import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { registerUser, findUserByUsername, verifyUserPassword, changeUserPassword, findUserById } from '../services/auth.service.js';

export async function authRoutes(fastify: FastifyInstance) {
  // Register
  fastify.post('/api/auth/register', async (request, reply) => {
    const schema = z.object({
      username: z.string().min(2).max(32),
      password: z.string().min(6).max(64),
      email: z.string().email().optional().or(z.literal('')),
    });

    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: '输入参数格式不合法' });
    }

    try {
      const user = registerUser(parsed.data.username, parsed.data.password, parsed.data.email);
      // Generate JWT
      const token = fastify.jwt.sign({ id: user.id, username: user.username, role: user.role });
      
      reply.setCookie('token', token, {
        path: '/',
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 3600,
      });

      return {
        token,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role,
          status: user.status,
        },
      };
    } catch (err: any) {
      return reply.code(400).send({ error: err.message });
    }
  });

  // Login
  fastify.post('/api/auth/login', async (request, reply) => {
    const schema = z.object({
      username: z.string(),
      password: z.string(),
    });

    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: '请输入用户名和密码' });
    }

    const user = findUserByUsername(parsed.data.username);
    if (!user || !verifyUserPassword(user, parsed.data.password)) {
      return reply.code(401).send({ error: '用户名或密码错误' });
    }

    if (user.status === 'BANNED' || user.status === 'DISABLED') {
      return reply.code(403).send({ error: '您的账号已被封禁或停用，请联系管理员' });
    }

    const token = fastify.jwt.sign({ id: user.id, username: user.username, role: user.role });

    reply.setCookie('token', token, {
      path: '/',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 3600,
    });

    return {
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        status: user.status,
      },
    };
  });

  // Me
  fastify.get('/api/auth/me', async (request, reply) => {
    try {
      const decoded = await request.jwtVerify() as { id: string; username: string; role: string };
      const user = findUserById(decoded.id);
      if (!user) {
        return reply.code(401).send({ error: '用户不存在' });
      }
      return {
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role,
          status: user.status,
        },
      };
    } catch (err) {
      return reply.code(401).send({ error: '未登录或登录已过期' });
    }
  });

  // Change Password
  fastify.post('/api/auth/change-password', async (request, reply) => {
    try {
      const decoded = await request.jwtVerify() as { id: string };
      const schema = z.object({
        oldPassword: z.string(),
        newPassword: z.string().min(6),
      });
      const parsed = schema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: '新密码至少 6 位' });
      }
      changeUserPassword(decoded.id, parsed.data.oldPassword, parsed.data.newPassword);
      return { success: true, message: '密码修改成功' };
    } catch (err: any) {
      return reply.code(400).send({ error: err.message });
    }
  });

  // Logout
  fastify.post('/api/auth/logout', async (request, reply) => {
    reply.clearCookie('token', { path: '/' });
    return { success: true };
  });
}

import { FastifyInstance } from 'fastify';
import { login, register, changePassword } from '../services/authService.js';
import { prisma } from '../db.js';
import { authenticate } from '../middleware/auth.js';
import bcrypt from 'bcrypt';

export async function authRoutes(fastify: FastifyInstance) {
  fastify.post('/auth/login', async (request, reply) => {
    const { username, password } = request.body as any;
    try {
      const result = await login(username, password);
      if (!result) {
        return reply.status(401).send({ error: 'Invalid credentials' });
      }
      return result;
    } catch (e: any) {
      return reply.status(400).send({ error: e.message });
    }
  });

  fastify.post('/auth/register', async (request, reply) => {
    const { username, password, inviteCode } = request.body as any;
    try {
      const result = await register(username, password, inviteCode);
      return result;
    } catch (e: any) {
      return reply.status(400).send({ error: e.message });
    }
  });

  fastify.get('/auth/me', { preHandler: [authenticate] }, async (request, reply) => {
    const user = await prisma.user.findUnique({
      where: { id: request.user!.userId },
      select: {
        id: true,
        username: true,
        role: true,
        status: true,
        quota: true,
        createdAt: true,
      },
    });
    return user;
  });

  fastify.put('/auth/password', { preHandler: [authenticate] }, async (request, reply) => {
    const { oldPassword, newPassword } = request.body as any;
    try {
      await changePassword(request.user!.userId, oldPassword, newPassword);
      return { success: true };
    } catch (e: any) {
      return reply.status(400).send({ error: e.message });
    }
  });
}

export async function adminUserRoutes(fastify: FastifyInstance) {
  fastify.get('/admin/users', { preHandler: [authenticate] }, async (request, reply) => {
    if (request.user!.role !== 'admin') {
      return reply.status(403).send({ error: 'Admin required' });
    }

    const users = await prisma.user.findMany({
      select: {
        id: true,
        username: true,
        role: true,
        status: true,
        quota: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return users;
  });

  fastify.post('/admin/users', { preHandler: [authenticate] }, async (request, reply) => {
    if (request.user!.role !== 'admin') {
      return reply.status(403).send({ error: 'Admin required' });
    }

    const { username, password, role, quota } = request.body as any;
    const hashed = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        username,
        password: hashed,
        role: role || 'member',
        status: 'active',
        quota: quota || 0,
      },
    });

    return {
      id: user.id,
      username: user.username,
      role: user.role,
      status: user.status,
      quota: user.quota,
    };
  });

  fastify.put('/admin/users/:id', { preHandler: [authenticate] }, async (request, reply) => {
    if (request.user!.role !== 'admin') {
      return reply.status(403).send({ error: 'Admin required' });
    }

    const { id } = request.params as any;
    const { status, role, quota } = request.body as any;

    const updateData: any = {};
    if (status) updateData.status = status;
    if (role) updateData.role = role;
    if (typeof quota === 'number') updateData.quota = quota;

    const user = await prisma.user.update({
      where: { id },
      data: updateData,
    });

    return {
      id: user.id,
      username: user.username,
      role: user.role,
      status: user.status,
      quota: user.quota,
    };
  });

  fastify.delete('/admin/users/:id', { preHandler: [authenticate] }, async (request, reply) => {
    if (request.user!.role !== 'admin') {
      return reply.status(403).send({ error: 'Admin required' });
    }

    const { id } = request.params as any;
    if (id === request.user!.userId) {
      return reply.status(400).send({ error: 'Cannot delete yourself' });
    }

    await prisma.user.delete({ where: { id } });
    return { success: true };
  });
}

export async function inviteRoutes(fastify: FastifyInstance) {
  fastify.get('/invite-codes', { preHandler: [authenticate] }, async (request, reply) => {
    const isAdmin = request.user!.role === 'admin';

    if (isAdmin) {
      return prisma.inviteCode.findMany({
        include: { creator: { select: { username: true } } },
        orderBy: { createdAt: 'desc' },
      });
    }

    return prisma.inviteCode.findMany({
      where: { createdBy: request.user!.userId },
      orderBy: { createdAt: 'desc' },
    });
  });

  fastify.post('/invite-codes', { preHandler: [authenticate] }, async (request, reply) => {
    const { days } = request.body as any;
    const expiresAt = new Date(Date.now() + (days || 30) * 24 * 60 * 60 * 1000);

    const code = `RBOL_${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

    const invite = await prisma.inviteCode.create({
      data: {
        code,
        expiresAt,
        createdBy: request.user!.userId,
      },
    });

    return invite;
  });

  fastify.delete('/invite-codes/:id', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = request.params as any;
    const code = await prisma.inviteCode.findUnique({ where: { id } });

    if (!code) return reply.status(404).send({ error: 'Not found' });
    if (code.usedBy) return reply.status(400).send({ error: 'Cannot delete used code' });
    if (request.user!.role !== 'admin' && code.createdBy !== request.user!.userId) {
      return reply.status(403).send({ error: 'Forbidden' });
    }

    await prisma.inviteCode.delete({ where: { id } });
    return { success: true };
  });
}
import { FastifyInstance } from 'fastify';
import { prisma } from '../db.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';
import { addQuota, resetQuota } from '../services/quotaService.js';

export async function quotaRoutes(fastify: FastifyInstance) {
  fastify.get('/quota/records', { preHandler: [authenticate] }, async (request, reply) => {
    const isAdmin = request.user!.role === 'admin';

    if (isAdmin) {
      const records = await prisma.quotaRecord.findMany({
        include: {
          user: { select: { id: true, username: true } },
          operator: { select: { username: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      });
      return records;
    }

    return prisma.quotaRecord.findMany({
      where: { userId: request.user!.userId },
      include: { operator: { select: { username: true } } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  });

  fastify.post('/admin/quota', { preHandler: [requireAdmin] }, async (request, reply) => {
    const { userId, amount, reason } = request.body as any;

    if (typeof amount !== 'number') {
      return reply.status(400).send({ error: 'Amount must be a number' });
    }

    await addQuota(userId, amount, reason || 'Manual adjustment', request.user!.userId);

    const user = await prisma.user.findUnique({ where: { id: userId } });
    return { success: true, newQuota: user?.quota };
  });

  fastify.post('/admin/quota/reset', { preHandler: [requireAdmin] }, async (request, reply) => {
    const { userId } = request.body as any;
    await resetQuota(userId, request.user!.userId);
    return { success: true, newQuota: 0 };
  });
}

export async function apiKeyRoutes(fastify: FastifyInstance) {
  fastify.get('/api-keys', { preHandler: [authenticate] }, async (request, reply) => {
    const keys = await prisma.userApiKey.findMany({
      where: { userId: request.user!.userId },
      select: {
        id: true,
        name: true,
        status: true,
        lastUsed: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    return keys;
  });

  fastify.post('/api-keys', { preHandler: [authenticate] }, async (request, reply) => {
    const { name } = request.body as any;
    if (!name) return reply.status(400).send({ error: 'Name is required' });

    const { createApiKey } = await import('../services/apiKeyService.js');
    const result = await createApiKey(request.user!.userId, name);
    return result;
  });

  fastify.delete('/api-keys/:id', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = request.params as any;
    const { deleteApiKey } = await import('../services/apiKeyService.js');
    await deleteApiKey(id, request.user!.userId);
    return { success: true };
  });

  fastify.put('/api-keys/:id/toggle', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = request.params as any;
    const { toggleApiKey } = await import('../services/apiKeyService.js');
    await toggleApiKey(id, request.user!.userId);
    return { success: true };
  });
}
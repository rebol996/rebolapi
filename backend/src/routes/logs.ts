import { FastifyInstance } from 'fastify';
import { prisma } from '../db.js';
import { authenticate } from '../middleware/auth.js';

export async function usageLogRoutes(fastify: FastifyInstance) {
  fastify.get('/usage-logs', { preHandler: [authenticate] }, async (request, reply) => {
    const isAdmin = request.user!.role === 'admin';
    const query = request.query as any;

    const where = isAdmin ? {} : { userId: request.user!.userId };

    if (query.modelId) where.modelId = query.modelId;
    if (query.status) where.status = query.status;
    if (query.startDate) {
      where.createdAt = {
        ...((where as any).createdAt || {}),
        gte: new Date(query.startDate),
      };
    }
    if (query.endDate) {
      where.createdAt = {
        ...((where as any).createdAt || {}),
        lte: new Date(query.endDate),
      };
    }

    const logs = await prisma.usageLog.findMany({
      where,
      include: {
        user: { select: { username: true } },
        model: {
          include: { provider: { select: { name: true } } },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return logs;
  });

  fastify.get('/usage-logs/stats', { preHandler: [authenticate] }, async (request, reply) => {
    const isAdmin = request.user!.role === 'admin';
    const query = request.query as any;

    const userFilter = isAdmin ? {} : { userId: request.user!.userId };

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const where = { ...userFilter, createdAt: { gte: today } };

    const stats = await prisma.usageLog.aggregate({
      where,
      _count: true,
      _sum: {
        inputTokens: true,
        outputTokens: true,
        cost: true,
      },
    });

    return {
      totalCalls: stats._count,
      totalInputTokens: stats._sum.inputTokens || 0,
      totalOutputTokens: stats._sum.outputTokens || 0,
      totalCost: stats._sum.cost || 0,
    };
  });

  fastify.get('/admin/usage-logs/stats/all', { preHandler: [authenticate] }, async (request, reply) => {
    if (request.user!.role !== 'admin') {
      return reply.status(403).send({ error: 'Admin required' });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const stats = await prisma.usageLog.aggregate({
      where: { createdAt: { gte: today } },
      _count: true,
      _sum: {
        inputTokens: true,
        outputTokens: true,
        cost: true,
      },
    });

    const totalUsers = await prisma.user.count({ where: { role: 'member' } });
    const totalModels = await prisma.model.count({ where: { status: 'active' } });

    const topUsers = await prisma.usageLog.groupBy({
      by: ['userId'],
      where: { createdAt: { gte: today } },
      _sum: { cost: true },
      orderBy: { _sum: { cost: 'desc' } },
      take: 10,
    });

    const userIds = topUsers.map((u: any) => u.userId);
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, username: true },
    });

    const topUsersWithName = topUsers.map((u: any) => ({
      userId: u.userId,
      username: users.find((us: any) => us.id === u.userId)?.username || 'Unknown',
      totalCost: u._sum.cost || 0,
    }));

    return {
      totalCalls: stats._count,
      totalInputTokens: stats._sum.inputTokens || 0,
      totalOutputTokens: stats._sum.outputTokens || 0,
      totalCost: stats._sum.cost || 0,
      totalUsers,
      totalModels,
      topUsers: topUsersWithName,
    };
  });
}
import { FastifyInstance } from 'fastify';
import { prisma } from '../db.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';

export async function dashboardRoutes(fastify: FastifyInstance) {
  fastify.get('/dashboard/admin', { preHandler: [requireAdmin] }, async (request, reply) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [todayStats, totalUsers, totalModels, recentLogs] = await Promise.all([
      prisma.usageLog.aggregate({
        where: { createdAt: { gte: today } },
        _count: true,
        _sum: { inputTokens: true, outputTokens: true, cost: true },
      }),
      prisma.user.count({ where: { role: 'member' } }),
      prisma.model.count({ where: { status: 'active' } }),
      prisma.usageLog.findMany({
        take: 10,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { username: true } },
          model: { include: { provider: { select: { name: true } } } },
        },
      }),
    ]);

    const modelHealth = await prisma.model.findMany({
      where: { status: 'active' },
      include: { provider: { select: { name: true, status: true } } },
      orderBy: { name: 'asc' },
    });

    const topUsers = await prisma.user.findMany({
      where: { role: 'member' },
      select: {
        id: true,
        username: true,
        quota: true,
      },
      orderBy: { quota: 'desc' },
      take: 5,
    });

    return {
      todayCalls: todayStats._count,
      todayTokens: (todayStats._sum.inputTokens || 0) + (todayStats._sum.outputTokens || 0),
      todayCost: todayStats._sum.cost || 0,
      totalUsers,
      totalModels,
      recentLogs,
      modelHealth: modelHealth.map((m: any) => ({
        id: m.id,
        name: m.name,
        provider: m.provider.name,
        providerStatus: m.provider.status,
        modelStatus: m.status,
      })),
      topUsers,
    };
  });

  fastify.get('/dashboard/member', { preHandler: [authenticate] }, async (request, reply) => {
    const userId = request.user!.userId;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [user, todayStats, recentLogs, allowedModels] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, username: true, quota: true, role: true },
      }),
      prisma.usageLog.aggregate({
        where: { userId, createdAt: { gte: today } },
        _count: true,
        _sum: { inputTokens: true, outputTokens: true, cost: true },
      }),
      prisma.usageLog.findMany({
        where: { userId },
        take: 10,
        orderBy: { createdAt: 'desc' },
        include: { model: { include: { provider: { select: { name: true } } } } },
      }),
      prisma.userModelPermission.findMany({
        where: { userId },
        include: { model: { include: { provider: true } } },
      }),
    ]);

    return {
      user,
      quota: user?.quota || 0,
      todayCalls: todayStats._count,
      todayTokens: (todayStats._sum.inputTokens || 0) + (todayStats._sum.outputTokens || 0),
      todayCost: todayStats._sum.cost || 0,
      availableModels: allowedModels.filter((p: any) => p.model.status === 'active').length,
      recentLogs,
      defaultModel: allowedModels.find((p: any) => p.model.isDefault)?.model,
    };
  });
}
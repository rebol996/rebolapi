import { FastifyInstance } from 'fastify';
import { prisma } from '../db.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';

function maskApiKey(key: string): string {
  if (key.length <= 8) return '****';
  return key.slice(0, 4) + '****' + key.slice(-4);
}

export async function providerRoutes(fastify: FastifyInstance) {
  fastify.get('/providers', { preHandler: [authenticate] }, async (request) => {
    const providers = await prisma.provider.findMany({
      include: { models: true },
      orderBy: { createdAt: 'desc' },
    });

    return providers.map((p: any) => ({
      ...p,
      apiKey: maskApiKey(p.apiKey),
    }));
  });

  fastify.post('/providers', { preHandler: [requireAdmin] }, async (request, reply) => {
    const data = request.body as any;

    const provider = await prisma.provider.create({
      data: {
        name: data.name,
        baseUrl: data.baseUrl,
        apiKey: data.apiKey,
        type: data.type || 'openai-compatible',
        status: data.status || 'active',
        remark: data.remark,
      },
    });

    return provider;
  });

  fastify.put('/providers/:id', { preHandler: [requireAdmin] }, async (request, reply) => {
    const { id } = request.params as any;
    const data = request.body as any;

    const updateData: any = {};
    if (data.name) updateData.name = data.name;
    if (data.baseUrl) updateData.baseUrl = data.baseUrl;
    if (data.apiKey) updateData.apiKey = data.apiKey;
    if (data.type) updateData.type = data.type;
    if (data.status) updateData.status = data.status;
    if (data.remark !== undefined) updateData.remark = data.remark;

    const provider = await prisma.provider.update({
      where: { id },
      data: updateData,
    });

    return provider;
  });

  fastify.delete('/providers/:id', { preHandler: [requireAdmin] }, async (request, reply) => {
    const { id } = request.params as any;
    await prisma.provider.delete({ where: { id } });
    return { success: true };
  });

  fastify.post('/providers/:id/test', { preHandler: [requireAdmin] }, async (request, reply) => {
    const { id } = request.params as any;
    const provider = await prisma.provider.findUnique({ where: { id } });

    if (!provider) return reply.status(404).send({ error: 'Provider not found' });

    try {
      const start = Date.now();
      const response = await fetch(`${provider.baseUrl}/v1/models`, {
        headers: {
          'Authorization': `Bearer ${provider.apiKey}`,
        },
      });

      return {
        success: response.ok,
        status: response.status,
        responseTime: Date.now() - start,
        message: response.ok ? 'Connection successful' : `HTTP ${response.status}`,
      };
    } catch (e: any) {
      return {
        success: false,
        status: 0,
        responseTime: 0,
        message: e.message,
      };
    }
  });
}

export async function modelRoutes(fastify: FastifyInstance) {
  fastify.get('/models', { preHandler: [authenticate] }, async (request, reply) => {
    const isAdmin = request.user!.role === 'admin';

    if (isAdmin) {
      return prisma.model.findMany({
        include: { provider: true },
        orderBy: { createdAt: 'desc' },
      });
    }

    const permissions = await prisma.userModelPermission.findMany({
      where: { userId: request.user!.userId },
      include: {
        model: {
          include: { provider: true },
        },
      },
    });

    return permissions.map((p: any) => ({
      ...p.model,
      provider: { id: p.model.provider.id, name: p.model.provider.name, status: p.model.provider.status },
    }));
  });

  fastify.post('/models', { preHandler: [requireAdmin] }, async (request, reply) => {
    const data = request.body as any;

    const model = await prisma.model.create({
      data: {
        name: data.name,
        modelId: data.modelId,
        providerId: data.providerId,
        contextLength: data.contextLength || 4096,
        inputPrice: data.inputPrice || 0,
        outputPrice: data.outputPrice || 0,
        capability: JSON.stringify(data.capability || []),
        status: data.status || 'active',
        isDefault: data.isDefault || false,
        remark: data.remark,
      },
    });

    return model;
  });

  fastify.put('/models/:id', { preHandler: [requireAdmin] }, async (request, reply) => {
    const { id } = request.params as any;
    const data = request.body as any;

    const updateData: any = {};
    if (data.name) updateData.name = data.name;
    if (data.modelId) updateData.modelId = data.modelId;
    if (data.providerId) updateData.providerId = data.providerId;
    if (data.contextLength) updateData.contextLength = data.contextLength;
    if (data.inputPrice !== undefined) updateData.inputPrice = data.inputPrice;
    if (data.outputPrice !== undefined) updateData.outputPrice = data.outputPrice;
    if (data.capability) updateData.capability = JSON.stringify(data.capability);
    if (data.status) updateData.status = data.status;
    if (data.isDefault !== undefined) updateData.isDefault = data.isDefault;
    if (data.remark !== undefined) updateData.remark = data.remark;

    const model = await prisma.model.update({
      where: { id },
      data: updateData,
    });

    return model;
  });

  fastify.delete('/models/:id', { preHandler: [requireAdmin] }, async (request, reply) => {
    const { id } = request.params as any;
    await prisma.model.delete({ where: { id } });
    return { success: true };
  });
}

export async function permissionRoutes(fastify: FastifyInstance) {
  fastify.get('/admin/permissions', { preHandler: [requireAdmin] }, async (request, reply) => {
    const permissions = await prisma.userModelPermission.findMany({
      include: {
        user: { select: { id: true, username: true } },
        model: { include: { provider: true } },
      },
    });

    return permissions;
  });

  fastify.post('/admin/permissions', { preHandler: [requireAdmin] }, async (request, reply) => {
    const { userId, modelId } = request.body as any;

    const existing = await prisma.userModelPermission.findUnique({
      where: { userId_modelId: { userId, modelId } },
    });

    if (existing) return existing;

    return prisma.userModelPermission.create({
      data: { userId, modelId },
    });
  });

  fastify.delete('/admin/permissions', { preHandler: [requireAdmin] }, async (request, reply) => {
    const { userId, modelId } = request.body as any;

    await prisma.userModelPermission.deleteMany({
      where: { userId, modelId },
    });

    return { success: true };
  });

  fastify.post('/admin/permissions/batch', { preHandler: [requireAdmin] }, async (request, reply) => {
    const { userId, modelIds } = request.body as any;

    await prisma.userModelPermission.deleteMany({
      where: { userId },
    });

    const permissions = modelIds.map((modelId: string) => ({
      userId,
      modelId,
    }));

    await prisma.userModelPermission.createMany({
      data: permissions,
    });

    return { success: true };
  });
}
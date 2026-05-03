import { FastifyInstance } from 'fastify';
import { prisma } from '../db.js';
import { openAICompatibleAdapter, estimateTokens } from '../adapters/openai.js';
import { validateApiKey } from '../services/apiKeyService.js';
import { checkQuota, deductQuota } from '../services/quotaService.js';
import { userRateLimiter, apiKeyRateLimiter } from '../middleware/rateLimit.js';

export async function openAICompatRoutes(fastify: FastifyInstance) {
  fastify.get('/v1/models', { preHandler: [apiKeyRateLimiter] }, async (request, reply) => {
    const apiKey = request.headers['x-api-key'] as string || request.headers['authorization'] as string;

    let userId: string | null = null;
    if (apiKey) {
      if (apiKey.startsWith('Bearer ')) {
        userId = await validateApiKey(apiKey.slice(7));
      } else {
        userId = await validateApiKey(apiKey);
      }
    }

    if (!apiKey || !userId) {
      return reply.status(401).send({ error: 'Invalid API key' });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, status: true, role: true, quota: true },
    });

    if (!user || user.status !== 'active') {
      return reply.status(403).send({ error: 'User is disabled' });
    }

    let models;
    if (user.role === 'admin') {
      models = await prisma.model.findMany({
        where: { status: 'active', provider: { status: 'active' } },
        include: { provider: { select: { name: true } } },
      });
    } else {
      models = await prisma.userModelPermission.findMany({
        where: { userId },
        include: {
          model: {
            include: { provider: { select: { name: true, status: true } } },
          },
        },
      });
      models = models
        .filter((m: any) => m.model.status === 'active' && m.model.provider.status === 'active')
        .map((m: any) => m.model);
    }

    return {
      object: 'list',
      data: models.map((m: any) => ({
        id: m.modelId,
        object: 'model',
        created: Math.floor(Date.now() / 1000),
        owned_by: m.provider.name,
        permission: [],
        root: m.provider.name,
      })),
    };
  });

  fastify.post('/v1/chat/completions', { preHandler: [apiKeyRateLimiter] }, async (request, reply) => {
    const apiKey = request.headers['x-api-key'] as string || (request.headers['authorization'] as string)?.slice(7);

    if (!apiKey) {
      return reply.status(401).send({ error: 'Missing API key' });
    }

    const userId = await validateApiKey(apiKey);
    if (!userId) {
      return reply.status(401).send({ error: 'Invalid API key' });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, status: true, role: true, quota: true },
    });

    if (!user || user.status !== 'active') {
      return reply.status(403).send({ error: 'User is disabled' });
    }

    const { model: modelId, messages, temperature, max_tokens } = request.body as any;

    let model: any;
    if (user.role === 'admin') {
      model = await prisma.model.findUnique({
        where: { modelId },
        include: { provider: true },
      });
    } else {
      const permission = await prisma.userModelPermission.findUnique({
        where: { userId_modelId: { userId, modelId } },
        include: { model: { include: { provider: true } } },
      });
      model = permission?.model;
    }

    if (!model || model.status !== 'active') {
      return reply.status(400).send({ error: 'Model not available' });
    }

    if (model.provider.status !== 'active') {
      return reply.status(400).send({ error: 'Provider is disabled' });
    }

    const estimatedInputTokens = estimateTokens(messages);
    const costPer1K = model.inputPrice;

    if (user.quota < costPer1K * estimatedInputTokens / 1000) {
      return reply.status(402).send({ error: 'Insufficient quota' });
    }

    const startTime = Date.now();

    try {
      const response = await openAICompatibleAdapter(
        { model: model.modelId, messages, temperature, max_tokens },
        model.provider.apiKey,
        model.provider.baseUrl
      );

      const inputTokens = response.usage?.prompt_tokens || estimatedInputTokens;
      const outputTokens = response.usage?.completion_tokens || 0;
      const totalTokens = response.usage?.total_tokens || inputTokens + outputTokens;

      const inputCost = inputTokens * model.inputPrice / 1000;
      const outputCost = outputTokens * model.outputPrice / 1000;
      const totalCost = inputCost + outputCost;

      await prisma.usageLog.create({
        data: {
          userId,
          modelId: model.id,
          source: 'api',
          inputTokens,
          outputTokens,
          cost: totalCost,
          duration: Date.now() - startTime,
          status: 'success',
        },
      });

      await prisma.user.update({
        where: { id: userId },
        data: { quota: { decrement: totalCost } },
      });

      return {
        id: response.id,
        object: 'chat.completion',
        created: response.created,
        model: modelId,
        choices: response.choices,
        usage: {
          prompt_tokens: inputTokens,
          completion_tokens: outputTokens,
          total_tokens: totalTokens,
        },
      };
    } catch (error: any) {
      await prisma.usageLog.create({
        data: {
          userId,
          modelId: model.id,
          source: 'api',
          inputTokens: estimatedInputTokens,
          outputTokens: 0,
          cost: estimatedInputTokens * model.inputPrice / 1000,
          duration: Date.now() - startTime,
          status: 'failed',
          errorMsg: error.message,
        },
      });

      return reply.status(500).send({
        error: {
          message: error.message || 'Provider request failed',
          type: 'api_error',
        },
      });
    }
  });
}
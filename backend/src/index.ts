import Fastify from 'fastify';
import cors from '@fastify/cors';
import { config } from './config.js';
import { prisma } from './db.js';
import { authRoutes, adminUserRoutes, inviteRoutes } from './routes/auth.js';
import { providerRoutes, modelRoutes, permissionRoutes } from './routes/providers.js';
import { quotaRoutes, apiKeyRoutes } from './routes/quota.js';
import { usageLogRoutes } from './routes/logs.js';
import { openAICompatRoutes } from './routes/openai.js';
import { dashboardRoutes } from './routes/dashboard.js';

const fastify = Fastify({
  logger: true,
});

async function start() {
  await fastify.register(cors, {
    origin: config.cors.origin,
    credentials: config.cors.credentials,
    methods: config.cors.methods,
    allowedHeaders: config.cors.allowedHeaders,
  });

  fastify.get('/health', async () => ({ status: 'ok' }));

  await fastify.register(authRoutes);
  await fastify.register(adminUserRoutes);
  await fastify.register(inviteRoutes);
  await fastify.register(providerRoutes);
  await fastify.register(modelRoutes);
  await fastify.register(permissionRoutes);
  await fastify.register(quotaRoutes);
  await fastify.register(apiKeyRoutes);
  await fastify.register(usageLogRoutes);
  await fastify.register(openAICompatRoutes);
  await fastify.register(dashboardRoutes);

  fastify.get('/config', async () => ({
    name: 'Rebol AI Gateway',
    version: '1.0.0',
  }));

  await fastify.listen({ port: config.server.port, host: '0.0.0.0' });
  console.log(`Server running on port ${config.server.port}`);
}

start().catch(console.error);
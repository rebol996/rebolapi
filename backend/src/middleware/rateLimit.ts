import { FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../db.js';

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

const userRateLimit = new Map<string, RateLimitEntry>();
const apiKeyRateLimit = new Map<string, RateLimitEntry>();

const WINDOW_MS = 60 * 1000;
const MAX_REQUESTS_PER_USER = 60;
const MAX_REQUESTS_PER_APIKEY = 30;

function checkRateLimit(
  map: Map<string, RateLimitEntry>,
  key: string,
  max: number
): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const entry = map.get(key);

  if (!entry || now > entry.resetTime) {
    map.set(key, { count: 1, resetTime: now + WINDOW_MS });
    return { allowed: true, remaining: max - 1 };
  }

  if (entry.count >= max) {
    return { allowed: false, remaining: 0 };
  }

  entry.count++;
  return { allowed: true, remaining: max - entry.count };
}

export async function userRateLimiter(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const userId = request.user?.userId;
  if (!userId) return;

  const { allowed, remaining } = checkRateLimit(userRateLimit, userId, MAX_REQUESTS_PER_USER);
  if (!allowed) {
    reply.header('X-RateLimit-Remaining', remaining);
    reply.status(429).send({ error: 'Rate limit exceeded. Please try again later.' });
    return;
  }
  reply.header('X-RateLimit-Remaining', remaining);
}

export async function apiKeyRateLimiter(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const apiKey = request.headers['x-api-key'] as string;
  if (!apiKey) return;

  const { allowed, remaining } = checkRateLimit(apiKeyRateLimit, apiKey, MAX_REQUESTS_PER_APIKEY);
  if (!allowed) {
    reply.header('X-RateLimit-Remaining', remaining);
    reply.status(429).send({ error: 'Rate limit exceeded. Please try again later.' });
    return;
  }
  reply.header('X-RateLimit-Remaining', remaining);
}
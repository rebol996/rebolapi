import { prisma } from '../db.js';
import bcrypt from 'bcrypt';
import { nanoid } from 'nanoid';

export async function createApiKey(userId: string, name: string): Promise<{ key: string; id: string }> {
  const rawKey = `rbk_${nanoid(32)}`;
  const keyHash = await bcrypt.hash(rawKey, 10);

  const apiKey = await prisma.userApiKey.create({
    data: {
      name,
      keyHash,
      userId,
      status: 'active',
    },
  });

  return { key: rawKey, id: apiKey.id };
}

export async function validateApiKey(rawKey: string): Promise<string | null> {
  const apiKeys = await prisma.userApiKey.findMany({
    where: { status: 'active' },
    include: { user: { select: { id: true, status: true, role: true, quota: true } } },
  });

  for (const apiKey of apiKeys) {
    const valid = await bcrypt.compare(rawKey, apiKey.keyHash);
    if (valid) {
      if (apiKey.user.status !== 'active') return null;

      await prisma.userApiKey.update({
        where: { id: apiKey.id },
        data: { lastUsed: new Date() },
      });

      return apiKey.userId;
    }
  }

  return null;
}

export async function deleteApiKey(keyId: string, userId: string): Promise<void> {
  await prisma.userApiKey.deleteMany({
    where: { id: keyId, userId },
  });
}

export async function toggleApiKey(keyId: string, userId: string): Promise<void> {
  const key = await prisma.userApiKey.findFirst({
    where: { id: keyId, userId },
  });

  if (!key) throw new Error('API key not found');

  await prisma.userApiKey.update({
    where: { id: keyId },
    data: { status: key.status === 'active' ? 'disabled' : 'active' },
  });
}

export async function getUserApiKeys(userId: string): Promise<any[]> {
  const keys = await prisma.userApiKey.findMany({
    where: { userId },
    select: {
      id: true,
      name: true,
      status: true,
      lastUsed: true,
      createdAt: true,
    },
  });

  return keys;
}
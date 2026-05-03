import bcrypt from 'bcrypt';
import { prisma } from '../db.js';
import { generateToken } from '../utils/jwt.js';

export async function login(username: string, password: string): Promise<{ token: string; user: any } | null> {
  const user = await prisma.user.findUnique({ where: { username } });
  if (!user) return null;

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) return null;

  if (user.status !== 'active') {
    throw new Error('User account is disabled');
  }

  const token = generateToken({ userId: user.id, role: user.role });

  return {
    token,
    user: {
      id: user.id,
      username: user.username,
      role: user.role,
      status: user.status,
      quota: user.quota,
    },
  };
}

export async function register(
  username: string,
  password: string,
  inviteCode: string
): Promise<{ token: string; user: any }> {
  const code = await prisma.inviteCode.findUnique({ where: { code: inviteCode } });
  if (!code) throw new Error('Invalid invite code');
  if (code.usedBy) throw new Error('Invite code already used');
  if (code.expiresAt < new Date()) throw new Error('Invite code expired');

  const hashed = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: {
      username,
      password: hashed,
      role: 'member',
      status: 'active',
    },
  });

  await prisma.inviteCode.update({
    where: { id: code.id },
    data: { usedBy: user.id, usedAt: new Date() },
  });

  const token = generateToken({ userId: user.id, role: user.role });

  return {
    token,
    user: {
      id: user.id,
      username: user.username,
      role: user.role,
      status: user.status,
    },
  };
}

export async function changePassword(userId: string, oldPassword: string, newPassword: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error('User not found');

  const valid = await bcrypt.compare(oldPassword, user.password);
  if (!valid) throw new Error('Current password is incorrect');

  const hashed = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({
    where: { id: userId },
    data: { password: hashed },
  });
}
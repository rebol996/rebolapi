import { prisma } from '../db.js';

export async function addQuota(
  userId: string,
  amount: number,
  reason: string,
  operatorId: string
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: { quota: { increment: amount } },
    });

    await tx.quotaRecord.create({
      data: {
        userId,
        amount,
        reason,
        operatorId,
      },
    });
  });
}

export async function deductQuota(userId: string, amount: number): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return false;
  if (user.quota < amount) return false;

  await prisma.user.update({
    where: { id: userId },
    data: { quota: { decrement: amount } },
  });

  return true;
}

export async function resetQuota(userId: string, operatorId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: { quota: 0 },
    });

    await tx.quotaRecord.create({
      data: {
        userId,
        amount: 0,
        reason: 'Reset by admin',
        operatorId,
      },
    });
  });
}

export async function checkQuota(userId: string, required: number): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { quota: true } });
  return (user?.quota ?? 0) >= required;
}
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const adminPassword = await bcrypt.hash('admin123', 10);

  const admin = await prisma.user.upsert({
    where: { username: 'admin' },
    update: {},
    create: {
      username: 'admin',
      password: adminPassword,
      role: 'admin',
      status: 'active',
      quota: 0,
    },
  });

  const inviteCode = await prisma.inviteCode.create({
    data: {
      code: 'REBOL2024',
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      createdBy: admin.id,
    },
  });

  console.log('Admin created:', admin.username);
  console.log('Invite code:', inviteCode.code);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
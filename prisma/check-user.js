const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  try {
    const user = await prisma.user.findUnique({
      where: { id: '32c0bda5-0d58-4b6b-b0d2-011098c94607' }
    });
    console.log('User found:', !!user, user?.role);
    
    const count = await prisma.activity.count({
      where: { user_id: '32c0bda5-0d58-4b6b-b0d2-011098c94607' }
    });
    console.log('Activity count:', count);
  } catch (err) {
    console.error(err);
  } finally {
    await prisma.$disconnect();
  }
}

check();

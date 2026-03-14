import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // 创建默认教师账号（开发用）
  const hash = await bcrypt.hash('admin123', 12);
  const teacher = await prisma.teacher.upsert({
    where: { username: 'admin' },
    update: {},
    create: {
      username: 'admin',
      passwordHash: hash,
      name: '管理员老师',
    },
  });
  console.log('✅ 教师账号创建成功:', teacher.username, '/ 密码: admin123');

  // 创建示例班级
  const cls = await prisma.class.upsert({
    where: { id: 'demo-class-001' },
    update: {},
    create: {
      id: 'demo-class-001',
      teacherId: teacher.id,
      name: '三年级一班',
      description: '示例班级',
    },
  });
  console.log('✅ 示例班级创建成功:', cls.name);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

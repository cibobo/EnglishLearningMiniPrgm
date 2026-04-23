import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // 创建默认教师账号（开发用）
  const hash = await bcrypt.hash('admin123', 10);
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

  // 创建测试学生
  const testStudents = [
    { studentCode: 'ABC123', name: '张三' },
    { studentCode: 'DEF456', name: '李四' },
    { studentCode: 'GHI789', name: '王五' },
    { studentCode: 'JKL012', name: '赵六' },
    { studentCode: 'MNO345', name: '钱七' },
  ];

  for (const s of testStudents) {
    const student = await prisma.student.upsert({
      where: { studentCode: s.studentCode },
      update: {},
      create: {
        studentCode: s.studentCode,
        name: s.name,
        classes: { connect: [{ id: cls.id }] },
      },
    });
    console.log(`✅ 测试学生创建成功: ${student.name} / 学生码: ${student.studentCode}`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

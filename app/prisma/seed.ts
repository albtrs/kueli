import { prisma } from '../src/lib/prisma';
import { hash } from 'bcryptjs';

async function main() {
  // Userテーブルだけ全削除
  await prisma.user.deleteMany({});

  // 新しいadminユーザーを作成
  const passwordHash = await hash('password123456', 10);
  const user = await prisma.user.create({
    data: {
      username: 'admin',
      passwordHash,
      isAdmin: true,
    },
  });
  console.log('Created admin user:', user);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

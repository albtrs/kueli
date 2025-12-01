import { prisma } from '../src/lib/prisma';
import { hash } from 'bcryptjs';

async function main() {
  // Create test user
  const hashedPassword = await hash('password123456', 10);
  
  const user = await prisma.user.upsert({
    where: { email: 'user@example.com' },
    update: {},
    create: {
      email: 'user@example.com',
      password: hashedPassword,
      name: 'Test User',
    },
  });

  console.log('Created user:', user);

  // Create sample notes
  const note1 = await prisma.note.create({
    data: {
      title: 'ウェルカムメモ',
      content: '# ようこそ！\n\nこれは **Markdown** エディタです。\n\n#test #welcome',
      tags: JSON.stringify(['test', 'welcome']),
      images: JSON.stringify([]),
      isPinned: true,
    },
  });

  const note2 = await prisma.note.create({
    data: {
      title: 'タスクリスト',
      content: '## 今日やること\n\n- [ ] 買い物\n- [ ] 掃除\n- [x] 完了したタスク\n\n#todo',
      tags: JSON.stringify(['todo']),
      images: JSON.stringify([]),
      isPinned: false,
    },
  });

  console.log('Created notes:', { note1, note2 });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

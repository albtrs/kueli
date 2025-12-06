import { PrismaClient } from '@prisma/client';
import { hash } from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  switch (command) {
    case 'create':
      await createUser(args[1], args[2], args[3] === '--admin');
      break;
    case 'update-password':
      await updatePassword(args[1], args[2]);
      break;
    case 'delete':
      await deleteUser(args[1]);
      break;
    case 'list':
      await listUsers();
      break;
    case 'reset':
      await resetUsers(args[1], args[2]);
      break;
    default:
      showHelp();
  }
}

async function createUser(username: string, password: string, isAdmin: boolean) {
  if (!username || !password) {
    console.error('❌ Usage: npm run user:create <username> <password> [--admin]');
    process.exit(1);
  }

  const passwordHash = await hash(password, 10);
  const user = await prisma.user.create({
    data: { username, passwordHash, isAdmin },
  });
  console.log(`✅ Created user: ${user.username} (id: ${user.id}, admin: ${user.isAdmin})`);
}

async function updatePassword(username: string, newPassword: string) {
  if (!username || !newPassword) {
    console.error('❌ Usage: npm run user:password <username> <new-password>');
    process.exit(1);
  }

  const passwordHash = await hash(newPassword, 10);
  const user = await prisma.user.update({
    where: { username },
    data: { passwordHash },
  });
  console.log(`✅ Updated password for: ${user.username}`);
}

async function deleteUser(username: string) {
  if (!username) {
    console.error('❌ Usage: npm run user:delete <username>');
    process.exit(1);
  }

  await prisma.user.delete({ where: { username } });
  console.log(`✅ Deleted user: ${username}`);
}

async function listUsers() {
  const users = await prisma.user.findMany({
    select: { id: true, username: true, isAdmin: true, createdAt: true },
  });
  
  if (users.length === 0) {
    console.log('No users found.');
    return;
  }

  console.log('\n📋 Users:');
  console.log('─'.repeat(50));
  users.forEach(u => {
    console.log(`  ID: ${u.id} | ${u.username}${u.isAdmin ? ' (admin)' : ''} | ${u.createdAt.toISOString()}`);
  });
  console.log('─'.repeat(50));
  console.log(`Total: ${users.length} user(s)\n`);
}

async function resetUsers(username = 'admin', password = 'password123456') {
  await prisma.user.deleteMany({});
  const passwordHash = await hash(password, 10);
  const user = await prisma.user.create({
    data: { username, passwordHash, isAdmin: true },
  });
  console.log(`✅ Reset complete. Created admin user: ${user.username}`);
  console.log(`   Password: ${password}`);
}

function showHelp() {
  console.log(`
📖 User Management Commands:

  npm run user:list                         - List all users
  npm run user:create <username> <password> [--admin]  - Create user
  npm run user:password <username> <new-password>      - Update password
  npm run user:delete <username>            - Delete user
  npm run user:reset [username] [password]  - Reset to single admin user

Examples:
  npm run user:create john secret123
  npm run user:create admin adminpass --admin
  npm run user:password admin newpassword
  npm run user:reset admin mypassword
`);
}

main()
  .catch((e) => {
    console.error('❌ Error:', e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

#!/usr/bin/env npx ts-node
/**
 * Kueli セットアップスクリプト
 * 
 * 使い方:
 *   docker compose exec kueli npx ts-node scripts/setup.ts
 * 
 * または本番環境:
 *   docker compose -f docker-compose.production.yml exec kueli node scripts/setup.js
 */

import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import * as readline from 'readline';

const prisma = new PrismaClient();

async function prompt(question: string, hidden = false): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function main() {
  console.log('🚀 Kueli Setup\n');

  // 1. データベースマイグレーション
  console.log('📦 Running database migrations...');
  const { execSync } = await import('child_process');
  try {
    execSync('npx prisma migrate deploy', { stdio: 'inherit' });
    console.log('✅ Database migrations complete.\n');
  } catch (error) {
    console.error('❌ Migration failed. Please check your database configuration.');
    process.exit(1);
  }

  // 2. 管理者ユーザーの確認/作成
  const existingUsers = await prisma.user.count();
  
  if (existingUsers > 0) {
    console.log(`ℹ️  ${existingUsers} user(s) already exist.`);
    const createAnother = await prompt('Create another admin user? (y/N): ');
    if (createAnother.toLowerCase() !== 'y') {
      console.log('\n✅ Setup complete!');
      await prisma.$disconnect();
      return;
    }
  }

  // ユーザー情報の取得（環境変数 or 対話式）
  let username = process.env.ADMIN_USER;
  let password = process.env.ADMIN_PASSWORD;

  if (!username) {
    username = await prompt('Admin username: ');
  }
  if (!password) {
    password = await prompt('Admin password: ');
  }

  if (!username || !password) {
    console.error('❌ Username and password are required.');
    process.exit(1);
  }

  if (password.length < 8) {
    console.error('❌ Password must be at least 8 characters.');
    process.exit(1);
  }

  // ユーザー作成
  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) {
    console.error(`❌ User "${username}" already exists.`);
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.user.create({
    data: { username, passwordHash, isAdmin: true },
  });

  console.log(`\n✅ Admin user "${username}" created successfully!`);
  console.log('✅ Setup complete!\n');

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error('Setup failed:', e);
  await prisma.$disconnect();
  process.exit(1);
});

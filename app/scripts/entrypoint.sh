#!/bin/sh
# 起動スクリプト: DB初期化 → 管理者作成 → サーバー起動

set -e

echo "🚀 Kueli starting..."

# データベースの初期化（テーブルがなければ作成）
echo "📦 Checking database..."
npx prisma db push --skip-generate 2>/dev/null || true

# 管理者ユーザーの作成（存在しなければ作成）
if [ -n "$ADMIN_USER" ] && [ -n "$ADMIN_PASSWORD" ]; then
  echo "👤 Ensuring admin user exists..."
  node -e "
    const { PrismaClient } = require('@prisma/client');
    const bcrypt = require('bcryptjs');
    const prisma = new PrismaClient();
    
    async function ensureAdmin() {
      const username = process.env.ADMIN_USER;
      const password = process.env.ADMIN_PASSWORD;
      
      const existing = await prisma.user.findUnique({ where: { username } });
      if (!existing) {
        const passwordHash = await bcrypt.hash(password, 12);
        await prisma.user.create({
          data: { username, passwordHash, isAdmin: true }
        });
        console.log('✅ Admin user created: ' + username);
      } else {
        console.log('✅ Admin user exists: ' + username);
      }
      await prisma.\$disconnect();
    }
    
    ensureAdmin().catch(e => {
      console.error('Failed to create admin:', e.message);
      process.exit(0); // エラーでも起動は続行
    });
  "
fi

echo "🌐 Starting server..."
exec node server.js
